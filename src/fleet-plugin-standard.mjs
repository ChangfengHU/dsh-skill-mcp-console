// Fleet package contract v1: portable source, optional platform declarations.
export function validateFleetPackage(value, expected = {}) {
  const fail = (ok, reason) => { if (!ok) throw Error(reason); };
  fail(value?.schema === 'fleet-plugin-package/v1', 'unsupported_plugin_standard');
  const {manifest,files,binaryPaths=[]}=value;
  fail(manifest && /^[a-z][a-z0-9-]{1,63}$/.test(manifest.name) && /^\d+\.\d+\.\d+$/.test(manifest.version),'invalid_plugin_identity');
  fail(!expected.name || expected.name===manifest.name,'plugin_identity_mismatch');
  fail(!expected.version || expected.version===manifest.version,'plugin_version_mismatch');
  fail(files&&typeof files==='object'&&!Array.isArray(files)&&Object.keys(files).length<=250,'invalid_plugin_files');
  fail(Object.entries(files).every(([path,text])=>typeof text==='string'&&text.length<=4*1024*1024&&path.length<=240&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(p=>!p||p==='..'||p==='.'||p==='node_modules'||p==='.git')),'invalid_plugin_path');
  fail(JSON.stringify(JSON.parse(files['plugin.json']))===JSON.stringify(manifest),'manifest_mismatch');
  fail(Array.isArray(binaryPaths)&&binaryPaths.every(path=>Object.hasOwn(files,path)&&/^[A-Za-z0-9+/]*={0,2}$/.test(files[path])),'invalid_binary_files');
  const extension=manifest.extensions?.['com.vyibc'];
  fail(extension?.schemaVersion===1,'unsupported_plugin_standard');
  const skills=Object.keys(files).flatMap(path=>/^skills\/([a-z][a-z0-9-]{1,79})\/SKILL\.md$/.exec(path)?.[1]||[]);
  for(const role of ['entrySkills','coreSkills'])if(extension[role]!==undefined)fail(Array.isArray(extension[role])&&new Set(extension[role]).size===extension[role].length&&extension[role].every(name=>skills.includes(name)),'invalid_skill_roles');
  for(const name of skills){const text=files['skills/'+name+'/SKILL.md'];fail(text.startsWith('---\n')&&new RegExp('(?:^|\\n)name:\\s*["\x27]?'+name+'["\x27]?\\s*(?:\\n|$)').test(text)&&/(?:^|\n)description:\s*\S/.test(text),'invalid_skill_frontmatter');}
  const mcp=JSON.parse(files['mcp.json']||'{"mcpServers":{}}').mcpServers;
  fail(mcp&&typeof mcp==='object'&&!Array.isArray(mcp),'invalid_mcp');
  for(const [id,server]of Object.entries(mcp)){
    fail(/^[a-z][a-z0-9-]{1,79}$/.test(id)&&server.type==='streamable-http','unsupported_mcp');
    const url=new URL(server.url);fail(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&!server.headers,'unsafe_mcp_declaration');
  }
  return {name:manifest.name,version:manifest.version,skills,mcpIds:Object.keys(mcp),entrySkills:extension.entrySkills||[],coreSkills:extension.coreSkills||[],platforms:extension.platforms||{}};
}

export async function readFleetPackage(descriptor, expected={}, fetcher=fetch) {
  const url=new URL(descriptor?.url);
  if(url.origin!=='https://resource.vyibc.com'||url.search||url.hash||!url.pathname.startsWith('/plugins/')||!url.pathname.endsWith('.fleet.json')||!/^[a-f0-9]{64}$/.test(descriptor.sha256||''))throw Error('invalid_plugin_artifact');
  const response=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('plugin_artifact_unavailable');
  const reader=response.body.getReader();const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('plugin_artifact_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(sha!==descriptor.sha256)throw Error('plugin_artifact_integrity_failed');
  const value=JSON.parse(new TextDecoder().decode(bytes));validateFleetPackage(value,expected);return value;
}
