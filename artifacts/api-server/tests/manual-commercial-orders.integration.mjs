import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";

export async function proveManualCommercialOrders({ ownerPool, tenantUrl, authUrl, operatorUrl, focusedG5 = false }) {
  for (const url of [tenantUrl, authUrl, operatorUrl]) {
    assert.equal(new URL(url).hostname, "127.0.0.1");
    assert.equal(new URL(url).pathname, "/fawri");
  }
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "fawri-manual-orders-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_V1_MANUAL_COMMERCE: "1",
    FAWRI_ALLOWED_ORIGINS: "https://fawri.example.test",
    FAWRI_AUTH_SECURITY_SECRET: "synthetic-local-only-auth-key-for-testing",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
    DATABASE_URL: tenantUrl,
    FAWRI_AUTH_DATABASE_URL: authUrl,
    FAWRI_OPERATOR_DATABASE_URL: operatorUrl,
  });
  const merchant = "v1-manual-merchant-a";
  const other = "v1-manual-merchant-b";
  const admin = "v1-manual-admin";
  await ownerPool.query(`INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified,phone_verified_at)
    VALUES ($1,'merchant','+9647900000091','test-only','active',true,now()),
    ($2,'merchant','+9647900000092','test-only','active',true,now()),
    ($3,'admin','+9647900000093','test-only','active',true,now())`, [merchant, other, admin]);
  await ownerPool.query(`INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status)
    VALUES ($1,$1,'Synthetic A','A','test','approved','approved'),
    ($2,$2,'Synthetic B','B','test','approved','approved')`, [merchant, other]);
  await ownerPool.query(`INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password)
    VALUES ($1,$1,'Synthetic Admin','assistant_admin',true,false)`, [admin]);
  await ownerPool.query("INSERT INTO admin_permissions(admin_id,permission) VALUES ($1,'manage_subscriptions')", [admin]);
  await ownerPool.query(`INSERT INTO products(id,merchant_id,name,current_price_iqd,quantity)
    VALUES ('manual-product-a',$1,'Order item',1500,1000)`, [merchant]);

  await ownerPool.query("INSERT INTO merchant_settings(merchant_id) VALUES ($1),($2)", [merchant, other]);
  await ownerPool.query(`INSERT INTO merchant_locations
    (id,merchant_id,name,is_default,online_fulfillment_enabled,inventory_fresh_at)
    VALUES ('manual-stock-location',$1,'Stock',true,true,now())`, [merchant]);
  await ownerPool.query(`INSERT INTO location_inventory_levels
    (id,merchant_id,location_id,product_id,quantity)
    VALUES ('manual-stock',$1,'manual-stock-location','manual-product-a',1000)`, [merchant]);

  const { default: app } = await import("../src/app.ts");
  const { authPostgresSessionAuthority } = await import("../src/services/authPostgresSessionAuthority.ts");
  const { closeAuthenticationPool } = await import("../src/services/authenticationPostgresAuthority.ts");
  const { stopPostgresSupportRuntimeCutoverForTests } = await import("../src/services/postgresSupportRuntimeCutover.ts");
  const { pool } = await import("@workspace/db");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  async function cookie(id, kind) {
    const session = await authPostgresSessionAuthority.issueSession({
      accountId: id, accountKind: kind, tenantId: id,
      ...(kind === "admin" ? { adminRole: "assistant_admin", permissions: ["manage_subscriptions"] } : {}),
      deviceLabel: "Manual release test",
    });
    return `fawri_${kind}_session_v2=${session.token}`;
  }
  async function request(route, session, expected, method = "GET", input) {
    const response = await fetch(base + route, {
      method,
      headers: { Cookie: session, ...(input ? { "Content-Type": "application/json" } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    assert.ok([expected].flat().includes(response.status), `${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
    return { ...data, status: response.status };
  }

  try {
    const session = await cookie(merchant, "merchant");
    const otherSession = await cookie(other, "merchant");
    const adminSession = await cookie(admin, "admin");
    const subRoute = `/api/auth/merchants/${merchant}/subscription`;
    const activated = await request(subRoute, adminSession, 200, "PUT", { operation: "activate", plan: "silver" });
    assert.equal(activated.subscription.plan_name, "silver");
    const audit = await ownerPool.query(
      "SELECT actor_account_id, reason_code FROM audit_events WHERE merchant_id = $1 AND action_type = 'plan_activated'",
      [merchant],
    );
    assert.deepEqual(audit.rows, [{ actor_account_id: admin, reason_code: "MANUAL_ENTITLEMENT_OVERRIDE" }]);
    await request("/api/auth/billing/checkout", session, 403, "POST", {});
    await request("/api/auth/billing/providers/superqi/webhook", "", 403, "POST", {});
    await request("/api/meta/webhook", "", 403, "POST", {});
    await request("/api/cashier/subscription", session, 403);

    const order = {
      idempotency_key: "manual-order-retry",
      customer_name: "Synthetic customer",
      customer_phone: "+9647900000061",
      customer_address: "Synthetic address",
      customer_area: "Synthetic area",
      items: [{ product_id: "manual-product-a", quantity: 2, price: 1 }],
    };
    await request("/api/orders", otherSession, 409, "POST", order);
    const results = await Promise.all([1, 2].map(() =>
      request("/api/orders", session, [200, 201], "POST", order)));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
    const created = results[0].order;
    assert.equal(results[1].order.id, created.id);
    assert.equal(created.total_price, 3000);
    assert.equal(created.payment_status, "cash_on_delivery");
    // Enabled order mutations reject a foreign origin. Excluded provider
    // endpoints stop at the manual V1 gate even for an allowed origin.
    for (const [method, endpoint, providerExcluded] of [
      ["POST", "/api/orders", false],
      ["PATCH", `/api/orders/${created.id}/status`, false],
      ["PATCH", `/api/orders/${created.id}/payment-status`, true],
      ["POST", `/api/orders/${created.id}/payment/confirm`, true],
      ["POST", `/api/orders/${created.id}/payment/reject`, true],
      ["POST", `/api/orders/${created.id}/payment/conflict/resolve`, true],
    ]) {
      const origins = ["https://foreign-merchant.example.test"];
      if (providerExcluded) origins.push("https://fawri.example.test");
      for (const origin of origins) {
        const response = await fetch(base + endpoint, {
          method,
          headers: { Cookie: session, Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...order,
            idempotency_key: "cross-origin-rejected",
            expected_version: created.version,
            status: "cancelled",
            payment_status: "paid",
            reason: "synthetic",
            resolution_note: "synthetic",
          }),
          signal: AbortSignal.timeout(15000),
        });
        const denied = await response.json();
        assert.equal(response.status, 403, `${method} ${endpoint} from ${origin} must be forbidden`);
        assert.equal(denied.code, providerExcluded ? "FAWRI_V1_PROVIDER_NOT_OFFERED" : "AUTH_ORIGIN_FORBIDDEN",
          `${method} ${endpoint} from ${origin} must stop at the expected gate`);
      }
    }
    const preserved = await request(`/api/order/${created.id}`, session, 200);
    assert.equal(preserved.order.version, created.version,
      "rejected cross-origin requests must not mutate an order");

    await request("/api/orders", session, 409, "POST", { ...order, customer_name: "Different request" });
    await request(`/api/order/${created.id}`, otherSession, 404);
    const cancelled = await request(`/api/orders/${created.id}/status`, session, 200, "PATCH", {
      expected_version: created.version, status: "cancelled",
    });
    assert.equal(cancelled.order.status, "cancelled");

    const shipping = await request("/api/orders", session, 201, "POST", {
      ...order, idempotency_key: "manual-order-shipping",
    });
    let version = shipping.order.version;
    for (const status of ["confirmed", "preparing", "shipped", "delivered"]) {
      const result = await request(`/api/orders/${shipping.order.id}/status`, session, 200, "PATCH", {
        expected_version: version, status,
      });
      assert.equal(result.order.status, status);
      version = result.order.version;
    }
    const stock = await ownerPool.query("SELECT quantity FROM location_inventory_levels WHERE id = 'manual-stock'");
    assert.equal(stock.rows[0].quantity, 998);

    if (focusedG5) {
      assert.equal((await request("/api/orders", session, 200)).orders.length, 2);
      assert.equal((await request("/api/orders", otherSession, 200)).orders.length, 0);
      const deniedPos = await request("/api/cashier/management/discount-kind", session, 403, "PUT", {
        expected_version: 0, discount_kind: "amount",
      });
      assert.equal(deniedPos.code, "FAWRI_V1_POS_NOT_OFFERED");
      return;
    }

    const concurrency = 25;
    const requests = 100;
    const durations = [];
    let next = 0;
    const start = performance.now();
    await Promise.all(Array.from({ length: concurrency }, async () => {
      for (let index = next++; index < requests; index = next++) {
        const begin = performance.now();
        const result = await request("/api/orders", session, 201, "POST", {
          ...order, idempotency_key: `manual-load-${index}`,
        });
        assert.equal(result.order.total_price, 3000);
        durations.push(performance.now() - begin);
      }
    }));
    const elapsed = performance.now() - start;
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(requests * 0.95) - 1];
    assert.equal((await request("/api/orders", session, 200)).orders.length, requests + 2);
    assert.equal((await request("/api/orders", otherSession, 200)).orders.length, 0);
    assert.ok(p95 < 4000, `manual order p95 ${p95.toFixed(0)} ms`);
    console.log(`MANUAL_ORDER_HTTP_LOAD ${JSON.stringify({
      requests, concurrency, errors: 0, p95_ms: Math.round(p95), elapsed_ms: Math.round(elapsed),
    })}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await stopPostgresSupportRuntimeCutoverForTests();
    await closeAuthenticationPool();
    await pool.end();
    await rm(dataDirectory, { recursive: true, force: true });
  }
}
