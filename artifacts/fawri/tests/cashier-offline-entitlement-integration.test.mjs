import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { issueCashierOfflineEntitlement } from '../../api-server/src/services/cashierOfflineEntitlementIssuer.ts';
import { verifyCashierOfflineAuthorization } from '../src/lib/cashierOfflineEntitlementSignature.mjs';

// Actual production crypto + persistence/authorization functions, synthetic IDB
// adapter. This suite is not native-browser/transaction scheduling certification.
function fixture() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ format: 'jwk' });
  const env = { FAWRI_CASHIER_OFFLINE_KEY_ID: 'current',
    FAWRI_CASHIER_OFFLINE_PRIVATE_JWK: JSON.stringify(pair.privateKey.export({ format: 'jwk' })),
    FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: JSON.stringify({ current: pub }) };
  const snapshot = { merchant_id: 'm', subscription_id: 'sub', state: 'active', licensed_seats: 2,
    price_per_seat_iqd: 3900, version: 4, server_time: '2026-10-24T00:00:00.000Z',
    billing_period_end: '2026-10-25T00:00:00.000Z', grace_until: '2026-11-01T00:00:00.000Z' };
  const station = { merchant_id: 'm', station_id: 's', device_id: 'd', location_id: 'branch-1',
    credential_id: 'cred', credential_version: 3, credential_expires_at: '2027-01-01T00:00:00.000Z',
    station_name: 'main', branch_key: 'b1', offline_inventory_authority: true };
  const binding = { merchant_id: 'm', station_id: 's', device_id: 'd', location_id: 'branch-1', credential_version: 3 };
  const envelope = issueCashierOfflineEntitlement(snapshot, station, env);
  return { snapshot, station, env, envelope, binding, keys: { current: pub },
    input: { snapshot, stationId: 's', deviceId: 'd', locationId: 'branch-1', credentialVersion: 3, envelope },
    sale: { merchantId: 'm', stationId: 's', deviceId: 'd', locationId: 'branch-1', credentialVersion: 3 } };
}

