import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CapabilityBatchInstaller, checkMcp } from '../src/capability-batch.ts'
import { fromUniversal, toUniversal } from '../src/mcpconfig.ts'

const files = { 'SKILL.md': '---\nname: batch-demo\ndescription: Batch fixture\n---\nRead references/rules.md', 'references/rules.md': 'Keep this rule', 'scripts/check.mjs': 'export const ok=true', 'assets/pixel.bin': Buffer.from([0, 128, 255]).toString('base64') }
const hashes = Object.fromEntries(Object.entries(files).map(([p, text]) => [p, createHash('sha256').update(Buffer.from(text, p.endsWith('.bin') ? 'base64' : 'utf8')).digest('hex')]))
const plan = () => ({ schema: 'fleet-capability-selection/v1', keys: ['skill:batch-demo', 'mcp:demo-mcp'], digest: 'a'.repeat(64), skills: [{ id: 'batch-demo', name: 'batch-demo', title: 'Demo', files, hashes, binaryPaths: ['assets/pixel.bin'] }], mcps: [{ id: 'demo-mcp', title: 'Demo MCP', endpoint: 'https://fleet.vyibc.com/mcp/image', auth: 'token' }] })
const grant = () => ({ digest: 'a'.repeat(64), mcpServers: { 'demo-mcp': { type: 'http', url: 'https://fleet.vyibc.com/api/hub/platforms/capabilities/mcp/demo-mcp', headers: { Authorization: 'Bearer fixture-scoped' } } } })
async function setup(run: (fixture: { home: string; patch: string; create: (request?: any, probe?: any, apps?: any) => CapabilityBatchInstaller }) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-capability-test-')), patch = join(home, '.dsh/profiles/web/cordis.patch.yml')
  try {
    await mkdir(join(home, '.dsh/profiles/web'), { recursive: true })
    await run({ home, patch, create: (request = async (_keys: string[], _servers: any, digest?: string) => digest ? grant() : { plan: plan() }, probe = async () => 3, apps = {}) => new CapabilityBatchInstaller(home, patch, apps, request, probe) })
  } finally { await rm(home, { recursive: true, force: true }) }
}
test('preflight is read-only; installs full verified tree and a secret-free receipt', () => setup(async ({ home, patch, create }) => {
  await fromUniversal(patch, { independent: { url: 'https://example.com/mcp', headers: { Authorization: 'fixture-existing' } } })
  const installer = create(), preview = await installer.inspect(['skill:batch-demo'])
  assert.equal(preview.skills[0].files, 4); assert.equal(preview.mcp.length, 1)
  assert.ok(!JSON.stringify(preview).includes('fixture-'))
  await assert.rejects(access(join(home, '.agents/skills/batch-demo')))
  const result = await installer.install(preview.previewId, false, () => {})
  assert.equal(result.status, 'installed'); assert.equal(result.checks.length, 2)
  for (const [p, text] of Object.entries(files)) assert.deepEqual(await readFile(join(home, '.agents/skills/batch-demo', p)), Buffer.from(text, p.endsWith('.bin') ? 'base64' : 'utf8'))
  const final = await toUniversal(patch, false)
  assert.equal(final.independent.headers?.Authorization, 'fixture-existing')
  assert.equal(final['demo-mcp'].headers?.Authorization, 'Bearer fixture-scoped')
  const receipt = await readFile(result.receipt, 'utf8'); assert.ok(!receipt.includes('Bearer') && !receipt.includes('fixture-existing')); assert.equal(JSON.parse(receipt).digest, preview.digest)
}))
test('preserves existing Skill, independent MCP credentials and disabled state by default', () => setup(async ({ home, patch, create }) => {
  const root = join(home, '.agents/skills/batch-demo'); await mkdir(root, { recursive: true }); await writeFile(join(root, 'SKILL.md'), 'User-owned')
  await fromUniversal(patch, { 'demo-mcp': { url: 'https://other.example/mcp', headers: { Authorization: 'fixture-own' }, disabled: true } })
  const installer = create(undefined, async () => { throw Error('must not probe disabled') }), preview = await installer.inspect(['skill:batch-demo'])
  assert.equal(preview.skills[0].existing, true); assert.equal(preview.mcp[0].disabled, true)
  const result = await installer.install(preview.previewId, false, () => {}); assert.equal(result.status, 'installed'); assert.equal(result.checks.filter(c => c.warning).length, 2)
  assert.equal(await readFile(join(root, 'SKILL.md'), 'utf8'), 'User-owned')
  assert.equal((await toUniversal(patch, false))['demo-mcp'].headers?.Authorization, 'fixture-own')
}))
test('explicit overwrite creates a recoverable backup, not an unrecorded replacement', () => setup(async ({ home, create }) => {
  const root = join(home, '.agents/skills/batch-demo'); await mkdir(root, { recursive: true }); await writeFile(join(root, 'SKILL.md'), 'Original')
  const installer = create(), preview = await installer.inspect(['skill:batch-demo']), result = await installer.install(preview.previewId, true, () => {})
  const receipt = JSON.parse(await readFile(result.receipt, 'utf8'))
  assert.equal(await readFile(join(receipt.backups[0], 'SKILL.md'), 'utf8'), 'Original')
}))
test('changed grants fail before local writes; consumed previews cannot be reused', () => setup(async ({ home, create }) => {
  const installer = create(async (_keys: string[], _servers: any, digest?: string) => digest ? { ...grant(), digest: 'b'.repeat(64) } : { plan: plan() }), preview = await installer.inspect(['skill:batch-demo'])
  await assert.rejects(installer.install(preview.previewId, false, () => {}), /授权范围已变化/)
  await assert.rejects(access(join(home, '.agents/skills/batch-demo')))
  await assert.rejects(installer.install(preview.previewId, false, () => {}), /已过期/)
}))
test('invalid trees, mismatched hashes, unselected data and empty plans fail closed', () => setup(async ({ create }) => {
  const invalid = [
    undefined,
    { ...plan(), keys: [] },
    { ...plan(), skills: [], mcps: [] },
    { ...plan(), skills: [{ ...plan().skills[0], files: { ...files, '../outside': 'Bad' }, hashes: { ...hashes, '../outside': '0'.repeat(64) } }] },
    { ...plan(), skills: [{ ...plan().skills[0], hashes: { ...hashes, 'SKILL.md': '0'.repeat(64) } }] },
    { ...plan(), skills: [{ ...plan().skills[0], hashes: { ...hashes, '../outside': '0'.repeat(64) } }] },
    { ...plan(), mcps: [{ ...plan().mcps[0], endpoint: 'https://user:password@example.com/mcp' }] },
  ]
  for (const p of invalid) await assert.rejects(create(async () => ({ plan: p })).inspect(['skill:batch-demo']))
}))
test('MCP failures return partial completion without losing verified Skill files', () => setup(async ({ home, create }) => {
  const installer = create(undefined, async () => { throw Error('private upstream data') }), preview = await installer.inspect(['skill:batch-demo'])
  const result = await installer.install(preview.previewId, false, () => {})
  assert.equal(result.status, 'partial'); assert.equal(result.checks[1].ok, false)
  assert.ok(!JSON.stringify(result).includes('private upstream data')); await access(join(home, '.agents/skills/batch-demo/SKILL.md'))
}))
test('package-only selections reuse AppInstaller rather than silently detaching Skills', () => setup(async ({ create }) => {
  let called = false
  const installer = create(async () => { throw Error('no standalone request expected') }, undefined, {
    inspectCatalog: async (name: string) => ({ name, previewId: 'app-preview', version: '1', displayName: name }),
    install: async (id: string) => { called = id === 'app-preview'; return { checks: [{ name: 'demo-app', ok: true, detail: 'complete package' }] } },
  })
  const preview = await installer.inspect(['plugin:demo-app']), result = await installer.install(preview.previewId, false, () => {})
  assert.equal(called, true); assert.equal(result.status, 'installed'); assert.equal(preview.plugins.length, 1)
}))
test('HTTP MCP acceptance checks initialize, initialized, tools/list and session propagation', async () => {
  const original = globalThis.fetch, methods: string[] = []
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://example.com/mcp'); const rpc = JSON.parse(String(init?.body)); methods.push(rpc.method)
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture')
      if (rpc.method !== 'initialize') assert.equal(new Headers(init?.headers).get('mcp-session-id'), 'fixture-session')
      return rpc.method === 'notifications/initialized' ? new Response(null, { status: 202 }) : Response.json({ jsonrpc: '2.0', id: rpc.id, result: rpc.method === 'initialize' ? { protocolVersion: '2025-06-18' } : { tools: [{ name: 'demo' }] } }, { headers: { 'mcp-session-id': 'fixture-session' } })
    }
    assert.equal(await checkMcp({ type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer fixture' } }), 1)
    assert.deepEqual(methods, ['initialize', 'notifications/initialized', 'tools/list'])
  } finally { globalThis.fetch = original }
})
