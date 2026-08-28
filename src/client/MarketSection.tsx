/**
 * The market: what you can install, ranked so the first screen is worth
 * looking at.
 *
 * Two decisions carry this view, and both come from measuring the catalog
 * rather than from taste.
 *
 * **Sibling folding.** A star belongs to a repository; a monorepo emits one
 * catalog entry per subpackage off one star count. On the 2026-08-27
 * snapshot `dsh-plugins` contributes 34 entries off 8 stars and `dsh-web-ui`
 * 19 off 9, so an unfolded ranking hands the first screen to whoever split
 * their repo the most. Each repository keeps its best two here, and a row
 * says how many siblings it stood in for. Typing a search turns folding off,
 * because someone who typed a name wants every match.
 *
 * **Downloads over stars.** Downloads are counted per package, so a monorepo
 * cannot inflate them; they carry the larger weight. Stars still count,
 * divided by sibling count, because 57% of entries have no download figure
 * at all and would otherwise be unrankable.
 *
 * @module dsh-plugin-station/client/MarketSection
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogEntry, CatalogPage } from '../wire.ts'
import { RestartBar } from './RestartBar.tsx'
import { tok, type T } from './ui.tsx'

/** What the market calls back into the host with. */
export interface MarketApi {
  catalog: (query: { query?: string; category?: string; sort?: string; page?: number; featured?: boolean }) => Promise<CatalogPage>
  refreshCatalog: () => Promise<{ total: number }>
  addPlugin: (spec: string) => Promise<{ code: number; log: string; restartRequired?: boolean }>
  pendingRestart: () => Promise<{ added: string[]; removed: string[] }>
  restartHost: () => Promise<{ restarting: boolean }>
}

const SORTS = ['score', 'downloads', 'stars', 'recent'] as const

/** One installable row. */
function Card({ row, t, onInstall, busy, elapsed }: {
  row: CatalogEntry; t: T; busy: string; elapsed: number; onInstall: (row: CatalogEntry) => void
}) {
  return (
    <div className="dps-card dps-mkt">
      <div className="dps-row">
        <div className="dps-grow">
          <div className="dps-name">
            {row.name}
            {row.category ? <span className="dps-chip dps-cat">{row.category}</span> : null}
          </div>
          <div className="dps-dim dps-trunc">
            {row.owner}
            {row.downloads ? ` · ${tok(row.downloads)} ${t('downloads')}` : ''}
            {row.adjusted ? ` · ★ ${row.adjusted}` : ''}
            {row.siblings > 1 ? ` · ${t('ofSiblings', { n: row.siblings })}` : ''}
          </div>
        </div>
        <span className="dps-chip">{row.score}</span>
        {row.installed ? (
          // Declared but not yet live: the package is on disk and in the
          // patch, and its fiber only exists after a restart. Saying just
          // "installed" here would leave someone wondering why nothing
          // changed in the app.
          <span className={`dps-chip ${row.active ? 'dps-ok' : 'dps-warn'}`}>
            {row.active ? t('installed') : t('needsRestart')}
          </span>
        ) : (
          <button
            className="dps-btn"
            disabled={busy !== '' || !row.spec}
            title={row.spec || t('noSpec')}
            onClick={() => onInstall(row)}
          >{busy === row.full ? `${t("working")} ${elapsed}s` : t("install")}</button>
        )}
      </div>
      {row.why ? <p className="dps-why">{t(row.why as never)}</p> : null}
      {row.description ? <p className="dps-cd">{row.description}</p> : null}
      <div className="dps-mono dps-trunc dps-dim">{row.spec || t('noSpec')}</div>
    </div>
  )
}

/**
 * The market body.
 *
 * @param api - the host seam.
 * @param t - translator bound to this plugin's dictionary.
 * @param onInstalled - called after a successful install so the sibling
 *   "installed" view can refresh without owning this component's state.
 */
