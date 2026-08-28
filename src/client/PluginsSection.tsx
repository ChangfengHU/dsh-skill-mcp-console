/**
 * The code-plugin tab: the packages installed into this profile.
 *
 * This registers into `settings.plugins.tab` rather than adding another
 * top-level entry — code plugins belong on the Plugins page, and the Host
 * publishes that slot precisely so a package can add a tab there.
 *
 * It shows what the Host's own Plugin list cannot. That list is one row per
 * composition entry, and a composition is overwhelmingly the Host: measured
 * on the deployment this was written against, 153 entries of which 3 came
 * from a package anyone chose to install. So the default here is inverted —
 * your packages, grouped by package, with the Host's entries counted and
 * folded away — and the state shown is the fiber phase rather than the
 * disabled flag, because "enabled and failed" is the case worth seeing and
 * the one a two-state column cannot say.
 *
 * @module dsh-plugin-station/client/PluginsSection
 */

import { useCallback, useEffect, useState } from 'react'
import type { PackageRow } from '../wire.ts'
import { RestartBar } from './RestartBar.tsx'
import type { T } from './ui.tsx'

/** What this tab calls back into the host with. */
export interface PluginsApi {
  codePlugins: () => Promise<{ installed: PackageRow[]; builtinEntries: number; builtinPackages: number; profile: string }>
  setPluginDisabled: (entryId: string, disabled: boolean) => Promise<void>
  removePlugin: (name: string) => Promise<{ code: number; log: string; mustRestart?: boolean }>
  addPlugin: (spec: string) => Promise<{ code: number; log: string }>
  pendingRestart: () => Promise<{ added: string[]; removed: string[] }>
  restartHost: () => Promise<{ restarting: boolean }>
}

/** Phases that mean the entry is not doing its job. */
const BROKEN = new Set(['failed', 'disposed'])

