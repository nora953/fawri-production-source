import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { issueCashierOfflineEntitlement } from '../artifacts/api-server/src/services/cashierOfflineEntitlementIssuer.ts';
import { setTimeout as delay } from 'node:timers/promises';

// Tests only. Bundle actual authority and its pure dependencies; fresh profile,
// loopback pages and synthetic IDs. No application server or provider imports.
const chromePath = process.env.FAWRI_AUDIT_CHROME;
assert.ok(chromePath, 'Set FAWRI_AUDIT_CHROME to an installed Chrome/Chromium binary; no browser proof may be skipped');
const requireApi = createRequire(resolve('artifacts/api-server/package.json'));
const { build } = requireApi('esbuild');
const profile = await mkdtemp(join(tmpdir(), 'fawri-offline-signed-'));
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
  const pairs = [0, 1].map(() => generateKeyPairSync('ec', { namedCurve: 'prime256v1' }));
  const ring = Object.fromEntries(pairs.map((p, i) => [`key-${i}`, p.publicKey.export({ format: 'jwk' })]));
  const issued = Date.now() - 1000;
  const snapshot = { merchant_id: 'signed-native-m', subscription_id: 'signed-native-sub', state: 'active',
    licensed_seats: 2, price_per_seat_iqd: 3900, version: 4,
    server_time: new Date(issued).toISOString(), billing_period_end: new Date(issued + 86400000).toISOString(),
    grace_until: new Date(issued + 8 * 86400000).toISOString() };
  const station = { merchant_id: snapshot.merchant_id, station_id: 'signed-native-s', device_id: 'signed-native-d',
    location_id: 'signed-native-branch', credential_id: 'cred', credential_version: 2,
    credential_expires_at: new Date(issued + 30 * 86400000).toISOString(), station_name: 'Main', branch_key: 'b',
    offline_inventory_authority: true };
  const env = i => ({ FAWRI_CASHIER_OFFLINE_KEY_ID: `key-${i}`,
    FAWRI_CASHIER_OFFLINE_PRIVATE_JWK: JSON.stringify(pairs[i].privateKey.export({ format: 'jwk' })),
    FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: JSON.stringify(ring) });
  const envelope = issueCashierOfflineEntitlement(snapshot, station, env(0));
  assert.ok(envelope);
  const persist = { snapshot, stationId: station.station_id, deviceId: station.device_id,
    locationId: station.location_id, credentialVersion: 2, envelope };
  const saleBinding = { merchantId: snapshot.merchant_id, stationId: station.station_id, deviceId: station.device_id,
    locationId: station.location_id, credentialVersion: 2 };
  const bundled = await build({ stdin: { contents: `export * from './artifacts/fawri/src/lib/cashierOfflineEntitlementAuthority.ts';
    export { IndexedDbCashierAuthority } from './artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts';`, resolveDir: process.cwd() },
    bundle: true, format: 'iife', globalName: 'FawriAudit', platform: 'browser', write: false,
    define: { 'import.meta.env': JSON.stringify({ VITE_FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: JSON.stringify(ring) }) } });
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(bundled.outputFiles[0].text));
  server = createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'none'; frame-src 'none'; object-src 'none'");
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundled.outputFiles[0].text); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script src="/bundle.js"></script>'); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  let launchError;
  browser.on('error', e => { launchError = e; }); browser.stderr.on('data', () => {});
  const port = await waitFor(async () => { if (launchError) throw launchError; return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); });
  evidence.browser = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
  async function tab() {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
    const cdp = await connect(target.webSocketDebuggerUrl); await cdp('Runtime.enable');
    await waitFor(() => evaluate(cdp, 'typeof FawriAudit !== "undefined"'));
    return cdp;
  }
  let a = await tab();
  const config = { localMerchantId: 'signed-native', cloudMerchantId: snapshot.merchant_id,
    deviceId: station.device_id, databaseName: 'fawri-signed-native-sales' };
  const init = cdp => evaluate(cdp, `globalThis.authority=new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(config)}); true`);
  const authorize = cdp => evaluate(cdp, `FawriAudit.assertCashierSaleEntitlementFromCache(${JSON.stringify(saleBinding)}).then(()=>({ok:true}),e=>({ok:false,code:e.code}))`);
  const persistCall = input => evaluate(a, `FawriAudit.persistCashierEntitlementAuthority(${JSON.stringify(input)}).then(()=>true)`);
  const mutate = expression => evaluate(a, `new Promise((ok,no)=>{const r=indexedDB.open('fawri-cashier-bootstrap-v1',1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const db=r.result;const t=db.transaction('identity','readwrite');const s=t.objectStore('identity');const q=s.get('cashier-entitlement-authority-v1');q.onsuccess=()=>{let row=q.result;${expression};s.put(row)};t.oncomplete=()=>{db.close();ok(true)};t.onabort=()=>{db.close();no(t.error)}}})`);
  await init(a);
  await check('real WebCrypto + IndexedDB signed main sale and complete outbox', async () => {
    await persistCall(persist); assert.equal((await authorize(a)).ok, true);
    await evaluate(a, `authority.upsertCatalogSnapshot([{product_id:'p',item_type:'product',name:'Synthetic',track_inventory:true,stock_quantity:1,currency_code:'IQD',currency_fraction_digits:0,base_unit_price_minor:1000,catalog_version:1}],{preserveLocalInventory:false}).then(()=>true)`);
    await evaluate(a, `FawriAudit.assertCashierSaleEntitlementFromCache(${JSON.stringify(saleBinding)}).then(()=>authority.commitSale({operation_id:'signed-sale',payment_method:'cash',payment_status:'paid',lines:[{product_id:'p',quantity:1}]})).then(()=>true)`);
    assert.equal(await evaluate(a, 'authority.getCatalogItem("p").then(x=>x.stock_quantity)'), 0);
    assert.equal((await evaluate(a, 'authority.listPendingSync()')).length, 2);
    return { stock: 0, sales: 1, outbox: 2 };
  });
  await check('new browser context restores signed authority and pending inventory operation', async () => {
    await evaluate(a, 'authority.close().then(()=>true)');
    await a('Page.close'); a = await tab(); await init(a);
    assert.equal((await authorize(a)).ok, true);
    assert.equal((await evaluate(a, 'authority.listPendingSync()')).length, 2);
    return { signedRestore: true, outbox: 2 };
  });
  await check('altered and legacy cache deny before additional sale', async () => {
    for (const change of ["row.grace_until='2030-01-01T00:00:00Z'", "row.version=999", 'delete row.envelope']) {
      await persistCall(persist); await mutate(change); assert.equal((await authorize(a)).ok, false);
      await evaluate(a, 'FawriAudit.clearCashierEntitlementAuthority().then(()=>true)');
    }
    assert.equal((await evaluate(a, 'authority.listSales()')).length, 1);
    await persistCall(persist);
    return { denied: 3, unchangedSales: 1 };
  });
  await check('station device branch and credential binding reject mismatches', async () => {
    for (const patch of [{ merchantId:'foreign' },{ stationId:'other' },{ deviceId:'other' },{ locationId:'other' },{ credentialVersion:3 }]) {
      const r=await evaluate(a, `FawriAudit.assertCashierSaleEntitlementFromCache(${JSON.stringify({...saleBinding,...patch})}).then(()=>true,()=>false)`);
      assert.equal(r,false);
    }
    return { denied: 5 };
  });
  await check('secondary cashier and unsigned migration cannot authorize offline', async () => {
    assert.equal(issueCashierOfflineEntitlement(snapshot,{...station,offline_inventory_authority:false},env(0)),null);
    await persistCall({...persist,envelope:null}); assert.equal((await authorize(a)).ok,false);
    await persistCall(persist); return { secondaryNotIssued:true, unsignedDenied:true };
  });
  await check('signed version rollback denied and rotation overlap accepted', async () => {
    const older={...snapshot,version:3};
    const old={...persist,snapshot:older,envelope:issueCashierOfflineEntitlement(older,station,env(0))};
    assert.equal(await evaluate(a,`FawriAudit.persistCashierEntitlementAuthority(${JSON.stringify(old)}).then(()=>true,()=>false)`),false);
    await persistCall({...persist,envelope:issueCashierOfflineEntitlement(snapshot,station,env(1))});
    assert.equal((await authorize(a)).ok,true);return { staleDenied:true, rotation:true };
  });
  await check('rollback and exact authorization expiry deny with native cached state', async () => {
    await evaluate(a,`globalThis.realNow=Date.now; Date.now=()=>${issued+3600000}; true`);
    assert.equal((await authorize(a)).ok,true);
    await evaluate(a,`Date.now=()=>${issued+3000000}; true`);
    assert.equal((await authorize(a)).ok,false);
    await evaluate(a,`Date.now=()=>${issued+7*86400000}; true`);
    assert.equal((await authorize(a)).ok,false);
    await evaluate(a,'Date.now=realNow; true');return { rollbackDenied:true, expiryDenied:true };
  });
  await check('reconnection acknowledgement drains outbox without changing local inventory or sale', async () => {
    const before=await evaluate(a,'authority.listPendingSync()');assert.equal(before.length,2);
    await evaluate(a,'authority.acknowledgeSynced(["signed-sale"]).then(()=>true)');
    assert.equal((await evaluate(a,'authority.listPendingSync()')).length,0);
    assert.equal((await evaluate(a,'authority.listSales()')).length,1);
    assert.equal(await evaluate(a,'authority.getCatalogItem("p").then(x=>x.stock_quantity)'),0);
    return { syntheticAck:true, outbox:0, stock:0, sales:1, serverSync:'NOT_EXECUTED' };
  });
} catch (e) { infrastructureError = e.message; }
finally {
  for (const ws of sockets) ws.close();
  if (browser && browser.exitCode === null) {
    const stopped = new Promise(ok => browser.once('exit', ok));
    try { process.kill(-browser.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    await Promise.race([stopped, delay(3000)]);
    try { process.kill(-browser.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    if (browser.exitCode === null) await stopped;
  }
  if (server) await new Promise((ok, no) => server.close(e => e ? no(e) : ok()));
  try { await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  catch (e) { infrastructureError = `Profile cleanup failed: ${e.code || e.name}`; }
}
if (infrastructureError) evidence.infrastructureError = infrastructureError;
console.log('P0_OFFLINE_SIGNED_NATIVE_RESULT ' + JSON.stringify(evidence));
if (infrastructureError || evidence.results.some(r => r.status !== 'PASS') || evidence.results.length !== 8) process.exitCode = 1;
