/**
 * Skill discovery, shadow resolution, and the four-state policy.
 *
 * Two things here that no other panel does.
 *
 * **Shadowing.** dsh resolves duplicate skill names first-wins, and its own
 * registry README is explicit: "a nearer layer shadows a farther one
 * silently; there is no API to inspect all shadowed definitions." So a
 * machine carrying `fleet-proxy-switch` in both `~/.agents/skills` and
 * `~/.claude/skills` runs one of them and cannot tell you which. Scanning
 * the filesystem is the only way to see the losers, and saying which copy
 * wins is the single most useful thing this panel can do.
 *
 * **Root honesty.** dsh's own filesystem provider reads project and user
 * roots — `.agents/skills` and `.dsh/skills`. The Claude Code, Codex,
 * Gemini and OpenCode roots load only when a bridging plugin registers them,
 * so rows from those roots are marked as such instead of being presented as
 * equals. Listing a skill the agent cannot reach is the bug this panel
 * exists to expose, not to commit.
 *
 * @module dsh-skill-mcp-console/skills
 */

import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { estimateTokens } from './tokens.ts'
import type { SkillRow, SkillState } from './wire.ts'

/**
 * Skill roots, nearest layer first.
 *
 * `native: true` means dsh's own filesystem provider reads it. The others
 * are other agents' roots — real skills on disk, reachable only when a
 * bridging plugin registers them, and labelled that way in the panel.
 */
export const ROOTS: { rel: string; origin: string; native: boolean }[] = [
  { rel: '.agents/skills', origin: 'agents', native: true },
  { rel: '.dsh/skills', origin: 'dsh', native: true },
  { rel: '.claude/skills', origin: 'claude', native: false },
  { rel: '.codex/skills', origin: 'codex', native: false },
  { rel: '.gemini/skills', origin: 'gemini', native: false },
  { rel: '.opencode/skills', origin: 'opencode', native: false },
]

/** Never part of a skill. */
const IGNORED = new Set(['node_modules', '.git', '.DS_Store', '.smc-backup'])

/** Cap on the file text the detail pane will load. */
const MAX_FILE_BYTES = 256 * 1024

/** Display a path with the home prefix collapsed back to `~`. */
export function tildify(path: string, home: string): string {
  return path === home || path.startsWith(home + sep) ? '~' + path.slice(home.length) : path
}

/**
 * Every root to scan: the workspace's own `.agents/skills` (which dsh loads
 * and every other panel forgets) followed by the home roots.
 */
export function rootsFor(home: string, workspace?: string): { path: string; origin: string; native: boolean }[] {
  const list: { path: string; origin: string; native: boolean }[] = []
  const seen = new Set<string>()
  const push = (path: string, origin: string, native: boolean) => {
    // Dedupe by resolved path. A dsh started in the home directory makes the
    // workspace root and the user root the same directory, and scanning it
    // twice produced a second row for every skill — the second one marked as
    // shadowing the first, which is nonsense: a directory cannot shadow itself.
    const key = resolve(path)
    if (seen.has(key)) return
    seen.add(key)
    list.push({ path, origin, native })
  }
  if (workspace) push(join(workspace, '.agents', 'skills'), 'workspace', true)
  for (const root of ROOTS) push(join(home, root.rel), root.origin, root.native)
  return list
}

/** Frontmatter fields this panel reads and writes. */
export interface Frontmatter {
  name: string
  description: string
  /** `disable-model-invocation: true` — the model can no longer load it. */
  disableModel: boolean
  /** `user-invocable: false` — `/name` no longer offers it. */
  userInvocable: boolean
  /** Raw text of the frontmatter block, without the `---` fences. */
  raw: string
  /** Byte offset just past the closing fence, or -1 when there is no block. */
  bodyStart: number
}

/**
 * Read the frontmatter fields the panel needs.
 *
 * Deliberately not a YAML parse: `description` is routinely a folded
 * multi-line block, the file is the user's, and a strict parser turns every
 * unusual-but-valid frontmatter into a row that cannot render. Anything
 * unreadable falls back to the directory name, which is what dsh resolves
 * `/name` against anyway.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const out: Frontmatter = { name: '', description: '', disableModel: false, userInvocable: true, raw: '', bodyStart: -1 }
  if (!text.startsWith('---')) return out
  const close = text.indexOf('\n---', 3)
  if (close === -1) return out
  const open = text.indexOf('\n') + 1
  out.raw = text.slice(open, close + 1)
  out.bodyStart = close + 4
  let key: 'name' | 'description' | null = null
  const buf: string[] = []
  const flush = () => {
    if (key) out[key] = buf.join(' ').trim().replace(/^["']|["']$/g, '')
    buf.length = 0
  }
  for (const line of out.raw.split('\n')) {
    const match = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line)
    if (match) {
      flush()
      const [, field, value] = match
      key = field === 'name' || field === 'description' ? field : null
      if (field === 'disable-model-invocation') out.disableModel = /^true$/i.test(value.trim())
      if (field === 'user-invocable') out.userInvocable = !/^false$/i.test(value.trim())
      if (key && value && !/^[|>]/.test(value)) buf.push(value)
      continue
    }
    if (key && /^\s+\S/.test(line)) buf.push(line.trim())
  }
  flush()
  return out
}

/** Derive the panel's four-state label from the two policy booleans. */
export function stateOf(front: Frontmatter, shortened: boolean): SkillState {
  if (front.disableModel && !front.userInvocable) return 'off'
  if (front.disableModel) return 'user-only'
  return shortened ? 'name-only' : 'on'
}

