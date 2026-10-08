import type { UniversalServer } from './mcpconfig.ts'
const BASE = 'https://fleet.vyibc.com/api/hub/plugin-bootstrap'
export async function requestFleetCapabilities(keys: string[], servers: Record<string, UniversalServer>, expectedDigest?: string) {
  const trusted = Object.values(servers).find(server => !server.disabled && ['https://fleet.vyibc.com/mcp/vault', 'https://fleet.vyibc.com/mcp/fleet'].includes(server.url ?? '') && typeof server.headers?.Authorization === 'string')
  const authorization = process.env.DSH_FLEET_APP_SERVICE_TOKEN ? 'Bearer ' + process.env.DSH_FLEET_APP_SERVICE_TOKEN : trusted?.headers?.Authorization
  if (!authorization) throw Error('当前 DSH 尚未连接 Fleet 授权服务，请先配置已有 Fleet 连接')
  const response = await fetch('https://fleet.vyibc.com/api/hub/platforms/capabilities/dsh', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ keys, ...(expectedDigest ? { authorize: true, expectedDigest } : {}) }),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw Error('Fleet 能力预检失败（HTTP ' + response.status + '）：' + (typeof detail.error === 'string' && /^[a-z0-9_:/-]{1,220}$/i.test(detail.error) ? detail.error : '请检查连接授权和发布源'))
  }
  const text = await response.text()
  if (text.length > 5 * 1024 * 1024) throw Error('Fleet 能力清单超过大小限制')
  const data = JSON.parse(text)
  if (!data.ok) throw Error('Fleet 能力清单无效')
  return data
}
export interface ReleaseMetadata { revision: string; manifest: any; tree: { path: string; type: string; size?: number }[]; commands?: { commands?: { name: string; description?: string }[] } }
export async function requestFleetPortableGrant(name:string,servers:Record<string,UniversalServer>,serviceToken=process.env.DSH_FLEET_APP_SERVICE_TOKEN){
 if(!/^[a-z][a-z0-9-]{1,63}$/.test(name))throw Error('无效 App 身份');
 const trusted=Object.values(servers).find(server=>!server.disabled&&['https://fleet.vyibc.com/mcp/vault','https://fleet.vyibc.com/mcp/fleet'].includes(server.url??'')&&typeof server.headers?.Authorization==='string');
 const authorization=serviceToken?'Bearer '+serviceToken:trusted?.headers?.Authorization;
 if(!authorization)throw Error('当前 DSH 尚未连接 Fleet 授权服务');
 const response=await fetch('https://fleet.vyibc.com/api/hub/platforms/'+name+'/dsh',{method:'POST',redirect:'error',headers:{authorization,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Fleet App 授权失败（HTTP '+response.status+'）');
 const value=await response.json();if(!value.ok||value.plugin!==name||!value.mcpServers)throw Error('Fleet App 授权响应无效');
 for(const[id,server]of Object.entries<any>(value.mcpServers)){
  if(server.url!=='https://fleet.vyibc.com/api/hub/platforms/'+name+'/mcp/'+id||server.type!=='http'||typeof server.headers?.Authorization!=='string'||/[\r\n]/.test(server.headers.Authorization))throw Error('Fleet App 授权端点无效');
 }
 return value;
}
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
