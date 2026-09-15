import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  approvedKnowledgeSearchSql,
  applyPaymentDecision,
  claimDurableJobs,
  consumeOtpChallenge,
  enqueueInboundAtomically,
  issueOtpChallenge,
  mutateInventory,
  refundBaseReply,
  reserveBaseReply,
  revokeAllSessions,
  rotateSession,
  setTenantContext,
  suppressQueuedAutoReplies,
  trustDevice,
  withTransaction,
} from "./lib/cross-lane-transactions.mjs";

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const sourceUrl = process.env.DATABASE_URL || "";

function requireDisposableUrl(value) {
  const parsed = new URL(value);
  const database = parsed.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !["fawri_ci", "fawri_complete_ci"].includes(database)) {
    throw new Error(`cross-lane acceptance refuses non-disposable DATABASE_URL (${parsed.hostname}/${database})`);
  }
  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || dbRoot, encoding: "utf8", env: process.env });
  assert.equal(result.status, 0, [command, ...args, result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result;
}

async function expectReject(operation, pattern) {
  let caught = null;
  try { await operation(); } catch (error) { caught = error; }
  assert.ok(caught, "expected operation to reject");
  if (pattern) assert.match(String(caught?.message || caught), pattern);
}

const parsed = requireDisposableUrl(sourceUrl);
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `fawri_xlane_${suffix}`.slice(0, 60);
const roleName = `fawri_xlane_role_${suffix}`.slice(0, 60);
assert.match(databaseName, /^[a-z0-9_]+$/);
assert.match(roleName, /^[a-z0-9_]+$/);
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;

const outputName = `.cross-lane-schema-${suffix}`;
const outputDir = path.join(dbRoot, outputName);
const configPath = path.join(dbRoot, `.cross-lane-${suffix}.config.ts`);
let admin = null;
let client = null;

async function createClient() {
  const instance = new Client({ connectionString: testUrl.toString() });
  await instance.connect();
  return instance;
}

async function seedIdentityAndTenants() {
  await client.query(`
    INSERT INTO accounts(id,kind,phone,password_hash,state,language,phone_verified,password_version,security_version,session_version,created_at,updated_at)
    VALUES
      ('m1','merchant','07111111111','hash-m1','active','ar',true,1,1,1,clock_timestamp(),clock_timestamp()),
      ('m2','merchant','07222222222','hash-m2','active','ar',true,1,1,1,clock_timestamp(),clock_timestamp()),
      ('a1','admin','07333333333','hash-a1','active','en',true,1,1,1,clock_timestamp(),clock_timestamp());
    INSERT INTO merchants(id,account_id,profile_kind,owner_name,store_name,activity_type,created_at,updated_at)
    VALUES ('m1','m1','merchant','M1','Store 1','retail',clock_timestamp(),clock_timestamp()),
           ('m2','m2','merchant','M2','Store 2','retail',clock_timestamp(),clock_timestamp());
    INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,created_at,updated_at)
    VALUES ('a1','a1','admin','Owner','owner_admin',true,clock_timestamp(),clock_timestamp());
    INSERT INTO merchant_settings(merchant_id,version,auto_reply_enabled,reply_language,delivery_enabled,delivery_fee_iqd,delivery_estimated_days_min,delivery_estimated_days_max,delivery_areas,delivery_notes,cash_on_delivery_enabled,electronic_payment_enabled,payment_methods,payment_instructions,created_at,updated_at)
    VALUES ('m1',1,true,'auto',true,0,1,3,'[]','',true,false,'["cash_on_delivery"]','',clock_timestamp(),clock_timestamp()),
           ('m2',1,true,'auto',true,0,1,3,'[]','',true,false,'["cash_on_delivery"]','',clock_timestamp(),clock_timestamp());
  `);
}

async function testIdentityConstraints() {
  await expectReject(
    () => client.query("INSERT INTO accounts(id,kind,phone,password_hash,state,language,password_version,security_version,session_version,created_at,updated_at) VALUES('dup','merchant','07111111111','x','active','ar',1,1,1,clock_timestamp(),clock_timestamp())"),
    /accounts_phone_unique|duplicate key/i,
  );
  await expectReject(
    () => client.query("INSERT INTO merchants(id,account_id,profile_kind,owner_name,store_name,activity_type,created_at,updated_at) VALUES('a1','a1','merchant','Wrong','Wrong','retail',clock_timestamp(),clock_timestamp())"),
    /merchants_account_kind_fk|foreign key/i,
  );
}

async function testRls() {
  const security = await client.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('merchant_settings','orders','knowledge_embeddings') ORDER BY relname");
  assert.equal(security.rows.length, 3);
  assert.ok(security.rows.every((row) => row.relrowsecurity === true), JSON.stringify(security.rows));
  await client.query(`CREATE ROLE ${roleName} NOLOGIN`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${roleName}`);
  await client.query(`SET ROLE ${roleName}`);
  await client.query("BEGIN");
  await setTenantContext(client, "m1");
  const visible = await client.query("SELECT merchant_id FROM merchant_settings ORDER BY merchant_id");
  assert.deepEqual(visible.rows.map((row) => row.merchant_id), ["m1"]);
  const blocked = await client.query("UPDATE merchant_settings SET delivery_fee_iqd=99 WHERE merchant_id='m2'");
  assert.equal(blocked.rowCount, 0);
  await client.query("ROLLBACK");
  await client.query("RESET ROLE");

  await client.query("INSERT INTO database_admin_access_audits(id,admin_account_id,merchant_id,reason_code,request_hash,started_at,expires_at) VALUES('audit-ok','a1',NULL,'support_review',$1,clock_timestamp(),clock_timestamp()+interval '5 minutes')", ["a".repeat(64)]);
  await client.query(`SET ROLE ${roleName}`);
  await client.query("BEGIN");
  await client.query("SELECT set_config('fawri.tenant_id','',true),set_config('fawri.admin_audit_id','audit-ok',true),set_config('fawri.admin_account_id','a1',true)");
  const adminVisible = await client.query("SELECT merchant_id FROM merchant_settings ORDER BY merchant_id");
  assert.deepEqual(adminVisible.rows.map((row) => row.merchant_id), ["m1","m2"]);
  await client.query("ROLLBACK");
  await client.query("RESET ROLE");
}

async function testAuthConcurrency() {
  await withTransaction(client, () => issueOtpChallenge(client, {
    id: "otp-1", targetHash: "1".repeat(64), codeHash: "2".repeat(64), ipHash: "3".repeat(64),
    purpose: "password_reset", ttlSeconds: 600, resendSeconds: 60, maxAttempts: 5,
  }));
  const c1 = await createClient();
  const c2 = await createClient();
  try {
    const results = await Promise.all([
      withTransaction(c1, () => consumeOtpChallenge(c1, "otp-1", "2".repeat(64))),
      withTransaction(c2, () => consumeOtpChallenge(c2, "otp-1", "2".repeat(64))),
    ]);
    assert.equal(results.filter((value) => value === "used").length, 1);
    assert.equal(results.filter((value) => value === "revoked").length, 1);
  } finally { await c1.end(); await c2.end(); }

  await withTransaction(client, () => issueOtpChallenge(client, {
    id: "otp-2", targetHash: "1".repeat(64), codeHash: "4".repeat(64), ipHash: "3".repeat(64),
    purpose: "password_reset", ttlSeconds: 600, resendSeconds: 60, maxAttempts: 5,
  }));
  const oldOtp = await client.query("SELECT revoked_at,superseded_by_challenge_id FROM auth_otp_challenges WHERE id='otp-1'");
  assert.equal(oldOtp.rows[0].superseded_by_challenge_id, null, "used OTP must not be superseded retroactively");

  await client.query(`INSERT INTO account_sessions(id,account_id,kind,status,token_hash,tenant_id,device_label,session_version,security_version,permission_snapshot,created_at,last_seen_at,last_activity_at,idle_expires_at,absolute_expires_at,rotate_after)
    VALUES('s0','m1','merchant','active','token0','m1','phone',1,1,'[]',clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '7 days',clock_timestamp()+interval '15 minutes')`);
  const r1 = await createClient();
  const r2 = await createClient();
  try {
    const rotations = await Promise.allSettled([
      withTransaction(r1, () => rotateSession(r1, { sessionId: "s0", successorId: "s1", successorTokenHash: "token1" })),
      withTransaction(r2, () => rotateSession(r2, { sessionId: "s0", successorId: "s2", successorTokenHash: "token2" })),
    ]);
    assert.equal(rotations.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(rotations.filter((item) => item.status === "rejected").length, 1);
  } finally { await r1.end(); await r2.end(); }
  const activeSessions = await client.query("SELECT count(*)::int count FROM account_sessions WHERE account_id='m1' AND status='active'");
  assert.equal(activeSessions.rows[0].count, 1);
  await withTransaction(client, () => revokeAllSessions(client, "m1"));
  const accountVersion = await client.query("SELECT security_version FROM accounts WHERE id='m1'");
  assert.equal(Number(accountVersion.rows[0].security_version), 2);
  const afterRevoke = await client.query("SELECT count(*)::int count FROM account_sessions WHERE account_id='m1' AND status='active'");
  assert.equal(afterRevoke.rows[0].count, 0);

  await withTransaction(client, () => trustDevice(client, { id:"d1",accountId:"a1",kind:"admin",fingerprintHash:"d".repeat(64),label:"one",trustedByAccountId:"a1" }));
  await withTransaction(client, () => trustDevice(client, { id:"d2",accountId:"a1",kind:"admin",fingerprintHash:"e".repeat(64),label:"two",trustedByAccountId:"a1" }));
  await expectReject(() => withTransaction(client, () => trustDevice(client, { id:"d3",accountId:"a1",kind:"admin",fingerprintHash:"f".repeat(64),label:"three",trustedByAccountId:"a1" })), /TRUSTED_DEVICE_CAP_REACHED/);

  const authAuditColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='auth_audit_events'");
  const authColumns = authAuditColumns.rows.map((row) => row.column_name);
  for (const forbidden of ["password","otp","token","secret","cookie","authorization","credential","payload","metadata"]) {
    assert.ok(authColumns.every((name) => !name.includes(forbidden)), `auth audit exposes ${forbidden}`);
  }
}

async function testChannels() {
  await client.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,version,created_at,updated_at) VALUES('ch1','m1','messenger','connected',1,clock_timestamp(),clock_timestamp())");
  await client.query("INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,priority,status,attempts,max_attempts,available_at,created_at,updated_at) VALUES('j1','reply','d1','m1',1,'queued',0,5,clock_timestamp(),clock_timestamp(),clock_timestamp()),('j2','reply','d2','m1',1,'queued',0,5,clock_timestamp(),clock_timestamp(),clock_timestamp())");
  const c1 = await createClient();
  const c2 = await createClient();
  try {
    const [one,two] = await Promise.all([
      withTransaction(c1, () => claimDurableJobs(c1,"w1",1,60)),
      withTransaction(c2, () => claimDurableJobs(c2,"w2",1,60)),
    ]);
    assert.equal(one.length,1); assert.equal(two.length,1); assert.notEqual(one[0].id,two[0].id);
  } finally { await c1.end(); await c2.end(); }

  const inboundInput = { eventId:"evt1",merchantId:"m1",channelId:"ch1",provider:"messenger",externalEventId:"ext1",payloadHash:"a".repeat(64),jobId:"j3",jobType:"inbound",dedupeKey:"ext1",payloadCiphertext:"cipher",payloadKeyId:"key1",settingsVersion:1 };
  assert.equal(await withTransaction(client, () => enqueueInboundAtomically(client,inboundInput)), "inserted");
  assert.equal(await withTransaction(client, () => enqueueInboundAtomically(client,{...inboundInput,eventId:"evt2",jobId:"j4",dedupeKey:"ext2"})), "duplicate");
  const strayJob = await client.query("SELECT count(*)::int count FROM background_jobs WHERE id='j4'");
  assert.equal(strayJob.rows[0].count,0);
  const adminJobColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='background_jobs'");
  assert.ok(adminJobColumns.rows.every((row) => row.column_name !== "payload"));

  await client.query(`INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,starts_at,expires_at,version,created_at,updated_at)
    VALUES('sub1','m1','silver','active',25000,1,10,0,10,clock_timestamp(),clock_timestamp()+interval '30 days',1,clock_timestamp(),clock_timestamp())`);
  const reserved = await withTransaction(client, () => reserveBaseReply(client,{ reservationId:"rr1",ledgerId:"led1",merchantId:"m1",subscriptionId:"sub1",inboundEventId:"evt1",externalEventId:"ext1" }));
  assert.deepEqual(reserved,{before:10,after:9});
  assert.equal(await withTransaction(client, () => refundBaseReply(client,{ refundId:"rf1",ledgerId:"led2",reservationId:"rr1",merchantId:"m1",failureCode:"META_CONFIRMED_FAILED" })),"refunded");
  assert.equal(await withTransaction(client, () => refundBaseReply(client,{ refundId:"rf2",ledgerId:"led3",reservationId:"rr1",merchantId:"m1",failureCode:"META_CONFIRMED_FAILED" })),"refunded");
  const credits = await client.query("SELECT count(*)::int count FROM reply_ledger WHERE direction='credit' AND external_event_id='ext1'");
  assert.equal(credits.rows[0].count,1);

  await client.query("INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,status,attempts,max_attempts,settings_version,available_at,created_at,updated_at) VALUES('j5','auto_reply','auto1','m1','queued',0,5,1,clock_timestamp(),clock_timestamp(),clock_timestamp()),('j6','auto_reply','auto2','m1','retry',1,5,1,clock_timestamp(),clock_timestamp(),clock_timestamp())");
  const suppression = await withTransaction(client, () => suppressQueuedAutoReplies(client,"m1",1,"auto_reply"));
  assert.deepEqual(suppression,{version:2,suppressed:2});
}

async function testOrders() {
  await client.query(`INSERT INTO orders(id,merchant_id,customer_name,status,payment_method,payment_status,subtotal_iqd,delivery_fee_iqd,total_iqd,source_channel,version,created_at,updated_at)
    VALUES('o1','m1','Customer','confirmed','superqi','electronic_pending',1000,0,1000,'messenger',1,clock_timestamp(),clock_timestamp()),
          ('o2','m1','Legacy','delivered','cash_on_delivery','cash_on_delivery',2000,0,2000,'legacy',1,clock_timestamp(),clock_timestamp())`);
  assert.equal(await withTransaction(client, () => applyPaymentDecision(client,{ decisionId:"pd1",merchantId:"m1",orderId:"o1",operation:"confirm",paymentChannel:"electronic",outcome:"paid",resultingOrderStatus:"confirmed",actorType:"merchant",actorAccountId:"m1",actorSessionFingerprint:"a".repeat(64),requestId:"req1",expectedVersion:1 })),2);
  const linkage = await client.query("SELECT decision_id FROM order_terminal_decision_links WHERE merchant_id='m1' AND order_id='o1'");
  assert.equal(linkage.rows[0].decision_id,"pd1");
  assert.equal(await withTransaction(client, () => applyPaymentDecision(client,{ decisionId:"pd2",merchantId:"m1",orderId:"o2",operation:"legacy_import",paymentChannel:"cash_on_delivery",outcome:"paid",resultingOrderStatus:"delivered",actorType:"system",actorAccountId:null,expectedVersion:1,sourceFile:"bot-runtime.json",sourceSha256:"b".repeat(64),migrationBatchId:"batch-1" })),2);
  const legacy = await client.query("SELECT actor_type,actor_account_id,source_sha256 FROM order_payment_decisions WHERE id='pd2'");
  assert.equal(legacy.rows[0].actor_type,"system"); assert.equal(legacy.rows[0].actor_account_id,null); assert.equal(legacy.rows[0].source_sha256,"b".repeat(64));
}

async function testCatalog() {
  await client.query(`INSERT INTO products(id,merchant_id,name,original_price_iqd,current_price_iqd,quantity,low_stock_threshold,variant_stock_mode,version,status,created_at,updated_at)
    VALUES('p1','m1','Product',1000,1000,10,2,false,1,'available',clock_timestamp(),clock_timestamp()),
          ('p2','m2','Other',1000,1000,5,1,false,1,'available',clock_timestamp(),clock_timestamp());
    INSERT INTO product_variants(id,product_id,merchant_id,name,quantity,price_adjustment_iqd,option_signature,version,created_at,updated_at)
    VALUES('v1','p1','m1','Large',3,0,'size=large-000001',1,clock_timestamp(),clock_timestamp());
    INSERT INTO catalog_identifiers(id,merchant_id,kind,normalized_value,display_value,owner_type,product_id,created_at)
    VALUES('ci1','m1','sku','sku-1','SKU-1','product','p1',clock_timestamp());`);
  await expectReject(() => client.query("INSERT INTO catalog_identifiers(id,merchant_id,kind,normalized_value,display_value,owner_type,product_id,variant_id,created_at) VALUES('ci2','m1','sku','sku-1','sku-1','variant','p1','v1',clock_timestamp())"), /catalog_identifiers_merchant_kind_value_unique|duplicate key/i);
  const c1 = await createClient(); const c2 = await createClient();
  try {
    const results = await Promise.allSettled([
      withTransaction(c1, () => mutateInventory(c1,{ mutationId:"im1",merchantId:"m1",productId:"p1",type:"adjust",value:-2,expectedVersion:1,actorType:"merchant",actorAccountId:"m1",reasonCode:"sale",idempotencyKeyHash:"c".repeat(64),requestHash:"d".repeat(64) })),
      withTransaction(c2, () => mutateInventory(c2,{ mutationId:"im2",merchantId:"m1",productId:"p1",type:"adjust",value:-1,expectedVersion:1,actorType:"merchant",actorAccountId:"m1",reasonCode:"sale",idempotencyKeyHash:"e".repeat(64),requestHash:"f".repeat(64) })),
    ]);
    assert.equal(results.filter((item)=>item.status==="fulfilled").length,1);
    assert.equal(results.filter((item)=>item.status==="rejected").length,1);
  } finally { await c1.end(); await c2.end(); }
  const product = await client.query("SELECT quantity,version FROM products WHERE id='p1'");
  assert.equal(Number(product.rows[0].version),2);
  assert.ok([8,9].includes(Number(product.rows[0].quantity)));
}

async function testKnowledge() {
  const columns = await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_name IN ('training_requests','knowledge_audit_events','knowledge_embeddings')");
  for (const forbidden of ["customer_message","raw_customer_query","customer_query","payload"]) {
    assert.ok(columns.rows.every((row) => row.column_name !== forbidden), `knowledge schema contains ${forbidden}`);
  }
  await client.query("INSERT INTO training_requests(id,merchant_id,customer_text_preview,customer_text_hash,customer_text_length,detected_intent,detected_language,reason,status,version,created_at,updated_at) VALUES('tr1','m1','redacted','1'::text || repeat('1',63),8,'delivery','ar','needs_answer','pending_review',1,clock_timestamp(),clock_timestamp()),('tr2','m2','redacted','2'::text || repeat('2',63),8,'delivery','ar','needs_answer','pending_review',1,clock_timestamp(),clock_timestamp())");
  await client.query("INSERT INTO learned_answers(id,merchant_id,training_request_id,intent,language,examples,keywords,answer_text,source,approval_status,confidence,safe_to_auto_reply,version,created_at,updated_at) VALUES('la1','m1','tr1','delivery','ar','[]','[]','Approved','merchant_approved','approved',0.9,true,1,clock_timestamp(),clock_timestamp()),('la2','m2','tr2','delivery','ar','[]','[]','Other','merchant_approved','approved',0.9,true,1,clock_timestamp(),clock_timestamp()),('la-ai','m1',NULL,'delivery','ar','[]','[]','Generated','openai_generated','pending_review',0.5,false,1,clock_timestamp(),clock_timestamp())");
  await expectReject(() => client.query("UPDATE learned_answers SET approval_status='approved',safe_to_auto_reply=true WHERE id='la-ai'"), /learned_answers_openai_cannot_approve_check|learned_answers_safe_approval_check|check constraint/i);
  await expectReject(() => client.query("INSERT INTO learned_answers(id,merchant_id,training_request_id,intent,language,examples,keywords,answer_text,source,approval_status,confidence,safe_to_auto_reply,version,created_at,updated_at) VALUES('cross','m1','tr2','x','ar','[]','[]','x','merchant_approved','approved',1,true,1,clock_timestamp(),clock_timestamp())"), /learned_answers_training_merchant_fk|foreign key/i);
  await client.query("INSERT INTO knowledge_embeddings(id,merchant_id,knowledge_kind,knowledge_id,learned_answer_id,language,embedding_model,content_hash,dimensions,embedding,created_at,updated_at) VALUES('emb1','m1','learned_answer','la1','la1','ar','test-model',$1,2,ARRAY[1::real,0::real],clock_timestamp(),clock_timestamp()),('emb2','m2','learned_answer','la2','la2','ar','test-model',$2,2,ARRAY[1::real,0::real],clock_timestamp(),clock_timestamp())", ["a".repeat(64),"b".repeat(64)]);
  const search = await client.query(approvedKnowledgeSearchSql,["m1","test-model",[1,0],10]);
  assert.deepEqual(search.rows.map((row)=>row.knowledge_id),["la1"]);
}

async function main() {
  fs.writeFileSync(configPath, `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ dialect:"postgresql", schema:"./src/schema/*.ts", out:"./${outputName}" });\n`);
  run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec","drizzle-kit","generate","--config",configPath]);
  const sqlFile = fs.readdirSync(outputDir).find((name)=>/^0000_.*\.sql$/.test(name));
  assert.ok(sqlFile,"complete schema SQL missing");
  const schemaSql = fs.readFileSync(path.join(outputDir,sqlFile),"utf8");
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${databaseName}`);
  client = await createClient();
  await client.query(schemaSql.replaceAll("--> statement-breakpoint",""));
  await seedIdentityAndTenants();
  await testIdentityConstraints();
  await testRls();
  await testAuthConcurrency();
  await testChannels();
  await testOrders();
  await testCatalog();
  await testKnowledge();
  process.stdout.write(JSON.stringify({ok:true,database:databaseName,source_schema:true,production_contacted:false})+"\n");
}

try {
  await main();
} finally {
  try { if (client) { await client.query("RESET ROLE").catch(()=>{}); await client.end(); } } catch {}
  try {
    if (admin) {
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",[databaseName]);
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
      await admin.end();
    }
  } catch {}
  fs.rmSync(configPath,{force:true});
  fs.rmSync(outputDir,{recursive:true,force:true});
}
