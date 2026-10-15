import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../../lib/db/drizzle/0012_catalog_variant_signature_guard.sql', import.meta.url),
  'utf8',
);
const journal = JSON.parse(
  await readFile(new URL('../../../lib/db/drizzle/meta/_journal.json', import.meta.url), 'utf8'),
);

test('variant signature guard normalizes short and long signatures before database checks', () => {
  assert.match(migration, /BEFORE INSERT OR UPDATE OF option_signature/);
  assert.match(migration, /char_length\(value\) BETWEEN 16 AND 256/);
  assert.match(migration, /char_length\(value\) < 16/);
  assert.match(migration, /value \|\| '\|h=' \|\| md5\(value\)/);
  assert.match(migration, /left\(value, 220\) \|\| '\|h=' \|\| md5\(value\)/);
});

test('variant signature guard migration is registered once immediately after 0011', () => {
  const entries = journal.entries.filter(entry => entry.tag === '0012_catalog_variant_signature_guard');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].idx, 12);

  const previous = journal.entries.find(entry => entry.idx === entries[0].idx - 1);
  const registered = journal.entries.find(entry => entry.idx === entries[0].idx);
  assert.equal(previous?.tag, '0011_commerce_promotions_timezone_authority');
  assert.equal(registered?.tag, '0012_catalog_variant_signature_guard');
});
