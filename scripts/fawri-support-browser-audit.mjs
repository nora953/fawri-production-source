import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual reactive central-report/toolbar/i18n and compiled CSS with a synthetic
// loopback API fixture. No real API, database or external providers.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-support-browser-'));
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
 const ticket={id:'synthetic-ticket',merchant_id:'synthetic-merchant',merchant_name:'Synthetic Store',merchant_phone:'+19955550000',
 subject:'Audit support <img src=x onerror=alert(1)>',category:'technical',status:'in_progress',assigned_admin_id:'synthetic-admin',assigned_admin_name:'Synthetic Admin',
 created_at:'2026-10-12T00:00:00Z',updated_at:'2026-10-12T00:00:00Z',waiting_on:'admin',messages:[
 {id:'message',sender_type:'merchant',sender_id:'synthetic-merchant',sender_name:'Synthetic Merchant',body:'AUDIT_SUPPORT_MESSAGE <script>bad()</script>',created_at:'2026-10-12T00:00:00Z'}],inspection_requests:[]};
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
 import Merchant from './artifacts/fawri/src/pages/dashboard/SupportPage.tsx';
 import Admin,{getAdminSupportText} from './artifacts/fawri/src/components/admin/AdminSupportTab.tsx';
 import {I18nProvider,useI18n} from './artifacts/fawri/src/lib/i18n.tsx';
 import {SUPPORT_PAGE_AUTHORITY_TEXT as AUTH} from './artifacts/fawri/src/lib/translations/features/pages/dashboard/SupportPage.ts';
 const q=new URLSearchParams(location.search),lang=q.get('lang')||'en',role=q.get('role')||'merchant';localStorage.setItem('fawri_lang',lang);
 function App(){const {t}=useI18n();globalThis.auditCopy=t;globalThis.auditAuthority=AUTH[lang];globalThis.auditAdmin=getAdminSupportText(lang);
 return role==='merchant'?React.createElement(Merchant):React.createElement(Admin,{adminId:'synthetic-admin',isOwner:role==='owner',canInspectSessions:role==='inspector'});}
 createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(App)));`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,outfile:'audit-support.js',jsx:'automatic',
 alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
 const assets=resolve('artifacts/fawri/dist/public/assets'),css=(await readdir(assets)).filter(n=>n.endsWith('.css'));assert.ok(css.length);
 const styles=(await Promise.all(css.map(n=>readFile(join(assets,n),'utf8')))).join('\n');
 const calls=new Map();
 server=createServer((req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'none';font-src 'none';object-src 'none'");
 if(req.url.startsWith('/api/')){
 const ref=new URL(req.headers.referer||'http://synthetic/'),mode=ref.searchParams.get('mode')||'success',key=ref.search;
 const n=(calls.get(key)||0)+1;calls.set(key,n);res.setHeader('Content-Type','application/json; charset=utf-8');
 const fail=mode==='error'&&n===1||mode==='stale'&&n===2;
 setTimeout(()=>{res.statusCode=fail?503:200;res.end(JSON.stringify(fail?{ok:false}:{ok:true,tickets:mode==='empty'?[]:[ticket]}));},n===1?1600:10);
 }else if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(bundle.outputFiles.find(x=>x.path.endsWith('.js')).text);}
 else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);}
 else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
 browser.stderr.on('data',()=>{});browser.on('error',e=>infrastructureError=e.message);
 const port=await waitFor(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
 evidence.browser=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
 async function tab(role='merchant',lang='en',mode='success'){
 const url=origin+`/?role=${role}&lang=${lang}&mode=${mode}`;
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
 const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');await waitFor(()=>evaluate(cdp,'Boolean(globalThis.auditCopy)'));return {cdp,key:new URL(url).search};
 }
 const loaded=c=>waitFor(()=>evaluate(c,'document.body.textContent.includes("AUDIT_SUPPORT_MESSAGE")'),15000,'support ticket message rendered');
 const click=(c,expr)=>evaluate(c,`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${expr}).click();true`);
 for(const lang of ['ar','en','ku'])await check(`actual merchant support ${lang} mobile loading and escaped conversation`,async()=>{
 const {cdp}=await tab('merchant',lang);await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await waitFor(()=>evaluate(cdp,'document.body.textContent.includes(auditCopy.support_loading)'),15000,'merchant loading text');await loaded(cdp);const shape=await evaluate(cdp,`({dir:document.querySelector('#root>div').getAttribute('dir'),
 width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,active:document.querySelectorAll('#root img,#root script').length,
 reply:document.querySelector('textarea')?.disabled,newDisabled:document.querySelector('[aria-label="'+auditCopy.support_new_ticket+'"]').disabled})`);
 assert.equal(shape.dir,lang==='en'?'ltr':'rtl');assert.equal(shape.width,390);assert.equal(shape.overflow,false);assert.equal(shape.active,0);assert.equal(shape.reply,false);assert.equal(shape.newDisabled,false);
 await evaluate(cdp,`document.querySelector('[aria-label="'+auditCopy.support_new_ticket+'"]').focus();true`);
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await waitFor(()=>evaluate(cdp,'Boolean(document.querySelector("input[maxlength=\"120\"]"))'),15000,'keyboard-opened new ticket form');
 assert.equal(await evaluate(cdp,'document.querySelectorAll("label").length>=3'),true);
 return {...shape,keyboardCreate:true,limits:'Actual mounted component/i18n/CSS with synthetic API; no backend/session, full visual or accessibility signoff.'};
 });
 await check('merchant empty state enables new ticket with no stale conversation',async()=>{
 const {cdp}=await tab('merchant','en','empty');await waitFor(()=>evaluate(cdp,'document.body.textContent.includes(auditCopy.support_empty_title)'));
 assert.equal(await evaluate(cdp,'document.querySelectorAll("article").length'),0);return {empty:true};
 });
 for(const role of ['merchant','assistant'])await check(`${role} initial503 disables unavailable controls and real retry recovers`,async()=>{
 const {cdp}=await tab(role,'en','error');await waitFor(()=>evaluate(cdp,role==='merchant'?'document.body.textContent.includes(auditAuthority.unavailableTitle)':'document.body.textContent.includes(auditAdmin.loadError)'));
 assert.equal(await evaluate(cdp,'document.querySelectorAll("textarea").length'),0);
 await click(cdp,role==='merchant'?'auditCopy.support_retry':'auditAdmin.retry');await loaded(cdp);return {initial503:true,retry:true};
 });
 await check('merchant failed refresh blocks mutations until successful recovery',async()=>{
 const {cdp,key}=await tab('merchant','en','stale');await loaded(cdp);await evaluate(cdp,'window.dispatchEvent(new Event("focus"));true');
 await waitFor(()=>evaluate(cdp,'document.body.textContent.includes(auditAuthority.staleTitle)'));
 assert.equal(await evaluate(cdp,'document.querySelector("textarea").disabled'),true);
 assert.equal(await evaluate(cdp,`document.querySelector('[aria-label="'+auditCopy.support_new_ticket+'"]').disabled`),true);
 await evaluate(cdp,'window.dispatchEvent(new Event("focus"));true');await waitFor(()=>evaluate(cdp,'document.querySelector("textarea")?.disabled===false'));
 return {retainedConfirmedData:true,mutationsBlocked:true,requests:calls.get(key)};
 });
 for(const role of ['owner','assistant','inspector'])await check(`actual admin support ${role} action surfaces`,async()=>{
 const {cdp}=await tab(role);await loaded(cdp);
 const shape=await evaluate(cdp,`({reply:document.querySelectorAll('textarea').length,inspection:Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===auditAdmin.requestInspection)})`);
 assert.equal(shape.reply,role==='owner'?0:1);assert.equal(shape.inspection,role==='inspector');
 if(role==='inspector'){
 await click(cdp,'auditAdmin.requestInspection');await waitFor(()=>evaluate(cdp,'Boolean(document.querySelector("[role=dialog]"))'));
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await waitFor(()=>evaluate(cdp,'!document.querySelector("[role=dialog]")'));shape.escapeClosesDialog=true;
 }
 return {...shape,limits:'Actual child component with role props; parent admin route gate and server grants are separate proof.'};
 });
 await check('admin empty state removes conversation and mutation inputs',async()=>{
 const {cdp}=await tab('assistant','en','empty');await waitFor(()=>evaluate(cdp,'document.body.textContent.includes(auditAdmin.emptyTitle)'));
 assert.equal(await evaluate(cdp,'document.querySelectorAll("textarea,article").length'),0);return {empty:true};
 });
 await check('admin failed silent refresh must gate stale mutation controls',async()=>{
 const {cdp,key}=await tab('assistant','en','stale');await loaded(cdp);await evaluate(cdp,'window.dispatchEvent(new Event("focus"));true');
 await waitFor(()=>calls.get(key)>=2);await delay(200);
 const shape=await evaluate(cdp,`({replyDisabled:document.querySelector('textarea')?.disabled,resolveDisabled:Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditAdmin.markResolved)?.disabled,retained:document.body.textContent.includes('AUDIT_SUPPORT_MESSAGE')})`);
 assert.equal(shape.replyDisabled,true,`Stale admin controls remain active: ${JSON.stringify(shape)}`);return shape;
 });
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
console.log('AUDIT_SUPPORT_BROWSER_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==12||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
