import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from '../helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const id = process.env.FAWRI_AUDIT_FAILED_SETUP_ID;
assert.match(id || '', /^audit-failed-setup-[a-f0-9-]{36}$/);
const { pool } = await import('@workspace/db');
test('expected synthetic setup and first cleanup failure', async t => {
  t.after(async () => cleanupResources([
    ['injected SQL cleanup error', () => pool.query("SELECT 'synthetic-invalid-integer'::integer")],
    ['fixture account', () => pool.query('DELETE FROM accounts WHERE id=$1', [id])],
    ['pool', () => pool.end()],
  ]));
  await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant','+199999999999','synthetic','active',true)", [id]);
  await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
  throw new Error('expected synthetic fixture setup failure after database mutation');
});
