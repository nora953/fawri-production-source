import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(
  current,
  "../src/routes/auth-admin-device-otp-pg-routes.ts",
);
const servicePath = path.resolve(
  current,
  "../src/services/postgresAdminSecurityAuthority.ts",
);

test("owner device OTP endpoints only accept a pre-existing login-created device", () => {
  const routeSource = fs.readFileSync(routePath, "utf8");
  const serviceSource = fs.readFileSync(servicePath, "utf8");

  assert.equal(
    routeSource.includes("registerAdminDeviceAuthoritative"),
    false,
    "unauthenticated OTP resend/verify must never create a device record",
  );
  assert.match(
    routeSource,
    /findAdminDeviceForVerificationPostgres\(\{[\s\S]*accountId:[\s\S]*deviceRecordId:[\s\S]*deviceId,/,
  );
  assert.match(
    serviceSource,
    /id = \$1 AND account_id = \$2 AND kind = 'admin' AND device_fingerprint_hash = \$3/,
    "verification lookup must bind record id, owner account and raw device identity",
  );
});
