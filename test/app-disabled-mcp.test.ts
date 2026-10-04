import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppInstaller } from '../src/apps.ts'
import { fromUniversal, toUniversal } from '../src/mcpconfig.ts'

for (const token of ['', 'fixture-signed-package-token']) for (const hasHeaders of [false, true]) {
  test(`disabled local MCP is a nonblocking warning for ${token ? 'install' : 'update'}, headers=${hasHeaders}`, async () => {
    const home = await mkdtemp(join(tmpdir(), 'app-disabled-'))
    const old = globalThis.fetch
    try {
      const patch = join(home, '.dsh/profiles/web/cordis.patch.yml')
      await mkdir(join(home, '.dsh/profiles/web'), { recursive: true })
      const server = { type: 'http' as const, disabled: true, url: 'https://fleet.vyibc.com/mcp/vyibc-behavior', headers: hasHeaders ? { Authorization: 'fixture-existing' } : {} }
      await fromUniversal(patch, { 'vyibc-behavior': server })
      const installer = new AppInstaller(home, patch)
      const preview = { name: 'demo-app', previewId: 'fixture-preview', version: '1', skills: [], mcpServers: [{ name: 'vyibc-behavior' }], commands: [], hooks: [], managedSkills: [] }
      ;(installer as any).previews.set('fixture-preview', { preview, token, repo: 'owner/repo', bridge: 'https://fleet.vyibc.com/mcp', revision: 'a'.repeat(40), skillFiles: [], expiresAt: Date.now() + 60000 })
      globalThis.fetch = async () => { throw new Error('Disabled dependency must not be contacted') }
      const result = await installer.install('fixture-preview')
      assert.equal(result.app.installed, true)
      const warning = result.checks.find(c => c.name === 'vyibc-behavior')!
      assert.equal(warning.ok, true)
      assert.equal(warning.warning, true)
      assert.match(warning.detail, /未执行连接验收/)
      assert.equal(result.checks.some(c => !c.ok), false)
      const after = (await toUniversal(patch, false))['vyibc-behavior']
      assert.equal(after.disabled, true)
      assert.deepEqual(after.headers, server.headers)
      assert.equal(JSON.parse(await readFile(join(home, '.dsh/apps/demo-app.json'), 'utf8')).status, 'installed')
    } finally { globalThis.fetch = old; await rm(home, { recursive: true, force: true }) }
  })
}
test('an enabled MCP connection failure still reports a real installation failure', async () => {
  const home = await mkdtemp(join(tmpdir(), 'app-enabled-')), old = globalThis.fetch
  try {
    const patch = join(home, '.dsh/profiles/web/cordis.patch.yml')
    await mkdir(join(home, '.dsh/profiles/web'), { recursive: true })
    await fromUniversal(patch, { 'demo-mcp': { type: 'http', url: 'https://fleet.vyibc.com/mcp/demo' } })
    const installer = new AppInstaller(home, patch)
    ;(installer as any).previews.set('fixture-preview', { preview: { name: 'demo-app', version: '1', skills: [], mcpServers: [{ name: 'demo-mcp' }] }, token: '', repo: 'owner/repo', revision: 'a'.repeat(40), skillFiles: [], expiresAt: Date.now() + 60000 })
    globalThis.fetch = async () => new Response('', { status: 503 })
    await assert.rejects(installer.install('fixture-preview'), /demo-mcp/)
    assert.equal(JSON.parse(await readFile(join(home, '.dsh/apps/demo-app.json'), 'utf8')).status, 'failed')
  } finally { globalThis.fetch = old; await rm(home, { recursive: true, force: true }) }
})
