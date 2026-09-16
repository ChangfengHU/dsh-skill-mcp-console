import { randomUUID } from 'node:crypto'
import { run } from './install.ts'

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
interface StoredPreview { expiresAt: number; token: string; preview: AppPreview; repo: string; marketplace: string; bridge: string; revision: string }

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
    const tree = await githubJson<{ tree?: { path: string; type: string }[] }>(`https://api.github.com/repos/${contract.repo}/git/trees/${revision}?recursive=1`)
    const prefix = `plugins/${contract.plugin}/`
    const paths = (tree.tree ?? []).filter(item => item.type === 'blob' && item.path.startsWith(prefix)).map(item => item.path.slice(prefix.length))
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
      installed: await isInstalled(contract.plugin, contract.marketplace),
    })
    this.prune()
    this.previews.set(preview.previewId, { expiresAt: preview.expiresAt, token: parsed.token, preview, revision, ...contract })
    return preview
  }

  async install(previewId: string): Promise<{ app: AppPreview; checks: { name: string; ok: boolean; detail: string }[] }> {
    this.prune()
    const entry = this.previews.get(previewId)
    if (!entry) throw new Error('预检已过期，请重新粘贴安装命令')
    this.previews.delete(previewId)
    const clean = (value: string) => value.replaceAll(entry.token, '••••')
    const market = await run('codex', ['plugin', 'marketplace', 'add', entry.repo, '--ref', entry.revision, '--json'])
    if (market.code !== 0 && !/already|exists|configured/i.test(market.out)) throw new Error(`Marketplace 安装失败：${clean(market.out).trim()}`)
    const plugin = await run('codex', ['plugin', 'add', `${entry.preview.name}@${entry.marketplace}`, '--json'])
    if (plugin.code !== 0) throw new Error(`App 安装失败：${clean(plugin.out).trim()}`)

    const checks: { name: string; ok: boolean; detail: string }[] = []
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
    const installed = await isInstalled(entry.preview.name, entry.marketplace)
    checks.unshift({ name: 'App', ok: installed, detail: installed ? `${entry.preview.name} ${entry.preview.version}` : 'Codex 未报告为已安装' })
    return { app: { ...entry.preview, installed }, checks }
  }

  private prune() {
    const now = Date.now()
    for (const [key, value] of this.previews) if (value.expiresAt <= now) this.previews.delete(key)
  }
}
