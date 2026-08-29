/**
 * Browser half: mounts the `skillMcp` Remote contribution and
 * registers two TOP-LEVEL Settings sections.
 *
 * `settings.section` is the deliberate choice. The same panels registered
 * into `settings.plugins.tab` would sit two clicks deep inside Settings →
 * Plugins, which is where the ecosystem's other capability panels live and
 * why people report not finding them.
 *
 * @module dsh-skill-mcp/client
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
export const NS = 'settings.skillMcp'

/** Matches the package name, the graph row id, and the bundle id. */
export const name = 'dsh-skill-mcp-console'

/** `remote.skillMcp` appears once this plugin mounts its contribution. */
export const inject = ['slots', 'locale', 'remote']

/**
 * Client plugin body: dictionaries, stylesheet, Remote mount, two sections.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: any): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-mcp: dictionaries')
  ctx.effect(() => installStyles(), 'skill-mcp: stylesheet')

  await ctx.remote.$mount(CONSOLE_REMOTE)

  const bound = ctx.locale.bind(NS)
  /** Translate, then substitute `{placeholders}`. */
  const t = (key: ConsoleLocaleKey, params?: Record<string, string | number>) => fill(String(bound(key) ?? key), params)

  const remote = () => ctx.get('remote.skillMcp')
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
    directory: (query: string, topic: string) =>
      call<{ topics: string[]; topic: string; entries: DirectoryEntry[]; error: string | null }>('directory', { query, topic }),
    repoReadme: async (repo: string) => (await call<{ text: string }>('repoReadme', { repo })).text,
  }

  const skillsApi: SkillsApi = {
    ...install,
    skills: () => call<SkillRow[]>('skills'),
    skillFile: async (dir, path) => (await call<{ text: string }>('skillFile', { dir, path })).text,
    setSkillState: async (dir, state: SkillState) => { await call('setSkillState', { dir, state }) },
    removeSkill: async dir => (await call<{ trash: string }>('removeSkill', { dir })).trash,
    insertPrompt: text => startNewSessionWith(text),
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
    id: 'skill-mcp-skills',
    order: 26,
    label: () => t('skillsNav'),
    locale: NS,
    inject: () => ({ api: skillsApi, t }),
  }, SkillsSection))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-mcp-mcp',
    order: 27,
    label: () => t('mcpNav'),
    locale: NS,
    inject: () => ({ api: mcpApi, t }),
  }, McpSection))
}

/**
 * Open a new session and put the prompt in its composer.
 *
 * There is no published seam for this, so it walks the same path a person
 * would: close Settings, start a session, then fill the composer. Setting a
 * React-controlled input needs the native value setter — assigning `.value`
 * updates the DOM and leaves React's state behind, so the first keystroke
 * would wipe it.
 *
 * It stops short of sending. The prompt is an opening move, and the agent is
 * about to ask questions; submitting on the user's behalf takes away the
 * chance to add what it should already know.
 *
 * Returns false when any step is missing, and the caller falls back to the
 * clipboard — a prompt on the clipboard is a small inconvenience, a thrown
 * error inside a settings panel is not.
 */
function startNewSessionWith(text: string): boolean {
  const click = (predicate: (el: HTMLElement) => boolean): boolean => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button,[role=button]'))) {
      if (predicate(el)) { el.click(); return true }
    }
    return false
  }
  const label = (el: HTMLElement) => `${el.getAttribute('aria-label') ?? ''} ${el.innerText ?? ''}`.trim()

  try {
    // Close whatever dialog we are inside, so the composer is reachable.
    // The close control labels itself by text in some builds and by
    // aria-label in others, so both are checked.
    click(el => /^(close|关闭|×|✕)$/i.test(label(el).trim()))

    window.setTimeout(() => {
      // Prefer the workspace-scoped button; the generic one is the fallback.
      if (!click(el => /new session in/i.test(label(el)))) click(el => /new session|新会话|新建会话/i.test(label(el)))

      window.setTimeout(() => {
        const field = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'))
          .find(el => el.offsetParent !== null && !el.closest('.dsm-root') && !el.closest('.dsm-modal'))
        if (!field) return
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(field, text)
        field.dispatchEvent(new Event('input', { bubbles: true }))
        field.focus()
      }, 600)
    }, 250)
    return true
  } catch {
    return false
  }
}
