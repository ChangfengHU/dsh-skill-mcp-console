/**
 * Installing skills: recognise what the user pasted, show what will run,
 * run it, then check whether anything actually landed.
 *
 * The last step is the point. A skill installer that prints a menu and
 * installs nothing still exits 0, and every "success" built on an exit code
 * is a guess. So an install here finishes with four checks against the
 * filesystem and the registry, and the panel reports what those found, not
 * what the process claimed.
 *
 * GitHub is the default form because that is where skills live. The
 * `bash <(curl …)` form is supported too — it is what several publishers
 * emit — and it means this panel can run arbitrary shell. That is a
 * deliberate, declared capability: the command is fetched and shown before
 * anything executes, never after.
 *
 * @module dsh-skill-mcp-console/install
 */

import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrontmatter } from './skills.ts'
import type { InstallCandidate, InstallPlan, VerifyCheck } from './wire.ts'

/**
 * A directory name this plugin is willing to create under a skill root.
 *
 * The guard exists because the empty string is a valid-looking name that
 * resolves to the root itself. Everything else here is ordinary hygiene.
 */
export function isSafeSkillName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) && name !== '.' && name !== '..'
}

/** How long any one install step may run. */
const STEP_TIMEOUT_MS = 180_000
/** Cap on a fetched script or archive. */
const MAX_FETCH_BYTES = 40 * 1024 * 1024

/** Run one command, capturing merged output. Never throws on a non-zero exit. */
export function run(command: string, args: string[], cwd?: string): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const take = (chunk: Buffer) => { if (out.length < 200_000) out += chunk.toString('utf8') }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += `\n(timed out after ${STEP_TIMEOUT_MS / 1000}s)` }, STEP_TIMEOUT_MS)
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, out: out + String(error) }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code: code ?? -1, out }) })
  })
}

/** Fetch a URL as text, bounded. */
async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`)
  const text = await response.text()
  if (text.length > MAX_FETCH_BYTES) throw new Error('response too large')
  return text
}

/** Fetch a URL into a file, bounded. */
async function fetchFile(url: string, dest: string): Promise<number> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error('response too large')
  await writeFile(dest, buffer)
  return buffer.byteLength
}

/** `owner/repo`, optionally with a branch and a subdirectory. */
interface RepoRef { owner: string; repo: string; ref?: string; sub?: string }

/**
 * Recognise every form a skill install arrives in.
 *
 * Ordered from the most specific pattern to the most permissive, so a
 * GitHub URL is never mistaken for a shell command, and an unrecognised
 * string falls through to "run this as a command" rather than being
 * rejected — a publisher's installer is free to look like anything.
 */
export function detect(input: string): InstallPlan {
  const text = input.trim()

  const gitClone = /^git\s+clone\s+(\S+)/.exec(text)
  if (gitClone) {
    const repo = parseRepo(gitClone[1])
    return { kind: 'git', label: `git clone · ${repo ? `${repo.owner}/${repo.repo}` : gitClone[1]}`, source: gitClone[1], plan: `git clone --depth 1 ${gitClone[1]} <tmp>`, candidates: [] }
  }

  const shell = /^(bash|sh|zsh)\s|^curl\s|\|\s*(bash|sh)\b|<\(/.test(text)
  if (shell) {
    const url = /(https?:\/\/[^\s'"()]+)/.exec(text)
    return { kind: 'shell', label: '安装脚本 · install script', source: url?.[1] ?? '', plan: text, candidates: [] }
  }

  const repo = parseRepo(text)
  if (repo) {
    return {
      kind: 'github',
      label: `GitHub · ${repo.owner}/${repo.repo}${repo.sub ? `/${repo.sub}` : ''}`,
      source: `${repo.owner}/${repo.repo}`,
      ref: repo.ref,
      sub: repo.sub,
      plan: `curl -fsSL https://codeload.github.com/${repo.owner}/${repo.repo}/tar.gz/${repo.ref ?? 'HEAD'} | tar xz`,
      candidates: [],
    }
  }

  if (/^https?:\/\//.test(text)) {
    const zip = /\.(zip|tgz|tar\.gz)(\?|$)/.test(text)
    return { kind: zip ? 'archive' : 'file', label: zip ? '压缩包 · archive' : 'SKILL.md · direct file', source: text, plan: `curl -fsSL ${text}`, candidates: [] }
  }

  return { kind: 'shell', label: '未识别,按命令执行 · unrecognised, run as a command', source: '', plan: text, candidates: [] }
}

