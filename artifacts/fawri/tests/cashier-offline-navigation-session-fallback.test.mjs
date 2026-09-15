import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fawriRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, fawriRoot), 'utf8');
}

test('cashier session validation falls back only on network failure while local session remains current', async () => {
  const runtime = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const start = runtime.indexOf('export async function validateCashierOperatorSession');
  const end = runtime.indexOf('export function cashierOperatorCan', start);
  const body = runtime.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(body, /try\s*\{[\s\S]*fetch\('\/api\/cashier\/operator\/me'/);
  assert.match(body, /catch\s*\(cause\)/);
  assert.match(body, /cause instanceof TypeError/);
  assert.match(body, /const fallback = await getCashierOperatorSession\(\)/);
  assert.match(body, /fallback\.operator_token === session\.operator_token/);
  assert.match(body, /fallback\.context\.operator_session_id === session\.context\.operator_session_id/);
  assert.match(body, /return fallback/);
});

test('cashier server 401 still invalidates local operator session instead of using offline fallback', async () => {
  const runtime = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const start = runtime.indexOf('export async function validateCashierOperatorSession');
  const end = runtime.indexOf('export function cashierOperatorCan', start);
  const body = runtime.slice(start, end);

  assert.match(body, /if \(response\.status === 401/);
  assert.match(body, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY\)/);
  assert.match(body, /return null/);

  const catchStart = body.indexOf('catch (cause)');
  const responseStart = body.indexOf('const payload = await responsePayload(response)');
  assert.ok(catchStart >= 0 && responseStart > catchStart, 'network fallback must end before HTTP response handling');
});

test('history page remains local-first once operator gate admits the current session', async () => {
  const history = await source('src/pages/CashierHistoryPage.tsx');
  const gate = await source('src/components/cashier/CashierOperatorGate.tsx');

  assert.match(history, /createCashierHistoryRuntime\(\)/);
  assert.match(history, /activeRuntime\.snapshot\(120\)/);
  assert.match(gate, /params\.get\('history'\) === '1'/);
  assert.match(gate, /validateCashierOperatorSession\(\)/);
});
