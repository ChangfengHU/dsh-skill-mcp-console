import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { AppInstaller } from './apps.ts'
import type { AppPreview } from './apps.ts'
import { fromUniversal, toUniversal } from './mcpconfig.ts'
import type { UniversalServer } from './mcpconfig.ts'
import { requestFleetCapabilities } from './fleet-app-auth.ts'

const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex')
const id = /^[a-z][a-z0-9-]{1,79}$/
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message) }
export interface BatchCheck { name: string; ok: boolean; detail: string; warning?: boolean }
export interface BatchPreview {
  previewId: string; expiresAt: number; keys: string[]; digest: string
  skills: { name: string; title: string; files: number; existing: boolean }[]
  mcp: { name: string; title: string; auth: string; existing: boolean; disabled: boolean }[]
  plugins: AppPreview[]; conflicts: string[]
}
export interface BatchResult { status: 'installed' | 'partial'; checks: BatchCheck[]; receipt: string }
interface Plan {
  schema: string; keys: string[]; digest: string
  skills: { id: string; name: string; title: string; files: Record<string, string>; binaryPaths: string[]; hashes: Record<string, string> }[]
  mcps: { id: string; title: string; endpoint: string; auth: string }[]
}
const parse = (text: string) => {
  try { return JSON.parse(text) } catch { return text.split('\n').filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)) } catch { return null } }).find(v => v?.id) }
}
export async function checkMcp(server: UniversalServer): Promise<number> {
  if (!server.url) throw Error('当前连接不是可验收的 HTTP MCP')
  const headers: Record<string, string> = { ...server.headers, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }
  const rpc = async (method: string, params: unknown, requestId?: number) => {
    const response = await fetch(server.url!, { method: 'POST', redirect: 'error', headers, body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(requestId ? { id: requestId } : {}) }), signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw Error('HTTP ' + response.status)
    if (response.headers.get('mcp-session-id')) headers['mcp-session-id'] = response.headers.get('mcp-session-id')!
    if (!requestId) { await response.body?.cancel(); return null }
    const value = parse(await response.text()); if (value?.id !== requestId || value.error || !value.result) throw Error('MCP 回执无效')
    return value.result
  }
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-capability-installer', version: '1' } }, 1)
  assert(typeof initialized.protocolVersion === 'string', 'MCP 初始化回执无效'); headers['mcp-protocol-version'] = initialized.protocolVersion
  await rpc('notifications/initialized', undefined)
  const tools = await rpc('tools/list', {}, 2); assert(Array.isArray(tools.tools), 'MCP 工具清单无效')
  return tools.tools.length
}

/** Reuses App installation for package-only selections; standalone trees do not
 * become a synthetic Plugin/App and never evaluate an installer shell script. */
export class CapabilityBatchInstaller {
  private previews = new Map<string, { preview: BatchPreview; plan: Plan | null }>()
  private busy = false
  private home: string; private patch: string; private apps: AppInstaller
  private request: typeof requestFleetCapabilities; private probe: typeof checkMcp
  constructor(home: string, patch: string, apps: AppInstaller, request = requestFleetCapabilities, probe = checkMcp) {
    this.home = home; this.patch = patch; this.apps = apps; this.request = request; this.probe = probe
  }
  private root() { return join(process.env.DSH_AGENTS_HOME ?? join(this.home, '.agents'), 'skills') }

