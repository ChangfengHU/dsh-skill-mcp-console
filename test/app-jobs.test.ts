import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppJobs, type AppJob } from '../src/app-jobs.ts'
import { readAppJobWithRetry } from '../src/app-poll.ts'

const id = '11111111-1111-1111-1111-111111111111'
const running: AppJob = { state: 'running', stage: 'mcp', current: 1, total: 8, detail: 'MCP' }
test('restart marks an abandoned running job interrupted without claiming success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'app-jobs-'))
  try {
    await new AppJobs(dir).save(id, running)
    const recovered = await new AppJobs(dir).get(id)
    assert.equal(recovered.state, 'failed')
    assert.match(recovered.error!, /服务重启/)
    assert.equal(recovered.stage, 'mcp')
    assert.equal(JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')).state, 'failed')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('active jobs remain running and concurrent writes preserve the terminal snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'app-jobs-'))
  try {
    const store = new AppJobs(dir)
    await store.save(id, running)
    assert.equal((await store.get(id)).state, 'running')
    await Promise.all([store.save(id, running), store.save(id, { ...running, state: 'done', result: { ok: true } })])
    assert.equal((await new AppJobs(dir).get(id)).state, 'done')
    assert.deepEqual(await readdir(dir), [`${id}.json`])
    await assert.rejects(store.get('../escape'), /ID 无效/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('temporary transport failure is retried, application errors are not', async () => {
  let calls = 0
  assert.equal(await readAppJobWithRetry(async () => {
    if (++calls < 3) throw new Error('Failed to fetch')
    return 'done'
  }, async () => {}), 'done')
  assert.equal(calls, 3)
  calls = 0
  await assert.rejects(readAppJobWithRetry(async () => { calls++; throw new Error('任务不存在') }, async () => {}), /任务不存在/)
  assert.equal(calls, 1)
})
test('persistent transport failure tells the user to recover the saved job', async () => {
  await assert.rejects(readAppJobWithRetry(async () => { throw new Error('HTTP 502') }, async () => {}), /记录已保留/)
})
