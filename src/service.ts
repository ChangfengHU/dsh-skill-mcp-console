/**
 * The `skillMcpConsole` Remote service: everything both panels read and every
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
 * @module dsh-skill-mcp-console/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  cleanup, createSkill, detect, findSkills, peek, place, runShell, stage, uploadSkill, verify,
} from './install.ts'
import {
  MCP_CLIENT_MODULE, fromUniversal, readToolPolicy, setDisabled, toUniversal, writeToolPolicy,
  type UniversalServer,
} from './mcpconfig.ts'
import { readSkillFile, removeSkill, scanSkills, setSkillState } from './skills.ts'
import { estimateToolTokens } from './tokens.ts'
import type { DirectoryEntry, McpRow, McpTool, SkillState } from './wire.ts'

/** `mcp__<server>__<tool>` — how the official client namespaces what it registers. */
const TOOL_PREFIX = /^mcp__(.+?)__(.+)$/

/** Where a skill installed through this panel lands. */
function defaultRoot(home: string): string {
  return join(home, '.agents', 'skills')
}

/** Where the profile patch layer lives. */
function patchFile(home: string, profile = 'web'): string {
  return join(home, '.dsh', 'profiles', profile, 'cordis.patch.yml')
}

/** Where the panel looks for its curated skill index. */
const DEFAULT_REGISTRY = process.env.SMC_REGISTRY_URL ?? 'https://skill.vyibc.com/index.json'

/** Read-and-write service for both panels. */
export class SkillMcpConsoleService extends TypertRemoteService {
  static inject = ['loader', 'tools']

  /** Staged install directories, keyed by the token handed to the client. */
  private readonly staged = new Map<string, { dir: string; plan: ReturnType<typeof detect> }>()
  private stageSeq = 0

  /**
   * @param ctx - context carrying the loader and the tool registry.
   */
  constructor(ctx: Context) {
    // The key registers the Cordis service AND names the wire namespace, so
    // it has to match the `namespace` every descriptor in ./wire.ts declares.
    super(ctx, 'skillMcpConsole')
  }

  private get home(): string { return homedir() }

  // ── skills ────────────────────────────────────────────────────────────

  /** Every skill on disk, across every root, with shadowing resolved. */
  async skills(): Promise<string> {
    return JSON.stringify(await scanSkills(this.home, process.cwd()))
  }

  /** One file's text from inside one skill directory. */
  async skillFile(payload: string): Promise<string> {
    const { dir, path } = JSON.parse(payload) as { dir: string; path: string }
    // Re-scan rather than trust the caller: the browser could name any
    // directory, and only a real skill directory may be read.
    const known = await scanSkills(this.home, process.cwd())
    if (!known.some(skill => skill.dir === dir)) throw new Error('not a known skill directory')
    return JSON.stringify({ text: await readSkillFile(dir, path) })
  }

  /** Move one skill between the four states. */
  async setSkillState(payload: string): Promise<string> {
    const { dir, state } = JSON.parse(payload) as { dir: string; state: SkillState }
    const known = await scanSkills(this.home, process.cwd())
    if (!known.some(skill => skill.dir === dir)) throw new Error('not a known skill directory')
    await setSkillState(this.home, dir, state)
    return JSON.stringify({ ok: true })
  }

  /** Move one skill to the trash folder. */
  async removeSkill(payload: string): Promise<string> {
    const { dir } = JSON.parse(payload) as { dir: string }
    const known = await scanSkills(this.home, process.cwd())
    if (!known.some(skill => skill.dir === dir)) throw new Error('not a known skill directory')
    return JSON.stringify({ trash: await removeSkill(this.home, dir) })
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
        fiber: entry.fiber === undefined ? null : String(entry.fiber.state),
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

    try {
      if (entry.plan.kind === 'shell') {
        const before = new Set((await scanSkills(this.home)).map(skill => skill.dir))
        const result = await runShell(entry.plan.plan, entry.dir)
        log += result.out
        code = result.code
        installed = (await scanSkills(this.home)).filter(skill => !before.has(skill.dir)).map(skill => skill.dir)
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

      const names = (await scanSkills(this.home)).map(skill => skill.id)
      const checks = await Promise.all(installed.map(async dir => ({ dir, checks: await verify(dir, names) })))
      return JSON.stringify({ code, log, installed, checks })
    } finally {
      await cleanup(entry.dir)
      this.staged.delete(token)
    }
  }

  /** Write a hand-authored skill straight into the default root. */
  async createSkill(payload: string): Promise<string> {
    const { name, description, instructions } = JSON.parse(payload) as { name: string; description: string; instructions: string }
    const dir = await createSkill(defaultRoot(this.home), name, description, instructions)
    const names = (await scanSkills(this.home)).map(skill => skill.id)
    return JSON.stringify({ dir, checks: await verify(dir, names) })
  }

  /** Write an uploaded `.md` or archive into the default root. */
  async uploadSkill(payload: string): Promise<string> {
    const { filename, base64 } = JSON.parse(payload) as { filename: string; base64: string }
    const dir = await uploadSkill(defaultRoot(this.home), filename, base64)
    const names = (await scanSkills(this.home)).map(skill => skill.id)
    return JSON.stringify({ dir, checks: await verify(dir, names) })
  }

  /**
   * The curated skill index the Browse button opens.
   *
   * A deployment points `SMC_REGISTRY_URL` at its own index. There is no
   * built-in upstream marketplace: the open Agent Skills format carries no
   * version field, so an index that links straight at someone else's HEAD
   * hands you a skill that can change under you — and a skill is a script
   * with your machine's credentials. Curated entries pin a revision.
   */
  async directory(): Promise<string> {
    const installed = new Set((await scanSkills(this.home)).map(skill => skill.id))
    let entries: DirectoryEntry[] = []
    let error: string | null = null
    try {
      const response = await fetch(DEFAULT_REGISTRY, { redirect: 'follow' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const raw = (await response.json()) as { skills?: DirectoryEntry[] } | DirectoryEntry[]
      const list = Array.isArray(raw) ? raw : raw.skills ?? []
      entries = list.map(entry => ({
        name: String(entry.name ?? ''),
        description: String(entry.description ?? ''),
        source: String(entry.source ?? DEFAULT_REGISTRY),
        install: String(entry.install ?? ''),
        version: entry.version ?? null,
        installed: installed.has(String(entry.name ?? '')),
        curated: entry.curated ?? true,
      })).filter(entry => entry.name)
    } catch (cause) {
      error = `${DEFAULT_REGISTRY}: ${(cause as Error).message}`
    }
    return JSON.stringify({ registry: DEFAULT_REGISTRY, entries, error })
  }
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
