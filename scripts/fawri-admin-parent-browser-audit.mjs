import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual AdminPage/controller/shell/view and i18n with loopback synthetic HTTP.
// No hook, capability, tab state or permission function is replaced. No real backend.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-admin-parent-'));
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
 const states=new Map(), unexpected=[];
 const ticket={id:'synthetic-ticket',merchant_id:'synthetic-merchant',merchant_name:'Synthetic Store',merchant_phone:'+19955550000',subject:'Parent authority audit',category:'technical',status:'in_progress',assigned_admin_id:'synthetic-admin',assigned_admin_name:'Synthetic Admin',created_at:'2026-10-12T00:00:00Z',updated_at:'2026-10-12T00:00:00Z',waiting_on:'admin',messages:[{id:'message',sender_type:'merchant',sender_id:'synthetic-merchant',sender_name:'Synthetic Merchant',body:'AUDIT_PARENT_SUPPORT_MESSAGE',created_at:'2026-10-12T00:00:00Z'}],inspection_requests:[]};
 function admin(role){return {id:'synthetic-admin',owner_name:'Audit '+role,phone:'+19955550001',is_admin:true,admin_role:role==='owner'?'owner_admin':'assistant_admin',must_change_password:role==='password',permissions:role==='support'||role==='password'?['manage_support']:role==='inspector'?['manage_support','inspect_merchant_sessions']:role==='logs'?['view_logs']:[]};}
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
 import AdminPage from './artifacts/fawri/src/pages/AdminPage.tsx';
 import {I18nProvider} from './artifacts/fawri/src/lib/i18n.tsx';
 import {getAdminSupportText} from './artifacts/fawri/src/components/admin/AdminSupportTab.tsx';
 import {getAdminText} from './artifacts/fawri/src/lib/admin-translations.ts';
 localStorage.clear();sessionStorage.clear();localStorage.setItem('fawri_lang','en');
 // Suppress legacy local imports in this fresh synthetic owner; those endpoints
 // are outside this UI permission test, and non-GET requests other than synthetic logout fail closed.
 localStorage.setItem('fawri_admin_data_migrated_v1_synthetic-admin','done');
 localStorage.setItem('fawri_subscriptions_migrated_v1_synthetic-admin','done');
 globalThis.auditAdmin=getAdminSupportText('en');globalThis.auditText=getAdminText('en');
 createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(AdminPage)));`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,outfile:'audit-admin.js',jsx:'automatic',alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
 const assets=resolve('artifacts/fawri/dist/public/assets'),css=(await readdir(assets)).filter(n=>n.endsWith('.css'));assert.ok(css.length);
 const styles=(await Promise.all(css.map(n=>readFile(join(assets,n),'utf8')))).join('\n');
 server=createServer((req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'none';font-src 'none';object-src 'none'");
 if(req.url.startsWith('/api/')){
  const ref=new URL(req.headers.referer||'http://synthetic/'),state=states.get(ref.searchParams.get('case'));
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  if(state&&req.url==='/api/auth/admin/logout'&&req.method==='POST'){state.calls.push('POST '+req.url);return send(200,{ok:true});}
  if(!state||req.method!=='GET'){unexpected.push({path:req.url,method:req.method,knownCase:Boolean(state)});return send(409,{ok:false});}
  state.calls.push(req.url);
  if(req.url==='/api/auth/admin/me'){
   state.meCalls++;
   const status=['401','403','503'].includes(state.role)?Number(state.role):200;
   return send(status,state.role==='malformed'?{ok:true,admin:{is_admin:false}}:status===200?{ok:true,admin:admin(state.role)}:{ok:false});
  }
  if(req.url==='/api/auth/admin/support/tickets')return send(200,{ok:true,tickets:[ticket],active_count:1});
  const responses={
   '/api/auth/admin/emergency-read-access/overview':{ok:true,is_owner:state.role==='owner',authorization:{can_request:false},requests:[]},
   '/api/auth/merchants':{ok:true,merchants:[]},
   '/api/auth/admin/subscriptions':{ok:true,subscriptions:[]},
   '/api/auth/admin/logs':{ok:true,logs:[]},
   '/api/auth/admin/channels':{ok:true,channel_overrides:{}},
   '/api/auth/admin/deletion-requests':{ok:true,deletion_requests:[]},
   '/api/auth/admin/owner-recovery/status':{ok:true,enabled:true},
  };
  if(req.url==='/api/auth/admin/subscriptions/events'){
   res.setHeader('Content-Type','text/event-stream');res.write('event: snapshot\ndata: {"subscriptions":[]}\n\n');return;
  }
  if(responses[req.url])return send(200,responses[req.url]);
  unexpected.push({path:req.url,method:req.method});return send(404,{ok:false});
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
 async function tab(role){
  const key=String(++sequence),state={role,calls:[],meCalls:0};states.set(key,state);
  const url=origin+`/admin?case=${key}`;
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
  const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await waitFor(()=>evaluate(cdp,'Boolean(globalThis.auditAdmin && document.querySelector(".admin-page-shell"))'));
  await waitFor(()=>state.meCalls>0);return {cdp,state,target};
 }
 async function closed(t){await fetch(`http://127.0.0.1:${port}/json/close/${t.target.id}`);}
 const snapshot=c=>evaluate(c,`({support:Array.from(document.querySelectorAll('aside nav button')).some(b=>b.textContent.includes(auditAdmin.tab)),message:document.body.textContent.includes('AUDIT_PARENT_SUPPORT_MESSAGE'),reply:document.querySelectorAll('textarea').length,inspection:Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===auditAdmin.requestInspection),noPermissions:document.body.textContent.includes(auditText.mainNoPermissionsTitle),path:location.pathname,active:document.querySelector('aside nav button[aria-current=page]')?.textContent})`);
 async function openSupport(c){
  await waitFor(async()=> (await snapshot(c)).support);
  // Native trusted mouse input on the actual visible sidebar control.
  const point=await evaluate(c,`(()=>{const b=Array.from(document.querySelectorAll('aside nav button')).find(b=>b.textContent.includes(auditAdmin.tab));const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await c('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await c('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await waitFor(async()=> (await snapshot(c)).message,15000,'parent Support content');
 }
 for(const role of ['owner','support','inspector','logs','none','password','401','403','malformed','503'])await check(`actual AdminPage initial ${role} support gate`,async()=>{
  const t=await tab(role);
  try{
   const allowed=['owner','support','inspector'].includes(role);
   if(allowed)await openSupport(t.cdp);
   else if(['401','403','malformed','503'].includes(role))await waitFor(async()=> (await snapshot(t.cdp)).path==='/login');
   else await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(${JSON.stringify('Audit '+role)})`));
   await delay(250);const value=await snapshot(t.cdp);
   assert.equal(value.support,allowed);assert.equal(value.message,allowed);
   if(allowed){assert.equal(value.reply,role==='owner'?0:1);assert.equal(value.inspection,role==='inspector',JSON.stringify(value));}
   else assert.equal(t.state.calls.filter(p=>p.includes('/support/')).length,0,'denied initial session must not request Support');
   if(role==='none')assert.equal(value.noPermissions,true);
   if(role==='password')assert.equal(await evaluate(t.cdp,'Boolean(document.querySelector("[role=dialog]"))'),true);
   return {...value,requests:t.state.calls};
  }finally{await closed(t);}
 });
 for(const change of [{from:'support',to:'logs'},{from:'support',to:'401'},{from:'support',to:'403'},{from:'none',to:'support'},{from:'owner',to:'logs'}])await check(`actual parent refresh ${change.from} to ${change.to}`,async()=>{
  const t=await tab(change.from);
  try{
   if(change.from!=='none')await openSupport(t.cdp);
   else await waitFor(async()=> (await snapshot(t.cdp)).noPermissions);
   const before=t.state.meCalls;t.state.role=change.to;
   await evaluate(t.cdp,'window.dispatchEvent(new Event("focus"));true');
   await waitFor(()=>t.state.meCalls>before,15000,'real controller permission refresh');
   if(change.to==='support')await openSupport(t.cdp);
   else await waitFor(async()=>{const v=await snapshot(t.cdp);return !v.support&&!v.message;},15000,'parent drops revoked support');
   if(change.to==='logs')await waitFor(()=>evaluate(t.cdp,'document.querySelector("aside nav button[aria-current=page]")?.textContent===auditText.mainTabLogs'),15000,'settled logs fallback');
   const value=await snapshot(t.cdp);
   assert.equal(value.support,change.to==='support');assert.equal(value.message,change.to==='support');
   if(['401','403'].includes(change.to))assert.equal(value.path,'/login');
   if(change.to==='logs')assert.equal(value.active,await evaluate(t.cdp,'auditText.mainTabLogs'));
   return {...value,meCalls:t.state.meCalls,limits:'Synthetic GET auth fixture; no backend authorization or race-window write proof.'};
  }finally{await closed(t);}
 });
 assert.deepEqual(unexpected,[],'unexpected or mutating synthetic requests');
 evidence.limits='Actual mounted AdminPage/controller/shell/view/i18n/CSS; synthetic loopback HTTP, desktop English. No real auth server, App router wrapper, hosted grant, full visual/accessibility or backend write proof.';
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
console.log('AUDIT_ADMIN_PARENT_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==15||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
