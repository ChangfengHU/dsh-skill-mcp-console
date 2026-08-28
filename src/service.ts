/**
 * The `pluginStation` Remote service: everything both panels read and every
 * mutation they make.
 *
 * Facts only. dsh's official MCP client exposes no status seam, so a server
 * row carries what is actually knowable — the entry's disabled flag, its
 * cordis fiber phase, and the tools it really registered — and says nothing
 * about whether a socket is up. A panel that prints a green dot it cannot
 * justify is worse than one that admits it does not know.
 *
 * Every write backs up first and reports where the backup went.
 *
 * @module dsh-plugin-station/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  cleanup, createSkill, detect, findSkills, peek, place, runShell, stage, uploadSkill, verify,
} from './install.ts'
import {
  MCP_CLIENT_MODULE, fromUniversal, phaseOf, readToolPolicy, setDisabled, toUniversal, writeToolPolicy,
  type UniversalServer,
} from './mcpconfig.ts'
import { spawn } from 'node:child_process'
import { cachePath, loadCatalog, page as catalogPage, type CatalogQuery } from './catalog.ts'
import { collectPackages } from './plugins.ts'
import { readSkillFile, removeSkill, scanSkills, setSkillState } from './skills.ts'
import { estimateToolTokens } from './tokens.ts'
import type { DirectoryEntry, McpRow, McpTool, PluginEntryRow, SkillRow, SkillState } from './wire.ts'

/** `mcp__<server>__<tool>` — how the official client namespaces what it registers. */
const TOOL_PREFIX = /^mcp__(.+?)__(.+)$/

/** Where a skill installed through this panel lands. */
function defaultRoot(home: string): string {
  return join(home, '.agents', 'skills')
}

/**
 * Which profile this Host booted.
 *
 * The launcher puts it in argv (`dsh --profile web …`), and reading it back
 * is the only way a plugin learns which of several profiles it is living in.
 * Everything that writes to the profile — the patch layer, `dsh plugin add`
 * — has to agree with this, or a two-profile machine edits the wrong one.
 */
function profileName(argv: string[] = process.argv): string {
  const flag = argv.indexOf('--profile')
  const next = flag >= 0 ? argv[flag + 1] : undefined
  if (next && !next.startsWith('-')) return next
  const inline = argv.find(a => a.startsWith('--profile='))
  return inline ? inline.slice('--profile='.length) : 'web'
}

/** The booted profile's directory. */
function profileDir(home: string, profile = profileName()): string {
  return join(home, '.dsh', 'profiles', profile)
}

/** Where the profile patch layer lives. */
function patchFile(home: string, profile = profileName()): string {
  return join(profileDir(home, profile), 'cordis.patch.yml')
}

/**
 * What a package name is allowed to look like before it reaches a CLI.
 *
 * The specifier for `add` can be a URL and is checked differently; a name to
 * REMOVE is always a plain package name, and anything else reaching that
 * argument is a mistake worth refusing rather than passing along.
 */
const SAFE_PACKAGE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i

/**
 * Run `dsh plugin --profile <p> …` and report what it said.
 *
 * Installing a plugin means resolving peers, writing the lockfile, and
 * recomposing the profile, and the Host's own CLI already does all of it —
 * so this re-invokes that CLI rather than reimplementing the package manager
 * behind it. `process.argv[1]` is the launcher this Host booted from, which
 * keeps a multi-version machine on the same dsh that is running.
 *
 * No shell: arguments go to the child as an array, so a specifier can hold
 * whatever npm allows without any of it being interpreted here.
 */
function dshPlugin(args: string[], timeoutMs = 420_000): Promise<{ code: number; log: string }> {
  const launcher = process.argv[1]
  if (!launcher) throw new Error('cannot locate the dsh launcher this Host booted from')
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [launcher, 'plugin', '--profile', profileName(), ...args],
      { cwd: profileDir(homedir()), stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let log = ''
    const take = (chunk: Buffer) => { log += chunk.toString('utf8') }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const timer = setTimeout(() => { child.kill('SIGKILL'); log += '\ntimed out' }, timeoutMs)
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, log: `${log}\n${String(error)}` }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code: code ?? -1, log: log.slice(-8000) }) })
  })
}

