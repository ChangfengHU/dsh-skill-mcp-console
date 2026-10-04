import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { run } from './install.ts'
import { fromUniversal, toUniversal } from './mcpconfig.ts'
import { setSkillState } from './skills.ts'
import { installerContract, exchangeCredentials } from './app-contract.ts'
import { requestFleetAppGrant, requestFleetAppRelease, type ReleaseMetadata } from './fleet-app-auth.ts'

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
  skillConflicts?: string[]
  releaseStatus?: 'unchecked' | 'checked' | 'failed'
  releaseError?: string
  installState: 'available' | 'installed' | 'failed'
  localDevelopment?: boolean
  agentPresets?: string[]
}

interface AppReceipt {
  schema: number; name: string; version: string; revision: string; source: string
  skills: string[]; mcpServers: string[]; mcpAdded?: string[]; installedAt: string; enabled?: boolean
  status?: 'installed' | 'failed'; lastError?: string
  managedSkills?: string[]
  sourceKind?: string; displayName?: string; description?: string; publisher?: string
  manifest?: string; manifestSha256?: string; managedAgents?: string[]; permissions?: string[]
}

interface ParsedImport { slug: string; installer: string; token: string }
interface StoredPreview {
  expiresAt: number; token: string; preview: AppPreview; repo: string; marketplace: string; bridge: string; revision: string; credentials?: string
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
  return installerContract(script, slug)
}

async function githubJson<T>(url: string): Promise<T> {
  return JSON.parse(await text(url)) as T
}


function publicPreview(value: Omit<AppPreview, 'previewId' | 'expiresAt'>): AppPreview {
  return { ...value, previewId: randomUUID(), expiresAt: Date.now() + PREVIEW_TTL_MS }
}

export class AppInstaller {
  private previews = new Map<string, StoredPreview>()
  private installing = new Set<string>()
  private readonly home: string
  private readonly patch: string
  private release: { revision: string; version: string; skills: string[] } | null = null
  private releaseError = ''
  private releaseCheckedAt = 0

  constructor(home = homedir(), patch = join(process.env.DSH_HOME ?? join(home, '.dsh'), 'profiles', 'web', 'cordis.patch.yml')) {
    this.home = home
    this.patch = patch
  }

  async inspectCatalog(name: string): Promise<AppPreview> {
    const grant = await requestFleetAppGrant(name, await toUniversal(this.patch, false))
    return this.inspect(grant.command, grant.metadata)
  }

