import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Tests only. Actual online-report components/helpers, compiled frontend CSS,
// synthetic props and fresh loopback browser profile; no API/DB/provider calls.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-report-print-'));
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
  const source = await readFile('artifacts/fawri/src/pages/dashboard/ReportsPage.tsx', 'utf8');
  const stop = source.indexOf('function useOnlineReport(');
  assert.ok(stop > 0);
  const components = source.slice(0, stop).replace(/^import[\s\S]*?;\s*$/gm, '');
  const report = { generated_at: '2026-10-12T00:00:00Z', received_order_count: 45, active_order_count: 0,
    delivered_order_count: 32, cancelled_order_count: 13, delivered_sales_iqd: 697910,
    delivered_delivery_fees_iqd: 0, delivered_order_value_iqd: 697910, average_delivered_order_iqd: 21810,
    paid_online_order_count: 0, paid_electronic_count: 0,
    by_channel: [{ source_channel: 'Synthetic', order_count: 45, delivered_order_count: 32, delivered_sales_iqd: 697910 }],
    by_location: [{ location_id: 'synthetic', location_name: 'Synthetic location', delivered_order_count: 32, delivered_sales_iqd: 697910 }],
    top_products: Array.from({ length: 8 }, (_, i) => ({ product_id: `audit-${i}`, product_name: `Audit item ${i+1}`, units: i+1, revenue_iqd: (i+1)*1000 })) };
  const entry = `import React from 'react'; import { createRoot } from 'react-dom/client';
    import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
    import { formatMerchantMoneyMinor } from './artifacts/fawri/src/lib/moneyUi.ts';
    import { REPORTS_PAGE_COPY as COPY } from './artifacts/fawri/src/lib/translations/features/pages/dashboard/ReportsPage.ts';
    ${components}
    const lang=new URLSearchParams(location.search).get('lang') || 'en';
    const Component=lang==='ar'?ArabicOnlineReportsContent:EnglishOnlineReportsContent;
    document.documentElement.lang=lang; document.documentElement.dir=lang==='en'?'ltr':'rtl';
    createRoot(document.getElementById('root')).render(React.createElement(Component, {
      report:${JSON.stringify(report)},copy:COPY[lang],range:'custom',customRange:{from:'2026-10-01',to:'2026-10-12'},lang }));`;
  const bundled = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, format: 'iife', platform: 'browser', write: false,
    jsx: 'automatic', nodePaths: [resolve('artifacts/fawri/node_modules')], define: { 'process.env.NODE_ENV': '"production"' } });
  const assets = resolve('artifacts/fawri/dist/public/assets');
  const cssFiles = (await readdir(assets)).filter(name => name.endsWith('.css'));
  assert.ok(cssFiles.length, 'Actual Vite compiled styles are required');
  const styles = (await Promise.all(cssFiles.map(name => readFile(join(assets, name), 'utf8')))).join('\n');
  server = createServer((req,res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'none'; connect-src 'none'; img-src 'none'; object-src 'none'");
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(bundled.outputFiles[0].text);}
    else if(req.url==='/debug.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end("globalThis.auditErrors=[];addEventListener('error',e=>auditErrors.push(e.message));addEventListener('unhandledrejection',e=>auditErrors.push(String(e.reason)));");}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);}
    else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root" class="report-print-root"></div><script src="/debug.js"></script><script src="/bundle.js"></script>');}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
  browser.stderr.on('data',()=>{});
  browser.on('error',e=>{infrastructureError=e.message;});
  const port=await waitFor(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
  evidence.browser=(await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
  for(const lang of ['ar','en','ku']) await check(`actual online report component print ${lang}`,async()=>{
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/?lang='+lang)}`,{method:'PUT'})).json();
    const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');
    try { await waitFor(()=>evaluate(cdp,'document.querySelectorAll(".report-print-online-metric").length===9')); }
    catch(e) { throw Error(e.message+' '+JSON.stringify(await evaluate(cdp, '({errors:globalThis.auditErrors,metrics:document.querySelectorAll(".report-print-online-metric").length})'))); }
    await waitFor(()=>evaluate(cdp,'document.querySelectorAll("svg.recharts-surface").length>0'));
    await cdp('Emulation.setEmulatedMedia',{media:'print'});
    const shape=await evaluate(cdp,`({characterSet:document.characterSet,metrics:document.querySelectorAll('.report-print-online-metric').length,
      text:document.body.innerText,metricValues:Array.from(document.querySelectorAll('.report-print-metric-value')).map(e=>e.textContent),scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})`);
    assert.equal(shape.characterSet,'UTF-8');assert.equal(shape.metrics,9);assert.ok(shape.text.includes('Audit item 8'));
    const pdf=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,paperWidth:8.27,paperHeight:11.69,marginTop:0.2,marginBottom:0.2,marginLeft:0.2,marginRight:0.2});
    const bytes=Buffer.from(pdf.data,'base64');
    const extracted=spawnSync('pdftotext',['-layout','-','-'],{input:bytes,encoding:'utf8',timeout:15000});
    assert.equal(extracted.status,0,extracted.stderr);
    const pages=extracted.stdout.split('\f').filter(text=>text.trim());
    assert.ok(pages.length>=1 && pages.length<=3,`unexpected page count ${pages.length}`);
    assert.ok(pages[0].trim().length>40,'first page blank/near empty');
    assert.ok(extracted.stdout.includes('Audit item 8'),'last chart product absent from PDF text');
    const normalizeNumber=value=>String(value).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g,'');
    assert.ok(shape.metricValues.some(value=>normalizeNumber(value)==='697910'),'Revenue card missing expected value: '+JSON.stringify(shape.metricValues));
    return {bytes:bytes.length,pages:pages.length,firstPageCharacters:pages[0].trim().length,metrics:shape.metrics,lastProductPresent:true,semanticRevenueCard:697910,characterSet:shape.characterSet,
      limits:'Actual report components and compiled CSS, synthetic props/system fallback fonts; not full report API, mobile app, linguistic signoff or production webfonts.'};
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
console.log('AUDIT_REPORT_PRINT_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==3||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
