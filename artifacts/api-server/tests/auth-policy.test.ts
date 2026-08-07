import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTenantIsolation,
  buildGenericOtpResponse,
  canManageAdminAccount,
  canMerchantAccessPath,
  hasAdminPermission,
  normalizeAdminPermissions,
} from "../src/services/authPolicy";

test("pending merchants keep onboarding, me, sessions, and support but lose operations", () => {
  for (const requestPath of [
    "/api/auth/me",
    "/api/auth/onboarding",
    "/api/auth/support/tickets",
    "/api/auth/sessions/session-a",
  ]) {
    assert.deepEqual(canMerchantAccessPath({
      accountStatus: "pending_review",
      method: "GET",
      requestPath,
    }), { allowed: true });
  }
  for (const requestPath of [
    "/api/products",
    "/api/orders",
    "/api/conversations",
    "/api/meta/login",
  ]) {
    assert.deepEqual(canMerchantAccessPath({
      accountStatus: "pending_review",
      method: "GET",
      requestPath,
    }), { allowed: false, code: "MERCHANT_OPERATIONAL_ACCESS_PENDING" });
  }
});

test("suspended/rejected merchants fail closed and tenant IDs cannot be overridden", () => {
  assert.equal(canMerchantAccessPath({
    accountStatus: "suspended",
    method: "GET",
    requestPath: "/api/auth/support/tickets",
  }).allowed, false);
  assert.equal(canMerchantAccessPath({
    accountStatus: "rejected",
    method: "GET",
    requestPath: "/api/auth/me",
  }).allowed, false);
  assert.deepEqual(assertTenantIsolation("merchant-a", "merchant-b"), {
    allowed: false,
    code: "CROSS_TENANT_ACCESS_FORBIDDEN",
  });
  assert.deepEqual(assertTenantIsolation("merchant-a", "merchant-a"), { allowed: true });
});

test("assistant admins cannot self-escalate or receive synthetic manage-admins permission", () => {
  assert.equal(canManageAdminAccount({
    actorRole: "assistant_admin",
    targetRole: "assistant_admin",
    action: "permissions",
  }), false);
  assert.equal(canManageAdminAccount({
    actorRole: "owner_admin",
    targetRole: "owner_admin",
    action: "permissions",
  }), false);
  assert.equal(canManageAdminAccount({
    actorRole: "owner_admin",
    targetRole: "assistant_admin",
    action: "permissions",
  }), true);
  assert.equal(hasAdminPermission("assistant_admin", ["view_logs"], "manage_support"), false);
  assert.equal(hasAdminPermission("owner_admin", [], "manage_support"), true);
  assert.deepEqual(
    normalizeAdminPermissions(["view_logs", "manage_admins", "view_logs", "unknown"]),
    ["view_logs"],
  );
});

test("password-reset recovery responses do not expose account existence", () => {
  const existingAccountResponse = buildGenericOtpResponse(
    "password_reset",
    Date.parse("2026-08-07T00:00:00.000Z"),
  );
  const missingAccountResponse = buildGenericOtpResponse(
    "password_reset",
    Date.parse("2026-08-07T00:00:00.000Z"),
  );

  assert.deepEqual(
    Object.keys(existingAccountResponse).sort(),
    Object.keys(missingAccountResponse).sort(),
  );
  assert.equal(existingAccountResponse.ok, true);
  assert.equal(existingAccountResponse.message, missingAccountResponse.message);
  assert.equal(
    existingAccountResponse.retry_after_seconds,
    missingAccountResponse.retry_after_seconds,
  );
  assert.equal(existingAccountResponse.expires_at, missingAccountResponse.expires_at);
  assert.notEqual(existingAccountResponse.challenge_id, missingAccountResponse.challenge_id);
});
