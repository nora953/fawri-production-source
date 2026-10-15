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
 function admin(role){return {id:'synthetic-admin',owner_name:'Audit '+role,phone:'+19955550001',is_admin:true,admin_role:role==='owner'?'owner_admin':'assistant_admin',must_change_password:role==='password',permissions:role==='support'||role==='password'?['manage_support']:role==='inspector'?['manage_support','inspect_merchant_sessions']:role==='logs'?['view_logs']:role==='finance'?['manage_subscriptions']:[]};}
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
 import AdminPage from './artifacts/fawri/src/pages/AdminPage.tsx';
 import {I18nProvider} from './artifacts/fawri/src/lib/i18n.tsx';
 import {getAdminSupportText} from './artifacts/fawri/src/components/admin/AdminSupportTab.tsx';
 import {getAdminText} from './artifacts/fawri/src/lib/admin-translations.ts';
 import {VERIFIED_RECEIPT_REVIEW_COPY} from './artifacts/fawri/src/lib/translations/features/admin/VerifiedReceiptReview.ts';
 const auditLang=new URLSearchParams(location.search).get('lang')||'en';
 import {RECEIPT_REPLAY_COPY} from './artifacts/fawri/src/lib/translations/features/admin/ReceiptReplayControls.ts';
 globalThis.auditReplay=RECEIPT_REPLAY_COPY[auditLang];
 globalThis.auditReceipt=VERIFIED_RECEIPT_REVIEW_COPY[auditLang];
 localStorage.clear();sessionStorage.clear();localStorage.setItem('fawri_lang',auditLang);
 // Suppress legacy local imports in this fresh synthetic owner; those endpoints
 // are outside this UI permission test, and non-GET requests other than synthetic logout fail closed.
 localStorage.setItem('fawri_admin_data_migrated_v1_synthetic-admin','done');
 localStorage.setItem('fawri_subscriptions_migrated_v1_synthetic-admin','done');
 globalThis.auditAdmin=getAdminSupportText('en');globalThis.auditText=getAdminText('en');
 createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(AdminPage)));`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,outfile:'audit-admin.js',jsx:'automatic',alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
 const assets=resolve('artifacts/fawri/dist/public/assets'),css=(await readdir(assets)).filter(n=>n.endsWith('.css'));assert.ok(css.length);
 const styles=(await Promise.all(css.map(n=>readFile(join(assets,n),'utf8')))).join('\n');
 server=createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'none';font-src 'none';object-src 'none'");
 if(req.url.startsWith('/api/')){
  const ref=new URL(req.headers.referer||'http://synthetic/'),state=states.get(ref.searchParams.get('case'));
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  if(state&&req.url==='/api/auth/admin/logout'&&req.method==='POST'){state.calls.push('POST '+req.url);return send(200,{ok:true});}
  const replayMatch=req.url.match(/^\/api\/auth\/admin\/billing\/verified-receipts\/(RECEIPT_FIRST_PAGE|RECEIPT_SECOND_PAGE)\/(replay-review|replay)$/);
  if(state&&req.method==='POST'&&replayMatch){
   assert.ok(req.headers['x-fawri-device-id']);assert.equal(req.headers.origin,origin);
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
   assert.deepEqual(Object.keys(body).sort(),['authority','order_id']);assert.ok(['bot_subscription','cashier_subscription'].includes(body.authority));assert.ok(typeof body.order_id==='string'&&body.order_id.length>0&&body.order_id.length<=180);
   state.calls.push('POST '+req.url);state.replayCalls??=[];state.replayCalls.push({action:replayMatch[2],event:replayMatch[1],body});
   res.setHeader('Cache-Control','no-store');
   if(state.actionDelay)await delay(state.actionDelay);
   if(replayMatch[2]==='replay-review')return send(state.reviewStatus||200,state.reviewStatus?{ok:false,error:'SENSITIVE_FIXTURE_ERROR'}:{ok:true,status:'verified',applied:false,receipt_event_id:replayMatch[1],...body});
   if(state.executeStatus)return send(state.executeStatus,{ok:false,error:'SENSITIVE_FIXTURE_ERROR'});
   state.appliedIntents??=new Set();const identity=JSON.stringify({event:replayMatch[1],...body});const duplicate=state.appliedIntents.has(identity);state.appliedIntents.add(identity);
   if(state.loseAck)return send(503,{ok:false,error:'SENSITIVE_FIXTURE_ERROR'});
   return send(200,{ok:true,status:duplicate?'duplicate':'applied',receipt_event_id:replayMatch[1],...body});
  }
  if(!state||req.method!=='GET'){unexpected.push({path:req.url,method:req.method,knownCase:Boolean(state)});return send(409,{ok:false});}
  state.calls.push(req.url);
  if(req.url==='/api/auth/admin/me'){
   state.meCalls++;
   const status=['401','403','503'].includes(state.role)?Number(state.role):200;
   return send(status,state.role==='malformed'?{ok:true,admin:{is_admin:false}}:status===200?{ok:true,admin:admin(state.role)}:{ok:false});
  }
  if(req.url==='/api/auth/admin/support/tickets')return send(200,{ok:true,tickets:[ticket],active_count:1});
  if(req.url.startsWith('/api/auth/admin/billing/verified-receipts?')){
   assert.ok(req.headers['x-fawri-device-id'],'real device header required');
   res.setHeader('Cache-Control','no-store');
   if(state.receiptStatus)return send(state.receiptStatus,{ok:false,error:'SENSITIVE_FIXTURE_DRIVER_DETAIL'});
   const cursor=new URL(req.url,'http://synthetic').searchParams.get('cursor');
   if(cursor!==null&&cursor!=='synthetic_opaque_cursor')return send(400,{ok:false});
   return send(200,{ok:true,receipts:state.emptyReceipts?[]:[{provider:'superqi_sandbox',provider_event_id:cursor?'RECEIPT_SECOND_PAGE':'RECEIPT_FIRST_PAGE',event_type:state.receiptType||'payment_succeeded',amount_iqd:25000,first_received_at:'2026-10-14T12:00:00.123456Z',payment_ref_suffix:'12345678',request_ref_suffix:null,payment_ref:'FORBIDDEN_FULL_REFERENCE',payload_hash:'FORBIDDEN_PAYLOAD_HASH'}],next_cursor:state.emptyReceipts||cursor?null:'synthetic_opaque_cursor'});
  }
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
 async function tab(role,lang='en'){
  const key=String(++sequence),state={role,calls:[],meCalls:0};states.set(key,state);
  const url=origin+`/admin?case=${key}&lang=${lang}`;
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

 const receiptRequests=t=>t.state.calls.filter(path=>path.startsWith('/api/auth/admin/billing/verified-receipts?'));
 async function receiptClick(c,label){
  const point=await evaluate(c,`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditReceipt[${JSON.stringify(label)}]);if(!b||b.disabled)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert.ok(point,'enabled receipt control '+label);
  await c('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await c('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 }
 async function openReceipts(t){
  await waitFor(()=>evaluate(t.cdp,`Array.from(document.querySelectorAll('aside nav button')).some(b=>b.textContent.includes(auditReceipt.title))`));
  const point=await evaluate(t.cdp,`(()=>{const b=Array.from(document.querySelectorAll('aside nav button')).find(b=>b.textContent.includes(auditReceipt.title));const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await t.cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await t.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await waitFor(()=>receiptRequests(t).length>0);
 }
 for(const lang of ['en','ar','ku'])await check(`actual receipt review owner pagination ${lang}`,async()=>{
  const t=await tab('owner',lang);
  try{
   await openReceipts(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   assert.equal(await evaluate(t.cdp,`document.querySelector('[aria-labelledby=receipt-review-title]').dir`),lang==='en'?'ltr':'rtl');
   assert.equal(await evaluate(t.cdp,`document.body.textContent.includes(auditReceipt.description)`),true,'localized review description');
   assert.equal(await evaluate(t.cdp,`document.body.textContent.includes('2026-10-14T12:00:00.123456Z')&&document.body.textContent.includes('…12345678')`),true,'technical UTC timestamp and reference digits must remain exact');
   assert.equal(await evaluate(t.cdp,`/FORBIDDEN_FULL_REFERENCE|FORBIDDEN_PAYLOAD_HASH/.test(document.body.textContent)`),false);
   await receiptClick(t.cdp,'next');await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_SECOND_PAGE')&&!document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   assert.ok(receiptRequests(t).at(-1).includes('cursor=synthetic_opaque_cursor'));
   await receiptClick(t.cdp,'previous');await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   t.state.emptyReceipts=true;await receiptClick(t.cdp,'refresh');await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReceipt.empty)&&!document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   return {lang,requests:receiptRequests(t),redacted:true,pagination:true,empty:true};
  }finally{await closed(t);}
 });
 for(const role of ['support','logs','none','password'])await check(`actual receipt review denied ${role}`,async()=>{
  const t=await tab(role);try{
   await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(${JSON.stringify('Audit '+role)})`));await delay(200);
   assert.equal(await evaluate(t.cdp,`Array.from(document.querySelectorAll('aside nav button')).some(b=>b.textContent.includes(auditReceipt.title))`),false);
   assert.equal(receiptRequests(t).length,0);return {requests:0};
  }finally{await closed(t);}
 });
 for(const status of [403,503])await check(`actual receipt review HTTP ${status} clears previous data`,async()=>{
  const t=await tab('finance');try{
   await openReceipts(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   t.state.receiptStatus=status;await receiptClick(t.cdp,'refresh');
   await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReceipt.${status===403?'denied':'unavailable'})`));
   assert.equal(await evaluate(t.cdp,`/RECEIPT_FIRST_PAGE|SENSITIVE_FIXTURE_DRIVER_DETAIL/.test(document.body.textContent)`),false);
   t.state.receiptStatus=null;await receiptClick(t.cdp,'refresh');await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   return {status,cleared:true,recovered:true};
  }finally{await closed(t);}
 });
 await check('actual receipt review permission refresh unmounts data',async()=>{
  const t=await tab('finance');try{
   await openReceipts(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   const before=t.state.meCalls;t.state.role='logs';await evaluate(t.cdp,'window.dispatchEvent(new Event("focus"));true');
   await waitFor(()=>t.state.meCalls>before);
   await waitFor(()=>evaluate(t.cdp,`!document.querySelector('[aria-labelledby=receipt-review-title]')&&!document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));
   const calls=receiptRequests(t).length;await delay(200);assert.equal(receiptRequests(t).length,calls);
   return {unmounted:true,requestsStopped:true};
  }finally{await closed(t);}
 });

 async function replayClick(c,label){
  const point=await evaluate(c,`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditReplay[${JSON.stringify(label)}]);if(!b||b.disabled)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert.ok(point,'enabled replay control '+label);await c('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await c('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 }
 async function fillReplay(t,authority='bot_subscription',order='synthetic-existing-order-123'){
  await openReceipts(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));await replayClick(t.cdp,'open');
  assert.equal(await evaluate(t.cdp,`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditReplay.review).disabled`),true,'blank intent cannot be reviewed');
  await evaluate(t.cdp,`(()=>{const select=document.querySelector('[data-replay-authority]');select.value=${JSON.stringify(authority)};select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  const point=await evaluate(t.cdp,`(()=>{const input=document.querySelector('[data-replay-order]');input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await t.cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await t.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await t.cdp('Input.insertText',{text:order});
  await waitFor(()=>evaluate(t.cdp,`!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditReplay.review).disabled`));
 }
 async function reviewReplay(t){await replayClick(t.cdp,'review');await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.verified)`));}
 async function executeReplay(t){await replayClick(t.cdp,'execute');await waitFor(()=>evaluate(t.cdp,`Boolean(document.querySelector('[role=alertdialog]'))`));await replayClick(t.cdp,'confirm');}
 const executed=t=>(t.state.replayCalls||[]).filter(call=>call.action==='replay');
 for(const lang of ['en','ar','ku'])await check(`actual operator replay review confirm execute and duplicate ${lang}`,async()=>{
  const t=await tab('owner',lang);try{
   await fillReplay(t);assert.equal(executed(t).length,0);await reviewReplay(t);
   await replayClick(t.cdp,'execute');await waitFor(()=>evaluate(t.cdp,`Boolean(document.querySelector('[role=alertdialog]'))`));
   assert.equal(await evaluate(t.cdp,`document.querySelector('[role=alertdialog]').textContent.includes('synthetic-existing-order-123')`),true,'exact technical order digits');
   await waitFor(()=>evaluate(t.cdp,`document.activeElement?.textContent.trim()===auditReplay.confirm`));
   await replayClick(t.cdp,'cancel');assert.equal(executed(t).length,0,'cancel cannot execute');await waitFor(()=>evaluate(t.cdp,`document.activeElement?.textContent.trim()===auditReplay.execute`));
   await executeReplay(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.applied)`));assert.equal(executed(t).length,1);
   await reviewReplay(t);await executeReplay(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.duplicate)`));assert.equal(t.state.appliedIntents.size,1);
   return {lang,reviewBeforeExecute:true,explicitConfirm:true,cancelledWrites:0,syntheticApplications:1,duplicateVisible:true};
  }finally{await closed(t);}
 });
 await check('actual finance cashier replay retains explicit cashier intent through confirmation',async()=>{
  const t=await tab('finance');try{await fillReplay(t,'cashier_subscription','synthetic-cashier-order-456');await reviewReplay(t);await executeReplay(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.applied)`));assert.equal(executed(t).length,1);assert.deepEqual(executed(t)[0].body,{authority:'cashier_subscription',order_id:'synthetic-cashier-order-456'});return {authority:'cashier_subscription',explicitIntent:true,syntheticApplications:1};}finally{await closed(t);}
 });
 await check('actual operator intent edit invalidates completed review',async()=>{
  const t=await tab('finance');try{await fillReplay(t,'cashier_subscription');await reviewReplay(t);
   const point=await evaluate(t.cdp,`(()=>{const input=document.querySelector('[data-replay-order]');input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await t.cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await t.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await t.cdp('Input.insertText',{text:'-changed'});
   await waitFor(()=>evaluate(t.cdp,`!Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===auditReplay.execute)`));assert.equal(executed(t).length,0);return {invalidated:true,writes:0};
  }finally{await closed(t);}
 });
 await check('actual operator conflicting review never enables execution',async()=>{
  const t=await tab('finance');try{t.state.reviewStatus=409;await fillReplay(t);await replayClick(t.cdp,'review');await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.conflict)`));assert.equal(executed(t).length,0);assert.equal(await evaluate(t.cdp,`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===auditReplay.execute)`),false);return {writes:0};}finally{await closed(t);}
 });
 for(const status of [403,409])await check(`actual operator execute ${status} clears review and sensitive details`,async()=>{
  const t=await tab('finance');try{await fillReplay(t);await reviewReplay(t);t.state.executeStatus=status;await executeReplay(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.${status===403?'denied':'conflict'})`));assert.equal(executed(t).length,1);assert.equal(await evaluate(t.cdp,`document.body.textContent.includes('SENSITIVE_FIXTURE_ERROR')||Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===auditReplay.execute)`),false);return {status,reviewCleared:true};}finally{await closed(t);}
 });
 await check('actual operator uncertain acknowledgement requires explicit fresh review and retry',async()=>{
  const t=await tab('finance');try{await fillReplay(t);await reviewReplay(t);t.state.loseAck=true;await executeReplay(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.uncertain)`));await delay(200);assert.equal(executed(t).length,1,'no automatic execute retry');assert.equal(t.state.appliedIntents.size,1);
   assert.equal(await evaluate(t.cdp,`document.body.textContent.includes(auditReplay.applied)||document.body.textContent.includes('SENSITIVE_FIXTURE_ERROR')`),false);
   t.state.loseAck=false;await reviewReplay(t);await executeReplay(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes(auditReplay.duplicate)`));assert.equal(t.state.appliedIntents.size,1);return {uncertainVisible:true,automaticRetries:0,explicitReviewRetry:true,syntheticApplications:1};
  }finally{await closed(t);}
 });
 await check('actual operator pending review locks navigation and permission removal ignores late response',async()=>{
  const t=await tab('finance');try{await fillReplay(t);t.state.actionDelay=500;await replayClick(t.cdp,'review');await waitFor(()=>t.state.replayCalls?.length===1);
   assert.equal(await evaluate(t.cdp,`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditReceipt.refresh).disabled`),true);
   const before=t.state.meCalls;t.state.role='logs';await evaluate(t.cdp,'window.dispatchEvent(new Event("focus"));true');await waitFor(()=>t.state.meCalls>before);await waitFor(()=>evaluate(t.cdp,`!document.querySelector('[data-receipt-replay]')`));await delay(600);
   assert.equal(await evaluate(t.cdp,`document.body.textContent.includes(auditReplay.verified)`),false);assert.equal(executed(t).length,0);return {navigationLocked:true,lateIgnored:true,writes:0};
  }finally{await closed(t);}
 });
 await check('actual operator failed payment receipt offers no replay controls',async()=>{
  const t=await tab('owner');try{t.state.receiptType='payment_failed';await openReceipts(t);await waitFor(()=>evaluate(t.cdp,`document.body.textContent.includes('RECEIPT_FIRST_PAGE')`));assert.equal(await evaluate(t.cdp,`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===auditReplay.open)`),false);assert.equal(executed(t).length,0);return {writes:0};}finally{await closed(t);}
 });
 assert.deepEqual(unexpected,[],'unexpected or mutating synthetic requests');
 evidence.limits='Actual mounted AdminPage/controller/shell/view/i18n/CSS; synthetic loopback GET/POST HTTP, desktop English plus receipt review/replay English/Arabic/Sorani; simulated acknowledgements/applications only, no real backend payment/grant or transport commit-uncertainty proof. No real auth server, App router wrapper, hosted grant, full visual/accessibility or backend write proof.';
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
if(infrastructureError||evidence.results.length!==36||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
