import type { UniversalServer } from './mcpconfig.ts'
const BASE = 'https://fleet.vyibc.com/api/hub/plugin-bootstrap'

/** Read bounded release declarations; never execute installer code. */
export function installerContract(script: string, slug: string) {
  const repo = /codex plugin marketplace add\s+([\w.-]+\/[\w.-]+)/.exec(script)?.[1]
  const selector = /codex plugin add\s+([\w.-]+)@([\w.-]+)/.exec(script)
  const modern = /bridge\s*=\s*os\.environ\.get\("VYIBC_PLUGIN_BRIDGE_BASE",\s*"([^"]+)"\)/.exec(script)?.[1]
  const legacy = /BRIDGE_BASE=["']?\$\{VYIBC_PLUGIN_BRIDGE_BASE:-([^}"']+)\}/.exec(script)?.[1]
  const list = /(?:servers\s*=|for name in)\s*(\[[^\]\n]+\])/.exec(script)?.[1]
  if (!repo || !selector || selector[1] !== slug || !list || (modern ?? legacy) !== (modern ? BASE : `${BASE}/mcp`)) throw new Error('安装器未声明可验证的 Marketplace、App 或 MCP 清单')
  let servers: unknown
  try { servers = JSON.parse(list.replaceAll("'", '"')) } catch { throw new Error('MCP 清单不是静态列表') }
  if (!Array.isArray(servers) || !servers.length || servers.some(n => typeof n !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(n)) || new Set(servers).size !== servers.length) throw new Error('MCP 清单无效')
  return { repo, plugin: selector[1], marketplace: selector[2], bridge: `${BASE}/mcp`, servers: servers as string[], ...(modern ? { credentials: `${BASE}/credentials` } : {}) }
}

export async function exchangeCredentials(endpoint: string, token: string, expected: string[]): Promise<Record<string, UniversalServer>> {
  if (endpoint !== `${BASE}/credentials`) throw new Error('不受信任的授权服务')
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ bootstrap_token: token }) })
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '安装授权无效或已过期，请在能力广场重新生成安装命令' : `授权服务请求失败（HTTP ${response.status}）`)
  const data = await response.json() as { mcpServers?: Record<string, any>; env?: Record<string, string> }
  const result: Record<string, UniversalServer> = {}
  for (const name of expected) {
    const cfg = data.mcpServers?.[name]
    let url: URL
    try { url = new URL(cfg?.url) } catch { throw new Error(`授权响应缺少 ${name} 的有效端点`) }
    if (url.protocol !== 'https:' || url.hostname !== 'fleet.vyibc.com' || url.port || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/mcp/') && !url.pathname.startsWith('/api/hub/plugin-bootstrap/mcp/')) throw new Error(`授权响应包含不受信任的端点：${name}`)
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(cfg.headers ?? {})) {
      if (typeof value !== 'string' || /[\r\n]/.test(key + value)) throw new Error(`授权响应包含无效请求头：${name}`)
      headers[key] = value
    }
    if (cfg.bearer_token_env_var) {
      const value = data.env?.[cfg.bearer_token_env_var]
      if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new Error(`授权响应缺少 ${name} 的凭据`)
      headers.Authorization = `Bearer ${value}`
    }
    // Some publisher endpoints are public; preserve their declared auth policy.
    result[name] = { type: 'http', url: url.toString(), headers, failOnStartupError: false }
  }
  return result
}
