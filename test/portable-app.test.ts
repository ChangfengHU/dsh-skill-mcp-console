import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {AppInstaller} from '../src/apps.ts'
import {fromUniversal,toUniversal} from '../src/mcpconfig.ts'
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

for(const headers of [{},{Authorization:'fixture-existing'}])test(`portable install repairs only canonical empty authorization; preserve existing=${!!headers.Authorization}`,async()=>{
 const home=await mkdtemp(join(tmpdir(),'portable-auth-')),old=globalThis.fetch,token=process.env.DSH_FLEET_APP_SERVICE_TOKEN
 try{
  const patch=join(home,'.dsh/profiles/web/cordis.patch.yml');await mkdir(join(home,'.dsh/profiles/web'),{recursive:true})
  const endpoint='https://fleet.vyibc.com/mcp/behavior',bridge='https://fleet.vyibc.com/api/hub/platforms/demo-app/mcp/demo-service'
  await fromUniversal(patch,{'demo-service':{type:'http',url:endpoint,headers}})
  const testValue={...value,files:{...files,'mcp.json':JSON.stringify({mcpServers:{'demo-service':{type:'streamable-http',url:endpoint}}})}}
  const text=JSON.stringify(testValue),descriptor={...artifact,sha256:createHash('sha256').update(text).digest('hex')},published={...app,components:{skills:app.components.skills,mcp:[{id:'demo-service'}]},distribution:{...app.distribution,artifact:descriptor}}
  process.env.DSH_FLEET_APP_SERVICE_TOKEN='fixture-service'
  globalThis.fetch=async(url,options)=>{
   if(String(url)===artifact.url)return new Response(text)
   if(String(url).endsWith('/demo-app/dsh'))return Response.json({ok:true,plugin:'demo-app',version:'1.0.0',artifact:descriptor,mcpServers:{'demo-service':{type:'http',url:bridge,headers:{Authorization:'Bearer fixture-scoped'}}}})
   assert.ok([endpoint,bridge].includes(String(url)))
   const rpc=JSON.parse(String(options?.body))
   return rpc.method==='notifications/initialized'?new Response(null,{status:202}):Response.json({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='initialize'?{protocolVersion:'2025-06-18'}:{tools:[]}})
  }
  const installer=new AppInstaller(home,patch,async()=>[published]),preview=await installer.inspectCatalog('demo-app')
  const result=await installer.install(preview.previewId);assert.equal(result.app.installed,true)
  const final=(await toUniversal(patch,false))['demo-service']
  assert.equal(final.url,headers.Authorization?endpoint:bridge)
  assert.equal(final.headers?.Authorization,headers.Authorization||'Bearer fixture-scoped')
 }finally{globalThis.fetch=old;if(token===undefined)delete process.env.DSH_FLEET_APP_SERVICE_TOKEN;else process.env.DSH_FLEET_APP_SERVICE_TOKEN=token;await rm(home,{recursive:true,force:true})}
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
