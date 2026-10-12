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
const profile = await mkdtemp(join(tmpdir(), 'fawri-central-report-'));
let browser, server;
const sockets = [];
const evidence = { browser: null, source: process.env.GITHUB_SHA || 'local', results: [] };
let infrastructureError;
async function waitFor(fn, limitMs = 15000) {
  const until = Date.now() + limitMs;
  while (Date.now() < until) { try { const v = await fn(); if (v) return v; } catch {} await delay(100); }
  throw Error('Browser prerequisite timed out');
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
  const products=['First audit product','End audit product'].map((name,i)=>({product_id:'product-'+i,product_name:name,net_units:16,net_revenue_minor:348955,
    profit_status:'available',gross_profit_minor:89955,cost_known_affected_units:16,cost_unknown_affected_units:0}));
  const currency={currency_code:'IQD',currency_fraction_digits:0,sale_count:45,active_sale_count:32,voided_sale_count:13,return_count:12,
    gross_revenue_minor:1000000,refunds_minor:302090,net_revenue_minor:697910,sold_units:50,returned_units:18,net_units:32,
    average_ticket_minor:22222,profit_status:'available',gross_profit_minor:179910,cost_known_net_units:32,cost_unknown_net_units:0,
    top_products:products,top_profitable_products:products};
  const report={sale_count:45,by_currency:[currency]};
  const counts={operation_count:70,sale_count:45,return_count:12,void_count:13};
  const data={ok:true,generated_at:'2026-10-12T00:00:00Z',sales_scanned:45,report,
    by_staff:[{staff_id:'staff',staff_name:'Synthetic Staff',report}],by_station:[{station_id:'station',station_name:'Synthetic Station',report}],
    by_location:[{location_id:'location',location_name:'Synthetic Location',report}],activity:{
      by_staff:[{staff_id:'staff',staff_name:'Synthetic Staff',...counts}],by_station:[{station_id:'station',station_name:'Synthetic Station',...counts}],
      by_location:[{location_id:'location',location_name:'Synthetic Location',...counts}],operation_matching_count:70,operation_detail_limit:30,
      operations:Array.from({length:30},(_,i)=>({operation_id:'operation-'+i,sale_id:'sale:synthetic-'+i,operation_kind:'sale',staff_id:'staff',staff_name:'Synthetic Staff',
        station_id:'station',station_name:'Synthetic Station',location_id:'location',location_name:'Synthetic Location',shift_id:'cashier_shift_synthetic-'+i,
        occurred_at:'2026-10-12T00:00:00Z',amount_minor:1000,currency_code:'IQD',currency_fraction_digits:0}))}};
  const empty={...data,sales_scanned:0,report:{sale_count:0,by_currency:[]},by_staff:[],by_station:[],by_location:[],
    activity:{by_staff:[],by_station:[],by_location:[],operations:[],operation_matching_count:0,operation_detail_limit:30}};
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
    import Page from './artifacts/fawri/src/pages/dashboard/CashierCentralReportsPage.tsx';
    import {I18nProvider} from './artifacts/fawri/src/lib/i18n.tsx';
    import {CASHIER_CENTRAL_REPORTS_COPY as COPY} from './artifacts/fawri/src/lib/translations/features/pages/dashboard/CashierCentralReportsPage.ts';
    import {REPORT_TOOLBAR_COPY} from './artifacts/fawri/src/lib/translations/features/components/reportToolbarCopy.ts';
    const lang=new URLSearchParams(location.search).get('lang') || 'en';localStorage.setItem('fawri_lang',lang);
    globalThis.auditCopy=COPY[lang];globalThis.auditToolbarCopy=REPORT_TOOLBAR_COPY[lang];
    createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(Page,{embedded:true})));`;
  const bundled=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,
    jsx:'automatic',alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
  const assets=resolve('artifacts/fawri/dist/public/assets');const cssFiles=(await readdir(assets)).filter(n=>n.endsWith('.css'));assert.ok(cssFiles.length);
  const styles=(await Promise.all(cssFiles.map(n=>readFile(join(assets,n),'utf8')))).join('\n');
  const calls=new Map();
  server=createServer((req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'none';font-src 'none';object-src 'none'");
    if(req.url.startsWith('/api/cashier/management/report')){
      const ref=new URL(req.headers.referer||'http://synthetic/?mode=success');const mode=ref.searchParams.get('mode')||'success';
      const key=ref.search;const n=(calls.get(key)||0)+1;calls.set(key,n);res.setHeader('Content-Type','application/json; charset=utf-8');
      if(mode==='error' && n===1){res.statusCode=503;res.end(JSON.stringify({ok:false}));}else res.end(JSON.stringify(mode==='empty'?empty:data));
    }else if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(bundled.outputFiles[0].text);}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);}
    else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root" class="report-print-root"></div><script src="/bundle.js"></script>');}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
  browser.stderr.on('data',()=>{});browser.on('error',e=>{infrastructureError=e.message;});
  const port=await waitFor(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
  evidence.browser=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
  async function tab(lang,mode='success'){
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+`/?lang=${lang}&mode=${mode}`)}`,{method:'PUT'})).json();
    const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');await waitFor(()=>evaluate(cdp,'Boolean(globalThis.auditCopy)'));return cdp;
  }
  for(const lang of ['ar','en','ku'])await check(`actual central cashier report ${lang}`,async()=>{
    const cdp=await tab(lang);await waitFor(()=>evaluate(cdp,'document.querySelectorAll(".report-print-currency-section").length===1'));
    await waitFor(()=>evaluate(cdp,'document.querySelectorAll("svg.recharts-surface").length===2'));
    await cdp('Emulation.setEmulatedMedia',{media:'print'});
    const shape=await evaluate(cdp,`({metrics:document.querySelectorAll('.report-summary-metric').length,operationRows:document.querySelectorAll('.report-print-operation-details tbody tr').length,
      text:document.body.textContent,warning:document.body.textContent.includes(auditCopy.detailsLimited.replace('{limit}','30')),
      net:document.querySelector('.report-summary-metric')?.textContent,characterSet:document.characterSet})`);
    assert.equal(shape.characterSet,'UTF-8');assert.equal(shape.metrics,6);assert.equal(shape.operationRows,30);assert.equal(shape.warning,true);
    assert.ok(shape.text.includes('End audit product'));
    const normalize=value=>String(value).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g,'');
    assert.equal(normalize(shape.net),'697910');
    const pdf=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});const bytes=Buffer.from(pdf.data,'base64');
    const extracted=spawnSync('pdftotext',['-layout','-','-'],{input:bytes,encoding:'utf8',timeout:15000});assert.equal(extracted.status,0,extracted.stderr);
    const pages=extracted.stdout.split('\f').filter(p=>p.trim());assert.ok(pages.length>=1&&pages.length<=6);assert.ok(pages[0].trim().length>40);assert.ok(extracted.stdout.includes('End audit product'));
    return {pages:pages.length,bytes:bytes.length,metrics:6,operationRows:30,partialNotice:true,lastProduct:true,netMinor:697910,
      limits:'Actual reactive component/toolbar/i18n/compiled CSS; synthetic loopback API reports. Not authenticated owner backend, actual accounting or visual/physical signoff.'};
  });
  await check('actual central report empty state hides stale report',async()=>{
    const cdp=await tab('en','empty');await waitFor(()=>evaluate(cdp,'document.body.textContent.includes(auditCopy.empty)'));
    assert.equal(await evaluate(cdp,'document.querySelectorAll(".report-print-currency-section").length'),0);return {emptyState:true,noStaleReport:true};
  });
  await check('failed central report disables export then recovers through real range controls',async()=>{
    const cdp=await tab('en','error');await waitFor(()=>evaluate(cdp,'document.body.textContent.includes(auditCopy.failed)'));
    assert.equal(await evaluate(cdp,`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditToolbarCopy.download)?.disabled`),true);
    await evaluate(cdp,`document.querySelector('[aria-label="'+auditToolbarCopy.chooseRange+'"]').click();true`);
    await waitFor(()=>evaluate(cdp,'Boolean(document.querySelector("[role=dialog]"))'));
    await evaluate(cdp,`Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.trim()===auditToolbarCopy.seven).click();true`);
    await evaluate(cdp,`Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.trim()===auditToolbarCopy.apply).click();true`);
    await waitFor(()=>evaluate(cdp,'document.querySelectorAll(".report-print-currency-section").length===1'));
    assert.equal(await evaluate(cdp,`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===auditToolbarCopy.download)?.disabled`),false);
    return {firstRequest503:true,errorDisablesExport:true,realRangeChangeRetry:true,recovered:true};
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
console.log('AUDIT_CENTRAL_REPORT_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==5||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
