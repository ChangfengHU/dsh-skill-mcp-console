import { useEffect, useState } from 'react'
import type { BatchPreview, BatchResult } from '../capability-batch.ts'
import { readAppJobWithRetry } from '../app-poll.ts'

export interface BatchApi {
  inspectCapabilities: (keys: string[]) => Promise<BatchPreview>
  startCapabilityInstall: (previewId: string, overwriteSkills: boolean) => Promise<{ jobId: string }>
  appInstallStatus: (id: string) => Promise<any>
}
const JOB_KEY = 'dsh-skill-mcp-console:capability-job'
export function CapabilityBatchDialog({ api, onComplete }: { api: BatchApi; onComplete: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [preview, setPreview] = useState<BatchPreview | null>(null), [result, setResult] = useState<BatchResult | null>(null)
  const [detail, setDetail] = useState(''), [overwrite, setOverwrite] = useState(false)
  const watch = async (jobId: string) => {
    try {
      for (;;) {
        const job = await readAppJobWithRetry(() => api.appInstallStatus(jobId)); setDetail(job.detail)
        if (job.state === 'failed') throw Error(job.error || '安装失败，请重新预检')
        if (job.state === 'done') { setResult(job.result); sessionStorage.removeItem(JOB_KEY); await onComplete(); break }
        await new Promise(resolve => setTimeout(resolve, 750))
      }
    } catch (e) { setError((e as Error).message); sessionStorage.removeItem(JOB_KEY) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('installCapabilities')
    let saved: any
    try { saved = JSON.parse(sessionStorage.getItem(JOB_KEY) || 'null') } catch { sessionStorage.removeItem(JOB_KEY) }
    if (saved?.jobId && saved?.preview) { setOpen(true); setBusy(true); setPreview(saved.preview); void watch(saved.jobId); return }
    if (!raw) return
    setOpen(true); setBusy(true); setDetail('从 Fleet 读取所选能力和固定发布源…')
    void (async () => {
      if (raw.length > 12000) throw Error('安装清单过大')
      setPreview(await api.inspectCapabilities(JSON.parse(raw)))
    })().catch(e => setError(e.message)).finally(() => setBusy(false))
  }, [])
  if (!open) return null
  const close = () => { setOpen(false); const url = new URL(window.location.href); url.searchParams.delete('installCapabilities'); window.history.replaceState(null, '', url); }
  const install = async () => {
    if (!preview) return
    setBusy(true); setError('')
    try { const job = await api.startCapabilityInstall(preview.previewId, overwrite); sessionStorage.setItem(JOB_KEY, JSON.stringify({ ...job, preview })); await watch(job.jobId) }
    catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return <div className="dsm-scrim"><div className="dsm-modal dsm-wide" role="dialog" aria-label="批量安装到 DSH">
    <div className="dsm-modal-head"><h4>批量安装到 DSH</h4><button className="dsm-x" disabled={busy} onClick={close}>×</button></div>
    <p className="dsm-hint">完整安装所选 Skill 和 MCP；仅随插件提供的能力保持整包安装。不会启动 Agent 任务或提交视频生成。</p>
    {preview && !result ? <>
      <p>{preview.skills.length} 个独立 Skill · {preview.mcp.length} 个 MCP · {preview.plugins.length} 个完整插件（含各自能力）</p>
      <div className="dsm-app-list">{preview.skills.map(s => <div key={s.name}><b>{s.title}</b><small>{s.files} 个文件 · {s.existing ? '已有，默认保留' : '将安装'}</small></div>)}{preview.mcp.map(m => <div key={m.name}><b>{m.title}</b><small>{m.disabled ? '已停用，保持不变' : m.existing ? '已有，保留独立配置' : m.auth === 'oauth' ? '需本人授权' : '将配置并验证连接'}</small></div>)}{preview.plugins.map(p => <div key={p.name}><b>{p.displayName}</b><small>整包 · v{p.version} · {p.skills.length} Skills / {p.mcpServers.length} MCP</small></div>)}</div>
      {preview.conflicts.length ? <label><input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} disabled={busy} />备份后覆盖已有同名 Skill：{preview.conflicts.join('、')}</label> : null}
      <div className="dsm-foot"><button className="dsm-btn dsm-primary" disabled={busy} onClick={install}>{busy ? '安装进行中…' : '确认批量安装'}</button></div>
    </> : null}
    {busy ? <p role="status">{detail}</p> : null}
    {result ? <div className="dsm-app-report"><b>{result.status === 'installed' ? '批量安装完成' : '部分完成，以下项目需要处理'}</b>{result.checks.map((c, i) => <div key={i} className={c.warning ? 'dsm-warnbox' : c.ok ? 'dsm-okbox' : 'dsm-err'}>{c.ok ? c.warning ? '提示' : '✓' : '×'} {c.name} · {c.detail}</div>)}</div> : null}
    {error ? <div className="dsm-err">{error}</div> : null}
    <div className="dsm-foot"><button className="dsm-btn" disabled={busy} onClick={close}>关闭</button></div>
  </div></div>
}
