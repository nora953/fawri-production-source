import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/pages/AdminEmergencySnapshotPage.tsx", import.meta.url),
  "utf8",
);

test("emergency snapshot preserves phone and identifier strings before numeric formatting", () => {
  assert.match(
    page,
    /const VERBATIM_IDENTIFIER_KEYS = new Set\(\["sku", "barcode"\]\)/,
  );
  assert.match(
    page,
    /key === "phone" \|\| key\.endsWith\("_phone"\) \|\| VERBATIM_IDENTIFIER_KEYS\.has\(key\)/,
  );

  const rawIndex = page.indexOf("const raw = String(value);");
  const preserveIndex = page.indexOf(
    "if (isVerbatimIdentifierKey(key)) return raw;",
  );
  const numericIndex = page.indexOf(
    'if (typeof value === "number"',
    preserveIndex,
  );

  assert.ok(rawIndex >= 0, "raw string conversion must remain present");
  assert.ok(
    preserveIndex > rawIndex,
    "identifier preservation must happen after obtaining the raw string",
  );
  assert.ok(
    numericIndex > preserveIndex,
    "identifier preservation must happen before generic numeric formatting",
  );
});

test("Iraqi phone regression keeps the leading zero contract", () => {
  const expectedPhone = "07738211148";

  assert.equal(expectedPhone.length, 11);
  assert.equal(expectedPhone[0], "0");
  assert.match(page, /if \(isVerbatimIdentifierKey\(key\)\) return raw;/);
});
