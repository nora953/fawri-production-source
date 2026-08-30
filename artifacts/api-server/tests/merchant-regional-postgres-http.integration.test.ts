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
  "Regional PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "Regional PostgreSQL proof only permits the fawri_ci database",
);

const AUTH_SECRET = "regional-pg-proof-security-secret-at-least-32-characters";

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
    "Regional/currency authority must not create legacy JSON stores",
  );
}

test("merchant regional currency routes are secure PostgreSQL authority and tenant isolated", async (t) => {
  const proofId = suffix();
  const merchantAId = `regional-pg-merchant-a-${proofId}`;
  const merchantBId = `regional-pg-merchant-b-${proofId}`;
  const productAId = `regional-pg-product-a-${proofId}`;
  const merchantAPhone = randomPhone();
  let merchantBPhone = randomPhone();
  while (merchantBPhone === merchantAPhone) merchantBPhone = randomPhone();

  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-regional-pg-proof-"),
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
    { default: merchantRegionalRouter },
  ] = await Promise.all([
    import("@workspace/db"),
    import("../src/services/authPostgresSessionAuthority.js"),
    import("../src/middleware/authSession.js"),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/merchant-regional.js"),
  ]);

  let seeded = false;
  let server: Server | null = null;

  async function cleanup(): Promise<void> {
    await pool
      .query("DELETE FROM products WHERE merchant_id = ANY($1::text[])", [
        [merchantAId, merchantBId],
      ])
      .catch(() => undefined);
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
    "generated regional proof identities must not collide with existing accounts",
  );

  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES
       ($1, 'merchant', $2, 'regional-proof-hash-a', 'active', 'ar', true, now(), now(), now()),
       ($3, 'merchant', $4, 'regional-proof-hash-b', 'active', 'en', true, now(), now(), now())`,
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
       ($1, $1, 'merchant', 'Regional Owner A', 'Regional Store A', 'retail',
        'IQ', 'Asia/Baghdad', 'IQD',
        'approved', 'approved', 'channel_connected', 'eligible', 'direct',
        0, false, now(), now()),
       ($2, $2, 'merchant', 'Regional Owner B', 'Regional Store B', 'retail',
        'AE', 'Asia/Dubai', 'AED',
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
  app.use("/api", merchantRegionalRouter);
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

  const unauthenticated = await fetch(`${baseUrl}/api/merchant/regional`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await json(unauthenticated)).code, "SESSION_REQUIRED");

  const readA = await fetch(`${baseUrl}/api/merchant/regional`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(readA.status, 200);
  assert.match(readA.headers.get("cache-control") || "", /no-store/);
  assert.deepEqual((await json(readA)).context, {
    country_code: "IQ",
    timezone: "Asia/Baghdad",
    currency_code: "IQD",
    currency_fraction_digits: 0,
  });

  const readB = await fetch(`${baseUrl}/api/merchant/regional`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(readB.status, 200);
  assert.deepEqual((await json(readB)).context, {
    country_code: "AE",
    timezone: "Asia/Dubai",
    currency_code: "AED",
    currency_fraction_digits: 2,
  });

  const changeA = await fetch(`${baseUrl}/api/merchant/regional`, {
    method: "PATCH",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({ currency_code: "USD" }),
  });
  assert.equal(
    changeA.status,
    200,
    JSON.stringify(await changeA.clone().json().catch(() => null)),
  );
  const changedA = await json(changeA);
  assert.equal(changedA.changed, true);
  assert.deepEqual(changedA.context, {
    country_code: "IQ",
    timezone: "Asia/Baghdad",
    currency_code: "USD",
    currency_fraction_digits: 2,
  });

  const replayA = await fetch(`${baseUrl}/api/merchant/regional`, {
    method: "PATCH",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({ currency_code: "USD" }),
  });
  assert.equal(replayA.status, 200);
  assert.equal((await json(replayA)).changed, false);

  await pool.query(
    `INSERT INTO products (id, merchant_id, name, current_price_iqd, original_price_iqd)
     VALUES ($1, $2, 'Regional Currency Guard Product', 15000, 15000)`,
    [productAId, merchantAId],
  );

  const blockedA = await fetch(`${baseUrl}/api/merchant/regional`, {
    method: "PATCH",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({ currency_code: "EUR" }),
  });
  assert.equal(blockedA.status, 409);
  const blockedBody = await json(blockedA);
  assert.equal(blockedBody.code, "MERCHANT_CURRENCY_CHANGE_BLOCKED");
  assert.equal(blockedBody.current_currency_code, "USD");
  assert.equal(blockedBody.requested_currency_code, "EUR");
  assert.deepEqual(blockedBody.blockers, ["catalog"]);

  const changeBWithClientTenantOverride = await fetch(
    `${baseUrl}/api/merchant/regional`,
    {
      method: "PATCH",
      headers: { Cookie: merchantBCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantAId,
        currency_code: "JPY",
      }),
    },
  );
  assert.equal(changeBWithClientTenantOverride.status, 200);
  const changedB = await json(changeBWithClientTenantOverride);
  assert.equal(changedB.changed, true);
  assert.equal(changedB.context.currency_code, "JPY");
  assert.equal(changedB.context.currency_fraction_digits, 0);

  const finalA = await fetch(`${baseUrl}/api/merchant/regional`, {
    headers: { Cookie: merchantACookie },
  });
  const finalB = await fetch(`${baseUrl}/api/merchant/regional`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(finalA.status, 200);
  assert.equal(finalB.status, 200);
  assert.equal((await json(finalA)).context.currency_code, "USD");
  assert.equal((await json(finalB)).context.currency_code, "JPY");

  assertNoLegacyJson(dataDirectory);
});
