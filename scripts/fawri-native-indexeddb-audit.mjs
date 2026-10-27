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
async function evaluateStatements(cdp, statements) {
  return evaluate(cdp, '(async()=>{' + statements + '})()');
}
async function check(name, fn) {
  try { const details = await fn(); evidence.results.push({ name, status: 'PASS', details }); }
  catch (e) { evidence.results.push({ name, status: 'FAIL', error: e.message }); }
}
try {
  const bundled = await build({ stdin: { contents: "export { IndexedDbCashierAuthority } from './artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts'; export { IndexedDbCashierCompensationAuthority } from './artifacts/fawri/src/lib/cashierCompensationAuthority.ts';", resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'FawriAudit', platform: 'browser', write: false });
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
    const before = await evaluate(a, 'Promise.all([authority.listSales(),authority.listPendingSync(),authority.getCatalogItem("product")])');
    const original = sale(old.operation_id);
    const changes = [
      {lines:[{product_id:'product',quantity:2}]},
      {lines:[{product_id:'other',quantity:1}]},
      {lines:[{product_id:'product',variant_id:'other',quantity:1}]},
      {payment_method:'card'}, {payment_status:'pending'}, {note:'changed'},
      {payment_provider:'other'}, {payment_reference:'other'},
      {manual_discount_minor:1,manual_discount_kind:'amount',manual_discount_reason:'changed'},
      {cash_tendered_minor:1000,change_due_minor:0},
    ];
    for (const patch of changes) {
      const changed={...original,...patch};
      const r = await evaluate(a, `authority.commitSale(${JSON.stringify(changed)}).then(()=>({accepted:true}),e=>({accepted:false,code:e.code}))`);
      assert.equal(r.accepted, false, 'Changed operation payload accepted: ' + JSON.stringify(r));
      assert.equal(r.code,'CASHIER_SALE_OPERATION_ID_CONFLICT');
      assert.deepEqual(await evaluate(a, 'Promise.all([authority.listSales(),authority.listPendingSync(),authority.getCatalogItem("product")])'),before);
    }
    return {changedInputs:changes.length,rejected:true,unchanged:true};
  });
  await check('exact local replay survives exhausted stock ACK and page reopen without a second effect', async () => {
    const old = (await evaluate(a, 'authority.listSales()'))[0];
    const input=sale(old.operation_id);
    const before=await evaluate(a,'Promise.all([authority.listSales(),authority.listPendingSync(),authority.getCatalogItem("product")])');
    const replay=await evaluate(a,`authority.commitSale(${JSON.stringify(input)})`);
    assert.deepEqual(replay.sale,old);
    assert.deepEqual(await evaluate(a,'Promise.all([authority.listSales(),authority.listPendingSync(),authority.getCatalogItem("product")])'),before);
    await evaluate(a,`authority.acknowledgeSynced([${JSON.stringify(old.operation_id)}]).then(()=>true)`);
    await evaluate(a,'authority.close().then(()=>true)');
    await evaluate(a,`globalThis.authority=new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(config)});true`);
    const afterAck=await evaluate(a,`authority.commitSale(${JSON.stringify(input)})`);
    assert.deepEqual(afterAck.sale,old);assert.equal(afterAck.outbox.length,0);
    assert.equal(await evaluate(a,'authority.getCatalogItem("product").then(x=>x.stock_quantity)'),0);
    // Restore only the original fixture outbox for the existing versionchange
    // test. This is fixture setup, never a production repair path.
    await evaluateStatements(a,`const d=await new Promise((ok,no)=>{const r=indexedDB.open(${JSON.stringify(config.databaseName)});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
      try{const t=d.transaction('outbox','readwrite'),done=new Promise((ok,no)=>{t.oncomplete=ok;t.onabort=()=>no(t.error);t.onerror=()=>no(t.error)});
      for(const e of ${JSON.stringify(before[1])})t.objectStore('outbox').put({...e,outbox_id:'outbox:'+e.operation_id+':'+e.entity_type+':'+e.entity_id});await done;}finally{d.close()}`);
    return {exactReplay:true,afterAckAndReopen:true,stock:0,noReenqueue:true};
  });
  // SEQ-R3 prerequisite: real local stores, no server admission or transport.
  await evaluateStatements(a, `
    globalThis.recConfig=${JSON.stringify({...config,databaseName:config.databaseName+'-recovery'})};
    globalThis.rec=new FawriAudit.IndexedDbCashierAuthority(recConfig);
    globalThis.comp=new FawriAudit.IndexedDbCashierCompensationAuthority(recConfig);
    globalThis.idbReq=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
    globalThis.idbDone=t=>new Promise((ok,no)=>{t.oncomplete=ok;t.onabort=()=>no(t.error);t.onerror=()=>no(t.error)});
    globalThis.rawRecovery=async()=>{
      const d=await idbReq(indexedDB.open(recConfig.databaseName));
      try{const names=[...d.objectStoreNames].sort(),t=d.transaction(names,'readonly'),done=idbDone(t);
      const rows=await Promise.all(names.map(n=>idbReq(t.objectStore(n).getAll())));await done;
      return Object.fromEntries(names.map((n,i)=>[n,rows[i]]));}finally{d.close()}
    };
    globalThis.restoreRecovery=async rows=>{
      const d=await idbReq(indexedDB.open(recConfig.databaseName));
      try{const names=Object.keys(rows),t=d.transaction(names,'readwrite'),done=idbDone(t);
      for(const n of names){const s=t.objectStore(n);s.clear();for(const row of rows[n])s.put(row)}await done;}finally{d.close()}
    };
    await rec.upsertCatalogSnapshot([${JSON.stringify({...item,stock_quantity:20})}],{preserveLocalInventory:false});
    const first=await rec.commitSale(${JSON.stringify(sale('recovery-sale'))});
    await comp.returnSale({operation_id:'recovery-return',sale_id:first.sale.sale_id,lines:[{original_line_id:first.sale.lines[0].line_id,quantity:1}]});
    const second=await rec.commitSale(${JSON.stringify(sale('recovery-sale-2'))});
    await comp.voidSale({operation_id:'recovery-void',sale_id:second.sale.sale_id});
    globalThis.recOriginal=await rawRecovery();
    true
  `);
  await check('recovery snapshot groups real sale return and void in one readonly transaction', async () => {
    const before=await evaluate(a,'rawRecovery()');
    const r=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
    assert.equal(r.status,'INSPECTED');assert.equal(r.inspection_complete,true);
    assert.equal(r.local_counter,4);assert.equal(r.inspected_envelopes,8);
    assert.deepEqual(r.operations.map(x=>x.kind),['sale','return','sale','void']);
    assert.deepEqual(r.operations.map(x=>x.envelope_count),[2,2,2,2]);
    assert.equal(r.enrollment_authorized,false);assert.equal(r.server_history_verified,false);
    assert.deepEqual(await evaluate(a,'rawRecovery()'),before);
    return {counter:r.local_counter,operationGroups:r.operations.length,envelopes:r.inspected_envelopes,readOnly:true,serverProof:false};
  });
  await check('recovery partial primary and movement groups hold without repairing or ACKing', async () => {
    const results=[];
    for(const entity of ['sale','inventory_movement']){
      await evaluateStatements(a,`const changed=structuredClone(recOriginal);changed.outbox=changed.outbox.filter(e=>!(e.operation_id==='recovery-sale'&&e.entity_type===${JSON.stringify(entity)}));await restoreRecovery(changed);true`);
      try{
        const before=await evaluate(a,'rawRecovery()'),r=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
        assert.equal(r.status,'HOLD');assert.ok(r.reasons.includes(entity==='sale'?'UNSUPPORTED_OR_INCOMPLETE_OPERATION':'MOVEMENT_GROUP_INCOMPLETE'));
        assert.deepEqual(await evaluate(a,'rawRecovery()'),before);results.push(r.reasons);
      }finally{await evaluate(a,'restoreRecovery(recOriginal).then(()=>true)')}
    }
    return {partialGroups:results,unchanged:true};
  });
  await check('recovery bounded prefix and invalid bounds never appear complete', async () => {
    for(const maxRecords of [1,0,1001,1.5]){
      const r=await evaluateStatements(a,`return rec.inspectLocalRecoverySnapshot({maxRecords:${maxRecords}})`);
      assert.equal(r.status,'HOLD');assert.equal(r.inspection_complete,false);assert.equal(r.operations.length,0);
    }
    const exact=await evaluate(a,'rec.inspectLocalRecoverySnapshot({maxRecords:8})');
    assert.equal(exact.status,'INSPECTED');assert.equal(exact.operations.length,4);
    assert.deepEqual(await evaluate(a,'rawRecovery()'),await evaluate(a,'Promise.resolve(recOriginal)'));
    return {overflowAndInvalid:4,exactBound:8};
  });
  await check('recovery missing unsafe and nonnumeric counters hold without coercion', async () => {
    for(const mode of ['missing','unsafe','string','behind']){
      await evaluateStatements(a,`const rows=structuredClone(recOriginal);rows.meta=rows.meta.filter(r=>r.key!=='device_sequence');const mode=${JSON.stringify(mode)};if(mode!=='missing')rows.meta.push({key:'device_sequence',value:mode==='unsafe'?Number.MAX_SAFE_INTEGER+1:mode==='string'?'4':1});await restoreRecovery(rows);true`);
      try{
        const before=await evaluate(a,'rawRecovery()'),r=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
        assert.equal(r.status,'HOLD');assert.ok(r.reasons.includes(mode==='behind'?'ENVELOPE_IDENTITY_OR_SEQUENCE_INVALID':'LOCAL_COUNTER_MISSING_OR_INVALID'));
        assert.deepEqual(await evaluate(a,'rawRecovery()'),before);
      }finally{await evaluate(a,'restoreRecovery(recOriginal).then(()=>true)')}
    }
    return {counterFaults:4,noReset:true};
  });
  await check('recovery rejects foreign device and merchant database interpretation', async () => {
    for(const patch of [{deviceId:'foreign-device'},{localMerchantId:'foreign-merchant'}]){
      const r=await evaluateStatements(a,`const foreign=new FawriAudit.IndexedDbCashierAuthority({...recConfig,...${JSON.stringify(patch)}});try{return await foreign.inspectLocalRecoverySnapshot()}finally{await foreign.close()}`);
      assert.equal(r.status,'HOLD');assert.equal(r.enrollment_authorized,false);
    }
    assert.deepEqual(await evaluate(a,'rawRecovery()'),await evaluate(a,'Promise.resolve(recOriginal)'));
    return {foreignInterpretations:2,originalPreserved:true};
  });
  await check('recovery retains movement-only stock operation as unsupported', async () => {
    await evaluate(a,"rec.adjustInventory({operation_id:'recovery-adjust',product_id:'product',delta:2,reason:'manual_adjustment'}).then(()=>true)");
    try{
      const before=await evaluate(a,'rawRecovery()'),r=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
      assert.equal(r.status,'HOLD');assert.ok(r.reasons.includes('UNSUPPORTED_OR_INCOMPLETE_OPERATION'));
      assert.equal(r.local_counter,5);assert.ok(r.operations.some(x=>x.operation_id==='recovery-adjust'&&x.kind==='unsupported'));
      assert.deepEqual(await evaluate(a,'rawRecovery()'),before);
    }finally{await evaluate(a,'restoreRecovery(recOriginal).then(()=>true)')}
    return {nonzeroAdjustmentRetained:true,noTombstone:true};
  });
  await check('recovery sequence collision and changed movement preserve original evidence', async () => {
    for(const mode of ['sequence','movement']){
      await evaluateStatements(a,`const rows=structuredClone(recOriginal);if(${JSON.stringify(mode)}==='sequence'){for(const e of rows.outbox)if(e.operation_id==='recovery-sale-2')e.device_sequence=1}else{rows.outbox.find(e=>e.entity_type==='inventory_movement').payload.delta=999}await restoreRecovery(rows);true`);
      try{
        const before=await evaluate(a,'rawRecovery()'),r=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
        assert.equal(r.status,'HOLD');assert.ok(r.reasons.includes(mode==='sequence'?'SEQUENCE_IDENTITY_CONFLICT':'MOVEMENT_RECORD_MISMATCH'));
        assert.deepEqual(await evaluate(a,'rawRecovery()'),before);
      }finally{await evaluate(a,'restoreRecovery(recOriginal).then(()=>true)')}
    }
    return {conflicts:2,unchanged:true};
  });
  await check('recovery native transaction abort cannot return a successful prefix', async () => {
    const before=await evaluate(a,'rawRecovery()');
    const r=await evaluateStatements(a,`const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);queueMicrotask(()=>tx.abort());return tx};try{return await rec.inspectLocalRecoverySnapshot()}finally{IDBDatabase.prototype.transaction=original}`);
    assert.equal(r.status,'HOLD');assert.equal(r.inspection_complete,false);
    assert.ok(r.reasons.includes('LOCAL_RECOVERY_READ_FAILED'));assert.equal(r.operations.length,0);
    assert.deepEqual(await evaluate(a,'rawRecovery()'),before);
    return {nativeAbort:true,noPartialSuccess:true};
  });
  await check('recovery snapshot and overlapping writer cannot mix counter and queue', async () => {
    const r=await evaluateStatements(a,`const writer=new FawriAudit.IndexedDbCashierAuthority(recConfig);try{const [snapshot]=await Promise.all([rec.inspectLocalRecoverySnapshot(),writer.commitSale(${JSON.stringify(sale('recovery-overlap'))})]);return snapshot}finally{await writer.close()}`);
    assert.equal(r.status,'INSPECTED');
    assert.ok((r.local_counter===4&&r.operations.length===4)||(r.local_counter===5&&r.operations.length===5));
    const after=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
    assert.equal(after.local_counter,5);assert.equal(after.operations.length,5);
    await evaluate(a,'restoreRecovery(recOriginal).then(()=>true)');
    return {counter:r.local_counter,groups:r.operations.length,coherent:true};
  });
  await check('recovery actual page reload preserves inspection and closed handle holds', async () => {
    const before=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
    const recoveryConfig=await evaluate(a,'Promise.resolve(recConfig)');
    await evaluate(a,'Promise.all([authority.close(),rec.close(),comp.close()]).then(()=>true)');
    await a('Page.reload',{ignoreCache:true});
    await waitFor(()=>evaluate(a,'typeof FawriAudit!=="undefined"'));
    await evaluateStatements(a,`globalThis.rec=new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(recoveryConfig)});globalThis.authority=new FawriAudit.IndexedDbCashierAuthority(${JSON.stringify(config)});true`);
    assert.deepEqual(await evaluate(a,'rec.inspectLocalRecoverySnapshot()'),before);
    await evaluate(a,'rec.close().then(()=>true)');
    const closed=await evaluate(a,'rec.inspectLocalRecoverySnapshot()');
    assert.equal(closed.status,'HOLD');assert.equal(closed.inspection_complete,false);
    assert.ok(closed.reasons.includes('LOCAL_RECOVERY_READ_FAILED'));
    return {actualPageReload:true,closedHandleHeld:true};
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
if (infrastructureError || evidence.results.some(r => r.status !== 'PASS') || evidence.results.length !== 15) process.exitCode = 1;
