/**
 * `dsh-skill-mcp-console` — Skills and MCP as two top-level Settings sections.
 *
 * Why this exists, given how many capability managers the ecosystem already
 * has: every one we measured fails at least one of these, and all four are
 * load-bearing for a deployment reached over a domain rather than localhost.
 *
 * - Top level. Registering into `settings.section`, not
 *   `settings.plugins.tab` — a panel nested inside Settings → Plugins is a
 *   panel nobody finds.
 * - No loopback fence. Several managers refuse any request whose `Host`
 *   header is not `localhost`, which is a correct default for a plugin that
 *   renames files under skill roots, and fatal for a dsh reached through a
 *   tunnel. This plugin reads through the Remote seam the app already
 *   authenticates, so it works wherever the app works.
 * - Both halves, one shell. Skills and MCP are the same question asked twice
 *   — what can this agent do — so they share one plugin and one vocabulary.
 * - Universal `mcpServers`. dsh stores cordis patch entries; the rest of the
 *   world writes `mcpServers`. The JSON view speaks the world's dialect.
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`).
 *
 * @module dsh-skill-mcp-console
 */

import type { Context } from '@deepseek-ai/cordis'
import { SkillMcpConsoleService } from './service.ts'

export const name = 'skill-mcp-console'

/** The facts the panels read: composition entries and the tool registry. */
export const inject = ['tools', 'loader']

export { SkillMcpConsoleService } from './service.ts'
export { scanSkills, readSkillFile, parseFrontmatter, tildify } from './skills.ts'
export type { SkillRow, McpRow } from './wire.ts'
export { CONSOLE_INVOCATIONS, PKG } from './wire.ts'

/**
 * Mount the Remote service both panels call.
 *
 * @param ctx - context carrying the tool registry and the loader.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(SkillMcpConsoleService)
}
