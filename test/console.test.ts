/**
 * Tests for the parts that decide what the panel tells you.
 *
 * These cover the judgements, not the plumbing: how a frontmatter block is
 * read, which of four states two booleans mean, what a pasted string is
 * recognised as, how a duplicated root collapses, and whether a masked
 * credential survives a save. Every one of them stands for a bug this plugin
 * actually shipped and had to be told about.
 *
 * Run with `pnpm test` (node's own runner, type-stripping, no framework).
 */

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { detect, findSkills, verify } from '../src/install.ts'
import { fromUniversal, toUniversal } from '../src/mcpconfig.ts'
import { parseFrontmatter, rootsFor, scanSkills, setSkillState, stateOf } from '../src/skills.ts'
import { estimateTokens } from '../src/tokens.ts'

describe('parseFrontmatter', () => {
  it('reads a plain block', () => {
    const front = parseFrontmatter('---\nname: deploy\ndescription: Ship it.\n---\n\nbody\n')
    assert.equal(front.name, 'deploy')
    assert.equal(front.description, 'Ship it.')
    assert.equal(front.disableModel, false)
    assert.equal(front.userInvocable, true)
  })

  it('joins a folded description', () => {
    // The shape most real skills use, and the one a naive line-based reader
    // truncates to its first line.
    const front = parseFrontmatter('---\nname: x\ndescription: >-\n  first part\n  second part\nlicense: MIT\n---\nbody')
    assert.equal(front.description, 'first part second part')
    assert.equal(front.name, 'x')
  })

  it('reads the two policy keys', () => {
    const front = parseFrontmatter('---\nname: x\ndescription: y\ndisable-model-invocation: true\nuser-invocable: false\n---\n')
    assert.equal(front.disableModel, true)
    assert.equal(front.userInvocable, false)
  })

  it('survives a file with no frontmatter', () => {
    const front = parseFrontmatter('# just markdown\n')
    assert.equal(front.bodyStart, -1)
    assert.equal(front.name, '')
  })
})

describe('stateOf', () => {
  const base = { name: 'x', description: 'y', raw: '', bodyStart: 0 }
  it('maps the two booleans onto the four states', () => {
    assert.equal(stateOf({ ...base, disableModel: false, userInvocable: true }, false), 'on')
    assert.equal(stateOf({ ...base, disableModel: false, userInvocable: true }, true), 'name-only')
    assert.equal(stateOf({ ...base, disableModel: true, userInvocable: true }, false), 'user-only')
    assert.equal(stateOf({ ...base, disableModel: true, userInvocable: false }, false), 'off')
  })
})

describe('estimateTokens', () => {
  it('charges CJK per character and Latin per four', () => {
    // dsh's own meter is a flat four-characters-per-token, which under-counts
    // a Chinese description roughly threefold — and an under-count argues for
    // keeping things you should drop.
    assert.equal(estimateTokens('补账巡检'), 4)
    assert.equal(estimateTokens('abcdefgh'), 2)
    assert.equal(estimateTokens(''), 0)
  })
})

describe('detect', () => {
  it('recognises every GitHub spelling', () => {
    for (const input of ['https://github.com/anthropics/skills', 'anthropics/skills', 'github:anthropics/skills']) {
      assert.equal(detect(input).kind, 'github', input)
      assert.equal(detect(input).source, 'anthropics/skills', input)
    }
  })

  it('keeps a branch and a subdirectory out of a deep link', () => {
    const plan = detect('https://github.com/a/b/tree/main/skills/foo')
    assert.equal(plan.kind, 'github')
    assert.equal(plan.ref, 'main')
    assert.equal(plan.sub, 'skills/foo')
  })

  it('separates git clone, archives, plain files and shell', () => {
    assert.equal(detect('git clone https://example.com/x.git').kind, 'git')
    assert.equal(detect('https://example.com/pack.tgz').kind, 'archive')
    assert.equal(detect('https://example.com/SKILL.md').kind, 'file')
    assert.equal(detect('bash <(curl -fsSL https://example.com/i.sh)').kind, 'shell')
    assert.equal(detect('curl -fsSL https://example.com/i.sh | bash').kind, 'shell')
  })

  it('falls through to shell rather than rejecting the unknown', () => {
    // A publisher's installer is free to look like anything; refusing to run
    // what we cannot classify would be worse than running it visibly.
    assert.equal(detect('./install.sh --yes').kind, 'shell')
  })
})

