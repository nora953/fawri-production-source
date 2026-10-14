import assert from 'node:assert/strict';
import { randomUUID, randomInt, generateKeyPairSync, createSign } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, {
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required',
  FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: 'required',
  FAWRI_SAAS_BILLING_PROVIDER: 'superqi_sandbox',
  FAWRI_SAAS_BILLING_PROVIDERS: 'superqi_sandbox',
  FAWRI_SUPERQI_SANDBOX_ENABLED: '1',
  FAWRI_SUPERQI_SANDBOX_USERNAME: 'synthetic-provider-user',
  FAWRI_SUPERQI_SANDBOX_PASSWORD: 'synthetic-provider-password',
  FAWRI_SUPERQI_SANDBOX_TERMINAL_ID: 'synthetic-terminal',
  FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL: 'https://merchant.example.invalid/api/auth/billing/providers/superqi/webhook',
  FAWRI_SUPERQI_SANDBOX_FINISH_URL: 'https://merchant.example.invalid/dashboard/subscription',
  FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64: Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
});
const { pool } = await import('@workspace/db');
const saas = await import('../src/services/saasBillingAuthority.ts');
const cashier = await import('../src/services/cashierBillingAuthority.ts');
const { handleSuperQiSandboxWebhook } = await import('../src/services/superQiSandboxWebhook.ts');
const { superQiWebhookSigningPayload } = await import('../src/services/superQiSandboxTransport.ts');

test('verified orphan SuperQi payment is retryable, not acknowledged as ignored', async () => {
  const requestId = randomUUID();
  const paymentId = `synthetic-orphan-${randomUUID()}`;
  const payload = {
    requestId, paymentId, status: 'SUCCESS', canceled: false,
    amount: 3900, confirmedAmount: 3900, currency: 'IQD',
    creationDate: '2026-08-11T13:30:00',
  };
  const signer = createSign('RSA-SHA256');
  signer.update(superQiWebhookSigningPayload(payload), 'utf8');
  signer.end();
  const signature = signer.sign(privateKey).toString('base64');
  let statusCalls = 0;
  const providerFetch = async (url, init) => {
    assert.equal(init.method, 'GET');
    assert.equal(url, `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${paymentId}/status`);
    statusCalls++;
    return { ok: true, status: 200, async json() { return payload; } };
  };
  await assert.rejects(
    () => handleSuperQiSandboxWebhook({ payload, signature, fetchImpl: providerFetch }),
    error => error.code === 'SUPERQI_SANDBOX_VERIFIED_PAYMENT_ORDER_NOT_FOUND' && error.status === 503,
  );
  assert.equal(statusCalls, 1);
});

test('unresolved SuperQi reservations remain pending after checkout expiry in SaaS and cashier', async () => {
  const merchantId = `unresolved-reservation-${randomUUID()}`;
  await pool.query(
    "INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",
    [merchantId, `+1994${String(randomInt(0, 100000000)).padStart(8, '0')}`],
  );
  try {
    await pool.query(
      "INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",
      [merchantId],
    );
    for (const [kind, table, list] of [
      ['saas', 'saas_billing_orders', saas.listMerchantSaasBillingOrders],
      ['cashier', 'cashier_billing_orders', cashier.listMerchantCashierBillingOrders],
    ]) {
      const orderId = `unresolved-${kind}-${randomUUID()}`;
      const expires = new Date(Date.now() - 60_000);
      const created = new Date(expires.getTime() - 60 * 60_000);
      if (kind === 'saas') {
        await pool.query(
          `INSERT INTO saas_billing_orders (id,merchant_id,operation,requested_plan,amount_iqd,currency,catalog_version,provider,status,idempotency_key,provider_checkout_ref,request_expires_at,metadata,created_at,updated_at)
           VALUES ($1,$2,'activate','silver',3900,'IQD','2026-08-v1','superqi_sandbox','pending',$3,NULL,$4,$5::jsonb,$6::timestamptz,$6::timestamptz)`,
          [orderId, merchantId, randomUUID(), expires, JSON.stringify({ provider_request_id: randomUUID() }), created],
        );
      } else {
        await pool.query(
          `INSERT INTO cashier_billing_orders (id,merchant_id,operation,current_seats,requested_seats,resulting_seats,unit_price_iqd,amount_iqd,currency,billing_period_start,billing_period_end,grace_duration_seconds,status,idempotency_key,provider,provider_checkout_ref,request_expires_at,metadata,created_at,updated_at)
           VALUES ($1,$2,'activate',0,1,1,3900,3900,'IQD',$6::timestamptz,$6::timestamptz+INTERVAL '1 month',604800,'pending',$3,'superqi_sandbox',NULL,$4,$5::jsonb,$6::timestamptz,$6::timestamptz)`,
          [orderId, merchantId, randomUUID(), expires, JSON.stringify({ provider_request_id: randomUUID() }), created],
        );
      }
      await list(merchantId);
      const result = await pool.query(`SELECT status FROM ${table} WHERE id=$1`, [orderId]);
      assert.equal(result.rows[0]?.status, 'pending', `${kind}: unresolved provider request must not silently expire`);
      await pool.query(`DELETE FROM ${table} WHERE id=$1`, [orderId]);
    }
  } finally {
    await pool.query('DELETE FROM accounts WHERE id=$1', [merchantId]);
  }
});

