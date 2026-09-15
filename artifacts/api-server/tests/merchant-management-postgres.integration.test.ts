import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "merchant management PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "merchant management PostgreSQL proof only permits the fawri_ci database",
);

const PASSWORD_SALT = "merchant-management-proof-password-salt";
const AUTH_SECRET = "merchant-management-proof-security-secret-at-least-32-characters";
const ownerId = "admin-merchant-management-owner";
const assistantId = "admin-merchant-management-assistant";
const merchantId = "merchant-management-proof";
const ownerPhone = "07987111001";
const assistantPhone = "07987111002";
const merchantPhone = "07987111003";
const ownerPassword = "OwnerManagement9!";
const assistantPassword = "AssistantManagement9!";
const merchantPassword = "MerchantManagement9!";
const productId = "product-management-proof";
const subscriptionId = "subscription-management-proof";

function cookie(name: string, token: string): string {
  return `${name}=${token}`;
}

async function body(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function assertNoLegacyFiles(dataDirectory: string): void {
  assert.equal(fs.existsSync(path.join(dataDirectory, "merchants.json")), false);
  assert.equal(fs.existsSync(path.join(dataDirectory, "auth-security.json")), false);
}

test("merchant management and deletion are PostgreSQL authoritative end to end", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-merchant-management-pg-proof-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_PASSWORD_SALT: PASSWORD_SALT,
    FAWRI_AUTH_SECURITY_SECRET: AUTH_SECRET,
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
  });

  const [
    { pool },
    { hashPassword },
    { authPostgresSessionAuthority },
    { ADMIN_SESSION_COOKIE },
    { default: express },
    { default: cookieParser },
    { default: authSecurityRouter },
  ] = await Promise.all([
    import("@workspace/db"),
    import("../src/services/authPasswordService.js"),
    import("../src/services/authPostgresSessionAuthority.js"),
    import("../src/middleware/authSession.js"),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/auth-security.js"),
  ]);

  async function cleanup(): Promise<void> {
    await pool.query(
      `DELETE FROM merchant_deletion_requests
        WHERE merchant_id_snapshot = $1
           OR requested_by_admin_id_snapshot = ANY($2::text[])`,
      [merchantId, [ownerId, assistantId]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM audit_events
        WHERE entity_id = $1
           OR merchant_id = $1
           OR actor_account_id = ANY($2::text[])`,
      [merchantId, [ownerId, assistantId]],
    ).catch(() => undefined);
    await pool.query(
      "DELETE FROM accounts WHERE id = ANY($1::text[]) OR phone = ANY($2::text[])",
      [[merchantId, ownerId, assistantId], [merchantPhone, ownerPhone, assistantPhone]],
    ).catch(() => undefined);
  }

  await cleanup();

  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES
       ($1, 'admin', $2, $3, 'active', 'en', true, now(), now(), now()),
       ($4, 'admin', $5, $6, 'active', 'en', true, now(), now(), now()),
       ($7, 'merchant', $8, $9, 'active', 'ar', true, now(), now(), now())`,
    [
      ownerId,
      ownerPhone,
      hashPassword(ownerPassword),
      assistantId,
      assistantPhone,
      hashPassword(assistantPassword),
      merchantId,
      merchantPhone,
      hashPassword(merchantPassword),
    ],
  );
  await pool.query(
    `INSERT INTO admin_profiles (
       id, account_id, profile_kind, display_name, role,
       enabled, must_change_password, created_at, updated_at
     ) VALUES
       ($1, $1, 'admin', 'Lifecycle Owner', 'owner_admin', true, false, now(), now()),
       ($2, $2, 'admin', 'Lifecycle Assistant', 'assistant_admin', true, false, now(), now())`,
    [ownerId, assistantId],
  );
  await pool.query(
    `INSERT INTO admin_permissions (admin_id, permission, granted_by_admin_id)
     VALUES
       ($1, 'view_merchants', $2),
       ($1, 'manage_merchant_status', $2),
       ($1, 'manage_channels', $2)`,
    [assistantId, ownerId],
  );
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       requested_plan, warning_stage, products_read_only, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'Merchant Owner PII', 'Merchant Store PII', 'retail',
       'pending_activation', 'pending_review', 'pending_review', 'eligible', 'direct',
       'silver', 0, false, now(), now()
     )`,
    [merchantId],
  );
  await pool.query(
    `INSERT INTO subscriptions (
       id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
       base_reply_limit, base_replies_used, base_replies_remaining,
       addon_replies_remaining, auto_reply_enabled, starts_at, expires_at,
       version, metadata, created_at, updated_at
     ) VALUES (
       $1, $2, 'silver', 'active', 25000, 15,
       4000, 0, 4000,
       0, true, now() - interval '1 day', now() + interval '30 days',
       1, '{"sensitive":"remove"}'::jsonb, now(), now()
     )`,
    [subscriptionId, merchantId],
  );
  await pool.query(
    `INSERT INTO products (
       id, merchant_id, name, original_price_iqd, current_price_iqd,
       quantity, low_stock_threshold, version, status, allow_fawri_reply,
       metadata, created_at, updated_at
     ) VALUES (
       $1, $2, 'Sensitive Product Name', 1000, 1000,
       4, 0, 1, 'available', true,
       '{"sensitive":"remove"}'::jsonb, now(), now()
     )`,
    [productId, merchantId],
  );

  const ownerSession = await authPostgresSessionAuthority.issueSession({
    accountId: ownerId,
    accountKind: "admin",
    tenantId: "fawri-admin",
    adminRole: "owner_admin",
    permissions: [],
  });
  const assistantSession = await authPostgresSessionAuthority.issueSession({
    accountId: assistantId,
    accountKind: "admin",
    tenantId: "fawri-admin",
    adminRole: "assistant_admin",
    permissions: ["view_merchants", "manage_merchant_status", "manage_channels"],
  });

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", authSecurityRouter);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const ownerCookie = cookie(ADMIN_SESSION_COOKIE, ownerSession.token);
  const assistantCookie = cookie(ADMIN_SESSION_COOKIE, assistantSession.token);

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  assertNoLegacyFiles(dataDirectory);

  const listed = await fetch(`${baseUrl}/api/auth/merchants`, {
    headers: { Cookie: assistantCookie },
  });
  assert.equal(listed.status, 200);
  assert.equal((await body(listed)).merchants.some((item: any) => item.id === merchantId), true);

  const approved = await fetch(`${baseUrl}/api/auth/merchants/${merchantId}/status`, {
    method: "PATCH",
    headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(approved.status, 200);
  assert.equal((await body(approved)).merchant.status, "approved");

  const merchantSession = await authPostgresSessionAuthority.issueSession({
    accountId: merchantId,
    accountKind: "merchant",
    tenantId: merchantId,
  });

  const noteSaved = await fetch(`${baseUrl}/api/auth/merchants/${merchantId}/note`, {
    method: "PUT",
    headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ note: "Sensitive internal merchant note" }),
  });
  assert.equal(noteSaved.status, 200);
  assert.equal((await body(noteSaved)).note, "Sensitive internal merchant note");

  const channelOverride = await fetch(
    `${baseUrl}/api/auth/merchants/${merchantId}/channels/messenger`,
    {
      method: "PATCH",
      headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "connected" }),
    },
  );
  assert.equal(channelOverride.status, 200);

  const suspended = await fetch(`${baseUrl}/api/auth/merchants/${merchantId}/status`, {
    method: "PATCH",
    headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "suspended", reason: "Policy review" }),
  });
  assert.equal(suspended.status, 200);
  assert.equal((await body(suspended)).merchant.status, "suspended");

  const sessionRow = await pool.query<{ status: string }>(
    "SELECT status FROM account_sessions WHERE id = $1",
    [merchantSession.session.id],
  );
  assert.equal(sessionRow.rows[0]?.status, "revoked");
  const suspendedSubscription = await pool.query<{
    status: string;
    auto_reply_enabled: boolean;
  }>(
    "SELECT status, auto_reply_enabled FROM subscriptions WHERE id = $1",
    [subscriptionId],
  );
  assert.equal(suspendedSubscription.rows[0]?.status, "suspended");
  assert.equal(suspendedSubscription.rows[0]?.auto_reply_enabled, false);

  const firstRequestResponse = await fetch(
    `${baseUrl}/api/auth/merchants/${merchantId}/deletion-requests`,
    {
      method: "POST",
      headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "policy_violation",
        details: "First review request with merchant PII context",
      }),
    },
  );
  assert.equal(firstRequestResponse.status, 201);
  const firstRequest = (await body(firstRequestResponse)).deletion_request;
  assert.match(firstRequest.id, /^merchant-deletion-/);

  const rejected = await fetch(
    `${baseUrl}/api/auth/admin/deletion-requests/${encodeURIComponent(firstRequest.id)}/reject`,
    { method: "POST", headers: { Cookie: ownerCookie } },
  );
  assert.equal(rejected.status, 200);
  assert.equal((await body(rejected)).deletion_request.status, "rejected");

  const secondRequestResponse = await fetch(
    `${baseUrl}/api/auth/merchants/${merchantId}/deletion-requests`,
    {
      method: "POST",
      headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "policy_violation",
        details: "Final deletion request with merchant PII context",
      }),
    },
  );
  assert.equal(secondRequestResponse.status, 201);
  const secondRequest = (await body(secondRequestResponse)).deletion_request;

  const deleted = await fetch(`${baseUrl}/api/auth/merchants/${merchantId}/delete`, {
    method: "POST",
    headers: { Cookie: ownerCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      adminId: ownerId,
      adminPassword: ownerPassword,
      deletionRequestId: secondRequest.id,
    }),
  });
  assert.equal(deleted.status, 200);
  const deletedBody = await body(deleted);
  assert.equal(deletedBody.deletedMerchantId, merchantId);
  assert.equal(deletedBody.deletion_request.status, "completed");

  const accountAfter = await pool.query<{
    state: string;
    phone: string | null;
    phone_verified: boolean;
  }>(
    "SELECT state, phone, phone_verified FROM accounts WHERE id = $1",
    [merchantId],
  );
  assert.deepEqual(accountAfter.rows[0], {
    state: "closed",
    phone: null,
    phone_verified: false,
  });

  const merchantAfter = await pool.query<{
    owner_name: string;
    store_name: string;
    activity_type: string;
    retention_status: string;
  }>(
    "SELECT owner_name, store_name, activity_type, retention_status FROM merchants WHERE id = $1",
    [merchantId],
  );
  assert.deepEqual(merchantAfter.rows[0], {
    owner_name: "[deleted merchant]",
    store_name: "[deleted merchant]",
    activity_type: "[deleted]",
    retention_status: "deleted",
  });

  const preservedSubscription = await pool.query<{
    status: string;
    auto_reply_enabled: boolean;
    metadata: Record<string, unknown>;
  }>(
    "SELECT status, auto_reply_enabled, metadata FROM subscriptions WHERE id = $1",
    [subscriptionId],
  );
  assert.equal(preservedSubscription.rowCount, 1);
  assert.equal(preservedSubscription.rows[0]?.status, "suspended");
  assert.equal(preservedSubscription.rows[0]?.auto_reply_enabled, false);
  assert.deepEqual(preservedSubscription.rows[0]?.metadata, {});

  assert.equal(
    Number((await pool.query("SELECT COUNT(*)::int AS count FROM products WHERE merchant_id = $1", [merchantId])).rows[0]?.count),
    0,
  );
  assert.equal(
    Number((await pool.query("SELECT COUNT(*)::int AS count FROM merchant_admin_notes WHERE merchant_id = $1", [merchantId])).rows[0]?.count),
    0,
  );
  assert.equal(
    Number((await pool.query("SELECT COUNT(*)::int AS count FROM merchant_channel_overrides WHERE merchant_id = $1", [merchantId])).rows[0]?.count),
    0,
  );

  const requestsAfter = await pool.query<{
    status: string;
    merchant_name_snapshot: string;
    merchant_phone_snapshot: string;
    details: string;
  }>(
    `SELECT status, merchant_name_snapshot, merchant_phone_snapshot, details
       FROM merchant_deletion_requests
      WHERE merchant_id_snapshot = $1
      ORDER BY created_at`,
    [merchantId],
  );
  assert.equal(requestsAfter.rowCount, 2);
  for (const request of requestsAfter.rows) {
    assert.equal(request.merchant_name_snapshot, "[deleted merchant]");
    assert.equal(request.merchant_phone_snapshot, "");
    assert.equal(request.details, "[merchant data deleted]");
  }
  assert.deepEqual(
    requestsAfter.rows.map((request) => request.status).sort(),
    ["completed", "rejected"],
  );

  const listedAfter = await fetch(`${baseUrl}/api/auth/merchants`, {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(listedAfter.status, 200);
  assert.equal(
    (await body(listedAfter)).merchants.some((item: any) => item.id === merchantId),
    false,
  );

  const deletedAudit = await pool.query(
    "SELECT 1 FROM audit_events WHERE merchant_id = $1 AND action_type = 'merchant_deleted' LIMIT 1",
    [merchantId],
  );
  assert.equal(deletedAudit.rowCount, 1);
  assertNoLegacyFiles(dataDirectory);
});
