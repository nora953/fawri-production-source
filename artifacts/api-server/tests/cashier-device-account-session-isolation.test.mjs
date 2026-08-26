import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cutover = await readFile(
  new URL('../src/middleware/authCutoverCompatibility.ts', import.meta.url),
  'utf8',
);
const cashierRoutes = await readFile(
  new URL('../src/routes/cashier-staff-operations.ts', import.meta.url),
  'utf8',
);

test('cashier station and operator device routes discard unrelated account sessions per request', () => {
  assert.match(cutover, /function isCashierDeviceAuthorityPath/);
  assert.match(cutover, /path === "\/api\/cashier\/station\/pair"/);
  assert.match(cutover, /path\.startsWith\("\/api\/cashier\/station\/"\)/);
  assert.match(cutover, /path\.startsWith\("\/api\/cashier\/operator\/"\)/);
  assert.match(cutover, /delete req\.cookies\[MERCHANT_SESSION_COOKIE\]/);
  assert.match(cutover, /delete req\.cookies\[ADMIN_SESSION_COOKIE\]/);
  assert.match(cutover, /isolateCashierDeviceAuthority\(req, path\)/);
});

test('merchant cashier management routes are not included in device-session isolation', () => {
  const isolationFunction = cutover.slice(
    cutover.indexOf('function isCashierDeviceAuthorityPath'),
    cutover.indexOf('/**\n * Cashier station/operator authentication'),
  );
  assert.doesNotMatch(isolationFunction, /cashier\/management/);
  assert.match(cashierRoutes, /"\/cashier\/management\/staff"[\s\S]{0,120}requireMerchantAuthority/);
  assert.match(cashierRoutes, /"\/cashier\/management\/stations"[\s\S]{0,120}requireMerchantAuthority/);
});

test('pairing remains code plus device authority and does not require merchant session', () => {
  assert.match(
    cashierRoutes,
    /"\/cashier\/station\/pair"[\s\S]{0,300}redeemCashierStationPairingAuthoritative/,
  );
  const pairSection = cashierRoutes.slice(
    cashierRoutes.indexOf('"/cashier/station/pair"'),
    cashierRoutes.indexOf('"/cashier/station/me"'),
  );
  assert.doesNotMatch(pairSection, /requireMerchantAuthority/);
  assert.doesNotMatch(pairSection, /requireSecureMerchantSession/);
});
