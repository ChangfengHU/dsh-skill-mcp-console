/**
 * The MCP section: servers, their real tool inventory, and the whole
 * configuration as the universal `mcpServers` document you can edit.
 *
 * No connection dot. dsh's official MCP client exposes no status seam, so a
 * green light would be invented; the row shows what is knowable — the
 * entry's disabled flag, its cordis fiber phase, and the tools that actually
 * exist. Tools carry their own schema cost, because "which of these do I
 * still want in every request" is a question you can only answer with the
 * number in front of you.
 *
 * @module dsh-skill-mcp/client/McpSection
 */

import { useCallback, useEffect, useState } from 'react'
import type { McpRow } from '../wire.ts'
import { fill, tok, type T } from './ui.tsx'

/** What the section calls back into the host with. */
export interface McpApi {
  mcp: () => Promise<McpRow[]>
  mcpJson: () => Promise<string>
  saveMcpJson: (text: string) => Promise<{ added: string[]; updated: string[]; removed: string[]; backup: string }>
  setMcpDisabled: (name: string, disabled: boolean) => Promise<void>
  setToolDisabled: (server: string, tool: string, disabled: boolean) => Promise<void>
}

/** One server row with its tool inventory. */
function ServerCard({ row, api, t, onChanged }: { row: McpRow; api: McpApi; t: T; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')

  return (
    <div className={`dsm-card${row.disabled ? ' dsm-card-off' : ''}`}>
      <div className="dsm-row">
        <button
          className="dsm-caret"
          aria-expanded={open}
          aria-label={row.name}
          onClick={() => setOpen(value => !value)}
        >{open ? '▼' : '▶'}</button>
        <div className="dsm-grow">
          <div className="dsm-name">{row.name}</div>
          <div className="dsm-mono dsm-trunc">{row.transport}{row.target ? ` · ${row.target}` : ''}</div>
        </div>
        <span className="dsm-chip">{tok(row.tokens)} tok</span>
        <span className={`dsm-chip ${row.tools.length ? 'dsm-ok' : 'dsm-warn'}`}>{row.tools.length} {t('tools')}</span>
        {row.fiber ? <span className={`dsm-chip ${row.fiber === 'failed' ? 'dsm-warn' : ''}`}>{row.fiber}</span> : null}
        <button
          className="dsm-toggle"
          aria-pressed={!row.disabled}
          aria-label={row.name}
          disabled={busy === 'server' || !row.entryId}
          onClick={() => {
            setBusy('server')
            api.setMcpDisabled(row.name, !row.disabled).then(onChanged).finally(() => setBusy(''))
          }}
        />
      </div>
      {open ? (
        <div className="dsm-tools">
          {row.tools.length === 0
            ? <div className="dsm-tool"><span>{t('noTools')}</span></div>
            : row.tools.map(tool => (
              <div className={`dsm-tool${tool.disabled ? ' dsm-dim' : ''}`} key={tool.name}>
                <code>mcp__{row.name}__{tool.name}</code>
                <span className="dsm-trunc">{tool.description}</span>
                <span className="dsm-ttok">{tool.tokens} tok</span>
                <button
                  className="dsm-tool-toggle"
                  aria-pressed={!tool.disabled}
                  aria-label={tool.name}
                  disabled={busy === tool.name}
                  onClick={() => {
                    setBusy(tool.name)
                    api.setToolDisabled(row.name, tool.name, !tool.disabled).then(onChanged).finally(() => setBusy(''))
                  }}
                />
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}

/** The MCP settings section. */
export function McpSection({ api, t }: { api: McpApi; t: T }) {
  const [view, setView] = useState<'list' | 'json'>('list')
  const [rows, setRows] = useState<McpRow[] | null>(null)
  const [json, setJson] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError('')
    api.mcp().then(setRows).catch((cause: Error) => setError(cause.message))
    api.mcpJson().then(text => { setJson(text); setDraft(text) }).catch((cause: Error) => setError(cause.message))
  }, [api])

  useEffect(load, [load])

  const save = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.saveMcpJson(draft)
      setNotice(fill(t('savedOk'), {
        added: result.added.join(', ') || '—',
        updated: result.updated.join(', ') || '—',
        removed: result.removed.join(', ') || '—',
        backup: result.backup,
      }))
      load()
    } catch (cause) {
      setError((cause as Error).message)
    } finally { setBusy(false) }
  }

  const toolCount = rows?.reduce((total, row) => total + row.tools.length, 0) ?? 0
  const resident = rows?.filter(row => !row.disabled).reduce((total, row) => total + row.tokens, 0) ?? 0

  return (
    <div className="dsm-root">
      <div className="dsm-head">
        <div>
          <h3>{t('mcpTitle')}</h3>
          <p>{t('mcpLead')}</p>
        </div>
        <div className="dsm-spacer" />
        <div className="dsm-switch" role="tablist">
          <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>{t('list')}</button>
          <button role="tab" aria-selected={view === 'json'} onClick={() => setView('json')}>{t('json')}</button>
        </div>
      </div>

      {error ? <div className="dsm-err">{error}</div> : null}
      {notice ? <div className="dsm-okbox">{notice}<br />{t('restartNote')}</div> : null}

      {view === 'list' ? (
        <>
          <div className="dsm-bar">
            <span>{rows === null ? '…' : <><b>{rows.length}</b> {t('servers')} · <b>{toolCount}</b> {t('tools')}</>}</span>
            <span className="dsm-budget">
              <span className="dsm-bl">{t('resident')} {t('approx')}</span><b>{tok(resident)}</b> tok
            </span>
            <span className="dsm-spacer" />
            <button className="dsm-btn" onClick={load}>{t('refresh')}</button>
          </div>
          {rows !== null && rows.length === 0
            ? <div className="dsm-empty">{t('noServers')}</div>
            : rows?.map(row => <ServerCard key={row.entryId || row.name} row={row} api={api} t={t} onChanged={load} />)}
        </>
      ) : (
        <>
          <div className="dsm-bar"><span>{t('jsonLead')}</span></div>
          <div className="dsm-bar">
            <span className="dsm-chip dsm-warn">{t('jsonMasked')}</span>
            <span className="dsm-spacer" />
            <button className="dsm-btn" disabled={busy || draft === json} onClick={() => setDraft(json)}>{t('revert')}</button>
            <button className="dsm-btn dsm-primary" disabled={busy || draft === json} onClick={() => void save()}>{t('save')}</button>
          </div>
          <textarea
            className="dsm-editor"
            spellCheck={false}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            aria-label="mcpServers"
          />
        </>
      )}
    </div>
  )
}