/** Relative paths inside a skill directory, `SKILL.md` first, capped. */
async function listFiles(dir: string, limit = 200): Promise<string[]> {
  const found: string[] = []
  const walk = async (current: string): Promise<void> => {
    if (found.length >= limit) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      if (IGNORED.has(entry.name)) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else found.push(relative(dir, full))
    }
  }
  await walk(dir)
  found.sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)))
  return found
}

/** Newest mtime under a skill directory — when the skill last changed. */
async function newestMtime(dir: string, files: string[]): Promise<number> {
  let newest = 0
  for (const rel of files.slice(0, 40)) {
    try {
      const info = await stat(join(dir, rel))
      if (info.mtimeMs > newest) newest = info.mtimeMs
    } catch {
      // A file that vanished between listing and stat just does not count.
    }
  }
  return newest
}

/** Original descriptions parked by the `name-only` state, keyed by directory. */
export interface OverrideFile {
  /** `{ [skillDir]: originalDescription }` */
  shortened: Record<string, string>
}

/** Where the parked descriptions live. */
export function overridePath(home: string): string {
  return join(home, '.dsh', 'skill-mcp-console.json')
}

/** Read the override file, tolerating absence and corruption. */
export async function readOverrides(home: string): Promise<OverrideFile> {
  try {
    const parsed = JSON.parse(await readFile(overridePath(home), 'utf8')) as Partial<OverrideFile>
    return { shortened: parsed.shortened ?? {} }
  } catch {
    return { shortened: {} }
  }
}

/** Write the override file. */
export async function writeOverrides(home: string, data: OverrideFile): Promise<void> {
  await writeFile(overridePath(home), JSON.stringify(data, null, 2), 'utf8')
}

/**
 * Scan every root, resolve shadowing, and price each description.
 *
 * Rows come back in root order — nearest first — and each carries
 * `shadowedBy` when an earlier root already claimed its name. A directory
 * without a readable `SKILL.md` is still returned with its `problem`, which
 * is exactly the case worth showing: from inside a session it is simply
 * absent, with no explanation anywhere.
 */
export async function scanSkills(home = homedir(), workspace?: string): Promise<SkillRow[]> {
  const overrides = await readOverrides(home)
  const rows: SkillRow[] = []
  const winner = new Map<string, string>()

  for (const root of rootsFor(home, workspace)) {
    let entries
    try {
      entries = await readdir(root.path, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      // A dot-directory under a skill root is bookkeeping — editor state, a
      // vendored cache, this plugin's own backups — never a skill.
      if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED.has(entry.name)) continue
      const dir = join(root.path, entry.name)
      const files = await listFiles(dir)
      let front: Frontmatter = { name: entry.name, description: '', disableModel: false, userInvocable: true, raw: '', bodyStart: -1 }
      let problem: string | null = null

      if (!files.includes('SKILL.md')) {
        problem = 'noSkillMd'
      } else {
        try {
          front = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf8'))
          if (!front.name) problem = 'noName'
          // The registry keys on the directory name, so a mismatched
          // frontmatter name silently does nothing at all.
          else if (front.name !== entry.name) problem = 'nameMismatch'
          else if (!front.description) problem = 'noDescription'
        } catch {
          problem = 'unreadable'
        }
      }

      const shortened = overrides.shortened[dir] !== undefined
      const state = stateOf(front, shortened)
      const active = state !== 'off' && problem !== 'noSkillMd' && problem !== 'unreadable'
      const shadowedBy = active ? winner.get(entry.name) ?? null : null
      if (active && !winner.has(entry.name)) winner.set(entry.name, tildify(root.path, home))

      rows.push({
        id: entry.name,
        name: front.name || entry.name,
        description: front.description,
        originalDescription: overrides.shortened[dir] ?? null,
        dir,
        root: tildify(root.path, home),
        origin: root.origin,
        native: root.native,
        state,
        tokens: estimateTokens(front.description),
        fullTokens: estimateTokens(overrides.shortened[dir] ?? front.description),
        updatedAt: await newestMtime(dir, files),
        files,
        problem,
        shadowedBy,
      })
    }
  }
  return rows
}

