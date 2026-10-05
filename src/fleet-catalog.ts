export interface PublishedApp {
  id: string; title: string; blurb: string; repo: string; version: string
  source: { revision: string; packageVersion?: string }
  components: Record<string, { id: string; description?: string }[]>
  install: string
}

export function parsePublishedCatalog(value: unknown): PublishedApp[] {
  const data = value as { ok?: boolean; plugins?: PublishedApp[] }
  if (!data?.ok || !Array.isArray(data.plugins)) throw new Error('Fleet 插件目录格式无效')
  const ids = new Set<string>()
  for (const app of data.plugins) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(app.id) || ids.has(app.id)
      || typeof app.title !== 'string' || typeof app.blurb !== 'string'
      || typeof app.repo !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(app.repo)
      || !/^[a-f0-9]{40}$/.test(app.source?.revision ?? '')
      || typeof app.version !== 'string' || typeof app.install !== 'string'
      || !app.components || typeof app.components !== 'object'
      || Object.values(app.components).some(parts => !Array.isArray(parts) || parts.some(part => typeof part?.id !== 'string'))) {
      throw new Error('Fleet 插件目录包含无效或重复的发布项')
    }
    ids.add(app.id)
  }
  return data.plugins
}

export async function requestPublishedCatalog(): Promise<PublishedApp[]> {
  const response = await fetch('https://fleet.vyibc.com/api/hub/registry', {
    redirect: 'error', signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Fleet 插件目录读取失败（HTTP ${response.status}）`)
  const raw = await response.text()
  if (raw.length > 2 * 1024 * 1024) throw new Error('Fleet 插件目录超过大小限制')
  return parsePublishedCatalog(JSON.parse(raw))
}