describe('rootsFor', () => {
  it('collapses a workspace that is also the home directory', () => {
    // dsh started in the home directory makes both roots the same path.
    // Scanning it twice produced a second row for every skill, each marked as
    // shadowing the first — a directory shadowing itself.
    const roots = rootsFor('/home/x', '/home/x')
    const paths = roots.map(root => root.path)
    assert.equal(new Set(paths).size, paths.length)
    assert.equal(paths.filter(path => path === '/home/x/.agents/skills').length, 1)
  })

  it('keeps a genuinely separate workspace root first', () => {
    const roots = rootsFor('/home/x', '/srv/project')
    assert.equal(roots[0].path, '/srv/project/.agents/skills')
    assert.equal(roots[0].origin, 'workspace')
  })

  it('marks other agents’ roots as non-native', () => {
    const roots = rootsFor('/home/x')
    assert.equal(roots.find(root => root.origin === 'agents')?.native, true)
    assert.equal(roots.find(root => root.origin === 'claude')?.native, false)
  })
})

describe('scanSkills', () => {
  let home = ''
  before(async () => {
    home = await mkdtemp(join(tmpdir(), 'smc-test-'))
    const write = async (root: string, name: string, front: string) => {
      await mkdir(join(home, root, name), { recursive: true })
      await writeFile(join(home, root, name, 'SKILL.md'), front, 'utf8')
    }
    await write('.agents/skills', 'shared', '---\nname: shared\ndescription: 近的那份\n---\nbody')
    await write('.claude/skills', 'shared', '---\nname: shared\ndescription: 远的那份\n---\nbody')
    await write('.agents/skills', 'mismatch', '---\nname: other-name\ndescription: d\n---\nbody')
    await mkdir(join(home, '.agents/skills/.hidden'), { recursive: true })
    await mkdir(join(home, '.agents/skills/no-md'), { recursive: true })
  })
  after(async () => { await rm(home, { recursive: true, force: true }) })

  it('marks the farther copy shadowed and names the winner', async () => {
    const rows = await scanSkills(home)
    const winner = rows.find(row => row.id === 'shared' && row.origin === 'agents')
    const loser = rows.find(row => row.id === 'shared' && row.origin === 'claude')
    assert.equal(winner?.shadowedBy, null)
    assert.equal(loser?.shadowedBy, '~/.agents/skills')
  })

  it('flags a frontmatter name that does not match its directory', async () => {
    const rows = await scanSkills(home)
    assert.equal(rows.find(row => row.id === 'mismatch')?.problem, 'nameMismatch')
  })

  it('reports a directory with no SKILL.md instead of hiding it', async () => {
    const rows = await scanSkills(home)
    assert.equal(rows.find(row => row.id === 'no-md')?.problem, 'noSkillMd')
  })

  it('skips dot-directories', async () => {
    const rows = await scanSkills(home)
    assert.equal(rows.some(row => row.id === '.hidden'), false)
  })

  it('prices the description', async () => {
    const rows = await scanSkills(home)
    assert.ok((rows.find(row => row.id === 'shared')?.tokens ?? 0) > 0)
  })
})

describe('setSkillState', () => {
  let home = ''
  let dir = ''
  before(async () => {
    home = await mkdtemp(join(tmpdir(), 'smc-state-'))
    dir = join(home, '.agents/skills/toggler')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '---\nname: toggler\ndescription: 原始描述\n---\n\n正文保持不变\n', 'utf8')
  })
  after(async () => { await rm(home, { recursive: true, force: true }) })

  it('round-trips through all four states and comes back byte-identical', async () => {
    const original = await readFile(join(dir, 'SKILL.md'), 'utf8')
    for (const state of ['name-only', 'user-only', 'off', 'on'] as const) {
      await setSkillState(home, dir, state)
      const rows = await scanSkills(home)
      assert.equal(rows.find(row => row.id === 'toggler')?.state, state, state)
      // The body must survive every edit; only the frontmatter is ours.
      assert.ok((await readFile(join(dir, 'SKILL.md'), 'utf8')).includes('正文保持不变'), state)
    }
    assert.equal(await readFile(join(dir, 'SKILL.md'), 'utf8'), original)
  })
})

