import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SAAS_BILLING_PROVIDER = 'test_fake';
const { pool } = await import('@workspace/db');
const billing = await import('../src/services/saasBillingAuthority.ts');

test('verified SaaS payments preserve terminal state and recover after proactive expiry', { timeout: 60000 }, async t => {
  const merchantIds = [];
  t.after(async () => cleanupResources([
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [merchantIds])],
    ['pool', () => pool.end()],
  ]));
  async function checkout(now = new Date()) {
    const id = `negative-bill-${randomUUID()}`;
    merchantIds.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+1999${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
    const result = await billing.createSaasBillingCheckout({ merchantId: id, operation: 'activate', plan: 'silver', idempotencyKey: randomUUID(), now });
    return { merchantId: id, order: result.order };
  }
  function event(order, override = {}) {
    return { provider: 'test_fake', providerEventId: randomUUID(), orderId: order.id, eventType: 'payment_succeeded', signatureVerified: true, payloadHash: 'a'.repeat(64), occurredAt: new Date(), amountIqd: order.amount_iqd, currency: 'IQD', providerPaymentRef: randomUUID(), ...override };
  }
  await t.test('matching verified payment after list marks checkout expired must be durably reconciled', async () => {
    const fixture = await checkout(new Date(Date.now() - 60 * 60 * 1000));
    const before = await billing.listMerchantSaasBillingOrders(fixture.merchantId);
    assert.equal(before[0].status, 'expired', 'must exercise proactive expiry rather than only pending late payment');
    const paidEvent = event(fixture.order);
    const result = await billing.applyVerifiedSaasBillingProviderEvent(paidEvent);
    assert.equal(result.status, 'reconciliation_required');
    const stored = (await pool.query('SELECT status FROM saas_billing_orders WHERE id=$1', [fixture.order.id])).rows[0];
    assert.equal(stored.status, 'paid_reconciliation_required');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_entitlement_applications WHERE order_id=$1', [fixture.order.id])).rows[0].count, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_billing_events WHERE provider_event_id=$1', [paidEvent.providerEventId])).rows[0].count, 1);
  });
  await t.test('new mismatched-amount event cannot rewrite already paid order', async () => {
    const fixture = await checkout();
    const first = event(fixture.order);
    assert.equal((await billing.applyVerifiedSaasBillingProviderEvent(first)).status, 'applied');
    try {
      await billing.applyVerifiedSaasBillingProviderEvent(event(fixture.order, { providerPaymentRef: first.providerPaymentRef, amountIqd: 1 }));
    } catch (error) {
      assert.ok(['SAAS_BILLING_TERMINAL_CONFLICT', 'SAAS_BILLING_AMOUNT_MISMATCH'].includes(error.code), 'only explicit terminal/amount rejection is acceptable');
    }
    const stored = (await pool.query('SELECT status,provider_payment_ref FROM saas_billing_orders WHERE id=$1', [fixture.order.id])).rows[0];
    assert.equal(stored.status, 'paid', 'verified terminal paid state must not be overwritten by mismatched replay');
    assert.equal(stored.provider_payment_ref, first.providerPaymentRef);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_entitlement_applications WHERE order_id=$1', [fixture.order.id])).rows[0].count, 1);
  });
  await t.test('simultaneous identical checkout requests return one durable order for both callers', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const fixture = await checkout(new Date(Date.now() - 60 * 60 * 1000));
      await billing.listMerchantSaasBillingOrders(fixture.merchantId);
      const key = randomUUID();
      const input = { merchantId: fixture.merchantId, operation: 'activate', plan: 'silver', idempotencyKey: key };
      const results = await Promise.allSettled([billing.createSaasBillingCheckout(input), billing.createSaasBillingCheckout(input)]);
      console.log('BILLING_CHECKOUT_RACE ' + JSON.stringify({ attempt, rejectedCodes: results.filter(r => r.status === 'rejected').map(r => r.reason.code) }));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 2, 'identical idempotency retry must return stable checkout rather than SQL failure');
      assert.equal(results[0].value.order.id, results[1].value.order.id);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_billing_orders WHERE merchant_id=$1 AND idempotency_key=$2', [fixture.merchantId, key])).rows[0].count, 1);
    }
  });
  await t.test('two concurrent orders sharing provider payment identity apply at most one entitlement', async () => {
    const fixtures = [await checkout(), await checkout()];
    const reference = randomUUID();
    const results = await Promise.allSettled(fixtures.map(f => billing.applyVerifiedSaasBillingProviderEvent(event(f.order, { providerPaymentRef: reference }))));
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.status === 'applied').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_entitlement_applications WHERE provider_payment_ref=$1', [reference])).rows[0].count, 1);
    console.log('BILLING_CONCURRENT_REJECTION_CODE ' + results.find(r => r.status === 'rejected').reason.code);
  });
});
