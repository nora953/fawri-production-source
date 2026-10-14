import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Tests only. Bundle actual authority and its pure dependencies; fresh profile,
// loopback pages and synthetic IDs. No application server or provider imports.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-native-idb-'));
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
  const bundled = await build({ stdin: { contents: "export { IndexedDbCashierAuthority } from './artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts';", resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'FawriAudit', platform: 'browser', write: false });
  // Refuse an unexpected bundled HTTP dependency before launching any page.
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(bundled.outputFiles[0].text), 'Authority bundle unexpectedly includes network I/O');
  server = createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'none'; frame-src 'none'; object-src 'none'");
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundled.outputFiles[0].text); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script src="/bundle.js"></script>'); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError;
  browser.on('error', e => { launchError = e; });
  browser.stderr.on('data', () => {});
  const port = await waitFor(async () => { if (launchError) throw launchError; return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); });
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  evidence.browser = version.Browser;
  async function tab() {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp('Runtime.enable');
    await waitFor(() => evaluate(cdp, 'typeof FawriAudit !== "undefined"'));
    return cdp;
  }
  const a = await tab(), b = await tab();
  const config = { localMerchantId: 'synthetic-native', deviceId: 'synthetic-device', databaseName: `fawri-audit-${Date.now()}` };
  const item = { product_id: 'product', item_type: 'product', name: 'Synthetic', track_inventory: true, stock_quantity: 1, currency_code: 'IQD', currency_fraction_digits: 0, base_unit_price_minor: 1000, catalog_version: 1 };
  const sale = id => ({ operation_id: id, payment_method: 'cash', payment_status: 'paid', lines: [{ product_id: 'product', quantity: 1 }] });
  for (const cdp of [a, b]) await evaluate(cdp, `globalThis.authority=new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(config)}); true`);
  await evaluate(a, `authority.upsertCatalogSnapshot([${JSON.stringify(item)}], {preserveLocalInventory:false}).then(()=>true)`);
  await check('two tabs race for final stock: exactly one complete operation', async () => {
    const attempts = await Promise.all([a, b].map((cdp, i) => evaluate(cdp, `authority.commitSale(${JSON.stringify(sale('race-' + i))}).then(r=>({ok:true,sale:r.sale}),e=>({ok:false,code:e.code,name:e.name}))`)));
    assert.equal(attempts.filter(r => r.ok).length, 1, JSON.stringify(attempts));
    const remaining = await evaluate(a, 'authority.getCatalogItem("product").then(x=>x.stock_quantity)');
    assert.equal(remaining, 0);
    const pending = await evaluate(a, 'authority.listPendingSync()');
    assert.equal(new Set(pending.map(e => e.operation_id)).size, 1);
    assert.equal(pending.length, 2); // sale + one inventory movement
    const sales = await evaluate(a, 'authority.listSales()');
    assert.equal(sales.length, 1);
    return { attempts: attempts.map(r => ({ ok: r.ok, code: r.code })), stock: remaining, pending: pending.length };
  });
  await check('close and reopen retains unacknowledged operation', async () => {
    const before = await evaluate(a, 'authority.listPendingSync()');
    await evaluate(a, 'authority.close().then(()=>true)');
    await evaluate(a, `globalThis.authority=new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(config)}); true`);
    const after = await evaluate(a, 'authority.listPendingSync()');
    assert.deepEqual(after, before);
    return { pending: after.length };
  });
  await check('same operation ID with changed valid quantity must reject', async () => {
    const old = (await evaluate(a, 'authority.listSales()'))[0];
    assert.ok(old);
    const changed = sale(old.operation_id); changed.lines[0].quantity = 2;
    const r = await evaluate(a, `authority.commitSale(${JSON.stringify(changed)}).then(r=>({accepted:true,quantity:r.sale.lines[0].quantity,duplicate:r.duplicate}),e=>({accepted:false,code:e.code}))`);
    assert.equal(r.accepted, false, 'Changed operation payload accepted: ' + JSON.stringify(r));
    return r;
  });
  await check('versionchange closes both old handles; pending data survives upgrade', async () => {
    const before = await evaluate(a, 'authority.listPendingSync()');
    const upgraded = await evaluate(b, `new Promise((ok,no)=>{const r=indexedDB.open(${JSON.stringify(config.databaseName)},3);r.onsuccess=()=>{globalThis.upgraded=r.result;ok(r.result.version)};r.onerror=()=>no(r.error);r.onblocked=()=>no(Error('upgrade blocked'))})`);
    assert.equal(upgraded, 3);
    const r = await evaluate(a, 'authority.listPendingSync().then(()=>({closed:false}),e=>({closed:true,name:e.name}))');
    assert.equal(r.closed, true);
    const saved = await evaluate(b, `new Promise((ok,no)=>{const t=upgraded.transaction('outbox','readonly');const r=t.objectStore('outbox').getAll();r.onsuccess=()=>ok(r.result.map(({outbox_id,...e})=>e));r.onerror=()=>no(r.error)})`);
    assert.equal(saved.length, before.length);
    await evaluate(b, 'upgraded.close(); true');
    // An old version2 application must not silently downgrade schema3. Record
    // this separate compatibility outcome rather than treating it as auto-recovery.
    const reopen = await evaluate(a, `new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(config)}).listPendingSync().then(()=>({opened:true}),e=>({opened:false,name:e.name}))`);
    assert.equal(reopen.opened, false); assert.equal(reopen.name, 'VersionError');
    return { oldHandleError: r.name, oldVersionReopen: reopen.name, pending: saved.length };
  });
} catch (e) { infrastructureError = e.message; }
finally {
  for (const ws of sockets) ws.close();
  if (browser && browser.exitCode === null) {
    const stopped = new Promise(ok => browser.once('exit', ok));
    browser.kill('SIGTERM');
    await Promise.race([stopped, delay(3000)]);
    if (browser.exitCode === null) { browser.kill('SIGKILL'); await stopped; }
  }
  if (server) await new Promise((ok, no) => server.close(e => e ? no(e) : ok()));
  await rm(profile, { recursive: true, force: true });
}
if (infrastructureError) evidence.infrastructureError = infrastructureError;
console.log('AUDIT_NATIVE_INDEXEDDB_RESULT ' + JSON.stringify(evidence));
if (infrastructureError || evidence.results.some(r => r.status !== 'PASS') || evidence.results.length !== 4) process.exitCode = 1;
