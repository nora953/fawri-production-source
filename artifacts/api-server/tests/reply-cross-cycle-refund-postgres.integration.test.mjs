import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = 'required';
const { pool } = await import('@workspace/db');
const authority = await import('../src/services/postgresSubscriptionEntitlement.ts');
const { reserveMerchantAutoReplyAuthoritative } = await import('../src/services/merchantReplyEntitlementAuthority.ts');
const { refundMerchantAutoReplyAuthoritative } = await import('../src/services/merchantReplyRefundAuthority.ts');

test('late old-cycle refund cannot erase a new-cycle reply debit', async t => {
  const merchantId = `cycle-merchant-${randomUUID()}`;
  const actorId = `cycle-admin-${randomUUID()}`;
  t.after(async () => cleanupResources([
    ['fixture identities', () => pool.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [[merchantId, actorId]])],
    ['pool', () => pool.end()],
  ]));
  for (const [id, kind] of [[merchantId, 'merchant'], [actorId, 'admin']]) {
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)", [id, kind, `+1999${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
  }
  await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [merchantId]);
  await authority.applySubscriptionPlanOperationPostgres({ merchantId, actorAccountId: actorId, operation: 'activate', plan: 'silver', now: new Date('2026-08-11T00:00:00Z') });
  const oldEvent = `cycle-old-${randomUUID()}`;
  assert.equal((await reserveMerchantAutoReplyAuthoritative(merchantId, oldEvent, new Date('2026-08-11T00:01:00Z'))).allowed, true);
  await authority.applySubscriptionPlanOperationPostgres({ merchantId, actorAccountId: actorId, operation: 'renew', plan: 'silver', now: new Date('2026-09-12T00:00:00Z') });
  const newEvent = `cycle-new-${randomUUID()}`;
  assert.equal((await reserveMerchantAutoReplyAuthoritative(merchantId, newEvent, new Date('2026-09-12T00:01:00Z'))).allowed, true);
  const before = await authority.getCurrentSubscriptionPostgres(merchantId, new Date('2026-09-12T00:02:00Z'));
  assert.equal(before.base_replies_used, 1);
  assert.equal(before.base_replies_remaining, 3999);
  const refund = await refundMerchantAutoReplyAuthoritative(oldEvent, 'META_REPLY_FAILED', new Date('2026-09-12T00:03:00Z'));
  assert.equal(refund.refunded, false, 'old-cycle base debit must not refund into renewed cycle');
  assert.equal(refund.reason, 'refund_cycle_mismatch');
  const after = await authority.getCurrentSubscriptionPostgres(merchantId, new Date('2026-09-12T00:04:00Z'));
  console.log('REPLY_CROSS_CYCLE_RESULT ' + JSON.stringify({ refund, beforeUsed: before.base_replies_used, afterUsed: after.base_replies_used, beforeRemaining: before.base_replies_remaining, afterRemaining: after.base_replies_remaining }));
  // New-cycle usage must stay attributable to the new event. Historical refund
  // policy may reject or reconcile separately, but cannot erase this debit.
  assert.equal(after.base_replies_used, before.base_replies_used);
  assert.equal(after.base_replies_remaining, before.base_replies_remaining);
  // A valid refund within the active cycle must still restore exactly one
  // debit. This guards against an over-broad fail-closed cycle check.
  const currentRefund = await refundMerchantAutoReplyAuthoritative(newEvent, 'META_REPLY_FAILED', new Date('2026-09-12T00:05:00Z'));
  assert.equal(currentRefund.refunded, true);
  const restored = await authority.getCurrentSubscriptionPostgres(merchantId, new Date('2026-09-12T00:06:00Z'));
  assert.equal(restored.base_replies_used, 0);
  assert.equal(restored.base_replies_remaining, 4000);
  const replay = await refundMerchantAutoReplyAuthoritative(newEvent, 'META_REPLY_FAILED', new Date('2026-09-12T00:07:00Z'));
  assert.equal(replay.refunded, false);
  assert.equal(replay.reason, 'already_refunded');
  console.log('REPLY_SAME_CYCLE_REFUND_RESULT ' + JSON.stringify({ currentRefund, used: restored.base_replies_used, remaining: restored.base_replies_remaining, replay }));
});
