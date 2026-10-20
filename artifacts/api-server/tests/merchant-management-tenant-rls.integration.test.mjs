import {createDisposableAuthenticationRole,restrictTenantAuthenticationPrivileges} from './helpers/disposable-authentication-role.mjs';
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {assertDisposablePostgres} from "../../../scripts/lib/disposable-postgres-test-guard.mjs";
await assertDisposablePostgres();

test("merchant management and retention use authoritative subscriptions under restricted RLS", { timeout: 60_000 }, async (t) => {
  const originalUrl = process.env.DATABASE_URL;
  const originalAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const originalAuthUrl=process.env.FAWRI_AUTH_DATABASE_URL,originalOperatorUrl=process.env.FAWRI_OPERATOR_DATABASE_URL;
  let authFixture,operatorCreated=false,closeAuth=async()=>{},closeOperator=async()=>{};
  const url = new URL(originalUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.ok(["/fawri_ci", "/fawri_final_audit"].includes(url.pathname));
  const { Pool } = createRequire(import.meta.resolve("@workspace/db"))("pg");
  const admin = new Pool({ connectionString: originalUrl, connectionTimeoutMillis: 5_000 });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const role = `management_rls_${suffix}`,operator=`management_op_${suffix}`;
  const runtimePassword=randomUUID().replaceAll('-',''),operatorPassword=randomUUID().replaceAll('-','');
  const owner = `management-owner-${suffix}`;
  const merchants = [0, 1, 2].map(i => `management-${i}-${suffix}`);
  let runtimePool;
  let roleCreated = false;
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT`);
    roleCreated = true;
    authFixture=await createDisposableAuthenticationRole(admin,originalUrl);
    await admin.query(`CREATE ROLE ${operator} LOGIN PASSWORD '${operatorPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT`);operatorCreated=true;
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${operator}`);
    await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${operator}`);
    await admin.query(`REVOKE ALL ON database_admin_access_audits FROM ${operator}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO ${operator}`);
    const operatorUrl=new URL(originalUrl);operatorUrl.username=operator;operatorUrl.password=operatorPassword;operatorUrl.search='';
    process.env.FAWRI_AUTH_DATABASE_URL=authFixture.url;process.env.FAWRI_OPERATOR_DATABASE_URL=operatorUrl.toString();
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await restrictTenantAuthenticationPrivileges(admin,role);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')", [owner, `+1887${Date.now().toString().slice(-8)}9`]);
    await admin.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Synthetic owner','owner_admin',true,false)", [owner]);
    for (const [i, id] of merchants.entries()) {
      await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified,phone_verified_at) VALUES($1,'merchant',$2,'synthetic','suspended',true,now())", [id, `+1887${Date.now().toString().slice(-8)}${i}`]);
      await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,last_subscription_ended_at) VALUES($1,$1,'Synthetic','Synthetic','retail','suspended','suspended',now()-interval '400 days')", [id]);
      await admin.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at,base_reply_limit,base_replies_remaining,suspended_at) VALUES($1,$2,'trial','suspended',1,now()-interval '1 day',now()+interval '7 days',100,100,now())", [`sub-${id}`, id]);
    }
    await admin.query("UPDATE merchants SET retention_suspended_at=now()-interval '1 day' WHERE id=$1", [merchants[1]]);
    url.username=role;url.password=runtimePassword;url.search='';
    process.env.DATABASE_URL = url.toString();
    process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
    runtimePool = (await import("@workspace/db")).pool;
    runtimePool.options.max = 1;
    runtimePool.options.connectionTimeoutMillis = 5_000;
    assert.deepEqual((await runtimePool.query("SELECT current_user AS active,session_user AS login")).rows[0],{active:role,login:role});
    closeAuth=(await import('../src/services/authenticationPostgresAuthority.ts')).closeAuthenticationPool;
    closeOperator=(await import('../src/services/operatorDirectoryPostgresAuthority.ts')).closeOperatorDirectoryPool;
    await (await import('../src/services/postgresRuntimeRlsSecurity.ts')).assertProductionDatabaseRlsReady({...process.env,NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production'},runtimePool);
    const management = await import("../src/services/postgresMerchantManagementAuthority.ts");
    const retention = await import("../src/services/postgresMerchantRetentionAuthority.ts");
    await t.test("details and authorized directory include subscription dates", async () => {
      const detail = await management.getManagedMerchantPostgres(merchants[0]);
      const listed = await management.listManagedMerchantsPostgres(owner);
      assert.ok(detail.subscription_expires_at);
      for (const id of merchants) assert.ok(listed.find(row => row.id === id)?.subscription_expires_at);
    });
    await t.test("resuming an eligible merchant restores its subscription", async () => {
      await management.updateMerchantStatusPostgres({ merchantId: merchants[0], status: "approved", actorAdminId: owner, reason: "Synthetic resume" });
      const row = (await admin.query("SELECT status,auto_reply_enabled FROM subscriptions WHERE merchant_id=$1", [merchants[0]])).rows[0];
      assert.deepEqual(row, { status: "active", auto_reply_enabled: true });
    });
    await t.test("renewed subscription restores retention-suspended merchant", async () => {
      const result = await retention.refreshMerchantRetentionPostgres(merchants[1]);
      assert.equal(result.retentionStatus, "protected");
      assert.equal(result.accountSuspended, false);
      assert.equal((await admin.query("SELECT state FROM accounts WHERE id=$1", [merchants[1]])).rows[0].state, "active");
    });
    await t.test("a current subscription prevents retention-expiry deletion request", async () => {
      await assert.rejects(management.createDeletionRequestPostgres({ merchantId: merchants[2], actorAdminId: owner, reason: "retention_expired", details: "Synthetic invalid retention request" }), { code: "MERCHANT_NOT_ELIGIBLE_FOR_DELETION" });
    });
    await t.test("cross-tenant directory access is audited and rejects inactive identities", async () => {
      const rows = (await admin.query("SELECT reason_code FROM database_admin_access_audits WHERE admin_account_id=$1", [owner])).rows;
      assert.ok(rows.some(row => row.reason_code === "MERCHANT_DIRECTORY_READ"));
      await assert.rejects(management.listManagedMerchantsPostgres(merchants[0]), { code: "ADMIN_ACCOUNT_INVALID" });
      await admin.query("UPDATE accounts SET state='suspended' WHERE id=$1", [owner]);
      await assert.rejects(management.listManagedMerchantsPostgres(owner), { code: "ADMIN_ACCOUNT_INVALID" });
      assert.equal((await runtimePool.query("SELECT count(*)::int AS count FROM subscriptions")).rows[0].count, 0, "pooled connection must reset tenant and admin contexts");
      assert.equal((await admin.query("SELECT status FROM subscriptions WHERE merchant_id=$1", [merchants[2]])).rows[0].status, "suspended");
    });
  } finally {
    await closeAuth();await closeOperator();await runtimePool?.end();
    if(originalAuthUrl===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=originalAuthUrl;
    if(originalOperatorUrl===undefined)delete process.env.FAWRI_OPERATOR_DATABASE_URL;else process.env.FAWRI_OPERATOR_DATABASE_URL=originalOperatorUrl;
    process.env.DATABASE_URL = originalUrl;
    if (originalAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = originalAuthority;
    try {
      await authFixture?.dispose();
      if(operatorCreated){await admin.query(`DROP OWNED BY ${operator}`);await admin.query(`DROP ROLE ${operator}`);}
      if (roleCreated) { await admin.query(`DROP OWNED BY ${role}`); await admin.query(`DROP ROLE ${role}`); }
    } finally { await admin.end(); }
  }
});