export function MarketSection({ api, t, onInstalled }: { api: MarketApi; t: T; onInstalled?: () => void }) {
  const [data, setData] = useState<CatalogPage | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<string>('score')
  const [pageIndex, setPageIndex] = useState(0)
  const [featured, setFeatured] = useState(true)
  const [busy, setBusy] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [restartNonce, setRestartNonce] = useState(0)
  const [log, setLog] = useState('')
  const [error, setError] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (patch: { query?: string; page?: number } = {}) => {
    try {
      const result = await api.catalog({
        query: patch.query ?? query, category, sort, page: patch.page ?? pageIndex, featured,
      })
      setData(result)
      setError('')
    } catch (cause) { setError(String(cause)) }
  }, [api, query, category, sort, pageIndex])

  useEffect(() => { void load() }, [category, sort, pageIndex, featured])

  // Typing hits the catalog on every keystroke otherwise, and the catalog is
  // a few thousand rows filtered on the host.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      // Typing is a request for the whole catalog, not for the shortlist.
      if (query.trim() !== '') setFeatured(false)
      setPageIndex(0); void load({ query, page: 0 })
    }, 220)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query])

  // A pnpm install can take a minute on a cold store, and a button that
  // says only "Working…" for that long is indistinguishable from a hang.
  useEffect(() => {
    if (busy === '') { setElapsed(0); return }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const install = async (row: CatalogEntry) => {
    setBusy(row.full); setLog('')
    try {
      // Same hazard as removal: installing rewrites the profile, the loader
      // re-applies the composition, and this plugin's entry can be rebuilt
      // mid-call. A lost reply is not a failed install, so the timer decides
      // when to stop waiting and the catalog re-read decides what happened.
      const result = await Promise.race([
        api.addPlugin(row.spec).catch(() => null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 90_000)),
      ])
      setLog(result ? (result.restartRequired ? `${result.log}\n\n${t('restartHint')}` : result.log) : t('replyLost'))
      await load(); setRestartNonce(n => n + 1); onInstalled?.()
    } catch (cause) { setLog(String(cause)) } finally { setBusy('') }
  }

  return (
    <div className="dps-root">
      <RestartBar api={api} t={t} nonce={restartNonce} />
      <div className="dps-bar">
        <div className="dps-switch">
          <button aria-pressed={featured} onClick={() => { setFeatured(true); setPageIndex(0) }}>{t('tabFeatured')}</button>
          <button aria-pressed={!featured} onClick={() => { setFeatured(false); setPageIndex(0) }}>{t('tabAll')}</button>
        </div>
        <input
          className="dps-input dps-grow"
          value={query}
          placeholder={t('marketSearch')}
          onChange={event => setQuery(event.target.value)}
        />
        <select className="dps-select" value={category} onChange={event => { setCategory(event.target.value); setPageIndex(0) }}>
          <option value="all">{t('allCategories')}</option>
          {(data?.categories ?? []).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select className="dps-select" value={sort} onChange={event => { setSort(event.target.value); setPageIndex(0) }}>
          {SORTS.map(key => <option key={key} value={key}>{t(`sort_${key}` as never)}</option>)}
        </select>
        <button className="dps-btn" onClick={async () => { await api.refreshCatalog(); await load() }}>{t('refresh')}</button>
      </div>

      {log ? <pre className="dps-log">{log}</pre> : null}
      {error ? <p className="dps-warn">{error}</p> : null}

      {data === null ? <p className="dps-hint">{t('loading')}</p> : (
        <>
          <div className="dps-count">
            {featured
              ? t('featuredCount', { n: data.total })
              : t('marketCount', { shown: data.total, all: data.catalogTotal })}
            {!featured && query.trim() === '' ? <span className="dps-dim"> · {t('foldedNote')}</span> : null}
          </div>
          {data.entries.map(row => (
            <Card key={row.full} row={row} t={t} busy={busy} elapsed={elapsed} onInstall={install} />
          ))}
          {data.entries.length === 0 ? <p className="dps-hint">{t('marketEmpty')}</p> : null}
          {data.pages > 1 ? (
            <div className="dps-actions">
              <button className="dps-btn" disabled={data.page === 0} onClick={() => setPageIndex(data.page - 1)}>{t('prev')}</button>
              <span className="dps-dim">{data.page + 1} / {data.pages}</span>
              <button className="dps-btn" disabled={data.page + 1 >= data.pages} onClick={() => setPageIndex(data.page + 1)}>{t('next')}</button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
