import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = new URL('../../lib/db/drizzle/0032_authorized_receipt_replay_execution.sql', import.meta.url);
const authoritative = new URL('../../lib/db/migration-stages/0032/manual.sql', import.meta.url);

const sql = readFileSync(migration, 'utf8');

test('P0 replay migration stays byte-identical to its authoritative manual source', () => {
  assert.equal(sql, readFileSync(authoritative, 'utf8'));
});

test('P0 replay locks both authority order rows and rechecks receipt identity under lock', () => {
  for (const table of ['saas_billing_orders', 'cashier_billing_orders']) {
    assert.match(sql, new RegExp(`FROM public\\.${table} o WHERE o\\.id=p_order_id FOR SHARE`));
  }
  for (const comparison of [
    'assigned_provider IS DISTINCT FROM reviewed.provider',
    'assigned_payment IS DISTINCT FROM reviewed.payment_ref',
    'assigned_request IS DISTINCT FROM reviewed.request_ref',
    'assigned_amount IS DISTINCT FROM reviewed.amount_iqd',
  ]) {
    assert.ok(sql.includes(comparison), `Missing replay order identity recheck: ${comparison}`);
  }
  assert.match(sql, /reviewed\.event_type\s*<>\s*'payment_succeeded'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.fawri_authorize_verified_receipt_replay\([^;]+FROM PUBLIC;/);
});

// This is a source contract regression, NOT a two-session PostgreSQL race proof.
