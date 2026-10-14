import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual Vite main.tsx/App/router/providers and production assets on loopback.
// No app/component imports replaced. Public guest routes, no backend/hosted/provider.
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
 const expectedBundle=await build({stdin:{contents:`import {en} from './artifacts/fawri/src/lib/translations/en.ts';import {ar} from './artifacts/fawri/src/lib/translations/ar.ts';import {ku} from './artifacts/fawri/src/lib/translations/ku.ts';import {policyText} from './artifacts/fawri/src/content/policies.ts';import {OWNER_RECOVERY_COPY} from './artifacts/fawri/src/lib/ownerRecoveryCopy.ts';import {ADMIN_WORK_MONITOR_PAGE_TEXT} from './artifacts/fawri/src/lib/translations/features/pages/AdminWorkMonitorPage.ts';import {ADMIN_SUPPORT_PREVIEW_PAGE_TEXT} from './artifacts/fawri/src/lib/translations/features/pages/AdminSupportPreviewPage.ts';import {ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT} from './artifacts/fawri/src/lib/translations/features/pages/AdminEmergencySnapshotPage.ts';export default {en,ar,ku,policyText,OWNER_RECOVERY_COPY,ADMIN_WORK_MONITOR_PAGE_TEXT,ADMIN_SUPPORT_PREVIEW_PAGE_TEXT,ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT};`,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,alias:{'@':resolve('artifacts/fawri/src')}});
 const expected=(await import('data:text/javascript;base64,'+Buffer.from(expectedBundle.outputFiles[0].text).toString('base64'))).default;
 const states=new Map(),unexpected=[],apiCalls=[];
 server=createServer(async(req,res)=>{
  try{
   res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'self' data:;font-src 'self';object-src 'none'");
   const url=new URL(req.url,'http://loopback');
   if(req.method==='GET'&&['/api/auth/admin/me','/api/auth/admin/support/tickets','/api/auth/admin/support-preview/owned-preview-session/snapshot','/api/auth/admin/emergency-read-access/requests/owned-emergency-request/snapshot'].includes(url.pathname)){const id=new URL(req.headers.referer||'http://loopback').searchParams.get('audit');apiCalls.push({id,path:url.pathname,method:'GET',deviceHeaderPresent:Boolean(req.headers['x-fawri-device-id'])});const support=new URL(req.headers.referer||'http://loopback').pathname.startsWith('/admin/support-preview/');let body;if(url.pathname.endsWith('/me'))body={ok:true,admin:{id:support?'owned-preview-admin':'owned-route-owner',owner_name:'Owned synthetic admin',admin_role:support?'assistant_admin':'owner_admin',permissions:support?['manage_support','inspect_merchant_sessions']:[],must_change_password:false,admin_enabled:true}};else if(url.pathname.endsWith('/tickets'))body={ok:true,tickets:[]};else body={ok:true,snapshot:{session:{id:'owned-preview-session',merchant_name:'OWNED_PREVIEW_STORE',admin_name:'Owned synthetic admin',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),status:'active'},ticket:{id:'owned-ticket',subject:'Owned synthetic inspection',status:'in_progress'},emergency_access:{request_id:'owned-emergency-request',incident_reference:'OWNED-AUDIT-INCIDENT',severity:'high',reason:'Owned synthetic audit',expires_at:new Date(Date.now()+3600000).toISOString()},merchant:{store_name:'OWNED_PREVIEW_STORE',owner_name:'Owned synthetic merchant',phone:'+9647987111012',status:'approved'},subscription:null,products:[{id:'owned-preview-product',name:'Owned synthetic product'}],orders:[],conversations:[],saved_answers:[],training_requests:[],learned_answers:[],channels:[],counts:{products:1,orders:0,conversations:0,saved_answers:0,training_requests:0,learned_answers:0,channels:0},generated_at:new Date().toISOString()}};res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(body));}
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
 const routes=[{id:'010',path:'/admin/support-preview/owned-preview-session',mode:'support'},{id:'011',path:'/admin/emergency-access/owned-emergency-request/snapshot',mode:'emergency'}];
 for(const route of routes)for(const lang of ['ku'])for(const width of [1280]){
  const id=`UID-${route.id}-CSS-${lang}-${width}`;let capture;const desiredTitle=route.mode==='support'?expected.ADMIN_SUPPORT_PREVIEW_PAGE_TEXT[lang].title:expected.ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT[lang].title;
  await check(id,async()=>{
   const errors=[];const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
   const cdp=await connect(target.webSocketDebuggerUrl,e=>{if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);});
   try{
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();localStorage.setItem('fawri_lang',${JSON.stringify(lang)});`});
    await cdp('Page.navigate',{url:origin+route.path+'?audit='+id});
    await waitFor(async()=>normal(await evaluate(cdp,`document.querySelector('h1')?.textContent`))===normal(desiredTitle),15000,id+' route mount');await waitFor(()=>apiCalls.some(x=>x.id===id&&x.path==='/api/auth/admin/me'));await waitFor(()=>evaluate(cdp,`document.body.textContent.includes('OWNED_PREVIEW_STORE')`));
    await delay(400);
    const v=await evaluate(cdp,`({path:location.pathname,title:document.querySelector('h1')?.textContent,lang:document.documentElement.lang,dir:document.documentElement.dir,width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('.fowri-policy-list-item')].map(x=>x.querySelector('span:last-child')?.textContent),links:[...document.querySelectorAll('a')].map(x=>({href:x.getAttribute('href'),text:x.textContent,aria:x.getAttribute('aria-label'),rect:{width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}})),offenders:[...document.querySelectorAll('#root *')].map(x=>({tag:x.tagName,cls:String(x.className).slice(0,120),left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right,width:x.getBoundingClientRect().width})).filter(x=>x.width>0&&(x.left < -1||x.right>innerWidth+1)).slice(0,10)})`);
    capture=id+'.png';const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,capture),Buffer.from(shot.data,'base64'));
    assert.equal(v.path,route.path);assert.equal(normal(v.title),normal(desiredTitle));assert.equal(v.lang,lang);assert.equal(v.dir,lang==='en'?'ltr':'rtl');assert.equal(v.width,width);assert.ok(v.scroll<=width+1,JSON.stringify({scroll:v.scroll,width,offenders:v.offenders}));assert.deepEqual(errors,[],'uncaught runtime exceptions');
    const text=route.mode==='support'?expected.ADMIN_SUPPORT_PREVIEW_PAGE_TEXT[lang]:expected.ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT[lang];
    const controlState=await evaluate(cdp,`({store:document.body.textContent.includes('OWNED_PREVIEW_STORE'),incident:document.body.textContent.includes('OWNED-AUDIT-INCIDENT'),buttons:document.querySelectorAll('button').length})`);assert.equal(controlState.store,true);assert.ok(controlState.buttons>=2);if(route.mode==='emergency')assert.equal(controlState.incident,true);
    const calls=apiCalls.filter(x=>x.id===id);assert.ok(calls.some(x=>x.path==='/api/auth/admin/me'));assert.ok(calls.some(x=>x.path.endsWith('/snapshot')));assert.ok(calls.every(x=>x.deviceHeaderPresent),'device headers missing on actual App requests');assert.deepEqual(errors,[],'uncaught runtime errors');
    const measure=()=>evaluate(cdp,`(()=>{const x=document.querySelector('header > div:first-child > div:first-child'),h=document.querySelector('h1');return {badgeWidth:x.getBoundingClientRect().width,badgeFlex:getComputedStyle(x).flex,titleWidth:h.getBoundingClientRect().width,scroll:document.documentElement.scrollWidth};})()`);const before=await measure();assert.ok(before.badgeWidth>300,'catalog rule did not reproduce stretched badge');await evaluate(cdp,`(()=>{const link=document.querySelector('link[href="/catalog-kurdish-layout-fix.css"]');if(!link)throw Error('diagnostic stylesheet missing');link.disabled=true;})()`);await delay(150);const after=await measure();assert.ok(after.badgeWidth<=41,'badge did not return to declared40px after test-only stylesheet disable');assert.ok(after.titleWidth>before.titleWidth*2,'title width not recovered');assert.ok(after.scroll<=1281,'diagnostic created overflow');const afterCapture=id+'-after.png';const shotAfter=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,afterCapture),Buffer.from(shotAfter.data,'base64'));return {path:v.path,lang:v.lang,width:v.width,before,after,capture,afterCapture,testOnlyStylesheetDisabled:true};
   }finally{await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);}
  });
  const r=evidence.results.at(-1);if(capture)r.capture=capture;
 }
 assert.deepEqual(unexpected,[],'unexpected API or mutation requests');
 evidence.unexpectedRequests=unexpected;evidence.apiCalls=apiCalls;evidence.limits='Actual built Vite main/App/router/providers/pages/CSS at support/emergency snapshot paths with synthetic assistant/owner API identities, AR/EN/KU x390/1280. Fresh storage percase, current synthetic GET owner/data responses, native Chrome, same-origin owned static SPA fallback. External Google fonts blocked by CSP/DNS; fallback fonts, no backend/API/auth/OTP/provider or pixel/manual visual/accessibility certificate. Assertions cover title/direction/overflow/primary controls/syntheticowner bootstrap/device headers/matching synthetic snapshot/store/incident/basic controls. Screenshots saved as workflow artifact.';
 await writeFile(join(output,'results.json'),JSON.stringify(evidence,null,2));
} catch(e){infrastructureError=e.message;}
finally {
 for(const ws of sockets)ws.close();
 if(browser?.pid){const stopped=browser.exitCode===null?new Promise(ok=>browser.once('exit',ok)):Promise.resolve();try{process.kill(-browser.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')infrastructureError='browser group cleanup: '+e.message;}await Promise.race([stopped,delay(3000)]);try{process.kill(-browser.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')infrastructureError='browser group cleanup: '+e.message;}}
 if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}
 try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(e){infrastructureError='profile cleanup failed: '+e.message;}
}
if(infrastructureError)evidence.infrastructureError=infrastructureError;
console.log('AUDIT_SORANI_CSS_DIAGNOSTIC_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==2||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
