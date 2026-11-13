import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {cleanupResources} from "./helpers/cleanup-resources.mjs";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "subscription HTTP golden journey only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "subscription HTTP golden journey only permits the fawri_ci database",
);

const allowedAdminId = "admin-subscription-http-allowed";
const deniedAdminId = "admin-subscription-http-denied";
const merchantId = "merchant-subscription-http-primary";
const otherMerchantId = "merchant-subscription-http-other";
const identityIds = [allowedAdminId, deniedAdminId, merchantId, otherMerchantId];

async function responseJson(response: Response) {
  return {
    response,
    body: await response.json().catch(() => null) as any,
  };
}

function cookie(name: string, token: string): string {
  return `${name}=${token}`;
}

test("secure PostgreSQL admin subscription mutations are visible only to the owning merchant session", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-subscription-http-pg-golden-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });
  const legacyPath = path.join(dataDirectory, "merchants.json");
  const legacySentinel = JSON.stringify({
    subscriptions: [{
      id: "legacy-subscription-must-remain-untouched",
      merchant_id: merchantId,
      plan_name: "diamond",
      replies_remaining: 999999,
    }],
  });
  await writeFile(legacyPath, legacySentinel, "utf8");

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_AUTH_SECURITY_SECRET:
      "subscription-http-golden-security-secret-at-least-32-characters",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
  });

  const {createDisposableKnowledgeRuntime}=await import("./helpers/disposable-knowledge-runtime.mjs");
  const bootstrapUrl=process.env.DATABASE_URL;
  const runtimeFixture=await createDisposableKnowledgeRuntime();
  const {createDisposableSubscriptionDirectoryOperator}=await import("./helpers/disposable-subscription-directory-operator.mjs");
  const operatorFixture=await createDisposableSubscriptionDirectoryOperator(runtimeFixture.admin,bootstrapUrl);
  const [
    { pool },
    { default: express },
    { default: cookieParser },
    { default: authSecurityRouter },
    { authPostgresSessionAuthority },
  ] = await Promise.all([
    Promise.resolve({pool:runtimeFixture.admin}),
    import("express"),
    import("cookie-parser"),
    import("../src/routes/auth-security.js"),
    import("../src/services/authPostgresSessionAuthority.js"),
  ]);

  async function cleanup(): Promise<void> {
    await pool.query("DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])",[identityIds]);
    await pool.query("DELETE FROM accounts WHERE id = ANY($1::text[])", [identityIds]);
  }

  async function seedIdentity(): Promise<void> {
    await cleanup();
    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, state, language,
         phone_verified, phone_verified_at, created_at, updated_at
       ) VALUES
         ($1, 'admin', '+9647700000301', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now()),
         ($2, 'admin', '+9647700000302', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now()),
         ($3, 'merchant', '+9647700000303', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now()),
         ($4, 'merchant', '+9647700000304', 'test-only-hash', 'active', 'en', TRUE, now(), now(), now())`,
      [allowedAdminId, deniedAdminId, merchantId, otherMerchantId],
    );
    await pool.query(
      `INSERT INTO admin_profiles (
         id, account_id, profile_kind, display_name, role,
         enabled, must_change_password, created_at, updated_at
       ) VALUES
         ($1, $1, 'admin', 'Subscription Allowed Admin', 'assistant_admin', TRUE, FALSE, now(), now()),
         ($2, $2, 'admin', 'Subscription Denied Admin', 'assistant_admin', TRUE, FALSE, now(), now())`,
      [allowedAdminId, deniedAdminId],
    );
    await pool.query(
      `INSERT INTO admin_permissions (admin_id, permission, granted_by_admin_id)
       VALUES ($1, 'manage_subscriptions', NULL)`,
      [allowedAdminId],
    );
    await pool.query(
      `INSERT INTO merchants (
         id, account_id, profile_kind, owner_name, store_name, activity_type,
         status, account_status, onboarding_status, trial_status, signup_source,
         warning_stage, products_read_only, metadata, created_at, updated_at
       ) VALUES
         ($1, $1, 'merchant', 'Primary Owner', 'Primary Store', 'test',
          'approved', 'approved', 'channel_connected', 'not_started', 'direct',
          0, FALSE, '{}'::jsonb, now(), now()),
         ($2, $2, 'merchant', 'Other Owner', 'Other Store', 'test',
          'approved', 'approved', 'channel_connected', 'not_started', 'direct',
          0, FALSE, '{}'::jsonb, now(), now())`,
      [merchantId, otherMerchantId],
    );
  }

  await seedIdentity();

  const allowedAdminSession = await authPostgresSessionAuthority.issueSession({
    accountId: allowedAdminId,
    accountKind: "admin",
    tenantId: allowedAdminId,
    adminRole: "assistant_admin",
    permissions: ["manage_subscriptions"],
    deviceLabel: "Subscription Golden Admin",
  });
  const deniedAdminSession = await authPostgresSessionAuthority.issueSession({
    accountId: deniedAdminId,
    accountKind: "admin",
    tenantId: deniedAdminId,
    adminRole: "assistant_admin",
    permissions: [],
    deviceLabel: "Subscription Denied Admin",
  });
  const merchantSession = await authPostgresSessionAuthority.issueSession({
    accountId: merchantId,
    accountKind: "merchant",
    tenantId: merchantId,
    deviceLabel: "Subscription Golden Merchant",
  });
  const otherMerchantSession = await authPostgresSessionAuthority.issueSession({
    accountId: otherMerchantId,
    accountKind: "merchant",
    tenantId: otherMerchantId,
    deviceLabel: "Subscription Other Merchant",
  });

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", authSecurityRouter);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const allowedAdminCookie = cookie(
    "fawri_admin_session_v2",
    allowedAdminSession.token,
  );
  const deniedAdminCookie = cookie(
    "fawri_admin_session_v2",
    deniedAdminSession.token,
  );
  const merchantCookie = cookie(
    "fawri_merchant_session_v2",
    merchantSession.token,
  );
  const otherMerchantCookie = cookie(
    "fawri_merchant_session_v2",
    otherMerchantSession.token,
  );

  t.after(()=>cleanupResources([
    ['HTTP server',()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))],
    ['directory operator',()=>operatorFixture.dispose()],
    ['owned audit and identities',()=>cleanup()],
    ['tenant/auth runtime',()=>runtimeFixture.dispose()],
    ['temporary directory',()=>rm(runtimeDirectory,{recursive:true,force:true})],
  ]));

  const beforeActivation = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  ));
  assert.equal(beforeActivation.response.status, 404);
  assert.equal(beforeActivation.body?.code, "SUBSCRIPTION_NOT_FOUND");

  const deniedActivation = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: deniedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "activate", plan: "silver" }),
    },
  ));
  assert.equal(deniedActivation.response.status, 403);
  assert.equal(deniedActivation.body?.code, "ADMIN_PERMISSION_REQUIRED");

  const stillMissingAfterDeniedMutation = await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(stillMissingAfterDeniedMutation.status, 404);

  const activation = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: allowedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "activate", plan: "silver" }),
    },
  ));
  assert.equal(activation.response.status, 200);
  assert.equal(activation.body?.subscription?.merchant_id, merchantId);
  assert.equal(activation.body?.subscription?.plan_name, "silver");
  assert.equal(activation.body?.subscription?.status, "active");
  const activationVersion = Number(activation.body?.subscription?.version || 0);
  assert.ok(activationVersion > 0);

  const merchantCurrent = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  ));
  assert.equal(merchantCurrent.response.status, 200);
  assert.equal(merchantCurrent.body?.subscription?.merchant_id, merchantId);
  assert.equal(merchantCurrent.body?.subscription?.plan_name, "silver");
  assert.equal(merchantCurrent.body?.subscription?.version, activationVersion);

  const otherMerchantCurrent = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: otherMerchantCookie } },
  ));
  assert.equal(otherMerchantCurrent.response.status, 404);
  assert.equal(otherMerchantCurrent.body?.code, "SUBSCRIPTION_NOT_FOUND");

  // Directory-only permission must not become subscription-list authority.
  await pool.query("INSERT INTO admin_permissions(admin_id,permission,granted_by_admin_id) VALUES($1,'view_merchants',$2)",[deniedAdminId,allowedAdminId]);
  const {listSubscriptionsPostgres}=await import('../src/services/postgresSubscriptionEntitlement.js');
  await assert.rejects(()=>listSubscriptionsPostgres(deniedAdminId),error=>error.status===403 && error.code==='SUBSCRIPTION_ADMIN_PERMISSION_REQUIRED');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM database_admin_access_audits WHERE admin_account_id=$1',[deniedAdminId])).rows[0].n,0);
  const deniedList=await responseJson(await fetch(`${baseUrl}/api/auth/admin/subscriptions`,{headers:{Cookie:deniedAdminCookie}}));
  assert.equal(deniedList.response.status,403);
  assert.equal((await pool.query("SELECT has_function_privilege($1,'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE') AS can_issue",[runtimeFixture.role])).rows[0].can_issue,false);

  const adminList = await responseJson(await fetch(
    `${baseUrl}/api/auth/admin/subscriptions`,
    { headers: { Cookie: allowedAdminCookie } },
  ));
  assert.equal(adminList.response.status, 200);
  assert.ok(
    adminList.body?.subscriptions?.some(
      (subscription: any) => subscription?.merchant_id === merchantId,
    ),
  );

  const audits=(await pool.query("SELECT authority_transaction_id FROM database_admin_access_audits WHERE admin_account_id=$1 AND reason_code='MERCHANT_DIRECTORY_READ'",[allowedAdminId])).rows;
  assert.ok(audits.length>0 && audits.every(row=>BigInt(row.authority_transaction_id)>0n));
  const {withOperatorDirectoryTransaction}=await import('../src/services/operatorDirectoryPostgresAuthority.js');
  const reset=await withOperatorDirectoryTransaction(async client=>(await client.query("SELECT session_user::text AS login,current_user::text AS active,nullif(current_setting('fawri.admin_audit_id',true),'') AS audit")).rows[0]);
  assert.deepEqual(reset,{login:operatorFixture.role,active:operatorFixture.role,audit:null});
  console.log('P0_SUBSCRIPTION_DIRECTORY_OPERATOR_PROOF '+JSON.stringify({actualOperatorLogin:true,primaryIssuerDenied:true,operatorAuditCrudDenied:true,actorFromSession:true,exactSubscriptionPermission:true,directoryOnlyActorDenied:true,rejectedAuditRolledBack:true,positiveTransactionBoundAudit:true,sessionReset:true,productionPredicateChanged:false,releaseAccepted:false}));

  const blockedPlanChange = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: allowedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "change", plan: "gold" }),
    },
  ));
  assert.equal(blockedPlanChange.response.status, 409);
  assert.equal(blockedPlanChange.body?.code, "SUBSCRIPTION_CYCLE_STILL_ACTIVE");

  const baseRepliesToExhaust = Number(
    merchantCurrent.body?.subscription?.base_replies_remaining || 0,
  );
  assert.ok(baseRepliesToExhaust > 0);
  const exhausted = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PATCH",
      headers: {
        Cookie: allowedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "deduct_replies",
        amount: baseRepliesToExhaust,
      }),
    },
  ));
  assert.equal(exhausted.response.status, 200);
  assert.equal(exhausted.body?.subscription?.merchant_id, merchantId);
  assert.equal(exhausted.body?.subscription?.base_replies_remaining, 0);

  const planChange = await responseJson(await fetch(
    `${baseUrl}/api/auth/merchants/${encodeURIComponent(merchantId)}/subscription`,
    {
      method: "PUT",
      headers: {
        Cookie: allowedAdminCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "change", plan: "gold" }),
    },
  ));
  assert.equal(planChange.response.status, 200);
  assert.equal(planChange.body?.subscription?.merchant_id, merchantId);
  assert.equal(planChange.body?.subscription?.plan_name, "gold");
  assert.ok(Number(planChange.body?.subscription?.version || 0) > activationVersion);

  const merchantAfterChange = await responseJson(await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: merchantCookie } },
  ));
  assert.equal(merchantAfterChange.response.status, 200);
  assert.equal(merchantAfterChange.body?.subscription?.merchant_id, merchantId);
  assert.equal(merchantAfterChange.body?.subscription?.plan_name, "gold");
  assert.equal(
    merchantAfterChange.body?.subscription?.version,
    planChange.body?.subscription?.version,
  );

  const otherMerchantAfterChange = await fetch(
    `${baseUrl}/api/auth/subscription/current`,
    { headers: { Cookie: otherMerchantCookie } },
  );
  assert.equal(otherMerchantAfterChange.status, 404);

  assert.equal(
    await readFile(legacyPath, "utf8"),
    legacySentinel,
    "required PostgreSQL subscription authority touched legacy merchants.json",
  );
});