describe('mcpconfig', () => {
  let file = ''
  let dir = ''
  const SOURCE = `# a comment the user wrote
- id: something-else
  config:
    keep: true

- insert:
    # the vault entry, with its own note
    - id: mcp-vault
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: vault
        transport: streamable-http
        url: https://example.com/mcp
        headers:
          Authorization: Bearer REAL-SECRET
`
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'smc-yaml-'))
    file = join(dir, 'cordis.patch.yml')
    await writeFile(file, SOURCE, 'utf8')
  })
  after(async () => { await rm(dir, { recursive: true, force: true }) })

  it('reads cordis entries out as the universal shape', async () => {
    const servers = await toUniversal(file, false)
    assert.deepEqual(Object.keys(servers), ['vault'])
    assert.equal(servers.vault.type, 'http')
    assert.equal(servers.vault.headers?.Authorization, 'Bearer REAL-SECRET')
  })

  it('masks credentials by default', async () => {
    const servers = await toUniversal(file)
    assert.match(servers.vault.headers?.Authorization ?? '', /^•+$/)
  })

  it('keeps the real secret when a mask is saved back', async () => {
    // The panel never receives the secret, so writing what it shows would
    // destroy it. This is the failure that would break every server at once.
    const masked = await toUniversal(file, true)
    await fromUniversal(file, masked)
    const after = await toUniversal(file, false)
    assert.equal(after.vault.headers?.Authorization, 'Bearer REAL-SECRET')
  })

  it('writes a genuinely changed credential through', async () => {
    const next = await toUniversal(file, true)
    next.vault.headers = { Authorization: 'Bearer NEW' }
    await fromUniversal(file, next)
    assert.equal((await toUniversal(file, false)).vault.headers?.Authorization, 'Bearer NEW')
  })

  it('leaves comments and unrelated entries alone', async () => {
    const text = await readFile(file, 'utf8')
    assert.match(text, /# a comment the user wrote/)
    assert.match(text, /# the vault entry, with its own note/)
    assert.match(text, /id: something-else/)
  })

  it('adds a new server inside insert, never as a bare patch item', async () => {
    // A bare `- id: x` is a patch against an entry that does not exist, and
    // the loader skips it in silence while the profile still starts.
    const servers = await toUniversal(file, false)
    servers.added = { type: 'stdio', command: 'demo-mcp' }
    const result = await fromUniversal(file, servers)
    assert.deepEqual(result.added, ['added'])
    const text = await readFile(file, 'utf8')
    const insertAt = text.indexOf('- insert:')
    assert.ok(insertAt >= 0 && text.indexOf('mcp-added') > insertAt)
  })

  it('removes a server that left the document', async () => {
    const servers = await toUniversal(file, false)
    delete servers.added
    const result = await fromUniversal(file, servers)
    assert.deepEqual(result.removed, ['added'])
  })
})

describe('verify', () => {
  let dir = ''
  before(async () => {
    const home = await mkdtemp(join(tmpdir(), 'smc-verify-'))
    dir = join(home, 'my-skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '---\nname: other\ndescription: d\n---\nbody', 'utf8')
  })

  it('fails the registry check when the frontmatter name is not the directory name', async () => {
    // Files all correct, skill still unloadable. This is the check that
    // catches the failure an exit code cannot.
    const checks = await verify(dir, [])
    assert.equal(checks.find(check => check.key === 'skillMd')?.ok, true)
    assert.equal(checks.find(check => check.key === 'frontmatter')?.ok, true)
    const registry = checks.find(check => check.key === 'registry')
    assert.equal(registry?.ok, false)
    assert.match(registry?.detail ?? '', /other/)
  })

  it('passes once the registry knows the directory name', async () => {
    const checks = await verify(dir, ['my-skill'])
    assert.equal(checks.find(check => check.key === 'registry')?.ok, true)
  })
})

describe('findSkills', () => {
  it('finds every skill in a repository, not just the first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smc-find-'))
    for (const name of ['alpha', 'beta']) {
      await mkdir(join(root, name), { recursive: true })
      await writeFile(join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`, 'utf8')
    }
    const found = await findSkills(root)
    assert.deepEqual(found.map(candidate => candidate.name), ['alpha', 'beta'])
    await rm(root, { recursive: true, force: true })
  })
})
