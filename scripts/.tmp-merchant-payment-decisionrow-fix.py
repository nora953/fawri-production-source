from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts"
text = path.read_text(encoding="utf-8")
old = '  outcome: "paid" | "failed";\n  previous_order_status:'
new = '  outcome: "paid" | "failed";\n  confirmation_source: "merchant_confirmed" | "provider_verified" | null;\n  previous_order_status:'

if new in text:
    print("MERCHANT_PAYMENT_DECISIONROW_FIX_ALREADY_APPLIED")
elif old not in text:
    raise SystemExit("PATCH STOP: DecisionRow source fragment missing")
else:
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("MERCHANT_PAYMENT_DECISIONROW_FIX_APPLIED")
