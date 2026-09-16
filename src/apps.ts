import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { run } from './install.ts'
import { fromUniversal, toUniversal } from './mcpconfig.ts'
import { setSkillState } from './skills.ts'

const INSTALLER_HOST = 'skill.vyibc.com'
const PREVIEW_TTL_MS = 10 * 60_000
const MAX_TEXT = 2 * 1024 * 1024

export interface AppPart { name: string; description?: string }
export interface AppPreview {
  previewId: string
  expiresAt: number
  name: string
  displayName: string
  version: string
  description: string
  publisher: string
  source: string
  revision: string
  installer: string
  skills: AppPart[]
  mcpServers: AppPart[]
  commands: AppPart[]
  hooks: AppPart[]
  permissions: string[]
  installed: boolean
  installedVersion: string | null
  enabled: boolean
  updateAvailable: boolean
  managedMcp: string[]
  managedSkills: string[]
  installState: 'available' | 'installed' | 'failed'
}

interface AppReceipt {
  schema: number; name: string; version: string; revision: string; source: string
  skills: string[]; mcpServers: string[]; mcpAdded?: string[]; installedAt: string; enabled?: boolean
  status?: 'installed' | 'failed'; lastError?: string
  managedSkills?: string[]
}

interface ParsedImport { slug: string; installer: string; token: string }
interface StoredPreview {
  expiresAt: number; token: string; preview: AppPreview; repo: string; marketplace: string; bridge: string; revision: string
  skillFiles: { path: string; size: number }[]
}

function safeUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== INSTALLER_HOST || url.username || url.password || url.search || url.hash) {
    throw new Error('当前只支持 skill.vyibc.com 的 HTTPS App 安装器')
  }
  return url
}

/** Parse one supported installer invocation without evaluating any shell. */
export function parseAppImport(input: string): ParsedImport {
  const text = input.trim()
  const match = /^bash\s+<\(curl\s+-fsSL\s+(['"]?)(https:\/\/[^\s'"()]+)\1\)\s+--bootstrap-token\s+([^\s;&|<>`$()]+)\s*$/.exec(text)
  if (!match) throw new Error('无法识别安装命令；请粘贴能力广场提供的完整 bash <(curl …) --bootstrap-token … 命令')
  const url = safeUrl(match[2])
  const path = /^\/([a-z0-9][a-z0-9-]{0,63})\/release\/install-\1\.sh$/.exec(url.pathname)
  if (!path) throw new Error('安装器路径不符合受支持的 App 发布格式')
  if (match[3].length < 24 || match[3].length > 4096) throw new Error('bootstrap token 格式无效')
  return { slug: path[1], installer: url.toString(), token: match[3] }
}

async function text(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'dsh-skill-mcp-console' } })
  if (!response.ok) throw new Error(`读取 App 清单失败（HTTP ${response.status}）`)
  const body = await response.text()
  if (body.length > MAX_TEXT) throw new Error('App 清单超过大小限制')
  return body
}

