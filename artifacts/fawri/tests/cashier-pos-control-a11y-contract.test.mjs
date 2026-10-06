import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const posSource = fs.readFileSync(new URL("../src/pages/CashierPosPage.tsx", import.meta.url), "utf8");
const copySource = fs.readFileSync(new URL("../src/lib/translations/features/lib/cashierPosEnhancementCopy.ts", import.meta.url), "utf8");

test("cashier POS symbol-only controls have localized accessible names", () => {
  for (const key of ["decreaseQuantity", "increaseQuantity", "previousCartItems", "nextCartItems"]) {
    assert.match(posSource, new RegExp(`aria-label=\\{extra\\.${key}\\}`));
    assert.equal((copySource.match(new RegExp(`\\b${key}: `, "g")) || []).length, 3);
  }
});

test("cashier quote failures are announced", () => {
  assert.match(posSource, /quoteError \? <div role="alert"/);
});
