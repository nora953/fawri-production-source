import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('manual discount permissions exist but are never granted by role presets', async () => {
  const sourceText = await source('src/services/cashierStaffPolicy.ts');
  assert.match(sourceText, /'sale\.discount'/);
  assert.match(sourceText, /'sale\.discount_override'/);
  const presetsStart = sourceText.indexOf('const RECOMMENDED_ROLE_PERMISSIONS');
  const sensitiveStart = sourceText.indexOf('export const CASHIER_SENSITIVE_PERMISSIONS');
  const presets = sourceText.slice(presetsStart, sensitiveStart);
  assert.doesNotMatch(presets, /sale\.discount/);
  assert.match(sourceText.slice(sensitiveStart), /'sale\.discount_override'/);
});

test('discount policy defaults fail closed and caps by percentage plus optional amount', async () => {
  const policy = await source('src/services/cashierDiscountPolicy.ts');
  assert.match(policy, /enabled: false/);
  assert.match(policy, /max_percentage_bps: 0/);
  assert.match(policy, /can_approve_override: false/);
  assert.match(policy, /Math\.floor\(\s*\(total \* input\.policy\.max_percentage_bps\) \/ 10_000/);
  assert.match(policy, /Math\.min\(total, percentageLimit, amountLimit\)/);
  assert.match(policy, /manualDiscountMinor/);
});

test('discount policy persistence is tenant scoped and missing schema fails closed', async () => {
  const authority = await source('src/services/cashierDiscountPolicyAuthority.ts');
  assert.match(authority, /FROM merchant_cashier_staff_discount_policies/);
  assert.match(authority, /WHERE merchant_id = \$1/);
  assert.match(authority, /if \(schemaMissing\(error\)\) return new Map\(\)/);
  assert.match(authority, /CASHIER_DISCOUNT_POLICY_SCHEMA_REQUIRED/);
  assert.match(authority, /ON CONFLICT \(merchant_id, staff_id\)/);
});

test('discount policy schema is canonical migration 0015 and validates percent amount and permission authority', async () => {
  const schema = await source('../../lib/db/drizzle/0015_cashier_discount_override_authority.sql');
  assert.match(schema, /sale\.discount/);
  assert.match(schema, /sale\.discount_override/);
  assert.match(schema, /CREATE TABLE "merchant_cashier_staff_discount_policies"/);
  assert.match(schema, /PRIMARY KEY\("merchant_id","staff_id"\)/);
  assert.match(schema, /"max_percentage_bps" >= 0 AND "max_percentage_bps" <= 10000/);
  assert.match(schema, /"max_amount_minor" IS NULL OR "max_amount_minor" >= 0/);
  assert.match(schema, /cashier_discount_policy_staff_merchant_fk/);
});

test('out-of-band cashier discount DDL is disabled', async () => {
  const apply = await source('scripts/apply-cashier-discount-policy-schema.ts');
  assert.match(apply, /direct discount-policy DDL is disabled/);
  assert.match(apply, /0015_cashier_discount_override_authority/);
  assert.doesNotMatch(apply, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});
