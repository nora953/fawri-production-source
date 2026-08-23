import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/services/postgresCatalogAuthority.ts', import.meta.url);

function contiguousRange(max) {
  return Array.from({ length: max }, (_, index) => index + 1);
}

test('PostgreSQL catalog product UPDATE uses contiguous bind parameters', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const match = source.match(
    /`UPDATE products\s+SET external_ref = \$3,[\s\S]*?RETURNING id`,\s+updateValues,/,
  );

  assert.ok(match, 'catalog product UPDATE statement should be bound through updateValues');

  const sql = match[0];
  const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((entry) => Number(entry[1]));
  const unique = [...new Set(placeholders)].sort((a, b) => a - b);

  assert.deepEqual(unique, contiguousRange(25));
  assert.doesNotMatch(sql, /\$26\b/);
  assert.match(source, /const updateValues = \[\s*\.\.\.values\.slice\(0, 22\),\s*values\[23\],\s*values\[24\],\s*expectedVersion,\s*\];/);
});
