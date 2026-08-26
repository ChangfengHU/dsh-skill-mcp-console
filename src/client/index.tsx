/**
 * Browser half: mounts the `skillMcpConsole` Remote contribution and
 * registers two TOP-LEVEL Settings sections.
 *
 * `settings.section` is the deliberate choice. The same panels registered
 * into `settings.plugins.tab` would sit two clicks deep inside Settings →
 * Plugins, which is where the ecosystem's other capability panels live and
 * why people report not finding them.
 *
 * @module dsh-skill-mcp-console/client
 */

import type { DirectoryEntry, InstallCandidate, InstallPlan, McpRow, SkillRow, SkillState, VerifyCheck } from '../wire.ts'
import { McpSection, type McpApi } from './McpSection.tsx'
import { SkillsSection, type SkillsApi } from './SkillsSection.tsx'
import { en, zh, type ConsoleLocaleKey } from './locales.ts'
import { CONSOLE_REMOTE, unwrap } from './remote.ts'
import { installStyles } from './styles.ts'
import { fill } from './ui.tsx'

export { SkillsSection } from './SkillsSection.tsx'
export { McpSection } from './McpSection.tsx'
export type { ConsoleLocaleKey }

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skillMcpConsole'

/** Matches the package name, the graph row id, and the bundle id. */
export const name = 'dsh-skill-mcp-console'

/** `remote.skillMcpConsole` appears once this plugin mounts its contribution. */
export const inject = ['slots', 'locale', 'remote']

/**
 * Client plugin body: dictionaries, stylesheet, Remote mount, two sections.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: any): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-mcp-console: dictionaries')
  ctx.effect(() => installStyles(), 'skill-mcp-console: stylesheet')

  await ctx.remote.$mount(CONSOLE_REMOTE)

  const bound = ctx.locale.bind(NS)
  /** Translate, then substitute `{placeholders}`. */
  const t = (key: ConsoleLocaleKey, params?: Record<string, string | number>) => fill(String(bound(key) ?? key), params)

  const remote = () => ctx.get('remote.skillMcpConsole')
  const call = async <T,>(method: string, payload?: unknown): Promise<T> => {
    const service = remote()
    const result = payload === undefined ? await service[method]() : await service[method](JSON.stringify(payload))
    return JSON.parse(unwrap<string>(result, method)) as T
  }

  const install = {
    detectInstall: (input: string) => call<InstallPlan>('detectInstall', { input }),
    peekInstall: async (plan: InstallPlan) => (await call<{ text: string }>('peekInstall', { plan })).text,
    stageInstall: (plan: InstallPlan) => call<{ token: string; candidates: InstallCandidate[]; log: string }>('stageInstall', { plan }),
    runInstall: (token: string, chosen: string[]) =>
      call<{ code: number; log: string; installed: string[]; checks: { dir: string; checks: VerifyCheck[] }[] }>('runInstall', { token, chosen }),
    createSkill: (name_: string, description: string, instructions: string) =>
      call<{ dir: string; checks: VerifyCheck[] }>('createSkill', { name: name_, description, instructions }),
    uploadSkill: (filename: string, base64: string) =>
      call<{ dir: string; checks: VerifyCheck[] }>('uploadSkill', { filename, base64 }),
    directory: () => call<{ registry: string; entries: DirectoryEntry[]; error: string | null }>('directory'),
  }

  const skillsApi: SkillsApi = {
    ...install,
    skills: () => call<SkillRow[]>('skills'),
    skillFile: async (dir, path) => (await call<{ text: string }>('skillFile', { dir, path })).text,
    setSkillState: async (dir, state: SkillState) => { await call('setSkillState', { dir, state }) },
    removeSkill: async dir => (await call<{ trash: string }>('removeSkill', { dir })).trash,
    insertPrompt: text => insertIntoComposer(text),
  }

  const mcpApi: McpApi = {
    mcp: () => call<McpRow[]>('mcp'),
    mcpJson: async () => JSON.stringify(await call<unknown>('mcpJson'), null, 2),
    saveMcpJson: text => call<{ added: string[]; updated: string[]; removed: string[]; backup: string }>('saveMcpJson', { text }),
    setMcpDisabled: async (name_, disabled) => { await call('setMcpDisabled', { name: name_, disabled }) },
    setToolDisabled: async (server, tool, disabled) => { await call('setToolDisabled', { server, tool, disabled }) },
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-mcp-console-skills',
    order: 26,
    label: () => t('skillsNav'),
    locale: NS,
    inject: () => ({ api: skillsApi, t }),
  }, SkillsSection))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-mcp-console-mcp',
    order: 27,
    label: () => t('mcpNav'),
    locale: NS,
    inject: () => ({ api: mcpApi, t }),
  }, McpSection))
}

/**
 * Drop text into the chat composer.
 *
 * There is no published seam for this, so it goes through the DOM: find the
 * composer textarea, set its value the way React will notice, and fire the
 * events a controlled input listens for. It degrades to `false` rather than
 * throwing, and the caller falls back to the clipboard — a prompt on the
 * clipboard is a small inconvenience, a thrown error in a settings panel is
 * not.
 */
function insertIntoComposer(text: string): boolean {
  try {
    const field = document.querySelector<HTMLTextAreaElement>('textarea[placeholder], textarea')
    if (!field) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.focus()
    return true
  } catch {
    return false
  }
}
