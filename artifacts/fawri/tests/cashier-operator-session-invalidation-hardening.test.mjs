import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('server-rejected cashier operator sessions are cleared before more local POS work can bind to them', async () => {
  const sessionRuntime = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const entry = await source('src/cashierMain.tsx');

  assert.match(sessionRuntime, /export function invalidateCashierOperatorSession/);
  assert.match(entry, /invalidateCashierOperatorSession/);
  assert.match(entry, /sessionRequired/);
  assert.match(entry, /fawri:cashier-operator-session-invalidated/);

  const sessionCatch = entry.indexOf('const sessionRequired = isOperatorSessionRequired(rawCode)');
  const invalidate = entry.indexOf('invalidateCashierOperatorSession()', sessionCatch);
  const event = entry.indexOf("fawri:cashier-operator-session-invalidated", invalidate);
  const attention = entry.indexOf("status: 'needs_attention'", sessionCatch);

  assert.ok(sessionCatch >= 0, 'autosync must classify server session rejection');
  assert.ok(invalidate > sessionCatch, 'rejected operator session must be cleared locally');
  assert.ok(event > invalidate, 'gate invalidation must be published after local session clearing');
  assert.ok(attention > event, 'UI attention state should be published after fail-closed invalidation');
});

test('cashier operator gate reacts to server-side session invalidation and returns to authorization flow', async () => {
  const gate = await source('src/components/cashier/CashierOperatorGate.tsx');

  assert.match(gate, /fawri:cashier-operator-session-invalidated/);
  assert.match(gate, /window\.addEventListener\(/);
  assert.match(gate, /window\.removeEventListener\(/);

  const listener = gate.indexOf("fawri:cashier-operator-session-invalidated");
  const reload = gate.indexOf('void load()', listener);

  assert.ok(listener >= 0, 'gate must subscribe to operator invalidation');
  assert.ok(reload > listener, 'gate must re-run authorization flow after invalidation');
});

test('operator invalidation never deletes local cashier outbox operations', async () => {
  const sessionRuntime = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const start = sessionRuntime.indexOf('export function invalidateCashierOperatorSession');
  const end = sessionRuntime.indexOf('\n}', start);
  const implementation = sessionRuntime.slice(start, end + 2);

  assert.ok(start >= 0, 'explicit local operator invalidation helper must exist');
  assert.match(implementation, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY\)/);
  assert.doesNotMatch(implementation, /acknowledgeSynced/);
  assert.doesNotMatch(implementation, /deleteDatabase/);
  assert.doesNotMatch(implementation, /clearInvalidCashierStationBinding/);
});
