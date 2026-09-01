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
  "emergency PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "emergency PostgreSQL proof only permits the fawri_ci database",
);

const AUTH_SECRET = "emergency-proof-security-secret-at-least-32-characters";
const PASSWORD_SALT = "emergency-proof-password-salt";
const ownerId = "emergency-pg-owner";
const trustedId = "emergency-pg-trusted";
const untrustedId = "emergency-pg-untrusted";
const merchantId = "emergency-pg-merchant";
const subscriptionId = "emergency-pg-subscription";
const productId = "emergency-pg-product";
const channelId = "emergency-pg-channel";

function cookie(name: string, token: string): string {
  return `${name}=${token}`;
}

async function body(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function assertNoLegacyFiles(dataDirectory: string): void {
  for (const file of [
    "emergency-read-access.json",
    "merchants.json",
    "auth-security.json",
    "fawri-runtime-db.json",
    "saved-answers.json",
    "training-requests.json",
    "learned-answers.json",
  ]) {
    assert.equal(
      fs.existsSync(path.join(dataDirectory, file)),
      false,
      `${file} must not be created by PostgreSQL emergency authority`,
    );
  }
}

test("Emergency read access is PostgreSQL authoritative with Auth v2 sessions", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-emergency-pg-proof-"),
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
    { ADMIN_SESSION_COOKIE, MERCHANT_SESSION_COOKIE },
    { stopPostgresSupportRuntimeCutoverForTests },
    { default: express },
    { default: cookieParser },
    { default: authSecurityRouter },
  ] = await Promise.all([
    import("@workspace/db"),
    import("../src/services/authPasswordService.js"),
    import("../src/services/authPostgresSessionAuthority.js"),
    import("../src/middleware/authSession.js"),
    import("../src/services/postgresSupportRuntimeCutover.js"),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/auth-security.js"),
  ]);

  async function cleanup(): Promise<void> {
    await pool.query(
      "DELETE FROM emergency_merchant_notices WHERE merchant_id = $1",
      [merchantId],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM emergency_owner_alerts
        WHERE request_id IN (
          SELECT id FROM emergency_access_requests
           WHERE merchant_id = $1 OR requested_by_admin_account_id = ANY($2::text[])
        )`,
      [merchantId, [ownerId, trustedId, untrustedId]],
    ).catch(() => undefined);
    await pool.query(
      "DELETE FROM emergency_access_requests WHERE merchant_id = $1 OR requested_by_admin_account_id = ANY($2::text[])",
      [merchantId, [ownerId, trustedId, untrustedId]],
    ).catch(() => undefined);
    await pool.query(
      "DELETE FROM emergency_authorizations WHERE admin_account_id = ANY($1::text[]) OR granted_by_owner_account_id = $2",
      [[trustedId, untrustedId], ownerId],
    ).catch(() => undefined);
    await pool.query(
      "DELETE FROM audit_events WHERE entity_type = 'emergency_read_access' OR actor_account_id = ANY($1::text[]) OR merchant_id = $2",
      [[ownerId, trustedId, untrustedId], merchantId],
    ).catch(() => undefined);
    await pool.query("DELETE FROM merchant_channels WHERE id = $1 OR merchant_id = $2", [channelId, merchantId]).catch(() => undefined);
    await pool.query("DELETE FROM products WHERE id = $1 OR merchant_id = $2", [productId, merchantId]).catch(() => undefined);
    await pool.query("DELETE FROM subscriptions WHERE id = $1 OR merchant_id = $2", [subscriptionId, merchantId]).catch(() => undefined);
    await pool.query(
      "DELETE FROM accounts WHERE id = ANY($1::text[])",
      [[ownerId, trustedId, untrustedId, merchantId]],
    ).catch(() => undefined);
  }

  await cleanup();

  const ownerPasswordHash = hashPassword("OwnerEmergency9!");
  const trustedPasswordHash = hashPassword("TrustedEmergency9!");
  const untrustedPasswordHash = hashPassword("UntrustedEmergency9!");
  const merchantPasswordHash = hashPassword("MerchantEmergency9!");

  await pool.query(
    `INSERT INTO accounts
       (id, kind, phone, password_hash, state, language,
        phone_verified, phone_verified_at, created_at, updated_at)
     VALUES
       ($1, 'admin', '07988112001', $2, 'active', 'en', true, now(), now(), now()),
       ($3, 'admin', '07988112002', $4, 'active', 'en', true, now(), now(), now()),
       ($5, 'admin', '07988112003', $6, 'active', 'en', true, now(), now(), now()),
       ($7, 'merchant', '07988112004', $8, 'active', 'en', true, now(), now(), now())`,
    [
      ownerId,
      ownerPasswordHash,
      trustedId,
      trustedPasswordHash,
      untrustedId,
      untrustedPasswordHash,
      merchantId,
      merchantPasswordHash,
    ],
  );

  await pool.query(
    `INSERT INTO admin_profiles
       (id, account_id, profile_kind, display_name, role,
        enabled, must_change_password, created_at, updated_at)
     VALUES
       ($1, $1, 'admin', 'Emergency Owner', 'owner_admin', true, false, now(), now()),
       ($2, $2, 'admin', 'Trusted Responder', 'assistant_admin', true, false, now(), now()),
       ($3, $3, 'admin', 'Untrusted Responder', 'assistant_admin', true, false, now(), now())`,
    [ownerId, trustedId, untrustedId],
  );

  await pool.query(
    `INSERT INTO merchants
       (id, account_id, profile_kind, owner_name, store_name, activity_type,
        status, account_status, onboarding_status, trial_status, signup_source,
        requested_plan, warning_stage, products_read_only, created_at, updated_at)
     VALUES
       ($1, $1, 'merchant', 'Emergency Merchant Owner', 'Emergency Merchant Store', 'retail',
        'approved', 'approved', 'channel_connected', 'active', 'direct',
        'gold', 0, false, now(), now())`,
    [merchantId],
  );

  await pool.query(
    `INSERT INTO subscriptions
       (id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
        base_reply_limit, base_replies_used, base_replies_remaining,
        addon_replies_remaining, auto_reply_enabled, starts_at, expires_at,
        version, metadata, created_at, updated_at)
     VALUES
       ($1, $2, 'gold', 'active', 49000, 15,
        8000, 10, 7990, 0, true,
        now() - interval '1 day', now() + interval '30 days',
        1, '{}'::jsonb, now(), now())`,
    [subscriptionId, merchantId],
  );

  await pool.query(
    `INSERT INTO products
       (id, merchant_id, name, original_price_iqd, current_price_iqd,
        quantity, low_stock_threshold, version, status, allow_fawri_reply,
        metadata, created_at, updated_at)
     VALUES
       ($1, $2, 'Emergency product', 1500, 1500,
        3, 0, 1, 'available', true, '{}'::jsonb, now(), now())`,
    [productId, merchantId],
  );

  await pool.query(
    `INSERT INTO merchant_channels
       (id, merchant_id, platform, status, version,
        external_account_id, page_id, page_name,
        credential_ciphertext, credential_nonce, credential_auth_tag,
        credential_key_id, credential_algorithm, metadata,
        connected_at, created_at, updated_at)
     VALUES
       ($1, $2, 'messenger', 'connected', 1,
        'emergency-external-account', 'emergency-page', 'Emergency Page',
        'emergency-secret-ciphertext', 'secret-nonce', 'secret-tag',
        'secret-key-id', 'aes-256-gcm', '{}'::jsonb,
        now(), now(), now())`,
    [channelId, merchantId],
  );

  const ownerSession = await authPostgresSessionAuthority.issueSession({
    accountId: ownerId,
    accountKind: "admin",
    tenantId: "fawri-admin",
    adminRole: "owner_admin",
    permissions: [],
  });
  const trustedSession = await authPostgresSessionAuthority.issueSession({
    accountId: trustedId,
    accountKind: "admin",
    tenantId: "fawri-admin",
    adminRole: "assistant_admin",
    permissions: [],
  });
  const trustedSecondSession = await authPostgresSessionAuthority.issueSession({
    accountId: trustedId,
    accountKind: "admin",
    tenantId: "fawri-admin",
    adminRole: "assistant_admin",
    permissions: [],
  });
  const untrustedSession = await authPostgresSessionAuthority.issueSession({
    accountId: untrustedId,
    accountKind: "admin",
    tenantId: "fawri-admin",
    adminRole: "assistant_admin",
    permissions: [],
  });
  const merchantSession = await authPostgresSessionAuthority.issueSession({
    accountId: merchantId,
    accountKind: "merchant",
    tenantId: merchantId,
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
  const trustedCookie = cookie(ADMIN_SESSION_COOKIE, trustedSession.token);
  const trustedSecondCookie = cookie(ADMIN_SESSION_COOKIE, trustedSecondSession.token);
  const untrustedCookie = cookie(ADMIN_SESSION_COOKIE, untrustedSession.token);
  const merchantCookie = cookie(MERCHANT_SESSION_COOKIE, merchantSession.token);

  t.after(async () => {
    await stopPostgresSupportRuntimeCutoverForTests();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections?.();
    });
    await cleanup();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  assertNoLegacyFiles(dataDirectory);

  const directory = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/directory`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(directory.status, 200);
  const directoryBody = await body(directory);
  assert.equal(directoryBody.is_owner, true);
  assert.equal(directoryBody.merchants.some((item: any) => item.id === merchantId), true);
  assert.equal(directoryBody.assistants.some((item: any) => item.id === trustedId), true);

  const untrustedAttempt = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests`,
    {
      method: "POST",
      headers: { Cookie: untrustedCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        incident_reference: "INC-UNTRUSTED-1",
        severity: "high",
        reason: "Investigate a reported production incident safely.",
        duration_minutes: 15,
        critical_self_activate: false,
      }),
    },
  );
  assert.equal(untrustedAttempt.status, 403);
  assert.equal((await body(untrustedAttempt)).code, "EMERGENCY_AUTHORIZATION_REQUIRED");

  const authorization = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/authorizations/${trustedId}`,
    {
      method: "PUT",
      headers: { Cookie: ownerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        can_request: true,
        can_critical_self_activate: true,
      }),
    },
  );
  assert.equal(authorization.status, 200);
  assert.equal((await body(authorization)).authorization.can_critical_self_activate, true);

  const requested = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests`,
    {
      method: "POST",
      headers: { Cookie: trustedCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        incident_reference: "INC-HIGH-1001",
        severity: "high",
        reason: "Investigate a production synchronization failure safely.",
        duration_minutes: 15,
        critical_self_activate: false,
      }),
    },
  );
  assert.equal(requested.status, 201);
  const highRequest = (await body(requested)).request;
  assert.equal(highRequest.status, "pending");
  assert.equal(highRequest.read_only, true);

  const beforeApproval = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/snapshot`,
    { headers: { Cookie: trustedCookie } },
  );
  assert.equal(beforeApproval.status, 410);
  assert.equal((await body(beforeApproval)).code, "EMERGENCY_ACCESS_INACTIVE");

  const ownerOverview = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/overview`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(ownerOverview.status, 200);
  assert.equal(
    (await body(ownerOverview)).owner_alerts.some(
      (item: any) => item.request_id === highRequest.id && item.type === "approval_required",
    ),
    true,
  );

  const approved = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/decision`,
    {
      method: "POST",
      headers: { Cookie: ownerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    },
  );
  assert.equal(approved.status, 200);
  assert.equal((await body(approved)).request.status, "active");

  const wrongSession = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/snapshot`,
    { headers: { Cookie: trustedSecondCookie } },
  );
  assert.equal(wrongSession.status, 403);
  assert.equal((await body(wrongSession)).code, "EMERGENCY_SESSION_MISMATCH");

  const snapshotResponse = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/snapshot`,
    { headers: { Cookie: trustedCookie } },
  );
  assert.equal(snapshotResponse.status, 200);
  const snapshot = (await body(snapshotResponse)).snapshot;
  assert.equal(snapshot.products[0].name, "Emergency product");
  assert.equal(snapshot.channels[0].page_name, "Emergency Page");
  assert.equal(snapshot.emergency_access.incident_reference, "INC-HIGH-1001");
  assert.equal(JSON.stringify(snapshot).includes("emergency-secret-ciphertext"), false);
  assert.equal(JSON.stringify(snapshot).includes("password_hash"), false);

  const ownerSnapshot = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/snapshot`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(ownerSnapshot.status, 200);

  const writeAttempt = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/snapshot`,
    {
      method: "POST",
      headers: { Cookie: trustedCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "changed" }),
    },
  );
  assert.equal(writeAttempt.status, 403);
  assert.equal((await body(writeAttempt)).code, "EMERGENCY_ACCESS_READ_ONLY");

  const ended = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${highRequest.id}/end`,
    { method: "POST", headers: { Cookie: trustedCookie } },
  );
  assert.equal(ended.status, 200);
  assert.equal((await body(ended)).request.end_reason, "admin_ended");

  const notices = await fetch(
    `${baseUrl}/api/auth/emergency-read-access/notices`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(notices.status, 200);
  const noticesBody = await body(notices);
  const notice = noticesBody.notices.find((item: any) => item.request_id === highRequest.id);
  assert.ok(notice);
  assert.ok(noticesBody.unread_count >= 1);

  const markedRead = await fetch(
    `${baseUrl}/api/auth/emergency-read-access/notices/${notice.id}/read`,
    { method: "PATCH", headers: { Cookie: merchantCookie } },
  );
  assert.equal(markedRead.status, 200);
  assert.ok((await body(markedRead)).notice.read_at);

  const critical = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests`,
    {
      method: "POST",
      headers: { Cookie: trustedCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        incident_reference: "INC-CRITICAL-2001",
        severity: "critical",
        reason: "Contain an active production incident requiring immediate inspection.",
        duration_minutes: 30,
        critical_self_activate: true,
      }),
    },
  );
  assert.equal(critical.status, 201);
  const criticalRequest = (await body(critical)).request;
  assert.equal(criticalRequest.status, "active");
  assert.equal(criticalRequest.activation_mode, "critical_self_activation");

  const criticalOverview = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/overview`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(criticalOverview.status, 200);
  assert.equal(
    (await body(criticalOverview)).owner_alerts.some(
      (item: any) =>
        item.request_id === criticalRequest.id && item.type === "critical_self_activation",
    ),
    true,
  );

  const criticalSnapshot = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${criticalRequest.id}/snapshot`,
    { headers: { Cookie: trustedCookie } },
  );
  assert.equal(criticalSnapshot.status, 200);
  assert.equal((await body(criticalSnapshot)).snapshot.emergency_access.severity, "critical");

  const ownerEnded = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests/${criticalRequest.id}/end`,
    { method: "POST", headers: { Cookie: ownerCookie } },
  );
  assert.equal(ownerEnded.status, 200);
  assert.equal((await body(ownerEnded)).request.end_reason, "owner_ended");

  // A delayed cleanup must report the policy expiry time, not the later
  // moment when refreshEmergencyAccessPostgres happens to run.
  const delayedExpiry = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests`,
    {
      method: "POST",
      headers: { Cookie: trustedCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        incident_reference: "INC-DELAYED-EXPIRY-2002",
        severity: "critical",
        reason: "Verify delayed expiry reconciliation keeps merchant incident times truthful.",
        duration_minutes: 15,
        critical_self_activate: true,
      }),
    },
  );
  assert.equal(delayedExpiry.status, 201);
  const delayedRequest = (await body(delayedExpiry)).request;
  assert.equal(delayedRequest.status, "active");

  const delayedStartedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const delayedExpiresAt = new Date(
    new Date(delayedStartedAt).getTime() + 15 * 60_000,
  ).toISOString();

  await pool.query(
    `UPDATE emergency_access_requests
        SET status = 'active',
            started_at = $2::timestamptz,
            expires_at = $3::timestamptz,
            ended_at = NULL,
            end_reason = NULL,
            updated_at = now()
      WHERE id = $1`,
    [delayedRequest.id, delayedStartedAt, delayedExpiresAt],
  );

  const delayedNoticesResponse = await fetch(
    `${baseUrl}/api/auth/emergency-read-access/notices`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(delayedNoticesResponse.status, 200);
  const delayedNotices = await body(delayedNoticesResponse);
  let delayedNotice = delayedNotices.notices.find(
    (item: any) => item.request_id === delayedRequest.id,
  );
  assert.ok(delayedNotice);
  assert.equal(
    new Date(delayedNotice.ended_at).toISOString(),
    delayedExpiresAt,
  );

  let delayedRow = (
    await pool.query<{
      status: string;
      end_reason: string | null;
      ended_at: Date | string | null;
    }>(
      `SELECT status, end_reason, ended_at
         FROM emergency_access_requests
        WHERE id = $1`,
      [delayedRequest.id],
    )
  ).rows[0];

  assert.equal(delayedRow.status, "expired");
  assert.equal(delayedRow.end_reason, "duration_expired");
  assert.equal(
    new Date(String(delayedRow.ended_at)).toISOString(),
    delayedExpiresAt,
  );

  // Simulate a row/notice written by the pre-fix runtime and prove that a
  // later refresh repairs the historical merchant-facing evidence as well.
  const misleadingCleanupAt = new Date().toISOString();

  await pool.query(
    `UPDATE emergency_access_requests
        SET ended_at = $2::timestamptz
      WHERE id = $1`,
    [delayedRequest.id, misleadingCleanupAt],
  );
  await pool.query(
    `UPDATE emergency_merchant_notices
        SET ended_at = $2::timestamptz
      WHERE request_id = $1`,
    [delayedRequest.id, misleadingCleanupAt],
  );

  const repairedNoticesResponse = await fetch(
    `${baseUrl}/api/auth/emergency-read-access/notices`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(repairedNoticesResponse.status, 200);
  const repairedNotices = await body(repairedNoticesResponse);
  delayedNotice = repairedNotices.notices.find(
    (item: any) => item.request_id === delayedRequest.id,
  );
  assert.ok(delayedNotice);
  assert.equal(
    new Date(delayedNotice.ended_at).toISOString(),
    delayedExpiresAt,
  );

  delayedRow = (
    await pool.query<{
      status: string;
      end_reason: string | null;
      ended_at: Date | string | null;
    }>(
      `SELECT status, end_reason, ended_at
         FROM emergency_access_requests
        WHERE id = $1`,
      [delayedRequest.id],
    )
  ).rows[0];

  assert.equal(
    new Date(String(delayedRow.ended_at)).toISOString(),
    delayedExpiresAt,
  );

  const audit = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/audit`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(audit.status, 200);
  const auditBody = await body(audit);
  assert.equal(auditBody.verification.valid, true);
  assert.ok(auditBody.events.length >= 8);
  assert.equal(
    auditBody.events.some((item: any) => item.event_type === "emergency_snapshot_viewed"),
    true,
  );
  const chronological = [...auditBody.events].reverse();
  assert.equal(chronological[0].previous_hash, "GENESIS");
  for (let index = 1; index < chronological.length; index += 1) {
    assert.equal(chronological[index].previous_hash, chronological[index - 1].hash);
  }

  const revoked = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/authorizations/${trustedId}`,
    {
      method: "PUT",
      headers: { Cookie: ownerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        can_request: false,
        can_critical_self_activate: false,
      }),
    },
  );
  assert.equal(revoked.status, 200);
  assert.equal((await body(revoked)).authorization.can_request, false);

  const afterRevocation = await fetch(
    `${baseUrl}/api/auth/admin/emergency-read-access/requests`,
    {
      method: "POST",
      headers: { Cookie: trustedCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        incident_reference: "INC-REVOKED-3001",
        severity: "high",
        reason: "This request must be rejected after authorization revocation.",
        duration_minutes: 15,
        critical_self_activate: false,
      }),
    },
  );
  assert.equal(afterRevocation.status, 403);
  assert.equal((await body(afterRevocation)).code, "EMERGENCY_AUTHORIZATION_REQUIRED");

  assertNoLegacyFiles(dataDirectory);
});
