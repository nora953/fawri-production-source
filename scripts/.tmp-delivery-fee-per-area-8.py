#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver.ts"
text = TARGET.read_text(encoding="utf-8")

old = '''    const weight = containsAny(normalized, WEIGHT_TERMS);\n    const dimensions = containsAny(normalized, DIMENSION_TERMS);\n    const physicalIntent = weight || dimensions;\n    const kinds = {\n      delivery: containsAny(normalized, DELIVERY_TERMS),\n      payment: containsAny(normalized, PAYMENT_TERMS),\n      business: containsAny(normalized, BUSINESS_TERMS),\n      price: !physicalIntent && containsAny(normalized, PRICE_TERMS),'''
new = '''    const weight = containsAny(normalized, WEIGHT_TERMS);\n    const dimensions = containsAny(normalized, DIMENSION_TERMS);\n    const physicalIntent = weight || dimensions;\n    const deliveryIntent = containsAny(normalized, DELIVERY_TERMS);\n    const kinds = {\n      delivery: deliveryIntent,\n      payment: containsAny(normalized, PAYMENT_TERMS),\n      business: containsAny(normalized, BUSINESS_TERMS),\n      // Generic price words such as Arabic \"شكد\" or English \"cost\" are\n      // modifiers of a delivery-fee question when a delivery term is present.\n      // Do not reinterpret the same sentence as a product-price request.\n      price:\n        !physicalIntent &&\n        !deliveryIntent &&\n        containsAny(normalized, PRICE_TERMS),'''

if old not in text:
    raise SystemExit("delivery Knowledge intent classifier target not found")
TARGET.write_text(text.replace(old, new, 1), encoding="utf-8")
print("patch 8 complete")
