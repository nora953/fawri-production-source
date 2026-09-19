import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

function suffix() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function temporaryCompatibilityMerchant({ merchantId, phone, password }) {
  return {
    id: merchantId,
    owner_name: "Golden Journey Owner",
    store_name: "Golden Journey Store",
    phone,
    password,
    activity_type: "retail",
    status: "approved",
    account_status: "approved",
    onboarding_status: "channel_connected",
    trial_status: "active",
    signup_source: "direct",
    requested_plan: null,
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-30T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve API test port")));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child, getLogs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The unified API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready.\n${getLogs()}`);
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookieByName(response, name) {
  const prefix = `${name}=`;
  for (const header of responseCookies(response)) {
    for (const candidate of String(header).split(/,(?=[^;,]+=)/)) {
      const cookie = candidate.trim().split(";", 1)[0];
      if (cookie.startsWith(prefix)) return cookie;
    }
  }
  return "";
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function merchantHeaders(merchantCookie, deviceId, extra = {}) {
  return {
    Cookie: merchantCookie,
    "X-Fawri-Device-Id": deviceId,
    ...extra,
  };
}

function stationHeaders(stationToken, deviceId, extra = {}) {
  return {
    "X-Fawri-Cashier-Station-Token": stationToken,
    "X-Fawri-Cashier-Device-Id": deviceId,
    ...extra,
  };
}

function operatorHeaders(stationToken, operatorToken, deviceId, extra = {}) {
  return {
    "X-Fawri-Cashier-Station-Token": stationToken,
    "X-Fawri-Cashier-Operator-Token": operatorToken,
    "X-Fawri-Cashier-Device-Id": deviceId,
    ...extra,
  };
}

function cashierSaleBundle({
  merchantId,
  localMerchantId,
  deviceId,
  product,
  costEvidence,
  sequence = 1,
}) {
  const id = suffix();
  const operationId = `golden-op-${id}`;
  const saleId = `golden-sale-${id}`;
  const lineId = `golden-line-${id}`;
  const movementId = `golden-movement-${id}`;
  const occurredAt = new Date().toISOString();
  const unitPrice = Number(product.price_iqd);
  const sale = {
    sale_id: saleId,
    operation_id: operationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: sequence,
    source: "cashier",
    status: "completed",
    lines: [
      {
        line_id: lineId,
        product_id: product.id,
        product_name_snapshot: product.name,
        catalog_version: product.version,
        cost_evidence: costEvidence,
        quantity: 1,
        base_unit_price_minor: unitPrice,
        effective_unit_price_minor: unitPrice,
        discount_minor: 0,
        line_total_minor: unitPrice,
      },
    ],
    subtotal_minor: unitPrice,
    discount_minor: 0,
    total_minor: unitPrice,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: "cash",
    payment_status: "paid",
    occurred_at: occurredAt,
  };
  const movement = {
    movement_id: movementId,
    operation_id: operationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: sequence,
    product_id: product.id,
    delta: -1,
    reason: "sale",
    related_sale_id: saleId,
    occurred_at: occurredAt,
  };
  return {
    saleId,
    body: {
      cloud_merchant_id: merchantId,
      local_merchant_id: localMerchantId,
      device_id: deviceId,
      device_sequence: sequence,
      operation_id: operationId,
      envelopes: [
        {
          schema_version: 1,
          operation_id: operationId,
          device_id: deviceId,
          device_sequence: sequence,
          entity_type: "sale",
          entity_id: saleId,
          operation: "append",
          occurred_at: occurredAt,
          payload: sale,
        },
        {
          schema_version: 1,
          operation_id: operationId,
          device_id: deviceId,
          device_sequence: sequence,
          entity_type: "inventory_movement",
          entity_id: movementId,
          operation: "append",
          occurred_at: occurredAt,
          payload: movement,
        },
      ],
    },
  };
}

test(
  "global merchant journey keeps one PostgreSQL merchant authoritative from login through cashier closeout",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const { pool } = await import("@workspace/db");
    const id = suffix();
    const merchantId = `golden-merchant-${id}`;
    const phone = `078${String(crypto.randomInt(0, 100_000_000)).padStart(8, "0")}`;
    const password = "GoldenJourney1!";
    const merchantDeviceId = `golden-merchant-device-${id}`;
    const cashierDeviceId = `golden-cashier-device-${id}`;
    const localMerchantId = `golden-local-${id}`;
    const staffPin = "4826";
    const dataDirectory = path.join(os.tmpdir(), `fawri-golden-journey-${id}`);
    const runtimeDirectory = path.join(dataDirectory, "runtime");

    await mkdir(runtimeDirectory, { recursive: true });
    await pool.query("DELETE FROM accounts WHERE id = $1", [merchantId]);
    const phoneCollision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    assert.equal(
      phoneCollision.rows.length,
      0,
      "generated golden journey phone must not collide with an existing account",
    );
    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, password_version, security_version,
         state, language, phone_verified, phone_verified_at, session_version,
         created_at, updated_at
       ) VALUES (
         $1, 'merchant', $2, $3, 1, 1,
         'active', 'en', true, now(), 1,
         now(), now()
       )`,
      [merchantId, phone, password],
    );
    await pool.query(
      `INSERT INTO merchants (
         id, account_id, profile_kind, owner_name, store_name, activity_type,
         status, account_status, onboarding_status, trial_status,
         signup_source, requested_plan
       ) VALUES (
         $1, $1, 'merchant', 'Golden Journey Owner', 'Golden Journey Store', 'retail',
         'approved', 'approved', 'channel_connected', 'active',
         'direct', NULL
       )`,
      [merchantId],
    );

    // Temporary compatibility-only identity fixture for the pre-#139 baseline.
    // Operational catalog, cashier, inventory, report, session, and order state
    // must remain PostgreSQL-backed. Remove this fixture after PR #139 lands.
    await writeFile(
      path.join(dataDirectory, "merchants.json"),
      JSON.stringify(
        {
          merchants: [
            temporaryCompatibilityMerchant({ merchantId, phone, password }),
          ],
          subscriptions: [],
          otps: [],
          admin_logs: [],
          merchant_notifications: [],
          support_tickets: [],
          deletion_requests: [],
          channel_overrides: {},
          admin_notes: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let serverOutput = "";
    const child = spawn(process.execPath, [serverEntry], {
      cwd: runtimeDirectory,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        LOG_LEVEL: "silent",
        BOT_DEBUG: "false",
        FAWRI_DATA_DIR: dataDirectory,
        FAWRI_PASSWORD_SALT: "global-golden-journey-password-salt-32-bytes-minimum",
        FAWRI_AUTH_SECURITY_SECRET:
          "global-golden-journey-session-secret-over-thirty-two-characters",
        FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
        FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
        FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
        FAWRI_SESSION_IDLE_TTL_MS: "60000",
        FAWRI_SESSION_ABSOLUTE_TTL_MS: "300000",
        FAWRI_SESSION_ROTATION_MS: "60000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });

    t.after(async () => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await rm(dataDirectory, { recursive: true, force: true });
      await pool.query("DELETE FROM accounts WHERE id = $1", [merchantId]).catch(() => {});
      await pool.end();
    });

    await waitForServer(baseUrl, child, () => serverOutput);

    const login = await jsonRequest(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": merchantDeviceId,
      },
      body: JSON.stringify({
        phone,
        password,
        device_label: "Global golden journey merchant device",
      }),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    assert.equal(login.body?.merchant?.id, merchantId);
    const merchantCookie = cookieByName(
      login.response,
      "fawri_merchant_session_v2",
    );
    assert.ok(merchantCookie, "merchant login must issue the secure v2 session cookie");

    // Dashboard-style authoritative reads: these are the same operational
    // authorities used by the merchant Overview counters.
    const [conversations, orders, initialCatalog] = await Promise.all([
      jsonRequest(`${baseUrl}/api/conversations`, {
        headers: merchantHeaders(merchantCookie, merchantDeviceId),
      }),
      jsonRequest(`${baseUrl}/api/orders`, {
        headers: merchantHeaders(merchantCookie, merchantDeviceId),
      }),
      jsonRequest(`${baseUrl}/api/catalog/products`, {
        headers: merchantHeaders(merchantCookie, merchantDeviceId),
      }),
    ]);
    for (const result of [conversations, orders, initialCatalog]) {
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
      assert.equal(result.body?.ok, true);
      assert.equal(Number(result.body?.count), 0);
    }
    assert.equal(initialCatalog.body?.merchant_id, merchantId);

    const createdProduct = await jsonRequest(`${baseUrl}/api/catalog/products`, {
      method: "POST",
      headers: merchantHeaders(merchantCookie, merchantDeviceId, {
        "Content-Type": "application/json",
        "Idempotency-Key": `golden-product-create-${id}`,
      }),
      body: JSON.stringify({
        name: "Golden Journey Product",
        sku: `GOLDEN-${id}`,
        price_iqd: 12_000,
        stock_quantity: 7,
        low_stock_threshold: 2,
        status: "available",
        allow_fawri_reply: true,
      }),
    });
    assert.equal(createdProduct.response.status, 201, JSON.stringify(createdProduct.body));
    assert.equal(createdProduct.body?.product?.merchant_id, merchantId);
    assert.equal(createdProduct.body?.product?.stock_quantity, 7);
    const productId = createdProduct.body.product.id;

    const createdStaff = await jsonRequest(`${baseUrl}/api/cashier/management/staff`, {
      method: "POST",
      headers: merchantHeaders(merchantCookie, merchantDeviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        display_name: "Golden Cashier",
        role: "cashier",
        pin: staffPin,
      }),
    });
    assert.equal(createdStaff.response.status, 201, JSON.stringify(createdStaff.body));
    assert.ok(createdStaff.body?.staff?.permissions?.includes("sale.create"));
    const staffId = createdStaff.body.staff.id;

    const createdStation = await jsonRequest(`${baseUrl}/api/cashier/management/stations`, {
      method: "POST",
      headers: merchantHeaders(merchantCookie, merchantDeviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        name: "Golden Station",
        branch_key: "main",
      }),
    });
    assert.equal(createdStation.response.status, 201, JSON.stringify(createdStation.body));
    const stationId = createdStation.body.station.id;
    const locationId = createdStation.body.station.location_id;
    assert.ok(locationId, "created cashier station must expose canonical location_id");

    await pool.query(
      `INSERT INTO location_inventory_levels (
         id, merchant_id, location_id, product_id, variant_id,
         quantity, low_stock_threshold, version, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,NULL,$5,$6,1,now(),now())`,
      [
        `golden-location-inventory-${id}`,
        merchantId,
        locationId,
        productId,
        7,
        2,
      ],
    );

    const pairing = await jsonRequest(
      `${baseUrl}/api/cashier/management/stations/${encodeURIComponent(stationId)}/pairing`,
      {
        method: "POST",
        headers: merchantHeaders(merchantCookie, merchantDeviceId),
      },
    );
    assert.equal(pairing.response.status, 201, JSON.stringify(pairing.body));
    assert.equal(pairing.body?.station_id, stationId);
    assert.ok(pairing.body?.pairing_code);

    const paired = await jsonRequest(`${baseUrl}/api/cashier/station/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairing_code: pairing.body.pairing_code,
        device_id: cashierDeviceId,
      }),
    });
    assert.equal(paired.response.status, 200, JSON.stringify(paired.body));
    assert.equal(paired.body?.merchant_id, merchantId);
    assert.equal(paired.body?.station_id, stationId);
    assert.ok(paired.body?.station_token);
    const stationToken = paired.body.station_token;

    const stationStaff = await jsonRequest(`${baseUrl}/api/cashier/station/staff`, {
      headers: stationHeaders(stationToken, cashierDeviceId),
    });
    assert.equal(stationStaff.response.status, 200, JSON.stringify(stationStaff.body));
    assert.ok(stationStaff.body?.staff?.some((member) => member.id === staffId));

    const operatorLogin = await jsonRequest(`${baseUrl}/api/cashier/operator/login`, {
      method: "POST",
      headers: stationHeaders(stationToken, cashierDeviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ staff_id: staffId, pin: staffPin }),
    });
    assert.equal(operatorLogin.response.status, 200, JSON.stringify(operatorLogin.body));
    assert.equal(operatorLogin.body?.context?.merchant_id, merchantId);
    assert.equal(operatorLogin.body?.context?.station_id, stationId);
    assert.equal(operatorLogin.body?.context?.staff_id, staffId);
    assert.ok(operatorLogin.body?.operator_token);
    const operatorToken = operatorLogin.body.operator_token;

    const snapshot = await jsonRequest(`${baseUrl}/api/cashier/operator/catalog-snapshot`, {
      headers: operatorHeaders(stationToken, operatorToken, cashierDeviceId),
    });
    assert.equal(snapshot.response.status, 200, JSON.stringify(snapshot.body));
    assert.equal(snapshot.body?.merchant_id, merchantId);
    const cashierProduct = snapshot.body?.products?.find((product) => product.id === productId);
    assert.ok(cashierProduct, "operator catalog snapshot must expose the merchant product");
    assert.equal(cashierProduct.stock_quantity, 7);
    assert.ok(cashierProduct.cost_evidence, "operator snapshot must issue cost evidence");

    const sale = cashierSaleBundle({
      merchantId,
      localMerchantId,
      deviceId: cashierDeviceId,
      product: cashierProduct,
      costEvidence: cashierProduct.cost_evidence,
    });

    const tenantTamper = structuredClone(sale.body);
    tenantTamper.cloud_merchant_id = `other-merchant-${id}`;
    const rejectedTenant = await jsonRequest(`${baseUrl}/api/cashier/operator/sync/sale`, {
      method: "POST",
      headers: operatorHeaders(stationToken, operatorToken, cashierDeviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(tenantTamper),
    });
    assert.equal(rejectedTenant.response.status, 403, JSON.stringify(rejectedTenant.body));
    assert.equal(rejectedTenant.body?.code, "CASHIER_SYNC_TENANT_MISMATCH");

    const syncedSale = await jsonRequest(`${baseUrl}/api/cashier/operator/sync/sale`, {
      method: "POST",
      headers: operatorHeaders(stationToken, operatorToken, cashierDeviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(sale.body),
    });
    assert.equal(syncedSale.response.status, 200, JSON.stringify(syncedSale.body));
    assert.equal(syncedSale.body?.replayed, false);
    assert.equal(syncedSale.body?.inventory_mutation_count, 1);

    const catalogAfterSale = await jsonRequest(`${baseUrl}/api/catalog/products`, {
      headers: merchantHeaders(merchantCookie, merchantDeviceId),
    });
    assert.equal(catalogAfterSale.response.status, 200, JSON.stringify(catalogAfterSale.body));
    const productAfterSale = catalogAfterSale.body?.products?.find(
      (product) => product.id === productId,
    );
    assert.ok(productAfterSale);
    assert.equal(productAfterSale.stock_quantity, 6);
    assert.equal(productAfterSale.version, Number(cashierProduct.version) + 1);

    const report = await jsonRequest(`${baseUrl}/api/cashier/management/report`, {
      headers: merchantHeaders(merchantCookie, merchantDeviceId),
    });
    assert.equal(report.response.status, 200, JSON.stringify(report.body));
    assert.equal(report.body?.report?.sale_count, 1);
    assert.equal(report.body?.sales_scanned, 1);
    const iqd = report.body?.report?.by_currency?.find(
      (currency) => currency.currency_code === "IQD",
    );
    assert.ok(iqd);
    assert.equal(iqd.sale_count, 1);
    assert.equal(iqd.sold_units, 1);
    assert.equal(iqd.gross_revenue_minor, 12_000);
    assert.ok(report.body?.by_staff?.some((row) => row.staff_id === staffId));
    assert.ok(report.body?.by_station?.some((row) => row.station_id === stationId));

    // Merchant Orders intentionally excludes source=cashier. The separation is
    // part of the active contract; the cashier report and inventory reflection
    // above are the authoritative merchant-side evidence for this sale.
    const merchantOrdersAfterSale = await jsonRequest(`${baseUrl}/api/orders`, {
      headers: merchantHeaders(merchantCookie, merchantDeviceId),
    });
    assert.equal(
      merchantOrdersAfterSale.response.status,
      200,
      JSON.stringify(merchantOrdersAfterSale.body),
    );
    assert.equal(merchantOrdersAfterSale.body?.count, 0);

    const logout = await jsonRequest(`${baseUrl}/api/cashier/operator/logout`, {
      method: "POST",
      headers: operatorHeaders(stationToken, operatorToken, cashierDeviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ pin: staffPin }),
    });
    assert.equal(logout.response.status, 200, JSON.stringify(logout.body));
    assert.equal(logout.body?.ok, true);

    const expiredOperator = await jsonRequest(`${baseUrl}/api/cashier/operator/me`, {
      headers: operatorHeaders(stationToken, operatorToken, cashierDeviceId),
    });
    assert.equal(expiredOperator.response.status, 401, JSON.stringify(expiredOperator.body));
    assert.equal(expiredOperator.body?.code, "CASHIER_OPERATOR_SESSION_INVALID");

    const legacyState = JSON.parse(
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(path.join(dataDirectory, "merchants.json"), "utf8"),
      ),
    );
    assert.equal(legacyState.merchants.length, 1);
    assert.equal(legacyState.merchants[0].id, merchantId);
    for (const forbiddenKey of [
      "products",
      "orders",
      "cashier_staff",
      "cashier_stations",
      "inventory_mutations",
    ]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(legacyState, forbiddenKey),
        false,
        `${forbiddenKey} must not become a legacy operational authority`,
      );
    }
  },
);
