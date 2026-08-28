/**
 * The five ways a skill gets in: a command or link, an upload, a form, the
 * agent writing one, and the curated directory.
 *
 * The install flow shows what will run before it runs and what landed after,
 * because the alternative — trusting an exit code — is how an install that
 * printed a menu and copied nothing gets reported as a success.
 *
 * @module dsh-plugin-station/client/AddFlows
 */

import { useCallback, useEffect, useState } from 'react'
import type { DirectoryEntry, InstallCandidate, InstallPlan, VerifyCheck } from '../wire.ts'
import { LogBox, Modal, VerifyList, type T } from './ui.tsx'

/** What an install hands back to the list once it is finished. */
export interface InstallOutcome {
  installed: string[]
  checks: { dir: string; checks: VerifyCheck[] }[]
  failed: VerifyCheck['key'][]
}

/** Host calls the Add flows need. */
export interface InstallApi {
  detectInstall: (input: string) => Promise<InstallPlan>
  peekInstall: (plan: InstallPlan) => Promise<string>
  stageInstall: (plan: InstallPlan) => Promise<{ token: string; candidates: InstallCandidate[]; log: string }>
  runInstall: (token: string, chosen: string[]) => Promise<{ code: number; log: string; installed: string[]; checks: { dir: string; checks: VerifyCheck[] }[] }>
  createSkill: (name: string, description: string, instructions: string) => Promise<{ dir: string; checks: VerifyCheck[] }>
  uploadSkill: (filename: string, base64: string) => Promise<{ dir: string; checks: VerifyCheck[] }>
  directory: (query: string, topic: string) => Promise<{ topics: string[]; topic: string; entries: DirectoryEntry[]; error: string | null }>
  repoReadme: (repo: string) => Promise<string>
}

