import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "Settings PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "Settings PostgreSQL proof only permits the fawri_ci database",
);

const AUTH_SECRET = "settings-pg-proof-security-secret-at-least-32-characters";

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

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
  assert.deepEqual(
    jsonFiles,
    [],
    "Required PostgreSQL settings authority must not create legacy JSON stores",
  );
}

test("merchant settings routes use secure v2 PostgreSQL sessions with tenant isolation and optimistic concurrency", async (t) => {
  const proofId = suffix();
  const merchantAId = `settings-pg-merchant-a-${proofId}`;
  const merchantBId = `settings-pg-merchant-b-${proofId}`;
  const merchantAPhone = randomPhone();
  let merchantBPhone = randomPhone();
  while (merchantBPhone === merchantAPhone) merchantBPhone = randomPhone();

  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-settings-pg-proof-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_AUTH_SECURITY_SECRET: AUTH_SECRET,
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
  });

  const [
    { pool },
    { authPostgresSessionAuthority },
    { MERCHANT_SESSION_COOKIE },
    { default: express },
    { default: cookieParser },
    { default: merchantSettingsRouter },
  ] = await Promise.all([
    import("@workspace/db"),
    import("../src/services/authPostgresSessionAuthority.js"),
    import("../src/middleware/authSession.js"),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/merchant-settings.js"),
  ]);

  let seeded = false;
  let server: Server | null = null;

  async function cleanup(): Promise<void> {
    await pool
      .query("DELETE FROM accounts WHERE id = ANY($1::text[])", [
        [merchantAId, merchantBId],
      ])
      .catch(() => undefined);
  }

  t.after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (seeded) await cleanup();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  const collision = await pool.query(
    `SELECT id
       FROM accounts
      WHERE id = ANY($1::text[])
         OR phone = ANY($2::text[])
      LIMIT 1`,
    [[merchantAId, merchantBId], [merchantAPhone, merchantBPhone]],
  );
  assert.equal(
    collision.rows.length,
    0,
    "generated settings proof identities must not collide with existing accounts",
  );

  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES
       ($1, 'merchant', $2, 'settings-proof-hash-a', 'active', 'ar', true, now(), now(), now()),
       ($3, 'merchant', $4, 'settings-proof-hash-b', 'active', 'en', true, now(), now(), now())`,
    [merchantAId, merchantAPhone, merchantBId, merchantBPhone],
  );
  seeded = true;

  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       country_code, timezone, currency_code,
       status, account_status, onboarding_status, trial_status, signup_source,
       warning_stage, products_read_only, created_at, updated_at
     ) VALUES
       ($1, $1, 'merchant', 'Settings Owner A', 'Settings Store A', 'retail',
        'IQ', 'Asia/Baghdad', 'IQD',
        'approved', 'approved', 'channel_connected', 'eligible', 'direct',
        0, false, now(), now()),
       ($2, $2, 'merchant', 'Settings Owner B', 'Settings Store B', 'retail',
        'IQ', 'Asia/Baghdad', 'IQD',
        'approved', 'approved', 'channel_connected', 'eligible', 'direct',
        0, false, now(), now())`,
    [merchantAId, merchantBId],
  );

  const merchantASession = await authPostgresSessionAuthority.issueSession({
    accountId: merchantAId,
    accountKind: "merchant",
    tenantId: merchantAId,
  });
  const merchantBSession = await authPostgresSessionAuthority.issueSession({
    accountId: merchantBId,
    accountKind: "merchant",
    tenantId: merchantBId,
  });

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api", merchantSettingsRouter);
  server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const merchantACookie = cookie(MERCHANT_SESSION_COOKIE, merchantASession.token);
  const merchantBCookie = cookie(MERCHANT_SESSION_COOKIE, merchantBSession.token);

  assertNoLegacyJson(dataDirectory);

  const unauthenticated = await fetch(`${baseUrl}/api/settings`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await json(unauthenticated)).code, "SESSION_REQUIRED");

  const initialA = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(initialA.status, 200);
  assert.match(initialA.headers.get("cache-control") || "", /no-store/);
  const initialABody = await json(initialA);
  assert.equal(initialABody.settings.merchant_id, merchantAId);
  assert.equal(initialABody.settings.version, 1);
  assert.equal(initialABody.settings.reply_language, "auto");
  assert.equal(initialABody.settings.delivery.fee_iqd, 0);
  assert.equal(initialABody.settings.inventory.freshness_max_age_minutes, 5);
  assert.equal(initialABody.settings.inventory.stale_policy, "reroute_then_pending");

  const initialB = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(initialB.status, 200);
  const initialBBody = await json(initialB);
  assert.equal(initialBBody.settings.merchant_id, merchantBId);
  assert.equal(initialBBody.settings.version, 1);

  const updateA = await fetch(`${baseUrl}/api/settings`, {
    method: "PATCH",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      expected_version: 1,
      settings: {
        reply_language: "en",
        delivery: {
          fee_iqd: 2500,
          notes: "Settings PostgreSQL proof A",
        },
        inventory: {
          freshness_max_age_minutes: 15,
          stale_policy: "fresh_only",
        },
      },
    }),
  });
  assert.equal(
    updateA.status,
    200,
    JSON.stringify(await updateA.clone().json().catch(() => null)),
  );
  const updateABody = await json(updateA);
  assert.equal(updateABody.settings.merchant_id, merchantAId);
  assert.equal(updateABody.settings.version, 2);
  assert.equal(updateABody.settings.reply_language, "en");
  assert.equal(updateABody.settings.delivery.fee_iqd, 2500);
  assert.equal(updateABody.settings.inventory.freshness_max_age_minutes, 15);
  assert.equal(updateABody.settings.inventory.stale_policy, "fresh_only");
  assert.deepEqual(updateABody.effects, {
    queued_auto_reply_jobs_suppressed: 0,
    processing_auto_reply_jobs_observed: 0,
    credit_consumed: false,
  });

  const staleA = await fetch(`${baseUrl}/api/settings`, {
    method: "PATCH",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      expected_version: 1,
      settings: { reply_language: "ku" },
    }),
  });
  assert.equal(staleA.status, 409);
  const staleABody = await json(staleA);
  assert.equal(staleABody.code, "MERCHANT_SETTINGS_VERSION_CONFLICT");
  assert.equal(staleABody.expected_version, 1);
  assert.equal(staleABody.current_version, 2);
  assert.equal(staleABody.current_settings.merchant_id, merchantAId);
  assert.equal(staleABody.current_settings.reply_language, "en");

  const updateBWithClientTenantOverride = await fetch(`${baseUrl}/api/settings`, {
    method: "PATCH",
    headers: { Cookie: merchantBCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: merchantAId,
      expected_version: 1,
      settings: {
        reply_language: "ku",
        delivery: { fee_iqd: 9000 },
      },
    }),
  });
  assert.equal(updateBWithClientTenantOverride.status, 200);
  const updateBBody = await json(updateBWithClientTenantOverride);
  assert.equal(updateBBody.settings.merchant_id, merchantBId);
  assert.equal(updateBBody.settings.version, 2);
  assert.equal(updateBBody.settings.reply_language, "ku");
  assert.equal(updateBBody.settings.delivery.fee_iqd, 9000);

  const finalA = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: merchantACookie },
  });
  const finalB = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(finalA.status, 200);
  assert.equal(finalB.status, 200);
  const finalABody = await json(finalA);
  const finalBBody = await json(finalB);
  assert.equal(finalABody.settings.merchant_id, merchantAId);
  assert.equal(finalABody.settings.reply_language, "en");
  assert.equal(finalABody.settings.delivery.fee_iqd, 2500);
  assert.equal(finalABody.settings.inventory.freshness_max_age_minutes, 15);
  assert.equal(finalABody.settings.inventory.stale_policy, "fresh_only");
  assert.equal(finalBBody.settings.merchant_id, merchantBId);
  assert.equal(finalBBody.settings.reply_language, "ku");
  assert.equal(finalBBody.settings.delivery.fee_iqd, 9000);

  const stored = await pool.query(
    `SELECT merchant_id, version, reply_language, delivery_fee_iqd,
            inventory_freshness_max_age_minutes, inventory_stale_policy
       FROM merchant_settings
      WHERE merchant_id = ANY($1::text[])
      ORDER BY merchant_id`,
    [[merchantAId, merchantBId]],
  );
  assert.equal(stored.rows.length, 2);
  const storedA = stored.rows.find((row) => row.merchant_id === merchantAId);
  const storedB = stored.rows.find((row) => row.merchant_id === merchantBId);
  assert.equal(storedA?.version, 2);
  assert.equal(storedA?.reply_language, "en");
  assert.equal(Number(storedA?.delivery_fee_iqd), 2500);
  assert.equal(Number(storedA?.inventory_freshness_max_age_minutes), 15);
  assert.equal(storedA?.inventory_stale_policy, "fresh_only");
  assert.equal(storedB?.version, 2);
  assert.equal(storedB?.reply_language, "ku");
  assert.equal(Number(storedB?.delivery_fee_iqd), 9000);

  assertNoLegacyJson(dataDirectory);
});
