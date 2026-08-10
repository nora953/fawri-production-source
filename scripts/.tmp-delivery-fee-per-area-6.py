#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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
print("patch 6 complete")