/** Install from a pasted repository address or command. */
export function InstallFlow({ api, t, onClose, onDone, seed }: {
  api: InstallApi
  t: T
  onClose: () => void
  /** Hand the finished result to the list and leave. */
  onDone: (result?: InstallOutcome) => void
  seed?: string
}) {
  const [input, setInput] = useState(seed ?? '')
  const [plan, setPlan] = useState<InstallPlan | null>(null)
  const [script, setScript] = useState('')
  const [showScript, setShowScript] = useState(false)
  const [token, setToken] = useState('')
  const [candidates, setCandidates] = useState<InstallCandidate[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [stageLog, setStageLog] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<InstallApi['runInstall']>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Detection is pure string work on the host, so it can follow every
  // keystroke without the user asking for it.
  useEffect(() => {
    const text = input.trim()
    if (!text) { setPlan(null); return }
    let live = true
    const timer = setTimeout(() => {
      api.detectInstall(text)
        .then(next => { if (live) { setPlan(next); setScript(''); setShowScript(false) } })
        .catch(() => { if (live) setPlan(null) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [api, input])

  const doStage = async () => {
    if (!plan) return
    setBusy(true); setError(''); setResult(null)
    try {
      const staged = await api.stageInstall(plan)
      setToken(staged.token)
      setCandidates(staged.candidates)
      // Pre-ticking sixty-eight boxes invites an accidental install of all of
      // them. A handful is a convenience; a pile is a decision.
      setChosen(staged.candidates.length <= 5 ? staged.candidates.map(candidate => candidate.path) : [])
      setStageLog(staged.log)
      if (plan.kind === 'shell') { await doRun(staged.token, []); return }
      // Silence was the worst outcome here: the download succeeded, the log
      // said "extract", and then nothing at all appeared.
      if (staged.candidates.length === 0) setError(t('noCandidates'))
    } catch (cause) {
      setError((cause as Error).message)
    } finally { setBusy(false) }
  }

  const doRun = async (useToken = token, picks = chosen) => {
    setBusy(true); setError('')
    try {
      const outcome = await api.runInstall(useToken, picks)
      // Installing is the whole errand. Leaving the dialog open with a live
      // "Run and verify" button invited a second click on a staging token the
      // first run had already consumed, which is the only way anyone ever saw
      // "staging expired". The result travels back to the list instead.
      onDone({
        installed: outcome.installed,
        checks: outcome.checks,
        failed: outcome.checks.flatMap(entry => entry.checks.filter(check => !check.ok).map(check => check.key)),
      })
      onClose()
    } catch (cause) {
      setError((cause as Error).message)
    } finally { setBusy(false) }
  }

  const peekScript = async () => {
    if (!plan) return
    setShowScript(open => !open)
    if (!script) setScript(await api.peekInstall(plan).catch((cause: Error) => `(${cause.message})`))
  }

  return (
    <Modal title={t('installTitle')} lead={t('installLead')} onClose={onClose} wide>
      <div className="dps-field">
        <label htmlFor="dps-install-input">{t('installInput')}</label>
        <textarea
          id="dps-install-input"
          rows={2}
          spellCheck={false}
          className="dps-mono-input"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="https://github.com/anthropics/skills"
        />
        <div className="dps-hint">{t('installHint')}</div>
      </div>

      {plan ? (
        <div className="dps-detect">
          <span className="dps-badge">{t('detected')}</span>
          <span>{plan.label}</span>
          <span className="dps-spacer" />
          <span className="dps-mono">{t('installTarget')} ~/.agents/skills/</span>
        </div>
      ) : null}

      {plan ? (
        <div className="dps-peek">
          <button className="dps-peek-sum" onClick={peekScript} aria-expanded={showScript}>
            {showScript ? '▾' : '▸'} {t('peekOpen')}
          </button>
          {showScript ? <pre className="dps-pre">{script || '…'}</pre> : null}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="dps-verify">
          <b>
            {t('found', { n: candidates.length })}
            <button className="dps-btn dps-tiny" onClick={() => setChosen(candidates.map(c => c.path))}>{t('selectAll')}</button>
            <button className="dps-btn dps-tiny" onClick={() => setChosen([])}>{t('selectNone')}</button>
            <span className="dps-vsub"> · {t('selected', { n: chosen.length })}</span>
          </b>
          {candidates.map(candidate => (
            <label className="dps-pick" key={candidate.path}>
              <input
                type="checkbox"
                checked={chosen.includes(candidate.path)}
                onChange={event => setChosen(list => event.target.checked
                  ? [...list, candidate.path]
                  : list.filter(item => item !== candidate.path))}
              />
              <span className="dps-pn">{candidate.name}</span>
              <span className="dps-pd">{candidate.description}</span>
            </label>
          ))}
        </div>
      ) : null}

      {stageLog || result ? <LogBox title={t('output')} text={(stageLog + (result?.log ?? '')).trim() || '…'} badge={result ? `exit ${result.code}` : undefined} /> : null}

      {result?.checks.map(entry => (
        <div key={entry.dir}>
          <div className="dps-hint dps-mono" style={{ marginTop: 8 }}>{entry.dir}</div>
          <VerifyList checks={entry.checks} t={t} />
        </div>
      ))}

      {error ? <div className="dps-err">{error}</div> : null}

      {/* Folded away. It is reference material you read once, and it was
          taking a third of the dialog on every visit. */}
      <details className="dps-req">
        <summary>{t('supported')}</summary>
        <ul>
          <li><code>https://github.com/user/repo</code> · <code>user/repo</code> · <code>github:user/repo/skills/foo</code> · <code>…/tree/&lt;branch&gt;/&lt;dir&gt;</code></li>
          <li><code>git clone &lt;repo&gt;</code></li>
          <li>a URL pointing straight at a <code>SKILL.md</code>, <code>.zip</code> or <code>.tgz</code></li>
          <li><code>bash &lt;(curl -fsSL &lt;url&gt;)</code> · <code>curl … | bash</code></li>
        </ul>
      </details>

      <div className="dps-foot">
        <button className="dps-btn" onClick={onClose}>{t('cancel')}</button>
        {candidates.length > 0
          ? <button className="dps-btn dps-primary" disabled={busy || chosen.length === 0} onClick={() => void doRun()}>{t('runInstall')}</button>
          : <button className="dps-btn dps-primary" disabled={busy || !plan} onClick={() => void doStage()}>{t('runInstall')}</button>}
      </div>
    </Modal>
  )
}

/** Upload a `.md`, `.zip` or `.tgz`. */
export function UploadFlow({ api, t, onClose, onDone }: { api: InstallApi; t: T; onClose: () => void; onDone: (result?: InstallOutcome) => void }) {
  const [checks, setChecks] = useState<VerifyCheck[] | null>(null)
  const [dir, setDir] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const take = async (file: File) => {
    setBusy(true); setError(''); setChecks(null)
    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (const byte of buffer) binary += String.fromCharCode(byte)
      const outcome = await api.uploadSkill(file.name, btoa(binary))
      setDir(outcome.dir); setChecks(outcome.checks); onDone()
    } catch (cause) {
      setError((cause as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <Modal title={t('uploadTitle')} lead={t('uploadLead')} onClose={onClose}>
      <label
        className="dps-drop"
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void take(file) }}
      >
        <span className="dps-big">⊕</span>
        {busy ? '…' : t('drop')}
        <input type="file" accept=".md,.zip,.tgz,.gz" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void take(file) }} />
      </label>
      {dir ? <div className="dps-hint dps-mono" style={{ marginTop: 10 }}>{dir}</div> : null}
      {checks ? <VerifyList checks={checks} t={t} /> : null}
      {error ? <div className="dps-err">{error}</div> : null}
      <div className="dps-foot"><button className="dps-btn" onClick={onClose}>{t('cancel')}</button></div>
    </Modal>
  )
}

/** Write a skill from three fields. */
export function CreateFlow({ api, t, onClose, onDone }: { api: InstallApi; t: T; onClose: () => void; onDone: (result?: InstallOutcome) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [checks, setChecks] = useState<VerifyCheck[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setError(''); setChecks(null)
    try {
      const outcome = await api.createSkill(name.trim(), description, instructions)
      setChecks(outcome.checks); onDone()
    } catch (cause) {
      setError((cause as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <Modal title={t('createTitle')} lead={t('createLead')} onClose={onClose}>
      <div className="dps-field">
        <label htmlFor="dps-cn">{t('fieldName')}</label>
        <input id="dps-cn" className="dps-mono-input" value={name} onChange={event => setName(event.target.value)} placeholder="weekly-status-report" />
        <div className="dps-hint">{t('fieldNameHint')}</div>
      </div>
      <div className="dps-field">
        <label htmlFor="dps-cd">{t('fieldDescription')}</label>
        <textarea id="dps-cd" rows={3} value={description} onChange={event => setDescription(event.target.value)} />
        <div className="dps-hint">{t('fieldDescriptionHint')}</div>
      </div>
      <div className="dps-field">
        <label htmlFor="dps-ci">{t('fieldInstructions')}</label>
        <textarea id="dps-ci" rows={6} value={instructions} onChange={event => setInstructions(event.target.value)} />
      </div>
      {checks ? <VerifyList checks={checks} t={t} /> : null}
      {error ? <div className="dps-err">{error}</div> : null}
      <div className="dps-foot">
        <button className="dps-btn" onClick={onClose}>{t('cancel')}</button>
        <button className="dps-btn dps-primary" disabled={busy || !name.trim() || !description.trim()} onClick={() => void submit()}>{t('create')}</button>
      </div>
    </Modal>
  )
}

/**
 * Hand the job to the agent instead of showing a form.
 *
 * Starting the session closes this dialog and Settings with it — the point is
 * to end up in a conversation, and leaving a modal on top of the composer the
 * prompt just landed in would defeat that.
 */
export function AiFlow({ t, onClose, onInsert }: { t: T; onClose: () => void; onInsert: (text: string) => boolean }) {
  const [copied, setCopied] = useState(false)
  const prompt = t('aiPrompt')
  return (
    <Modal title={t('aiTitle')} lead={t('aiLead')} onClose={onClose}>
      <div className="dps-composer"><p>{prompt}</p></div>
      {copied ? <div className="dps-hint" style={{ marginTop: 10 }}>{t('aiInserted')}</div> : null}
      <div className="dps-foot">
        <button className="dps-btn" onClick={onClose}>{t('cancel')}</button>
        <button
          className="dps-btn dps-primary"
          onClick={() => {
            onClose()
            if (!onInsert(prompt)) { void navigator.clipboard?.writeText(prompt); setCopied(true) }
          }}
        >{t('aiInsert')}</button>
      </div>
    </Modal>
  )
}

/**
 * Browse: third-party skills on GitHub.
 *
 * Picking one hands its repository URL to the install flow, which downloads
 * it, lists the skills inside and lets you choose — a repository is rarely
 * one skill, and installing all of it because it was one card is how you end
 * up with twenty skills you did not ask for.
 */
export function DirectoryFlow({ api, t, onClose, onInstall }: {
  api: InstallApi; t: T; onClose: () => void; onInstall: (install: string) => void
}) {
  const [state, setState] = useState<Awaited<ReturnType<InstallApi['directory']>> | null>(null)
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('agent-skills')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<DirectoryEntry | null>(null)

  const load = useCallback((nextQuery: string, nextTopic: string) => {
    setBusy(true)
    api.directory(nextQuery, nextTopic)
      .then(setState)
      .catch((cause: Error) => setState({ topics: [], topic: nextTopic, entries: [], error: cause.message }))
      .finally(() => setBusy(false))
  }, [api])

  useEffect(() => { load('', 'agent-skills') }, [load])

  if (open) return <RepoDetail entry={open} api={api} t={t} onBack={() => setOpen(null)} onInstall={onInstall} />

  return (
    <Modal title={t('directoryTitle')} lead={t('directoryLead')} onClose={onClose} wide>
      <form
        className="dps-bar"
        onSubmit={event => { event.preventDefault(); load(query, topic) }}
      >
        <input
          className="dps-input"
          placeholder={t('searchRepos')}
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <button className="dps-btn dps-primary" type="submit" disabled={busy}>{t('searchGo')}</button>
      </form>

      <div className="dps-bar">
        {(state?.topics ?? ['agent-skills']).map(name => (
          <button
            key={name}
            className={`dps-chip dps-topic${name === topic ? ' dps-topic-on' : ''}`}
            onClick={() => { setTopic(name); load(query, name) }}
          >{name}</button>
        ))}
      </div>

      {state?.error ? <div className="dps-err">{t('registryError', { error: state.error })}</div> : null}
      {busy ? <div className="dps-empty">…</div> : null}
      {state && !state.error && !busy && state.entries.length === 0
        ? <div className="dps-empty">{t('registryEmpty')}</div> : null}

      <div className="dps-cards">
        {(state?.entries ?? []).map(entry => (
          <div className="dps-card2" key={entry.name}>
            <div className="dps-card-top">
              <button className="dps-cn dps-link" onClick={() => setOpen(entry)}>{entry.name}</button>
              <button
                className={`dps-act${entry.installed ? ' dps-act-on' : ''}`}
                aria-label={entry.installed ? t('installed') : t('install')}
                // Only onInstall. Calling onClose() after it clears the very
                // flow onInstall just switched to, and the install dialog
                // never opens — the close won the race every time.
                onClick={() => onInstall(entry.install)}
              >{entry.installed ? '✓' : '＋'}</button>
            </div>
            <div className="dps-cm">
              <span>{entry.source}</span>
              {entry.version ? <span className="dps-ver">{entry.version}</span> : null}
            </div>
            <div className="dps-cd">{entry.description}</div>
          </div>
        ))}
      </div>

      <p className="dps-hint">{t('directoryNote')}</p>
      <div className="dps-foot"><button className="dps-btn" onClick={onClose}>{t('cancel')}</button></div>
    </Modal>
  )
}

/**
 * One repository, read before it is installed.
 *
 * Deliberately the raw README rather than a rendered one: what matters here
 * is what the repository actually says about itself, and a half-rendered
 * Markdown pane invites you to skim what you came to read carefully.
 */
function RepoDetail({ entry, api, t, onBack, onInstall }: {
  entry: DirectoryEntry; api: InstallApi; t: T; onBack: () => void; onInstall: (install: string) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    api.repoReadme(entry.name)
      .then(readme => { if (live) setText(readme) })
      .catch((cause: Error) => { if (live) setError(cause.message) })
    return () => { live = false }
  }, [api, entry.name])

  return (
    <Modal title={entry.name} lead={entry.description} onClose={onBack} wide>
      <div className="dps-bar">
        <button className="dps-btn" onClick={onBack}>‹ {t('back')}</button>
        <span className="dps-chip">{entry.source}</span>
        <a className="dps-btn" href={entry.install} target="_blank" rel="noreferrer noopener">{t('openOnGithub')}</a>
        <span className="dps-spacer" />
        <button className="dps-btn dps-primary" onClick={() => onInstall(entry.install)}>{t('installReview')}</button>
      </div>
      {error ? <div className="dps-err">{error}</div> : null}
      <div className="dps-pane">
        <div className="dps-pane-bar"><span>README</span></div>
        <pre className="dps-pre">{text || (error ? '' : '…')}</pre>
      </div>
      <p className="dps-hint">{t('directoryNote')}</p>
      <div className="dps-foot"><button className="dps-btn" onClick={onBack}>{t('back')}</button></div>
    </Modal>
  )
}
