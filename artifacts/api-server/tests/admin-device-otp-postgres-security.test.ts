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
const commonPath = path.resolve(
  current,
  "../src/routes/auth-route-common.ts",
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

test("owner device OTP issue and revoke stay on the PostgreSQL authority", () => {
  const source = fs.readFileSync(commonPath, "utf8");
  assert.match(source, /legacyAdminRecovery = purpose === "admin_recovery"/);
  assert.match(source, /issueMerchantOtpChallengeAuthoritative\(\{/);
  assert.match(source, /revokeMerchantOtpChallengeAuthoritative\(issued\.challengeId\)/);
  assert.equal(
    /purpose === "admin_device_verification"[\s\S]{0,180}authSecurityStore\.issueOtpChallenge/.test(source),
    false,
    "admin device OTP must never be issued from the legacy security store",
  );
});
