#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, value): p(rel).write_text(value, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel)
    found = text.count(old)
    if found < count:
        raise SystemExit(f"{rel}: expected {count}, found {found}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

schema = "lib/db/src/schema/saas-billing.ts"
replace(
    schema,
    '''    providerPaymentUnique: uniqueIndex(
      "saas_billing_orders_provider_payment_unique",
    )
      .on(table.provider, table.providerPaymentRef)
      .where(sql`${table.providerPaymentRef} is not null`),
''',
    '''    providerPaymentUnique: uniqueIndex(
      "saas_billing_orders_provider_payment_unique",
    )
      .on(table.provider, table.providerPaymentRef)
      .where(sql`${table.providerPaymentRef} is not null`),
    merchantPendingUnique: uniqueIndex(
      "saas_billing_orders_merchant_pending_unique",
    )
      .on(table.merchantId)
      .where(sql`${table.status} = 'pending'`),
''',
)

service = "artifacts/api-server/src/services/saasBillingAuthority.ts"
replace(
    service,
    '''  return transaction(async (client) => {
    const existingResult = await client.query(
''',
    '''  return transaction(async (client) => {
    await client.query(
      `UPDATE saas_billing_orders
          SET status = 'expired', updated_at = $2
        WHERE merchant_id = $1
          AND status = 'pending'
          AND request_expires_at <= $2`,
      [merchantId, now],
    );
    const existingResult = await client.query(
''',
)
replace(
    service,
    '''    await validateCheckoutEligibility(
      client,
      merchantId,
      input.operation,
      input.plan,
      now,
    );
    const orderId = `saas-billing-${crypto.randomUUID()}`;
''',
    '''    const pendingResult = await client.query(
      `${ORDER_SELECT}
        WHERE merchant_id = $1 AND status = 'pending'
        LIMIT 2 FOR UPDATE`,
      [merchantId],
    );
    if (pendingResult.rows.length > 0) {
      const pending = orderFromRow(pendingResult.rows[0]);
      fail(
        "SAAS_BILLING_CHECKOUT_ALREADY_PENDING",
        "merchant already has a pending SaaS billing checkout",
        409,
        { order_id: pending.id },
      );
    }
    await validateCheckoutEligibility(
      client,
      merchantId,
      input.operation,
      input.plan,
      now,
    );
    const orderId = `saas-billing-${crypto.randomUUID()}`;
''',
)
replace(
    service,
    '''    if (duplicateEvent.rows.length > 0) {
      const order = await loadOrder(client, orderId, true);
''',
    '''    if (duplicateEvent.rows.length > 0) {
      if (String(duplicateEvent.rows[0].order_id) !== orderId) {
        fail(
          "SAAS_BILLING_PROVIDER_EVENT_COLLISION",
          "provider event identity was reused for another billing order",
          409,
        );
      }
      const order = await loadOrder(client, orderId, true);
''',
)
replace(
    service,
    '''    const paymentRef = requiredText(input.providerPaymentRef, 300);
    if (input.amountIqd !== order.amount_iqd) {
      await recordEvent(client, input, order.merchant_id, "rejected", null);
      fail(
        "SAAS_BILLING_AMOUNT_MISMATCH",
        "verified payment amount does not match the server billing order",
        409,
      );
    }
''',
    '''    const paymentRef = requiredText(input.providerPaymentRef, 300);
    const paymentCollision = await client.query(
      `SELECT id FROM saas_billing_orders
        WHERE provider = $1 AND provider_payment_ref = $2 AND id <> $3
        LIMIT 1 FOR UPDATE`,
      [input.provider, paymentRef, order.id],
    );
    if (paymentCollision.rows.length > 0) {
      fail(
        "SAAS_BILLING_PROVIDER_PAYMENT_COLLISION",
        "provider payment identity was already linked to another billing order",
        409,
      );
    }
    if (input.amountIqd !== order.amount_iqd) {
      await client.query(
        `UPDATE saas_billing_orders
            SET status = 'paid_reconciliation_required', provider_payment_ref = $2,
                paid_at = $3, updated_at = $3,
                metadata = metadata || $4::jsonb
          WHERE id = $1`,
        [
          order.id,
          paymentRef,
          input.occurredAt,
          JSON.stringify({
            reconciliation_code: "SAAS_BILLING_AMOUNT_MISMATCH",
            received_amount_iqd: input.amountIqd,
          }),
        ],
      );
      await recordEvent(client, input, order.merchant_id, "rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return {
        status: "reconciliation_required" as const,
        order: updated,
        reasonCode: "SAAS_BILLING_AMOUNT_MISMATCH",
      };
    }
''',
)
replace(
    service,
    '''export async function listMerchantSaasBillingOrders(
  merchantId: string,
): Promise<SaasBillingOrderRecord[]> {
  const database = await pool();
  const result = await database.query(
''',
    '''export async function listMerchantSaasBillingOrders(
  merchantId: string,
): Promise<SaasBillingOrderRecord[]> {
  const normalizedMerchantId = requiredText(merchantId, 180);
  const database = await pool();
  await database.query(
    `UPDATE saas_billing_orders
        SET status = 'expired', updated_at = NOW()
      WHERE merchant_id = $1
        AND status = 'pending'
        AND request_expires_at <= NOW()`,
    [normalizedMerchantId],
  );
  const result = await database.query(
''',
)
replace(
    service,
    '''    [requiredText(merchantId, 180)],
  );
''',
    '''    [normalizedMerchantId],
  );
''',
    1,
)

# Wrong verified amount is preserved as a paid reconciliation case, not rolled
# back into an apparently unpaid/pending order.
test_file = "artifacts/api-server/tests/saas-billing-authority.integration.test.ts"
text = read(test_file)
old = '''    await assert.rejects(
      () => applyVerifiedSaasBillingProviderEvent(
        successEvent({
          orderId: created.order.id,
          eventId: "provider-event-wrong-amount",
          paymentRef: "provider-payment-wrong-amount",
          amount: 1,
          at: new Date("2026-08-11T04:01:00.000Z"),
        }),
      ),
      (error: unknown) =>
        error instanceof SaasBillingAuthorityError &&
        error.code === "SAAS_BILLING_AMOUNT_MISMATCH",
    );
    const orders = await listMerchantSaasBillingOrders(merchantId);
    assert.equal(orders[0].amount_iqd, 25_000);
    assert.equal(orders[0].status, "pending");
    assert.equal(await getCurrentSubscriptionPostgres(merchantId), null);
'''
new = '''    const mismatch = await applyVerifiedSaasBillingProviderEvent(
      successEvent({
        orderId: created.order.id,
        eventId: "provider-event-wrong-amount",
        paymentRef: "provider-payment-wrong-amount",
        amount: 1,
        at: new Date("2026-08-11T04:01:00.000Z"),
      }),
    );
    assert.equal(mismatch.status, "reconciliation_required");
    assert.equal(mismatch.reasonCode, "SAAS_BILLING_AMOUNT_MISMATCH");
    const orders = await listMerchantSaasBillingOrders(merchantId);
    assert.equal(orders[0].amount_iqd, 25_000);
    assert.equal(orders[0].status, "paid_reconciliation_required");
    assert.equal(await getCurrentSubscriptionPostgres(merchantId), null);
'''
if old not in text:
    raise SystemExit("billing integration test: wrong-amount block not found")
text = text.replace(old, new, 1)
# SaasBillingAuthorityError is no longer needed by this test.
text = text.replace("  SaasBillingAuthorityError,\n", "")
write(test_file, text)

print("SaaS billing hardening patch applied")
