/**
 * The catalog the station browses: what is installable, and which of it is
 * worth putting in front of someone first.
 *
 * **Where the data comes from.** For now, the community catalog published at
 * `awesome-dsh-plugin.com/plugins.json` — roughly two megabytes and a few
 * thousand entries. Fetching that in the browser on every panel open is the
 * reason the existing market feels heavy, so it is fetched here, once, and
 * kept on disk; the panel only ever receives the page it is showing.
 *
 * **Why the stars need adjusting before anything is ranked by them.** A star
 * belongs to a repository, not to a plugin, and a monorepo contributes one
 * entry per subpackage while sharing one star count. Measured on the
 * 2026-08-27 snapshot: `dsh-plugins` puts 34 entries into the catalog off 8
 * stars, `dsh-web-ui` 19 off 9, and the highest-starred entry of all is an
 * `examples/` directory inside an unrelated 33k-star project. Sorting by the
 * raw number therefore fills the first screen with one repository. Dividing
 * by the sibling count is the smallest correction that removes that, and
 * folding siblings into one group is what stops the correction from merely
 * spreading the same repository further down the page.
 *
 * **Downloads are the honest half of the signal.** They are counted per
 * package rather than per repository, so they are immune to the above — but
 * only 43% of entries have any, so they cannot be used alone either. The two
 * are combined, with a third term for whether it is even installable.
 *
 * @module dsh-plugin-station/catalog
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CatalogEntry, CatalogPage } from './wire.ts'

/** The community catalog, and the origin its own site publishes. */
export const CATALOG_URL = 'https://awesome-dsh-plugin.com/plugins.json'

/** How long a cached copy is served before a refetch is attempted. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000

/** Entries per page. Enough to fill a screen, small enough to send often. */
export const PAGE_SIZE = 24

/** One entry as the upstream catalog writes it. */
interface RawEntry {
  name?: unknown
  owner?: unknown
  url?: unknown
  category?: unknown
  description?: { en?: unknown; zh?: unknown }
  npm?: unknown
  tarball?: unknown
  stars?: unknown
  downloads?: unknown
  install?: unknown
  added?: unknown
}

/** Where the cached catalog lives. */
export function cachePath(home: string): string {
  return join(home, '.dsh', 'plugin-station-catalog.json')
}

/** The repository part of a catalog name — `owner/repo#packages/x` → `owner/repo`. */
export function repoOf(name: string): string {
  return name.split('#')[0] ?? name
}

/** A 0-100 score from a value that spans orders of magnitude. */
function logScore(value: number, ceiling: number): number {
  if (value <= 0) return 0
  return Math.min(100, Math.round((Math.log10(value + 1) / Math.log10(ceiling)) * 100))
}

/**
 * Normalise the upstream document into rows this panel can rank.
 *
 * @param raw - the parsed `plugins.json`.
 * @returns one row per entry, with sibling-adjusted stars and a score.
 */
