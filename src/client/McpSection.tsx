/**
 * The MCP section: configured servers, the tools they actually registered,
 * and the same configuration rendered as the universal `mcpServers` document.
 *
 * Two things this deliberately does not do. It shows no connection dot — the
 * official client exposes no status seam, so a green light here would be
 * invented. And the JSON view is read-only in this version: translating
 * `mcpServers` back into cordis patch entries is the write path, and shipping
 * a Save button before that round-trip is proven would risk the one file that
 * holds every server's credentials.
 *
 * @module dsh-skill-mcp-console/client/McpSection
 */

import { useCallback, useEffect, useState } from 'react'
import type { McpRow } from '../wire.ts'

/** What the section calls back into the host with. */
export interface McpApi {
  mcp: () => Promise<McpRow[]>
  mcpJson: () => Promise<string>
}

/** One server row with its tool inventory. */
function ServerCard({ row }: { row: McpRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="smc-card">
      <div className="smc-row">
        <button
          className="smc-caret"
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'} ${row.name} 的工具`}
          onClick={() => setOpen(value => !value)}
        >{open ? '▼' : '▶'}</button>
        <div className="smc-grow">
          <div className="smc-name">{row.name}</div>
          <div className="smc-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.transport}{row.target ? ` · ${row.target}` : ''}
          </div>
        </div>
        <span className={`smc-chip ${row.tools.length ? 'smc-ok' : 'smc-warn'}`}>
          {row.tools.length} tools
        </span>
        {row.disabled ? <span className="smc-chip smc-off">disabled</span> : null}
        {row.fiber ? <span className="smc-chip">{row.fiber}</span> : null}
      </div>
      {open ? (
        <div className="smc-tools">
          {row.tools.length === 0
            ? <div className="smc-tool"><span>这个服务器没有注册任何工具——通常是没连上,或者配置里的 serverName 和实际不一致。</span></div>
            : row.tools.map(tool => (
              <div className="smc-tool" key={tool.name}>
                <code>mcp__{row.name}__{tool.name}</code>
                <span>{tool.description}</span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}

/** The MCP settings section. */
export function McpSection({ api }: { api: McpApi }) {
  const [view, setView] = useState<'list' | 'json'>('list')
  const [rows, setRows] = useState<McpRow[] | null>(null)
  const [json, setJson] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setError('')
    api.mcp().then(setRows).catch((cause: Error) => setError(cause.message))
    api.mcpJson().then(setJson).catch((cause: Error) => setError(cause.message))
  }, [api])

  useEffect(load, [load])

  const copy = () => {
    void navigator.clipboard?.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  const toolCount = rows?.reduce((total, row) => total + row.tools.length, 0) ?? 0

  return (
    <div className="smc-root">
      <div className="smc-head">
        <div>
          <h3>MCP</h3>
          <p>这个部署连着哪些 MCP 服务器,以及每个服务器实际交给模型的工具。</p>
        </div>
        <div className="smc-spacer" />
        <div className="smc-switch" role="tablist">
          <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>List</button>
          <button role="tab" aria-selected={view === 'json'} onClick={() => setView('json')}>JSON</button>
        </div>
      </div>

      {error ? <div className="smc-err">{error}</div> : null}

      {view === 'list' ? (
        <>
          <div className="smc-bar">
            <span>{rows === null ? '读取中…' : <><b>{rows.length}</b> 个服务器 · <b>{toolCount}</b> 个工具</>}</span>
            <span className="smc-spacer" />
            <button className="smc-btn" onClick={load}>刷新</button>
          </div>
          {rows !== null && rows.length === 0
            ? <div className="smc-empty">这个 profile 里没有配置 MCP 服务器。</div>
            : rows?.map(row => <ServerCard key={row.entryId || row.name} row={row} />)}
        </>
      ) : (
        <>
          <div className="smc-bar">
            <span>这是通用的 <code>mcpServers</code> 格式——Cursor、Claude Desktop 和大多数 MCP 文档写的都是它。dsh 内部存的是 cordis 补丁条目,这里替你翻译过来。</span>
          </div>
          <div className="smc-bar">
            <span className="smc-chip smc-warn">本版只读</span>
            <span>凭据已脱敏,不会显示明文。</span>
            <span className="smc-spacer" />
            <button className="smc-btn" onClick={copy}>{copied ? '已复制' : '复制'}</button>
            <button className="smc-btn" onClick={load}>刷新</button>
          </div>
          <div className="smc-pane">
            <div className="smc-pane-bar"><span>mcpServers</span></div>
            <pre className="smc-pre">{json || '读取中…'}</pre>
          </div>
        </>
      )}
    </div>
  )
}