/**
 * Read one file from inside one skill directory.
 *
 * The path is re-resolved and checked to still sit under the skill
 * directory, so a `..` in the request cannot walk out of it.
 */
export async function readSkillFile(dir: string, relPath: string): Promise<string> {
  const base = resolve(dir)
  const full = resolve(base, relPath)
  if (full !== base && !full.startsWith(base + sep)) throw new Error('path escapes the skill directory')
  const info = await stat(full)
  if (info.size > MAX_FILE_BYTES) return `(${Math.round(info.size / 1024)} KB — too large to open here)`
  return readFile(full, 'utf8')
}

/** Rewrite one frontmatter key, dropping it when the value is undefined. */
function setKey(raw: string, key: string, value: string | undefined): string {
  const lines = raw.split('\n')
  const index = lines.findIndex(line => new RegExp(`^${key}\\s*:`).test(line))
  if (value === undefined) return index === -1 ? raw : lines.filter((_, i) => i !== index).join('\n')
  if (index === -1) return raw.replace(/\n?$/, `\n${key}: ${value}\n`).replace(/\n\n+$/, '\n')
  lines[index] = `${key}: ${value}`
  return lines.join('\n')
}

/**
 * Replace the `description:` scalar, collapsing any folded block it had.
 *
 * A folded description spans an unknown number of indented continuation
 * lines, so the whole run is removed before the single-line replacement goes
 * in — otherwise the leftover lines become stray YAML.
 */
function setDescription(raw: string, value: string): string {
  const lines = raw.split('\n')
  const start = lines.findIndex(line => /^description\s*:/.test(line))
  if (start === -1) return raw.replace(/\n?$/, `\ndescription: ${value}\n`)
  let end = start + 1
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++
  lines.splice(start, end - start, `description: ${value}`)
  return lines.join('\n')
}

/** Backup directory kept beside the skill so a bad edit is recoverable. */
function backupDir(dir: string): string {
  return join(dir, '.smc-backup')
}

/**
 * Move a skill to one of the four states by editing its `SKILL.md`
 * frontmatter, which is the seam dsh's own filesystem provider reads.
 *
 * `name-only` has no policy key in dsh: the registry has exactly two
 * booleans. It is implemented by parking the full description in this
 * plugin's override file and writing the skill's own name in its place, so
 * the model still knows the skill exists but stops paying for the prose.
 * Reverting restores the original text verbatim.
 *
 * Every write copies the file into `<skill>/.smc-backup/` first.
 */
export async function setSkillState(home: string, dir: string, state: SkillState): Promise<void> {
  const file = join(dir, 'SKILL.md')
  const text = await readFile(file, 'utf8')
  const front = parseFrontmatter(text)
  if (front.bodyStart === -1) throw new Error('SKILL.md has no frontmatter block to edit')

  const backups = backupDir(dir)
  await writeFile(join(dir, '.smc-backup-probe'), '', 'utf8').catch(() => {})
  await rm(join(dir, '.smc-backup-probe'), { force: true }).catch(() => {})
  await (await import('node:fs/promises')).mkdir(backups, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await writeFile(join(backups, `SKILL.md.${stamp}`), text, 'utf8')

  const overrides = await readOverrides(home)
  let raw = front.raw

  if (state === 'name-only') {
    if (overrides.shortened[dir] === undefined) overrides.shortened[dir] = front.description
    raw = setDescription(raw, overrides.shortened[dir] || front.name)
    raw = setKey(raw, 'disable-model-invocation', undefined)
    raw = setKey(raw, 'user-invocable', undefined)
    // The short form is the skill's own name: enough for the model to know
    // it exists and ask for it, without the paragraph it used to carry.
    raw = setDescription(raw, front.name || 'skill')
  } else {
    if (overrides.shortened[dir] !== undefined) {
      raw = setDescription(raw, overrides.shortened[dir])
      delete overrides.shortened[dir]
    }
    raw = setKey(raw, 'disable-model-invocation', state === 'user-only' || state === 'off' ? 'true' : undefined)
    raw = setKey(raw, 'user-invocable', state === 'off' ? 'false' : undefined)
  }

  const body = text.slice(front.bodyStart)
  await writeFile(file, `---\n${raw.replace(/\n+$/, '\n')}---${body}`, 'utf8')
  await writeOverrides(home, overrides)
}

/** Remove one skill directory, moving it to a trash folder rather than deleting. */
export async function removeSkill(home: string, dir: string): Promise<string> {
  const trash = join(home, '.dsh', 'skill-trash')
  await (await import('node:fs/promises')).mkdir(trash, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(trash, `${dir.split(sep).pop()}.${stamp}`)
  await rename(dir, target)
  return target
}
