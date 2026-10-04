import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installerContract, exchangeCredentials } from '../src/app-contract.ts'
const base = 'https://fleet.vyibc.com/api/hub/plugin-bootstrap'
const declarations = 'codex plugin marketplace add ChangfengHU/cartoon-video-skills\ncodex plugin add cartoon-video-studio@personal\n'
test('modern release declarations remain compatible', () => {
 const r = installerContract(declarations + `bridge = os.environ.get("VYIBC_PLUGIN_BRIDGE_BASE", "${base}")\nfor name in ["vyibc-image"]:`, 'cartoon-video-studio')
 assert.equal(r.credentials, `${base}/credentials`); assert.deepEqual(r.servers, ['vyibc-image'])
})
test('legacy release declarations remain compatible', () => {
 const r = installerContract(declarations + 'BRIDGE_BASE="${VYIBC_PLUGIN_BRIDGE_BASE:-' + base + '/mcp}"\nservers = ["vyibc-image"]', 'cartoon-video-studio')
 assert.equal(r.credentials, undefined)
})
test('reject different App, arbitrary host, duplicate server names', () => {
 const script = declarations + `bridge = os.environ.get("VYIBC_PLUGIN_BRIDGE_BASE", "${base}")\nfor name in ["vyibc-image"]:`
 assert.throws(() => installerContract(script, 'other'))
 assert.throws(() => installerContract(script.replace(base, 'https://evil.invalid'), 'cartoon-video-studio'))
 assert.throws(() => installerContract(script.replace('["vyibc-image"]', '["vyibc-image","vyibc-image"]'), 'cartoon-video-studio'))
})
test('exchange resolves credential environment without exposing it in metadata', async () => {
 const old = globalThis.fetch
 try {
  globalThis.fetch = async () => Response.json({ mcpServers: { 'vyibc-image': { url: 'https://fleet.vyibc.com/mcp/image', bearer_token_env_var: 'IMAGE_TOKEN' } }, env: { IMAGE_TOKEN: 'secret-test' } })
  const result = await exchangeCredentials(`${base}/credentials`, 'bootstrap-test', ['vyibc-image'])
  assert.equal(result['vyibc-image'].headers?.Authorization, 'Bearer secret-test')
  globalThis.fetch = async () => new Response('secret-test', { status: 403 })
  await assert.rejects(exchangeCredentials(`${base}/credentials`, 'bootstrap-test', ['vyibc-image']), /已过期/)
  globalThis.fetch = async () => Response.json({ mcpServers: { 'vyibc-image': { url: 'http://localhost:3080' } } })
  await assert.rejects(exchangeCredentials(`${base}/credentials`, 'bootstrap-test', ['vyibc-image']), /不受信任/)
 } finally { globalThis.fetch = old }
})
