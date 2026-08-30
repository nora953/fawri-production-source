import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "Meta webhook ingress cutover regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "Meta webhook ingress cutover regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function webhookBody(pageId: string, marker: string) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: `customer-${marker}` },
            timestamp: Date.now(),
            message: {
              mid: `mid-${marker}`,
              text: "hello",
            },
          },
        ],
      },
    ],
  };
}

async function invokeOperationalGate(
  middleware: typeof import("../src/middleware/merchantWebhookAccess.js"),
  body: Record<string, unknown>,
) {
  let nextCalled = false;
  let statusCode: number | null = null;
  let responseBody: unknown = null;
  const headers = new Map<string, string>();

  const req = {
    method: "POST",
    path: "/api/meta/webhook",
    body,
  };
  const res = {
    locals: {} as Record<string, unknown>,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), String(value));
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      responseBody = value;
      return this;
    },
  };

  await Promise.resolve(
    middleware.enforceMerchantWebhookOperationalAccess(
      req as never,
      res as never,
      (() => {
        nextCalled = true;
      }) as never,
    ),
  );

  return {
    req,
    res,
    nextCalled,
    statusCode,
    responseBody,
    headers,
  };
}

test(
  "required PostgreSQL Meta webhook ingress resolves page and merchant state without legacy JSON",
  { skip: !DATABASE_URL },
  async (t) => {
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fawri-meta-webhook-pg-ingress-"),
    );
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_DATA_DIR: dataDir,
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_META_TOKEN_KEY_ID: "meta-webhook-ingress-test-key",
      FAWRI_META_TOKEN_KEY_BASE64: Buffer.alloc(32, 31).toString("base64"),
    });

    const [{ pool }, accounts, channels, middleware] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresMetaChannelAuthority.js"),
      import("../src/middleware/merchantWebhookAccess.js"),
    ]);

    const proof = suffix();
    const phone = randomPhone();
    const pageId = `page-pg-ingress-${proof}`;
    let merchantId = "";

    t.after(async () => {
      if (merchantId) {
        await pool
          .query("DELETE FROM accounts WHERE id = $1", [merchantId])
          .catch(() => undefined);
      }
      await pool.end();
      fs.rmSync(dataDir, { recursive: true, force: true });
    });

    const collision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    assert.equal(
      collision.rows.length,
      0,
      "generated Meta webhook ingress phone must not collide with an existing account",
    );

    const created = await accounts.upsertPendingMerchantAuthoritative({
      phone,
      passwordHash: `meta-webhook-ingress-hash-${proof}`,
      ownerName: `Meta Webhook Owner ${proof}`,
      storeName: `Meta Webhook Store ${proof}`,
      activityType: "retail",
      language: "en",
      requestedPlan: "silver",
    });
    merchantId = created.account.id;
    await accounts.markMerchantOtpVerifiedAuthoritative(merchantId);
    await pool.query(
      `UPDATE merchants
          SET status = 'approved', account_status = 'approved',
              onboarding_status = 'channel_connected', updated_at = now()
        WHERE id = $1`,
      [merchantId],
    );

    await channels.connectMetaChannelAuthoritative({
      merchantId,
      platform: "messenger",
      pageId,
      pageName: "PostgreSQL-only Meta Page",
      accessToken: `meta-webhook-ingress-token-${proof}`,
      webhookSubscribed: true,
    });

    assert.equal(
      fs.existsSync(path.join(dataDir, "meta-channels.json")),
      false,
      "regression fixture must not create a legacy Meta channel authority",
    );
    assert.equal(
      fs.existsSync(path.join(dataDir, "merchants.json")),
      false,
      "regression fixture must not create a legacy merchant authority",
    );

    const approved = await invokeOperationalGate(
      middleware,
      webhookBody(pageId, `approved-${proof}`),
    );
    assert.equal(
      approved.nextCalled,
      true,
      `approved PostgreSQL-only Meta page was rejected: ${JSON.stringify(approved.responseBody)}`,
    );
    assert.equal(approved.statusCode, null);
    assert.equal(
      Array.isArray((approved.req.body as { entry?: unknown }).entry)
        ? (approved.req.body as { entry: unknown[] }).entry.length
        : 0,
      1,
      "approved PostgreSQL merchant webhook entry must remain processable",
    );

    await pool.query(
      `UPDATE merchants
          SET status = 'suspended', account_status = 'suspended', updated_at = now()
        WHERE id = $1`,
      [merchantId],
    );
    await pool.query(
      `UPDATE accounts
          SET state = 'suspended', suspended_at = now(), updated_at = now()
        WHERE id = $1 AND kind = 'merchant'`,
      [merchantId],
    );

    const suspended = await invokeOperationalGate(
      middleware,
      webhookBody(pageId, `suspended-${proof}`),
    );
    assert.equal(
      suspended.nextCalled,
      true,
      `suspended PostgreSQL merchant must be handled as a terminal webhook entry, not as unavailable legacy state: ${JSON.stringify(suspended.responseBody)}`,
    );
    assert.equal(suspended.statusCode, null);
    assert.equal(
      (suspended.req.body as { entry: unknown[] }).entry.length,
      0,
      "suspended merchant webhook entry must be removed before enqueue",
    );
    const terminal = suspended.res.locals.metaWebhookTerminalEventIds;
    assert.ok(
      Array.isArray(terminal) && terminal.length === 1,
      "suspended merchant webhook event must be recorded as terminal",
    );
  },
);
