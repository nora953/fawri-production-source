import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual AdminEmergencySnapshotPage and i18n with loopback synthetic HTTP.
// No component or hook is replaced. No real backend.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-emergency-snapshot-'));
let browser, server;
const sockets = [];
const evidence = { browser: null, source: process.env.GITHUB_SHA || 'local', results: [] };
let infrastructureError;
async function waitFor(fn, limitMs = 15000, label = 'Browser prerequisite') {
  const until = Date.now() + limitMs;
  while (Date.now() < until) { try { const v = await fn(); if (v) return v; } catch {} await delay(100); }
  throw Error(label + ' timed out');
}
async function connect(url) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  await new Promise((ok, no) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', no, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const r = JSON.parse(event.data);
    const p = pending.get(r.id);
    if (p) { pending.delete(r.id); clearTimeout(p.timer); r.error ? p.no(Error(JSON.stringify(r.error))) : p.ok(r.result); }
  });
  return (method, params = {}) => new Promise((ok, no) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); no(Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { ok, no, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(cdp, expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function check(name, fn) {
  try { const details = await fn(); evidence.results.push({ name, status: 'PASS', details }); }
  catch (e) { evidence.results.push({ name, status: 'FAIL', error: e.message }); }
}

try {
 const states=new Map(),unexpected=[];
 const snapshot=()=>({emergency_access:{request_id:'synthetic-preview',incident_reference:'AUDIT-INCIDENT',severity:'high',reason:'Synthetic audit',expires_at:new Date(Date.now()+60000).toISOString()},session:{id:'synthetic-preview',merchant_name:'Synthetic Store',admin_name:'Synthetic Admin',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'active'},ticket:{id:'synthetic-ticket',subject:'Preview audit',status:'in_progress'},merchant:{store_name:'AUDIT_PRIVATE_STORE',owner_name:'AUDIT_PRIVATE_OWNER',phone:'+19955550000',status:'approved'},subscription:null,products:[{id:'synthetic-product',name:'AUDIT_PRODUCT <img src=x onerror=alert(1)>',password:'AUDIT_HIDDEN_SECRET',access_token:'AUDIT_HIDDEN_SECRET'}],orders:[],conversations:[],saved_answers:[],training_requests:[],learned_answers:[],channels:[],counts:{products:1},generated_at:new Date().toISOString()});
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
 import Preview from './artifacts/fawri/src/pages/AdminEmergencySnapshotPage.tsx';
 import {I18nProvider} from './artifacts/fawri/src/lib/i18n.tsx';
 import {ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT as TEXT} from './artifacts/fawri/src/lib/translations/features/pages/AdminEmergencySnapshotPage.ts';
 const lang=new URLSearchParams(location.search).get('lang')||'en';localStorage.clear();sessionStorage.clear();localStorage.setItem('fawri_lang',lang);globalThis.auditText=TEXT[lang];
 createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(Preview,{requestId:'synthetic-preview'})));`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,outfile:'audit-preview.js',jsx:'automatic',alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
 const assets=resolve('artifacts/fawri/dist/public/assets'),css=(await readdir(assets)).filter(n=>n.endsWith('.css'));assert.ok(css.length);
 const styles=(await Promise.all(css.map(n=>readFile(join(assets,n),'utf8')))).join('\n');
 server=createServer((req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'none';font-src 'none';object-src 'none'");
 if(req.url.startsWith('/api/')){
  const ref=new URL(req.headers.referer||'http://synthetic/'),state=states.get(ref.searchParams.get('case'));
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  if(!state){unexpected.push({path:req.url,method:req.method});return send(409,{ok:false});}
  if(req.url==='/api/auth/admin/logout'&&req.method==='POST')return send(200,{ok:true});
  if(req.url==='/api/auth/admin/emergency-read-access/requests/synthetic-preview/end'&&req.method==='POST'){
   state.endCalls++;return send(state.mode==='end503'?503:state.mode==='end401'?401:200,{ok:state.mode==='success'});
  }
  if(req.url!=='/api/auth/admin/emergency-read-access/requests/synthetic-preview/snapshot'||req.method!=='GET'){unexpected.push({path:req.url,method:req.method});return send(404,{ok:false});}
  state.calls++;
  const status=state.status;
  const data=snapshot();if(state.mode==='expired')data.emergency_access.expires_at=new Date(Date.now()+2500).toISOString();
  return setTimeout(()=>send(status,status===200?{ok:true,snapshot:data}:{ok:false,error:status===409?'SUPPORT_PREVIEW_EXPIRED':'synthetic failure'}),state.calls===1?250:10);
 }else if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(bundle.outputFiles.find(x=>x.path.endsWith('.js')).text);}
 else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);}
 else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
 browser.stderr.on('data',()=>{});browser.on('error',e=>infrastructureError=e.message);
 const port=await waitFor(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
 evidence.browser=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;


 let sequence=0;
 async function tab(lang='en',status=200,mode='success'){
  const key=String(++sequence),state={status,mode,calls:0,endCalls:0};states.set(key,state);
  const url=origin+`/admin/emergency-access/synthetic-preview/snapshot?case=${key}&lang=${lang}`;
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
  const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await waitFor(()=>evaluate(cdp,'Boolean(globalThis.auditText)'));return{cdp,state,target};
 }
 async function closed(t){await fetch(`http://127.0.0.1:${port}/json/close/${t.target.id}`);}
 const loaded=c=>waitFor(()=>evaluate(c,'document.body.textContent.includes("AUDIT_PRIVATE_STORE")'));
 async function click(c,expression){
  const point=await evaluate(c,`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>${expression});if(!b)throw Error('button missing');b.scrollIntoView();const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await c('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await c('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 }
 for(const lang of ['ar','en','ku'])await check(`actual emergency snapshot ${lang} read-only tabs and escaped records at390px`,async()=>{
  const t=await tab(lang);try{
   await loaded(t.cdp);
   assert.equal(await evaluate(t.cdp,'document.querySelector("#root>div").dir'),lang==='en'?'ltr':'rtl');
   assert.equal(await evaluate(t.cdp,'document.documentElement.scrollWidth>innerWidth+1'),false);
   await click(t.cdp,'b.textContent.includes(auditText.products)');
   await waitFor(()=>evaluate(t.cdp,'document.body.textContent.includes("AUDIT_PRODUCT")'));
   const v=await evaluate(t.cdp,`({markup:document.querySelectorAll('#root img,#root script').length,secret:document.body.textContent.includes('AUDIT_HIDDEN_SECRET'),inputs:document.querySelectorAll('input,textarea,select').length})`);
   assert.equal(v.markup,0);assert.equal(v.secret,false);assert.equal(v.inputs,0);
   await click(t.cdp,'b.textContent.includes(auditText.orders)');
   await waitFor(()=>evaluate(t.cdp,'document.body.textContent.includes(auditText.empty)'));
   return {...v,emptyTab:true,endCalls:t.state.endCalls};
  }finally{await closed(t);}
 });
 for(const status of [403,409])await check(`actual emergency snapshot initial${status} has no snapshot disclosure`,async()=>{
  const t=await tab('en',status);try{
   await waitFor(()=>evaluate(t.cdp,'document.body.textContent.includes(auditText.loadError)'));
   assert.equal(await evaluate(t.cdp,'document.body.textContent.includes("AUDIT_PRIVATE_STORE")'),false);return{status,requests:t.state.calls};
  }finally{await closed(t);}
 });
 await check('actual emergency snapshot503 manual retry recovers',async()=>{
  const t=await tab('en',503);try{
   await waitFor(()=>evaluate(t.cdp,'document.body.textContent.includes(auditText.loadError)'));t.state.status=200;
   await click(t.cdp,'b.textContent.trim()===auditText.retry');await loaded(t.cdp);return{requests:t.state.calls};
  }finally{await closed(t);}
 });
 for(const status of [409,503])await check(`actual emergency snapshot silent${status} must invalidate or visibly mark retained snapshot`,async()=>{
  const t=await tab();try{
   await loaded(t.cdp);t.state.status=status;const before=t.state.calls;
   await waitFor(()=>t.state.calls>before,14000,'actual10second preview poll');await delay(200);
   const v=await evaluate(t.cdp,`({retained:document.body.textContent.includes('AUDIT_PRIVATE_STORE'),error:document.body.textContent.includes(auditText.loadError),path:location.pathname})`);
   assert.ok(!v.retained||v.error||v.path==='/login',`Silent${status} retains unmarked private snapshot: ${JSON.stringify(v)}`);return v;
  }finally{await closed(t);}
 });
 await check('actual emergency snapshot expired countdown must not leave private snapshot visible',async()=>{
  const t=await tab('en',200,'expired');try{
   await loaded(t.cdp);await waitFor(()=>evaluate(t.cdp,'document.body.textContent.includes(auditText.loadError)'),6000,'native expiry clears emergency data');
   const v=await evaluate(t.cdp,`({expired:document.body.textContent.includes(auditText.expired),retained:document.body.textContent.includes('AUDIT_PRIVATE_STORE')})`);
   assert.equal(v.retained,false,`Expired preview remains readable: ${JSON.stringify(v)}`);return v;
  }finally{await closed(t);}
 });
 await check('actual emergency snapshot end503 must not navigate as if termination succeeded',async()=>{
  const t=await tab('en',200,'end503');try{
   await loaded(t.cdp);await click(t.cdp,'b.textContent.trim()===auditText.end');await waitFor(()=>t.state.endCalls===1);await delay(200);
   const path=await evaluate(t.cdp,'location.pathname');assert.notEqual(path,'/admin/emergency-access','End503 navigates away without confirming server termination');return{path,endCalls:t.state.endCalls};
  }finally{await closed(t);}
 });

 await check('actual emergency successful end200 navigates after one termination request',async()=>{
  const t=await tab();try{
   await loaded(t.cdp);await click(t.cdp,'b.textContent.trim()===auditText.end');await waitFor(()=>t.state.endCalls===1);
   await waitFor(()=>evaluate(t.cdp,'location.pathname==="/admin/emergency-access"'));return{endCalls:t.state.endCalls};
  }finally{await closed(t);}
 });
 await check('actual emergency end401 must preserve login redirect',async()=>{
  const t=await tab('en',200,'end401');try{
   await loaded(t.cdp);await click(t.cdp,'b.textContent.trim()===auditText.end');await waitFor(()=>t.state.endCalls===1);await delay(250);
   const path=await evaluate(t.cdp,'location.pathname');assert.equal(path,'/login','finally must not overwrite401 login redirect');return{path};
  }finally{await closed(t);}
 });
 assert.deepEqual(unexpected,[]);
 evidence.limits='Actual component/native browser/i18n/CSS, synthetic loopback snapshots and one synthetic end POST. No hosted/private records or real backend writes. Server expiry and current-grant enforcement remain separate SQL/HTTP evidence; retained already-delivered data is not a fresh access bypass.';
} catch(e){infrastructureError=e.message;}
finally {
  for(const ws of sockets)ws.close();
  if(browser?.pid){
    const stopped=browser.exitCode===null?new Promise(ok=>browser.once('exit',ok)):Promise.resolve();
    try{process.kill(-browser.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')infrastructureError='browser group cleanup: '+e.message;}
    await Promise.race([stopped,delay(3000)]);
    try{process.kill(-browser.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')infrastructureError='browser group cleanup: '+e.message;}
  }
  if(server)await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));
  try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
  catch(e){infrastructureError='profile cleanup failed: '+e.message;}
}

if(infrastructureError)evidence.infrastructureError=infrastructureError;
console.log('AUDIT_EMERGENCY_SNAPSHOT_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==12||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
