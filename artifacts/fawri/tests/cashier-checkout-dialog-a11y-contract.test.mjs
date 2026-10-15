import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/components/cashier/CashierCheckoutModal.tsx", import.meta.url),
  "utf8",
);

test("cashier checkout dialog traps tab focus and restores the opener", () => {
  assert.match(source, /const dialogRef = useRef<HTMLElement>\(null\)/);
  assert.match(source, /const restoreFocusRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(source, /event\.key === 'Tab'/);
  assert.match(source, /restoreFocusRef\.current\?\.focus\(\)/);
  assert.match(source, /ref=\{dialogRef\}/);
  assert.match(source, /tabIndex=\{-1\}/);
});

test("insufficient cash is associated with the tender input and announced", () => {
  assert.match(source, /aria-invalid=\{insufficient\}/);
  assert.match(source, /aria-describedby=\{insufficient \? "cashier-cash-insufficient" : undefined\}/);
  assert.match(source, /id="cashier-cash-insufficient" role="alert"/);
});
