import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePublishedCatalog } from '../src/fleet-catalog.ts'
import { AppInstaller } from '../src/apps.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const app = (id: string) => ({ id, title: id, blurb: 'description', repo: 'https://github.com/owner/repo', version: '1.0.0', install: 'not executed', source: { revision: 'a'.repeat(40) }, components: {} })
test('catalog keeps all published plugins and an authoritative empty list', () => {
  assert.equal(parsePublishedCatalog({ ok: true, plugins: [app('one'), app('two'), app('three')] }).length, 3)
  assert.deepEqual(parsePublishedCatalog({ ok: true, plugins: [] }), [])
})
test('Harness-only publications remain visible without breaking DSH Apps or granting installation', async t => {
  const { repo, source, install, ...harness } = app('harness-publication')
  const rows = parsePublishedCatalog({ ok: true, plugins: [app('flow-app'), harness] })
  assert.equal(rows.length, 2)
  assert.ok(rows[1].compatibilityReason)
  assert.equal(rows[1].source.revision, '')
  assert.equal(parsePublishedCatalog({ ok: true, plugins: [{ ...harness, source: {} }] })[0].source.revision, '')
  const home = await mkdtemp(join(tmpdir(), 'apps-harness-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const installer = new AppInstaller(home, undefined, async () => rows)
  assert.deepEqual((await installer.catalog()).map(row => row.name), ['flow-app', 'harness-publication'])
  await assert.rejects(installer.inspectCatalog('harness-publication'), /安装来源/)
})
test('Apps maps every published plugin without falsely granting unsupported installation', async t => {
  const home = await mkdtemp(join(tmpdir(), 'apps-published-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const installer = new AppInstaller(home, undefined, async () => [app('one'), app('two')])
  const rows = await installer.catalog()
  assert.deepEqual(rows.map(row => row.name), ['one', 'two'])
  assert.ok(rows.every(row => row.compatibilityReason && !row.installed && !row.installer))
})
test('catalog rejects invalid revisions, repository URLs and duplicate identity', () => {
  assert.throws(() => parsePublishedCatalog({ ok: false, plugins: [] }))
  assert.throws(() => parsePublishedCatalog({ ok: true, plugins: [app('one'), app('one')] }))
  assert.throws(() => parsePublishedCatalog({ ok: true, plugins: [{ ...app('one'), repo: 'https://evil.test/repo' }] }))
  assert.throws(() => parsePublishedCatalog({ ok: true, plugins: [{ ...app('one'), source: { revision: 'main' } }] }))
})