function scriptContract(script: string, slug: string) {
  const marketplace = /codex\s+plugin\s+marketplace\s+add\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/.exec(script)?.[1]
  const selector = /codex\s+plugin\s+add\s+([A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+)/.exec(script)
  const bridge = /BRIDGE_BASE="\$\{VYIBC_PLUGIN_BRIDGE_BASE:-([^}"\s]+)\}"/.exec(script)?.[1]
  const list = /servers\s*=\s*\[([^\]]+)\]/.exec(script)?.[1] ?? ''
  const servers = [...list.matchAll(/['"]([A-Za-z0-9_.-]+)['"]/g)].map(item => item[1])
  if (!marketplace || !selector || selector[1] !== slug || !bridge || servers.length === 0) {
    throw new Error('安装器未声明可验证的 Marketplace、App 或 MCP 清单')
  }
  if (bridge !== 'https://fleet.vyibc.com/api/hub/plugin-bootstrap/mcp') throw new Error('安装器声明了未受信任的 MCP Bridge')
  return { repo: marketplace, plugin: selector[1], marketplace: selector[2], bridge, servers }
}

async function githubJson<T>(url: string): Promise<T> {
  return JSON.parse(await text(url)) as T
}

async function isInstalled(name: string, marketplace: string): Promise<boolean> {
  const result = await run('codex', ['plugin', 'list'])
  return result.code === 0 && result.out.split('\n').some(line => line.includes(`${name}@${marketplace}`) && line.includes('installed, enabled'))
}

function publicPreview(value: Omit<AppPreview, 'previewId' | 'expiresAt'>): AppPreview {
  return { ...value, previewId: randomUUID(), expiresAt: Date.now() + PREVIEW_TTL_MS }
}

export class AppInstaller {
  private previews = new Map<string, StoredPreview>()
  private readonly home: string
  private readonly patch: string

  constructor(home = homedir(), patch = join(home, '.dsh', 'profiles', 'web', 'cordis.patch.yml')) {
    this.home = home
    this.patch = patch
  }

  async inspect(input: string): Promise<AppPreview> {
    const parsed = parseAppImport(input)
    const installerText = await text(parsed.installer)
    const contract = scriptContract(installerText, parsed.slug)
    const head = await githubJson<{ sha?: string }>(`https://api.github.com/repos/${contract.repo}/commits/main`)
    if (!head.sha || !/^[0-9a-f]{40}$/.test(head.sha)) throw new Error('无法固定 App 发布版本')
    const revision = head.sha
    const rawBase = `https://raw.githubusercontent.com/${contract.repo}/${revision}`
    const manifestPath = `plugins/${contract.plugin}/.codex-plugin/plugin.json`
    const manifest = await githubJson<any>(`${rawBase}/${manifestPath}`)
    if (manifest.name !== contract.plugin || typeof manifest.version !== 'string') throw new Error('App manifest 与安装器声明不一致')
    const tree = await githubJson<{ tree?: { path: string; type: string; size?: number }[] }>(`https://api.github.com/repos/${contract.repo}/git/trees/${revision}?recursive=1`)
    const prefix = `plugins/${contract.plugin}/`
    const files = (tree.tree ?? []).filter(item => item.type === 'blob' && item.path.startsWith(prefix))
      .map(item => ({ path: item.path.slice(prefix.length), size: item.size ?? 0 }))
    const paths = files.map(item => item.path)
    const skillNames = [...new Set(paths.flatMap(path => /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1] ?? []))].sort()
    let commands: AppPart[] = [...new Set(paths.flatMap(path => /^(?:commands|instructions)\/([^/]+)$/.exec(path)?.[1] ?? []))].sort().map(name => ({ name }))
    if (paths.includes('command-support/catalog.json')) {
      const catalog = await githubJson<{ commands?: { name?: string; description?: string }[] }>(`${rawBase}/plugins/${contract.plugin}/command-support/catalog.json`)
      commands = (catalog.commands ?? []).filter(item => item.name).map(item => ({ name: item.name!, description: item.description }))
    }
    const hookNames = [...new Set(paths.flatMap(path => /^hooks\/([^/]+)$/.exec(path)?.[1] ?? []))].sort()
    const receipt = await this.readReceipt(contract.plugin)
    const preview = publicPreview({
      name: manifest.name,
      displayName: manifest.interface?.displayName || manifest.name,
      version: manifest.version,
      description: manifest.interface?.longDescription || manifest.description || '',
      publisher: manifest.interface?.developerName || manifest.author?.name || contract.repo.split('/')[0],
      source: `github.com/${contract.repo}`,
      revision,
      installer: parsed.installer,
      skills: skillNames.map(name => ({ name })),
      mcpServers: contract.servers.map(name => ({ name })),
      commands,
      hooks: hookNames.map(name => ({ name })),
      permissions: Array.isArray(manifest.interface?.capabilities) ? manifest.interface.capabilities : [],
      installed: Boolean(receipt && receipt.status !== 'failed'),
      installedVersion: receipt?.version ?? null,
      enabled: receipt?.enabled !== false,
      updateAvailable: Boolean(receipt && receipt.revision !== revision),
      managedMcp: receipt?.mcpAdded ?? [],
      managedSkills: receipt?.managedSkills ?? receipt?.skills ?? [], installState: receipt?.status === 'failed' ? 'failed' : receipt ? 'installed' : 'available',
    })
    this.prune()
    this.previews.set(preview.previewId, {
      expiresAt: preview.expiresAt, token: parsed.token, preview, revision,
      skillFiles: files.filter(item => item.path.startsWith('skills/')), ...contract,
    })
    return preview
  }

  /** Public catalog metadata. Installation still requires a fresh signed command. */
  async catalog(): Promise<AppPreview[]> {
    // Catalog navigation must not wait on four publisher/GitHub requests. The
    // signed import preview below remains the authority for the exact release.
    const receipt = await this.readReceipt('cartoon-video-studio')
    const names = ['cartoon-hongyi','cartoon-video-studio','cartoon-xiaban','general-video','hyperframes-animation','hyperframes-audio','hyperframes-cli','hyperframes-core','hyperframes-creative','hyperframes-keyframes','hyperframes-registry','hyperframes','media-use','studio-ali','studio-character-workflow','studio-check','studio-director','studio-help','studio-hongyi','studio-materials','studio-music','studio-new','studio-publish','studio-quality','studio-revise','studio-xiabanxiaoren','studio','voice-production','vyibc-character-design']
    const servers = ['vyibc-cartoon-assets','vyibc-image','vyibc-douyin','vyibc-youtube','vyibc-voice','vyibc-behavior','vyibc-xiaohongshu','vyibc-vault']
    const commands = ['studio','studio-xiabanxiaoren','studio-hongyi','studio-ali','studio-new','studio-help','studio-revise','studio-check','studio-publish']
    return [{
      previewId: '', expiresAt: 0, name: 'cartoon-video-studio', displayName: '卡通视频工作室',
      version: receipt?.version ?? '0.7.2', installedVersion: receipt?.version ?? null,
      description: '从角色、选声到连续表演和成片验收，把完整卡通视频制作能力带进会话。',
      publisher: 'ChangfengHU', source: 'github.com/ChangfengHU/cartoon-video-skills',
      revision: receipt?.revision ?? 'main', installer: `https://${INSTALLER_HOST}/cartoon-video-studio/release/install-cartoon-video-studio.sh`,
      skills: (receipt?.skills ?? names).map(name => ({ name })), mcpServers: (receipt?.mcpServers ?? servers).map(name => ({ name })),
      commands: commands.map(name => ({ name })), hooks: [], permissions: ['Read', 'Write'], installed: Boolean(receipt && receipt.status !== 'failed'), enabled: receipt?.enabled !== false,
      updateAvailable: false,
      managedMcp: receipt?.mcpAdded ?? [],
      managedSkills: receipt?.managedSkills ?? receipt?.skills ?? [], installState: receipt?.status === 'failed' ? 'failed' : receipt ? 'installed' : 'available',
    }]
  }

  async install(previewId: string, progress: (stage: string, current: number, total: number, detail: string) => void = () => {}): Promise<{ app: AppPreview; checks: { name: string; ok: boolean; detail: string }[] }> {
    this.prune()
    const entry = this.previews.get(previewId)
    if (!entry) throw new Error('预检已过期，请重新粘贴安装命令')
    this.previews.delete(previewId)
    const clean = (value: string) => value.replaceAll(entry.token, '••••')
    const checks: { name: string; ok: boolean; detail: string }[] = []
    const expected = entry.preview.skills.map(item => item.name).sort()
    progress('skills', 0, expected.length, '正在安装 DSH Skills')
    const skillResult = await this.installDshSkills(entry, expected, (current, detail) => {
      progress('skills', current, expected.length, detail)
    })
    progress('skills', expected.length, expected.length, `${skillResult.installed.length} 个安装，${skillResult.reused.length} 个复用`)
    checks.push({ name: 'DSH Skills', ok: true, detail: `${skillResult.installed.length} 个由 App 安装，${skillResult.reused.length} 个环境复用` })

    const current = await toUniversal(this.patch, false)
    const previous = await this.readReceipt(entry.preview.name)
    const mcpAdded = new Set(previous?.mcpAdded ?? [])
    for (const server of entry.preview.mcpServers) {
      if (current[server.name]) continue
      current[server.name] = {
        type: 'http', url: `${entry.bridge.replace(/\/$/, '')}/${server.name}`,
        headers: { Authorization: `Bearer ${entry.token}` }, failOnStartupError: false,
      }
      mcpAdded.add(server.name)
    }
    await fromUniversal(this.patch, current)
    progress('mcp', 0, entry.preview.mcpServers.length, 'MCP 配置已写入，正在逐项验收')
    checks.push({ name: 'DSH MCP', ok: true, detail: `${mcpAdded.size} 个由 App 管理，其余复用；服务将自动重载` })

    for (const [index, server] of entry.preview.mcpServers.entries()) {
      const configured = current[server.name]
      const endpoint = configured?.url
      try {
        if (!endpoint) throw new Error('当前配置不是可直接验收的 HTTP MCP')
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { ...(configured.headers ?? {}), accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-app-installer', version: '1' } } }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        checks.push({ name: server.name, ok: true, detail: 'DSH 连接通过' })
      } catch (cause) {
        checks.push({ name: server.name, ok: false, detail: clean((cause as Error).message) })
      }
      progress('mcp', index + 1, entry.preview.mcpServers.length, `已检查 ${server.name}`)
    }
    progress('codex', 0, 1, '正在登记 Codex App')
    const market = await run('codex', ['plugin', 'marketplace', 'add', entry.repo, '--ref', entry.revision, '--json'])
    const marketOk = market.code === 0 || /already|exists|configured/i.test(market.out)
    const plugin = marketOk ? await run('codex', ['plugin', 'add', `${entry.preview.name}@${entry.marketplace}`, '--json']) : { code: -1, out: market.out }
    const codexOk = plugin.code === 0 || await isInstalled(entry.preview.name, entry.marketplace)
    checks.push({ name: 'Codex Plugin', ok: true, detail: codexOk ? '已安装并启用' : '当前 Codex CLI 不支持 Plugin 子命令；不影响 DSH App 使用' })

    const failures = checks.filter(check => !check.ok)
    if (failures.length) {
      const detail = failures.map(check => check.name).join('、')
      await this.writeReceipt(entry, [...mcpAdded], 'failed', detail, skillResult.managed)
      throw new Error(`安装未通过验收：${detail}。已保留阶段状态，可修复后重试。`)
    }
    await this.writeReceipt(entry, [...mcpAdded], 'installed', undefined, skillResult.managed)
    const installed = Boolean(await this.readReceipt(entry.preview.name))
    checks.unshift({ name: 'App', ok: installed, detail: installed ? `${entry.preview.name} ${entry.preview.version} · DSH 已登记` : 'DSH App 登记失败' })
    progress('complete', 1, 1, '安装与验收完成')
    return { app: { ...entry.preview, installed, installedVersion: entry.preview.version, enabled: true, updateAvailable: false, managedMcp: [...mcpAdded], managedSkills: skillResult.managed, installState: 'installed' }, checks }
  }

  private receiptFile(name: string) { return join(this.home, '.dsh', 'apps', `${name}.json`) }

  private async readReceipt(name: string): Promise<AppReceipt | null> {
    try {
      const record = JSON.parse(await readFile(this.receiptFile(name), 'utf8')) as AppReceipt
      return record.name === name && Array.isArray(record.skills) ? record : null
    } catch { return null }
  }

  private async installDshSkills(entry: StoredPreview, names: string[], progress: (current: number, detail: string) => void = () => {}): Promise<{ installed: string[]; reused: string[]; managed: string[] }> {
    const targetRoot = join(this.home, '.agents', 'skills')
    const previous = await this.readReceipt(entry.preview.name)
    const owned = previous?.managedSkills ?? previous?.skills ?? []
    const reused: string[] = []
    const install: string[] = []
    for (const name of names) {
      const target = join(targetRoot, name)
      try {
        await access(target)
        if (!owned.includes(name)) reused.push(name)
        else install.push(name)
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') install.push(name)
        else throw cause
      }
    }
    await mkdir(targetRoot, { recursive: true })
    const total = entry.skillFiles.reduce((sum, file) => sum + file.size, 0)
    if (total > 40 * 1024 * 1024) throw new Error('App Skills 总大小超过 40 MB 限制')
    const temporary = new Map<string, string>()
    try {
      for (const name of install) {
        const dir = join(targetRoot, `.${name}.dsm-${randomUUID()}`)
        await mkdir(dir, { recursive: true }); temporary.set(name, dir)
      }
      let completed = reused.length
      progress(completed, reused.length ? `已复用 ${reused.length} 个现有 Skill` : '正在下载 Skills')
      const installOne = async (name: string) => {
        const files = entry.skillFiles.filter(file => file.path.startsWith(`skills/${name}/`))
        for (let index = 0; index < files.length; index += 8) await Promise.all(files.slice(index, index + 8).map(async file => {
          const match = /^skills\/([^/]+)\/(.+)$/.exec(file.path)
          if (!match || !temporary.has(match[1]) || file.size > 4 * 1024 * 1024) throw new Error(`不安全的 Skill 文件：${file.path}`)
          const relative = match[2]
          if (relative.split('/').some(part => part === '..' || part === '')) throw new Error(`不安全的 Skill 路径：${file.path}`)
          const destination = join(temporary.get(match[1])!, relative)
          const encoded = file.path.split('/').map(encodeURIComponent).join('/')
          const url = `https://raw.githubusercontent.com/${entry.repo}/${entry.revision}/plugins/${entry.preview.name}/${encoded}`
          const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'dsh-skill-mcp-console' } })
          if (!response.ok) throw new Error(`下载 ${file.path} 失败（HTTP ${response.status}）`)
          const data = Buffer.from(await response.arrayBuffer())
          if (data.byteLength !== file.size) throw new Error(`${file.path} 大小与预检不一致`)
          await mkdir(dirname(destination), { recursive: true })
          await writeFile(destination, data)
        }))
        completed++
        progress(completed, `已准备 ${name}`)
      }
      for (let index = 0; index < install.length; index += 4) await Promise.all(install.slice(index, index + 4).map(installOne))
      for (const name of install) {
        const target = join(targetRoot, name)
        await rm(target, { recursive: true, force: true })
        await rename(temporary.get(name)!, target)
        temporary.delete(name)
      }
      return { installed: install, reused, managed: [...new Set([...owned, ...install])] }
    } finally {
      for (const dir of temporary.values()) await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async writeReceipt(entry: StoredPreview, mcpAdded: string[], status: 'installed' | 'failed' = 'installed', lastError?: string, managedSkills = entry.preview.skills.map(item => item.name)) {
    const file = this.receiptFile(entry.preview.name)
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify({
      schema: 1, name: entry.preview.name, version: entry.preview.version, revision: entry.revision,
      source: entry.repo, skills: entry.preview.skills.map(item => item.name), managedSkills,
      mcpServers: entry.preview.mcpServers.map(item => item.name), mcpAdded,
      installedAt: new Date().toISOString(), enabled: true, status, ...(lastError ? { lastError } : {}),
    }, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, file)
  }

  async setEnabled(name: string, enabled: boolean): Promise<{ changed: number }> {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('App ID 无效')
    const receipt = await this.readReceipt(name)
    if (!receipt) throw new Error('App 未安装')
    let changed = 0
    for (const skill of receipt.managedSkills ?? receipt.skills) {
      const dir = join(this.home, '.agents', 'skills', skill)
      try { await setSkillState(this.home, dir, enabled ? 'on' : 'off'); changed++ } catch {}
    }
    const current = await toUniversal(this.patch, false)
    for (const server of receipt.mcpAdded ?? []) if (current[server]) current[server].disabled = !enabled
    await fromUniversal(this.patch, current)
    receipt.enabled = enabled
    await this.writeReceiptValue(receipt)
    return { changed }
  }

  async uninstall(name: string): Promise<{ moved: string[]; preservedMcp: string[] }> {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('App ID 无效')
    const receipt = await this.readReceipt(name)
    if (!receipt) throw new Error('App 未安装')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const trash = join(this.home, '.dsh', 'app-trash', stamp, name)
    const moved: string[] = []
    for (const skill of receipt.managedSkills ?? receipt.skills) {
      const source = join(this.home, '.agents', 'skills', skill)
      try {
        await access(source)
        await mkdir(join(trash, 'skills'), { recursive: true })
        await rename(source, join(trash, 'skills', skill)); moved.push(skill)
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      }
    }
    const current = await toUniversal(this.patch, false)
    for (const server of receipt.mcpAdded ?? []) delete current[server]
    await fromUniversal(this.patch, current)
    await mkdir(trash, { recursive: true })
    await rename(this.receiptFile(name), join(trash, 'receipt.json'))
    await run('codex', ['plugin', 'remove', `${name}@personal`])
    return { moved, preservedMcp: receipt.mcpServers.filter(server => !(receipt.mcpAdded ?? []).includes(server)) }
  }

  private async writeReceiptValue(receipt: AppReceipt) {
    const file = this.receiptFile(receipt.name)
    const temporary = `${file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, file)
  }

  private prune() {
    const now = Date.now()
    for (const [key, value] of this.previews) if (value.expiresAt <= now) this.previews.delete(key)
  }
}
