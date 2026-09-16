import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/routes/catalog-operations.ts', import.meta.url),
  'utf8',
);

test('catalog route recognizes typed operational PostgreSQL authority errors', () => {
  assert.match(source, /OperationalPostgresAuthorityError/);
  assert.match(source, /error instanceof OperationalPostgresAuthorityError/);
});

test('catalog route classifies common PostgreSQL failures without leaking driver details', () => {
  assert.match(source, /databaseCode === "23514"/);
  assert.match(source, /CATALOG_DATABASE_CONSTRAINT_FAILED/);
  assert.match(source, /databaseCode === "42P01" \|\| databaseCode === "42703"/);
  assert.match(source, /CATALOG_SCHEMA_NOT_READY/);
  assert.match(source, /databaseCode\.startsWith\("08"\)/);
  assert.match(source, /CATALOG_DATABASE_UNAVAILABLE/);
  assert.match(source, /catalog data violates a database constraint/);
  assert.doesNotMatch(source, /detail:\s*\(error as/);
});
