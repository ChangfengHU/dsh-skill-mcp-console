import assert from 'node:assert/strict'
import test from 'node:test'
import { requestFleetAppGrant } from '../src/fleet-app-auth.ts'
test('catalog grant rejects arbitrary names and missing trusted connection without a network call', async () => {
  await assert.rejects(requestFleetAppGrant('untrusted', {}, ''), /尚未提供/)
  await assert.rejects(requestFleetAppGrant('cartoon-video-studio', { vault: { url: 'https://other.example/mcp/vault', headers: { Authorization: 'Bearer secret' } } }, ''), /尚未连接/)
})
test('grant sends existing Fleet credential only to fixed publisher service and never returns it', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://fleet.vyibc.com/api/hub/plugin-bootstrap/service')
    assert.equal(init?.redirect, 'error')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer service-fixture')
    return Response.json({ ok: true, plugin: 'cartoon-video-studio', bootstrapToken: 'package-fixture-token-123456789', metadata: { revision: 'a'.repeat(40), manifest: { name: 'cartoon-video-studio' }, tree: [] } })
  }
  try {
    const r = await requestFleetAppGrant('cartoon-video-studio', { vault: { url: 'https://fleet.vyibc.com/mcp/vault', headers: { Authorization: 'Bearer service-fixture' } } }, '')
    assert.ok(!JSON.stringify(r).includes('service-fixture'))
    assert.match(r.command, /package-fixture-token/)
  } finally { globalThis.fetch = previous }
})
test('unauthorized response and mismatched package metadata fail closed', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('', { status: 401 })
    await assert.rejects(requestFleetAppGrant('cartoon-video-studio', {}, 'fixture'), /无权安装/)
    globalThis.fetch = async () => Response.json({ ok: true, plugin: 'other' })
    await assert.rejects(requestFleetAppGrant('cartoon-video-studio', {}, 'fixture'), /无效/)
  } finally { globalThis.fetch = previous }
})
