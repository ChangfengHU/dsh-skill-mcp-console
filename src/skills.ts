/**
 * Skill discovery across every root on disk.
 *
 * dsh loads skills from its own roots, but a machine that also runs Claude
 * Code, Codex or Gemini keeps skills in those agents' roots too, and the
 * shared `~/.agents/skills` layer is where cross-agent skills land. The
 * Claude Code desktop app only lists one namespace and its users have filed
 * that as a bug — a skill you can invoke but cannot see is worse than one
 * that is missing. So this scans all of them and labels each row with where
 * it came from.
 *
 * @module dsh-skill-mcp-console/skills
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import type { SkillRow } from './wire.ts'

/** Roots to scan, in the order the panel groups them. */
const ROOTS: { path: (home: string) => string; origin: string }[] = [
  { path: h => join(h, '.agents', 'skills'), origin: 'agents' },
  { path: h => join(h, '.dsh', 'skills'), origin: 'dsh' },
  { path: h => join(h, '.claude', 'skills'), origin: 'claude' },
  { path: h => join(h, '.codex', 'skills'), origin: 'codex' },
  { path: h => join(h, '.gemini', 'skills'), origin: 'gemini' },
  { path: h => join(h, '.opencode', 'skills'), origin: 'opencode' },
]

/** Files under a skill directory that are never part of the skill. */
const IGNORED = new Set(['node_modules', '.git', '.DS_Store'])

/** Display a path with the home prefix collapsed back to `~`. */
export function tildify(path: string, home: string): string {
  return path === home || path.startsWith(home + sep) ? '~' + path.slice(home.length) : path
}

/**
 * Pull `name` and `description` out of a SKILL.md YAML frontmatter block.
 *
 * Deliberately not a YAML parser: the two fields we need are scalars at the
 * top level, `description` is routinely a folded multi-line block, and
 * pulling in a parser to read two keys would make every skill's frontmatter
 * a chance to throw. Anything we cannot read falls back to the directory
 * name, which is what dsh resolves `/name` against anyway.
 */
export function parseFrontmatter(text: string): { name: string; description: string } {
  const out = { name: '', description: '' }
  if (!text.startsWith('---')) return out
  const end = text.indexOf('\n---', 3)
  if (end === -1) return out
  const lines = text.slice(text.indexOf('\n') + 1, end).split('\n')
  let key: 'name' | 'description' | null = null
  const buf: string[] = []
  const flush = () => {
    if (key) out[key] = buf.join(' ').trim().replace(/^["']|["']$/g, '')
    buf.length = 0
  }
  for (const line of lines) {
    const m = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line)
    if (m) {
      flush()
      key = m[1] === 'name' || m[1] === 'description' ? m[1] : null
      // `description: >-` and friends carry their value on the following
      // indented lines, so an empty remainder means "keep reading".
      if (key && m[2] && !/^[|>]/.test(m[2])) buf.push(m[2])
      continue
    }
    if (key && /^\s+\S/.test(line)) buf.push(line.trim())
  }
  flush()
  return out
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

/**
 * Scan every root and return one row per skill directory.
 *
 * A directory without a readable `SKILL.md` is still returned, carrying its
 * `problem` — those are exactly the ones worth showing, because from inside
 * a session they are simply absent with no explanation.
 */
export async function scanSkills(home = homedir()): Promise<SkillRow[]> {
  const rows: SkillRow[] = []
  for (const root of ROOTS) {
    const rootPath = root.path(home)
    let entries
    try {
      entries = await readdir(rootPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED.has(entry.name)) continue
      const dir = join(rootPath, entry.name)
      const files = await listFiles(dir)
      let name = entry.name
      let description = ''
      let problem: string | null = null
      if (!files.includes('SKILL.md')) {
        problem = '目录里没有 SKILL.md,dsh 不会加载它'
      } else {
        try {
          const parsed = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf8'))
          name = parsed.name || entry.name
          description = parsed.description
          if (!parsed.name) problem = 'frontmatter 缺 name'
          else if (parsed.name !== entry.name) {
            // The registry keys on the directory name, so this loads as the
            // directory and the frontmatter name silently does nothing.
            problem = `frontmatter name「${parsed.name}」与目录名「${entry.name}」不一致`
          } else if (!parsed.description) problem = 'frontmatter 缺 description,模型不会自动调用它'
        } catch (error) {
          problem = `SKILL.md 读不出来:${(error as Error).message}`
        }
      }
      rows.push({
        id: entry.name,
        name,
        description,
        dir,
        root: tildify(rootPath, home),
        origin: root.origin,
        updatedAt: await newestMtime(dir, files),
        files,
        problem,
      })
    }
  }
  rows.sort((a, b) => a.origin.localeCompare(b.origin) || a.id.localeCompare(b.id))
  return rows
}

/** Cap on the file text the detail pane will load. */
const MAX_FILE_BYTES = 256 * 1024

/**
 * Read one file from inside one skill directory.
 *
 * `dir` is re-resolved and the result checked to still sit under the skill
 * directory, so a `..` in the requested path cannot walk out of it.
 */
export async function readSkillFile(dir: string, relPath: string): Promise<string> {
  const base = resolve(dir)
  const full = resolve(base, relPath)
  if (full !== base && !full.startsWith(base + sep)) throw new Error('path escapes the skill directory')
  const info = await stat(full)
  if (info.size > MAX_FILE_BYTES) return `(文件 ${Math.round(info.size / 1024)} KB,超过 ${MAX_FILE_BYTES / 1024} KB 不在面板里展开)`
  return readFile(full, 'utf8')
}