/** GitHub topics the Agent Skills format actually collects under. */
const SKILL_TOPICS = ['agent-skills', 'claude-skills', 'claude-skill', 'agent-skill', 'skill-md']

/** Read-and-write service for both panels. */
export class PluginStationService extends TypertRemoteService {
  static inject = ['loader', 'tools']

  /** Staged install directories, keyed by the token handed to the client. */
  private readonly staged = new Map<string, { dir: string; plan: ReturnType<typeof detect> }>()
  private stageSeq = 0

  /**
   * The last scan, reused for a moment.
   *
   * A scan walks every root and stats every file in every skill. Clicking
   * through a skill's file tree was doing that once per click just to check
   * the directory is one we know about — twenty directories re-walked to
   * answer a question the previous scan already answered. Two seconds is long
   * enough to cover a burst of clicks and short enough that an edit made in
   * an editor still shows up on the next look.
   */
  private scanCache: { at: number; rows: Promise<SkillRow[]> } | null = null

  /** The specifier currently being installed, if any. See `addPlugin`. */
  private installing: string | null = null

  /**
   * @param ctx - context carrying the loader and the tool registry.
   */
  constructor(ctx: Context) {
    // The key registers the Cordis service AND names the wire namespace, so
    // it has to match the `namespace` every descriptor in ./wire.ts declares.
    super(ctx, 'pluginStation')
  }

  private get home(): string { return homedir() }

  /** Scan the roots, reusing a result from the last couple of seconds. */
  private scan(fresh = false): Promise<SkillRow[]> {
    const now = Date.now()
    if (!fresh && this.scanCache && now - this.scanCache.at < 2000) return this.scanCache.rows
    const rows = scanSkills(this.home, process.cwd())
    this.scanCache = { at: now, rows }
    return rows
  }

  /** Drop the cache after a write, so the next read sees the change. */
  private invalidate(): void { this.scanCache = null }

  // ── skills ────────────────────────────────────────────────────────────

  /** Every skill on disk, across every root, with shadowing resolved. */
  async skills(): Promise<string> {
    return JSON.stringify(await this.scan(true))
  }

  /** One file's text from inside one skill directory. */
  async skillFile(payload: string): Promise<string> {
    const { dir, path } = JSON.parse(payload) as { dir: string; path: string }
    // Re-scan rather than trust the caller: the browser could name any
    // directory, and only a real skill directory may be read.
    const known = await this.scan()
    if (!known.some(skill => skill.dir === dir)) throw new Error('not a known skill directory')
    return JSON.stringify({ text: await readSkillFile(dir, path) })
  }

  /** Move one skill between the four states. */
  async setSkillState(payload: string): Promise<string> {
    const { dir, state } = JSON.parse(payload) as { dir: string; state: SkillState }
    const known = await this.scan()
    if (!known.some(skill => skill.dir === dir)) throw new Error('not a known skill directory')
    await setSkillState(this.home, dir, state)
    this.invalidate()
    return JSON.stringify({ ok: true })
  }

  /** Move one skill to the trash folder. */
  async removeSkill(payload: string): Promise<string> {
    const { dir } = JSON.parse(payload) as { dir: string }
    const known = await this.scan()
    if (!known.some(skill => skill.dir === dir)) throw new Error('not a known skill directory')
    const trash = await removeSkill(this.home, dir)
    this.invalidate()
    return JSON.stringify({ trash })
  }

  // ── mcp ───────────────────────────────────────────────────────────────