/** Pull `owner/repo[/tree/ref/sub]` out of every GitHub spelling. */
function parseRepo(text: string): RepoRef | null {
  const cleaned = text.replace(/^github:/, '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  const parts = cleaned.split('/')
  if (parts.length < 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+$/.test(parts[1])) return null
  const ref: RepoRef = { owner: parts[0], repo: parts[1] }
  if (parts[2] === 'tree' && parts[3]) {
    ref.ref = parts[3]
    if (parts.length > 4) ref.sub = parts.slice(4).join('/')
  } else if (parts.length > 2) {
    ref.sub = parts.slice(2).join('/')
  }
  return ref
}

/**
 * Directories under `root` that hold a `SKILL.md`.
 *
 * Four levels, not two. Plenty of repositories nest their skills a plugin
 * deep — `<plugin>/skills/<name>/SKILL.md` is a common shape, and one such
 * repository with sixty-eight skills in it came back empty from a
 * two-level walk. The recursion stops at the first `SKILL.md` on a branch,
 * so the extra depth costs nothing on a flat repository.
 */
export async function findSkills(root: string, depth = 4, limit = 300, repoName = ''): Promise<InstallCandidate[]> {
  const found: InstallCandidate[] = []
  const walk = async (dir: string, rel: string, left: number): Promise<void> => {
    if (found.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md')) {
      const front = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => ''))
      // A skill at the repository root has no directory name to fall back on,
      // and a SKILL.md that names itself with `displayName` instead of `name`
      // parses to nothing. Both used to yield an empty name, and an empty name
      // makes `join(target, name)` the skill root itself — the install would
      // empty a repository over every skill on the machine.
      const name = front.name || rel.split('/').filter(Boolean).pop() || repoName || ''
      if (!isSafeSkillName(name)) return
      found.push({ path: rel || '.', name, description: front.description })
      return
    }
    if (left <= 0) return
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
      await walk(join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name, left - 1)
    }
  }
  await walk(root, '', depth)
  found.sort((a, b) => a.name.localeCompare(b.name))
  return found
}

/**
 * Stage what the plan points at into a temporary directory and list the
 * skills found there, so the panel can ask which ones to install. A GitHub
 * repository routinely carries a dozen; assuming one is how you end up
 * installing the wrong thing.
 */
export async function stage(plan: InstallPlan): Promise<{ dir: string; candidates: InstallCandidate[]; log: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'smc-install-'))
  let log = ''

  if (plan.kind === 'github') {
    const url = `https://codeload.github.com/${plan.source}/tar.gz/${plan.ref ?? 'HEAD'}`
    const tarball = join(dir, 'src.tgz')
    log += `→ fetch ${url}\n`
    const size = await fetchFile(url, tarball)
    log += `  ${Math.round(size / 1024)} KB\n→ extract\n`
    const extract = join(dir, 'src')
    await mkdir(extract, { recursive: true })
    const result = await run('tar', ['xzf', tarball, '-C', extract, '--strip-components=1'])
    log += result.out
    if (result.code !== 0) throw new Error(`tar exited ${result.code}\n${result.out}`)
    const base = plan.sub ? join(extract, plan.sub) : extract
    // A root-level SKILL.md borrows the repository's own name.
    const repoName = (plan.sub || plan.source).split('/').pop() ?? ''
    return { dir, candidates: await findSkills(base, 4, 300, repoName.replace(/\.(skill|git)$/i, '')), log }
  }

  if (plan.kind === 'git') {
    log += `→ git clone --depth 1 ${plan.source}\n`
    const extract = join(dir, 'src')
    const result = await run('git', ['clone', '--depth', '1', plan.source, extract])
    log += result.out
    if (result.code !== 0) throw new Error(`git exited ${result.code}\n${result.out}`)
    return { dir, candidates: await findSkills(extract, 4, 300, (plan.source.split('/').pop() ?? '').replace(/\.git$/i, '')), log }
  }

  if (plan.kind === 'archive') {
    const archive = join(dir, 'src.tgz')
    log += `→ fetch ${plan.source}\n`
    const size = await fetchFile(plan.source, archive)
    log += `  ${Math.round(size / 1024)} KB\n→ extract\n`
    const extract = join(dir, 'src')
    await mkdir(extract, { recursive: true })
    const zip = /\.zip(\?|$)/.test(plan.source)
    const result = zip ? await run('unzip', ['-q', archive, '-d', extract]) : await run('tar', ['xzf', archive, '-C', extract])
    log += result.out
    if (result.code !== 0) throw new Error(`extract exited ${result.code}\n${result.out}`)
    return { dir, candidates: await findSkills(extract), log }
  }

  if (plan.kind === 'file') {
    log += `→ fetch ${plan.source}\n`
    const text = await fetchText(plan.source)
    const front = parseFrontmatter(text)
    const name = front.name || 'downloaded-skill'
    const skillDir = join(dir, 'src', name)
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), text, 'utf8')
    log += `  ${text.length} bytes → ${name}/SKILL.md\n`
    return { dir, candidates: await findSkills(join(dir, 'src')), log }
  }

  // Shell: nothing is staged, because the script installs wherever it likes.
  // The panel diffs the target root before and after instead.
  return { dir, candidates: [], log }
}

/** Fetch the text of a script a shell plan is about to pipe into a shell. */
export async function peek(plan: InstallPlan): Promise<string> {
  if (plan.kind === 'shell' && plan.source) return fetchText(plan.source)
  if (plan.kind === 'github') return plan.plan
  return plan.plan
}

