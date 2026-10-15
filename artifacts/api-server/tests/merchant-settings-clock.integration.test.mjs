import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname, '/fawri_ci');
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
const { pool } = await import('@workspace/db');
const settings = await import('../src/services/postgresMerchantSettingsAuthority.js');

test('settings updates use database time despite application clock skew', async () => {
  const id = `clock-regression-${crypto.randomUUID()}`;
  const phone = '+1555' + String(crypto.randomInt(0, 10000000)).padStart(7, '0');
  const RealDate = Date;
  try {
    await pool.query("INSERT INTO accounts(id,kind,password_hash,state,phone) VALUES($1,'merchant','synthetic','active',$2)", [id, phone]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Clock regression','retail','approved','approved')", [id]);
    let current = await settings.getMerchantOperationalSettingsAuthoritative(id);
    let previous = '';
    for (const skew of [-60000, 60000, -60000]) {
      globalThis.Date = class extends RealDate {
        constructor(...args) { if (args.length) super(...args); else super(RealDate.now() + skew); }
        static now() { return RealDate.now() + skew; }
      };
      const result = await settings.updateMerchantOperationalSettingsAuthoritative({
        merchantId: id, expectedVersion: current.version,
        patch: { auto_reply_enabled: true },
      });
      globalThis.Date = RealDate;
      const stored = (await pool.query('SELECT updated_at, created_at, clock_timestamp() AS database_now FROM merchant_settings WHERE merchant_id = $1', [id])).rows[0];
      assert.equal(result.settings.updated_at, stored.updated_at.toISOString());
      assert.ok(stored.updated_at >= stored.created_at);
      assert.ok(Math.abs(stored.database_now.getTime() - stored.updated_at.getTime()) < 5000);
      if (previous) assert.ok(result.settings.updated_at >= previous);
      previous = result.settings.updated_at;
      current = result.settings;
    }
  } finally {
    globalThis.Date = RealDate;
    await pool.query('DELETE FROM accounts WHERE id = $1', [id]);
  }
});
test.after(() => pool.end());