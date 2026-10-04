import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppInstaller } from '../src/apps.ts'

test('Skill updates preserve unowned files, back up replacements, and stage before touching live files', async () => {
 const home = await mkdtemp(join(tmpdir(), 'dsh-app-update-'))
 const old = globalThis.fetch
 try {
  const dir = join(home, '.agents/skills/demo'); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'SKILL.md'), 'old')
  const installer = new AppInstaller(home)
  const entry = { preview: { name: 'demo-app' }, repo: 'owner/repo', revision: 'a'.repeat(40), skillFiles: [{ path: 'skills/demo/SKILL.md', size: 3 }] }
  globalThis.fetch = async () => new Response('new')
  let result = await (installer as any).installDshSkills(entry, ['demo'])
  assert.deepEqual(result.reused, ['demo']); assert.equal(await readFile(join(dir, 'SKILL.md'), 'utf8'), 'old')
  result = await (installer as any).installDshSkills(entry, ['demo'], undefined, true)
  assert.deepEqual(result.installed, ['demo']); assert.equal(await readFile(join(dir, 'SKILL.md'), 'utf8'), 'new')
  const backups = join(home, '.dsh/app-backups/demo-app'); const paths = await readdir(backups)
  const saved = await Promise.all(paths.map(p => readFile(join(backups, p, 'demo/SKILL.md'), 'utf8').catch(() => null)))
  assert.ok(saved.includes('old'))
  await mkdir(join(home, '.dsh/apps'), { recursive: true }); await writeFile(join(home, '.dsh/apps/demo-app.json'), JSON.stringify({ name: 'demo-app', skills: ['demo'], managedSkills: ['demo'] }))
  globalThis.fetch = async () => new Response('bad', { status: 500 })
  await assert.rejects((installer as any).installDshSkills(entry, ['demo']), /下载/)
  assert.equal(await readFile(join(dir, 'SKILL.md'), 'utf8'), 'new')
  assert.deepEqual(await readdir(join(home, '.agents/skills')), ['demo'])
  globalThis.fetch = async () => new Response('v2!')
  result = await (installer as any).installDshSkills(entry, ['demo'])
  assert.deepEqual(result.installed, ['demo']); assert.equal(await readFile(join(dir, 'SKILL.md'), 'utf8'), 'v2!')
 } finally { globalThis.fetch = old; await rm(home, { recursive: true, force: true }) }
})

test('catalog checks actual release revision and reports network failures instead of claiming latest', async () => {
 const home = await mkdtemp(join(tmpdir(), 'dsh-app-release-')); const old = globalThis.fetch
 try {
  await mkdir(join(home, '.dsh/apps'), { recursive: true }); await writeFile(join(home, '.dsh/apps/cartoon-video-studio.json'), JSON.stringify({ name: 'cartoon-video-studio', version: '1', revision: 'a'.repeat(40), skills: [], mcpServers: [] }))
  const installer = new AppInstaller(home)
  assert.equal((await installer.catalog())[0].releaseStatus, 'unchecked')
  globalThis.fetch = async (url) => String(url).includes('/commits/') ? Response.json({ sha: 'b'.repeat(40) }) : String(url).includes('plugin.json') ? Response.json({ name: 'cartoon-video-studio', version: '2' }) : Response.json({ tree: [{ path: 'plugins/cartoon-video-studio/skills/demo/SKILL.md', type: 'blob' }] })
  let [app] = await installer.checkUpdates()
  assert.equal(app.updateAvailable, true); assert.equal(app.version, '2'); assert.equal(app.installedVersion, '1'); assert.equal(app.skills.length, 1)
  globalThis.fetch = async () => new Response('', { status: 502 })
  ;[app] = await installer.checkUpdates(); assert.equal(app.releaseStatus, 'failed'); assert.match(app.releaseError!, /502/)
 } finally { globalThis.fetch = old; await rm(home, { recursive: true, force: true }) }
})

test('catalog falls back to verified Fleet metadata when anonymous GitHub requests fail', async () => {
 const home = await mkdtemp(join(tmpdir(), 'dsh-app-fleet-release-')); const old = globalThis.fetch
 try {
  globalThis.fetch = async url => String(url) === 'https://fleet.vyibc.com/api/hub/plugin-bootstrap/release'
   ? Response.json({ ok: true, metadata: { revision: 'b'.repeat(40), manifest: { name: 'cartoon-video-studio', version: 'fixture' }, tree: [{ path: 'plugins/cartoon-video-studio/skills/demo/SKILL.md', type: 'blob' }] } })
   : new Response('', { status: 403 })
  const [app] = await new AppInstaller(home).checkUpdates()
  assert.equal(app.version, 'fixture'); assert.equal(app.releaseStatus, 'checked'); assert.equal(app.skills.length, 1)
 } finally { globalThis.fetch = old; await rm(home, { recursive: true, force: true }) }
})
