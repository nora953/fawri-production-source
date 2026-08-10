#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The legacy settings contract used to require a product/coordinator handoff
# because per-area pricing was not represented in the server authority. After
# this lane adds that authority, keep the test fail-closed against regression
# while asserting the new canonical model instead.
TARGET = ROOT / "scripts/tests/server-authoritative-settings-contract.test.mjs"
text = TARGET.read_text(encoding="utf-8")

old = '''  assert.match(wrapper, /local UI preferences only/);\n  assert.match(wrapper, /COORDINATOR\\/PRODUCT MODEL HANDOFF REQUIRED/);\n  assert.match(wrapper, /Account-name and QR data do not have a secure server authority/);'''
new = '''  assert.match(wrapper, /local UI preferences only/);\n  assert.doesNotMatch(wrapper, /COORDINATOR\\/PRODUCT MODEL HANDOFF REQUIRED/);\n  assert.match(\n    wrapper,\n    /Delivery supports either one flat fee or different fees by area/,\n  );\n  assert.match(wrapper, /Account-name and QR data do not have a secure server authority/);'''
if old not in text:
    raise SystemExit("obsolete delivery handoff assertion target not found")
text = text.replace(old, new, 1)

old = '''  assert.match(page, /fee_iqd/);\n  assert.match(page, /free_delivery_threshold_iqd/);'''
new = '''  assert.match(page, /pricing_mode/);\n  assert.match(page, /area_rates/);\n  assert.match(page, /value="flat"/);\n  assert.match(page, /value="per_area"/);\n  assert.match(page, /fee_iqd/);\n  assert.match(page, /free_delivery_threshold_iqd/);'''
if old not in text:
    raise SystemExit("delivery mapping assertion target not found")
text = text.replace(old, new, 1)
TARGET.write_text(text, encoding="utf-8")

# The generated 0005 migration legitimately contains referential actions such
# as `ON DELETE cascade ON UPDATE no action`. The old word-level regex treated
# those clauses as destructive DML. Keep the safety gate, but apply it to the
# beginning of each generated SQL statement so only actual top-level DML/DDL
# destructive statements are rejected.
MIGRATION_TEST = ROOT / "scripts/tests/delivery-fee-per-area-migration-history.test.mjs"
text = MIGRATION_TEST.read_text(encoding="utf-8")
old = '''  assert.doesNotMatch(sql, /\\b(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\\b/i);'''
new = '''  for (const statement of sql.split("--> statement-breakpoint")) {\n    assert.doesNotMatch(\n      statement.trimStart(),\n      /^(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\\b/i,\n      "0005 must not contain top-level destructive/DML statements",\n    );\n  }'''
if old not in text:
    raise SystemExit("obsolete migration DML safety assertion target not found")
text = text.replace(old, new, 1)
MIGRATION_TEST.write_text(text, encoding="utf-8")

print("patch 6 complete")
