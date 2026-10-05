import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {AppInstaller} from '../src/apps.ts'
import {validateFleetPackage,readFleetPackage} from '../src/fleet-plugin-standard.mjs'

const manifest={name:'demo-app',version:'1.0.0',extensions:{'com.vyibc':{schemaVersion:1,entrySkills:['demo-skill'],coreSkills:['demo-skill'],platforms:{dsh:{adapter:'fleet-dsh/v1'}}}}}
const files={'plugin.json':JSON.stringify(manifest),'skills/demo-skill/SKILL.md':'---\nname: demo-skill\ndescription: example\n---\nUse references/rules.md','skills/demo-skill/references/rules.md':'Retain me','skills/demo-skill/scripts/check.mjs':'export const ok=true','mcp.json':'{"mcpServers":{}}'}
const value={schema:'fleet-plugin-package/v1',manifest,files,binaryPaths:[]},body=JSON.stringify(value)
const artifact={url:'https://resource.vyibc.com/plugins/demo-app/1.0.0/demo.fleet.json',sha256:createHash('sha256').update(body).digest('hex')}
const app={id:'demo-app',title:'Demo',blurb:'Demo',repo:'https://github.com/owner/repo',version:'1.0.0',source:{revision:'a'.repeat(40)},components:{skills:[{id:'demo-skill'}],mcp:[]},install:'',distribution:{standard:'fleet-plugin/v1',artifact}}

test('portable artifact identity, roles, path and SHA are verified',async()=>{
 assert.deepEqual(validateFleetPackage(value).skills,['demo-skill'])
 assert.throws(()=>validateFleetPackage(value,{name:'other-app'}),/identity/)
 assert.throws(()=>validateFleetPackage({...value,files:{...files,'../outside':'bad'}}),/path/)
 await assert.rejects(readFleetPackage({...artifact,sha256:'0'.repeat(64)},{},async()=>new Response(body)),/integrity/)
})
test('generic App installs the verified complete Skill tree without evaluating installers',async()=>{
 const home=await mkdtemp(join(tmpdir(),'portable-app-')),old=globalThis.fetch,token=process.env.DSH_FLEET_APP_SERVICE_TOKEN
 try{
  await mkdir(join(home,'.dsh/profiles/web'),{recursive:true})
  process.env.DSH_FLEET_APP_SERVICE_TOKEN='fixture-service-credential'
  globalThis.fetch=async url=>String(url)===artifact.url?new Response(body):String(url)==='https://fleet.vyibc.com/api/hub/platforms/demo-app/dsh'?Response.json({ok:true,plugin:'demo-app',version:'1.0.0',artifact,mcpServers:{}}):Promise.reject(Error('Unexpected request'))
  const installer=new AppInstaller(home,undefined,async()=>[app])
  const preview=await installer.inspectCatalog('demo-app');assert.equal(preview.skills.length,1)
  const result=await installer.install(preview.previewId);assert.equal(result.app.installed,true)
  for(const [path,text]of Object.entries(files))if(path.startsWith('skills/'))assert.equal(await readFile(join(home,'.agents',path),'utf8'),text)
  assert.equal((await installer.previewUpdate('demo-app')).version,'1.0.0')
 }finally{globalThis.fetch=old;if(token===undefined)delete process.env.DSH_FLEET_APP_SERVICE_TOKEN;else process.env.DSH_FLEET_APP_SERVICE_TOKEN=token;await rm(home,{recursive:true,force:true})}
})
