import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual Vite main.tsx/App/router/providers and production assets on loopback.
// No app/component imports replaced. Synthetic HTTP identities/data only; no backend/hosted/provider.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-full-route-'));
let browser, server;
const sockets = [];
const evidence = { browser: null, source: process.env.GITHUB_SHA || 'local', results: [] };
let infrastructureError;
async function waitFor(fn, limitMs = 15000, label = 'Browser prerequisite') {
  const until = Date.now() + limitMs;
  while (Date.now() < until) { try { const v = await fn(); if (v) return v; } catch {} await delay(100); }
  throw Error(label + ' timed out');
}
async function connect(url, onEvent=()=>{}) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  await new Promise((ok, no) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', no, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const r = JSON.parse(event.data);
    if(r.method)onEvent(r);
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
 const output=process.env.FAWRI_AUDIT_OUTPUT_DIR;assert.ok(output,'Owned screenshot output directory required');await mkdir(output,{recursive:true});
 const assets=resolve('artifacts/fawri/dist/public');const html=await readFile(join(assets,'index.html'),'utf8');assert.ok(html.includes('/assets/')&&!html.includes('/src/main.tsx'),'actual Vite build required');
 const expectedBundle=await build({stdin:{contents:`import {ADMIN_EMERGENCY_ACCESS_PAGE_TEXT as page} from './artifacts/fawri/src/lib/translations/features/pages/AdminEmergencyAccessPage.ts';import {ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_OWNER_FORM_COPY as owner,ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_ASSISTANT_FORM_COPY as assistant} from './artifacts/fawri/src/lib/translations/features/pages/AdminEmergencyAccessRouterPage.ts';export default {page,owner,assistant};`,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,alias:{'@':resolve('artifacts/fawri/src')}});
 const expected=(await import('data:text/javascript;base64,'+Buffer.from(expectedBundle.outputFiles[0].text).toString('base64'))).default;
 const states=new Map(),unexpected=[],apiCalls=[];
 server=createServer(async(req,res)=>{
  try{
   res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'self' data:;font-src 'self';object-src 'none'");
   const url=new URL(req.url,'http://loopback');
   if(req.method==='GET'&&['/api/auth/admin/me','/api/auth/admin/support/tickets','/api/auth/admin/emergency-read-access/overview','/api/auth/admin/emergency-read-access/directory'].includes(url.pathname)){
    const id=new URL(req.headers.referer||'http://loopback').searchParams.get('audit');const state=states.get(id);assert.ok(state,'owned named case fixture required');
    const owner=['owner','invalid-chain'].includes(state.mode);const status=state.mode==='load-failure'&&state.failing&&url.pathname.includes('/emergency-read-access/')?503:200;
    apiCalls.push({id,path:url.pathname,method:'GET',status,deviceHeaderPresent:Boolean(req.headers['x-fawri-device-id'])});
    let body;if(status!==200)body={ok:false,error:'OWNED_PRIVATE_FAILURE_SENTINEL'};
    else if(url.pathname.endsWith('/me'))body={ok:true,admin:{id:owner?'owned-route-owner':'owned-route-assistant',owner_name:'Owned synthetic admin',admin_role:owner?'owner_admin':'assistant_admin',permissions:owner?[]:['manage_support'],must_change_password:false,admin_enabled:true}};
    else if(url.pathname.endsWith('/tickets'))body={ok:true,tickets:[]};
    else if(url.pathname.endsWith('/directory'))body={ok:true,is_owner:owner,merchants:[{id:'owned-merchant',store_name:'Owned synthetic store',owner_name:'Owned synthetic merchant',status:'approved'}],...(owner?{assistants:[{id:'owned-route-assistant',owner_name:'OWNED_ASSISTANT_DIRECTORY',phone:'+9647987111012',status:'approved',admin_enabled:true}]}:{})};
    else body={ok:true,is_owner:owner,authorization:owner?null:{admin_id:'owned-route-assistant',can_request:state.mode!=='denied',can_critical_self_activate:false},requests:[],...(owner?{authorizations:[],owner_alerts:[],merchant_notices:[],audit_chain:{valid:state.mode!=='invalid-chain',event_count:7,latest_hash:'OWNED_SYNTHETIC_HASH'}}:{})};
    res.setHeader('Content-Type','application/json');return res.writeHead(status).end(JSON.stringify(body));
   }
   if(url.pathname.startsWith('/api/')){unexpected.push({path:url.pathname,method:req.method});res.writeHead(409,{'Content-Type':'application/json'});return res.end('{"ok":false,"error":"No API expected for audited guest routes"}');}
   if(req.method!=='GET'){unexpected.push({path:url.pathname,method:req.method});res.statusCode=405;return res.end();}
   const full=resolve(assets,'.'+decodeURIComponent(url.pathname));assert.ok(full===assets||full.startsWith(assets+'/'),'asset path escaped');
   if(extname(url.pathname)){try{const bytes=await readFile(full);const mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'}[extname(full)]||'application/octet-stream';res.setHeader('Content-Type',mime);return res.end(bytes);}catch{res.statusCode=404;return res.end();}}
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
  }catch{res.statusCode=500;res.end('owned static server error');}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
 browser.stderr.on('data',()=>{});browser.on('error',e=>infrastructureError=e.message);
 const port=await waitFor(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
 evidence.browser=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
 const normal=s=>String(s).replace(/[٠-٩]/g,x=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/[۰-۹]/g,x=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))).replace(/\s+/g,' ').trim();
 const modes=[{prefix:'UIR-012',mode:'owner',baselineCredit:1},{prefix:'UIE-012-ASSISTANT',mode:'assistant',baselineCredit:0},{prefix:'UIE-012-DENIED',mode:'denied',baselineCredit:0},{prefix:'UIE-012-LOAD',mode:'load-failure',baselineCredit:0},{prefix:'UID-012-CHAIN',mode:'invalid-chain',baselineCredit:0}];
 for(const route of modes)for(const lang of ['ar','en','ku'])for(const width of [390,1280]){
  const id=`${route.prefix}-${lang}-${width}`;let capture;const text=expected.page[lang];const path='/admin/emergency-access';const state={mode:route.mode,failing:route.mode==='load-failure'};states.set(id,state);
  await check(id,async()=>{
   const errors=[];const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
   const cdp=await connect(target.webSocketDebuggerUrl,e=>{if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);});
   try{
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();localStorage.setItem('fawri_lang',${JSON.stringify(lang)});`});
    await cdp('Page.navigate',{url:origin+path+'?audit='+id});
    const ready=route.mode==='load-failure'?text.loadError:route.mode==='denied'?text.noAuthorization:route.mode==='assistant'?expected.assistant[lang].title:expected.owner[lang].title;
    await waitFor(()=>evaluate(cdp,`document.body.textContent.includes(${JSON.stringify(ready)})`),15000,id+' route fixture mounted');
    await waitFor(()=>apiCalls.some(x=>x.id===id&&x.path==='/api/auth/admin/me'));await delay(400);
    async function snapshot(suffix=''){
     const v=await evaluate(cdp,`({path:location.pathname,title:document.querySelector('h1')?.textContent,lang:document.documentElement.lang,dir:document.documentElement.dir,width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.textContent,buttons:[...document.querySelectorAll('button')].map(x=>({text:x.textContent,disabled:x.disabled})),comboboxes:document.querySelectorAll('[role=combobox]').length,inputs:document.querySelectorAll('input').length,textareas:document.querySelectorAll('textarea').length,ownerMarker:document.querySelector('[data-owner-direct-start]')?.dataset.ownerDirectStart})`);
     const name=id+suffix+'.png';const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name),Buffer.from(shot.data,'base64'));
     assert.equal(v.path,path);assert.equal(v.lang,lang);assert.equal(v.dir,lang==='en'?'ltr':'rtl');assert.equal(v.width,width);assert.ok(v.scroll<=width+1,JSON.stringify({scroll:v.scroll,width}));assert.deepEqual(errors,[],'uncaught runtime exceptions');return {v,capture:name};
    }
    const initial=await snapshot();capture=initial.capture;const v=initial.v;assert.ok(v.text.includes(ready));
    let recovered=null,diagnostic=null;
    if(route.mode==='denied'){
     assert.equal(v.comboboxes,0);assert.equal(v.textareas,0);assert.equal(v.text.includes(text.authorizationsTitle),false);assert.equal(v.text.includes('OWNED_ASSISTANT_DIRECTORY'),false);
    }else if(route.mode==='load-failure'){
     assert.equal(v.text.includes('OWNED_PRIVATE_FAILURE_SENTINEL'),false);assert.equal(v.comboboxes,0);assert.equal(v.textareas,0);assert.ok(v.buttons.some(b=>normal(b.text)===normal(text.retry)));
     state.failing=false;
     await evaluate(cdp,`(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text.retry)});if(!button)throw Error('retry button absent');button.click();})()`);
     await waitFor(()=>evaluate(cdp,`document.body.textContent.includes(${JSON.stringify(expected.assistant[lang].title)})`));await delay(400);recovered=await snapshot('-recovered');assert.ok(!recovered.v.text.includes(text.loadError));assert.ok(recovered.v.comboboxes>=3);assert.equal(normal(recovered.v.title),normal(text.title));
    }else{
     assert.equal(normal(v.title),normal(text.title));assert.ok(v.comboboxes>=3);assert.equal(v.textareas,1);assert.ok(v.text.includes(text.emptyRequests));
     if(route.mode==='assistant'){
      assert.equal(v.text.includes(text.authorizationsTitle),false);assert.equal(v.text.includes('OWNED_ASSISTANT_DIRECTORY'),false);assert.ok(v.buttons.some(b=>normal(b.text)===normal(expected.assistant[lang].submit)));
     }else{
      assert.ok(v.text.includes('OWNED_ASSISTANT_DIRECTORY'));assert.ok(v.text.includes(text.authorizationsTitle));assert.equal(v.ownerMarker,'true');assert.ok(v.buttons.some(b=>normal(b.text)===normal(expected.owner[lang].submit)));
      if(route.mode==='invalid-chain'){
       await evaluate(cdp,`(()=>{const el=[...document.querySelectorAll('.font-semibold.leading-none')].find(x=>x.textContent.trim()===${JSON.stringify(text.auditTitle)});if(!el)throw Error('audit card absent');el.scrollIntoView({block:'center'});})()`);await delay(100);const lower=await snapshot('-chain');
       diagnostic=await evaluate(cdp,`(()=>{const title=[...document.querySelectorAll('.font-semibold.leading-none')].find(x=>x.textContent.trim()===${JSON.stringify(text.auditTitle)});return {auditCardText:title.closest('.rounded-xl.border.bg-card').textContent};})()`);
       assert.ok(diagnostic.auditCardText.includes(text.auditValid),'Diagnostic reproduction no longer present: investigate');diagnostic.responseValid=false;diagnostic.displayedHealthy=true;diagnostic.capture=lower.capture;diagnostic.classification='DEFECT_REPRODUCED; diagnostic PASS is not application acceptance';
      }
     }
    }
    const calls=apiCalls.filter(x=>x.id===id);for(const suffix of ['/me','/tickets','/overview','/directory'])assert.ok(calls.some(x=>x.path.endsWith(suffix)),suffix+' request absent');assert.ok(calls.every(x=>x.deviceHeaderPresent));assert.deepEqual(errors,[]);
    return {mode:route.mode,baselineCredit:route.baselineCredit,path:v.path,title:v.title,lang:v.lang,dir:v.dir,width:v.width,scroll:v.scroll,controls:{comboboxes:v.comboboxes,textareas:v.textareas,ownerMarker:v.ownerMarker},calls,uncaughtExceptions:errors.length,capture,recovered:recovered?{capture:recovered.capture,title:recovered.v.title,scroll:recovered.v.scroll,comboboxes:recovered.v.comboboxes}:null,diagnostic};
   }finally{await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);}
  });
  const r=evidence.results.at(-1);if(capture)r.capture=capture;
 }
 assert.deepEqual(unexpected,[],'unexpected API or mutation requests');
 evidence.unexpectedRequests=unexpected;evidence.apiCalls=apiCalls;evidence.limits='Actual Vite main/App/router/providers/global auth revalidator/launcher/emergency wrapper and management page; synthetic same-origin HTTP only. Six owner baseline, eighteen assistant/denied/load-retry extras and six invalid-chain reproduction diagnostics; diagnostic PASS is not product acceptance. No real cookie/backend SQL/grants/chain corruption or server authority certified. No writes/actions beyond GET-only retry; empty requests, high default severity; fallback fonts, no provider or physical-device/accessibility proof.';
 await writeFile(join(output,'results.json'),JSON.stringify(evidence,null,2));
} catch(e){infrastructureError=e.message;}
finally {
 for(const ws of sockets)ws.close();
 if(browser?.pid){const stopped=browser.exitCode===null?new Promise(ok=>browser.once('exit',ok)):Promise.resolve();try{process.kill(-browser.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')infrastructureError='browser group cleanup: '+e.message;}await Promise.race([stopped,delay(3000)]);try{process.kill(-browser.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')infrastructureError='browser group cleanup: '+e.message;}}
 if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}
 try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(e){infrastructureError='profile cleanup failed: '+e.message;}
}
if(infrastructureError)evidence.infrastructureError=infrastructureError;
console.log('AUDIT_FULL_EMERGENCY_WORKSPACE_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==30||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
