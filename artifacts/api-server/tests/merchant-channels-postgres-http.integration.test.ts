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
  "Channels PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "Channels PostgreSQL proof only permits the fawri_ci database",
);

const AUTH_SECRET = "channels-pg-proof-security-secret-at-least-32-characters";
const META_KEY_ID = "channels-pg-proof-key";
const META_KEY = Buffer.alloc(32, 29).toString("base64");

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
    "Required PostgreSQL channel authority must not create legacy JSON stores",
  );
}

test("merchant channel routes use secure PostgreSQL authority and tenant-scoped disconnect jobs", async (t) => {
  const proofId = suffix();
  const merchantAId = `channels-pg-merchant-a-${proofId}`;
  const merchantBId = `channels-pg-merchant-b-${proofId}`;
  const pageA = `channels-page-a-${proofId}`;
  const pageB = `channels-page-b-${proofId}`;
  const merchantAPhone = randomPhone();
  let merchantBPhone = randomPhone();
  while (merchantBPhone === merchantAPhone) merchantBPhone = randomPhone();

  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-channels-pg-proof-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_AUTH_SECURITY_SECRET: AUTH_SECRET,
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_META_TOKEN_KEY_ID: META_KEY_ID,
    FAWRI_META_TOKEN_KEY_BASE64: META_KEY,
  });

  const [
    { pool },
    { authPostgresSessionAuthority },
    { MERCHANT_SESSION_COOKIE },
    { connectMetaChannelAuthoritative },
    { default: express },
    { default: cookieParser },
    { default: channelOperationsRouter },
  ] = await Promise.all([
    import("@workspace/db"),
    import("../src/services/authPostgresSessionAuthority.js"),
    import("../src/middleware/authSession.js"),
    import("../src/services/postgresMetaChannelAuthority.js"),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/channel-operations.js"),
  ]);

  let seeded = false;
  let server: Server | null = null;

  async function cleanup(): Promise<void> {
    await pool
      .query("DELETE FROM background_job_payloads WHERE merchant_id = ANY($1::text[])", [
        [merchantAId, merchantBId],
      ])
      .catch(() => undefined);
    await pool
      .query("DELETE FROM background_jobs WHERE merchant_id = ANY($1::text[])", [
        [merchantAId, merchantBId],
      ])
      .catch(() => undefined);
    await pool
      .query("DELETE FROM merchant_channels WHERE merchant_id = ANY($1::text[])", [
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
    "generated channel proof identities must not collide with existing accounts",
  );

  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES
       ($1, 'merchant', $2, 'channels-proof-hash-a', 'active', 'ar', true, now(), now(), now()),
       ($3, 'merchant', $4, 'channels-proof-hash-b', 'active', 'en', true, now(), now(), now())`,
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
       ($1, $1, 'merchant', 'Channels Owner A', 'Channels Store A', 'retail',
        'IQ', 'Asia/Baghdad', 'IQD',
        'approved', 'approved', 'channel_connected', 'eligible', 'direct',
        0, false, now(), now()),
       ($2, $2, 'merchant', 'Channels Owner B', 'Channels Store B', 'retail',
        'IQ', 'Asia/Baghdad', 'IQD',
        'approved', 'approved', 'channel_connected', 'eligible', 'direct',
        0, false, now(), now())`,
    [merchantAId, merchantBId],
  );

  const channelA = await connectMetaChannelAuthoritative({
    merchantId: merchantAId,
    platform: "messenger",
    pageId: pageA,
    pageName: "Channels Proof Page A",
    accessToken: "channels-proof-secret-token-a",
    webhookSubscribed: true,
  });
  const channelB = await connectMetaChannelAuthoritative({
    merchantId: merchantBId,
    platform: "messenger",
    pageId: pageB,
    pageName: "Channels Proof Page B",
    accessToken: "channels-proof-secret-token-b",
    webhookSubscribed: true,
  });
  assert.equal(channelA.connection_version, 1);
  assert.equal(channelB.connection_version, 1);

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
  app.use("/api", channelOperationsRouter);
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

  const unauthenticated = await fetch(`${baseUrl}/api/channels`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await json(unauthenticated)).code, "SESSION_REQUIRED");

  const listA = await fetch(`${baseUrl}/api/channels`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(listA.status, 200);
  assert.match(listA.headers.get("cache-control") || "", /no-store/);
  const listABody = await json(listA);
  assert.equal(listABody.channels.length, 1);
  assert.equal(listABody.channels[0].merchant_id, merchantAId);
  assert.equal(listABody.channels[0].page_id, pageA);
  assert.equal(listABody.channels[0].status, "active");
  assert.equal(listABody.channels[0].credential_configured, true);
  assert.equal(JSON.stringify(listABody).includes("channels-proof-secret-token-a"), false);
  assert.equal(JSON.stringify(listABody).includes(pageB), false);

  const listB = await fetch(`${baseUrl}/api/channels`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(listB.status, 200);
  const listBBody = await json(listB);
  assert.equal(listBBody.channels.length, 1);
  assert.equal(listBBody.channels[0].merchant_id, merchantBId);
  assert.equal(listBBody.channels[0].page_id, pageB);
  assert.equal(JSON.stringify(listBBody).includes(pageA), false);

  const storedCiphertext = await pool.query(
    `SELECT credential_ciphertext
       FROM merchant_channels
      WHERE merchant_id = $1 AND page_id = $2`,
    [merchantAId, pageA],
  );
  assert.equal(storedCiphertext.rows.length, 1);
  assert.equal(
    String(storedCiphertext.rows[0].credential_ciphertext).includes(
      "channels-proof-secret-token-a",
    ),
    false,
  );

  const staleDisconnectA = await fetch(
    `${baseUrl}/api/channels/meta/messenger/${encodeURIComponent(pageA)}/disconnect`,
    {
      method: "POST",
      headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
      body: JSON.stringify({ expected_version: channelA.connection_version + 1 }),
    },
  );
  assert.equal(staleDisconnectA.status, 409);
  const staleBody = await json(staleDisconnectA);
  assert.equal(staleBody.code, "META_CHANNEL_VERSION_CONFLICT");
  assert.equal(staleBody.current.connection_version, channelA.connection_version);

  const crossTenantDisconnect = await fetch(
    `${baseUrl}/api/channels/meta/messenger/${encodeURIComponent(pageA)}/disconnect`,
    {
      method: "POST",
      headers: { Cookie: merchantBCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantAId,
        expected_version: channelA.connection_version,
      }),
    },
  );
  assert.equal(crossTenantDisconnect.status, 404);
  assert.equal((await json(crossTenantDisconnect)).code, "META_CHANNEL_NOT_FOUND");

  const disconnectA = await fetch(
    `${baseUrl}/api/channels/meta/messenger/${encodeURIComponent(pageA)}/disconnect`,
    {
      method: "POST",
      headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
      body: JSON.stringify({ expected_version: channelA.connection_version }),
    },
  );
  assert.equal(
    disconnectA.status,
    202,
    JSON.stringify(await disconnectA.clone().json().catch(() => null)),
  );
  const disconnectBody = await json(disconnectA);
  assert.equal(disconnectBody.channel.merchant_id, merchantAId);
  assert.equal(disconnectBody.channel.page_id, pageA);
  assert.equal(disconnectBody.channel.status, "disconnecting");
  assert.equal(disconnectBody.channel.connection_version, 2);
  assert.equal(typeof disconnectBody.job_id, "string");
  assert.ok(disconnectBody.job_id.length > 0);

  const queued = await pool.query(
    `SELECT id, type, merchant_id, status::text AS status
       FROM background_jobs
      WHERE id = $1`,
    [disconnectBody.job_id],
  );
  assert.equal(queued.rows.length, 1);
  assert.equal(queued.rows[0].type, "meta.channel.disconnect");
  assert.equal(queued.rows[0].merchant_id, merchantAId);
  assert.equal(queued.rows[0].status, "queued");

  const finalA = await fetch(`${baseUrl}/api/channels`, {
    headers: { Cookie: merchantACookie },
  });
  const finalB = await fetch(`${baseUrl}/api/channels`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(finalA.status, 200);
  assert.equal(finalB.status, 200);
  const finalABody = await json(finalA);
  const finalBBody = await json(finalB);
  assert.equal(finalABody.channels[0].status, "disconnecting");
  assert.equal(finalABody.channels[0].merchant_id, merchantAId);
  assert.equal(finalBBody.channels[0].status, "active");
  assert.equal(finalBBody.channels[0].merchant_id, merchantBId);

  assertNoLegacyJson(dataDirectory);
});
