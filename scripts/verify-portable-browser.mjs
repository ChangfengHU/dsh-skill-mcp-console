// Real browser acceptance; only --install confirms the named Flow App.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-portable-chrome-'));
const evidence=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-portable-evidence-'));
const chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let ws,sequence=0;const pending=new Map(),errors=[];
try{
 const endpoint=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('chrome timeout')),15000);chrome.stderr.on('data',d=>{text+=d;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}})});
 ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.method==='Network.loadingFailed')errors.push(m.params.errorText);if(m.method==='Network.responseReceived'&&m.params.response.status>=400)errors.push({path:new URL(m.params.response.url).pathname,status:m.params.response.status});if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true}),call=(m,p={})=>send(m,p,sessionId);
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:'https://dsh.vyibc.com/?installApp=vyibc-flow-video-studio'});
 const wait=async(predicate,count=100)=>{for(let i=0;i<count;i++){if(await evaluate(predicate))return;await new Promise(r=>setTimeout(r,300))}console.log(JSON.stringify({text:await evaluate('document.body.innerText.slice(-1800)'),buttons:await evaluate('Array.from(document.querySelectorAll("button")).map(b=>({text:b.textContent?.trim().slice(0,60),aria:b.getAttribute("aria-label")})).slice(-30)'),errors}));throw Error('UI readiness failed')};
 await wait('!!Array.from(document.querySelectorAll(".dsm-modal button")).find(b=>["确认安装","备份并更新"].includes(b.textContent)&&!b.disabled)');
 assert.ok(await evaluate('document.querySelector(".dsm-modal").innerText.includes("11 Skills · 9 MCP")'));
 const screenshot=async name=>{const r=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(evidence,name),Buffer.from(r.data,'base64'))};
 await screenshot('preview.png');
 if(process.argv.includes('--install')){
  await evaluate('Array.from(document.querySelectorAll(".dsm-modal button")).find(b=>["确认安装","备份并更新"].includes(b.textContent)).click()');
  await wait('!!document.querySelector(".dsm-app-report")||!!document.querySelector(".dsm-modal .dsm-err")',600);
  const error=await evaluate('document.querySelector(".dsm-modal .dsm-err")?.textContent');if(error)throw Error(error);
  assert.ok(await evaluate('document.querySelector(".dsm-app-report").textContent.includes("DSH 已登记")'));
  await wait('!!Array.from(document.querySelectorAll(".dsm-modal button")).find(b=>b.textContent==="关闭"&&!b.disabled)',200);
  await screenshot('installed.png');
 }
 console.log(JSON.stringify({ok:true,preview:true,installation:process.argv.includes('--install'),evidence,errors}));
}finally{ws?.close();chrome.kill('SIGTERM');await new Promise(r=>chrome.once('exit',r));await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200})}
