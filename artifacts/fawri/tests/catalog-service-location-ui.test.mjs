import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const editor = fs.readFileSync(new URL("../src/components/catalog/CatalogItemTypeEditor.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx", import.meta.url), "utf8");

test("multi-location service exposes concrete choices", () => {
  assert.match(editor, /service_location_modes/);
  assert.match(editor, /locationFlexibleHint/);
  assert.match(editor, /aria-pressed=\{selected\}/);
});

test("availability switch no longer uses justify-between", () => {
  const start = page.indexOf("{copy.availableForSale}");
  assert.ok(start > 0);
  const block = page.slice(Math.max(0, start - 220), start + 420);
  assert.match(block, /flex items-start gap-3 rounded-2xl border/);
  assert.doesNotMatch(block, /justify-between/);
});
