import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../src/routes/catalog-operations.ts', import.meta.url),
  'utf8',
);

test('catalog routes expose safe operational PostgreSQL authority errors instead of generic 500s', () => {
  assert.match(route, /OperationalPostgresAuthorityError/);
  assert.match(route, /error instanceof OperationalPostgresAuthorityError/);
});

test('catalog routes classify schema, constraint, and database availability failures safely', () => {
  assert.match(route, /databaseCode === "23514"/);
  assert.match(route, /CATALOG_DATABASE_CONSTRAINT_FAILED/);
  assert.match(route, /databaseCode === "42P01" \|\| databaseCode === "42703"/);
  assert.match(route, /CATALOG_SCHEMA_NOT_READY/);
  assert.match(route, /databaseCode\.startsWith\("08"\)/);
  assert.match(route, /CATALOG_DATABASE_UNAVAILABLE/);
});
