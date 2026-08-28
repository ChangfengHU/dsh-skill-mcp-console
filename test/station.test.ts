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
import { detect, findSkills, isSafeSkillName, verify } from '../src/install.ts'
import { fromUniversal, phaseOf, setEntryDisabled, toUniversal } from '../src/mcpconfig.ts'
import { collectPackages, packageOf } from '../src/plugins.ts'
import { normalize, page } from '../src/catalog.ts'
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
  it('maps dsh’s two booleans onto the three states', () => {
    assert.equal(stateOf({ ...base, disableModel: false, userInvocable: true }), 'on')
    assert.equal(stateOf({ ...base, disableModel: true, userInvocable: true }), 'user-only')
    assert.equal(stateOf({ ...base, disableModel: true, userInvocable: false }), 'off')
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
    home = await mkdtemp(join(tmpdir(), 'dps-test-'))
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
    home = await mkdtemp(join(tmpdir(), 'dps-state-'))
    dir = join(home, '.agents/skills/toggler')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '---\nname: toggler\ndescription: 原始描述\n---\n\n正文保持不变\n', 'utf8')
  })
  after(async () => { await rm(home, { recursive: true, force: true }) })

  it('round-trips through every state and comes back byte-identical', async () => {
    const original = await readFile(join(dir, 'SKILL.md'), 'utf8')
    for (const state of ['user-only', 'off', 'on'] as const) {
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
    dir = await mkdtemp(join(tmpdir(), 'dps-yaml-'))
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

describe('phaseOf', () => {
  it('turns the raw enum into a word and hides the healthy one', () => {
    // A chip reading "2" says nothing, and one that is always present says
    // nothing either. This function vanished in a refactor once and took the
    // whole MCP panel down with a ReferenceError, so it is tested.
    assert.equal(phaseOf({ state: 2 }), null)
    assert.equal(phaseOf({ state: 3 }), 'failed')
    assert.equal(phaseOf({ state: 1 }), 'loading')
    assert.equal(phaseOf(undefined), null)
    assert.equal(phaseOf({ state: 99 }), '99')
  })
})

describe('verify', () => {
  let dir = ''
  before(async () => {
    const home = await mkdtemp(join(tmpdir(), 'dps-verify-'))
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

describe('isSafeSkillName', () => {
  it('refuses the empty name that resolves to the skill root itself', () => {
    // join(target, '') is target. An install under an empty name emptied a
    // repository over every skill on the machine instead of into a directory
    // of its own, and nothing in the flow would have said so.
    assert.equal(isSafeSkillName(''), false)
    assert.equal(isSafeSkillName('.'), false)
    assert.equal(isSafeSkillName('..'), false)
    assert.equal(isSafeSkillName('../escape'), false)
    assert.equal(isSafeSkillName('get-job'), true)
  })
})

describe('findSkills', () => {
  it('names a root-level skill after its repository when the frontmatter cannot', async () => {
    // Some published skills sit at the repository root and describe themselves
    // with `displayName` rather than `name`, so there is neither a frontmatter
    // name nor a parent directory to borrow one from.
    const root = await mkdtemp(join(tmpdir(), 'dps-root-'))
    await writeFile(join(root, 'SKILL.md'), 'displayName: 实习.skill\nsummary: no fences, no name\n', 'utf8')
    assert.deepEqual((await findSkills(root)).map(c => c.name), [])
    assert.deepEqual((await findSkills(root, 4, 300, 'get-job')).map(c => c.name), ['get-job'])
    await rm(root, { recursive: true, force: true })
  })

  it('finds skills nested a plugin deep', async () => {
    // <plugin>/skills/<name>/SKILL.md is a common repository shape. A
    // two-level walk came back empty from one with sixty-eight skills in it,
    // and the dialog said nothing at all.
    const root = await mkdtemp(join(tmpdir(), 'dps-deep-'))
    await mkdir(join(root, 'pm-execution/skills/create-prd'), { recursive: true })
    await writeFile(join(root, 'pm-execution/skills/create-prd/SKILL.md'), '---\nname: create-prd\ndescription: d\n---\n', 'utf8')
    const found = await findSkills(root)
    assert.deepEqual(found.map(candidate => candidate.name), ['create-prd'])
    assert.equal(found[0].path, 'pm-execution/skills/create-prd')
    await rm(root, { recursive: true, force: true })
  })

  it('finds every skill in a repository, not just the first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dps-find-'))
    for (const name of ['alpha', 'beta']) {
      await mkdir(join(root, name), { recursive: true })
      await writeFile(join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`, 'utf8')
    }
    const found = await findSkills(root)
    assert.deepEqual(found.map(candidate => candidate.name), ['alpha', 'beta'])
    await rm(root, { recursive: true, force: true })
  })
})

describe('code plugins', () => {
  it('reads the package out of a plain, scoped or subpath specifier', () => {
    assert.equal(packageOf('dshmarket'), 'dshmarket')
    assert.equal(packageOf('dshmarket/client'), 'dshmarket')
    assert.equal(packageOf('@deepseek-ai/dsh-web'), '@deepseek-ai/dsh-web')
    assert.equal(packageOf('@deepseek-ai/dsh-web/app'), '@deepseek-ai/dsh-web')
  })

  it('groups entries under the packages the profile declares, folding the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dps-plugins-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { dshmarket: '^1.0.0', 'dsh-plugin-station': 'github:o/r', '@deepseek-ai/dsh-web': '^0.1.0' },
    }))
    await mkdir(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
    await writeFile(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
      name: 'dshmarket', version: '1.30.0', description: 'market', dsh: { bundle: { patch: './p.yml' }, client: {} },
    }))

    const { installed, builtinEntries } = await collectPackages(dir, [
      { id: 'market', module: 'dshmarket', disabled: false, fiber: 'active' },
      { id: 'market-client', module: 'dshmarket/client', disabled: false, fiber: 'active' },
      { id: 'web', module: '@deepseek-ai/dsh-web', disabled: false, fiber: 'active' },
      { id: 'timer', module: '@deepseek-ai/dsh-core/timer', disabled: false, fiber: 'active' },
    ])

    // Host-scope dependencies never count as something the user installed,
    // even when the profile declares them.
    assert.deepEqual(installed.map(p => p.name), ['dsh-plugin-station', 'dshmarket'])
    const market = installed.find(p => p.name === 'dshmarket')!
    assert.equal(market.version, '1.30.0')
    assert.equal(market.bundled, true)
    assert.equal(market.hasClient, true)
    // Both of its entries land on it, including the subpath one.
    assert.deepEqual(market.entries.map(e => e.id), ['market', 'market-client'])
    // A declared package with nothing on disk still lists, so a half-installed
    // dependency is visible rather than silently absent.
    assert.equal(installed.find(p => p.name === 'dsh-plugin-station')!.version, null)
    assert.equal(builtinEntries, 2)
    await rm(dir, { recursive: true, force: true })
  })

  it('patches an existing entry rather than inserting a duplicate id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dps-patch-'))
    const file = join(dir, 'cordis.patch.yml')
    await writeFile(file, '# keep me\n- id: llm-deepseek\n  config:\n    baseURL: http://x\n\n- insert:\n    - id: mcp-vault\n      name: c\n')

    await setEntryDisabled(file, 'mcp-vault', true)
    let text = await readFile(file, 'utf8')
    assert.match(text, /- id: mcp-vault\n\s+name: c\n\s+disabled: true/)
    assert.match(text, /# keep me/, 'comments survive')
    // The id lives under insert:, and must not gain a second root-level entry.
    assert.equal(text.match(/mcp-vault/g)!.length, 1)

    // An id the layer never mentioned is appended at the root — a patch of an
    // entry the composition already has, not a new insert.
    await setEntryDisabled(file, 'plugin-station', true)
    text = await readFile(file, 'utf8')
    assert.match(text, /- id: plugin-station\n\s+disabled: true/)

    await setEntryDisabled(file, 'mcp-vault', false)
    text = await readFile(file, 'utf8')
    assert.doesNotMatch(text, /name: c\n\s+disabled: true/)
    await rm(dir, { recursive: true, force: true })
  })
})

describe('market catalog', () => {
  const raw = {
    plugins: [
      // A monorepo: 34 entries would share one star count upstream.
      ...Array.from({ length: 5 }, (_, i) => ({
        name: `owner/mono#packages/p${i}`, owner: 'owner', url: 'https://github.com/owner/mono',
        category: 'ui', description: { zh: `子包 ${i}` }, stars: 100, downloads: 10,
      })),
      { name: 'solo/one', owner: 'solo', url: 'https://github.com/solo/one', category: 'tools',
        description: { zh: '单体' }, stars: 40, downloads: 50_000, npm: 'solo-one' },
      // An examples/ entry inside a famous project borrows nothing.
      { name: 'famous/proj#examples/demo', owner: 'famous', url: 'https://github.com/famous/proj',
        category: 'ui', description: { en: 'demo' }, stars: 30_000, downloads: 0 },
    ],
  }

  it('divides stars by siblings and zeroes an examples/ entry', () => {
    const rows = normalize(raw)
    const mono = rows.find(r => r.full === 'owner/mono#packages/p0')!
    assert.equal(mono.siblings, 5)
    assert.equal(mono.stars, 100)
    assert.equal(mono.adjusted, 20, 'stars are shared across the repo')
    assert.equal(rows.find(r => r.full === 'famous/proj#examples/demo')!.adjusted, 0)
    assert.equal(rows.find(r => r.full === 'solo/one')!.adjusted, 40)
  })

  it('derives the specifier from npm, then from the GitHub URL', () => {
    const rows = normalize(raw)
    assert.equal(rows.find(r => r.full === 'solo/one')!.spec, 'solo-one')
    assert.equal(rows.find(r => r.full === 'owner/mono#packages/p0')!.spec, 'github:owner/mono')
  })

  it('folds a repo to two entries, and stops folding once you search', () => {
    const rows = normalize(raw)
    const folded = page(rows, {}, new Set())
    assert.equal(folded.entries.filter(r => r.repo === 'owner/mono').length, 2,
      'one repository cannot own the page')
    // Our own entries are merged in and lead; behind them, the examples/ row
    // outranks nothing now that its borrowed stars are gone.
    const community = folded.entries.filter(r => r.owner !== 'ChangfengHU')
    assert.equal(community[0]!.full, 'solo/one')

    const searched = page(rows, { query: '子包' }, new Set())
    assert.equal(searched.entries.length, 5, 'a search shows every match')
  })

  it('marks what the profile already has', () => {
    const rows = normalize(raw)
    const result = page(rows, {}, new Set(['solo-one']))
    assert.equal(result.entries.find(r => r.full === 'solo/one')!.installed, true)
    assert.equal(result.entries.find(r => r.repo === 'owner/mono')!.installed, false)
  })

  it('returns the picks in their listed order, each carrying its reason', () => {
    const rows = normalize(raw)
    const picks = page(rows, { featured: true }, new Set())
    // Only entries the list names, in the order it names them.
    assert.deepEqual(picks.entries.map(r => r.name), ['dsh-plugin-station', 'dsh-codex-claude-cli'],
      'a pick the catalog does not carry is still listed; one it names but the fixture lacks is skipped')
    // A pick with no stated reason is an ad, so every one carries a key.
    assert.ok(picks.entries.every(r => typeof r.why === 'string' && r.why.length > 0))
    assert.equal(picks.pages, 1, 'the shortlist never paginates')
  })

  it('merges our own entries without duplicating an upstream listing', () => {
    const withUs = normalize({ plugins: [
      ...raw.plugins,
      { name: 'ChangfengHU/dsh-plugin-station', owner: 'ChangfengHU',
        url: 'https://github.com/ChangfengHU/dsh-plugin-station', category: 'market',
        description: { zh: '上游也收录了' }, stars: 5, downloads: 0 },
    ] })
    const picks = page(withUs, { featured: true }, new Set())
    assert.equal(picks.entries.filter(r => r.name === 'dsh-plugin-station').length, 1)
  })
})
