import assert from 'node:assert/strict'
import test from 'node:test'
import { CONSOLE_INVOCATIONS } from '../src/wire.ts'

test('compact codecs preserve every strict JSON string wire contract', () => {
  for (const invocation of CONSOLE_INVOCATIONS) {
    assert.equal(invocation.result.schema.parse('{"ok":true}'), '{"ok":true}')
    assert.equal(invocation.result.schema.safeParse({ ok: true }).success, false)
    for (const parameter of invocation.parameters) {
      assert.equal(parameter.codec.schema.parse('payload'), 'payload')
      assert.equal(parameter.codec.schema.safeParse(null).success, false)
    }
  }
})

