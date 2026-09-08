import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier treats transient gateway responses as connectivity loss, not an operator failure', async () => {
  const connectivity = await source('lib/cashierConnectivity.ts');

  assert.match(connectivity, /TRANSIENT_GATEWAY_STATUSES = new Set\(\[502, 503, 504\]\)/);
  assert.match(connectivity, /isTransientCashierGatewayResponse/);
  assert.match(connectivity, /markCashierNetworkFailure\(\)/);
  assert.match(connectivity, /throw new TypeError\(/);

  const transientCheck = connectivity.indexOf('isTransientCashierGatewayResponse(cashierRequest, response)');
  const onlineMark = connectivity.indexOf('if (cashierRequest) markCashierNetworkResponse()', transientCheck);
  assert.ok(transientCheck >= 0, 'cashier gateway response must be classified');
  assert.ok(onlineMark > transientCheck, 'transient gateway failure must resolve before marking cashier online');
});

test('operator session validation falls back locally only for network failures and still fails closed on 401', async () => {
  const session = await source('lib/cashierOperatorSessionRuntime.ts');

  assert.match(session, /catch \(cause\) \{/);
  assert.match(session, /if \(!\(cause instanceof TypeError\)\) throw cause/);
  assert.match(session, /const fallback = await getCashierOperatorSession\(\)/);
  assert.match(session, /fallback\.operator_token === session\.operator_token/);
  assert.match(session, /fallback\.context\.operator_session_id === session\.context\.operator_session_id/);
  assert.match(session, /response\.status === 401/);
  assert.match(session, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY\)/);
});

test('successful policy refresh updates offline inventory authority in both station identity and operator session', async () => {
  const policy = await source('lib/cashierOperatorPolicyRefresh.ts');

  assert.match(policy, /offline_inventory_authority:\s*operator\.offline_inventory_authority === true/);
  assert.match(policy, /offline_inventory_authority:\s*context\.offline_inventory_authority/);
  assert.match(policy, /writeCashierDeviceIdentity\(nextIdentity\)/);
  assert.match(policy, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY, JSON\.stringify\(refreshedSession\)\)/);
});
