import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier mutations preserve offline-first local sale authority', async () => {
  const contracts = await source('src/lib/cashierLocalContracts.ts');
  const pos = await source('src/lib/cashierOperatorPosRuntime.ts');
  const history = await source('src/lib/cashierOperatorHistoryRuntime.ts');

  assert.match(contracts, /local_sale:\s*localEnabled/);
  assert.match(contracts, /cloud_sync:\s*cloudEnabled/);

  const commitStart = pos.indexOf('async commitSale(input)');
  const commitEnd = pos.indexOf('\n    },', commitStart);
  const commitImplementation = pos.slice(commitStart, commitEnd);
  assert.doesNotMatch(
    commitImplementation,
    /validateCashierOperatorSession/,
    'local sale must not become network-dependent',
  );

  const returnStart = history.indexOf('async returnSale(input: CashierReturnSaleInput)');
  const returnEnd = history.indexOf('\n    },', returnStart);
  const returnImplementation = history.slice(returnStart, returnEnd);
  assert.doesNotMatch(returnImplementation, /validateCashierOperatorSession/);

  const voidStart = history.indexOf('async voidSale(input: CashierVoidSaleInput)');
  const voidEnd = history.indexOf('\n    },', voidStart);
  const voidImplementation = history.slice(voidStart, voidEnd);
  assert.doesNotMatch(voidImplementation, /validateCashierOperatorSession/);
});

test('sale commit rechecks the current local operator before binding or local commit', async () => {
  const runtime = await source('src/lib/cashierOperatorPosRuntime.ts');

  const commitStart = runtime.indexOf('async commitSale(input)');
  const currentSession = runtime.indexOf('const currentSession = await getCashierOperatorSession()', commitStart);
  const loginRequired = runtime.indexOf('CASHIER_OPERATOR_LOGIN_REQUIRED', currentSession);
  const permission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.create')", currentSession);
  const binding = runtime.indexOf("bindCashierOperationToCurrentOperator(input.operation_id, 'sale')", currentSession);
  const localCommit = runtime.indexOf('base.commitSale(input)', currentSession);

  assert.ok(commitStart >= 0, 'operator sale commit wrapper must exist');
  assert.ok(currentSession > commitStart, 'sale must reread the current local session');
  assert.ok(loginRequired > currentSession, 'missing current session must fail closed');
  assert.ok(permission > currentSession, 'sale.create must be rechecked on the current session');
  assert.ok(binding > permission, 'operation binding must happen after current permission verification');
  assert.ok(localCommit > binding, 'local sale commit must happen after current session checks');
});

test('return and void use current local operator permissions and scope before compensation', async () => {
  const runtime = await source('src/lib/cashierOperatorHistoryRuntime.ts');

  const returnStart = runtime.indexOf('async returnSale(input: CashierReturnSaleInput)');
  const returnSession = runtime.indexOf('const currentSession = await getCashierOperatorSession()', returnStart);
  const returnLogin = runtime.indexOf('CASHIER_OPERATOR_LOGIN_REQUIRED', returnSession);
  const returnPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.return')", returnSession);
  const returnScope = runtime.indexOf('visibleSaleOrThrow(base, currentSession, input.sale_id)', returnSession);
  const returnBinding = runtime.indexOf("bindCashierOperationToCurrentOperator(input.operation_id, 'return')", returnSession);
  const returnCommit = runtime.indexOf('base.returnSale(input)', returnSession);

  assert.ok(returnSession > returnStart, 'return must reread the current local session');
  assert.ok(returnLogin > returnSession, 'return must fail closed without a current session');
  assert.ok(returnPermission > returnSession, 'return permission must use the current session');
  assert.ok(returnScope > returnPermission, 'return scope must use the current session');
  assert.ok(returnBinding > returnScope, 'return binding must follow current scope verification');
  assert.ok(returnCommit > returnBinding, 'local return must happen after current session checks');

  const voidStart = runtime.indexOf('async voidSale(input: CashierVoidSaleInput)');
  const voidSession = runtime.indexOf('const currentSession = await getCashierOperatorSession()', voidStart);
  const voidLogin = runtime.indexOf('CASHIER_OPERATOR_LOGIN_REQUIRED', voidSession);
  const voidPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.void')", voidSession);
  const voidScope = runtime.indexOf('visibleSaleOrThrow(base, currentSession, input.sale_id)', voidSession);
  const voidBinding = runtime.indexOf("bindCashierOperationToCurrentOperator(input.operation_id, 'void')", voidSession);
  const voidCommit = runtime.indexOf('base.voidSale(input)', voidSession);

  assert.ok(voidSession > voidStart, 'void must reread the current local session');
  assert.ok(voidLogin > voidSession, 'void must fail closed without a current session');
  assert.ok(voidPermission > voidSession, 'void permission must use the current session');
  assert.ok(voidScope > voidPermission, 'void scope must use the current session');
  assert.ok(voidBinding > voidScope, 'void binding must follow current scope verification');
  assert.ok(voidCommit > voidBinding, 'local void must happen after current session checks');
});