/** One installed package and everything it put into the composition. */
function PackageCard({ row, api, t, onChanged, onRemoved }: {
  row: PackageRow; api: PluginsApi; t: T; onChanged: () => void; onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [confirming, setConfirming] = useState(false)

  const broken = row.entries.filter(entry => entry.fiber !== null && BROKEN.has(entry.fiber))
  const off = row.entries.length > 0 && row.entries.every(entry => entry.disabled)

  return (
    <div className={`dps-card${off ? ' dps-card-off' : ''}`}>
      <div className="dps-row">
        <button
          className="dps-caret"
          aria-expanded={open}
          aria-label={row.name}
          onClick={() => setOpen(value => !value)}
        >{open ? '▼' : '▶'}</button>
        <div className="dps-grow">
          <div className="dps-name">{row.name}{row.version ? <span className="dps-dim"> {row.version}</span> : null}</div>
          <div className="dps-mono dps-trunc">{row.source || '—'}</div>
        </div>
        {!row.bundled ? <span className="dps-chip dps-warn">{t('notAPlugin')}</span> : null}
        {row.hasClient ? <span className="dps-chip">{t('hasClient')}</span> : null}
        <span className="dps-chip">{row.entries.length} {t(row.entries.length === 1 ? 'entryOne' : 'entries')}</span>
        {broken.length ? <span className="dps-chip dps-warn">{broken[0]!.fiber}</span> : null}
        <span className="dps-dim dps-state">{off ? t('disabled') : t('enabled')}</span>
        <button
          className="dps-toggle"
          aria-pressed={!off}
          aria-label={row.name}
          disabled={busy !== '' || row.entries.length === 0}
          onClick={async () => {
            setBusy('toggle')
            try {
              for (const entry of row.entries) await api.setPluginDisabled(entry.id, !off)
              onChanged()
            } finally { setBusy('') }
          }}
        />
      </div>

      {open ? (
        <div className="dps-body">
          {row.description ? <p className="dps-hint">{row.description}</p> : null}
          <table className="dps-table">
            <thead><tr><th>{t('entryId')}</th><th>{t('module')}</th><th>{t('state')}</th></tr></thead>
            <tbody>
              {row.entries.map(entry => (
                <tr key={entry.id}>
                  <td className="dps-mono">{entry.id}</td>
                  <td className="dps-mono dps-trunc">{entry.module}</td>
                  <td>
                    <span className={`dps-chip ${entry.fiber && BROKEN.has(entry.fiber) ? 'dps-warn' : entry.disabled ? '' : 'dps-ok'}`}>
                      {entry.disabled ? t('disabled') : (entry.fiber ?? '—')}
                    </span>
                  </td>
                </tr>
              ))}
              {row.entries.length === 0 ? (
                <tr><td colSpan={3} className="dps-hint">{t('noEntries')}</td></tr>
              ) : null}
            </tbody>
          </table>
          <div className="dps-actions">
            {confirming ? (
              <>
                <span className="dps-hint">{t('removeConfirmRestart')}</span>
                <button className="dps-btn" onClick={() => setConfirming(false)}>{t('cancel')}</button>
                <button
                  className="dps-btn dps-danger"
                  disabled={busy !== ''}
                  onClick={async () => {
                    setBusy('remove')
                    // The reply cannot be relied on. Removing a package
                    // rewrites the profile, the loader re-applies the
                    // composition, and this plugin's own entry is rebuilt
                    // along with everything else — so the in-flight call is
                    // killed by the very work it asked for. Waiting on it
                    // leaves the button saying "Working…" forever, which is
                    // what it did.
                    //
                    // Racing a short timer covers both outcomes: a reply
                    // that arrives, and one that never can. Either way the
                    // removal has been ordered and the restart is what
                    // makes the result true, so both paths end there.
                    try {
                      void api.removePlugin(row.name).catch(() => null)
                      // Restarting the moment the call is made kills the
                      // package manager mid-removal: the profile is already
                      // rewritten, so the menus go, while node_modules keeps
                      // the files. So watch the profile instead of the
                      // clock, and only restart once the package is really
                      // gone from it.
                      const gone = async () => {
                        try {
                          const now = await api.codePlugins()
                          return !now.installed.some(p => p.name === row.name)
                        } catch { return false }
                      }
                      const deadline = Date.now() + 90_000
                      while (Date.now() < deadline && !(await gone())) {
                        await new Promise(resolve => setTimeout(resolve, 1500))
                      }
                    } finally {
                      setBusy(''); setConfirming(false); onChanged(); onRemoved()
                    }
                  }}
                >{busy === 'remove' ? t('working') : t('remove')}</button>
              </>
            ) : (
              <button className="dps-btn" onClick={() => setConfirming(true)}>{t('remove')}</button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The tab body.
 *
 * @param api - the host seam.
 * @param t - translator bound to this plugin's dictionary.
 */
export function PluginsSection({ api, t }: { api: PluginsApi; t: T }) {
  const [rows, setRows] = useState<PackageRow[] | null>(null)
  const [meta, setMeta] = useState({ builtinEntries: 0, builtinPackages: 0, profile: '' })
  const [error, setError] = useState('')
  const [spec, setSpec] = useState('')
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
  const [restartNonce, setRestartNonce] = useState(0)
  const [autoRestart, setAutoRestart] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api.codePlugins()
      setRows(result.installed)
      setMeta({ builtinEntries: result.builtinEntries, builtinPackages: result.builtinPackages, profile: result.profile })
      setError('')
    } catch (cause) { setError(String(cause)) }
  }, [api])

  useEffect(() => { void load() }, [load])

  return (
    <div className="dps-root">
      <RestartBar api={api} t={t} nonce={restartNonce} auto={autoRestart} />
      <p className="dps-hint">{t('pluginsBlurb')}</p>

      <div className="dps-bar">
        <input
          className="dps-input dps-grow"
          value={spec}
          placeholder={t('addPluginPlaceholder')}
          onChange={event => setSpec(event.target.value)}
        />
        <button
          className="dps-btn dps-primary"
          disabled={busy || spec.trim() === ''}
          onClick={async () => {
            setBusy(true); setLog('')
            try {
              const result = await api.addPlugin(spec.trim())
              setLog(result.log)
              if (result.code === 0) { setSpec(''); await load(); setRestartNonce(n => n + 1) }
            } catch (cause) { setLog(String(cause)) } finally { setBusy(false) }
          }}
        >{busy ? t('working') : t('install')}</button>
      </div>

      {log ? <pre className="dps-log">{log}</pre> : null}
      {error ? <p className="dps-warn">{error}</p> : null}

      {rows === null ? <p className="dps-hint">{t('loading')}</p> : (
        <>
          <div className="dps-count">
            {rows.length} {t('yourPlugins')}
            {meta.profile ? <span className="dps-dim"> · {t('profile')} {meta.profile}</span> : null}
          </div>
          {rows.map(row => (
            <PackageCard key={row.name} row={row} api={api} t={t}
              onChanged={() => void load()} onRemoved={() => setAutoRestart(true)} />
          ))}
          {rows.length === 0 ? <p className="dps-hint">{t('noPlugins')}</p> : null}
          <p className="dps-hint">{t('builtinFolded', { entries: meta.builtinEntries, packages: meta.builtinPackages })}</p>
        </>
      )}
    </div>
  )
}
