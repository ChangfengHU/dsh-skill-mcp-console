/**
 * Wire contract for the `skillMcpConsole` Remote namespace — the invocation
 * descriptors shared verbatim by the host TYPERT manifest and the client
 * Remote contribution, so the two faces can never drift.
 *
 * Every method is string-in / string-out carrying JSON. Typert's only codec
 * mode is `strict` and its loader accepts zod v4 schemas only, so each
 * descriptor needs a real one; keeping the payloads as JSON strings makes
 * that one `z.string()` per side instead of a schema per shape, on a surface
 * that is still moving.
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
    codec: Object.freeze({ mode: 'strict', typeSymbol: `${PKG}/types#Json`, schema: z.string() }),
  })
}

/** One JSON-string result. */
const JSON_RESULT = Object.freeze({ mode: 'strict', typeSymbol: `${PKG}/types#Json`, schema: z.string() })

function descriptor(method: string, argc: 0 | 1) {
  return Object.freeze({
    id: `${PKG}#skillMcpConsole/${method}`,
    service: 'skillMcpConsole',
    namespace: 'skillMcpConsole',
    method,
    invocation: Object.freeze({ kind: 'direct' }),
    parameters: Object.freeze(argc === 1 ? [jsonParam('payload')] : []),
    result: JSON_RESULT,
    sourceLocation: Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 }),
  })
}

/** Every method the panels call, in the order the service defines them. */
export const METHODS = [
  ['skills', 0], ['skillFile', 1], ['setSkillState', 1], ['removeSkill', 1],
  ['mcp', 0], ['mcpJson', 0], ['saveMcpJson', 1], ['setMcpDisabled', 1], ['setToolDisabled', 1],
  ['detectInstall', 1], ['peekInstall', 1], ['stageInstall', 1], ['runInstall', 1],
  ['createSkill', 1], ['uploadSkill', 1], ['directory', 0],
] as const

/** The canonical invocation list. Both faces register exactly this. */
export const CONSOLE_INVOCATIONS = Object.freeze(METHODS.map(([method, argc]) => descriptor(method, argc)))

/** The four states a skill can be parked in. */
export type SkillState = 'on' | 'name-only' | 'user-only' | 'off'

/** One skill as the panel sees it. */
export interface SkillRow {
  /** Directory name under its root — what `/name` resolves to. */
  id: string
  /** `name:` from the frontmatter, falling back to the directory name. */
  name: string
  /** Current `description:`, which is what sits in context every turn. */
  description: string
  /** Full text parked by `name-only`, or null when nothing is parked. */
  originalDescription: string | null
  /** Absolute path of the skill directory. */
  dir: string
  /** The root this skill was found under, `~`-shortened. */
  root: string
  /** Which agent owns that root: `workspace`, `agents`, `dsh`, `claude`, … */
  origin: string
  /** Whether dsh's own filesystem provider reads this root. */
  native: boolean
  /** Where this skill currently sits among the four states. */
  state: SkillState
  /** Estimated context cost of the current description. */
  tokens: number
  /** Estimated cost of the full description, for showing what `name-only` saves. */
  fullTokens: number
  /** Epoch ms of the newest file in the skill directory. */
  updatedAt: number
  /** Relative paths inside the skill directory, `SKILL.md` first. */
  files: string[]
  /** Why the skill cannot load, as a key the client renders in its language. */
  problem: string | null
  /** The root whose copy of this name wins, when this one is shadowed. */
  shadowedBy: string | null
}

/** One tool a server registered. */
export interface McpTool {
  name: string
  description: string
  /** Estimated context cost of this tool's schema. */
  tokens: number
  /** Whether the panel's per-tool policy currently hides it. */
  disabled: boolean
}

/** One configured MCP server joined to what it actually registered. */
export interface McpRow {
  name: string
  entryId: string
  transport: string
  target: string
  disabled: boolean
  fiber: string | null
  tools: McpTool[]
  /** Sum of the enabled tools' schema cost. */
  tokens: number
}

/** What an install string was recognised as. */
export interface InstallPlan {
  kind: 'github' | 'git' | 'archive' | 'file' | 'shell'
  label: string
  source: string
  ref?: string
  sub?: string
  /** Exactly what will run, shown before anything does. */
  plan: string
  candidates: InstallCandidate[]
}

/** One skill found inside a staged source. */
export interface InstallCandidate {
  /** Path relative to the staged root. */
  path: string
  /** Frontmatter name — the directory it will be installed as. */
  name: string
  description: string
}

/** One post-install check. */
export interface VerifyCheck {
  key: 'skillMd' | 'frontmatter' | 'executable' | 'registry'
  ok: boolean
  detail: string
}

/** One entry in the skill directory the Browse button opens. */
export interface DirectoryEntry {
  name: string
  description: string
  source: string
  install: string
  /** Pinned revision, when the registry declares one. */
  version: string | null
  installed: boolean
  /** Curated by this deployment, or merely visible from an upstream index. */
  curated: boolean
}
