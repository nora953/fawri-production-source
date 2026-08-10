#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "artifacts/fawri/tests/saas-billing-ui.test.ts"
text = path.read_text(encoding="utf-8")
old = """  assert.doesNotMatch(panel, /paid:\\s*true/);\n  assert.doesNotMatch(panel, /amount_iqd\\s*:/);\n"""
new = """  assert.doesNotMatch(panel, /paid:\\s*true/);\n\n  const checkoutStart = panel.indexOf(\"fetch('/api/auth/billing/checkout'\");\n  const checkoutEnd = panel.indexOf('const data =', checkoutStart);\n  assert.ok(checkoutStart >= 0 && checkoutEnd > checkoutStart, 'checkout request block missing');\n  const checkoutRequest = panel.slice(checkoutStart, checkoutEnd);\n  assert.match(checkoutRequest, /operation/);\n  assert.match(checkoutRequest, /plan/);\n  assert.match(checkoutRequest, /idempotency_key/);\n  assert.doesNotMatch(checkoutRequest, /(?:amount_iqd|monthly_price_iqd|price_iqd)\\s*:/);\n  assert.match(panel, /order\\.amount_iqd\\.toLocaleString/);\n"""
if old not in text:
    raise SystemExit("STOP: expected SaaS billing UI amount-authority assertion was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("tightened SaaS billing UI checkout authority proof")
