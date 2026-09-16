import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/services/postgresCatalogAuthority.ts', import.meta.url),
  'utf8',
);

function persistProductGraphSource() {
  const start = source.indexOf('async function persistProductGraph(');
  const end = source.indexOf('\nasync function readIdempotency(', start);
  assert.ok(start >= 0, 'persistProductGraph must exist');
  assert.ok(end > start, 'persistProductGraph boundary must be readable');
  return source.slice(start, end);
}

test('catalog persistence preserves retained variant rows instead of blanket rebuilding them', () => {
  const persist = persistProductGraphSource();

  assert.doesNotMatch(
    persist,
    /DELETE FROM product_variants WHERE merchant_id = \$1 AND product_id = \$2/,
  );
  assert.match(persist, /FROM product_variants[\s\S]*FOR UPDATE/);
  assert.match(persist, /variant_rebuild/);
  assert.match(persist, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(
    persist,
    /product_variants\.product_id = EXCLUDED\.product_id[\s\S]*product_variants\.merchant_id = EXCLUDED\.merchant_id/,
  );
  assert.match(persist, /RETURNING id/);
  assert.match(persist, /CATALOG_VARIANT_ID_CONFLICT/);
});

test('removed variants fail closed when historical or active commerce records depend on them', () => {
  const persist = persistProductGraphSource();

  assert.match(persist, /inventory_mutations/);
  assert.match(persist, /order_items/);
  assert.match(persist, /commerce_promotions/);
  assert.match(persist, /CATALOG_VARIANT_HISTORY_CONFLICT/);

  const guard = persist.indexOf('CATALOG_VARIANT_HISTORY_CONFLICT');
  const deleteRemoved = persist.indexOf('DELETE FROM product_variants', guard);
  assert.ok(guard >= 0, 'dependency conflict must be explicit');
  assert.ok(
    deleteRemoved > guard,
    'physical deletion of removed variants must happen only after dependency checks',
  );
});
