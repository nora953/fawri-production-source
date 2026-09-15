import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(
  fileURLToPath(
    new URL("../src/services/postgresEmergencyReadAccessAuthority.ts", import.meta.url),
  ),
  "utf8",
);

test("duration expiry records the policy cutoff and repairs legacy notice times", () => {
  assert.match(
    source,
    /SET status = 'expired', ended_at = expires_at,/,
  );
  assert.match(
    source,
    /eventType: "emergency_duration_expiry_time_reconciled"/,
  );
  assert.match(
    source,
    /UPDATE emergency_merchant_notices n[\s\S]*SET ended_at = r\.expires_at/,
  );
});
