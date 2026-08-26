/**
 * The Skills section.
 *
 * Grouped by skill NAME rather than by root, because the question this
 * panel exists to answer is "which copy of `fleet-proxy-switch` is dsh
 * actually running" — and sorting by root puts the two copies four rows
 * apart where nobody connects them. A shadowed row is dimmed, badged, and
 * says which root beat it.
 *
 * @module dsh-skill-mcp-console/client/SkillsSection
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillRow, SkillState } from '../wire.ts'
import { AiFlow, CreateFlow, DirectoryFlow, InstallFlow, UploadFlow, type InstallApi } from './AddFlows.tsx'
import type { ConsoleLocaleKey } from './locales.ts'
import { StatePill, VerifyList, fill, tok, when, type T } from './ui.tsx'

/** What the section calls back into the host with. */
export interface SkillsApi extends InstallApi {
  skills: () => Promise<SkillRow[]>
  skillFile: (dir: string, path: string) => Promise<string>
  setSkillState: (dir: string, state: SkillState) => Promise<void>
  removeSkill: (dir: string) => Promise<string>
  /** Put text into the chat composer; false when this build has no composer seam. */
  insertPrompt: (text: string) => boolean
}

/** Dictionary key for one problem code. */
const PROBLEM: Record<string, ConsoleLocaleKey> = {
  noSkillMd: 'problemNoSkillMd',
  noName: 'problemNoName',
  nameMismatch: 'problemNameMismatch',
  noDescription: 'problemNoDescription',
  unreadable: 'problemUnreadable',
}

/** One skill's files and their contents. */
function Detail({ skill, api, t, onBack, onChanged }: {
  skill: SkillRow; api: SkillsApi; t: T; onBack: () => void; onChanged: () => void
}) {
  const [path, setPath] = useState(skill.files.includes('SKILL.md') ? 'SKILL.md' : (skill.files[0] ?? ''))
  const [text, setText] = useState('')
  const [raw, setRaw] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!path) return
    let live = true
    setError('')
    api.skillFile(skill.dir, path)
      .then(content => { if (live) setText(content) })
      .catch((cause: Error) => { if (live) setError(cause.message) })
    return () => { live = false }
  }, [api, skill.dir, path])

  // The rendered view strips the frontmatter fence: it is metadata the panel
  // already shows above, and leaving it in makes every skill open on YAML.
  const body = useMemo(() => {
    if (raw || !text.startsWith('---')) return text
    const close = text.indexOf('\n---', 3)
    return close === -1 ? text : text.slice(close + 4).replace(/^\n+/, '')
  }, [text, raw])

  return (
    <div className="smc-root">
      <button className="smc-back" onClick={onBack}>‹ {t('back')}</button>
      <div className="smc-head">
        <div>
          <h3 className="smc-name">/{skill.id}</h3>
          <div className="smc-mono">{skill.root}/{skill.id} · {skill.origin} · {when(skill.updatedAt)}</div>
        </div>
        <div className="smc-spacer" />
        <StatePill
          state={skill.state}
          t={t}
          busy={busy}
          onChange={next => {
            setBusy(true)
            api.setSkillState(skill.dir, next).then(onChanged).catch((cause: Error) => setError(cause.message)).finally(() => setBusy(false))
          }}
        />
        <button
          className="smc-btn"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            api.removeSkill(skill.dir)
              .then(trash => { setError(fill(t('removed'), { path: trash })); onChanged(); onBack() })
              .catch((cause: Error) => setError(cause.message))
              .finally(() => setBusy(false))
          }}
        >{t('remove')}</button>
      </div>

      {skill.shadowedBy ? <div className="smc-warnbox">{fill(t('shadowedNote'), { root: skill.shadowedBy })}</div> : null}
      {skill.problem ? <div className="smc-warnbox">{t(PROBLEM[skill.problem] ?? 'problemUnreadable')}</div> : null}
      {!skill.native ? <div className="smc-hint">{t('nonNative')}</div> : null}
      {skill.description ? <p className="smc-lede">{skill.description}</p> : null}
      {skill.originalDescription ? (
        <p className="smc-hint">
          {t('stateNameOnly')} — {t('legendNameOnly')} · {tok(skill.fullTokens - skill.tokens)} tok {t('saved')}
        </p>
      ) : null}

      <div className="smc-detail">
        <div className="smc-tree">
          {skill.files.map(file => (
            <button key={file} aria-current={file === path} onClick={() => setPath(file)}>{file}</button>
          ))}
          {skill.files.length === 0 ? <div className="smc-hint" style={{ padding: 8 }}>{t('emptyDir')}</div> : null}
        </div>
        <div className="smc-pane">
          <div className="smc-pane-bar">
            <span>{path || '—'}</span>
            <div className="smc-seg">
              <button aria-selected={!raw} onClick={() => setRaw(false)} title={t('rendered')}>👁</button>
              <button aria-selected={raw} onClick={() => setRaw(true)} title={t('source')}>&lt;/&gt;</button>
              <button
                title={t('copy')}
                onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              >{copied ? '✓' : '⧉'}</button>
            </div>
          </div>
          {error ? <div className="smc-err" style={{ margin: 12 }}>{error}</div> : <pre className="smc-pre">{body}</pre>}
        </div>
      </div>
    </div>
  )
}

