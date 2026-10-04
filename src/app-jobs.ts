import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface AppJob {
  state: 'running' | 'done' | 'failed'
  stage: string; current: number; total: number; detail: string
  result?: unknown; error?: string
}

/** Serialize snapshots so a late progress write cannot replace a final result. */
export class AppJobs {
  private active = new Map<string, AppJob>()
  private writes = new Map<string, Promise<void>>()
  private directory: string
  constructor(directory: string) { this.directory = directory }
  async save(id: string, job: AppJob): Promise<void> {
    this.validate(id)
    const snapshot = JSON.stringify(job, null, 2) + '\n'
    this.active.set(id, { ...job })
    const previous = this.writes.get(id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const temp = join(this.directory, `${id}.${randomUUID()}.tmp`)
      await writeFile(temp, snapshot, { mode: 0o600 })
      await rename(temp, join(this.directory, `${id}.json`))
    })
    this.writes.set(id, next)
    try { await next } finally { if (this.writes.get(id) === next) this.writes.delete(id) }
  }
  async get(id: string): Promise<AppJob> {
    this.validate(id)
    const active = this.active.get(id)
    if (active) return active
    let job: AppJob
    try { job = JSON.parse(await readFile(join(this.directory, `${id}.json`), 'utf8')) }
    catch { throw new Error('安装任务不存在或记录不可读') }
    if (job.state === 'running') {
      job = { ...job, state: 'failed', error: '安装因服务重启而中断；已落地文件与配置保留，请重新预检后修复安装。', detail: '安装已中断' }
      await this.save(id, job)
    }
    return job
  }
  private validate(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('安装任务 ID 无效')
  }
}
