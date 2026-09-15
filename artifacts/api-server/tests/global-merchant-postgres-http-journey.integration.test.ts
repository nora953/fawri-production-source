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
  "Golden Journey only permits a local PostgreSQL database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "Golden Journey only permits the fawri_ci database",
);

const AUTH_SECRET = "golden-journey-auth-security-secret-at-least-32-characters";
const MERCHANT_PASSWORD = "GoldenJourney!2026";
const CASHIER_PIN = "2468";

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

async function json(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function responseCookie(response: Response, name: string): string {
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;]+)`));
  assert.ok(match, `expected ${name} in Set-Cookie`);
  return `${name}=${match[1]}`;
}

function assertNoLegacyJson(dataDirectory: string): void {
  const jsonFiles = fs
    .readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    jsonFiles,
    [],
    "required PostgreSQL Golden Journey must not create legacy JSON stores",
  );
}

function stationHeaders(stationToken: string, deviceId: string): Record<string, string> {
  return {
    "x-fawri-cashier-station-token": stationToken,
    "x-fawri-cashier-device-id": deviceId,
  };
}

function operatorHeaders(
  stationToken: string,
  operatorToken: string,
  deviceId: string,
): Record<string, string> {
  return {
    ...stationHeaders(stationToken, deviceId),
    "x-fawri-cashier-operator-token": operatorToken,
  };
}

test("global merchant journey connects secure login, catalog, cashier sale, reporting, and logout through PostgreSQL", async (t) => {
  const proofId = suffix();
  const merchantAPhone = randomPhone();
  let merchantBPhone = randomPhone();
  while (merchantBPhone === merchantAPhone) merchantBPhone = randomPhone();

  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-global-merchant-journey-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_AUTH_SECURITY_SECRET: AUTH_SECRET,
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
    FAWRI_DISABLE_JOB_WORKERS: "1",
  });

  const [
    { pool },
    { hashPassword },
    merchantAccounts,
    { MERCHANT_SESSION_COOKIE },
  ] = await Promise.all([
    import("@workspace/db"),
    import("../src/services/authPasswordService.js"),
    import("../src/services/postgresMerchantAccountAuthority.js"),
    import("../src/middleware/authSession.js"),
  ]);

  let merchantAId = "";
  let merchantBId = "";
  let server: Server | null = null;

  async function cleanup(): Promise<void> {
    const ids = [merchantAId, merchantBId].filter(Boolean);
    if (ids.length === 0) return;
    await pool
      .query("DELETE FROM accounts WHERE id = ANY($1::text[])", [ids])
      .catch(() => undefined);
  }

  t.after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    await cleanup();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  const phoneCollision = await pool.query(
    "SELECT id FROM accounts WHERE phone = ANY($1::text[]) LIMIT 1",
    [[merchantAPhone, merchantBPhone]],
  );
  assert.equal(
    phoneCollision.rows.length,
    0,
    "generated Golden Journey phones must not collide with existing accounts",
  );

  const merchantA = await merchantAccounts.upsertPendingMerchantAuthoritative({
    phone: merchantAPhone,
    passwordHash: hashPassword(MERCHANT_PASSWORD),
    ownerName: `Golden Owner A ${proofId}`,
    storeName: `Golden Store A ${proofId}`,
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  merchantAId = merchantA.account.id;
  const merchantB = await merchantAccounts.upsertPendingMerchantAuthoritative({
    phone: merchantBPhone,
    passwordHash: hashPassword(MERCHANT_PASSWORD),
    ownerName: `Golden Owner B ${proofId}`,
    storeName: `Golden Store B ${proofId}`,
    activityType: "retail",
    language: "en",
    requestedPlan: "silver",
  });
  merchantBId = merchantB.account.id;

  await merchantAccounts.markMerchantOtpVerifiedAuthoritative(merchantAId);
  await merchantAccounts.markMerchantOtpVerifiedAuthoritative(merchantBId);
  await pool.query(
    `UPDATE merchants
        SET status = 'approved',
            account_status = 'approved',
            onboarding_status = 'channel_connected',
            country_code = 'IQ',
            timezone = 'Asia/Baghdad',
            currency_code = 'IQD',
            warning_stage = 0,
            products_read_only = false,
            updated_at = now()
      WHERE id = ANY($1::text[])`,
    [[merchantAId, merchantBId]],
  );

  await pool.query(
    `INSERT INTO subscriptions
      (id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
       base_reply_limit, base_replies_used, base_replies_remaining,
       addon_replies_remaining, emergency_credit_amount,
       emergency_credit_activated, emergency_debt, auto_reply_enabled,
       starts_at, expires_at, activated_at, version)
     VALUES
      ($1, $2, 'silver', 'active', 10000, 1,
       20, 0, 20, 0, 0, FALSE, 0, TRUE,
       now() - interval '1 day', now() + interval '30 days', now(), 1),
      ($3, $4, 'silver', 'active', 10000, 1,
       20, 0, 20, 0, 0, FALSE, 0, TRUE,
       now() - interval '1 day', now() + interval '30 days', now(), 1)`,
    [
      `golden-sub-a-${proofId}`,
      merchantAId,
      `golden-sub-b-${proofId}`,
      merchantBId,
    ],
  );

  const { default: app } = await import("../src/app.js");
  server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const loginA = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: merchantAPhone, password: MERCHANT_PASSWORD }),
  });
  assert.equal(
    loginA.status,
    200,
    JSON.stringify(await loginA.clone().json().catch(() => null)),
  );
  const loginABody = await json(loginA);
  assert.equal(loginABody.ok, true);
  assert.equal(loginABody.merchant?.id || loginABody.merchant_id || loginABody.account?.id, merchantAId);
  const merchantACookie = responseCookie(loginA, MERCHANT_SESSION_COOKIE);

  const loginB = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: merchantBPhone, password: MERCHANT_PASSWORD }),
  });
  assert.equal(
    loginB.status,
    200,
    JSON.stringify(await loginB.clone().json().catch(() => null)),
  );
  const merchantBCookie = responseCookie(loginB, MERCHANT_SESSION_COOKIE);

  const subscription = await fetch(`${baseUrl}/api/auth/subscription/current`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(subscription.status, 200);
  const subscriptionBody = await json(subscription);
  assert.equal(subscriptionBody.subscription.merchant_id, merchantAId);
  assert.equal(subscriptionBody.subscription.status, "active");
  assert.equal(subscriptionBody.subscription.plan_name, "silver");

  const settings = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(settings.status, 200);
  const settingsBody = await json(settings);
  assert.equal(settingsBody.settings.merchant_id, merchantAId);

  const productPrice = 12_000;
  const productCreate = await fetch(`${baseUrl}/api/catalog/products`, {
    method: "POST",
    headers: {
      Cookie: merchantACookie,
      "Content-Type": "application/json",
      "Idempotency-Key": `golden-product-${proofId}`,
    },
    body: JSON.stringify({
      name: `Golden Product ${proofId}`,
      price_iqd: productPrice,
      stock_quantity: 5,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      track_inventory: true,
      sku: `GOLDEN-${proofId}`,
    }),
  });
  assert.equal(
    productCreate.status,
    201,
    JSON.stringify(await productCreate.clone().json().catch(() => null)),
  );
  const productCreateBody = await json(productCreate);
  const product = productCreateBody.product;
  assert.equal(product.merchant_id, merchantAId);
  assert.equal(product.stock_quantity, 5);
  assert.equal(product.track_inventory, true);

  const productListB = await fetch(`${baseUrl}/api/catalog/products`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(productListB.status, 200);
  const productListBBody = await json(productListB);
  assert.equal(
    productListBBody.products.some((candidate: any) => candidate.id === product.id),
    false,
  );

  const staffCreate = await fetch(`${baseUrl}/api/cashier/management/staff`, {
    method: "POST",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: `Golden Manager ${proofId}`,
      role: "manager",
      pin: CASHIER_PIN,
    }),
  });
  assert.equal(
    staffCreate.status,
    201,
    JSON.stringify(await staffCreate.clone().json().catch(() => null)),
  );
  const staff = (await json(staffCreate)).staff;
  assert.ok(staff.id);
  assert.ok(staff.permissions.includes("sale.create"));
  assert.ok(staff.permissions.includes("reports.sales"));

  const staffListAResponse = await fetch(`${baseUrl}/api/cashier/management/staff`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(staffListAResponse.status, 200);
  const staffListA = (await json(staffListAResponse)).staff;
  assert.equal(staffListA.some((candidate: any) => candidate.id === staff.id), true);

  const staffListBResponse = await fetch(`${baseUrl}/api/cashier/management/staff`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(staffListBResponse.status, 200);
  const staffListB = (await json(staffListBResponse)).staff;
  assert.equal(staffListB.some((candidate: any) => candidate.id === staff.id), false);

  const stationCreate = await fetch(`${baseUrl}/api/cashier/management/stations`, {
    method: "POST",
    headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Golden Station ${proofId}`,
      branch_key: `golden-${proofId}`,
      offline_inventory_authority: false,
    }),
  });
  assert.equal(
    stationCreate.status,
    201,
    JSON.stringify(await stationCreate.clone().json().catch(() => null)),
  );
  const station = (await json(stationCreate)).station;
  assert.ok(station.id);

  const stationListAResponse = await fetch(`${baseUrl}/api/cashier/management/stations`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(stationListAResponse.status, 200);
  const stationListA = (await json(stationListAResponse)).stations;
  assert.equal(stationListA.some((candidate: any) => candidate.id === station.id), true);

  const stationListBResponse = await fetch(`${baseUrl}/api/cashier/management/stations`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(stationListBResponse.status, 200);
  const stationListB = (await json(stationListBResponse)).stations;
  assert.equal(stationListB.some((candidate: any) => candidate.id === station.id), false);

  const pairingBegin = await fetch(
    `${baseUrl}/api/cashier/management/stations/${encodeURIComponent(station.id)}/pairing`,
    {
      method: "POST",
      headers: { Cookie: merchantACookie },
    },
  );
  assert.equal(pairingBegin.status, 201);
  const pairing = await json(pairingBegin);
  assert.equal(pairing.station_id, station.id);
  assert.ok(pairing.pairing_code);

  const deviceId = `golden-device-${proofId}`;
  const stationPair = await fetch(`${baseUrl}/api/cashier/station/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairing_code: pairing.pairing_code,
      device_id: deviceId,
    }),
  });
  assert.equal(stationPair.status, 200);
  const paired = await json(stationPair);
  assert.equal(paired.merchant_id, merchantAId);
  assert.equal(paired.station_id, station.id);
  assert.ok(paired.station_token);

  const operatorLogin = await fetch(`${baseUrl}/api/cashier/operator/login`, {
    method: "POST",
    headers: {
      ...stationHeaders(paired.station_token, deviceId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ staff_id: staff.id, pin: CASHIER_PIN }),
  });
  assert.equal(
    operatorLogin.status,
    200,
    JSON.stringify(await operatorLogin.clone().json().catch(() => null)),
  );
  const operatorLoginBody = await json(operatorLogin);
  const operatorToken = operatorLoginBody.operator_token;
  const operatorContext = operatorLoginBody.context;
  assert.ok(operatorToken);
  assert.equal(operatorContext.merchant_id, merchantAId);
  assert.equal(operatorContext.station_id, station.id);
  assert.equal(operatorContext.staff_id, staff.id);
  assert.ok(operatorContext.shift_id);

  const cashierHeaders = operatorHeaders(
    paired.station_token,
    operatorToken,
    deviceId,
  );
  const snapshotResponse = await fetch(`${baseUrl}/api/cashier/operator/catalog-snapshot`, {
    headers: cashierHeaders,
  });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await json(snapshotResponse);
  assert.equal(snapshot.merchant_id, merchantAId);
  const cashierProduct = snapshot.products.find(
    (candidate: any) => candidate.id === product.id,
  );
  assert.ok(cashierProduct, "created merchant product must reach cashier catalog snapshot");
  assert.equal(cashierProduct.version, product.version);
  assert.equal(cashierProduct.stock_quantity, 5);
  assert.ok(cashierProduct.cost_evidence);

  const operationId = `golden-sale-operation-${proofId}`;
  const saleId = `golden-sale-${proofId}`;
  const movementId = `golden-movement-${proofId}`;
  const lineId = `golden-line-${proofId}`;
  const localMerchantId = `golden-local-${proofId}`;
  const occurredAt = new Date().toISOString();
  const deviceSequence = 1;

  const saleBundle = {
    cloud_merchant_id: merchantAId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    operation_id: operationId,
    device_sequence: deviceSequence,
    envelopes: [
      {
        schema_version: 1,
        operation_id: operationId,
        device_id: deviceId,
        device_sequence: deviceSequence,
        entity_type: "sale",
        entity_id: saleId,
        operation: "append",
        occurred_at: occurredAt,
        payload: {
          sale_id: saleId,
          operation_id: operationId,
          local_merchant_id: localMerchantId,
          cloud_merchant_id: merchantAId,
          device_id: deviceId,
          device_sequence: deviceSequence,
          source: "cashier",
          status: "completed",
          lines: [
            {
              line_id: lineId,
              product_id: product.id,
              product_name_snapshot: product.name,
              sku_snapshot: product.sku,
              catalog_version: cashierProduct.version,
              cost_evidence: cashierProduct.cost_evidence,
              quantity: 1,
              base_unit_price_minor: productPrice,
              effective_unit_price_minor: productPrice,
              discount_minor: 0,
              line_total_minor: productPrice,
            },
          ],
          subtotal_minor: productPrice,
          discount_minor: 0,
          total_minor: productPrice,
          currency_code: "IQD",
          currency_fraction_digits: 0,
          payment_method: "cash",
          payment_status: "paid",
          occurred_at: occurredAt,
        },
      },
      {
        schema_version: 1,
        operation_id: operationId,
        device_id: deviceId,
        device_sequence: deviceSequence,
        entity_type: "inventory_movement",
        entity_id: movementId,
        operation: "append",
        occurred_at: occurredAt,
        payload: {
          movement_id: movementId,
          operation_id: operationId,
          local_merchant_id: localMerchantId,
          cloud_merchant_id: merchantAId,
          device_id: deviceId,
          device_sequence: deviceSequence,
          product_id: product.id,
          delta: -1,
          reason: "sale",
          related_sale_id: saleId,
          occurred_at: occurredAt,
        },
      },
    ],
  };

  const saleSync = await fetch(`${baseUrl}/api/cashier/operator/sync/sale`, {
    method: "POST",
    headers: { ...cashierHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(saleBundle),
  });
  assert.equal(
    saleSync.status,
    200,
    JSON.stringify(await saleSync.clone().json().catch(() => null)),
  );
  const saleSyncBody = await json(saleSync);
  assert.equal(saleSyncBody.order_id, saleId);
  assert.equal(saleSyncBody.operation_id, operationId);
  assert.equal(saleSyncBody.replayed, false);
  assert.equal(saleSyncBody.inventory_mutation_count, 1);

  const productAfterSale = await fetch(
    `${baseUrl}/api/catalog/products/${encodeURIComponent(product.id)}`,
    { headers: { Cookie: merchantACookie } },
  );
  assert.equal(productAfterSale.status, 200);
  const productAfterSaleBody = await json(productAfterSale);
  assert.equal(productAfterSaleBody.product.stock_quantity, 4);

  const canonicalOrder = await pool.query(
    `SELECT id, merchant_id, source_channel::text AS source_channel,
            status::text AS status, payment_status::text AS payment_status,
            total_iqd
       FROM orders
      WHERE merchant_id = $1 AND id = $2`,
    [merchantAId, saleId],
  );
  assert.equal(canonicalOrder.rows.length, 1);
  assert.equal(canonicalOrder.rows[0].source_channel, "cashier");
  assert.equal(canonicalOrder.rows[0].status, "delivered");
  assert.equal(canonicalOrder.rows[0].payment_status, "paid");
  assert.equal(Number(canonicalOrder.rows[0].total_iqd), productPrice);

  const merchantReport = await fetch(`${baseUrl}/api/cashier/management/report`, {
    headers: { Cookie: merchantACookie },
  });
  assert.equal(merchantReport.status, 200);
  const merchantReportBody = await json(merchantReport);
  assert.equal(merchantReportBody.report.sale_count, 1);
  const merchantIqd = merchantReportBody.report.by_currency.find(
    (currency: any) => currency.currency_code === "IQD",
  );
  assert.ok(merchantIqd);
  assert.equal(merchantIqd.sale_count, 1);
  assert.equal(merchantIqd.net_revenue_minor, productPrice);

  const operatorReport = await fetch(`${baseUrl}/api/cashier/operator/report`, {
    headers: cashierHeaders,
  });
  assert.equal(operatorReport.status, 200);
  const operatorReportBody = await json(operatorReport);
  assert.equal(operatorReportBody.source, "server_cashier");
  assert.equal(operatorReportBody.report.sale_count, 1);

  const merchantBReport = await fetch(`${baseUrl}/api/cashier/management/report`, {
    headers: { Cookie: merchantBCookie },
  });
  assert.equal(merchantBReport.status, 200);
  assert.equal((await json(merchantBReport)).report.sale_count, 0);

  const merchantBOrderLeak = await pool.query(
    "SELECT count(*)::int AS count FROM orders WHERE merchant_id = $1 AND id = $2",
    [merchantBId, saleId],
  );
  assert.equal(merchantBOrderLeak.rows[0].count, 0);

  const logout = await fetch(`${baseUrl}/api/cashier/operator/logout`, {
    method: "POST",
    headers: { ...cashierHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ pin: CASHIER_PIN }),
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(await json(logout), { ok: true });

  const operatorAfterLogout = await fetch(`${baseUrl}/api/cashier/operator/me`, {
    headers: cashierHeaders,
  });
  assert.equal(operatorAfterLogout.status, 401);
  assert.equal((await json(operatorAfterLogout)).code, "CASHIER_OPERATOR_SESSION_INVALID");

  const closedRuntime = await pool.query(
    `SELECT os.status::text AS session_status,
            sh.status::text AS shift_status,
            sh.close_reason
       FROM cashier_operator_sessions os
       JOIN cashier_shifts sh
         ON sh.id = os.shift_id AND sh.merchant_id = os.merchant_id
      WHERE os.id = $1 AND os.merchant_id = $2`,
    [operatorContext.operator_session_id, merchantAId],
  );
  assert.equal(closedRuntime.rows.length, 1);
  assert.equal(closedRuntime.rows[0].session_status, "revoked");
  assert.equal(closedRuntime.rows[0].shift_status, "closed");
  assert.equal(closedRuntime.rows[0].close_reason, "operator_logout");

  assertNoLegacyJson(dataDirectory);
});
