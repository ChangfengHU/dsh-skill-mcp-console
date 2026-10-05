import { useEffect, useMemo, useState } from 'react'
import type { AppPreview, McpRow, SkillRow } from '../wire.ts'
import { readAppJobWithRetry } from '../app-poll.ts'

type Check = { name: string; ok: boolean; detail: string; warning?: boolean }
export interface AppsApi {
  apps: () => Promise<AppPreview[]>; inspectApp: (input: string) => Promise<AppPreview>
  inspectCatalogApp: (name: string) => Promise<AppPreview>
  checkAppUpdates: () => Promise<AppPreview[]>
  previewAppUpdate: (name: string) => Promise<AppPreview>
  startAppInstall: (id: string, overwriteSkills?: boolean) => Promise<{ jobId: string }>
  appInstallStatus: (id: string) => Promise<{ state: 'running' | 'done' | 'failed'; stage: string; current: number; total: number; detail: string; result?: { app: AppPreview; checks: Check[] }; error?: string }>
  setAppEnabled: (name: string, enabled: boolean) => Promise<void>
  uninstallApp: (name: string) => Promise<{ trash: string }>
  skills: () => Promise<SkillRow[]>; mcp: () => Promise<McpRow[]>; insertPrompt: (text: string) => boolean
}
const tabs = ['概览', 'Skills', 'MCP', '指令', 'Hooks', '内容']
const APP_JOB_KEY = 'dsh-skill-mcp-console:app-job'

