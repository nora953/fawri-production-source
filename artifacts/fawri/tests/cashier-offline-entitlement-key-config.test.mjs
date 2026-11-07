import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertCashierOfflinePublicKeyConfig } from '../build/cashierOfflinePublicKeyConfig.mjs';

test('release key configuration permits public-only rotation overlap and empty online-only build', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ format: 'jwk' });
  const ring = { current: pub, next: pub };
  assert.deepEqual(assertCashierOfflinePublicKeyConfig(JSON.stringify(ring)), ring);
  assert.deepEqual(assertCashierOfflinePublicKeyConfig(), {});
});

test('private signing material and unsupported key configuration fail before browser bundling without echoing values', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ format: 'jwk' });
  const priv = pair.privateKey.export({ format: 'jwk' });
  for (const key of [priv, { ...pub, key_ops: ['sign'] }, { ...pub, alg: 'none' }, { ...pub, crv: 'P-384' }]) {
    assert.throws(() => assertCashierOfflinePublicKeyConfig(JSON.stringify({ current: key })), error => {
      assert.equal(error.message.includes(priv.d), false);
      return /Invalid cashier offline public/.test(error.message);
    });
  }
  for (const text of ['null', '[]', 'malformed']) assert.throws(() => assertCashierOfflinePublicKeyConfig(text));
  const source = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(source, /assertCashierOfflinePublicKeyConfig\(publicEnv\.VITE_FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS\)/);
});
