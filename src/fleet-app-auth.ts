import type { UniversalServer } from './mcpconfig.ts'
const BASE = 'https://fleet.vyibc.com/api/hub/plugin-bootstrap'
export interface ReleaseMetadata { revision: string; manifest: any; tree: { path: string; type: string; size?: number }[]; commands?: { commands?: { name: string; description?: string }[] } }
export async function requestFleetAppRelease(): Promise<ReleaseMetadata> {
  const response = await fetch(`${BASE}/release`, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`读取 Fleet 发布清单失败（HTTP ${response.status}）`)
  const data = await response.json() as { ok?: boolean; metadata?: ReleaseMetadata }
  const metadata = data.metadata
  if (!data.ok || !metadata || !/^[a-f0-9]{40}$/.test(metadata.revision) || metadata.manifest?.name !== 'cartoon-video-studio' || typeof metadata.manifest.version !== 'string' || !Array.isArray(metadata.tree)) throw new Error('Fleet 发布清单无效')
  return metadata
}
export async function requestFleetAppGrant(name: string, servers: Record<string, UniversalServer>, serviceToken = process.env.DSH_FLEET_APP_SERVICE_TOKEN): Promise<{ command: string; metadata: ReleaseMetadata }> {
  if (name !== 'cartoon-video-studio') throw new Error('此 App 尚未提供 Fleet 安装授权')
  const trusted = Object.values(servers).find(server => !server.disabled && ['https://fleet.vyibc.com/mcp/vault', 'https://fleet.vyibc.com/mcp/fleet'].includes(server.url ?? '') && typeof server.headers?.Authorization === 'string')
  const authorization = serviceToken ? `Bearer ${serviceToken}` : trusted?.headers?.Authorization
  if (!authorization) throw new Error('当前 DSH 尚未连接 Fleet 授权服务，请先配置 Fleet 连接')
  const response = await fetch(`${BASE}/service`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ plugin: name }) })
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Fleet 连接无权安装此 App，请检查连接授权' : `Fleet 安装授权服务暂不可用（HTTP ${response.status}）`)
  const data = await response.json() as { ok?: boolean; plugin?: string; bootstrapToken?: string; metadata?: ReleaseMetadata }
  if (!data.ok || data.plugin !== name || typeof data.bootstrapToken !== 'string' || !/^[A-Za-z0-9_.-]{24,4096}$/.test(data.bootstrapToken) || !data.metadata || !/^[a-f0-9]{40}$/.test(data.metadata.revision) || data.metadata.manifest?.name !== name || !Array.isArray(data.metadata.tree)) throw new Error('Fleet 返回的 App 授权或版本清单无效')
  return { command: `bash <(curl -fsSL https://skill.vyibc.com/${name}/release/install-${name}.sh) --bootstrap-token ${data.bootstrapToken}`, metadata: data.metadata }
}
