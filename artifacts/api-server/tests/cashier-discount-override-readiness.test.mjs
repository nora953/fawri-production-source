import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CASHIER_DISCOUNT_OVERRIDE_COLUMNS,
  CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS,
  CASHIER_DISCOUNT_POLICY_COLUMNS,
  evaluateCashierDiscountOverrideReadiness,
} from '../../../lib/db/scripts/lib/cashier-discount-override-readiness.mjs';

const repoRoot = new URL('../../../', import.meta.url);

function readyFacts() {
  return {
    migration_recorded: true,
    permission_constraint_supports_discount: true,
    policy_table_present: true,
    override_table_present: true,
    policy_columns: [...CASHIER_DISCOUNT_POLICY_COLUMNS],
    override_columns: [...CASHIER_DISCOUNT_OVERRIDE_COLUMNS],
    constraint_names: [...CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS],
  };
}

test('canonical 0015 migration stage reproduces the committed SQL authority exactly', async () => {
  const stage = JSON.parse(
    await readFile(new URL('lib/db/migration-stages/0015/stage.json', repoRoot), 'utf8'),
  );
  assert.deepEqual(stage, {
    index: 15,
    name: 'cashier_discount_override_authority',
    when: 1787715600000,
    mode: 'reviewed_sql',
    sql_sha256: '3b04f71b9b5af0af26ab158cf6a23ff7a9861f1103d9f886b37dba5e98fcc321',
    preimage_files: ['cashier-discount.ts', 'cashier-staff.ts', 'index.ts'],
  });

  const archivedSql = await readFile(
    new URL('lib/db/migration-stages/0015/manual.sql', repoRoot),
    'utf8',
  );
  const committedSql = await readFile(
    new URL('lib/db/drizzle/0015_cashier_discount_override_authority.sql', repoRoot),
    'utf8',
  );
  assert.equal(archivedSql, committedSql);
});

test('guarded 0015 apply is exact-target, database-bound and exposes a read-only preflight', async () => {
  const source = await readFile(
    new URL('lib/db/scripts/apply-cashier-discount-override.mjs', repoRoot),
    'utf8',
  );
  assert.match(source, /TARGET_TAG = '0015_cashier_discount_override_authority'/);
  assert.match(source, /EXPECTED_PREVIOUS_TAG = '0014_cashier_operation_attribution'/);
  assert.match(source, /EXPECTED_TARGET_SQL_SHA256 = '[a-f0-9]{64}'/);
  assert.match(source, /process\.argv\.includes\('--check'\)/);
  assert.match(source, /FAWRI_EXPECT_DATABASE is required/);
  assert.match(source, /FAWRI_ALLOW_CASHIER_DISCOUNT_MIGRATION=1 is required/);
  assert.match(source, /history\.length, targetIndex/);
  assert.match(source, /assertNoOutOfBandSchema\(factsBefore\)/);
  assert.match(source, /database_writes_performed: false/);
  assert.match(source, /database_writes_performed: true/);
  assert.doesNotMatch(source, /drizzle-kit push/);
});

test('canonical cashier discount override schema is ready only when every authority fact is present', () => {
  const result = evaluateCashierDiscountOverrideReadiness(readyFacts());
  assert.equal(result.ok, true);
  assert.equal(result.migration_recorded, true);
  assert.equal(result.staff_permission_constraint_supports_discount, true);
  assert.equal(result.required_constraints_ready, true);
});

test('manually created tables without canonical 0015 migration history fail readiness', () => {
  const result = evaluateCashierDiscountOverrideReadiness({
    ...readyFacts(),
    migration_recorded: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.migration_recorded, false);
});

test('legacy cashier permission constraint without manual discount grants fails readiness', () => {
  const result = evaluateCashierDiscountOverrideReadiness({
    ...readyFacts(),
    permission_constraint_supports_discount: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.staff_permission_constraint_supports_discount, false);
});

test('missing approval evidence column fails closed', () => {
  const facts = readyFacts();
  facts.override_columns = facts.override_columns.filter(value => value !== 'operation_id');
  const result = evaluateCashierDiscountOverrideReadiness(facts);
  assert.equal(result.ok, false);
  assert.equal(result.override_required_columns_ready, false);
});

test('missing tenant-bound approval constraint fails closed', () => {
  const facts = readyFacts();
  facts.constraint_names = facts.constraint_names.filter(
    value => value !== 'cashier_discount_override_approver_merchant_fk',
  );
  const result = evaluateCashierDiscountOverrideReadiness(facts);
  assert.equal(result.ok, false);
  assert.equal(result.required_constraints_ready, false);
});