/** The Skills settings section. */
export function SkillsSection({ api, t }: { api: SkillsApi; t: T }) {
  const [rows, setRows] = useState<SkillRow[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'problems' | 'shadowed'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [busyDir, setBusyDir] = useState('')
  const [flow, setFlow] = useState<'' | 'install' | 'upload' | 'create' | 'ai' | 'directory'>('')
  const [seed, setSeed] = useState('')
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null)

  const load = useCallback(() => {
    setError('')
    api.skills().then(setRows).catch((cause: Error) => setError(cause.message))
  }, [api])

  useEffect(load, [load])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    // The settings panel scrolls under a fixed menu, so close rather than
    // let it drift away from the button it belongs to.
    window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [menu])

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = query.trim().toLowerCase()
    return rows
      .filter(row => filter !== 'problems' || row.problem)
      .filter(row => filter !== 'shadowed' || row.shadowedBy)
      .filter(row => !needle
        || row.id.toLowerCase().includes(needle)
        || row.description.toLowerCase().includes(needle)
        || row.origin.includes(needle))
      // Group by name so the copies of one skill sit together and the
      // shadowing is visible; within a name, the winning root comes first.
      .sort((a, b) => a.id.localeCompare(b.id)
        || Number(Boolean(a.shadowedBy)) - Number(Boolean(b.shadowedBy)))
  }, [rows, query, filter])

  const current = rows?.find(row => row.dir === open) ?? null
  if (current) {
    return <Detail skill={current} api={api} t={t} onBack={() => setOpen(null)} onChanged={load} />
  }

  const problems = rows?.filter(row => row.problem).length ?? 0
  const shadowed = rows?.filter(row => row.shadowedBy).length ?? 0
  const resident = rows?.filter(row => !row.shadowedBy && row.state !== 'off' && row.state !== 'user-only')
    .reduce((sum, row) => sum + row.tokens, 0) ?? 0
  const savings = rows?.reduce((sum, row) => sum + Math.max(0, row.fullTokens - row.tokens), 0) ?? 0

  const changeState = (row: SkillRow, next: SkillState) => {
    setBusyDir(row.dir)
    api.setSkillState(row.dir, next).then(load).catch((cause: Error) => setError(cause.message)).finally(() => setBusyDir(''))
  }

  return (
    <div className="smc-root">
      <div className="smc-head">
        <div>
          <h3>{t('skillsTitle')}</h3>
          <p>{t('skillsLead')}</p>
        </div>
        <div className="smc-spacer" />
        <button className="smc-btn" onClick={() => setFlow('directory')}>{t('browse')}</button>
        <div className="smc-menu">
          <button
            className="smc-btn smc-primary"
            aria-expanded={menu !== null}
            onClick={event => {
              event.stopPropagation()
              if (menu) { setMenu(null); return }
              // Fixed to the viewport, measured off the button. Positioned
              // absolutely it was clipped by the settings panel's own
              // overflow, which cut the left half off every item.
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
              setMenu({ top: rect.bottom + 5, right: Math.max(8, window.innerWidth - rect.right) })
            }}
          >{t('add')} ▾</button>
          {menu ? (
            <div
              className="smc-menu-list"
              style={{ top: menu.top, right: menu.right }}
              onClick={event => event.stopPropagation()}
            >
              <button onClick={() => { setSeed(''); setFlow('install'); setMenu(null) }}><span className="smc-g">$</span>{t('addCommand')}</button>
              <button onClick={() => { setFlow('upload'); setMenu(null) }}><span className="smc-g">↑</span>{t('addUpload')}</button>
              <button onClick={() => { setFlow('create'); setMenu(null) }}><span className="smc-g">✎</span>{t('addCreate')}</button>
              <button onClick={() => { setFlow('ai'); setMenu(null) }}><span className="smc-g">✳</span>{t('addAi')}</button>
              <hr />
              <button onClick={() => { setFlow('directory'); setMenu(null) }}><span className="smc-g">⌂</span>{t('addDirectory')}</button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="smc-err">{error}</div> : null}

      <div className="smc-bar">
        <input className="smc-input" placeholder={t('search')} aria-label={t('search')} value={query} onChange={event => setQuery(event.target.value)} />
        <div className="smc-switch">
          <button aria-selected={filter === 'all'} onClick={() => setFilter('all')}>{t('filterAll')}</button>
          <button aria-selected={filter === 'problems'} onClick={() => setFilter('problems')}>{t('filterProblems')} {problems}</button>
          <button aria-selected={filter === 'shadowed'} onClick={() => setFilter('shadowed')}>{t('filterShadowed')} {shadowed}</button>
        </div>
        <button className="smc-btn" onClick={load}>{t('rescan')}</button>
      </div>

      <div className="smc-bar">
        <span>{rows === null ? '…' : <><b>{rows.length}</b> {t('countSkills')}</>}</span>
        <span className="smc-budget">
          <span className="smc-bl">{t('resident')} {t('approx')}</span>
          <b>{tok(resident)}</b> tok
          {savings > 0 ? <span className="smc-bd">↓{tok(savings)}</span> : null}
        </span>
      </div>

      {rows !== null && shown.length === 0
        ? <div className="smc-empty">{rows.length === 0 ? t('noSkills') : t('noMatch')}</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table className="smc-table">
              <thead>
                <tr>
                  <th>{t('colSkill')}</th><th>{t('colState')}</th><th>{t('colCost')}</th><th>{t('colSource')}</th><th>{t('colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(row => (
                  <tr
                    key={row.dir}
                    className={`smc-click${row.shadowedBy || row.state === 'off' ? ' smc-dim' : ''}`}
                    onClick={() => setOpen(row.dir)}
                  >
                    <td>
                      <div className="smc-name">
                        /{row.id}
                        {row.shadowedBy ? <span className="smc-chip smc-warn" style={{ marginLeft: 7 }}>{t('filterShadowed')}</span> : null}
                        {!row.native ? <span className="smc-chip" style={{ marginLeft: 7 }}>bridge</span> : null}
                      </div>
                      {row.description ? <div className="smc-desc">{row.description}</div> : null}
                      {row.shadowedBy ? <div className="smc-problem">{fill(t('shadowedNote'), { root: row.shadowedBy })}</div> : null}
                      {row.problem ? <div className="smc-problem">{t(PROBLEM[row.problem] ?? 'problemUnreadable')}</div> : null}
                    </td>
                    <td><StatePill state={row.state} t={t} busy={busyDir === row.dir} onChange={next => changeState(row, next)} /></td>
                    <td className="smc-tok">
                      <b>{row.tokens}</b><span>tok</span>
                      {row.fullTokens > row.tokens ? <em>{t('saved')} {row.fullTokens - row.tokens}</em> : null}
                    </td>
                    <td className="smc-mono">{row.root}</td>
                    <td className="smc-mono">{when(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div className="smc-legend">
        <span><i className="smc-s-on">{t('stateOn')}</i> {t('legendOn')}</span>
        <span><i className="smc-s-name">{t('stateNameOnly')}</i> {t('legendNameOnly')}</span>
        <span><i className="smc-s-user">{t('stateUserOnly')}</i> {t('legendUserOnly')}</span>
        <span><i className="smc-s-off">{t('stateOff')}</i> {t('legendOff')}</span>
      </div>

      {flow === 'install' ? <InstallFlow api={api} t={t} seed={seed} onClose={() => setFlow('')} onDone={load} /> : null}
      {flow === 'upload' ? <UploadFlow api={api} t={t} onClose={() => setFlow('')} onDone={load} /> : null}
      {flow === 'create' ? <CreateFlow api={api} t={t} onClose={() => setFlow('')} onDone={load} /> : null}
      {flow === 'ai' ? <AiFlow t={t} onClose={() => setFlow('')} onInsert={api.insertPrompt} /> : null}
      {flow === 'directory' ? (
        <DirectoryFlow api={api} t={t} onClose={() => setFlow('')} onInstall={install => { setSeed(install); setFlow('install') }} />
      ) : null}
    </div>
  )
}

export { VerifyList }
