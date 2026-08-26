/**
 * The Skills section: every skill on the machine, and what is inside each one.
 *
 * The list is grouped by origin rather than sorted flat, because "which agent
 * owns this root" is the first thing you need when the same skill name shows
 * up twice. Rows carry their `problem` inline — a skill with a broken
 * frontmatter is invisible from inside a session, and this panel is the only
 * place it can say why.
 *
 * @module dsh-skill-mcp-console/client/SkillsSection
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillRow } from '../wire.ts'

/** What the section calls back into the host with. */
export interface SkillsApi {
  skills: () => Promise<SkillRow[]>
  skillFile: (dir: string, path: string) => Promise<string>
}

/** Human date for a mtime, or a dash when the scan found nothing to stat. */
function when(ms: number): string {
  if (!ms) return '—'
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/** Render one skill's files and their contents. */
function Detail({ skill, api, onBack }: { skill: SkillRow; api: SkillsApi; onBack: () => void }) {
  const [path, setPath] = useState(skill.files.includes('SKILL.md') ? 'SKILL.md' : (skill.files[0] ?? ''))
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!path) return
    let live = true
    setLoading(true)
    setError('')
    api.skillFile(skill.dir, path)
      .then(content => { if (live) setText(content) })
      .catch((cause: Error) => { if (live) setError(cause.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [api, skill.dir, path])

  return (
    <div className="smc-root">
      <div className="smc-head">
        <div>
          <button className="smc-btn" onClick={onBack}>‹ 返回</button>
        </div>
        <div className="smc-spacer" />
      </div>
      <div className="smc-head">
        <div>
          <h3 className="smc-name">/{skill.id}</h3>
          <p className="smc-mono">{skill.root}/{skill.id} · {skill.origin} · 更新于 {when(skill.updatedAt)}</p>
        </div>
      </div>
      {skill.problem ? <div className="smc-err">{skill.problem}</div> : null}
      {skill.description ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, opacity: .82 }}>{skill.description}</p> : null}
      <div className="smc-detail">
        <div className="smc-tree">
          {skill.files.map(file => (
            <button key={file} aria-current={file === path} onClick={() => setPath(file)}>{file}</button>
          ))}
          {skill.files.length === 0 ? <div style={{ padding: 8, opacity: .6 }}>(空目录)</div> : null}
        </div>
        <div className="smc-pane">
          <div className="smc-pane-bar"><span>{path || '(没有文件)'}</span></div>
          {error
            ? <div className="smc-err" style={{ margin: 12 }}>{error}</div>
            : <pre className="smc-pre">{loading ? '读取中…' : text}</pre>}
        </div>
      </div>
    </div>
  )
}

/** The Skills settings section. */
export function SkillsSection({ api }: { api: SkillsApi }) {
  const [rows, setRows] = useState<SkillRow[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<SkillRow | null>(null)

  const load = useCallback(() => {
    setError('')
    api.skills().then(setRows).catch((cause: Error) => setError(cause.message))
  }, [api])

  useEffect(load, [load])

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(row =>
      row.id.toLowerCase().includes(needle)
      || row.name.toLowerCase().includes(needle)
      || row.description.toLowerCase().includes(needle)
      || row.origin.includes(needle))
  }, [rows, query])

  if (open) return <Detail skill={open} api={api} onBack={() => setOpen(null)} />

  const broken = rows?.filter(row => row.problem).length ?? 0

  return (
    <div className="smc-root">
      <div className="smc-head">
        <div>
          <h3>Skills</h3>
          <p>这台机器上所有技能根目录里的技能。点一行看它的文件和正文。</p>
        </div>
        <div className="smc-spacer" />
        <button className="smc-btn" onClick={load}>重新扫描</button>
      </div>

      {error ? <div className="smc-err">{error}</div> : null}

      <div className="smc-bar">
        <input
          className="smc-input"
          placeholder="搜索技能…"
          aria-label="搜索技能"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <span>
          {rows === null ? '扫描中…' : <>共 <b>{rows.length}</b> 个{broken ? <> · <span style={{ color: '#b07908' }}>{broken} 个有问题</span></> : null}</>}
        </span>
      </div>

      {rows !== null && shown.length === 0
        ? <div className="smc-empty">{rows.length === 0 ? '没有扫到任何技能。' : '没有匹配的技能。'}</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table className="smc-table">
              <thead>
                <tr><th>Skill</th><th>来源</th><th>目录</th><th>更新</th></tr>
              </thead>
              <tbody>
                {shown.map(row => (
                  <tr key={row.dir} className="smc-click" onClick={() => setOpen(row)}>
                    <td>
                      <div className="smc-name">/{row.id}</div>
                      {row.description ? <div className="smc-desc">{row.description}</div> : null}
                      {row.problem ? <div className="smc-problem">{row.problem}</div> : null}
                    </td>
                    <td><span className="smc-chip">{row.origin}</span></td>
                    <td className="smc-mono">{row.root}</td>
                    <td className="smc-mono">{when(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
