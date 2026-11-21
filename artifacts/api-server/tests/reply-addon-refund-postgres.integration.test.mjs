import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = 'required';
const {createDisposableKnowledgeRuntime}=await import('./helpers/disposable-knowledge-runtime.mjs');
const runtimeFixture=await createDisposableKnowledgeRuntime();
const pool=runtimeFixture.admin;
const authority = await import('../src/services/postgresSubscriptionEntitlement.ts');
const { reserveMerchantAutoReplyAuthoritative } = await import('../src/services/merchantReplyEntitlementAuthority.ts');
const { refundMerchantAutoReplyAuthoritative } = await import('../src/services/merchantReplyRefundAuthority.ts');

test('addon reply refunds retain batch identity, exclude expired credit and serialize replay', async t => {
  const ids = [], merchants = [];
  t.after(async () => cleanupResources([
    ['fixture reply ledger', () => pool.query('DELETE FROM reply_ledger WHERE merchant_id=ANY($1::text[])', [merchants])],
    ['fixture identities', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [ids])],
    ['actual runtime fixture', () => runtimeFixture.dispose()],
  ]));
  async function fixture() {
    const merchantId = `addon-merchant-${randomUUID()}`, actorId = `addon-admin-${randomUUID()}`;
    ids.push(merchantId, actorId); merchants.push(merchantId);
    for (const [id, kind] of [[merchantId, 'merchant'], [actorId, 'admin']]) {
      await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)", [id, kind, `+1996${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    }
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [merchantId]);
    const now = new Date('2026-08-11T00:00:00Z');
    await authority.applySubscriptionPlanOperationPostgres({ merchantId, actorAccountId: actorId, operation: 'activate', plan: 'silver', now });
    await authority.applySubscriptionActionPostgres({ merchantId, actorAccountId: actorId, action: 'add_replies', amount: 5, now });
    await authority.applySubscriptionActionPostgres({ merchantId, actorAccountId: actorId, action: 'deduct_replies', amount: 4000, now });
    const eventId = `addon-event-${randomUUID()}`;
    assert.equal((await reserveMerchantAutoReplyAuthoritative(merchantId, eventId, new Date('2026-08-11T00:01:00Z'))).allowed, true);
    const debit = (await pool.query("SELECT reply_batch_id,metadata FROM reply_ledger WHERE merchant_id=$1 AND external_event_id=$2 AND direction='debit'", [merchantId, eventId])).rows[0];
    assert.ok(debit.reply_batch_id);
    assert.equal(debit.metadata.source, 'addon');
    return { merchantId, actorId, eventId, batchId: debit.reply_batch_id };
  }
  await t.test('committed FK refuses loss of a referenced batch, concurrent refunds credit exactly once', async () => {
    const f = await fixture();
    await assert.rejects(() => pool.query('DELETE FROM subscription_reply_batches WHERE id=$1', [f.batchId]), error => error.code === '23503');
    const results = await Promise.all([refundMerchantAutoReplyAuthoritative(f.eventId, 'META_REPLY_FAILED', new Date('2026-08-11T00:02:00Z'), f.merchantId), refundMerchantAutoReplyAuthoritative(f.eventId, 'META_REPLY_FAILED', new Date('2026-08-11T00:02:00Z'), f.merchantId)]);
    assert.equal(results.filter(r => r.refunded).length, 1);
    assert.equal(results.filter(r => !r.refunded && r.reason === 'already_refunded').length, 1);
    assert.equal((await pool.query('SELECT remaining FROM subscription_reply_batches WHERE id=$1', [f.batchId])).rows[0].remaining, 5);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM reply_ledger WHERE external_event_id=$1 AND direction='credit'", [f.eventId])).rows[0].count, 1);
    console.log('REPLY_ADDON_REFUND_CONCURRENCY_PASS');
  });
  await t.test('refund to expired original addon cannot erase renewed-cycle base use', async () => {
    const f = await fixture();
    const now = new Date('2026-11-12T00:00:00Z');
    await authority.applySubscriptionPlanOperationPostgres({ merchantId: f.merchantId, actorAccountId: f.actorId, operation: 'renew', plan: 'silver', now });
    assert.equal((await reserveMerchantAutoReplyAuthoritative(f.merchantId, `new-addon-cycle-${randomUUID()}`, new Date('2026-11-12T00:01:00Z'))).allowed, true);
    const before = await authority.getCurrentSubscriptionPostgres(f.merchantId, new Date('2026-11-12T00:02:00Z'));
    const refund = await refundMerchantAutoReplyAuthoritative(f.eventId, 'META_REPLY_FAILED', new Date('2026-11-12T00:03:00Z'), f.merchantId);
    const after = await authority.getCurrentSubscriptionPostgres(f.merchantId, new Date('2026-11-12T00:04:00Z'));
    assert.equal(before.base_replies_used, 1);
    assert.equal(after.base_replies_used, 1);
    assert.equal(after.base_replies_remaining, before.base_replies_remaining);
    assert.equal(after.addon_replies_remaining, 0);
    console.log('REPLY_EXPIRED_ADDON_REFUND ' + JSON.stringify({ refunded: refund.refunded, beforeUsed: before.base_replies_used, afterUsed: after.base_replies_used, addonRemaining: after.addon_replies_remaining }));
  });
});