export function AppsSection({ api }: { api: AppsApi }) {
  const [apps, setApps] = useState<AppPreview[]>([]), [chosen, setChosen] = useState<AppPreview | null>(null)
  const [skills, setSkills] = useState<SkillRow[]>([]), [mcp, setMcp] = useState<McpRow[]>([])
  const [filter, setFilter] = useState('全部'), [query, setQuery] = useState(''), [tab, setTab] = useState('概览')
  const [dialog, setDialog] = useState(false), [input, setInput] = useState(''), [preview, setPreview] = useState<AppPreview | null>(null)
  const [checks, setChecks] = useState<Check[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [overwriteSkills, setOverwriteSkills] = useState(false), [updating, setUpdating] = useState(false)
  const [directInstall, setDirectInstall] = useState(false)
  const beginInstall = async (app: AppPreview) => {
    setDirectInstall(true); setUpdating(false); setInput(''); setPreview(null); setChecks([]); setProgress(null); setOverwriteSkills(false); setDialog(true); setBusy(true); setError('')
    try { setPreview(await api.inspectCatalogApp(app.name)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const checkUpdates = async () => {
    setBusy(true); setError('')
    try { const next = await api.checkAppUpdates(); setApps(next); setChosen(x => x ? next.find(a => a.name === x.name) ?? x : x); const failure = next.find(a => a.releaseError); if (failure) setError(failure.releaseError!) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const update = async (app: AppPreview) => {
    setDirectInstall(true); setInput(''); setUpdating(true); setPreview(null); setChecks([]); setProgress(null); setOverwriteSkills(false); setDialog(true); setBusy(true); setError('')
    try { setPreview(await api.previewAppUpdate(app.name)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const [progress, setProgress] = useState<{ stage: string; current: number; total: number; detail: string } | null>(null)
  const load = async () => { try { const [a, s, m] = await Promise.all([api.apps(), api.skills(), api.mcp()]); setApps(a); setSkills(s); setMcp(m); setChosen(x => x ? a.find(y => y.name === x.name) ?? x : x) } catch (e) { setError((e as Error).message) } }
  useEffect(() => {
    void load().then(async () => {
      const target = new URLSearchParams(window.location.search).get('installApp')
      if (target) {
        const next = await api.apps(), app = next.find(a => a.name === target)
        if (!app || app.compatibilityReason) throw Error(app?.compatibilityReason || '未找到可安装的插件')
        setChosen(app); await beginInstall(app)
      }
      const next = await api.checkAppUpdates(); setApps(next); setChosen(x => x ? next.find(a => a.name === x.name) ?? x : x)
    }).catch(e => setError((e as Error).message))
    try {
      const saved = JSON.parse(sessionStorage.getItem(APP_JOB_KEY) || 'null')
      if (saved?.jobId && saved?.preview) {
        setPreview(saved.preview); setDialog(true); setBusy(true)
        void watchInstall(saved.jobId)
      }
    } catch { sessionStorage.removeItem(APP_JOB_KEY) }
  }, [])
  const visible = useMemo(() => apps.filter(a => (filter === '全部' || filter === '已安装' && a.installed || filter === '可安装' && !a.installed && !a.compatibilityReason) && `${a.name} ${a.displayName} ${a.description}`.toLowerCase().includes(query.toLowerCase())), [apps, filter, query])
  const inspect = async () => { setBusy(true); setError(''); try { setPreview(await api.inspectApp(input)); setInput('') } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  async function watchInstall(jobId: string) {
    try {
      for (;;) {
        const job = await readAppJobWithRetry(() => api.appInstallStatus(jobId))
        setProgress(job)
        if (job.state === 'failed') {
          sessionStorage.removeItem(APP_JOB_KEY)
          throw new Error(job.error || '安装失败，请重新预检')
        }
        if (job.state === 'done' && job.result) {
          setPreview(job.result.app); setChecks(job.result.checks)
          sessionStorage.removeItem(APP_JOB_KEY); await load(); break
        }
        await new Promise(resolve => setTimeout(resolve, 700))
      }
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false); setPreview(p => p ? { ...p, previewId: '' } : p) }
  }
  const install = async () => {
    if (!preview?.previewId) return
    setBusy(true); setError(''); setProgress({ stage: 'starting', current: 0, total: 1, detail: '正在创建安装任务' })
    try {
      const { jobId } = await api.startAppInstall(preview.previewId, overwriteSkills)
      sessionStorage.setItem(APP_JOB_KEY, JSON.stringify({ jobId, preview }))
      await watchInstall(jobId)
    } catch (e) { setError((e as Error).message); setBusy(false); setPreview(p => p ? { ...p, previewId: '' } : p) }
  }
  const close = () => { setDialog(false); setUpdating(false); setOverwriteSkills(false); setPreview(null); setChecks([]); setError('') }
  if (chosen) {
    const skillStates = chosen.skills.map(item => {
      const row = skills.find(skill => skill.id === item.name || skill.name === item.name)
      const owner = chosen.managedSkills.includes(item.name) && row ? 'managed' : row ? 'reused' : 'missing'
      const label = owner === 'managed' ? `App 管理 · ${row!.state === 'on' ? '已启用' : row!.state === 'off' ? '已停用' : '仅用户调用'}` : owner === 'reused' ? `环境已有 · ${row!.state === 'on' ? '已启用' : '未启用'}` : '未安装'
      return { name: item.name, label, owner }
    })
    const skillReady = skillStates.filter(item => item.owner !== 'missing').length
    const parts = tab === 'Skills' ? chosen.skills.map(x => ({ name: x.name, status: skills.find(s => s.id === x.name)?.state ?? '未安装' })) : tab === 'MCP' ? chosen.mcpServers.map(x => { const row = mcp.find(m => m.name === x.name); const owner = chosen.managedMcp.includes(x.name) ? 'App 管理' : row ? '环境复用' : ''; return { name: x.name, status: !row ? '未配置' : row.disabled ? `${owner} · 已停用` : row.tools.length ? `${owner} · 已加载 ${row.tools.length} tools` : row.fiber ? `${owner} · 运行时 ${row.fiber}` : `${owner} · 等待运行时加载` } }) : tab === '指令' ? chosen.commands.map(x => ({ name: x.name, status: '已声明' })) : tab === 'Hooks' ? chosen.hooks.map(x => ({ name: x.name, status: '已声明' })) : [...chosen.skills.map(x => ({ name: `skills/${x.name}`, status: 'Skill' })), ...chosen.mcpServers.map(x => ({ name: x.name, status: 'MCP' }))]
    const openApp = () => {
      const agent = chosen.localDevelopment && chosen.agentPresets?.at(-1)
      if (agent) window.location.hash = `#/tc/agents/${encodeURIComponent(agent)}`
      else api.insertPrompt(`使用 ${chosen.displayName} 帮我开始一个项目。`)
    }
    return <section className="dsm-root dsm-app-detail">
      <button className="dsm-link" onClick={() => setChosen(null)}>← 返回 Apps</button>
      <div className="dsm-app-hero"><i className="dsm-app-logo">{appMark(chosen)}</i><div className="dsm-grow">
        <small>{chosen.publisher} · v{chosen.version}{chosen.localDevelopment ? ' · 本地开发版' : ''}</small>
        <h2>{chosen.displayName}</h2><p>{chosen.description}</p><State app={chosen} />
      </div><div className="dsm-actions">{chosen.installed ? <>
        <button className="dsm-btn dsm-primary" disabled={!chosen.enabled} onClick={openApp}>{chosen.localDevelopment ? '打开绑定 Agent' : '使用 App'}</button>
        {!chosen.localDevelopment ? <><button className="dsm-btn" disabled={busy} onClick={checkUpdates}>检查更新</button><button className="dsm-btn" disabled={busy} onClick={() => update(chosen)}>{chosen.updateAvailable ? `更新至 ${chosen.version.split("+")[0]}` : chosen.releaseStatus === "checked" ? "重新安装 / 修复" : "更新 App"}</button></> : null}
        <button className="dsm-btn" onClick={async () => { setBusy(true); await api.setAppEnabled(chosen.name, !chosen.enabled); await load(); setBusy(false) }}>{chosen.enabled ? '停用' : '启用'}</button>
        <button className="dsm-btn dsm-danger" onClick={async () => { if (confirm('卸载后能力文件会移入可恢复回收区，继续吗？')) { await api.uninstallApp(chosen.name); await load() } }}>卸载</button>
      </> : <button className="dsm-btn dsm-primary" disabled={busy || Boolean(chosen.compatibilityReason)} onClick={() => beginInstall(chosen)}>授权并安装</button>}</div></div>
      {chosen.compatibilityReason ? <p role="status">{chosen.compatibilityReason}</p> : null}
      {!chosen.localDevelopment ? chosen.releaseStatus === "unchecked" ? <p>尚未检查最新版本</p> : chosen.releaseStatus === "checked" ? <p>当前安装 {chosen.installedVersion ?? "未安装"} · 最新 {chosen.version}</p> : <div className="dsm-err">更新检查失败：{chosen.releaseError}</div> : null}
      {error && !dialog ? <div className="dsm-err">{error}</div> : null}
      <nav className="dsm-detail-tabs">{tabs.map(x => <button aria-selected={tab === x} onClick={() => setTab(x)}>{x}</button>)}</nav>
      {tab === '概览' ? <div className="dsm-app-overview"><main>
        <h3>这个 App 能做什么</h3><p>{chosen.description}</p>
        <div className="dsm-app-prompt"><b>快速开始</b><span>{chosen.localDevelopment ? '打开专属 Agent，新建会话，只需说：用下班小人生成一个有趣的视频。' : '把示例指令填入会话，发送前仍可编辑。'}</span>
          <button className="dsm-btn" disabled={!chosen.installed || !chosen.enabled} onClick={openApp}>{chosen.localDevelopment ? '打开 Agent' : '填入会话'}</button>
        </div>
        <p>真实状态：{skillReady}/{chosen.skills.length} Skills 可用，{mcp.filter(m => chosen.mcpServers.some(x => x.name === m.name) && !m.disabled).length}/{chosen.mcpServers.length} MCP 已配置。</p>
        {chosen.agentPresets?.map(id => <p key={id}>绑定 Agent：<code>{id}</code></p>)}
      </main><aside><b>来源</b>{chosen.localDevelopment ? <span>{chosen.source}</span> : <a href={`https://${chosen.source}/tree/${chosen.revision}`} target="_blank" rel="noreferrer">{chosen.source}</a>}
        <small>固定版本 {chosen.revision.slice(0, 12)}</small><b>权限</b><span>{chosen.permissions.join('、') || '未声明额外权限'}</span>
      </aside></div> : tab === 'Skills' ? <div className="dsm-app-list">
        <div className="dsm-skill-summary"><div><b>{skillReady}/{chosen.skills.length}</b><span>Skills 可用</span></div><div><b>{skillStates.filter(x => x.owner === 'managed').length}</b><span>App 管理</span></div><div><b>{skillStates.filter(x => x.owner === 'reused').length}</b><span>环境复用</span></div><div><b>{skillStates.filter(x => x.owner === 'missing').length}</b><span>未安装</span></div></div>
        {skillStates.map(item => <div><span className={`dsm-app-dot ${item.owner}`} /><b>{item.name}</b><small className={`dsm-skill-state ${item.owner}`}>{item.label}</small></div>)}
      </div> : <div className="dsm-app-list"><h3>{tab}</h3>{parts.length ? parts.map(x => <div><span className="dsm-app-dot" /><b>{x.name}</b><small>{x.status}</small></div>) : <p>此版本未声明</p>}</div>}
      {dialog ? <Import {...{ input, setInput, preview, checks, busy, error, progress, inspect, install, close, overwriteSkills, setOverwriteSkills, updating, directInstall }} /> : null}
    </section>
  }
  return <section className="dsm-root dsm-app-catalog"><div className="dsm-app-titlebar"><div><h2>Apps</h2><p>安装完整能力包：Skills、MCP、指令与 Hooks。</p></div><button className="dsm-btn dsm-primary" onClick={() => { setDirectInstall(false); setDialog(true) }}>＋ 添加 App</button><button className="dsm-btn" disabled={busy} onClick={checkUpdates}>{busy ? "检查中…" : "检查更新"}</button></div><div className="dsm-app-toolbar"><div className="dsm-tabs">{['全部', '已安装', '可安装'].map(x => <button aria-selected={filter === x} onClick={() => setFilter(x)}>{x}</button>)}</div><input className="dsm-input" placeholder="搜索 Apps" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="dsm-app-grid">{visible.map(a => <button className="dsm-app-card" onClick={() => setChosen(a)}><div><i className="dsm-app-logo">{appMark(a)}</i><State app={a} /></div><h3>{a.displayName}</h3><p>{a.description}</p><small>{a.skills.length} Skills · {a.mcpServers.length} MCP · v{a.version}</small></button>)}<article className="dsm-app-source-card"><b>受信任来源</b><p>只解析受支持的发布格式，不执行粘贴的 Shell。</p><button className="dsm-link" onClick={() => { setDirectInstall(false); setDialog(true) }}>导入发布命令 →</button></article></div>{error && !dialog ? <div className="dsm-err">{error}</div> : null}{dialog ? <Import {...{ input, setInput, preview, checks, busy, error, progress, inspect, install, close, overwriteSkills, setOverwriteSkills, updating, directInstall }} /> : null}</section>
}
function appMark(app: AppPreview) { return app.name === 'cartoon-video-studio' ? 'CV' : app.name === 'boss-brain' ? 'BB' : app.name === 'vyibc-flow-video-studio' ? 'FV' : app.displayName.slice(0, 2) }
function State({ app }: { app: AppPreview }) { return <span className={`dsm-chip ${app.installed && app.enabled ? 'dsm-ok' : app.installState === 'failed' ? 'dsm-bad' : ''}`}>{app.compatibilityReason && !app.installed ? '尚未适配' : app.installState === 'failed' ? '安装未通过' : !app.installed ? '可安装' : app.updateAvailable ? '有更新' : app.enabled ? '已启用' : '已停用'}</span> }
function Import(p: any) {
  const groups = p.preview ? [
    ['Skills', p.preview.skills], ['MCP', p.preview.mcpServers],
    ['指令', p.preview.commands], ['Hooks', p.preview.hooks],
  ] : []
  const stages = [['skills', '能力文件'], ['mcp', 'MCP 配置与验收'], ['codex', 'App 登记'], ['complete', '完成']]
  const active = Math.max(0, stages.findIndex(([id]) => id === p.progress?.stage))
return <div className="dsm-scrim"><div className="dsm-modal dsm-wide"><div className="dsm-modal-head"><h4>{p.busy ? p.progress ? '正在安装 App' : '正在预检 App' : p.checks.length ? '安装验收报告' : p.updating ? '更新 App' : p.directInstall ? '授权并安装 App' : '添加 App'}</h4><button className="dsm-x" disabled={p.busy} onClick={p.close}>×</button></div><p className="dsm-hint">先解析内容和权限，确认后才安装；授权值不会回显。</p>{!p.directInstall ? <textarea className="dsm-mono-input" rows={3} value={p.input} onChange={(e: any) => p.setInput(e.target.value)} placeholder="bash <(curl -fsSL https://skill.vyibc.com/…/install-….sh) --bootstrap-token …" /> : null}{p.preview ? <><p className="dsm-hint">{p.preview.permissions.join('；')}</p><div className="dsm-app-install"><div><b>{p.preview.displayName} · v{p.preview.version}</b><span>{p.preview.skills.length} Skills · {p.preview.mcpServers.length} MCP · {p.preview.commands.length} 指令 · {p.preview.hooks.length} Hooks</span></div><button className="dsm-btn dsm-primary" disabled={p.busy || p.checks.length > 0 || !p.preview.previewId} onClick={p.install}>{p.busy ? '正在安装…' : p.preview.installed ? '备份并更新' : '确认安装'}</button></div>{!p.busy && !p.checks.length && p.preview.skillConflicts?.length ? <label><input type="checkbox" checked={p.overwriteSkills} onChange={(e: any) => p.setOverwriteSkills(e.target.checked)} />同时备份并覆盖其他来源的同名 Skill：{p.preview.skillConflicts.join("、")}</label> : null}{p.progress ? <><div className="dsm-app-steps">{stages.map(([id, label], index) => <div className={index < active || p.progress.stage === 'complete' ? 'done' : index === active ? 'active' : ''}><i>{index < active || p.progress.stage === 'complete' ? '✓' : index + 1}</i><span>{label}</span></div>)}</div><div className="dsm-app-progress"><div><b>{p.progress.detail}</b><span>{p.progress.current}/{p.progress.total}</span></div><progress value={p.progress.current} max={Math.max(1, p.progress.total)} /><small>刷新页面后仍可读取已持久化的安装记录。</small></div></> : null}{!p.busy && !p.checks.length ? <div className="dsm-app-preview-parts">{groups.map(([title, items]: any) => <details open={title === '指令'}><summary>{title}<span>{items.length}</span></summary>{items.length ? <div>{items.map((item: any) => <p><code>{item.name}</code>{item.description ? <small>{item.description}</small> : null}</p>)}</div> : <small>此版本未声明</small>}</details>)}</div> : null}</> : p.directInstall ? <div role="status">{p.busy ? "正在连接 Fleet 并读取发布清单…" : p.error ? "授权预检未完成，未修改安装配置。" : "等待 Fleet 授权"}</div> : <button className="dsm-btn dsm-primary" disabled={p.busy || !p.input.trim()} onClick={p.inspect}>解析并预检</button>}{p.checks.length ? <div className="dsm-app-report"><b>安装后验收</b>{p.checks.map((x: Check) => <div className={x.warning ? 'dsm-warnbox' : x.ok ? 'dsm-okbox' : 'dsm-err'}>{x.warning ? '提示' : x.ok ? '✓' : '×'} {x.name} · {x.detail}</div>)}</div> : null}{p.error ? <div className="dsm-err">{p.error}</div> : null}<div className="dsm-foot"><button className="dsm-btn" disabled={p.busy} onClick={p.close}>{p.busy ? p.progress ? '安装进行中' : '预检中' : '关闭'}</button></div></div></div>
}
