import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AppInstaller } from '../src/apps.ts'

test('native Apps includes verified local installation and distinguishes source drift', async t => {
  const root = await mkdtemp(join(tmpdir(),'local-app-catalog-'))
  const old = process.env.DSH_HOME; process.env.DSH_HOME = root
  t.after(async()=>{ if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;await rm(root,{recursive:true,force:true}) })
  const manifest = join(root,'source/dsh/app.json')
  await mkdir(join(root,'source/dsh'),{recursive:true}); await mkdir(join(root,'apps'))
  await writeFile(manifest,'{"name":"cartoon-autonomy"}')
  await writeFile(join(root,'apps/cartoon-autonomy.json'),JSON.stringify({schema:1,name:'cartoon-autonomy',version:'0.1.0',revision:'test',sourceKind:'local-development',source:join(root,'source'),manifest,manifestSha256:createHash('sha256').update(await readFile(manifest)).digest('hex'),skills:['studio-autonomous'],mcpServers:['vyibc-image'],managedSkills:['studio-autonomous'],managedAgents:['new-owned-agent'],status:'installed',enabled:true}))
  const installer = new AppInstaller(root)
  const installed = (await installer.catalog()).find(x=>x.name==='cartoon-autonomy')!
  assert.equal(installed.installed,true); assert.equal(installed.localDevelopment,true)
  assert.deepEqual(installed.agentPresets,['new-owned-agent']); assert.equal(installed.installer,'')
  await writeFile(manifest,'{"name":"cartoon-autonomy","changed":true}')
  const drift = (await installer.catalog()).find(x=>x.name==='cartoon-autonomy')!
  assert.equal(drift.installed,false); assert.equal(drift.installState,'failed')
})
