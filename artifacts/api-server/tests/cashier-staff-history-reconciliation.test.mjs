import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL('../../../lib/db/scripts/reconcile-cashier-staff-migration-history.mjs', import.meta.url);
const source = await readFile(scriptUrl, 'utf8');

test('cashier history reconciliation is fail-closed and database-targeted', () => {
  assert.match(source, /FAWRI_ALLOW_CASHIER_HISTORY_RECONCILIATION/);
  assert.match(source, /FAWRI_EXPECT_DATABASE/);
  assert.match(source, /connected database .* does not match FAWRI_EXPECT_DATABASE/);
  assert.match(source, /0012_catalog_variant_signature_guard/);
  assert.match(source, /0013_cashier_staff_station_authority/);
  assert.match(source, /0014_cashier_operation_attribution/);
  assert.match(source, /0015_cashier_discount_override_authority/);
});

test('reconciliation validates physical schema before touching history', () => {
  assert.match(source, /physical_schema_matches_reviewed_0013_0014/);
  assert.match(source, /missing_tables/);
  assert.match(source, /column_mismatches/);
  assert.match(source, /missing_constraints/);
  assert.match(source, /missing_indexes/);
  assert.match(source, /0015 cashier discount permissions exist before canonical 0015 history/);
  assert.match(source, /0015 discount policy table already exists out of band/);
  assert.match(source, /0015 approval table already exists out of band/);
});

test('reconciliation writes only migration metadata under a transaction lock', () => {
  assert.match(source, /client\.query\('BEGIN'\)/);
  assert.match(source, /LOCK TABLE \"drizzle\"\.\"__drizzle_migrations\" IN EXCLUSIVE MODE/);
  assert.match(source, /INSERT INTO \"drizzle\"\.\"__drizzle_migrations\"/);
  assert.match(source, /client\.query\('COMMIT'\)/);
  assert.match(source, /client\.query\('ROLLBACK'\)/);
  assert.match(source, /metadata_rows_inserted/);
  assert.match(source, /ddl_statements_executed: 0/);

  assert.doesNotMatch(source, /drizzle-kit push/);
  assert.doesNotMatch(source, /client\.query\([^)]*CREATE\s+TABLE/is);
  assert.doesNotMatch(source, /client\.query\([^)]*ALTER\s+TABLE/is);
  assert.doesNotMatch(source, /client\.query\([^)]*DROP\s+TABLE/is);
  assert.doesNotMatch(source, /client\.query\([^)]*TRUNCATE/is);
  assert.doesNotMatch(source, /client\.query\([^)]*DELETE\s+FROM/is);
});

test('reconciliation preserves cashier data and canonical migration hashes', () => {
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /hash does not match canonical SQL/);
  assert.match(source, /cashier authority row counts changed during reconciliation preflight/);
  assert.match(source, /metadata reconciliation changed cashier data/);
  assert.match(source, /cashier_row_counts_unchanged: true/);
});
