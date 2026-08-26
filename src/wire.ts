/**
 * Wire contract for the `skillMcpConsole` Remote namespace — the invocation
 * descriptors shared verbatim by the host TYPERT manifest and the client
 * Remote contribution, so the two faces can never drift.
 *
 * Every method is string-in / string-out carrying JSON. Typert's only codec
 * mode is `strict` and its loader accepts zod v4 schemas only, so each
 * descriptor needs a real one; keeping the payloads as JSON strings makes
 * that one `z.string()` per side instead of a schema per shape. The panels are read-mostly and the
 * shapes move while the plugin is young, so paying schema maintenance twice
 * would buy nothing the JSON parse does not already give.
 *
 * @module dsh-skill-mcp-console/wire
 */

import { z } from 'zod'

/** Package id, repeated in every descriptor id and in both Typert faces. */
export const PKG = 'dsh-skill-mcp-console'

/** One JSON-string parameter. */
function jsonParam(name: string) {
  return Object.freeze({
    name,
    wire: name,
    source: 'json',
    codec: Object.freeze({
      mode: 'strict',
      typeSymbol: `${PKG}/types#Json`,
      schema: z.string(),
    }),
  })
}

/** One JSON-string result. */
const JSON_RESULT = Object.freeze({
  mode: 'strict',
  typeSymbol: `${PKG}/types#Json`,
  schema: z.string(),
})

function descriptor(method: string, params: readonly unknown[]) {
  return Object.freeze({
    id: `${PKG}#skillMcpConsole/${method}`,
    service: 'skillMcpConsole',
    namespace: 'skillMcpConsole',
    method,
    invocation: Object.freeze({ kind: 'direct' }),
    parameters: Object.freeze(params),
    result: JSON_RESULT,
    sourceLocation: Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 }),
  })
}

/** Every skill the agent can load, across every root. */
export const SKILLS_DESCRIPTOR = descriptor('skills', [])
/** One file's text from inside one skill directory. */
export const SKILL_FILE_DESCRIPTOR = descriptor('skillFile', [jsonParam('requestJson')])
/** Configured MCP servers joined to their live tool inventory. */
export const MCP_DESCRIPTOR = descriptor('mcp', [])
/** The whole MCP config as the universal `mcpServers` document. */
export const MCP_JSON_DESCRIPTOR = descriptor('mcpJson', [])

/** The canonical invocation list. Both faces register exactly this. */
export const CONSOLE_INVOCATIONS = Object.freeze([
  SKILLS_DESCRIPTOR,
  SKILL_FILE_DESCRIPTOR,
  MCP_DESCRIPTOR,
  MCP_JSON_DESCRIPTOR,
])

/** One skill as the panel sees it. */
export interface SkillRow {
  /** Directory name under its root — what `/name` resolves to. */
  id: string
  /** `name:` from the frontmatter, falling back to the directory name. */
  name: string
  /** `description:` from the frontmatter; empty when absent. */
  description: string
  /** Absolute path of the skill directory. */
  dir: string
  /** The root this skill was found under, `~`-shortened for display. */
  root: string
  /** Which agent owns that root: `dsh`, `agents`, `claude`, `codex`, … */
  origin: string
  /** Epoch ms of the newest file in the skill directory. */
  updatedAt: number
  /** Relative paths inside the skill directory, `SKILL.md` first. */
  files: string[]
  /** Why the skill cannot load, when it cannot. */
  problem: string | null
}

/** One configured MCP server joined to what it actually registered. */
export interface McpRow {
  /** `serverName` from the entry config — the `mcp__<name>__` prefix. */
  name: string
  /** The cordis entry id in the profile patch layer. */
  entryId: string
  /** `stdio` or `streamable-http`, as configured. */
  transport: string
  /** URL or command, with credentials removed. */
  target: string
  /** Whether the entry is disabled in the composition. */
  disabled: boolean
  /** Cordis fiber phase, or null when the entry never mounted. */
  fiber: string | null
  /** Tools this server registered, by bare name. */
  tools: { name: string; description: string }[]
}
