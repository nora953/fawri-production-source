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

test('verified payment SQL failure retains reconciliation evidence and supports safe retry', async t => {
  const merchantId = `sql-fault-${randomUUID()}`;
  // Identifiers come only from generated hex; no external SQL interpolation.
  const identifier = `audit_fault_${randomUUID().replaceAll('-', '')}`;
  async function removeFault() {
    await pool.query(`DROP TRIGGER IF EXISTS ${identifier} ON saas_entitlement_applications`);
    await pool.query(`DROP FUNCTION IF EXISTS ${identifier}()`);
  }
  t.after(async () => cleanupResources([
    ['fault trigger', () => pool.query(`DROP TRIGGER IF EXISTS ${identifier} ON saas_entitlement_applications`)],
    ['fault function', () => pool.query(`DROP FUNCTION IF EXISTS ${identifier}()`)],
    ['fixture account', () => pool.query('DELETE FROM accounts WHERE id=$1', [merchantId])],
    ['pool', () => pool.end()],
  ]));
  await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [merchantId, `+1999${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
  await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [merchantId]);
  const checkout = await billing.createSaasBillingCheckout({ merchantId, operation: 'activate', plan: 'silver', idempotencyKey: randomUUID() });
  await pool.query(`CREATE FUNCTION ${identifier}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit SQL fault' USING ERRCODE='P0001'; END $$`);
  await pool.query(`CREATE TRIGGER ${identifier} BEFORE INSERT ON saas_entitlement_applications FOR EACH ROW EXECUTE FUNCTION ${identifier}()`);
  const event = { provider: 'test_fake', providerEventId: randomUUID(), orderId: checkout.order.id, eventType: 'payment_succeeded', signatureVerified: true, payloadHash: 'b'.repeat(64), occurredAt: new Date(), amountIqd: checkout.order.amount_iqd, currency: 'IQD', providerPaymentRef: randomUUID() };
  let errorCode;
  try { await billing.applyVerifiedSaasBillingProviderEvent(event); }
  catch (error) { errorCode = error.code; }
  assert.equal(errorCode, 'P0001', 'fixture must reach injected SQL fault');
  const state = (await pool.query('SELECT status FROM saas_billing_orders WHERE id=$1', [checkout.order.id])).rows[0].status;
  const events = (await pool.query('SELECT count(*)::int AS count FROM saas_billing_events WHERE provider_event_id=$1', [event.providerEventId])).rows[0].count;
  const applications = (await pool.query('SELECT count(*)::int AS count FROM saas_entitlement_applications WHERE order_id=$1', [checkout.order.id])).rows[0].count;
  const subscriptions = (await pool.query('SELECT count(*)::int AS count FROM subscriptions WHERE merchant_id=$1', [merchantId])).rows[0].count;
  console.log('BILLING_SQL_FAULT_STATE ' + JSON.stringify({ errorCode, state, events, applications, subscriptions }));
  await removeFault();
  await t.test('failed transaction rolls back entitlement and exact event retry applies once', async () => {
    assert.equal(applications, 0);
    assert.equal(subscriptions, 0);
    await assert.rejects(() => billing.applyVerifiedSaasBillingProviderEvent({ ...event, payloadHash: 'f'.repeat(64) }), error => error.code === 'SAAS_BILLING_PROVIDER_EVENT_COLLISION');
    await assert.rejects(() => billing.applyVerifiedSaasBillingProviderEvent({ ...event, providerEventId: randomUUID(), providerPaymentRef: randomUUID(), amountIqd: 1 }), error => error.code === 'SAAS_BILLING_ORDER_NOT_PAYABLE');
    assert.equal((await pool.query('SELECT provider_payment_ref FROM saas_billing_orders WHERE id=$1', [event.orderId])).rows[0].provider_payment_ref, event.providerPaymentRef);
    // The same verified webhook can be delivered after checkout TTL has elapsed.
    const redelivered = { ...event, occurredAt: new Date(event.occurredAt.getTime() + 86400000) };
    const retries = await Promise.all([billing.applyVerifiedSaasBillingProviderEvent(redelivered), billing.applyVerifiedSaasBillingProviderEvent(redelivered)]);
    assert.deepEqual(retries.map(result => result.status).sort(), ['applied', 'duplicate']);
    assert.equal(new Date((await pool.query('SELECT paid_at FROM saas_billing_orders WHERE id=$1', [event.orderId])).rows[0].paid_at).getTime(), event.occurredAt.getTime());
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_billing_events WHERE provider_event_id=$1', [event.providerEventId])).rows[0].count, 1);
    assert.equal((await billing.applyVerifiedSaasBillingProviderEvent(event)).status, 'duplicate');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas_entitlement_applications WHERE order_id=$1', [checkout.order.id])).rows[0].count, 1);
  });
  await t.test('received verified payment survives SQL error as durable reconciliation work', () => {
    assert.equal(state, 'paid_reconciliation_required');
    assert.equal(events, 1);
  });
});
