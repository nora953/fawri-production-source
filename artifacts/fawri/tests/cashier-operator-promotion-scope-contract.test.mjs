import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cloud = await readFile(
  new URL('../src/lib/cashierOperatorCloudSync.ts', import.meta.url),
  'utf8',
);

test('operator promotion sync accepts only cashier-supported scopes and never invents order scope', () => {
  assert.match(cloud, /rawScope !== 'catalog_item' && rawScope !== 'delivery'/);
  assert.match(cloud, /CASHIER_OPERATOR_PROMOTION_SCOPE_INVALID/);
  assert.match(cloud, /const scope: CashierPromotionRule\['scope'\] = rawScope/);
  assert.doesNotMatch(cloud, /raw\.scope === 'catalog_item' \? 'catalog_item' : 'order'/);
});
