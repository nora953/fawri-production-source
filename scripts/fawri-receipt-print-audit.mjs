import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Actual receipt producer, synthetic sale and fresh loopback Chrome profile.
// No API/DB/provider calls or physical print action.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-receipt-print-'));
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
  const sale={sale_id:'audit-receipt-001',operation_id:'audit-operation',local_merchant_id:'synthetic',device_id:'synthetic-device',device_sequence:1,
    source:'cashier',status:'voided',currency_code:'IQD',currency_fraction_digits:0,
    lines:[{line_id:'one',product_id:'one',product_name_snapshot:'<img src=x onerror="globalThis.injected=true"> Audit item 1',variant_name_snapshot:'Variant <b>test</b>',
      quantity:2,base_unit_price_minor:1000,effective_unit_price_minor:1000,discount_minor:0,line_total_minor:2000,unit_cost_minor:321,cost_evidence:'PRIVATE_COST_SENTINEL'},
      {line_id:'two',product_id:'two',product_name_snapshot:'Last audit item',quantity:1,base_unit_price_minor:500,effective_unit_price_minor:500,discount_minor:0,line_total_minor:500}],
    subtotal_minor:2500,manual_discount_minor:100,discount_minor:100,total_minor:2400,payment_method:'cash',payment_status:'paid',cash_tendered_minor:3000,change_due_minor:600,occurred_at:'2026-10-12T00:00:00Z'};
  const entry=`import {renderCashierReceiptHtml} from './artifacts/fawri/src/lib/cashierReceiptPrinting.ts';
    const p=new URLSearchParams(location.search);const lang=p.get('lang');const width=Number(p.get('width'));
    const html=renderCashierReceiptHtml({sale:${JSON.stringify(sale)},lang,paperWidthMm:width,storeName:'Synthetic & Store',stationLabel:'Station <unsafe>',reprint:true});
    const render=()=>{document.open();document.write(html);document.close();globalThis.auditRendered=true;};
    if(document.readyState==='complete')render();else addEventListener('load',render,{once:true});`;
  const bundled=await build({stdin:{contents:entry,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',write:false,
    alias:{'@':resolve('artifacts/fawri/src')},nodePaths:[resolve('artifacts/fawri/node_modules')],define:{'process.env.NODE_ENV':'"production"'}});
  server=createServer((req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'unsafe-inline';connect-src 'none';img-src 'none';font-src 'none';object-src 'none'");
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(bundled.outputFiles[0].text);}
    else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>');}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=spawn(chromePath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
  browser.stderr.on('data',()=>{});browser.on('error',e=>{infrastructureError=e.message;});
  const port=await waitFor(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
  evidence.browser=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
  for(const lang of ['ar','en','ku'])for(const width of [58,80])await check(`actual receipt ${lang} ${width}mm`,async()=>{
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+`/?lang=${lang}&width=${width}`)}`,{method:'PUT'})).json();
    const cdp=await connect(target.webSocketDebuggerUrl);await cdp('Runtime.enable');
    await waitFor(()=>evaluate(cdp,'globalThis.auditRendered===true'));
    const cssWidth=width*96/25.4;await cdp('Emulation.setDeviceMetricsOverride',{width:Math.ceil(cssWidth),height:1200,deviceScaleFactor:1,mobile:false});
    await cdp('Emulation.setEmulatedMedia',{media:'print'});
    const shape=await evaluate(cdp,`({characterSet:document.characterSet,rows:document.querySelectorAll('tbody tr').length,
      width:document.body.getBoundingClientRect().width,scroll:document.body.scrollWidth,text:document.body.textContent,
      activeMarkup:document.querySelectorAll('img,script,iframe').length,activeElements:Array.from(document.querySelectorAll('img,script,iframe')).map(e=>({tag:e.tagName,src:e.getAttribute('src')})),injected:globalThis.injected===true,
      reprint:document.querySelector('.reprint')?.textContent,total:document.querySelector('.summary-row.total strong')?.textContent})`);
    assert.equal(shape.characterSet,'UTF-8');assert.equal(shape.rows,2);assert.ok(Math.abs(shape.width-cssWidth)<1);
    assert.ok(shape.scroll<=Math.ceil(cssWidth)+1,'receipt horizontal overflow');assert.equal(shape.activeMarkup,0,JSON.stringify(shape.activeElements));assert.equal(shape.injected,false);
    assert.ok(!shape.text.includes('PRIVATE_COST_SENTINEL'));assert.ok(shape.reprint?.trim().length>0);
    const digits=value=>String(value).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g,'');
    assert.equal(digits(shape.total),'2400');
    const pdf=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:false,paperWidth:width/25.4,paperHeight:300/25.4,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0});
    const bytes=Buffer.from(pdf.data,'base64');const read=spawnSync('pdftotext',['-layout','-','-'],{input:bytes,encoding:'utf8',timeout:15000});
    assert.equal(read.status,0,read.stderr);const pages=read.stdout.split('\f').filter(p=>p.trim());
    assert.ok(pages.length>=1&&pages.length<=2);assert.ok(read.stdout.includes('Last audit item'));assert.ok(read.stdout.includes('audit-receipt-001'));
    return {widthMm:width,pages:pages.length,bytes:bytes.length,totalMinor:2400,activeMarkup:0,costSentinelExposed:false,reprintMarker:true,
      limits:'Actual receipt HTML and Chrome PDF, synthetic sale/system fonts; not physical thermal printer, print-dialog/iframe cleanup or full POS workflow.'};
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
console.log('AUDIT_RECEIPT_PRINT_RESULT '+JSON.stringify(evidence));
if(infrastructureError||evidence.results.length!==6||evidence.results.some(r=>r.status!=='PASS'))process.exitCode=1;
