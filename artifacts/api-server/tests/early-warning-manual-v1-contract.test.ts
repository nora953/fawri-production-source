import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { manualCommercialRelease } from "../src/services/manualCommercialRelease";

const root = path.dirname(fileURLToPath(import.meta.url));
const monitor = fs.readFileSync(
  path.resolve(root, "../src/services/earlyWarningIncidentMonitor.ts"),
  "utf8",
);

test("manual V1 monitor mode requires the exact owner-approved flag", () => {
  assert.equal(manualCommercialRelease({ FAWRI_V1_MANUAL_COMMERCE: "1" }), true);
  assert.equal(manualCommercialRelease({ FAWRI_V1_MANUAL_COMMERCE: "0" }), false);
  assert.equal(manualCommercialRelease({ FAWRI_V1_MANUAL_COMMERCE: "" }), false);
});

test("V1 monitor retains DB liveness and process alerts without global issuer SQL", () => {
  const manualStart = monitor.indexOf("if (manualCommercialRelease()) {");
  const fullProductStart = monitor.indexOf(
    'const snapshot = await loadEarlyWarningPostgresSnapshot("1h");',
  );
  assert.ok(manualStart > 0, "explicit V1-only branch required");
  assert.ok(fullProductStart > manualStart, "V1 guard must precede full-product snapshot");

  const bounded = monitor.slice(manualStart, fullProductStart);
  assert.match(bounded, /withAuthenticationTransaction\(async \(client\) => \{/);
  assert.match(bounded, /client\.query\("SELECT 1"\)/);
  assert.match(bounded, /evaluateRuntimeEarlyWarnings/);
  assert.match(bounded, /getHttpTelemetrySnapshot/);
  assert.match(bounded, /logger\.warn/);
  assert.match(bounded, /\n\s*return;\s*\}/);
  assert.doesNotMatch(bounded, /loadEarlyWarningPostgresSnapshot|syncEarlyWarningIncidentHistory/);
  assert.doesNotMatch(bounded, /GRANT|BYPASSRLS|row_security\s*=\s*off/);
});

test("the non-V1 full-product monitor path retains its former incident history", () => {
  assert.match(monitor, /const snapshot = await loadEarlyWarningPostgresSnapshot\("1h"\)/);
  assert.match(monitor, /await syncEarlyWarningIncidentHistory\(\{ incidents, window: "30d" \}\)/);
});
