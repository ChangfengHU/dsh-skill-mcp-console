/**
 * Shared presentation pieces for both sections: the modal shell, the
 * four-state pill, the landing-check list, and the small formatters.
 *
 * @module dsh-skill-mcp/client/ui
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { SkillState, VerifyCheck } from '../wire.ts'
import type { ConsoleLocaleKey } from './locales.ts'

/** Bound translator handed down from the section. */
export type T = (key: ConsoleLocaleKey, params?: Record<string, string | number>) => string

/** Fill `{placeholders}` in a dictionary string. */
export function fill(text: string, params?: Record<string, string | number>): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole))
}

/** `2026/08/25`, or a dash when nothing could be stat'ed. */
export function when(ms: number): string {
  if (!ms) return '—'
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/** `412`, `4.2k`. */
export function tok(count: number): string {
  return count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`
}

/** The three states, in the order the menu lists them. */
export const STATES: SkillState[] = ['on', 'user-only', 'off']

/** Dictionary key for one state's short label. */
export function stateLabel(state: SkillState): ConsoleLocaleKey {
  return state === 'on' ? 'stateOn' : state === 'user-only' ? 'stateUserOnly' : 'stateOff'
}

/** CSS modifier for one state. */
export function stateClass(state: SkillState): string {
  return state === 'on' ? 'dsm-s-on' : state === 'user-only' ? 'dsm-s-user' : 'dsm-s-off'
}

/** Dictionary key for one state's one-line explanation. */
function stateLegend(state: SkillState): ConsoleLocaleKey {
  return state === 'on' ? 'legendOn' : state === 'user-only' ? 'legendUserOnly' : 'legendOff'
}

/**
 * The state control: a pill that opens a menu of the three states, each with
 * the sentence that says what it does.
 *
 * It used to cycle on click, which meant up to three blind presses to reach
 * the state you wanted and no way to see what the others were without
 * pressing them — and two of these states edit a file on disk.
 */
export function StatePill({ state, t, onChange, busy }: { state: SkillState; t: T; onChange: (next: SkillState) => void; busy?: boolean }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!at) return
    const close = () => setAt(null)
    document.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [at])

  return (
    <span className="dsm-state-wrap">
      <button
        type="button"
        className={`dsm-state ${stateClass(state)}`}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        title={t(stateLegend(state))}
        onClick={event => {
          event.stopPropagation()
          if (at) { setAt(null); return }
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                setAt({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 268) })
        }}
      >{busy ? '…' : t(stateLabel(state))}</button>
      {at ? (
        <div className="dsm-state-menu" role="menu" style={{ top: at.top, left: Math.max(8, at.left) }} onClick={event => event.stopPropagation()}>
          {STATES.map(option => (
            <button
              key={option}
              role="menuitemradio"
              aria-current={option === state}
              onClick={() => { setAt(null); if (option !== state) onChange(option) }}
            >
              <i className={stateClass(option)}>{t(stateLabel(option))}</i>
              <small>{t(stateLegend(option))}</small>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}

/** Modal shell: scrim, escape, click-outside, and a titled card. */
export function Modal({ title, lead, onClose, children, wide }: {
  title: string
  lead?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dsm-scrim" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`dsm-modal${wide ? ' dsm-wide' : ''}`} role="dialog" aria-label={title}>
        <div className="dsm-modal-head">
          <div>
            <h4>{title}</h4>
            {lead ? <p>{lead}</p> : null}
          </div>
          <button className="dsm-x" onClick={onClose} aria-label={title}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** The four landing checks, rendered as pass/fail rows. */
export function VerifyList({ checks, t }: { checks: VerifyCheck[]; t: T }) {
  const label: Record<VerifyCheck['key'], ConsoleLocaleKey> = {
    skillMd: 'vSkillMd', frontmatter: 'vFrontmatter', executable: 'vExecutable', registry: 'vRegistry',
  }
  return (
    <div className="dsm-verify">
      <b>{t('verifyTitle')} <span className="dsm-vsub">— {t('verifyLead')}</span></b>
      {checks.map(check => (
        <div key={check.key} className={`dsm-v ${check.ok ? 'dsm-v-ok' : 'dsm-v-bad'}`}>
          <span className="dsm-vi">{check.ok ? '✓' : '✗'}</span>
          <span>{t(label[check.key])}{check.detail ? ` — ${check.detail}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

/** A bordered log block. */
export function LogBox({ title, text, badge }: { title: string; text: string; badge?: string }) {
  return (
    <div className="dsm-pane">
      <div className="dsm-pane-bar">
        <span>{title}</span>
        {badge ? <span className="dsm-chip" style={{ marginLeft: 'auto' }}>{badge}</span> : null}
      </div>
      <pre className="dsm-pre">{text}</pre>
    </div>
  )
}
