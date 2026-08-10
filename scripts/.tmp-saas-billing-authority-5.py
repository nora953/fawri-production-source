from pathlib import Path

path = Path("artifacts/api-server/tests/subscription-service-guarantee.test.ts")
text = path.read_text(encoding="utf-8")
old = '  assert.match(queries[0].statement, /WHERE merchant_id = \\$1 AND id = \\$2/);\n  assert.deepEqual(queries[0].values, ["merchant-a", "subscription-a"]);\n'
new = '''  assert.match(\n    queries[0].statement,\n    /WHERE subscription\\.merchant_id = \\$1 AND subscription\\.id = \\$2/,\n  );\n  assert.match(queries[0].statement, /LEFT JOIN saas_entitlement_applications AS application/);\n  assert.match(queries[0].statement, /LEFT JOIN saas_billing_orders AS billing_order/);\n  assert.match(queries[0].statement, /application\\.applied_at = subscription\\.starts_at/);\n  assert.deepEqual(queries[0].values, ["merchant-a", "subscription-a"]);\n'''
if old not in text:
    raise SystemExit("STOP: expected legacy guarantee SQL assertion was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
