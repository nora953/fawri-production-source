import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { issueCashierOfflineEntitlement } from '../../api-server/src/services/cashierOfflineEntitlementIssuer.ts';
import { verifyOfflineEntitlementEnvelope } from '../src/lib/cashierOfflineEntitlementSignature.mjs';

export function issuerFixture() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = pair.publicKey.export({ format: 'jwk' });
  const privateKey = pair.privateKey.export({ format: 'jwk' });
  const env = {
    FAWRI_CASHIER_OFFLINE_KEY_ID: 'current',
    FAWRI_CASHIER_OFFLINE_PRIVATE_JWK: JSON.stringify(privateKey),
    FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: JSON.stringify({ current: publicKey }),
  };
  const snapshot = { merchant_id: 'm', subscription_id: 'sub', state: 'active', licensed_seats: 2,
    price_per_seat_iqd: 3900, version: 4, server_time: '2026-10-24T00:00:00.000Z',
    billing_period_end: '2026-10-25T00:00:00.000Z', grace_until: '2026-11-01T00:00:00.000Z' };
  const station = { merchant_id: 'm', station_id: 's', device_id: 'd', location_id: 'branch-1',
    credential_id: 'cred', credential_version: 3, credential_expires_at: '2027-01-01T00:00:00.000Z',
    station_name: 'main', branch_key: 'b1', offline_inventory_authority: true };
  return { env, snapshot, station, keys: { current: publicKey } };
}

test('actual server ES256 issuance interoperates with browser verifier and binds branch/device', async () => {
  const { env, snapshot, station, keys } = issuerFixture();
  const envelope = issueCashierOfflineEntitlement(snapshot, station, env);
  assert.ok(envelope);
  const claims = await verifyOfflineEntitlementEnvelope(envelope, keys);
  assert.equal(claims.device_id, station.device_id);
  assert.equal(claims.location_id, station.location_id);
  assert.equal(claims.credential_version, 3);
  assert.equal(claims.version, 4);
  assert.equal(claims.expires_at, '2026-10-31T00:00:00.000Z');
  assert.equal(JSON.stringify(envelope).includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(envelope).sort(), ['algorithm', 'key_id', 'payload', 'signature']);
});

test('secondary stations, identity mismatch, restricted subscription and bad lifecycles never receive offline authority', () => {
  const { env, snapshot, station } = issuerFixture();
  for (const other of [{ ...station, offline_inventory_authority: false }, { ...station, merchant_id: 'foreign' },
    { ...station, location_id: '' }, { ...station, credential_expires_at: snapshot.server_time }]) {
    assert.equal(issueCashierOfflineEntitlement(snapshot, other, env), null);
  }
  for (const patch of [{ state: 'restricted' }, { version: 0 }, { grace_until: snapshot.billing_period_end }]) {
    assert.equal(issueCashierOfflineEntitlement({ ...snapshot, ...patch }, station, env), null);
  }
});

test('missing/broken signing config fails closed for offline without throwing into online authentication', () => {
  const { env, snapshot, station } = issuerFixture();
  for (const patch of [{}, { ...env, FAWRI_CASHIER_OFFLINE_PRIVATE_JWK: 'broken' },
    { ...env, FAWRI_CASHIER_OFFLINE_KEY_ID: 'unknown' },
    { ...env, FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: JSON.stringify({ current: JSON.parse(env.FAWRI_CASHIER_OFFLINE_PRIVATE_JWK) }) }]) {
    assert.equal(issueCashierOfflineEntitlement(snapshot, station, patch), null);
  }
  assert.equal(issueCashierOfflineEntitlement(snapshot, station, issuerFixture().env)?.algorithm, 'ES256');
  assert.equal(issueCashierOfflineEntitlement(snapshot, station, { ...env,
    FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS: issuerFixture().env.FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS }), null);
});

test('issuance cannot exceed credential expiry or seven-day billing grace', async () => {
  const { env, snapshot, station, keys } = issuerFixture();
  const envelope = issueCashierOfflineEntitlement({ ...snapshot, grace_until: '2030-01-01T00:00:00Z',
    server_time: '2026-10-30T00:00:00Z' }, { ...station, credential_expires_at: '2026-10-31T01:00:00Z' }, env);
  const claims = await verifyOfflineEntitlementEnvelope(envelope, keys);
  assert.equal(claims.expires_at, '2026-10-31T01:00:00.000Z');
});
