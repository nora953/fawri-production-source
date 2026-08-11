from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts"
text = path.read_text(encoding="utf-8")
old = "payment_reconciliation_status = CASE WHEN $8::boolean THEN 'reconciliation_required' ELSE 'clear' END,"
new = "payment_reconciliation_status = (CASE WHEN $8::boolean THEN 'reconciliation_required' ELSE 'clear' END)::payment_reconciliation_status,"
if new in text:
    print("MERCHANT_PAYMENT_ENUM_CAST_ALREADY_APPLIED")
elif old in text:
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("MERCHANT_PAYMENT_ENUM_CAST_APPLIED")
else:
    raise SystemExit("PATCH STOP: payment reconciliation CASE expression not found")
