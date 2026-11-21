import assert from "node:assert/strict";
import { createDisposableKnowledgeRuntime } from "./helpers/disposable-knowledge-runtime.mjs";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("background subscription refresh reaches tenants under restricted RLS and remains idempotent", { timeout: 60_000 }, async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const targetUrl = new URL(originalUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(targetUrl.hostname));
  assert.ok(["/fawri_ci", "/fawri_final_audit"].includes(targetUrl.pathname));
  const runtime = await createDisposableKnowledgeRuntime();
  const admin = runtime.admin;
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const role = runtime.role;
  const merchants = [0, 1, 2].map(i => `subscription-${i}-${suffix}`);

  let runtimePool;
  try {
    for (const [i, id] of merchants.entries()) {
      await admin.query("INSERT INTO accounts(id,kind,phone,password_hash) VALUES($1,'merchant',$2,'synthetic-test-hash')", [id, `+1888${Date.now().toString().slice(-8)}${i}`]);
      await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type) VALUES($1,$1,'Test','Test','electronics')", [id]);
      if (i < 2) await admin.query(`INSERT INTO subscriptions(id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at)
        VALUES($1,$2,'trial','active',1,now()-interval '10 days',now()+($3::int * interval '1 day'))`, [`sub-${id}`, id, i === 0 ? 1 : -1]);
    }
    process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
    const db = await import("@workspace/db");
    runtimePool = db.pool;
    runtimePool.options.max = 1;
    runtimePool.options.connectionTimeoutMillis = 5_000;
    assert.deepEqual((await runtimePool.query("SELECT current_user AS name,session_user AS login")).rows[0], {name:role,login:role});
    assert.equal((await runtimePool.query("SELECT count(*)::int AS count FROM subscriptions")).rows[0].count, 0,
      "the old unscoped enumeration cannot see subscriptions");
    const { refreshSubscriptionNotificationsPostgresForAllMerchants } = await import("../src/services/postgresMerchantNotificationAuthority.ts");
    await refreshSubscriptionNotificationsPostgresForAllMerchants();
    await refreshSubscriptionNotificationsPostgresForAllMerchants();
    const rows = (await admin.query("SELECT merchant_id,type FROM notifications WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id,type", [merchants])).rows;
    assert.deepEqual(rows, [
      { merchant_id: merchants[0], type: "subscription_expiry_reminder" },
      { merchant_id: merchants[1], type: "subscription_expired" },
    ]);
    assert.equal((await runtimePool.query("SELECT count(*)::int AS count FROM subscriptions")).rows[0].count, 0,
      "tenant context must be removed before returning the connection");
  } finally {
    try {
      await admin.query("DELETE FROM notifications WHERE merchant_id=ANY($1::text[])", [merchants]);
      await admin.query("DELETE FROM subscriptions WHERE merchant_id=ANY($1::text[])", [merchants]);
      await admin.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [merchants]);
    } finally {
      await runtime.dispose();
      if (originalAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
      else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = originalAuthority;
    }
  }
});
