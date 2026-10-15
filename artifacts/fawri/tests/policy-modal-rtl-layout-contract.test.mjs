import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, "..", "src", "components", "PolicyModal.tsx"),
  "utf8",
);

test("policy modal keeps direction-aware header layout", () => {
  assert.match(source, /dir=\{isRTL \? 'rtl' : 'ltr'\}/);

  assert.ok(
    source.includes(
      "closeButtonClassName={isRTL ? 'left-4 right-auto' : 'left-auto right-4'}",
    ),
    "RTL close button must stay on the left and LTR close button on the right",
  );

  assert.ok(
    source.includes('<div className="min-w-0 text-start">'),
    "policy title and description must follow document direction",
  );

  assert.ok(
    source.includes(
      'inline-flex shrink-0 self-start rounded-full border bg-background p-1 shadow-sm',
    ),
    "policy/terms switch must stay at inline start",
  );
});

test("policy modal does not restore the redundant footer close button", () => {
  assert.doesNotMatch(source, /\{t\.close\}/);
  assert.doesNotMatch(
    source,
    /className="h-12 w-full rounded-2xl text-base font-extrabold shadow-sm"/,
  );
});
