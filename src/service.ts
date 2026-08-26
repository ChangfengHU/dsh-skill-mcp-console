/**
 * The `skillMcpConsole` Remote service: everything both panels read.
 *
 * Facts only. The service never invents connection state — dsh's official
 * MCP client does not expose a status seam yet, so a server's row carries
 * what is actually knowable (the entry's disabled flag, its cordis fiber
 * phase, and the tools it really registered) and says nothing about whether
 * a socket is up. A panel that prints a green dot it cannot justify is worse
 * than one that admits it does not know.
 *
 * @module dsh-skill-mcp-console/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { readSkillFile, scanSkills } from './skills.ts'
import type { McpRow } from './wire.ts'

/** The one official MCP bridge. Entries naming anything else are not servers. */
const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** `mcp__<server>__<tool>` — how the official client namespaces what it registers. */
const TOOL_PREFIX = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/

/** Config keys whose values are credentials and never leave the host. */
const SECRET_KEYS = /^(headers|env|token|apiKey|api_key|authorization)$/i

/**
 * Strip credential values out of an entry config, keeping the shape.
 *
 * Header and env NAMES are useful (you want to see that `Authorization` is
 * set) while their values are the secret, so names survive and values become
 * a fixed mask rather than a length-revealing one.
 */
function sanitize(value: unknown, key = ''): unknown {
  if (SECRET_KEYS.test(key) && value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as object).map(k => [k, '••••••']))
  }
  if (SECRET_KEYS.test(key) && typeof value === 'string') return '••••••'
  if (Array.isArray(value)) return value.map(item => sanitize(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, sanitize(v, k)]))
  }
  return value
}

/** Where the server lives, as one display string, with credentials removed. */
function targetOf(config: Record<string, unknown>): string {
  if (typeof config.url === 'string') return config.url.replace(/\/\/[^@/]+@/, '//••••@')
  const command = typeof config.command === 'string' ? config.command : ''
  const args = Array.isArray(config.args) ? config.args.filter(a => typeof a === 'string') : []
  return [command, ...args].join(' ').trim() || '(未配置)'
}

/** Read-side service for both panels. */
export class SkillMcpConsoleService extends TypertRemoteService {
  static inject = ['loader', 'tools']

  /**
   * @param ctx - context carrying the loader and the tool registry.
   */
  constructor(ctx: Context) {
    // The key registers the Cordis service AND names the wire namespace, so
    // it has to match the `namespace` every descriptor in ./wire.ts declares.
    super(ctx, 'skillMcpConsole')
  }

  /** Every skill on disk, across every root. */
  async skills(): Promise<string> {
    return JSON.stringify(await scanSkills(homedir()))
  }

  /**
   * One file's text from inside one skill directory.
   *
   * @param requestJson - `{ dir, path }`, both from a row this service returned.
   */
  async skillFile(requestJson: string): Promise<string> {
    const request = JSON.parse(requestJson) as { dir?: unknown; path?: unknown }
    if (typeof request.dir !== 'string' || typeof request.path !== 'string') {
      throw new Error('skillFile 需要 { dir, path } 两个字符串')
    }
    // Re-scan rather than trust the caller's `dir`: the browser could name any
    // directory, and only one that is actually a skill root child may be read.
    const known = await scanSkills(homedir())
    const row = known.find(skill => skill.dir === request.dir)
    if (!row) throw new Error('这个目录不是已知的技能目录')
    return JSON.stringify({ text: await readSkillFile(row.dir, request.path) })
  }

  /** Configured servers joined to the tools they actually registered. */
  mcp(): string {
    const byServer = new Map<string, { name: string; description: string }[]>()
    for (const schema of this.ctx.tools.schemas()) {
      const match = TOOL_PREFIX.exec(schema.name)
      if (!match) continue
      const list = byServer.get(match[1]) ?? []
      list.push({ name: match[2], description: schema.description ?? '' })
      byServer.set(match[1], list)
    }

    const rows: McpRow[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name !== MCP_CLIENT_MODULE) continue
      const config = (entry.options.config ?? {}) as Record<string, unknown>
      const name = typeof config.serverName === 'string' ? config.serverName : `entry:${entry.options.id}`
      rows.push({
        name,
        entryId: entry.options.id,
        transport: typeof config.transport === 'string' ? config.transport : (config.url ? 'streamable-http' : 'stdio'),
        target: targetOf(config),
        disabled: Boolean(entry.disabled),
        fiber: entry.fiber === undefined ? null : String(entry.fiber.state),
        tools: (byServer.get(name) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      })
      byServer.delete(name)
    }

    // Tools whose namespace matches no configured entry: a server that was
    // registered some other way, or an entry that was edited while its tools
    // stayed live. Either way the tools are real and belong on screen.
    for (const [name, tools] of byServer) {
      rows.push({
        name, entryId: '', transport: '(未在本 profile 配置)', target: '',
        disabled: false, fiber: null, tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }
    rows.sort((a, b) => a.name.localeCompare(b.name))
    return JSON.stringify(rows)
  }

  /**
   * The MCP config as the universal `mcpServers` document.
   *
   * dsh stores servers as cordis patch entries; Cursor, Claude Desktop and
   * every MCP README in circulation write `mcpServers`. Reading it back in
   * that shape is the whole point of this view — you can compare it against
   * any documentation you find without translating in your head.
   */
  mcpJson(): string {
    const servers: Record<string, unknown> = {}
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name !== MCP_CLIENT_MODULE) continue
      const config = { ...(entry.options.config ?? {}) } as Record<string, unknown>
      const name = typeof config.serverName === 'string' ? config.serverName : entry.options.id
      const out: Record<string, unknown> = {}
      if (typeof config.url === 'string') {
        out.type = 'http'
        out.url = config.url
      } else {
        if (config.command !== undefined) out.command = config.command
        if (config.args !== undefined) out.args = config.args
      }
      for (const key of ['headers', 'env', 'toolCallTimeoutMs', 'failOnStartupError'] as const) {
        if (config[key] !== undefined) out[key] = sanitize(config[key], key)
      }
      if (entry.disabled) out.disabled = true
      servers[name] = out
    }
    return JSON.stringify({ mcpServers: servers }, null, 2)
  }
}
