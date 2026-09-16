import { useState } from 'react'
import type { AppPreview } from '../wire.ts'

export interface AppsApi {
  inspectApp: (input: string) => Promise<AppPreview>
  installApp: (previewId: string) => Promise<{ app: AppPreview; checks: { name: string; ok: boolean; detail: string }[] }>
}

function PartList({ title, items }: { title: string; items: { name: string }[] }) {
  return (
    <div className="dsm-app-part">
      <div><b>{title}</b><span>{items.length}</span></div>
      {items.length ? <ul>{items.map(item => <li key={item.name}><code>{item.name}</code></li>)}</ul> : <p>此版本未声明</p>}
    </div>
  )
}

/** Aggregate App import: inspect first, install only after an explicit confirmation. */
export function AppsSection({ api }: { api: AppsApi }) {
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<AppPreview | null>(null)
  const [checks, setChecks] = useState<{ name: string; ok: boolean; detail: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const inspect = async () => {
    setBusy(true); setError(''); setChecks([])
    try { setPreview(await api.inspectApp(input)); setInput('') }
    catch (cause) { setPreview(null); setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const install = async () => {
    if (!preview) return
    setBusy(true); setError('')
    try {
      const result = await api.installApp(preview.previewId)
      setPreview(result.app); setChecks(result.checks); setInput('')
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <section className="dsm-root dsm-apps">
      <div className="dsm-head">
        <div><h3>Apps</h3><p>把 Skill、MCP、指令和 Hook 作为一个能力包预检并安装。</p></div>
      </div>
      <div className="dsm-app-import">
        <div className="dsm-field">
          <label htmlFor="dsm-app-command">导入安装命令</label>
          <textarea id="dsm-app-command" className="dsm-mono-input" rows={3} value={input}
            onChange={event => { setInput(event.target.value); setPreview(null); setChecks([]); setError('') }}
            placeholder="bash <(curl -fsSL https://skill.vyibc.com/…/install-….sh) --bootstrap-token …" />
          <div className="dsm-hint">先解析和读取发布清单，不执行粘贴的 Shell；授权值不会在预览中回显。</div>
        </div>
        <button className="dsm-btn dsm-primary" disabled={busy || !input.trim()} onClick={() => void inspect()}>{busy ? '读取中…' : '解析并预检'}</button>
      </div>

      {preview ? <article className="dsm-app-preview">
        <header>
          <div className="dsm-app-mark">A</div>
          <div className="dsm-grow"><h3>{preview.displayName}</h3><p>{preview.description}</p></div>
          <span className={`dsm-chip ${preview.installed ? 'dsm-ok' : ''}`}>{preview.installed ? '已安装' : '待安装'}</span>
        </header>
        <dl className="dsm-app-meta">
          <div><dt>App ID</dt><dd>{preview.name}</dd></div><div><dt>版本</dt><dd>{preview.version}</dd></div>
          <div><dt>发布者</dt><dd>{preview.publisher}</dd></div><div><dt>来源</dt><dd>{preview.source}</dd></div>
        </dl>
        <div className="dsm-hint dsm-mono">固定发布版本 {preview.revision.slice(0, 12)}</div>
        <div className="dsm-app-parts">
          <PartList title="Skills" items={preview.skills} />
          <PartList title="MCP" items={preview.mcpServers} />
          <PartList title="指令" items={preview.commands} />
          <PartList title="Hooks" items={preview.hooks} />
        </div>
        <div className="dsm-app-safety">
          <b>安装范围</b>
          <span>Codex Marketplace 与 App</span><span>{preview.mcpServers.length} 个 MCP 连接</span>
          <span>{preview.permissions.length ? `权限：${preview.permissions.join('、')}` : '未声明额外权限'}</span>
        </div>
        {!preview.installed || checks.length === 0 ? <div className="dsm-foot">
          <span className="dsm-hint">预检将在 {new Date(preview.expiresAt).toLocaleTimeString()} 过期</span>
          <button className="dsm-btn dsm-primary" disabled={busy} onClick={() => void install()}>{busy ? '安装中…' : preview.installed ? '重新安装并验证' : '确认安装'}</button>
        </div> : null}
      </article> : null}

      {checks.length ? <div className="dsm-app-checks"><b>安装后验收</b>{checks.map(check => <div key={check.name} className={check.ok ? 'dsm-ok-text' : 'dsm-err-text'}><span>{check.ok ? '✓' : '×'} {check.name}</span><small>{check.detail}</small></div>)}</div> : null}
      {error ? <div className="dsm-err">{error}</div> : null}
    </section>
  )
}
