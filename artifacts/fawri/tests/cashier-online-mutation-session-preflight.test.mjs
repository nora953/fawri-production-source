import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier mutation session preflight validates online and preserves offline authority', async () => {
  const runtime = await source('src/lib/cashierOperatorSessionRuntime.ts');

  assert.match(runtime, /export async function getCashierOperatorSessionForMutation/);

  const start = runtime.indexOf('export async function getCashierOperatorSessionForMutation');
  const end = runtime.indexOf('\n}', start);
  const implementation = runtime.slice(start, end + 2);

  assert.ok(start >= 0, 'mutation preflight helper must exist');
  assert.match(implementation, /getCashierOperatorSession\(\)/);
  assert.match(implementation, /navigator\.onLine === false/);
  assert.match(implementation, /return session/);
  assert.match(implementation, /validateCashierOperatorSession\(\)/);
});

test('server rejection during explicit validation invalidates and notifies the cashier gate', async () => {
  const runtime = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const validateStart = runtime.indexOf('export async function validateCashierOperatorSession');
  const validateEnd = runtime.indexOf('\n}', validateStart);
  const implementation = runtime.slice(validateStart, validateEnd + 2);

  assert.match(implementation, /response\.status === 401/);
  assert.match(implementation, /invalidateCashierOperatorSession\(\)/);
  assert.match(implementation, /fawri:cashier-operator-session-invalidated/);
});

test('online sale preflights the current operator before binding or local commit', async () => {
  const runtime = await source('src/lib/cashierOperatorPosRuntime.ts');

  assert.match(runtime, /getCashierOperatorSessionForMutation/);

  const commitStart = runtime.indexOf('async commitSale(input)');
  const preflight = runtime.indexOf('getCashierOperatorSessionForMutation()', commitStart);
  const permission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.create')", preflight);
  const binding = runtime.indexOf("bindCashierOperationToCurrentOperator(input.operation_id, 'sale')", preflight);
  const localCommit = runtime.indexOf('base.commitSale(input)', preflight);

  assert.ok(commitStart >= 0, 'operator sale commit wrapper must exist');
  assert.ok(preflight > commitStart, 'sale must preflight the current session');
  assert.ok(permission > preflight, 'sale.create must be rechecked on the current session');
  assert.ok(binding > permission, 'operation binding must happen after current permission verification');
  assert.ok(localCommit > binding, 'local sale commit must happen after session preflight and binding');
});

test('return and void preflight the current operator before local compensation', async () => {
  const runtime = await source('src/lib/cashierOperatorHistoryRuntime.ts');

  assert.match(runtime, /getCashierOperatorSessionForMutation/);

  const returnStart = runtime.indexOf('async returnSale(input: CashierReturnSaleInput)');
  const returnPreflight = runtime.indexOf('getCashierOperatorSessionForMutation()', returnStart);
  const returnPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.return')", returnPreflight);
  const returnScope = runtime.indexOf('visibleSaleOrThrow(base, currentSession, input.sale_id)', returnPreflight);
  const returnBinding = runtime.indexOf("bindCashierOperationToCurrentOperator(input.operation_id, 'return')", returnPreflight);
  const returnCommit = runtime.indexOf('base.returnSale(input)', returnPreflight);

  assert.ok(returnPreflight > returnStart, 'return must preflight the current session');
  assert.ok(returnPermission > returnPreflight, 'return permission must use the current session');
  assert.ok(returnScope > returnPermission, 'return scope must use the current session');
  assert.ok(returnBinding > returnScope, 'return binding must follow current scope verification');
  assert.ok(returnCommit > returnBinding, 'local return must happen after current session checks');

  const voidStart = runtime.indexOf('async voidSale(input: CashierVoidSaleInput)');
  const voidPreflight = runtime.indexOf('getCashierOperatorSessionForMutation()', voidStart);
  const voidPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.void')", voidPreflight);
  const voidScope = runtime.indexOf('visibleSaleOrThrow(base, currentSession, input.sale_id)', voidPreflight);
  const voidBinding = runtime.indexOf("bindCashierOperationToCurrentOperator(input.operation_id, 'void')", voidPreflight);
  const voidCommit = runtime.indexOf('base.voidSale(input)', voidPreflight);

  assert.ok(voidPreflight > voidStart, 'void must preflight the current session');
  assert.ok(voidPermission > voidPreflight, 'void permission must use the current session');
  assert.ok(voidScope > voidPermission, 'void scope must use the current session');
  assert.ok(voidBinding > voidScope, 'void binding must follow current scope verification');
  assert.ok(voidCommit > voidBinding, 'local void must happen after current session checks');
});
