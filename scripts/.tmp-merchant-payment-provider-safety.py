from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "artifacts/api-server/src/services/postgresOrderPaymentProviderAuthority.ts"
text = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str, marker: str) -> None:
    global text
    if marker in text:
        return
    if old not in text:
        raise SystemExit(f"SAFETY PATCH STOP: missing fragment for {marker}")
    text = text.replace(old, new, 1)


replace_once(
    '''type ProviderEventRow = {\n  id: string;\n  outcome: VerifiedProviderPaymentOutcome;\n  resulting_action: string;\n};''',
    '''type ProviderEventRow = {\n  id: string;\n  order_id: string;\n  outcome: VerifiedProviderPaymentOutcome;\n  amount_iqd: number;\n  payload_sha256: string;\n  resulting_action: string;\n};''',
    "payload_sha256: string;\n  resulting_action",
)
replace_once(
    '''    `SELECT id, outcome::text AS outcome, resulting_action\n       FROM order_payment_provider_events''',
    '''    `SELECT id, order_id, outcome::text AS outcome, amount_iqd,\n            payload_sha256, resulting_action\n       FROM order_payment_provider_events''',
    "SELECT id, order_id, outcome::text AS outcome",
)
replace_once(
    '''    if (existing) {\n      const order = await lockOrder(client, merchantId, orderId);\n      return {\n        deduplicated: true,''',
    '''    if (existing) {\n      if (\n        existing.order_id !== orderId ||\n        existing.outcome !== input.outcome ||\n        Number(existing.amount_iqd) !== amount ||\n        existing.payload_sha256 !== hash\n      ) {\n        throw new OrderOperationError(\n          "ORDER_PAYMENT_PROVIDER_EVENT_COLLISION",\n          "provider event identifier was reused with conflicting payment evidence",\n          409,\n        );\n      }\n      const order = await lockOrder(client, merchantId, orderId);\n      return {\n        deduplicated: true,''',
    "ORDER_PAYMENT_PROVIDER_EVENT_COLLISION",
)
replace_once(
    '''  if (order.payment_method === "cash_on_delivery") {\n    return "provider_evidence_recorded";\n  }\n\n  await input.client.query(''',
    '''  if (order.payment_method === "cash_on_delivery") {\n    await markConflict({\n      client: input.client,\n      order,\n      provider: input.provider,\n      eventId: input.eventId,\n      transactionRef: input.transactionRef,\n      code: "PROVIDER_PAYMENT_ON_CASH_ORDER",\n    });\n    return "payment_conflict";\n  }\n\n  if (\n    order.status !== "pending_confirmation" &&\n    order.status !== "waiting_customer_approval"\n  ) {\n    await markConflict({\n      client: input.client,\n      order,\n      provider: input.provider,\n      eventId: input.eventId,\n      transactionRef: input.transactionRef,\n      code: "PROVIDER_FAILURE_ORDER_STATE_CONFLICT",\n    });\n    return "payment_conflict";\n  }\n\n  await input.client.query(''',
    "PROVIDER_FAILURE_ORDER_STATE_CONFLICT",
)

PATH.write_text(text, encoding="utf-8")
print("MERCHANT_PAYMENT_PROVIDER_SAFETY_PATCH_APPLIED")
