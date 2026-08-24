import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../../lib/db/drizzle/0012_catalog_variant_signature_guard.sql', import.meta.url),
  'utf8',
);
const journal = await readFile(
  new URL('../../../lib/db/drizzle/meta/_journal.json', import.meta.url),
  'utf8',
);

test('catalog variant signature guard normalizes signatures before the database check constraint', () => {
  assert.match(migration, /BEFORE INSERT OR UPDATE OF option_signature ON product_variants/);
  assert.match(migration, /char_length\(value\) BETWEEN 16 AND 256/);
  assert.match(migration, /value \|\| '\|h=' \|\| md5\(value\)/);
  assert.match(migration, /left\(value, 220\) \|\| '\|h=' \|\| md5\(value\)/);
});

test('catalog variant signature guard migration is registered in the drizzle journal', () => {
  assert.match(journal, /0012_catalog_variant_signature_guard/);
});
