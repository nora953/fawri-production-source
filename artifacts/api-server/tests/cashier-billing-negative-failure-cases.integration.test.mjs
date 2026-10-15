import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SAAS_BILLING_PROVIDER = 'test_fake';
process.env.FAWRI_SAAS_BILLING_PROVIDERS = 'test_fake';
const { pool } = await import('@workspace/db');
const billing = await import('../src/services/cashierBillingAuthority.ts');

test('cashier negative payment contracts: replay, expiry, concurrency and SQL recovery', async t => {
  const merchants = [];
  const fault = `audit_cashier_fault_${randomUUID().replaceAll('-', '')}`;
  async function removeFault() {
    await pool.query(`DROP TRIGGER IF EXISTS ${fault} ON cashier_entitlement_applications`);
    await pool.query(`DROP FUNCTION IF EXISTS ${fault}()`);
  }
  t.after(async () => cleanupResources([
    ['fault trigger', () => pool.query(`DROP TRIGGER IF EXISTS ${fault} ON cashier_entitlement_applications`)],
    ['fault function', () => pool.query(`DROP FUNCTION IF EXISTS ${fault}()`)],
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [merchants])],
    ['pool', () => pool.end()],
  ]));
  async function merchant() {
    const id = `negative-cashier-${randomUUID()}`;
    merchants.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+1997${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')", [id]);
    return id;
  }
  async function checkout(now = new Date()) {
    const merchantId = await merchant();
    const result = await billing.createCashierBillingCheckout({ merchantId, operation: 'activate', requestedSeats: 1, idempotencyKey: randomUUID(), provider: 'test_fake', now });
    return result.order;
  }
  function event(order, overrides = {}) {
    return { provider: 'test_fake', providerEventId: randomUUID(), orderId: order.id, eventType: 'payment_succeeded', signatureVerified: true, payloadHash: 'c'.repeat(64), occurredAt: new Date(), amountIqd: order.amount_iqd, currency: 'IQD', providerPaymentRef: randomUUID(), ...overrides };
  }
  await t.test('matching payment after proactive expiry has durable reconciliation', async () => {
    const order = await checkout(new Date(Date.now() - 3600000));
    assert.equal((await billing.listMerchantCashierBillingOrders(order.merchant_id))[0].status, 'expired');
    assert.equal((await billing.applyVerifiedCashierBillingProviderEvent(event(order))).status, 'reconciliation_required');
    assert.equal((await pool.query('SELECT status FROM cashier_billing_orders WHERE id=$1', [order.id])).rows[0].status, 'paid_reconciliation_required');
  });
  await t.test('mismatched new event cannot rewrite already applied cashier order', async () => {
    const order = await checkout();
    const paid = event(order);
    assert.equal((await billing.applyVerifiedCashierBillingProviderEvent(paid)).status, 'applied');
    try { await billing.applyVerifiedCashierBillingProviderEvent(event(order, { providerPaymentRef: paid.providerPaymentRef, amountIqd: 1 })); }
    catch (error) { assert.ok(['CASHIER_BILLING_ORDER_NOT_PAYABLE', 'CASHIER_BILLING_AMOUNT_MISMATCH'].includes(error.code)); }
    const stored = (await pool.query('SELECT status FROM cashier_billing_orders WHERE id=$1', [order.id])).rows[0];
    assert.equal(stored.status, 'applied');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM cashier_entitlement_applications WHERE order_id=$1', [order.id])).rows[0].count, 1);
  });
  await t.test('identical simultaneous cashier checkout callers receive one stable order', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const merchantId = await merchant();
      const key = randomUUID();
      const input = { merchantId, operation: 'activate', requestedSeats: 1, idempotencyKey: key, provider: 'test_fake' };
      const results = await Promise.allSettled([billing.createCashierBillingCheckout(input), billing.createCashierBillingCheckout(input)]);
      console.log('CASHIER_CHECKOUT_RACE ' + JSON.stringify({ attempt, rejectedCodes: results.filter(r => r.status === 'rejected').map(r => r.reason.code) }));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
      assert.equal(results[0].value.order.id, results[1].value.order.id);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM cashier_billing_orders WHERE merchant_id=$1 AND idempotency_key=$2', [merchantId, key])).rows[0].count, 1);
    }
  });
  await t.test('shared payment reference across concurrent merchants applies at most one entitlement', async () => {
    const orders = [await checkout(), await checkout()];
    const paymentRef = randomUUID();
    const results = await Promise.allSettled(orders.map(order => billing.applyVerifiedCashierBillingProviderEvent(event(order, { providerPaymentRef: paymentRef }))));
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.status === 'applied').length, 1);
    const rejected = results.filter(r => r.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'CASHIER_BILLING_PAYMENT_REPLAY');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM cashier_entitlement_applications WHERE provider_payment_ref=$1', [paymentRef])).rows[0].count, 1);
  });
  await t.test('SQL fault preserves received-payment work and exact retry is safe', async () => {
    const order = await checkout();
    await pool.query(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic cashier SQL fault' USING ERRCODE='P0001'; END $$`);
    await pool.query(`CREATE TRIGGER ${fault} BEFORE INSERT ON cashier_entitlement_applications FOR EACH ROW EXECUTE FUNCTION ${fault}()`);
    const paid = event(order);
    let errorCode;
    try { await billing.applyVerifiedCashierBillingProviderEvent(paid); }
    catch (error) { errorCode = error.code; }
    assert.equal(errorCode, 'P0001');
    const state = (await pool.query('SELECT status FROM cashier_billing_orders WHERE id=$1', [order.id])).rows[0].status;
    const eventCount = (await pool.query('SELECT count(*)::int AS count FROM cashier_billing_events WHERE provider_event_id=$1', [paid.providerEventId])).rows[0].count;
    const applicationCount = (await pool.query('SELECT count(*)::int AS count FROM cashier_entitlement_applications WHERE order_id=$1', [order.id])).rows[0].count;
    const subscriptionCount = (await pool.query('SELECT count(*)::int AS count FROM merchant_cashier_subscriptions WHERE merchant_id=$1', [order.merchant_id])).rows[0].count;
    console.log('CASHIER_SQL_FAULT_STATE ' + JSON.stringify({ errorCode, state, eventCount, applicationCount, subscriptionCount }));
    await removeFault();
    assert.equal(applicationCount, 0);
    assert.equal(subscriptionCount, 0);
    await assert.rejects(() => billing.applyVerifiedCashierBillingProviderEvent({ ...paid, payloadHash: 'f'.repeat(64) }), error => error.code === 'CASHIER_BILLING_PROVIDER_EVENT_COLLISION');
    await assert.rejects(() => billing.applyVerifiedCashierBillingProviderEvent({ ...paid, providerEventId: randomUUID(), providerPaymentRef: randomUUID(), amountIqd: 1 }), error => error.code === 'CASHIER_BILLING_ORDER_NOT_PAYABLE');
    assert.equal((await pool.query('SELECT provider_payment_ref FROM cashier_billing_orders WHERE id=$1', [paid.orderId])).rows[0].provider_payment_ref, paid.providerPaymentRef);
    // The same verified webhook can be delivered after checkout TTL has elapsed.
    const redelivered = { ...paid, occurredAt: new Date(paid.occurredAt.getTime() + 86400000) };
    const retries = await Promise.all([billing.applyVerifiedCashierBillingProviderEvent(redelivered), billing.applyVerifiedCashierBillingProviderEvent(redelivered)]);
    assert.deepEqual(retries.map(result => result.status).sort(), ['applied', 'duplicate']);
    assert.equal(new Date((await pool.query('SELECT paid_at FROM cashier_billing_orders WHERE id=$1', [paid.orderId])).rows[0].paid_at).getTime(), paid.occurredAt.getTime());
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM cashier_billing_events WHERE provider_event_id=$1', [paid.providerEventId])).rows[0].count, 1);
    assert.equal((await billing.applyVerifiedCashierBillingProviderEvent(paid)).status, 'duplicate');
    assert.equal(state, 'paid_reconciliation_required');
    assert.equal(eventCount, 1);
  });
});
