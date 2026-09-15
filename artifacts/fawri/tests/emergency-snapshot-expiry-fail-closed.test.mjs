import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/pages/AdminEmergencySnapshotPage.tsx", import.meta.url),
  "utf8",
);

test("silent snapshot refresh failures clear previously displayed emergency data", () => {
  assert.doesNotMatch(page, /if \(!silent\) setError\(true\)/);

  assert.match(
    page,
    /catch \(loadError\) \{[\s\S]*?setSnapshot\(null\);[\s\S]*?setError\(true\);[\s\S]*?\} finally \{/,
  );
});

test("local emergency expiry fails closed without waiting for server polling", () => {
  assert.match(
    page,
    /useEffect\(\(\) => \{\s*if \(!snapshot \|\| remainingSeconds > 0\) return;\s*setSnapshot\(null\);\s*setError\(true\);\s*\}, \[remainingSeconds, snapshot\]\);/,
  );

  const expiryEffect = page.indexOf(
    "if (!snapshot || remainingSeconds > 0) return;",
  );
  const dataRender = page.indexOf(
    '<DataGrid data={snapshot.merchant}',
  );

  assert.ok(expiryEffect >= 0);
  assert.ok(dataRender > expiryEffect);
});