  async inspect(input: string, metadata?: ReleaseMetadata): Promise<AppPreview> {
    const parsed = parseAppImport(input)
    const installerText = await text(parsed.installer)
    const contract = scriptContract(installerText, parsed.slug)
    if (metadata && contract.repo !== 'ChangfengHU/cartoon-video-skills') throw new Error('Fleet 授权与发布仓库不一致')
    const head = metadata ? { sha: metadata.revision } : await githubJson<{ sha?: string }>(`https://api.github.com/repos/${contract.repo}/commits/main`)
    if (!head.sha || !/^[0-9a-f]{40}$/.test(head.sha)) throw new Error('无法固定 App 发布版本')
    const revision = head.sha
    const rawBase = `https://raw.githubusercontent.com/${contract.repo}/${revision}`
    const manifestPath = `plugins/${contract.plugin}/.codex-plugin/plugin.json`
    const manifest = metadata?.manifest ?? await githubJson<any>(`${rawBase}/${manifestPath}`)
    if (manifest.name !== contract.plugin || typeof manifest.version !== 'string') throw new Error('App manifest 与安装器声明不一致')
    const tree = metadata ? { tree: metadata.tree } : await githubJson<{ tree?: { path: string; type: string; size?: number }[] }>(`https://api.github.com/repos/${contract.repo}/git/trees/${revision}?recursive=1`)
    const prefix = `plugins/${contract.plugin}/`
    const files = (tree.tree ?? []).filter(item => item.type === 'blob' && item.path.startsWith(prefix))
      .map(item => ({ path: item.path.slice(prefix.length), size: item.size ?? 0 }))
    const paths = files.map(item => item.path)
    const skillNames = [...new Set(paths.flatMap(path => /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1] ?? []))].sort()
    let commands: AppPart[] = [...new Set(paths.flatMap(path => /^(?:commands|instructions)\/([^/]+)$/.exec(path)?.[1] ?? []))].sort().map(name => ({ name }))
    if (paths.includes('command-support/catalog.json')) {
      const catalog = metadata?.commands ?? await githubJson<{ commands?: { name?: string; description?: string }[] }>(`${rawBase}/plugins/${contract.plugin}/command-support/catalog.json`)
      commands = (catalog.commands ?? []).filter(item => item.name).map(item => ({ name: item.name!, description: item.description }))
    }
    const hookNames = [...new Set(paths.flatMap(path => /^hooks\/([^/]+)$/.exec(path)?.[1] ?? []))].sort()
    const receipt = await this.readReceipt(contract.plugin)
    const owned = receipt?.managedSkills ?? receipt?.skills ?? []
    const skillConflicts: string[] = []
    for (const name of skillNames) {
      try { await access(join(this.home, '.agents', 'skills', name)); if (!owned.includes(name)) skillConflicts.push(name) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    }
    const preview = publicPreview({
      name: manifest.name,
      skillConflicts,
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
  async checkUpdates(): Promise<AppPreview[]> {
    try {
      const repo = 'ChangfengHU/cartoon-video-skills'
      const head = await githubJson<{ sha: string }>(`https://api.github.com/repos/${repo}/commits/main`)
      if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('发布版本无效')
      const manifest = await githubJson<any>(`https://raw.githubusercontent.com/${repo}/${head.sha}/plugins/cartoon-video-studio/.codex-plugin/plugin.json`)
      if (manifest.name !== 'cartoon-video-studio' || typeof manifest.version !== 'string') throw new Error('发布清单无效')
      const tree = await githubJson<{ tree: { path: string; type: string }[] }>(`https://api.github.com/repos/${repo}/git/trees/${head.sha}?recursive=1`)
      this.release = { revision: head.sha, version: manifest.version, skills: tree.tree.filter(x => x.type === 'blob').flatMap(x => /^plugins\/cartoon-video-studio\/skills\/([^/]+)\/SKILL\.md$/.exec(x.path)?.[1] ?? []) }
      this.releaseError = ''
    } catch (e) {
      try {
        const metadata = await requestFleetAppRelease()
        this.release = { revision: metadata.revision, version: metadata.manifest.version, skills: metadata.tree.filter(x => x.type === 'blob').flatMap(x => /^plugins\/cartoon-video-studio\/skills\/([^/]+)\/SKILL\.md$/.exec(x.path)?.[1] ?? []) }
        this.releaseError = ''
      } catch (fallback) { this.releaseError = `${(e as Error).message}；${(fallback as Error).message}` }
    }
    this.releaseCheckedAt = Date.now()
    return this.catalog()
  }

  async previewUpdate(name: string): Promise<AppPreview> {
    if (name !== 'cartoon-video-studio' || !await this.readReceipt(name)) throw new Error('App 未安装')
    return this.inspectCatalog(name)
  }

  async catalog(): Promise<AppPreview[]> {
    // Catalog navigation must not wait on four publisher/GitHub requests. The
    // signed import preview below remains the authority for the exact release.
    const receipt = await this.readReceipt('cartoon-video-studio')
    const names = ['cartoon-hongyi','cartoon-video-studio','cartoon-xiaban','general-video','hyperframes-animation','hyperframes-audio','hyperframes-cli','hyperframes-core','hyperframes-creative','hyperframes-keyframes','hyperframes-registry','hyperframes','media-use','studio-ali','studio-character-workflow','studio-check','studio-director','studio-help','studio-hongyi','studio-materials','studio-music','studio-new','studio-publish','studio-quality','studio-revise','studio-xiabanxiaoren','studio','voice-production','vyibc-character-design']
    const servers = ['vyibc-cartoon-assets','vyibc-image','vyibc-douyin','vyibc-youtube','vyibc-voice','vyibc-behavior','vyibc-xiaohongshu','vyibc-vault']
    const commands = ['studio','studio-xiabanxiaoren','studio-hongyi','studio-ali','studio-new','studio-help','studio-revise','studio-check','studio-publish']
    const result: AppPreview[] = [{
      previewId: '', expiresAt: 0, name: 'cartoon-video-studio', displayName: '卡通视频工作室',
      version: this.release?.version ?? receipt?.version ?? '未知', installedVersion: receipt?.version ?? null,
      description: '从角色、选声到连续表演和成片验收，把完整卡通视频制作能力带进会话。',
      publisher: 'ChangfengHU', source: 'github.com/ChangfengHU/cartoon-video-skills',
      revision: this.release?.revision ?? receipt?.revision ?? 'main', installer: `https://${INSTALLER_HOST}/cartoon-video-studio/release/install-cartoon-video-studio.sh`,
      skills: (this.release?.skills ?? receipt?.skills ?? names).map(name => ({ name })), mcpServers: (receipt?.mcpServers ?? servers).map(name => ({ name })),
      commands: commands.map(name => ({ name })), hooks: [], permissions: ['Read', 'Write'], installed: Boolean(receipt && receipt.status !== 'failed'), enabled: receipt?.enabled !== false,
      updateAvailable: Boolean(receipt && this.release && receipt.revision !== this.release.revision),
      releaseStatus: this.releaseError ? 'failed' : this.releaseCheckedAt ? 'checked' : 'unchecked',
      ...(this.releaseError ? { releaseError: this.releaseError } : {}),
      managedMcp: receipt?.mcpAdded ?? [],
      managedSkills: receipt?.managedSkills ?? receipt?.skills ?? [], installState: receipt?.status === 'failed' ? 'failed' : receipt ? 'installed' : 'available',
    }]
    // Local development Apps are registered only after the native installer has
    // copied/hash-checked Skills and written presets. Do not present them as
    // public releases or silently feed local paths to the remote installer.
    const appRoot = dirname(this.receiptFile('placeholder'))
    const files = await readdir(appRoot).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    for (const file of files.sort()) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(file)) continue
      const app = await this.readReceipt(file.slice(0, -5))
      if (app?.sourceKind !== 'local-development' || !app.manifest?.endsWith('/dsh/app.json')) continue
      let verified = false
      try { verified = createHash('sha256').update(await readFile(app.manifest)).digest('hex') === app.manifestSha256 } catch {}
      result.push({
        previewId: '', expiresAt: 0, name: app.name, displayName: app.displayName ?? app.name,
        version: app.version, installedVersion: app.version, description: app.description ?? '本地开发 App',
        publisher: app.publisher ?? 'local', source: `本地开发 · ${app.source}`, revision: app.revision,
        installer: '', skills: app.skills.map(name => ({ name })), mcpServers: app.mcpServers.map(name => ({ name })),
        commands: [], hooks: [], permissions: app.permissions ?? ['Read', 'Write'],
        installed: verified && app.status === 'installed', enabled: app.enabled !== false, updateAvailable: false,
        managedMcp: app.mcpAdded ?? [], managedSkills: app.managedSkills ?? [],
        installState: verified && app.status === 'installed' ? 'installed' : 'failed',
        localDevelopment: true, agentPresets: app.managedAgents ?? [],
      })
    }
    return result
  }

  async install(previewId: string, progress: (stage: string, current: number, total: number, detail: string) => void = () => {}, options: { overwriteSkills?: boolean } = {}): Promise<{ app: AppPreview; checks: { name: string; ok: boolean; detail: string; warning?: boolean }[] }> {
    const name = this.previews.get(previewId)?.preview.name
    if (!name) throw new Error('预检已过期，请重新预检')
    if (this.installing.has(name)) throw new Error('该 App 正在安装或更新，请等待当前任务完成')
    this.installing.add(name)
    try { return await this.installExact(previewId, progress, options) } finally { this.installing.delete(name) }
  }

  private async installExact(previewId: string, progress: (stage: string, current: number, total: number, detail: string) => void, options: { overwriteSkills?: boolean }): Promise<{ app: AppPreview; checks: { name: string; ok: boolean; detail: string }[] }> {
    this.prune()
    const entry = this.previews.get(previewId)
    if (!entry) throw new Error('预检已过期，请重新粘贴安装命令')
    this.previews.delete(previewId)
    const clean = (value: string) => entry.token ? value.replaceAll(entry.token, '••••') : value
    const checks: { name: string; ok: boolean; detail: string; warning?: boolean }[] = []
    const expected = entry.preview.skills.map(item => item.name).sort()
    // Reject invalid/expired authorization before changing any local files.
    const credentials = entry.credentials ? await exchangeCredentials(entry.credentials, entry.token, entry.preview.mcpServers.map(s => s.name)) : null
    const current = await toUniversal(this.patch, false)
    const previous = await this.readReceipt(entry.preview.name)
    if (!entry.token && entry.preview.mcpServers.some(s => !current[s.name]?.url)) throw new Error('现有 MCP 配置已变化，请重新预检更新')
    progress('skills', 0, expected.length, '正在安装 DSH Skills')
    const skillResult = await this.installDshSkills(entry, expected, (current, detail) => {
      progress('skills', current, expected.length, detail)
    }, options.overwriteSkills === true)
    progress('skills', expected.length, expected.length, `${skillResult.installed.length} 个安装，${skillResult.reused.length} 个复用`)
    checks.push({ name: 'DSH Skills', ok: true, detail: `${skillResult.installed.length} 个由 App 安装，${skillResult.reused.length} 个环境复用` })

    const mcpAdded = new Set(previous?.mcpAdded ?? [])
    for (const server of entry.preview.mcpServers) {
      if (!entry.token) continue
      const existing = current[server.name]
      if (existing?.disabled) continue
      const placeholder = existing?.disabled && existing.url === `${entry.bridge.replace(/\/$/, '')}/${server.name}` && !Object.keys(existing.headers ?? {}).length
      if (existing && !mcpAdded.has(server.name) && !placeholder) continue
      if (credentials) {
        current[server.name] = { ...current[server.name], ...credentials[server.name], disabled: false }
        mcpAdded.add(server.name); continue
      }
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
      if (configured?.disabled) {
        checks.push({ name: server.name, ok: true, warning: true, detail: '本地连接已停用，保留原设置；对应能力暂不可用，不阻断 App 安装。未执行连接验收，不代表 Fleet 服务停用。' })
        progress('mcp', index + 1, entry.preview.mcpServers.length, `保留 ${server.name} 的停用状态`)
        continue
      }
      try {
        if (!endpoint) throw new Error('当前配置不是可直接验收的 HTTP MCP')
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { ...(configured.headers ?? {}), accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-app-installer', version: '1' } } }),
          redirect: 'error', signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        checks.push({ name: server.name, ok: true, detail: 'DSH 连接通过' })
      } catch (cause) {
        checks.push({ name: server.name, ok: false, detail: clean((cause as Error).message) })
      }
      progress('mcp', index + 1, entry.preview.mcpServers.length, `已检查 ${server.name}`)
    }
    progress('codex', 0, 1, '正在登记 DSH App')

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

  private receiptFile(name: string) { return join(process.env.DSH_HOME ?? join(this.home, '.dsh'), 'apps', `${name}.json`) }

  private async readReceipt(name: string): Promise<AppReceipt | null> {
    try {
      const record = JSON.parse(await readFile(this.receiptFile(name), 'utf8')) as AppReceipt
      return record.name === name && Array.isArray(record.skills) ? record : null
    } catch { return null }
  }

  private async installDshSkills(entry: StoredPreview, names: string[], progress: (current: number, detail: string) => void = () => {}, overwriteSkills = false): Promise<{ installed: string[]; reused: string[]; managed: string[] }> {
    const targetRoot = join(process.env.DSH_AGENTS_HOME ?? join(this.home, '.agents'), 'skills')
    const previous = await this.readReceipt(entry.preview.name)
    const owned = previous?.managedSkills ?? previous?.skills ?? []
    const reused: string[] = []
    const install: string[] = []
    for (const name of names) {
      const target = join(targetRoot, name)
      try {
        await access(target)
        if (!owned.includes(name) && !overwriteSkills) reused.push(name)
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
      const backup = join(this.home, '.dsh', 'app-backups', entry.preview.name, randomUUID())
      const replaced: { name: string; saved: boolean; activated: boolean }[] = []
      await mkdir(backup, { recursive: true, mode: 0o700 })
      try {
        for (const name of install) {
          const item = { name, saved: false, activated: false }; replaced.push(item)
          const target = join(targetRoot, name)
          try { await rename(target, join(backup, name)); item.saved = true } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          await rename(temporary.get(name)!, target); item.activated = true
          temporary.delete(name)
        }
      } catch (e) {
        for (const item of replaced.reverse()) {
          const target = join(targetRoot, item.name)
          if (item.activated) await rm(target, { recursive: true, force: true })
          if (item.saved) await rename(join(backup, item.name), target)
        }
        throw e
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
      const dir = join(process.env.DSH_AGENTS_HOME ?? join(this.home, '.agents'), 'skills', skill)
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
    const trash = join(process.env.DSH_HOME ?? join(this.home, '.dsh'), 'app-trash', stamp, name)
    const moved: string[] = []
    for (const skill of receipt.managedSkills ?? receipt.skills) {
      const source = join(process.env.DSH_AGENTS_HOME ?? join(this.home, '.agents'), 'skills', skill)
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