let moduleNumber = 0;
async function loadAuthority(keys, records) {
  const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/cashierOfflineEntitlementAuthority.ts', import.meta.url), 'utf8'))
    .replace("from './cashierOfflineEntitlementSignature.mjs'", `from '${new URL('../src/lib/cashierOfflineEntitlementSignature.mjs', import.meta.url).href}'`)
    .replace(/import \{ cashierOfflineTrustedKeys \} from '[^']+';/, 'const cashierOfflineTrustedKeys = () => globalThis.__offlineTestKeys;');
  globalThis.__offlineTestKeys = keys;
  globalThis.indexedDB = {
    open() {
      const req = {};
      const db = { objectStoreNames: { contains: () => true }, close() {},
        transaction() {
          const tx = { abort() { setImmediate(() => tx.onabort?.()); },
            objectStore() { return {
              get(id) { const r = {}; setImmediate(() => { r.result = structuredClone(records.get(id)); r.onsuccess?.(); }); return r; },
              put(row) { records.set(row.id, structuredClone(row)); setImmediate(() => tx.oncomplete?.()); },
              delete(id) { records.delete(id); setImmediate(() => tx.oncomplete?.()); },
            }; } };
          return tx;
        } };
      setImmediate(() => { req.result = db; req.onsuccess?.(); });
      return req;
    },
  };
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${moduleNumber++}`);
}

const id = 'cashier-entitlement-authority-v1';

test('full signed cache boundary: persist, restore, sale, mutation denials, stale versions and clock rollback', async () => {
  const f = fixture(), records = new Map();
  const originalNow = Date.now;
  let now = Date.parse(f.snapshot.server_time);
  Date.now = () => now;
  try {
    let api = await loadAuthority(f.keys, records);
    await api.persistCashierEntitlementAuthority(f.input);
    assert.equal((await api.assertCashierSaleEntitlementFromCache(f.sale)).subscription_id, 'sub');
    api = await loadAuthority(f.keys, records); // cold module / persistent cache
    assert.equal((await api.assertCashierSaleEntitlementFromCache(f.sale)).location_id, 'branch-1');
    for (const patch of [{ merchantId: 'foreign' }, { stationId: 'other' }, { deviceId: 'other' },
      { locationId: 'branch-2' }, { credentialVersion: 4 }]) {
      await assert.rejects(api.assertCashierSaleEntitlementFromCache({ ...f.sale, ...patch }));
    }
    const pristine = structuredClone(records.get(id));
    for (const patch of [{ grace_until: '2030-01-01T00:00:00Z' }, { version: 999 },
      { device_id: 'forged' }, { envelope: undefined }, { envelope: { ...f.envelope, signature: 'invalid' } }]) {
      records.set(id, { ...pristine, ...patch });
      await assert.rejects(api.assertCashierSaleEntitlementFromCache(f.sale));
    }
    records.set(id, pristine);
    const oldSnapshot = { ...f.snapshot, version: 3 };
    await assert.rejects(api.persistCashierEntitlementAuthority({ ...f.input, snapshot: oldSnapshot,
      envelope: issueCashierOfflineEntitlement(oldSnapshot, f.station, f.env) }), { code: 'CASHIER_ENTITLEMENT_STALE_SNAPSHOT' });
    now += 3600000;
    await api.assertCashierSaleEntitlementFromCache(f.sale);
    now -= 300000;
    await assert.rejects(api.assertCashierSaleEntitlementFromCache(f.sale), { code: 'CASHIER_DEVICE_CLOCK_ROLLBACK' });
    now = Date.parse('2026-10-31T00:00:00Z');
    await assert.rejects(api.assertCashierSaleEntitlementFromCache(f.sale));
    await api.persistCashierEntitlementAuthority({ ...f.input, envelope: null });
    assert.equal(records.size, 0); // unsigned migration requires online refresh
    records.set(id, { ...pristine, envelope: undefined });
    await assert.rejects(api.assertCashierSaleEntitlementFromCache(f.sale));
  } finally {
    Date.now = originalNow;
    delete globalThis.indexedDB;
    delete globalThis.__offlineTestKeys;
  }
});

test('full authorization rejects missing/secondary/unknown-key claims and supports explicit rotation overlap', async () => {
  const f = fixture(), next = fixture();
  const now = Date.parse(f.snapshot.server_time);
  await verifyCashierOfflineAuthorization(f.envelope, f.keys, f.binding, now);
  await assert.rejects(verifyCashierOfflineAuthorization(null, f.keys, f.binding, now));
  await assert.rejects(verifyCashierOfflineAuthorization(f.envelope, {}, f.binding, now));
  const rotatedEnv = { ...next.env, FAWRI_CASHIER_OFFLINE_KEY_ID: 'next',
    FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: JSON.stringify({ current: f.keys.current, next: next.keys.current }) };
  const rotated = issueCashierOfflineEntitlement(f.snapshot, f.station, rotatedEnv);
  const overlap = { current: f.keys.current, next: next.keys.current };
  await verifyCashierOfflineAuthorization(f.envelope, overlap, f.binding, now);
  await verifyCashierOfflineAuthorization(rotated, overlap, f.binding, now);
  await assert.rejects(verifyCashierOfflineAuthorization(f.envelope, { next: next.keys.current }, f.binding, now));
  assert.equal(issueCashierOfflineEntitlement(f.snapshot, { ...f.station, offline_inventory_authority: false }, f.env), null);
});

test('actual sale authorization preserves online sales without signing config and permits only signed network fallback', async () => {
  const text = stripTypeScriptTypes(await readFile(new URL('../src/lib/cashierOperatorSessionRuntime.ts', import.meta.url), 'utf8'));
  const start = text.indexOf('export async function assertCashierOperatorSaleAuthorization(');
  const stop = text.indexOf('export function cashierOperatorCan(', start);
  const body = text.slice(start, stop).replace('export async function assertCashierOperatorSaleAuthorization', 'async function authorize');
  const session = { operator_token: 'token', context: { operator_session_id: 'sid', permissions: ['sale.create'] } };
  const errorClass = class extends Error { constructor(code, message) { super(message); this.code = code; } };
  let fallbackCount = 0;
  const build = (online, offline) => new Function('validateCashierOperatorSession', 'assertSignedCashierOfflineSession',
    'CashierOperatorSessionClientError', `${body}; return authorize;`)(online, offline, errorClass);
  await build(async options => { assert.equal(options.requireOnline, true); return session; },
    async () => { throw Error('No offline config'); })(session);
  await build(async () => { throw new TypeError('network unavailable'); }, async () => { fallbackCount++; })(session);
  assert.equal(fallbackCount, 1);
  await assert.rejects(build(async () => { throw new TypeError('network unavailable'); },
    async () => { throw Error('Unsigned cache'); })(session), /Unsigned cache/);
  await assert.rejects(build(async () => { throw new errorClass('HTTP_403', 'denied'); },
    async () => { throw Error('Must never fallback'); })(session), /denied/);
  await assert.rejects(build(async () => null, async () => { throw Error('Must never fallback'); })(session),
    { code: 'CASHIER_OPERATOR_LOGIN_REQUIRED' });
  await assert.rejects(build(async () => ({ ...session, context: { ...session.context, permissions: [] } }),
    async () => { throw Error('Must never fallback'); })(session));
});