  async inspect(keys: string[]): Promise<BatchPreview> {
    assert(Array.isArray(keys) && keys.length > 0 && keys.length <= 50 && keys.every(k => typeof k === 'string' && /^(skill|mcp|plugin):[a-zA-Z0-9_/-]{1,160}$/.test(k)), '批量安装选择无效')
    keys = [...new Set(keys)].sort()
    const plugins: AppPreview[] = []
    for (const key of keys.filter(k => k.startsWith('plugin:'))) plugins.push(await this.apps.inspectCatalog(key.slice(7)))
    const standalone = keys.filter(k => !k.startsWith('plugin:'))
    const servers = await toUniversal(this.patch, false)
    const plan: Plan | null = standalone.length ? (await this.request(standalone, servers)).plan : null
    assert(!standalone.length || plan, 'Fleet 未返回所选能力清单')
    if (plan) {
      assert(plan.schema === 'fleet-capability-selection/v1' && /^[a-f0-9]{64}$/.test(plan.digest) && Array.isArray(plan.skills) && Array.isArray(plan.mcps), 'Fleet 批量清单无效')
      assert(Array.isArray(plan.keys) && plan.keys.length <= 50 && standalone.every(k => plan.keys.includes(k) || plan.skills.some(s => k.endsWith('/' + s.name))) && plan.skills.length <= 20 && plan.mcps.length <= 50 && plan.skills.length + plan.mcps.length > 0, 'Fleet 所选能力范围无效')
      let total = 0
      const names = new Set<string>()
      for (const skill of plan.skills) {
        assert(id.test(skill.name) && !names.has(skill.name) && skill.files?.['SKILL.md']?.startsWith('---\n'), 'Skill 身份无效'); names.add(skill.name)
        assert(new RegExp('(?:^|\\n)name:\\s*["\x27]?' + skill.name + '["\x27]?\\s*(?:\\n|$)').test(skill.files['SKILL.md']), 'Skill 身份不匹配')
        assert(Array.isArray(skill.binaryPaths) && skill.binaryPaths.every(p => Object.hasOwn(skill.files, p)) && Object.keys(skill.files).length <= 200, 'Skill 文件清单无效')
        assert(skill.hashes && JSON.stringify(Object.keys(skill.hashes).sort()) === JSON.stringify(Object.keys(skill.files).sort()), 'Skill 校验清单不匹配')
        for (const [path, text] of Object.entries(skill.files)) {
          assert(typeof text === 'string' && path.length <= 240 && !path.startsWith('/') && !/[\\\x00-\x1f]/.test(path) && !path.split('/').some(p => !p || p.startsWith('.') || p === 'node_modules'), 'Skill 路径无效')
          if (skill.binaryPaths.includes(path)) assert(/^[A-Za-z0-9+/]*={0,2}$/.test(text), 'Skill 二进制编码无效')
          const data = Buffer.from(text, skill.binaryPaths.includes(path) ? 'base64' : 'utf8'); total += data.length
          assert(data.length <= 512 * 1024 && total <= 6 * 1024 * 1024 && sha(data) === skill.hashes[path], 'Skill 内容完整性校验失败')
        }
      }
      assert(new Set(plan.mcps.map(m => m.id)).size === plan.mcps.length && plan.mcps.every(m => id.test(m.id)), 'MCP 身份无效')
      for (const m of plan.mcps) { const url = new URL(m.endpoint); assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'MCP 端点无效') }
    }
    const skills = await Promise.all((plan?.skills || []).map(async s => ({ name: s.name, title: s.title, files: Object.keys(s.files).length, existing: await access(join(this.root(), s.name)).then(() => true, () => false) })))
    const preview: BatchPreview = {
      previewId: randomUUID(), expiresAt: Date.now() + 10 * 60_000, keys, digest: plan?.digest || '', skills,
      mcp: (plan?.mcps || []).map(m => ({ name: m.id, title: m.title, auth: m.auth, existing: !!servers[m.id], disabled: !!servers[m.id]?.disabled })),
      plugins, conflicts: [...new Set([...skills.filter(s => s.existing).map(s => s.name), ...plugins.flatMap(p => p.skillConflicts || [])])],
    }
    for (const [key, p] of this.previews) if (p.preview.expiresAt <= Date.now()) this.previews.delete(key)
    this.previews.set(preview.previewId, { preview, plan }); return preview
  }

  async install(previewId: string, overwrite: boolean, progress: (stage: string, current: number, total: number, detail: string) => void): Promise<BatchResult> {
    assert(!this.busy, '已有批量安装进行中，请等待其完成')
    const entry = this.previews.get(previewId); assert(entry && entry.preview.expiresAt > Date.now(), '预检已过期，请重新选择')
    this.previews.delete(previewId); this.busy = true
    const checks: BatchCheck[] = [], backups: string[] = []
    try {
      const { plan, preview } = entry!, root = this.root()
      // Resolve fresh, digest-bound grants before any local write.
      const grant = plan ? await this.request(plan.keys, await toUniversal(this.patch, false), plan.digest) : null
      if (plan) assert(grant.digest === plan.digest && grant.mcpServers && JSON.stringify(Object.keys(grant.mcpServers).sort()) === JSON.stringify(plan.mcps.map(m => m.id).sort()), 'Fleet 授权范围已变化，请重新预检')
      for (const m of plan?.mcps || []) {
        const s = grant.mcpServers[m.id]
        assert(s.type === 'http' && s.url === (m.auth === 'none' || m.auth === 'oauth' ? m.endpoint : 'https://fleet.vyibc.com/api/hub/platforms/capabilities/mcp/' + m.id), 'Fleet MCP 授权端点无效')
        if (m.auth !== 'none' && m.auth !== 'oauth') assert(typeof s.headers?.Authorization === 'string' && !/[\r\n]/.test(s.headers.Authorization), 'Fleet MCP 授权无效')
      }
      for (const [index, skill] of (plan?.skills || []).entries()) {
        progress('skills', index, plan!.skills.length, '安装 ' + skill.name)
        const target = join(root, skill.name), exists = await access(target).then(() => true, () => false)
        if (exists && !overwrite) { checks.push({ name: skill.name, ok: true, warning: true, detail: '保留并复用已有 Skill，未覆盖其原版本' }); continue }
        await mkdir(root, { recursive: true })
        const staging = join(root, '.' + skill.name + '.batch-' + randomUUID()), saved = join(this.home, '.dsh', 'capability-backups', randomUUID(), skill.name)
        let moved = false, activated = false
        try {
          await mkdir(staging)
          for (const [path, content] of Object.entries(skill.files)) {
            const dest = join(staging, path); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, Buffer.from(content, skill.binaryPaths.includes(path) ? 'base64' : 'utf8'))
          }
          if (exists) { await mkdir(dirname(saved), { recursive: true, mode: 0o700 }); await rename(target, saved); moved = true; backups.push(saved) }
          await rename(staging, target); activated = true
          for (const [path, hash] of Object.entries(skill.hashes)) assert(sha(await readFile(join(target, path))) === hash, '落地文件校验失败')
          checks.push({ name: skill.name, ok: true, detail: Object.keys(skill.files).length + ' 个完整文件已安装并验证 SHA256' })
        } catch (e) {
          if (activated) await rm(target, { recursive: true, force: true })
          if (moved) await rename(saved, target)
          throw e
        } finally { await rm(staging, { recursive: true, force: true }) }
      }
      const current = await toUniversal(this.patch, false), managed: string[] = []
      for (const m of plan?.mcps || []) {
        const existing = current[m.id]
        if (existing && (existing.disabled || existing.url !== m.endpoint || Object.keys(existing.headers || {}).length)) continue
        current[m.id] = grant.mcpServers[m.id]; managed.push(m.id)
      }
      if (managed.length) backups.push((await fromUniversal(this.patch, current)).backup)
      for (const [index, m] of (plan?.mcps || []).entries()) {
        progress('mcp', index, plan!.mcps.length, '核验 ' + m.id)
        if (current[m.id]?.disabled) { checks.push({ name: m.id, ok: true, warning: true, detail: '保留本地停用状态；没有执行连接验证' }); continue }
        try { checks.push({ name: m.id, ok: true, detail: 'initialize / tools/list 通过 · ' + await this.probe(current[m.id]) + ' tools' }) }
        catch { checks.push({ name: m.id, ok: false, detail: m.auth === 'oauth' ? '配置已保留，仍需本人完成 OAuth 或配置个人 Token，未冒用管理员身份' : '配置已保存，但连接验收失败；请检查该 MCP 的授权与服务状态' }) }
      }
      for (const app of preview.plugins) {
        progress('apps', 0, preview.plugins.length, '整包安装 ' + app.displayName)
        try { const result = await this.apps.install(app.previewId, progress, { overwriteSkills: overwrite }); checks.push(...result.checks) }
        catch { checks.push({ name: app.name, ok: false, detail: '此插件安装未通过；其他已完成能力保留，请在 Apps 中检查具体阶段' }) }
      }
      const receipt = join(this.home, '.dsh', 'capability-installs', previewId + '.json'), status = checks.some(c => !c.ok) ? 'partial' : 'installed'
      await mkdir(dirname(receipt), { recursive: true, mode: 0o700 })
      await writeFile(receipt, JSON.stringify({ schema: 'dsh-capability-install/v1', keys: preview.keys, resolvedKeys: plan?.keys || [], digest: preview.digest, plugins: preview.plugins.map(p => ({ name: p.name, version: p.version })), managedMcp: managed, status, checks, backups, completedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 })
      progress('complete', 1, 1, status === 'installed' ? '批量安装完成' : '部分完成，查看逐项回执')
      return { status, checks, receipt }
    } finally { this.busy = false }
  }
}