/**
 * Copy chosen candidates out of the staging directory into the target root.
 *
 * The skill lands under its **frontmatter** name rather than its source
 * directory name, because dsh keys the registry on the directory and a
 * mismatch between the two makes the skill silently unloadable.
 */
export async function place(stageDir: string, chosen: InstallCandidate[], target: string): Promise<string> {
  let log = ''
  await mkdir(target, { recursive: true })
  for (const candidate of chosen) {
    if (!isSafeSkillName(candidate.name)) throw new Error(`refusing to install under the name ${JSON.stringify(candidate.name)}`)
    const from = candidate.path === '.' ? join(stageDir, 'src') : join(stageDir, 'src', candidate.path)
    const to = join(target, candidate.name)
    await rm(to, { recursive: true, force: true })
    await cp(from, to, { recursive: true })
    log += `→ ${candidate.name} → ${to}\n`
  }
  return log
}

/** Run a shell plan, capturing everything it prints. */
export async function runShell(command: string, cwd: string): Promise<{ code: number; out: string }> {
  return run('bash', ['-c', command], cwd)
}

/** Discard a staging directory. */
export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

/**
 * The four checks that decide whether an install actually worked.
 *
 * The last one is the one that catches real failures: files can all be
 * present and correct while the skill still never loads, because dsh keys
 * the registry on the directory name and the frontmatter says something
 * else.
 */
export async function verify(dir: string, registryNames: string[]): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = []
  const name = dir.split('/').pop() ?? ''

  let text = ''
  try {
    text = await readFile(join(dir, 'SKILL.md'), 'utf8')
    checks.push({ key: 'skillMd', ok: true, detail: '' })
  } catch {
    checks.push({ key: 'skillMd', ok: false, detail: dir })
    return checks
  }

  const front = parseFrontmatter(text)
  checks.push({
    key: 'frontmatter',
    ok: Boolean(front.name && front.description),
    detail: front.name ? (front.description ? '' : 'description') : 'name',
  })

  let scripts = 0
  let executable = 0
  try {
    const entries = await readdir(join(dir, 'scripts'), { withFileTypes: true })
    const { stat } = await import('node:fs/promises')
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(sh|py|mjs)$/.test(entry.name)) continue
      scripts++
      const info = await stat(join(dir, 'scripts', entry.name))
      if (info.mode & 0o111) executable++
    }
  } catch {
    // No scripts directory is normal — most skills are one Markdown file.
  }
  checks.push({ key: 'executable', ok: scripts === 0 || executable === scripts, detail: scripts === 0 ? 'none' : `${executable}/${scripts}` })

  const registered = registryNames.includes(name)
  checks.push({
    key: 'registry',
    ok: registered,
    detail: registered ? '' : (front.name && front.name !== name ? `${front.name} ≠ ${name}` : name),
  })
  return checks
}

/** Write a hand-authored skill straight into a root. */
export async function createSkill(target: string, name: string, description: string, instructions: string): Promise<string> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error('name must be kebab-case: lowercase letters, digits and hyphens')
  const dir = join(target, name)
  await mkdir(dir, { recursive: true })
  const front = `---\nname: ${name}\ndescription: ${description.replace(/\n+/g, ' ').trim()}\n---\n\n`
  await writeFile(join(dir, 'SKILL.md'), front + instructions.trim() + '\n', 'utf8')
  return dir
}

/** Write an uploaded `.md` or archive into a root. */
export async function uploadSkill(target: string, filename: string, base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error('file too large')
  const dir = await mkdtemp(join(tmpdir(), 'smc-upload-'))
  try {
    if (/\.md$/i.test(filename)) {
      const text = buffer.toString('utf8')
      const front = parseFrontmatter(text)
      const name = front.name
      if (!name) throw new Error('the .md file needs `name` and `description` in its YAML frontmatter')
      const skillDir = join(target, name)
      await mkdir(skillDir, { recursive: true })
      await writeFile(join(skillDir, 'SKILL.md'), text, 'utf8')
      return skillDir
    }
    const archive = join(dir, filename)
    await writeFile(archive, buffer)
    const extract = join(dir, 'src')
    await mkdir(extract, { recursive: true })
    const zip = /\.zip$/i.test(filename)
    const result = zip ? await run('unzip', ['-q', archive, '-d', extract]) : await run('tar', ['xzf', archive, '-C', extract])
    if (result.code !== 0) throw new Error(`extract failed: ${result.out}`)
    const candidates = await findSkills(extract)
    if (candidates.length === 0) throw new Error('no SKILL.md found in the archive')
    const first = candidates[0]
    const from = first.path === '.' ? extract : join(extract, first.path)
    const to = join(target, first.name)
    await rm(to, { recursive: true, force: true })
    await cp(from, to, { recursive: true })
    return to
  } finally {
    await cleanup(dir)
  }
}
