import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const management = await readFile(
  new URL('../src/pages/dashboard/CashierManagementPage.tsx', import.meta.url),
  'utf8',
);

test('merchant cashier staff UI offers only currently implemented employee permissions', () => {
  assert.match(management, /'sale\.view_all'/);
  assert.match(management, /'sale\.return'/);
  assert.match(management, /'sale\.void'/);
  assert.match(management, /'reports\.sales'/);
  assert.match(management, /'reports\.profit'/);
  assert.doesNotMatch(management, /'inventory\.adjust'/);
  assert.doesNotMatch(management, /'shifts\.manage'/);
  assert.doesNotMatch(management, /'catalog\.cost'/);
  assert.doesNotMatch(management, /'staff\.manage'/);
  assert.doesNotMatch(management, /'stations\.manage'/);
});

test('profit grant always implies sales-report permission in merchant UI', () => {
  assert.match(
    management,
    /permission === 'reports\.profit'[\s\S]*next\.add\('reports\.sales'\)/,
  );
  assert.match(
    management,
    /permission === 'reports\.sales'[\s\S]*next\.delete\('reports\.profit'\)/,
  );
});
