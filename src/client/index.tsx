/**
 * Browser half: mounts the `skillMcpConsole` Remote contribution and
 * registers two TOP-LEVEL Settings sections.
 *
 * `settings.section` is the deliberate choice. The same panels registered
 * into `settings.plugins.tab` would sit two clicks deep inside Settings →
 * Plugins, which is where the ecosystem's other MCP panels live and why
 * people report not being able to find them.
 *
 * @module dsh-skill-mcp-console/client
 */

import { CONSOLE_REMOTE, unwrap } from './remote.ts'
import { installStyles } from './styles.ts'
import { SkillsSection } from './SkillsSection.tsx'
import { McpSection } from './McpSection.tsx'
import { en, zh, type ConsoleLocaleKey } from './locales.ts'
import type { McpRow, SkillRow } from '../wire.ts'

export { SkillsSection } from './SkillsSection.tsx'
export { McpSection } from './McpSection.tsx'

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skillMcpConsole'

/** Matches the package name, the graph row id, and the bundle id. */
export const name = 'dsh-skill-mcp-console'

/** `remote.skillMcpConsole` appears once this plugin mounts its contribution. */
export const inject = ['slots', 'locale', 'remote']

export type { ConsoleLocaleKey }

/**
 * Client plugin body: dictionaries, stylesheet, Remote mount, two sections.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: any): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-mcp-console: dictionaries')
  ctx.effect(() => installStyles(), 'skill-mcp-console: stylesheet')

  await ctx.remote.$mount(CONSOLE_REMOTE)

  const t = ctx.locale.bind(NS)
  const remote = () => ctx.get('remote.skillMcpConsole')

  const skillsApi = {
    skills: async (): Promise<SkillRow[]> =>
      JSON.parse(unwrap<string>(await remote().skills(), 'skills')),
    skillFile: async (dir: string, path: string): Promise<string> =>
      JSON.parse(unwrap<string>(await remote().skillFile(JSON.stringify({ dir, path })), 'skillFile')).text,
  }

  const mcpApi = {
    mcp: async (): Promise<McpRow[]> =>
      JSON.parse(unwrap<string>(await remote().mcp(), 'mcp')),
    mcpJson: async (): Promise<string> =>
      unwrap<string>(await remote().mcpJson(), 'mcpJson'),
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-mcp-console-skills',
    order: 26,
    label: () => t('skillsNav'),
    locale: NS,
    inject: () => ({ api: skillsApi }),
  }, SkillsSection))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-mcp-console-mcp',
    order: 27,
    label: () => t('mcpNav'),
    locale: NS,
    inject: () => ({ api: mcpApi }),
  }, McpSection))
}
