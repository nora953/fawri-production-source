import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL(
  '../../../lib/db/scripts/cashier-discount-override-live-readiness.mjs',
  import.meta.url,
);
const source = await readFile(scriptUrl, 'utf8');

test('live readiness is database-targeted and read only', () => {
  assert.match(source, /FAWRI_EXPECT_DATABASE/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /database_writes_performed: false/);
  assert.match(source, /sensitive_staff_identity_exposed: false/);
  assert.doesNotMatch(source, /INSERT\s+INTO/i);
  assert.doesNotMatch(source, /UPDATE\s+merchant_/i);
  assert.doesNotMatch(source, /DELETE\s+FROM/i);
  assert.doesNotMatch(source, /CREATE\s+TABLE/i);
  assert.doesNotMatch(source, /ALTER\s+TABLE/i);
  assert.doesNotMatch(source, /DROP\s+TABLE/i);
});

test('live readiness requires explicit discount and override authority', () => {
  assert.match(source, /p\.permission = 'sale\.discount'/);
  assert.match(source, /p\.permission = 'sale\.discount_override'/);
  assert.match(source, /d\.enabled = true/);
  assert.match(source, /d\.can_approve_override = true/);
  assert.match(source, /s\.role = 'manager'/);
  assert.match(source, /m\.id <> o\.id/);
});

test('live readiness requires a paired station with a live credential', () => {
  assert.match(source, /st\.status = 'active'/);
  assert.match(source, /st\.paired_device_id IS NOT NULL/);
  assert.match(source, /c\.status = 'active'/);
  assert.match(source, /c\.expires_at > now\(\)/);
  assert.match(source, /manager_override_live_ready_merchant_count/);
});

test('live readiness exposes configuration blockers without identities or PIN material', () => {
  assert.match(source, /no_sale_discount_permission_grants/);
  assert.match(source, /no_sale_discount_override_permission_grants/);
  assert.match(source, /no_enabled_discount_policies/);
  assert.match(source, /no_eligible_override_manager/);
  assert.match(source, /no_distinct_requester_approver_pair/);
  assert.match(source, /no_live_paired_station/);
  assert.match(source, /active operator sessions may need re-login/);
  assert.doesNotMatch(source, /display_name/);
  assert.doesNotMatch(source, /pin_hash/);
});