test('checkout retry preserves provider identity after external creation and SQL attachment failure', async t => {
  const ids = [], faults = [];
  t.after(async () => cleanupResources([
    ...faults.flatMap(({ name, table }) => [
      ['fixture trigger', () => pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`)],
      ['fixture function', () => pool.query(`DROP FUNCTION IF EXISTS ${name}()`)],
    ]),
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [ids])],
    ['pool', () => pool.end()],
  ]));
  for (const kind of ['saas', 'cashier']) await t.test(`${kind}: SQL rollback after fake provider creation cannot create a second untracked checkout on retry`, async kt => {
    const table = kind === 'saas' ? 'saas_billing_orders' : 'cashier_billing_orders';
    const id = `external-checkout-${randomUUID()}`;
    ids.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+1994${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')", [id]);
    const name = `audit_checkout_fault_${randomUUID().replaceAll('-', '')}`;
    faults.push({ name, table });
    await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic checkout attachment fault' USING ERRCODE='P0001'; END $$`);
    await pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE OF provider_checkout_ref ON ${table} FOR EACH ROW WHEN (NEW.provider_checkout_ref IS NOT NULL) EXECUTE FUNCTION ${name}()`);
    const creations = [];
    let statusConfirmations = 0;
    const providerFetch = async (url, init) => {
      // This function replaces fetch completely; no network request occurs.
      assert.equal(new URL(url).hostname, 'uat-sandbox-3ds-api.qi.iq');
      if (init.method === 'GET') {
        statusConfirmations++;
        const original = creations[0];
        assert.equal(url, `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${original.paymentId}/status`);
        return { ok: true, status: 200, async json() { return { requestId: original.requestId, paymentId: original.paymentId, status: 'SUCCESS', canceled: false, amount: original.amount, confirmedAmount: original.amount, currency: 'IQD', creationDate: '2026-08-11T13:30:00' }; } };
      }
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      const inTransaction = (await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname=current_database() AND state='idle in transaction' AND query LIKE $1", [`%INSERT INTO ${table}%`])).rows[0].count;
      assert.equal(inTransaction, 0, 'external provider call must occur after local reservation transaction commits');
      const creation = { requestId: body.requestId, orderId: body.additionalInfo.fawriOrderId, amount: body.amount, paymentId: `synthetic-${kind}-payment-${creations.length + 1}` };
      creations.push(creation);
      return { ok: true, status: 200, async json() { return { requestId: creation.requestId, paymentId: creation.paymentId, status: 'CREATED', canceled: false, amount: body.amount, currency: 'IQD', creationDate: '2026-08-11T13:30:00', formUrl: `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${creation.paymentId}` }; } };
    };
    const input = { merchantId: id, operation: 'activate', idempotencyKey: randomUUID(), provider: 'superqi_sandbox', providerFetch, ...(kind === 'saas' ? { plan: 'silver' } : { requestedSeats: 1 }) };
    const checkout = kind === 'saas' ? saas.createSaasBillingCheckout : cashier.createCashierBillingCheckout;
    await assert.rejects(() => checkout(input), error => error.code === 'P0001');
    assert.equal(creations.length, 1);
    const firstOrderRows = (await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE merchant_id=$1 AND idempotency_key=$2`, [id, input.idempotencyKey])).rows[0].count;
    await pool.query(`DROP TRIGGER ${name} ON ${table}`);
    await pool.query(`DROP FUNCTION ${name}()`);
    const original = creations[0];
    await assert.rejects(
      () => checkout(input),
      error => error.status === 503 && /INCOMPLETE/.test(String(error.code)),
      'same-key retry must fail closed until provider checkout reference is reconciled',
    );
    const persisted = await pool.query(
      `SELECT id, status, provider_checkout_ref, metadata FROM ${table} WHERE merchant_id=$1 AND idempotency_key=$2`,
      [id, input.idempotencyKey],
    );
    assert.equal(persisted.rows.length, 1, 'local reservation must survive SQL attachment failure');
    assert.equal(persisted.rows[0].id, original.orderId, 'original order identity must remain stable');
    assert.equal(persisted.rows[0].metadata.provider_request_id, original.requestId, 'provider request ID must remain durable');
    assert.equal(creations.length, 1, 'retry must not issue a second remote payment');
    const payload = { requestId: original.requestId, paymentId: original.paymentId, status: 'SUCCESS', canceled: false, amount: original.amount, confirmedAmount: original.amount, currency: 'IQD', creationDate: '2026-08-11T13:30:00' };
    const signer = createSign('RSA-SHA256');
    signer.update(superQiWebhookSigningPayload(payload), 'utf8'); signer.end();
    let orphan;
    try { orphan = await handleSuperQiSandboxWebhook({ payload, signature: signer.sign(privateKey).toString('base64'), fetchImpl: providerFetch }); }
    catch (error) { assert.ok(error.status >= 500, 'only retryable server rejection may preserve orphan payment work'); orphan = { status: 'retryable_failure', httpStatus: error.status }; }
    assert.equal(statusConfirmations, 1, 'orphan webhook must use the injected status transport, never default fetch');

    console.log('BILLING_EXTERNAL_CHECKOUT_ROLLBACK ' + JSON.stringify({
      kind, firstOrderRows, fakeProviderCreations: creations.length,
      requestIdReused: true, orderIdReused: true, retryOrderExists: true,
      openTransactionAtProviderCall: false, orphanWebhook: orphan,
    }));
    await kt.test('external identity is durable and same-key retry creates no duplicate', () => {
      assert.equal(firstOrderRows, 1);
      assert.equal(creations.length, 1);
    });
    await kt.test('signed status-confirmed provider payment is processed or retryably rejected', () => {
      assert.ok(orphan.status === 'processed' || orphan.status === 'retryable_failure');
    });
  });
});
