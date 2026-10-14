import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual WorkMonitor React component/i18n/CSS with loopback synthetic HTTP.
// No hook, capability, tab state or permission function is replaced. No real backend.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-monitor-'));
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
 const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import AdminWorkMonitorPage from './artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx';
 import {I18nProvider} from './artifacts/fawri/src/lib/i18n.tsx';
 import {ADMIN_WORK_MONITOR_PAGE_TEXT} from './artifacts/fawri/src/lib/translations/features/pages/AdminWorkMonitorPage.ts';
 const lang=new URL(location.href).searchParams.get('lang')||'en';localStorage.clear();sessionStorage.clear();localStorage.setItem('fawri_lang',lang);globalThis.auditText=ADMIN_WORK_MONITOR_PAGE_TEXT[lang];
 function AuditRoot(){const [id,setId]=useState('admin-A');globalThis.auditSwitch=setId;return React.createElement(AdminWorkMonitorPage,{adminId:id});}
 createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(AuditRoot)));`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,outfile:'audit-monitor.js',jsx:'automatic',alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
 const assets=resolve('artifacts/fawri/dist/public/assets'),css=(await readdir(assets)).filter(n=>n.endsWith('.css'));assert.ok(css.length);
 const styles=(await Promise.all(css.map(n=>readFile(join(assets,n),'utf8')))).join('\n');
 function payload(id){return {ok:true,admin:{id,owner_name:'AUDIT_MONITOR_'+id,phone:'+19955550001',admin_enabled:true},summary:{work_status:'active',open_session_count:0,last_activity_at:'2026-10-13T00:00:00Z',pending_device_count:0,session_limit:3,trusted_device_limit:2,trusted_device_count:0,failed_login_count_24h:0},sessions:[],devices:[],failed_logins:[],recent_logs:[]};}
 server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'none';font-src 'none';object-src 'none'");
  if(req.url.startsWith('/api/')){
   const ref=new URL(req.headers.referer||'http://synthetic/'),state=states.get(ref.searchParams.get('case'));
   res.setHeader('Content-Type','application/json; charset=utf-8');
   if(!state||req.method!=='GET'||!/^\/api\/auth\/admins\/admin-[AB]\/work-monitor$/.test(req.url)){unexpected.push({path:req.url,method:req.method});res.statusCode=409;return res.end('{"ok":false}');}
   const id=req.url.includes('admin-B')?'admin-B':'admin-A';state.calls.push({id,status:state.status});
   if(state.hold&&id==='admin-A'){state.held=res;return;}
   res.statusCode=state.status;res.end(JSON.stringify(state.status===200?payload(id):{ok:false,error:'Synthetic monitor denial'}));
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
 async function tab(lang='en',width=1280,options={}){
  const key=String(++sequence),state={status:200,hold:false,calls:[],...options};states.set(key,state);
  const url=origin+`/admin/monitor?case=${key}&lang=${lang}`;
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
  const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await waitFor(()=>evaluate(cdp,'Boolean(globalThis.auditText && globalThis.auditSwitch && document.querySelector("main"))'));await waitFor(()=>state.calls.length>0);
  return {cdp,state,target};
 }
 async function closed(t){if(t.state.held&&!t.state.held.writableEnded)t.state.held.destroy();await fetch(`http://127.0.0.1:${port}/json/close/${t.target.id}`);}
 const snapshot=c=>evaluate(c,`({A:document.body.textContent.includes('AUDIT_MONITOR_admin-A'),B:document.body.textContent.includes('AUDIT_MONITOR_admin-B'),error:document.body.textContent.includes(auditText.loadError),title:document.querySelector('h1')?.textContent,expectedTitle:auditText.title,dir:document.querySelector('main')?.dir,viewport:innerWidth,scroll:document.documentElement.scrollWidth})`);
 for(const lang of ['ar','en','ku'])await check(`actual monitor ${lang} at390 language/direction/overflow`,async()=>{
  const t=await tab(lang,390);try{await waitFor(async()=> (await snapshot(t.cdp)).A);const v=await snapshot(t.cdp);assert.equal(v.title,v.expectedTitle);assert.equal(v.dir,lang==='en'?'ltr':'rtl');assert.ok(v.scroll<=v.viewport+1,JSON.stringify(v));assert.equal(v.error,false);return {...v,calls:t.state.calls};}finally{await closed(t);}
 });
 await check('actual initial403 shows error and hides monitor data',async()=>{
  const t=await tab('en',1280,{status:403});try{await waitFor(async()=> (await snapshot(t.cdp)).error);const v=await snapshot(t.cdp);assert.equal(v.A,false);assert.equal(v.B,false);return v;}finally{await closed(t);}
 });
 for(const status of [403,503])await check(`actual15second silent${status} must expose error or clear prior monitor data`,async()=>{
  const t=await tab();try{await waitFor(async()=> (await snapshot(t.cdp)).A);const n=t.state.calls.length;t.state.status=status;await waitFor(()=>t.state.calls.length>n,22000,'actual monitor timer request');await delay(400);const v=await snapshot(t.cdp);assert.ok(v.error||!v.A,JSON.stringify({...v,calls:t.state.calls}));return v;}finally{await closed(t);}
 });
 await check('actual prop change cannot be overwritten by old admin response',async()=>{
  const t=await tab('en',1280,{hold:true});try{
   await waitFor(()=>Boolean(t.state.held));await evaluate(t.cdp,"auditSwitch('admin-B');true");await waitFor(async()=> (await snapshot(t.cdp)).B);const before=await snapshot(t.cdp);
   t.state.hold=false;t.state.held.end(JSON.stringify(payload('admin-A')));await delay(500);const v=await snapshot(t.cdp);assert.ok(v.B&&!v.A,JSON.stringify({before,after:v,calls:t.state.calls}));return v;
  }finally{await closed(t);}
 });
 assert.deepEqual(unexpected,[],'unexpected or mutating synthetic request');
 evidence.limits='Actual mounted WorkMonitor React/i18n/compiledCSS/nativeChrome with synthetic loopback GETs. Real15second timers and React prop lifecycle; no App router, real auth/role/backend/SQL/fullroute/accessibility/write clearance. Three narrow language cases are component evidence, not completion of222route cases.';

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
console.log('AUDIT_WORK_MONITOR_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==7||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
