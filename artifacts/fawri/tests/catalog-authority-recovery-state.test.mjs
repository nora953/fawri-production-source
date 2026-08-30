import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspaceSource = await readFile(
  new URL('../src/pages/dashboard/ProductsWorkspacePage.tsx', import.meta.url),
  'utf8',
);
const catalogSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('products workspace reaches the simplified catalog page that merchants actually use', () => {
  assert.match(
    workspaceSource,
    /import CommerceCatalogPage from ['"]\.\/CommerceCatalogSimplifiedPage['"]/,
  );
  assert.match(workspaceSource, /<CommerceCatalogPage \/>/);
});

test('catalog authority availability is separate from serialized mutation state', () => {
  assert.match(
    catalogSource,
    /const mutationBusy = saving \|\| inventoryBusy !== null \|\| deletingId !== null;/,
  );
  assert.match(catalogSource, /if \(mutationBusy\) return;/);
  assert.match(catalogSource, /disabled=\{!authorityReady \|\| !commerceContext \|\| loading \|\| mutationBusy\}/);
  assert.match(catalogSource, /disabled=\{!authorityReady \|\| mutationBusy\}/);
});

test('ordinary catalog mutations cannot mark a loaded authority unavailable', () => {
  const saveBody = between(catalogSource, '  const save = async () => {', '  const remove = async');
  const removeBody = between(catalogSource, '  const remove = async', '  const parseQuantity =');
  const setInventoryBody = between(catalogSource, '  const setInventory = async', '  const adjustInventory = async');
  const adjustInventoryBody = between(catalogSource, '  const adjustInventory = async', '  return (');

  for (const [name, body] of [
    ['save', saveBody],
    ['remove', removeBody],
    ['setInventory', setInventoryBody],
    ['adjustInventory', adjustInventoryBody],
  ]) {
    assert.doesNotMatch(body, /setAuthorityReady\(/, `${name} must not redefine read-authority availability`);
  }
});

test('cashier refresh waits for mutations without pretending the catalog authority is down', () => {
  assert.match(
    catalogSource,
    /if \(formOpen \|\| mutationBusy \|\| !authorityReady\) \{\s*pendingCashierRefresh\.current = true;/,
  );
  assert.match(
    catalogSource,
    /if \(formOpen \|\| mutationBusy \|\| !authorityReady \|\| !pendingCashierRefresh\.current\) return;/,
  );
});

test('failed version-conflict reconciliation becomes a real reloadable authority error', () => {
  const conflictBody = between(catalogSource, '  const loadConflict = async', '  const save = async');

  assert.match(conflictBody, /getCatalogProduct\(productId\)/);
  assert.match(conflictBody, /setAuthorityReady\(true\)/);
  assert.match(conflictBody, /setAuthorityReady\(false\)/);
  assert.match(conflictBody, /setCommerceContext\(null\)/);
  assert.match(conflictBody, /setLoadError\(true\)/);
  assert.match(catalogSource, /onClick=\{\(\) => setReload\(value => value \+ 1\)\}/);
});
