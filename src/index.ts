/**
 * `dsh-plugin-station` — Skills and MCP as two top-level Settings sections.
 *
 * Why this exists, given how many capability panels the ecosystem already
 * has: every one measured before writing it fails at least one of these, and
 * all of them are load-bearing for a dsh reached over a domain rather than
 * `localhost`.
 *
 * - **Top level.** Registers into `settings.section`, not
 *   `settings.plugins.tab` — a panel nested inside Settings → Plugins is a
 *   panel nobody finds.
 * - **No loopback fence.** Several skill managers refuse any request whose
 *   `Host` header is not `localhost`. That is a correct default for a plugin
 *   that renames files under skill roots, and fatal behind a tunnel. This
 *   one reads through the Remote seam the app already authenticates.
 * - **Shadowing made visible.** dsh resolves duplicate skill names
 *   first-wins and, in its own words, "there is no API to inspect all
 *   shadowed definitions". Scanning the filesystem is the only way to see
 *   which copies lost, and this panel says so per row.
 * - **Universal `mcpServers`.** dsh stores cordis patch entries; the rest of
 *   the world writes `mcpServers`. The JSON view reads and writes the
 *   world's dialect and translates on save.
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`).
 *
 * @module dsh-plugin-station
 */

import type { Context } from '@deepseek-ai/cordis'
import { PluginStationService } from './service.ts'

export const name = 'plugin-station'

/** The facts the panels read: composition entries and the tool registry. */
export const inject = ['tools', 'loader']

export { PluginStationService } from './service.ts'
export {
  ROOTS, parseFrontmatter, readSkillFile, removeSkill, rootsFor,
  scanSkills, setSkillState, stateOf, tildify,
} from './skills.ts'
export {
  MCP_CLIENT_MODULE, backup, fromUniversal, loadPatch, phaseOf, policyPath, readToolPolicy,
  setDisabled, toUniversal, writeToolPolicy,
} from './mcpconfig.ts'
export {
  cleanup, createSkill, detect, findSkills, peek, place, run, runShell, stage,
  uploadSkill, verify,
} from './install.ts'
export { estimateToolTokens, estimateTokens, formatTokens } from './tokens.ts'
export { CONSOLE_INVOCATIONS, METHODS, PKG } from './wire.ts'
export type {
  DirectoryEntry, InstallCandidate, InstallPlan, McpRow, McpTool, SkillRow,
  SkillState, VerifyCheck,
} from './wire.ts'
export type { Frontmatter } from './skills.ts'
export type { ToolPolicy, UniversalServer } from './mcpconfig.ts'

/**
 * Mount the Remote service both panels call.
 *
 * @param ctx - context carrying the tool registry and the loader.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(PluginStationService)
}
