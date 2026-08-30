import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "subscription HTTP golden journey only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "subscription HTTP golden journey only permits the fawri_ci database",
);

const allowedAdminId = "admin-subscription-http-allowed";
const deniedAdminId = "admin-subscription-http-denied";
const merchantId = "merchant-subscription-http-primary";
const otherMerchantId = "merchant-subscription-http-other";
const identityIds = [allowedAdminId, deniedAdminId, merchantId, otherMerchantId];

async function responseJson(response: Response) {
  return {
    response,
    body: await response.json().catch(() => null) as any,
  };
}

function cookie(name: string, token: string): string {
  return `${name}=${token}`;
}

test("secure PostgreSQL admin subscription mutations are visible only to the owning merchant session", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-subscription-http-pg-golden-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });
  const legacyPath = path.join(dataDirectory, "merchants.json");
  const legacySentinel = JSON.stringify({
    subscriptions: [{
      id: "legacy-subscription-must-remain-untouched",
      merchant_id: merchantId,
      plan_name: "diamond",
      replies_remaining: 999999,
    }],
  });
  await writeFile(legacyPath, legacySentinel, "utf8");

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_AUTH_SECURITY_SECRET:
      "subscription-http-golden-security-secret-at-least-32-characters",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
  });

  const [
    { pool },
    { default: express },
    { default: cookieParser },
    { default: authSecurityRouter },
    { authPostgresSessionAuthority },
  ] = await Promise.all([
    import("@workspace/db"),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/auth-security.js"),
    import("../src/services/authPostgresSessionAuthority.js"),
  ]);

  async function cleanup(): Promise<void> {
    await pool.query("DELETE FROM accounts WHERE id = ANY($1::text[])", [identityIds]);
  }

  async function seedIdentity(): Promise<void> {
    await cleanup();
    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, state, language,
         phone_verified, phone_verified_at, created_at, updated_at
       ) VALUES
         ($1, 'admin', '07700000301', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now()),
         ($2, 'admin', '07700000302', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now()),
         ($3, 'merchant', '07700000303', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now()),
         ($4, 'merchant', '07700000304', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now())`,
      [allowedAdminId, deniedAdminId, merchantId, otherMerchantId],
    );
    await pool.query(
      `INSERT INTO admin_profiles (
         id, account_id, profile_kind, display_name, role,
         enabled, must_change_password, created_at, updated_at
       ) VALUES
         ($1, $1, 'admin', 'Subscription Allowed Admin', 'assistant_admin', TRUE, FALSE, now(), now()),
         ($2, $2, 'admin', 'Subscription Denied Admin', 'assistant_admin', TRUE, FALSE, now(), now())`,
      [allowedAdminId, deniedAdminId],
    );
    await pool.query(
      `INSERT INTO admin_permissions (admin_id, permission, granted_by_admin_id)
       VALUES ($1, 'manage_subscriptions', NULL)`,
      [allowedAdminId],
    );
    await pool.query(
      `INSERT INTO merchants (
         id, account_id, profile_kind, owner_name, store_name, activity_type,
         status, account_status, onboarding_status, trial_status, signup_source,
         warning_stage, products_read_only, metadata, created_at, updated_at
       ) VALUES
         ($1, $1, 'merchant', 'Primary Owner', 'Primary Store', 'test',
          'approved', 'approved', 'channel_connected', 'not_started', 'direct',
          0, FALSE, '{}'::jsonb, now(), now()),
         ($2, $2, 'merchant', 'Other Owner', 'Other Store', 'test',
          'approved', 'approved', 'channel_connected', 'not_started', 'direct',
          0, FALSE, '{}'::jsonb, now(), now())`,
      [merchantId, otherMerchantId],
    );
  }

  await seedIdentity();

  const allowedAdminSession = await authPostgresSessionAuthority.issueSession({
    accountId: allowedAdminId,
    accountKind: "admin",
    tenantId: allowedAdminId,
    adminRole: "assistant_admin",
    permissions: ["manage_subscriptions"],
    deviceLabel: "Subscription Golden Admin",
  });
  const deniedAdminSession = await authPostgresSessionAuthority.issueSession({
    accountId: deniedAdminId,
    accountKind: "admin",
    tenantId: deniedAdminId,
    adminRole: "assistant_admin",
    permissions: [],
    deviceLabel: "Subscription Denied Admin",
  });
  const merchantSession = await authPostgresSessionAuthority.issueSession({
    accountId: merchantId,
    accountKind: "merchant",
    tenantId: merchantId,
    deviceLabel: "Subscription Golden Merchant",
  });
  const otherMerchantSession = await authPostgresSessionAuthority.issueSession({
    accountId: otherMerchantId,
    accountKind: "merchant",
    tenantId: otherMerchantId,
    deviceLabel: "Subscription Other Merchant",
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

  const allowedAdminCookie = cookie(
    "fawri_admin_session_v2",
    allowedAdminSession.token,
  );
  const deniedAdminCookie = cookie(
    "fawri_admin_session_v2",
    deniedAdminSession.token,
  );
  const merchantCookie = cookie(
    "fawri_merchant_session_v2",
    merchantSession.token,
  );
  const otherMerchantCookie = cookie(
    "fawri_merchant_session_v2",
    otherMerchantSession.token,
  );

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  const beforeActivation = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  ));
  assert.equal(beforeActivation.response.status, 404);
  assert.equal(beforeActivation.body?.code, "SUBSCRIPTION_NOT_FOUND");

  const deniedActivation = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: deniedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "activate", plan: "silver" }),
    },
  ));
  assert.equal(deniedActivation.response.status, 403);
  assert.equal(deniedActivation.body?.code, "ADMIN_PERMISSION_REQUIRED");

  const stillMissingAfterDeniedMutation = await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(stillMissingAfterDeniedMutation.status, 404);

  const activation = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: allowedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "activate", plan: "silver" }),
    },
  ));
  assert.equal(activation.response.status, 200);
  assert.equal(activation.body?.subscription?.merchant_id, merchantId);
  assert.equal(activation.body?.subscription?.plan_name, "silver");
  assert.equal(activation.body?.subscription?.status, "active");
  const activationVersion = Number(activation.body?.subscription?.version || 0);
  assert.ok(activationVersion > 0);

  const merchantCurrent = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  ));
  assert.equal(merchantCurrent.response.status, 200);
  assert.equal(merchantCurrent.body?.subscription?.merchant_id, merchantId);
  assert.equal(merchantCurrent.body?.subscription?.plan_name, "silver");
  assert.equal(merchantCurrent.body?.subscription?.version, activationVersion);

  const otherMerchantCurrent = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: otherMerchantCookie } },
  ));
  assert.equal(otherMerchantCurrent.response.status, 404);
  assert.equal(otherMerchantCurrent.body?.code, "SUBSCRIPTION_NOT_FOUND");

  const adminList = await responseJson(await fetch(
    `${baseUrl}/api/auth/admin/subscriptions`,
    { headers: { Cookie: allowedAdminCookie } },
  ));
  assert.equal(adminList.response.status, 200);
  assert.ok(
    adminList.body?.subscriptions?.some(
      (subscription: any) => subscription?.merchant_id === merchantId,
    ),
  );

  const planChange = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: allowedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "change", plan: "gold" }),
    },
  ));
  assert.equal(planChange.response.status, 200);
  assert.equal(planChange.body?.subscription?.merchant_id, merchantId);
  assert.equal(planChange.body?.subscription?.plan_name, "gold");
  assert.ok(Number(planChange.body?.subscription?.version || 0) > activationVersion);

  const merchantAfterChange = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  ));
  assert.equal(merchantAfterChange.response.status, 200);
  assert.equal(merchantAfterChange.body?.subscription?.merchant_id, merchantId);
  assert.equal(merchantAfterChange.body?.subscription?.plan_name, "gold");
  assert.equal(
    merchantAfterChange.body?.subscription?.version,
    planChange.body?.subscription?.version,
  );

  const otherMerchantAfterChange = await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: otherMerchantCookie } },
  );
  assert.equal(otherMerchantAfterChange.status, 404);

  assert.equal(
    await readFile(legacyPath, "utf8"),
    legacySentinel,
    "required PostgreSQL subscription authority touched legacy merchants.json",
  );
});
