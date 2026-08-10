import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStabilizedMigrationFolder } from "../../lib/db/scripts/lib/migration-sql-order.mjs";
import { setTenantContext } from "../../lib/db/scripts/lib/cross-lane-transactions.mjs";
import { buildValidatedMigrationPlan } from "../lib/postgresql-migration-plan-safe.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dbRequire = createRequire(path.join(root, "lib", "db", "package.json"));
const { drizzle } = dbRequire("drizzle-orm/node-postgres");
const { migrate } = dbRequire("drizzle-orm/node-postgres/migrator");
const pg = dbRequire("pg");
const { Client, Pool } = pg;
const committedDrizzle = path.join(root, "lib", "db", "drizzle");
const fixtureScript = path.join(
  root,
  "scripts",
  "tests",
  "fixtures",
  "create-postgresql-migration-fixture.mjs",
);

function disposable(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname.replace(/^\//, "") === "fawri_ci"
    );
  } catch {
    return false;
  }
}

async function expectReject(operation, pattern) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected operation to reject");
  if (pattern) assert.match(String(caught?.message || caught), pattern);
}

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fawri-weak-session-"),
  );
  const result = spawnSync(process.execPath, [fixtureScript, directory], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return directory;
}

test("weak legacy sessions change source identity but are not migrated", () => {
  const directory = createFixture();
  try {
    const baseline = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    }).report;
    assert.equal(baseline.ok, true, JSON.stringify(baseline.errors, null, 2));
    assert.equal("account_sessions" in baseline.rows, false);

    const runtimePath = path.join(directory, "bot-runtime.json");
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    runtime.sessions = [
      {
        id: "legacy-session-weak-1",
        merchant_id: "merchant-1",
        token: "raw-legacy-token",
        device_id: "legacy-device",
        expires_at: "2099-01-01T00:00:00.000Z",
      },
    ];
    fs.writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");

    const withWeakSession = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    }).report;
    assert.equal(
      withWeakSession.ok,
      true,
      JSON.stringify(withWeakSession.errors, null, 2),
    );
    assert.equal(
      "account_sessions" in withWeakSession.rows,
      false,
      "legacy token/device material must never become an authoritative account session",
    );
    assert.notEqual(
      withWeakSession.source_manifest_sha256,
      baseline.source_manifest_sha256,
      "ignored legacy session material must still participate in source identity",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test(
  "committed migration chain enforces edge cross-lane PostgreSQL gates",
  { skip: !disposable(process.env.DATABASE_URL), timeout: 120_000 },
  async () => {
    const baseUrl = new URL(process.env.DATABASE_URL);
    const suffix = `${process.pid}_${Date.now()}`;
    const databaseName = `fawri_edge_${suffix}`.slice(0, 60);
    const roleName = `fawri_edge_role_${suffix}`.slice(0, 60);
    assert.match(databaseName, /^[a-z0-9_]+$/);
    assert.match(roleName, /^[a-z0-9_]+$/);

    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";
    const testUrl = new URL(baseUrl);
    testUrl.pathname = `/${databaseName}`;
    const migrationsFolder = createStabilizedMigrationFolder(committedDrizzle);

    let admin = null;
    let pool = null;
    let client = null;
    let rls = null;
    try {
      admin = new Client({ connectionString: adminUrl.toString() });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${databaseName}`);

      pool = new Pool({ connectionString: testUrl.toString() });
      await migrate(drizzle(pool), { migrationsFolder });
      const history = await pool.query(
        'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',
      );
      assert.equal(history.rows[0].count, 5, "committed chain must apply 5 migrations");

      client = new Client({ connectionString: testUrl.toString() });
      await client.connect();
      await client.query(`
        INSERT INTO accounts(id,kind,phone,password_hash,state,language,phone_verified,password_version,security_version,session_version,created_at,updated_at)
        VALUES
          ('m1','merchant','07111111111','hash-m1','active','ar',true,1,1,1,clock_timestamp(),clock_timestamp()),
          ('m2','merchant','07222222222','hash-m2','active','ar',true,1,1,1,clock_timestamp(),clock_timestamp()),
          ('a1','admin','07333333333','hash-a1','active','en',true,1,1,1,clock_timestamp(),clock_timestamp());
        INSERT INTO merchants(id,account_id,profile_kind,owner_name,store_name,activity_type,created_at,updated_at)
        VALUES
          ('m1','m1','merchant','M1','Store 1','retail',clock_timestamp(),clock_timestamp()),
          ('m2','m2','merchant','M2','Store 2','retail',clock_timestamp(),clock_timestamp());
        INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,created_at,updated_at)
        VALUES ('a1','a1','admin','Owner','owner_admin',true,clock_timestamp(),clock_timestamp());
      `);

      await expectReject(
        () =>
          client.query(
            "INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,created_at,updated_at) VALUES('m1','m1','admin','Wrong','assistant_admin',true,clock_timestamp(),clock_timestamp())",
          ),
        /admin_profiles_account_kind_fk|foreign key/i,
      );

      await client.query(`
        INSERT INTO products(id,merchant_id,name,original_price_iqd,current_price_iqd,quantity,low_stock_threshold,variant_stock_mode,version,status,created_at,updated_at)
        VALUES
          ('p1','m1','Product 1',1000,1000,10,2,false,1,'available',clock_timestamp(),clock_timestamp()),
          ('p2','m2','Product 2',1000,1000,5,1,false,1,'available',clock_timestamp(),clock_timestamp());
        INSERT INTO product_variants(id,product_id,merchant_id,name,quantity,price_adjustment_iqd,option_signature,version,created_at,updated_at)
        VALUES('v1','p1','m1','Large',3,0,'size=large-000001',1,clock_timestamp(),clock_timestamp());
        INSERT INTO catalog_variant_options(id,merchant_id,product_id,variant_id,option_name,normalized_option_name,option_value,normalized_option_value,ordinal)
        VALUES('opt1','m1','p1','v1','Size','size','Large','large',0);
        INSERT INTO catalog_image_references(id,merchant_id,product_id,variant_id,url,ordinal,created_at)
        VALUES('img1','m1','p1','v1','https://example.invalid/p1.png',0,clock_timestamp());
        INSERT INTO catalog_idempotency_keys(id,merchant_id,operation,key_hash,request_hash,result_product_id,result_version,result_code,created_at,expires_at)
        VALUES('idem1','m1','product_upsert',repeat('a',64),repeat('b',64),'p1',1,'ok',clock_timestamp(),clock_timestamp()+interval '1 day');
      `);

      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_variant_options(id,merchant_id,product_id,variant_id,option_name,normalized_option_name,option_value,normalized_option_value,ordinal) VALUES('opt2','m1','p1','v1','SIZE','size','XL','xl',1)",
          ),
        /catalog_variant_options_variant_name_unique|duplicate key/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_variant_options(id,merchant_id,product_id,variant_id,option_name,normalized_option_name,option_value,normalized_option_value,ordinal) VALUES('opt-cross','m2','p2','v1','Size','size','Large','large',0)",
          ),
        /catalog_variant_options_variant_tenant_fk|foreign key/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_image_references(id,merchant_id,product_id,url,ordinal,created_at) VALUES('img-data','m1','p1','data:image/png;base64,AAAA',0,clock_timestamp())",
          ),
        /catalog_image_refs_url_check|check constraint/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_image_references(id,merchant_id,product_id,url,ordinal,created_at) VALUES('img-cross','m1','p2','https://example.invalid/cross.png',0,clock_timestamp())",
          ),
        /catalog_image_refs_product_tenant_fk|foreign key/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_idempotency_keys(id,merchant_id,operation,key_hash,request_hash,result_product_id,result_version,result_code,created_at,expires_at) VALUES('idem2','m1','product_upsert',repeat('a',64),repeat('c',64),'p1',1,'ok',clock_timestamp(),clock_timestamp()+interval '1 day')",
          ),
        /catalog_idempotency_merchant_operation_key_unique|duplicate key/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_idempotency_keys(id,merchant_id,operation,key_hash,request_hash,result_product_id,result_version,result_code,created_at,expires_at) VALUES('idem-cross','m1','product_upsert',repeat('d',64),repeat('e',64),'p2',1,'ok',clock_timestamp(),clock_timestamp()+interval '1 day')",
          ),
        /catalog_idempotency_product_tenant_fk|foreign key/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO catalog_idempotency_keys(id,merchant_id,operation,key_hash,request_hash,result_product_id,result_version,result_code,created_at,expires_at) VALUES('idem-long','m1','product_upsert',repeat('f',64),repeat('0',64),'p1',1,'ok',clock_timestamp(),clock_timestamp()+interval '31 days')",
          ),
        /catalog_idempotency_retention_check|check constraint/i,
      );

      await client.query(`
        INSERT INTO merchant_channels(id,merchant_id,platform,status,version,created_at,updated_at)
        VALUES('ch1','m1','messenger','connected',1,clock_timestamp(),clock_timestamp());
        INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,status,attempts,max_attempts,available_at,created_at,updated_at)
        VALUES('job1','inbound','edge-1','m1','queued',0,5,clock_timestamp(),clock_timestamp(),clock_timestamp());
        INSERT INTO channel_inbound_events(id,merchant_id,channel_id,provider,external_event_id,payload_hash,enqueue_job_id,received_at,enqueue_committed_at)
        VALUES('evt1','m1','ch1','messenger','edge-ext-1',repeat('1',64),'job1',clock_timestamp(),clock_timestamp());
        INSERT INTO outbound_deliveries(id,merchant_id,inbound_event_id,reply_intent_id,outcome,attempted_at,finalized_at)
        VALUES('out-uncertain','m1','evt1','intent-1','uncertain',clock_timestamp(),clock_timestamp());
      `);
      const uncertain = await client.query(
        "SELECT outcome,failure_code,finalized_at IS NOT NULL AS finalized FROM outbound_deliveries WHERE id='out-uncertain'",
      );
      assert.deepEqual(
        {
          outcome: uncertain.rows[0].outcome,
          failureCode: uncertain.rows[0].failure_code,
          finalized: uncertain.rows[0].finalized,
        },
        { outcome: "uncertain", failureCode: null, finalized: true },
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO outbound_deliveries(id,merchant_id,inbound_event_id,reply_intent_id,outcome,attempted_at,finalized_at) VALUES('out-bad-pending','m1','evt1','intent-2','pending',clock_timestamp(),clock_timestamp())",
          ),
        /outbound_deliveries_outcome_check|check constraint/i,
      );
      await expectReject(
        () =>
          client.query(
            "INSERT INTO outbound_deliveries(id,merchant_id,inbound_event_id,reply_intent_id,outcome,attempted_at,finalized_at) VALUES('out-bad-failed','m1','evt1','intent-3','confirmed_failed',clock_timestamp(),clock_timestamp())",
          ),
        /outbound_deliveries_outcome_check|check constraint/i,
      );

      await client.query(`CREATE ROLE ${roleName} NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
      await client.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${roleName}`,
      );
      rls = new Client({ connectionString: testUrl.toString() });
      await rls.connect();
      await rls.query(`SET ROLE ${roleName}`);
      await rls.query("BEGIN");
      await setTenantContext(rls, "m1");
      const visible = await rls.query(
        "SELECT id,merchant_id FROM products ORDER BY id",
      );
      assert.deepEqual(visible.rows, [{ id: "p1", merchant_id: "m1" }]);
      const blocked = await rls.query(
        "UPDATE products SET quantity=99 WHERE id='p2'",
      );
      assert.equal(blocked.rowCount, 0);
      await rls.query("ROLLBACK");
      await rls.query("RESET ROLE");
    } finally {
      try {
        if (rls) await rls.end();
      } catch {}
      try {
        if (client) await client.end();
      } catch {}
      try {
        if (pool) await pool.end();
      } catch {}
      try {
        if (admin) {
          await admin.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
            [databaseName],
          );
          await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
          await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
          await admin.end();
        }
      } catch {}
      fs.rmSync(migrationsFolder, { recursive: true, force: true });
    }
  },
);
