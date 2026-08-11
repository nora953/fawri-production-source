from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts"
text = path.read_text(encoding="utf-8")
marker = "payment_reconciliation_status: row.payment_reconciliation_status"
if marker not in text:
    old = '''    ...(row.payment_rejection_reason
      ? { payment_rejection_reason: row.payment_rejection_reason }
      : {}),
    ...(decision ? { last_payment_decision: decision } : {}),'''
    new = '''    ...(row.payment_rejection_reason
      ? { payment_rejection_reason: row.payment_rejection_reason }
      : {}),
    ...(row.payment_confirmation_source
      ? { payment_confirmation_source: row.payment_confirmation_source }
      : {}),
    ...(row.payment_provider ? { payment_provider: row.payment_provider } : {}),
    ...(row.payment_provider_transaction_ref
      ? { payment_provider_transaction_ref: row.payment_provider_transaction_ref }
      : {}),
    ...(row.payment_provider_last_event_id
      ? { payment_provider_last_event_id: row.payment_provider_last_event_id }
      : {}),
    payment_reconciliation_status: row.payment_reconciliation_status,
    ...(row.payment_conflict_code
      ? { payment_conflict_code: row.payment_conflict_code }
      : {}),
    ...(iso(row.payment_conflict_at)
      ? { payment_conflict_at: iso(row.payment_conflict_at)! }
      : {}),
    ...(iso(row.payment_conflict_resolved_at)
      ? { payment_conflict_resolved_at: iso(row.payment_conflict_resolved_at)! }
      : {}),
    ...(row.payment_conflict_resolved_by_account_id
      ? { payment_conflict_resolved_by: row.payment_conflict_resolved_by_account_id }
      : {}),
    ...(row.payment_conflict_resolution_note
      ? { payment_conflict_resolution_note: row.payment_conflict_resolution_note }
      : {}),
    ...(decision ? { last_payment_decision: decision } : {}),'''
    if old not in text:
        raise SystemExit("PATCH STOP: order mapping fragment missing")
    text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")
print("MERCHANT_PAYMENT_ORDER_MAPPING_FIX_APPLIED")