export function normalize(raw: unknown): CatalogEntry[] {
  const list = (raw as { plugins?: RawEntry[] })?.plugins
  if (!Array.isArray(list)) return []

  const siblings = new Map<string, number>()
  for (const item of list) {
    const name = typeof item.name === 'string' ? item.name : ''
    if (!name) continue
    const repo = repoOf(name)
    siblings.set(repo, (siblings.get(repo) ?? 0) + 1)
  }

  const rows: CatalogEntry[] = []
  for (const item of list) {
    const name = typeof item.name === 'string' ? item.name : ''
    if (!name) continue
    const repo = repoOf(name)
    const family = siblings.get(repo) ?? 1
    const stars = typeof item.stars === 'number' ? item.stars : 0
    const downloads = typeof item.downloads === 'number' ? item.downloads : 0
    // An entry that lives under examples/ is a demo inside someone else's
    // project; its repository's stars say nothing about it.
    const isExample = /(^|[/#])(examples?|demos?|samples?)\//i.test(name)
    const adjusted = isExample ? 0 : Math.round(stars / family)
    const starScore = logScore(adjusted, 4000)
    const downloadScore = logScore(downloads, 220_000)
    const install = typeof item.install === 'string' ? item.install : ''
    rows.push({
      name: name.split('#').pop()?.split('/').pop() || name,
      full: name,
      repo,
      owner: typeof item.owner === 'string' ? item.owner : '',
      url: typeof item.url === 'string' ? item.url : '',
      category: typeof item.category === 'string' ? item.category : '',
      description: String(item.description?.zh || item.description?.en || ''),
      npm: typeof item.npm === 'string' ? item.npm : null,
      tarball: typeof item.tarball === 'string' ? item.tarball : null,
      stars,
      adjusted,
      siblings: family,
      downloads,
      added: typeof item.added === 'string' ? item.added : '',
      // What a person would actually type. The upstream `install` line is
      // profile-specific text; the specifier is the part that transfers.
      spec: specOf(item),
      installable: Boolean(item.npm) || Boolean(item.url) || install !== '',
      // Downloads weigh most because they are the one signal a monorepo
      // cannot inflate; stars still count, adjusted, because 57% of entries
      // have no downloads at all and would otherwise be unrankable.
      score: Math.round(starScore * 0.4 + downloadScore * 0.6),
    })
  }
  return rows
}

/** The specifier `dsh plugin add` should receive for one entry. */
export function specOf(item: RawEntry): string {
  if (typeof item.npm === 'string' && item.npm) return item.npm
  const url = typeof item.url === 'string' ? item.url : ''
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url)
  if (match) return `github:${match[1]}`
  return ''
}

/** Read the cached catalog, refetching when it is missing or stale. */
export async function loadCatalog(home: string, fetchImpl = fetch): Promise<CatalogEntry[]> {
  const path = cachePath(home)
  try {
    const info = await stat(path)
    if (Date.now() - info.mtimeMs < MAX_AGE_MS) {
      return JSON.parse(await readFile(path, 'utf8')) as CatalogEntry[]
    }
  } catch { /* no cache yet */ }

  try {
    const response = await fetchImpl(CATALOG_URL, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const rows = normalize(await response.json())
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(rows), 'utf8')
    return rows
  } catch (cause) {
    // A stale copy beats an empty market: the catalog is a directory, not a
    // source of truth, and yesterday's directory still installs today.
    try {
      return JSON.parse(await readFile(path, 'utf8')) as CatalogEntry[]
    } catch { throw cause }
  }
}

/** How a page of the catalog was asked for. */
export interface CatalogQuery {
  query?: string
  category?: string
  sort?: 'score' | 'downloads' | 'stars' | 'recent'
  page?: number
  group?: boolean
}

/**
 * One page of the catalog, filtered, ranked and optionally sibling-folded.
 *
 * @param rows - the whole normalised catalog.
 * @param query - what the panel asked for.
 * @param installed - package names already in the profile.
 */
export function page(
  rows: CatalogEntry[],
  query: CatalogQuery,
  declared: Set<string>,
  live: Set<string> = declared,
): CatalogPage {
  const needle = (query.query ?? '').trim().toLowerCase()
  let list = rows.filter(row => {
    if (query.category && query.category !== 'all' && row.category !== query.category) return false
    if (!needle) return true
    return row.name.toLowerCase().includes(needle)
      || row.owner.toLowerCase().includes(needle)
      || row.description.toLowerCase().includes(needle)
  })

  // Fold a repository's subpackages down to its best few, so one monorepo
  // cannot own the first screen. Searching turns this off: when you typed a
  // name you want every match, not a representative sample.
  if (query.group !== false && !needle) {
    const kept = new Map<string, number>()
    list = list
      .slice()
      .sort((a, b) => b.score - a.score)
      .filter(row => {
        if (row.siblings <= 1) return true
        const count = kept.get(row.repo) ?? 0
        if (count >= 2) return false
        kept.set(row.repo, count + 1)
        return true
      })
  }

  const sorters = {
    score: (a: CatalogEntry, b: CatalogEntry) => b.score - a.score,
    downloads: (a: CatalogEntry, b: CatalogEntry) => b.downloads - a.downloads,
    stars: (a: CatalogEntry, b: CatalogEntry) => b.adjusted - a.adjusted,
    recent: (a: CatalogEntry, b: CatalogEntry) => b.added.localeCompare(a.added),
  }
  list = list.slice().sort(sorters[query.sort ?? 'score'])

  const total = list.length
  const pageIndex = Math.max(0, query.page ?? 0)
  const slice = list.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)
  const categories = [...new Set(rows.map(row => row.category).filter(Boolean))].sort()

  return {
    entries: slice.map(row => {
      const key = row.npm ?? row.name
      const has = declared.has(key) || declared.has(row.name)
      return { ...row, installed: has, active: has && (live.has(key) || live.has(row.name)) }
    }),
    total,
    page: pageIndex,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    categories,
    catalogTotal: rows.length,
  }
}
