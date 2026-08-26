/**
 * Section labels. The harness locale registry takes `en` and `zh` today, and
 * only the two nav labels go through it — the panel body ships its copy
 * inline, because translating it before anyone else runs the plugin would be
 * maintaining two versions of text that is still moving.
 *
 * @module dsh-skill-mcp-console/client/locales
 */

/** Keys this plugin's dictionary defines. */
export type ConsoleLocaleKey = 'skillsNav' | 'mcpNav'

/** English labels. */
export const en: Record<ConsoleLocaleKey, string> = {
  skillsNav: 'Skills',
  mcpNav: 'MCP',
}

/** Chinese labels. */
export const zh: Record<ConsoleLocaleKey, string> = {
  skillsNav: '技能',
  mcpNav: 'MCP',
}
