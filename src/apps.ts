import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { run } from './install.ts'
import { fromUniversal, toUniversal } from './mcpconfig.ts'

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
  const response = await fetch(url, { redirect: 'error', headers: { 'user-agent': 'dsh-skill-mcp-console' } })
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
    const commandNames = [...new Set(paths.flatMap(path => /^(?:commands|instructions)\/([^/]+)$/.exec(path)?.[1] ?? []))].sort()
    const hookNames = [...new Set(paths.flatMap(path => /^hooks\/([^/]+)$/.exec(path)?.[1] ?? []))].sort()
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
      commands: commandNames.map(name => ({ name })),
      hooks: hookNames.map(name => ({ name })),
      permissions: Array.isArray(manifest.interface?.capabilities) ? manifest.interface.capabilities : [],
      installed: await this.isDshInstalled(contract.plugin, revision),
    })
    this.prune()
    this.previews.set(preview.previewId, {
      expiresAt: preview.expiresAt, token: parsed.token, preview, revision,
      skillFiles: files.filter(item => item.path.startsWith('skills/')), ...contract,
    })
    return preview
  }

  async install(previewId: string): Promise<{ app: AppPreview; checks: { name: string; ok: boolean; detail: string }[] }> {
    this.prune()
    const entry = this.previews.get(previewId)
    if (!entry) throw new Error('预检已过期，请重新粘贴安装命令')
    this.previews.delete(previewId)
    const clean = (value: string) => value.replaceAll(entry.token, '••••')
    const checks: { name: string; ok: boolean; detail: string }[] = []
    const expected = entry.preview.skills.map(item => item.name).sort()
    await this.installDshSkills(entry, expected)
    checks.push({ name: 'DSH Skills', ok: true, detail: `${expected.length} 个已安装到原生能力目录` })

    const current = await toUniversal(this.patch, false)
    for (const server of entry.preview.mcpServers) current[server.name] = {
      type: 'http', url: `${entry.bridge.replace(/\/$/, '')}/${server.name}`,
      headers: { Authorization: `Bearer ${entry.token}` }, failOnStartupError: false,
    }
    await fromUniversal(this.patch, current)
    checks.push({ name: 'DSH MCP', ok: true, detail: `${entry.preview.mcpServers.length} 个连接已写入当前 Profile，服务将自动重载` })

    for (const server of entry.preview.mcpServers) {
      const endpoint = `${entry.bridge.replace(/\/$/, '')}/${server.name}`
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${entry.token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-app-installer', version: '1' } } }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const added = await run('codex', ['mcp', 'add', server.name, '--', 'npx', '-y', 'mcp-remote', endpoint, '--header', `Authorization: Bearer ${entry.token}`])
        if (added.code !== 0 && !/already|exists/i.test(added.out)) throw new Error(clean(added.out).trim())
        checks.push({ name: server.name, ok: true, detail: '连接通过并已配置' })
      } catch (cause) {
        checks.push({ name: server.name, ok: false, detail: clean((cause as Error).message) })
      }
    }
    const market = await run('codex', ['plugin', 'marketplace', 'add', entry.repo, '--ref', entry.revision, '--json'])
    const marketOk = market.code === 0 || /already|exists|configured/i.test(market.out)
    const plugin = marketOk ? await run('codex', ['plugin', 'add', `${entry.preview.name}@${entry.marketplace}`, '--json']) : { code: -1, out: market.out }
    const codexOk = plugin.code === 0 || await isInstalled(entry.preview.name, entry.marketplace)
    checks.push({ name: 'Codex Plugin', ok: codexOk, detail: codexOk ? '已安装并启用' : `DSH 能力已安装；Codex 侧未完成：${clean(plugin.out).trim()}` })

    await this.writeReceipt(entry)
    const installed = await this.isDshInstalled(entry.preview.name, entry.revision)
    checks.unshift({ name: 'App', ok: installed, detail: installed ? `${entry.preview.name} ${entry.preview.version} · DSH 已登记` : 'DSH App 登记失败' })
    return { app: { ...entry.preview, installed }, checks }
  }

  private receiptFile(name: string) { return join(this.home, '.dsh', 'apps', `${name}.json`) }

  private async isDshInstalled(name: string, revision: string): Promise<boolean> {
    try {
      const record = JSON.parse(await readFile(this.receiptFile(name), 'utf8')) as { revision?: string }
      return record.revision === revision
    } catch { return false }
  }

  private async installDshSkills(entry: StoredPreview, names: string[]) {
    const targetRoot = join(this.home, '.agents', 'skills')
    let owned: string[] = []
    try { owned = (JSON.parse(await readFile(this.receiptFile(entry.preview.name), 'utf8')) as { skills?: string[] }).skills ?? [] } catch {}
    for (const name of names) {
      const target = join(targetRoot, name)
      try {
        await access(target)
        if (!owned.includes(name)) throw new Error(`Skill ${name} 已独立安装；为避免覆盖，App 安装已停止`)
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      }
    }
    await mkdir(targetRoot, { recursive: true })
    const total = entry.skillFiles.reduce((sum, file) => sum + file.size, 0)
    if (total > 40 * 1024 * 1024) throw new Error('App Skills 总大小超过 40 MB 限制')
    const temporary = new Map<string, string>()
    try {
      for (const name of names) {
        const dir = join(targetRoot, `.${name}.dsm-${randomUUID()}`)
        await mkdir(dir, { recursive: true }); temporary.set(name, dir)
      }
      const jobs = entry.skillFiles.map(file => async () => {
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
      })
      for (let index = 0; index < jobs.length; index += 8) await Promise.all(jobs.slice(index, index + 8).map(job => job()))
      for (const name of names) {
        const target = join(targetRoot, name)
        await rm(target, { recursive: true, force: true })
        await rename(temporary.get(name)!, target)
        temporary.delete(name)
      }
    } finally {
      for (const dir of temporary.values()) await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async writeReceipt(entry: StoredPreview) {
    const file = this.receiptFile(entry.preview.name)
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify({
      schema: 1, name: entry.preview.name, version: entry.preview.version, revision: entry.revision,
      source: entry.repo, skills: entry.preview.skills.map(item => item.name),
      mcpServers: entry.preview.mcpServers.map(item => item.name), installedAt: new Date().toISOString(),
    }, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, file)
  }

  private prune() {
    const now = Date.now()
    for (const [key, value] of this.previews) if (value.expiresAt <= now) this.previews.delete(key)
  }
}