  /** Configured servers joined to the tools they actually registered. */
  async mcp(): Promise<string> {
    const policy = await readToolPolicy(this.home)
    const byServer = new Map<string, McpTool[]>()
    for (const schema of this.ctx.tools.schemas()) {
      const match = TOOL_PREFIX.exec(schema.name)
      if (!match) continue
      const [, server, tool] = match
      const list = byServer.get(server) ?? []
      list.push({
        name: tool,
        description: schema.description ?? '',
        tokens: estimateToolTokens(schema),
        disabled: (policy[server] ?? []).includes(tool),
      })
      byServer.set(server, list)
    }

    const rows: McpRow[] = []
    const push = (row: Omit<McpRow, 'tokens'>) => {
      row.tools.sort((a, b) => a.name.localeCompare(b.name))
      rows.push({ ...row, tokens: row.tools.filter(t => !t.disabled).reduce((sum, t) => sum + t.tokens, 0) })
    }

    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name !== MCP_CLIENT_MODULE) continue
      const config = (entry.options.config ?? {}) as Record<string, unknown>
      const name = typeof config.serverName === 'string' ? config.serverName : `entry:${entry.options.id}`
      push({
        name,
        entryId: entry.options.id,
        transport: typeof config.transport === 'string' ? config.transport : (config.url ? 'streamable-http' : 'stdio'),
        target: targetOf(config),
        disabled: Boolean(entry.disabled),
        fiber: phaseOf(entry.fiber),
        tools: byServer.get(name) ?? [],
      })
      byServer.delete(name)
    }

    // Tools whose namespace matches no configured entry: a server registered
    // some other way, or an entry edited while its tools stayed live. Either
    // way the tools are real and belong on screen.
    for (const [name, tools] of byServer) {
      push({ name, entryId: '', transport: 'unconfigured', target: '', disabled: false, fiber: null, tools })
    }
    rows.sort((a, b) => a.name.localeCompare(b.name))
    return JSON.stringify(rows)
  }

  /** The whole MCP config as the universal `mcpServers` document. */
  async mcpJson(): Promise<string> {
    const servers = await toUniversal(patchFile(this.home))
    return JSON.stringify({ mcpServers: servers }, null, 2)
  }

  /** Write a universal `mcpServers` document back into the patch layer. */
  async saveMcpJson(payload: string): Promise<string> {
    const { text } = JSON.parse(payload) as { text: string }
    let parsed: { mcpServers?: Record<string, UniversalServer> }
    try {
      parsed = JSON.parse(text) as { mcpServers?: Record<string, UniversalServer> }
    } catch (error) {
      throw new Error(`JSON 无法解析 / invalid JSON: ${(error as Error).message}`)
    }
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
      throw new Error('文档需要一个顶层 "mcpServers" 对象 / the document needs a top-level "mcpServers" object')
    }
    for (const [name, server] of Object.entries(parsed.mcpServers)) {
      if (!server.url && !server.command) throw new Error(`"${name}" 需要 url 或 command / needs either url or command`)
    }
    return JSON.stringify(await fromUniversal(patchFile(this.home), parsed.mcpServers))
  }

  /** Enable or disable one server without touching anything else. */
  async setMcpDisabled(payload: string): Promise<string> {
    const { name, disabled } = JSON.parse(payload) as { name: string; disabled: boolean }
    return JSON.stringify({ backup: await setDisabled(patchFile(this.home), name, disabled) })
  }

  /** Hide or restore one tool of one server. */
  async setToolDisabled(payload: string): Promise<string> {
    const { server, tool, disabled } = JSON.parse(payload) as { server: string; tool: string; disabled: boolean }
    const policy = await readToolPolicy(this.home)
    const list = new Set(policy[server] ?? [])
    if (disabled) list.add(tool)
    else list.delete(tool)
    if (list.size === 0) delete policy[server]
    else policy[server] = [...list].sort()
    await writeToolPolicy(this.home, policy)
    return JSON.stringify({ ok: true })
  }

  // ── install ───────────────────────────────────────────────────────────

  /** Recognise what the user pasted. Runs nothing. */
  async detectInstall(payload: string): Promise<string> {
    const { input } = JSON.parse(payload) as { input: string }
    return JSON.stringify(detect(input))
  }

  /** Fetch and return the script a shell plan would pipe into a shell. */
  async peekInstall(payload: string): Promise<string> {
    const { plan } = JSON.parse(payload) as { plan: ReturnType<typeof detect> }
    return JSON.stringify({ text: await peek(plan) })
  }

  /** Stage a source and list the skills inside it, so the user can choose. */
  async stageInstall(payload: string): Promise<string> {
    const { plan } = JSON.parse(payload) as { plan: ReturnType<typeof detect> }
    const result = await stage(plan)
    const token = `stage-${++this.stageSeq}`
    this.staged.set(token, { dir: result.dir, plan })
    // One staging directory at a time; the previous one is dead weight.
    for (const [key, value] of this.staged) {
      if (key !== token) { await cleanup(value.dir); this.staged.delete(key) }
    }
    return JSON.stringify({ token, candidates: result.candidates, log: result.log })
  }

  /**
   * Install the chosen candidates, then check whether anything landed.
   *
   * A shell plan installs wherever its script decides, so its result is
   * measured by diffing the target root rather than by trusting the exit
   * code — an installer that prints a menu and installs nothing still exits
   * zero, which is exactly how a "successful" install ends up empty.
   */
  async runInstall(payload: string): Promise<string> {
    const { token, chosen } = JSON.parse(payload) as { token: string; chosen: string[] }
    const entry = this.staged.get(token)
    if (!entry) throw new Error('staging expired — detect and stage again')
    const target = defaultRoot(this.home)
    let log = ''
    let code = 0
    let installed: string[] = []
    let settled = false

    try {
      if (entry.plan.kind === 'shell') {
        const before = new Set((await this.scan(true)).map(skill => skill.dir))
        const result = await runShell(entry.plan.plan, entry.dir)
        log += result.out
        code = result.code
        installed = (await this.scan(true)).filter(skill => !before.has(skill.dir)).map(skill => skill.dir)
        if (installed.length === 0) {
          log += `\n(exit ${code}, 但没有新技能落地 / no new skill appeared under any root)`
        }
      } else {
        const candidates = await findSkills(join(entry.dir, 'src'))
        const picked = candidates.filter(candidate => chosen.includes(candidate.path))
        if (picked.length === 0) throw new Error('nothing selected')
        log += await place(entry.dir, picked, target)
        installed = picked.map(candidate => join(target, candidate.name))
      }

      const names = (await this.scan(true)).map(skill => skill.id)
      const checks = await Promise.all(installed.map(async dir => ({ dir, checks: await verify(dir, names) })))
      settled = true
      return JSON.stringify({ code, log, installed, checks })
    } finally {
      // Only a finished run retires its staging. Dropping the token on a
      // failure meant the retry reported "staging expired" instead of the
      // thing that actually went wrong.
      if (settled) {
        await cleanup(entry.dir)
        this.staged.delete(token)
      }
    }
  }

  /** Write a hand-authored skill straight into the default root. */
  async createSkill(payload: string): Promise<string> {
    const { name, description, instructions } = JSON.parse(payload) as { name: string; description: string; instructions: string }
    const dir = await createSkill(defaultRoot(this.home), name, description, instructions)
    const names = (await this.scan(true)).map(skill => skill.id)
    return JSON.stringify({ dir, checks: await verify(dir, names) })
  }

  /** Write an uploaded `.md` or archive into the default root. */
  async uploadSkill(payload: string): Promise<string> {
    const { filename, base64 } = JSON.parse(payload) as { filename: string; base64: string }
    const dir = await uploadSkill(defaultRoot(this.home), filename, base64)
    const names = (await this.scan(true)).map(skill => skill.id)
    return JSON.stringify({ dir, checks: await verify(dir, names) })
  }

  /**
   * Third-party skills, searched on GitHub.
   *
   * Browse is for finding skills you do not have, which means somebody
   * else's. An earlier version pointed it at a hand-curated index of this
   * deployment's own published skills — that is backwards twice over: those
   * are already installed, and enumerating internal tooling on a public URL
   * turns "public but unlisted" into "here is the list".
   *
   * GitHub is where the format actually lives: `agent-skills` alone carries
   * five figures of repositories. Results feed straight into the install
   * flow, which stages the repository, lists the skills inside it and lets
   * you pick — a repository is rarely one skill.
   *
   * Unauthenticated search is rate-limited to a handful of queries a minute;
   * `DPS_GITHUB_TOKEN` lifts that for anyone who hits it.
   */
  async directory(payload: string): Promise<string> {
    const { query, topic } = JSON.parse(payload || '{}') as { query?: string; topic?: string }
    const installed = new Set((await this.scan()).map(skill => skill.id))
    const chosenTopic = topic && SKILL_TOPICS.includes(topic) ? topic : SKILL_TOPICS[0]
    const search = [`topic:${chosenTopic}`, (query ?? '').trim()].filter(Boolean).join(' ')
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(search)}&sort=stars&order=desc&per_page=30`

    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      // GitHub rejects requests with no user agent outright.
      'user-agent': 'dsh-plugin-station',
    }
    if (process.env.DPS_GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.DPS_GITHUB_TOKEN}`

    try {
      const response = await fetch(url, { headers })
      if (!response.ok) {
        const hint = response.status === 403 ? ' (rate limit — set DPS_GITHUB_TOKEN)' : ''
        throw new Error(`${response.status} ${response.statusText}${hint}`)
      }
      const body = (await response.json()) as { items?: GithubRepo[] }
      const entries: DirectoryEntry[] = (body.items ?? []).map(repo => ({
        name: repo.full_name,
        description: repo.description ?? '',
        source: `★ ${repo.stargazers_count ?? 0}`,
        install: repo.html_url,
        // GitHub gives a moving default branch; the install flow pins the
        // commit it actually downloaded, which is where a version can honestly
        // come from. Claiming one here would be inventing it.
        version: null,
        installed: installed.has(repo.name),
        curated: false,
      }))
      return JSON.stringify({ topics: SKILL_TOPICS, topic: chosenTopic, entries, error: null })
    } catch (cause) {
      return JSON.stringify({ topics: SKILL_TOPICS, topic: chosenTopic, entries: [], error: (cause as Error).message })
    }
  }

  /**
   * One repository's README, so a skill can be read before it is trusted.
   *
   * Browse used to jump straight from a search result into the install flow,
   * which is a strange thing to ask of someone: decide to run third-party
   * code on the strength of a one-line description. The README is the only
   * thing most repositories offer as an explanation, so it goes in front of
   * the decision rather than after it.
   */
  async repoReadme(payload: string): Promise<string> {
    const { repo } = JSON.parse(payload) as { repo: string }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('expected owner/repo')
    const headers: Record<string, string> = { accept: 'application/vnd.github.raw', 'user-agent': 'dsh-plugin-station' }
    if (process.env.DPS_GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.DPS_GITHUB_TOKEN}`
    const response = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const text = await response.text()
    return JSON.stringify({ text: text.length > 60_000 ? text.slice(0, 60_000) + '\n\n…' : text })
  }

  // ── code plugins ──────────────────────────────────────────────────────

  /**
   * The packages installed into this profile, with their live entries.
   *
   * The Host's own Plugin list answers a different question — every
   * composition entry, the great majority of which are the Host itself. This
   * answers "what did I install, and is it working".
   */
  async codePlugins(): Promise<string> {
    const entries: PluginEntryRow[] = []
    for (const entry of this.ctx.loader.entries()) {
      const module = typeof entry.options.name === 'string' ? entry.options.name : ''
      if (!module) continue
      entries.push({
        id: String(entry.options.id ?? ''),
        module,
        disabled: Boolean(entry.disabled),
        fiber: phaseOf(entry.fiber),
      })
    }
    const grouped = await collectPackages(profileDir(this.home), entries)
    return JSON.stringify({ ...grouped, profile: profileName() })
  }

  /** Switch one composition entry off or back on, through the patch layer. */
  async setPluginDisabled(payload: string): Promise<string> {
    const { entryId, disabled } = JSON.parse(payload) as { entryId: string; disabled: boolean }
    const backupPath = await setEntryDisabled(patchFile(this.home), entryId, disabled)
    return JSON.stringify({ backup: backupPath })
  }

  /** Remove a package from the profile by re-invoking the Host's own CLI. */
  async removePlugin(payload: string): Promise<string> {
    const { name } = JSON.parse(payload) as { name: string }
    if (!SAFE_PACKAGE.test(name)) throw new Error(`refusing to remove ${JSON.stringify(name)}`)
    return JSON.stringify(await dshPlugin(['remove', name]))
  }

  /**
   * One page of the market.
   *
   * The catalog is a couple of megabytes; it is fetched and cached here so
   * the browser only ever receives the page it is showing. Which packages
   * are already installed is joined in on the way out, so a card can say
   * "installed" without the panel making a second round trip.
   */
  async catalog(payload: string): Promise<string> {
    const query = JSON.parse(payload || '{}') as CatalogQuery
    const rows = await loadCatalog(this.home)
    // What the profile DECLARES is the honest answer to "do I have this".
    // The live composition lags it: a package installed a moment ago is on
    // disk and in the patch, but its fiber only exists after a restart, so
    // reading the loader alone makes a fresh install look like it failed.
    const declared = new Set<string>(Object.keys(await this.profileDependencies()))
    const live = new Set<string>()
    for (const entry of this.ctx.loader.entries()) {
      const module = typeof entry.options.name === 'string' ? entry.options.name : ''
      if (!module) continue
      live.add(module.startsWith('@') ? module.split('/').slice(0, 2).join('/') : module.split('/')[0]!)
    }
    return JSON.stringify(catalogPage(rows, query, declared, live))
  }

  /** The profile's direct dependencies, as its package.json declares them. */
  private async profileDependencies(): Promise<Record<string, string>> {
    try {
      const text = await readFile(join(profileDir(this.home), 'package.json'), 'utf8')
      return (JSON.parse(text) as { dependencies?: Record<string, string> }).dependencies ?? {}
    } catch { return {} }
  }

  /**
   * Which declared packages are not live yet — i.e. what a restart would
   * pick up.
   *
   * A newly installed package is on disk and in the composition file, but
   * its fiber only exists after the process restarts: the loader's only
   * published seam for applying one is `exit()`, described in its own types
   * as "Hook for hosts that can restart the process on full-reload
   * requests". So "installed" and "running" are genuinely two states here,
   * and a panel that collapses them leaves people waiting for something that
   * is never going to happen on its own.
   */
  async pendingRestart(): Promise<string> {
    const declared = new Set(Object.keys(await this.profileDependencies()))
    const live = new Set<string>()
    for (const entry of this.ctx.loader.entries()) {
      const module = typeof entry.options.name === 'string' ? entry.options.name : ''
      if (!module) continue
      live.add(module.startsWith('@') ? module.split('/').slice(0, 2).join('/') : module.split('/')[0]!)
    }
    // Both directions matter, and only one of them was reported before.
    // A removal leaves the package gone from disk and from the profile while
    // its fiber keeps running — menus and settings pages it registered stay
    // on screen, which reads as "the uninstall did nothing".
    return JSON.stringify({
      added: [...declared].filter(name => !live.has(name)).sort(),
      removed: [...live].filter(name => !declared.has(name) && !name.startsWith('@deepseek-ai')).sort(),
    })
  }

  /**
   * Apply the composition by restarting the Host.
   *
   * `loader.exit()` is the published request; whether anything comes back up
   * is the deployment's business — a service manager with a restart policy,
   * or a person. The reply is sent before exiting so the panel can say what
   * is about to happen rather than just losing its connection.
   */
  async restartHost(): Promise<string> {
    setTimeout(() => {
      try { (this.ctx.loader as { exit?: () => void }).exit?.() } catch { /* fall through */ }
      process.exit(0)
    }, 250)
    return JSON.stringify({ restarting: true })
  }

  /** Drop the cached catalog so the next read refetches. */
  async refreshCatalog(): Promise<string> {
    await rm(cachePath(this.home), { force: true })
    const rows = await loadCatalog(this.home)
    return JSON.stringify({ total: rows.length })
  }

  /**
   * Install a package into the profile the same way.
   *
   * Serialised on purpose. pnpm takes a lock on its content-addressable
   * store, so a second install started while one is running does not fail —
   * it blocks, silently, for as long as the first takes. A caller that gets
   * told "one at a time" can say so; a caller left waiting on a lock cannot
   * tell that apart from a hang.
   */
  async addPlugin(payload: string): Promise<string> {
    const { spec } = JSON.parse(payload) as { spec: string }
    const target = spec.trim()
    if (!target || /\s/.test(target)) throw new Error('one package specifier, no spaces')
    if (this.installing) throw new Error(`already installing ${this.installing} — one at a time`)
    this.installing = target
    try {
      const result = await dshPlugin(['add', target])
      return JSON.stringify({ ...result, restartRequired: result.code === 0 })
    } finally { this.installing = null }
  }
}

/** What GitHub search returns, of the fields this uses. */
interface GithubRepo {
  full_name: string
  name: string
  html_url: string
  description: string | null
  stargazers_count: number
}

/** Where the server lives, as one display string, with credentials removed. */
function targetOf(config: Record<string, unknown>): string {
  if (typeof config.url === 'string') return config.url.replace(/\/\/[^@/]+@/, '//••••@')
  const command = typeof config.command === 'string' ? config.command : ''
  const args = Array.isArray(config.args) ? config.args.filter(a => typeof a === 'string') : []
  return [command, ...args].join(' ').trim() || '—'
}

/** Read one file, for callers that only need the text. */
export async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8')
}
