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
  "Support PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "Support PostgreSQL proof only permits the fawri_ci database",
);

const PASSWORD_SALT = "support-pg-proof-password-salt";
const AUTH_SECRET = "support-pg-proof-security-secret-at-least-32-characters";
const ownerId = "support-pg-owner";
const assistantId = "support-pg-assistant";
const merchantId = "support-pg-merchant";
const ownerPhone = "07987222001";
const assistantPhone = "07987222002";
const merchantPhone = "07987222003";
const subscriptionId = "support-pg-subscription";
const channelId = "support-pg-channel";

function cookie(name: string, token: string): string {
  return `${name}=${token}`;
}

async function json(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function assertNoLegacyJson(dataDirectory: string): void {
  const jsonFiles = fs
    .readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
  assert.deepEqual(jsonFiles, [], "Support cutover must not create legacy JSON stores");
}

const tinyPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

test("Support is end-to-end PostgreSQL authoritative with Auth v2 cookies", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-support-pg-proof-"),
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
    SUPPORT_ASSISTANT_REMINDER_MINUTES: "1440",
    SUPPORT_OWNER_ESCALATION_MINUTES: "2880",
    SUPPORT_MERCHANT_REMINDER_MINUTES: "1440",
    SUPPORT_AUTO_CLOSE_MINUTES: "4320",
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
    await pool
      .query(
        `DELETE FROM audit_events
          WHERE merchant_id = $1 OR actor_account_id = ANY($2::text[])`,
        [merchantId, [ownerId, assistantId]],
      )
      .catch(() => undefined);
    await pool
      .query(
        `DELETE FROM accounts
          WHERE id = ANY($1::text[]) OR phone = ANY($2::text[])`,
        [[merchantId, ownerId, assistantId], [merchantPhone, ownerPhone, assistantPhone]],
      )
      .catch(() => undefined);
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
      hashPassword("OwnerSupport9!"),
      assistantId,
      assistantPhone,
      hashPassword("AssistantSupport9!"),
      merchantId,
      merchantPhone,
      hashPassword("MerchantSupport9!"),
    ],
  );
  await pool.query(
    `INSERT INTO admin_profiles (
       id, account_id, profile_kind, display_name, role,
       enabled, must_change_password, created_at, updated_at
     ) VALUES
       ($1, $1, 'admin', 'Support Owner', 'owner_admin', true, false, now(), now()),
       ($2, $2, 'admin', 'Support Assistant', 'assistant_admin', true, false, now(), now())`,
    [ownerId, assistantId],
  );
  await pool.query(
    `INSERT INTO admin_permissions (admin_id, permission, granted_by_admin_id)
     VALUES
       ($1, 'manage_support', $2),
       ($1, 'inspect_merchant_sessions', $2)`,
    [assistantId, ownerId],
  );
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       warning_stage, products_read_only, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'Support Merchant Owner', 'Support Merchant Store', 'retail',
       'approved', 'approved', 'channel_connected', 'eligible', 'direct',
       0, false, now(), now()
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
       0, true, now() - interval '1 day', now() + interval '5 days',
       1, '{}'::jsonb, now(), now()
     )`,
    [subscriptionId, merchantId],
  );
  await pool.query(
    `INSERT INTO merchant_channels (
       id, merchant_id, platform, status, version,
       external_account_id, external_account_name,
       credential_ciphertext, credential_nonce, credential_auth_tag,
       credential_key_id, credential_algorithm, connected_at,
       created_at, updated_at
     ) VALUES (
       $1, $2, 'messenger', 'connected', 1,
       'external-support-proof', 'Support Page',
       'secret-ciphertext', 'secret-nonce', 'secret-tag',
       'secret-key-id', 'aes-256-gcm', now(), now(), now()
     )`,
    [channelId, merchantId],
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
    permissions: ["manage_support", "inspect_merchant_sessions"],
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
  const assistantCookie = cookie(ADMIN_SESSION_COOKIE, assistantSession.token);
  const merchantCookie = cookie(MERCHANT_SESSION_COOKIE, merchantSession.token);

  t.after(async () => {
    stopPostgresSupportRuntimeCutoverForTests();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  assertNoLegacyJson(dataDirectory);

  const createdResponse = await fetch(`${baseUrl}/api/auth/support/tickets`, {
    method: "POST",
    headers: { Cookie: merchantCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: "PostgreSQL Support Proof",
      category: "technical",
      message: "Merchant opened this ticket through Auth v2.",
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await json(createdResponse);
  const ticketId = String(created.ticket.id);
  assert.match(ticketId, /^support-ticket-/);
  assert.equal(created.ticket.waiting_on, "admin");

  const merchantImage = await fetch(
    `${baseUrl}/api/auth/support-images/merchant/tickets/${encodeURIComponent(ticketId)}/messages`,
    {
      method: "POST",
      headers: {
        Cookie: merchantCookie,
        "Content-Type": "image/png",
        "X-File-Name": "merchant-proof.png",
      },
      body: tinyPng,
    },
  );
  assert.equal(merchantImage.status, 201);
  const merchantImageBody = await json(merchantImage);
  assert.equal(merchantImageBody.ticket.messages.at(-1)?.attachments?.length, 1);

  const adminList = await fetch(`${baseUrl}/api/auth/admin/support/tickets`, {
    headers: { Cookie: assistantCookie },
  });
  assert.equal(adminList.status, 200);
  assert.equal((await json(adminList)).tickets.some((item: any) => item.id === ticketId), true);

  const claim = await fetch(
    `${baseUrl}/api/auth/admin/support/tickets/${encodeURIComponent(ticketId)}/claim`,
    { method: "POST", headers: { Cookie: assistantCookie } },
  );
  assert.equal(claim.status, 200);
  assert.equal((await json(claim)).ticket.assigned_admin_id, assistantId);

  const adminImage = await fetch(
    `${baseUrl}/api/auth/support-images/admin/tickets/${encodeURIComponent(ticketId)}/messages`,
    {
      method: "POST",
      headers: {
        Cookie: assistantCookie,
        "Content-Type": "image/png",
        "X-File-Name": "admin-proof.png",
      },
      body: tinyPng,
    },
  );
  assert.equal(adminImage.status, 201);
  const adminImageBody = await json(adminImage);
  const adminAttachment = adminImageBody.ticket.messages
    .flatMap((message: any) => message.attachments || [])
    .at(-1);
  assert.ok(adminAttachment?.url);

  const imageRead = await fetch(`${baseUrl}${adminAttachment.url}`, {
    headers: { Cookie: assistantCookie },
  });
  assert.equal(imageRead.status, 200);
  assert.match(imageRead.headers.get("content-type") || "", /^image\/png/);

  const adminReply = await fetch(
    `${baseUrl}/api/auth/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    {
      method: "POST",
      headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Assistant reply from PostgreSQL authority." }),
    },
  );
  assert.equal(adminReply.status, 201);
  assert.equal((await json(adminReply)).ticket.waiting_on, "merchant");

  const merchantReply = await fetch(
    `${baseUrl}/api/auth/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    {
      method: "POST",
      headers: { Cookie: merchantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Merchant follow-up reply." }),
    },
  );
  assert.equal(merchantReply.status, 201);
  assert.equal((await json(merchantReply)).ticket.waiting_on, "admin");

  const inspectionResponse = await fetch(
    `${baseUrl}/api/auth/admin/support/tickets/${encodeURIComponent(ticketId)}/inspection-requests`,
    {
      method: "POST",
      headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "independent_read_only",
        reason: "Need read-only context to reproduce the merchant issue.",
      }),
    },
  );
  assert.equal(inspectionResponse.status, 201);
  const inspectionTicket = (await json(inspectionResponse)).ticket;
  const requestId = String(inspectionTicket.inspection_requests[0].id);
  assert.match(requestId, /^inspection-request-/);

  const notificationsResponse = await fetch(`${baseUrl}/api/auth/notifications`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(notificationsResponse.status, 200);
  const notifications = (await json(notificationsResponse)).notifications;
  assert.equal(
    notifications.some((item: any) => item.type === "inspection_session_request"),
    true,
  );
  assert.equal(
    notifications.some((item: any) => item.type === "subscription_expiry_reminder"),
    true,
  );
  const inspectionNotification = notifications.find(
    (item: any) => item.type === "inspection_session_request",
  );
  const markRead = await fetch(
    `${baseUrl}/api/auth/notifications/${encodeURIComponent(inspectionNotification.id)}/read`,
    { method: "PATCH", headers: { Cookie: merchantCookie } },
  );
  assert.equal(markRead.status, 200);
  assert.ok((await json(markRead)).notification.read_at);

  const approvedInspection = await fetch(
    `${baseUrl}/api/auth/support/tickets/${encodeURIComponent(ticketId)}/inspection-requests/${encodeURIComponent(requestId)}/decision`,
    {
      method: "POST",
      headers: { Cookie: merchantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    },
  );
  assert.equal(approvedInspection.status, 200);
  assert.equal(
    (await json(approvedInspection)).ticket.inspection_requests[0].status,
    "approved",
  );

  const previewStart = await fetch(`${baseUrl}/api/auth/admin/support-preview/start`, {
    method: "POST",
    headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, request_id: requestId }),
  });
  assert.equal(previewStart.status, 201);
  const previewSession = (await json(previewStart)).session;
  assert.match(String(previewSession.id), /^support-preview-/);

  const snapshotResponse = await fetch(
    `${baseUrl}/api/auth/admin/support-preview/${encodeURIComponent(previewSession.id)}/snapshot`,
    { headers: { Cookie: assistantCookie } },
  );
  assert.equal(snapshotResponse.status, 200);
  const snapshot = (await json(snapshotResponse)).snapshot;
  assert.equal(snapshot.merchant.id, merchantId);
  assert.equal(snapshot.channels[0].external_account_name, "Support Page");
  for (const secret of [
    "credential_ciphertext",
    "credential_nonce",
    "credential_auth_tag",
    "credential_key_id",
  ]) {
    assert.equal(Object.hasOwn(snapshot.channels[0], secret), false);
  }

  const previewEnd = await fetch(
    `${baseUrl}/api/auth/admin/support-preview/${encodeURIComponent(previewSession.id)}/end`,
    { method: "POST", headers: { Cookie: assistantCookie } },
  );
  assert.equal(previewEnd.status, 200);

  await pool.query(
    `UPDATE support_tickets
        SET waiting_on = 'admin', waiting_since = now() - interval '49 hours',
            assistant_reminder_sent_at = NULL, owner_escalated_at = NULL
      WHERE id = $1`,
    [ticketId],
  );
  const escalatedListResponse = await fetch(
    `${baseUrl}/api/auth/admin/support/tickets`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(escalatedListResponse.status, 200);
  const escalatedTicket = (await json(escalatedListResponse)).tickets.find(
    (item: any) => item.id === ticketId,
  );
  assert.ok(escalatedTicket.assistant_reminder_sent_at);
  assert.ok(escalatedTicket.owner_escalated_at);

  const replyAfterEscalation = await fetch(
    `${baseUrl}/api/auth/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    {
      method: "POST",
      headers: { Cookie: assistantCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Reply clears stale escalation markers." }),
    },
  );
  assert.equal(replyAfterEscalation.status, 201);
  const clearedMarkers = await pool.query<{
    assistant_reminder_sent_at: Date | null;
    owner_escalated_at: Date | null;
    waiting_on: string;
  }>(
    `SELECT assistant_reminder_sent_at, owner_escalated_at, waiting_on
       FROM support_tickets WHERE id = $1`,
    [ticketId],
  );
  assert.equal(clearedMarkers.rows[0]?.waiting_on, "merchant");
  assert.equal(clearedMarkers.rows[0]?.assistant_reminder_sent_at, null);
  assert.equal(clearedMarkers.rows[0]?.owner_escalated_at, null);

  await pool.query(
    `UPDATE support_tickets
        SET waiting_since = now() - interval '73 hours',
            merchant_reminder_sent_at = NULL
      WHERE id = $1`,
    [ticketId],
  );
  const autoClosedResponse = await fetch(`${baseUrl}/api/auth/support/tickets`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(autoClosedResponse.status, 200);
  const autoClosedTicket = (await json(autoClosedResponse)).tickets.find(
    (item: any) => item.id === ticketId,
  );
  assert.equal(autoClosedTicket.status, "closed");
  assert.equal(autoClosedTicket.auto_closed_reason, "merchant_inactivity");
  assert.equal(
    autoClosedTicket.messages.some((item: any) => item.sender_type === "system"),
    true,
  );

  const reminderRow = await pool.query<{ read_at: Date | null }>(
    `SELECT read_at FROM notifications
      WHERE merchant_id = $1 AND type = 'support_reply_reminder'
        AND source_entity_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [merchantId, ticketId],
  );
  assert.ok(reminderRow.rows[0]?.read_at, "auto-close must mark the support reminder read");

  const persisted = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM support_tickets WHERE id = $1 AND merchant_id = $2`,
    [ticketId, merchantId],
  );
  assert.equal(Number(persisted.rows[0]?.count), 1);
  assertNoLegacyJson(dataDirectory);
});
