import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../lib/db/drizzle/0034_cross_authority_payment_identity_guard.sql', import.meta.url), 'utf8');
const manual = readFileSync(new URL('../../lib/db/migration-stages/0034/manual.sql', import.meta.url), 'utf8');
const stage = JSON.parse(readFileSync(new URL('../../lib/db/migration-stages/0034/stage.json', import.meta.url), 'utf8'));
const journal = JSON.parse(readFileSync(new URL('../../lib/db/drizzle/meta/_journal.json', import.meta.url), 'utf8'));

test('P0 provider identity guard manual migration remains byte-identical', () => {
  assert.equal(migration, manual);
  assert.equal(stage.index, 34);
  assert.equal(stage.mode, 'manual_sql');
  assert.equal(journal.entries[34].tag, '0034_cross_authority_payment_identity_guard');
});

test('P0 provider identity guard covers both independent billing authorities', () => {
  for (const table of ['saas_billing_orders', 'cashier_billing_orders']) {
    assert.match(migration, new RegExp('ON public\\.' + table + ' FOR EACH ROW EXECUTE FUNCTION public\\.fawri_guard_provider_order_identity\\(\\)'));
    assert.ok(migration.includes("TG_TABLE_NAME <> '" + table + "'"));
  }
  assert.match(migration, /BEFORE INSERT OR UPDATE OF provider,provider_checkout_ref,metadata OR DELETE/g);
  assert.match(migration, /SUPERQI_SANDBOX_ORDER_AUTHORITY_COLLISION/);
});

test('P0 provider identity guard serializes payment and request references and revokes PUBLIC', () => {
  for (const key of ['old_payment', 'old_request', 'new_payment', 'new_request']) {
    assert.ok(migration.includes(key));
  }
  assert.match(migration, /ORDER BY key LOOP/);
  assert.match(migration, /pg_catalog\\.pg_advisory_xact_lock/);
  assert.match(migration, /SECURITY DEFINER SET search_path=pg_catalog SET row_security=off/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\\.fawri_guard_provider_order_identity\\(\\) FROM PUBLIC;/);
});

// Static contract only. PostgreSQL two-session race tests and migration execution remain required.
