/**
 * PG18 proof for held trial-evidence ledger. Synthetic data only; no hosted
 * connections, no Neon, no permanent schema changes. All objects rollback.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const source = readFileSync(new URL("../first-commercial/held/v1_trial_evidence_ledger.sql", import.meta.url), "utf8");
const REVIEWED_SHA = "e0d6cf9a450305998b00210da210429a3dd95abc";
assert.equal(createHash("sha1").update("blob "+Buffer.byteLength(source)+"\0"+source).digest("hex"),REVIEWED_SHA,"TRIAL_HELD_SOURCE_DRIFT");
const proofSource=readFileSync(new URL("../first-commercial/held/v1_trial_whatsapp_proof_source.sql",import.meta.url),"utf8");
const PROOF_REVIEWED_SHA="963273da0a9adbef5f42ab475524b9e49e8dc613";
assert.equal(createHash("sha1").update("blob "+Buffer.byteLength(proofSource)+"\0"+proofSource).digest("hex"),PROOF_REVIEWED_SHA,"TRIAL_WHATSAPP_PROOF_SOURCE_DRIFT");
const receiptSource=readFileSync(new URL("../first-commercial/held/v1_trial_whatsapp_otp_receipt_source.sql",import.meta.url),"utf8");
const RECEIPT_REVIEWED_SHA="b02a8e11f44b5806dbde1af7ef62c8e7a24c76cb";
assert.equal(createHash("sha1").update("blob "+Buffer.byteLength(receiptSource)+"\0"+receiptSource).digest("hex"),RECEIPT_REVIEWED_SHA,"TRIAL_WA_RECEIPT_SOURCE_DRIFT");
assert.equal(process.argv.length,2,"NO_CLI_INPUT");
assert.equal(process.env.GITHUB_ACTIONS,"true","CI_ONLY");
assert.equal(process.env.GITHUB_REPOSITORY,"nora953/fawri-production-source","REPO_NOT_AUTHORIZED");
assert.equal(process.env.FAWRI_ALLOW_LOCAL_TRIAL_EVIDENCE_PG18,"1","LOCAL_OPT_IN_REQUIRED");
const url=new URL(process.env.DATABASE_URL||"");
assert.deepEqual([url.protocol,url.hostname,url.port,url.pathname,decodeURIComponent(url.username),decodeURIComponent(url.password),url.search,url.hash],
  ["postgresql:","127.0.0.1","5432","/fawri_ci","fawri_ci","fawri_ci","",""]);
const start="BEGIN;\nSET LOCAL statement_timeout = '20s';\nSET LOCAL lock_timeout = '3s';\n";
assert.ok(source.includes(start),"SQL_TRANSACTION_SOURCE_DRIFT");
assert.match(source,/\nCOMMIT;\n$/,"SQL_TERMINATOR_SOURCE_DRIFT");
const localized=source.replace(start,"").replace(/\nCOMMIT;\n$/,"\n")
  .replace("current_database() <> 'fawri'","current_database() <> 'fawri_ci'")
  .replace("session_user <> 'fawri_owner'","session_user <> 'fawri_ci'");
assert.ok(localized.includes("session_user <> 'fawri_ci'"));
assert.ok(proofSource.includes(start),"TRIAL_PROOF_SQL_TRANSACTION_DRIFT");
assert.match(proofSource,/\nCOMMIT;\n$/,"TRIAL_PROOF_SQL_TERMINATOR_DRIFT");
const localizedProof=proofSource.replace(start,"").replace(/\nCOMMIT;\n$/,"\n")
  .replace("current_database() <> 'fawri'","current_database() <> 'fawri_ci'")
  .replace("session_user <> 'fawri_owner'","session_user <> 'fawri_ci'");
assert.ok(receiptSource.includes(start),"TRIAL_WA_RECEIPT_SQL_TRANSACTION_DRIFT");
assert.match(receiptSource,/\nCOMMIT;\n$/,"TRIAL_WA_RECEIPT_SQL_TERMINATOR_DRIFT");
const localizedReceipt=receiptSource.replace(start,"").replace(/\nCOMMIT;\n$/,"\n")
  .replace("current_database()<>'fawri'","current_database()<>'fawri_ci'")
  .replace("session_user<>'fawri_owner'","session_user<>'fawri_ci'");
const db=new pg.Client({connectionString:url.toString(),ssl:false,connectionTimeoutMillis:3000});
await db.connect();
let began=false;
const UUID1="11111111-1111-4111-8111-111111111111",UUID2="22222222-2222-4222-8222-222222222222",UUID3="33333333-3333-4333-8333-333333333333",UUID4="44444444-4444-4444-8444-444444444444";
const phoneHash="A".repeat(43), merchantHash1="B".repeat(43),merchantHash2="C".repeat(43);
async function rejectsCode(sql,params,code) {
  await db.query("SAVEPOINT trial_negative");
  try { await assert.rejects(db.query(sql,params), e => e?.code===code); }
  finally {
    await db.query("ROLLBACK TO SAVEPOINT trial_negative");
    await db.query("RELEASE SAVEPOINT trial_negative");
  }
}
try{
  const pre=(await db.query("SELECT current_database() AS db,current_setting('server_version_num')::int/10000 AS version,to_regclass('public.merchant_trial_claims')::text AS claims")).rows[0];
  assert.deepEqual(pre,{db:"fawri_ci",version:18,claims:null});
  await db.query("BEGIN");began=true;
  await db.query("SET LOCAL statement_timeout='20s'");
  await db.query("SET LOCAL lock_timeout='3s'");
  await db.query("CREATE TABLE public.accounts(id text PRIMARY KEY)");
  await db.query("CREATE TABLE public.merchants(id text PRIMARY KEY)");
  await db.query("CREATE TABLE public.auth_otp_challenges(id text PRIMARY KEY)");
  for(const role of ["fawri_auth_issuer","fawri_restricted_runtime","fawri_operator_issuer"])
    await db.query("CREATE ROLE "+role+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");
  await db.query(localized);
  await db.query(localizedProof);
  await db.query(localizedReceipt);

  const roles=(await db.query("SELECT has_table_privilege('fawri_auth_issuer','public.merchant_trial_claims','SELECT') AS issuer,has_table_privilege('fawri_auth_issuer','public.merchant_trial_evidence','INSERT') AS evidence,has_table_privilege('fawri_restricted_runtime','public.merchant_trial_claims','SELECT') AS tenant,has_table_privilege('fawri_operator_issuer','public.merchant_trial_evidence','SELECT') AS operator")).rows[0];
  assert.deepEqual(roles,{issuer:true,evidence:true,tenant:false,operator:false});
  const rls=(await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('merchant_trial_claims','merchant_trial_evidence') ORDER BY relname")).rows;
  assert.equal(rls.length,2);assert.ok(rls.every(x=>x.relrowsecurity));
  const cols=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('merchant_trial_claims','merchant_trial_evidence')")).rows.map(x=>x.column_name);
  assert.ok(!cols.some(x=>/phone|email|ip_address|store_name|password/i.test(x)),"RAW_PERSONAL_IDENTITY_IN_LEDGER");

  await db.query("INSERT INTO public.auth_otp_challenges(id) VALUES ('issued-one'),('issued-two')");
  const noReceipt=(await db.query("SELECT wa_auth_message_id_hash,wa_auth_accepted_at FROM public.auth_otp_challenges WHERE id='issued-one'")).rows[0];
  assert.deepEqual(noReceipt,{wa_auth_message_id_hash:null,wa_auth_accepted_at:null});
  await rejectsCode("UPDATE public.auth_otp_challenges SET wa_auth_message_id_hash=$1 WHERE id='issued-one'",[phoneHash],"23514");
  await rejectsCode("UPDATE public.auth_otp_challenges SET wa_auth_accepted_at=now() WHERE id='issued-one'",[],"23514");
  await db.query("UPDATE public.auth_otp_challenges SET wa_auth_message_id_hash=$1,wa_auth_accepted_at=now() WHERE id='issued-one'",[phoneHash]);
  await rejectsCode("UPDATE public.auth_otp_challenges SET wa_auth_message_id_hash=$1,wa_auth_accepted_at=now() WHERE id='issued-two'",[phoneHash],"23505");
  console.log("TRIAL_WA_RECEIPT_NULL_LEGACY_PARTIAL_DUPLICATE_REJECTION_PASS");

  // The proof schema deliberately leaves every legacy account unverified.
  await db.query("INSERT INTO public.accounts(id) VALUES ('merchant-first'),('merchant-second')");
  const blank=(await db.query("SELECT trial_wa_proof_hash,trial_wa_proof_verified_at,trial_wa_proof_challenge_id FROM public.accounts WHERE id='merchant-first'")).rows[0];
  assert.deepEqual(blank,{trial_wa_proof_hash:null,trial_wa_proof_verified_at:null,trial_wa_proof_challenge_id:null});
  await rejectsCode("UPDATE public.accounts SET trial_wa_proof_hash=$1 WHERE id='merchant-first'",[phoneHash],"23514");
  await rejectsCode("UPDATE public.accounts SET trial_wa_proof_hash=$1,trial_wa_proof_verified_at=now() WHERE id='merchant-first'",[phoneHash],"23514");
  await db.query("UPDATE public.accounts SET trial_wa_proof_hash=$1,trial_wa_proof_verified_at=now(),trial_wa_proof_challenge_id=$2 WHERE id='merchant-first'",[phoneHash,UUID4]);
  await rejectsCode("UPDATE public.accounts SET trial_wa_proof_hash=$1,trial_wa_proof_verified_at=now(),trial_wa_proof_challenge_id=$2 WHERE id='merchant-second'",[phoneHash,UUID4],"23505");
  const proofIndex=(await db.query("SELECT indexname FROM pg_indexes WHERE tablename='accounts' AND indexname='accounts_trial_wa_proof_challenge_unique'")).rows;
  assert.equal(proofIndex.length,1);
  console.log("TRIAL_WHATSAPP_PROOF_NULL_LEGACY_PARTIAL_REPLAY_REJECTION_PASS");
  await db.query("INSERT INTO public.merchants(id) VALUES ('merchant-first'),('merchant-second')");
  await db.query("INSERT INTO public.merchant_trial_claims(id,merchant_id,merchant_hash) VALUES($1,'merchant-first',$2)",[UUID1,merchantHash1]);
  await db.query("INSERT INTO public.merchant_trial_evidence(id,claim_id,evidence_kind,evidence_hash) VALUES($1,$2,'verified_phone',$3)",[UUID2,UUID1,phoneHash]);
  // Repeated claim from the same account cannot create another trial claim.
  await rejectsCode("INSERT INTO public.merchant_trial_claims(id,merchant_id,merchant_hash) VALUES($1,'merchant-first',$2)",[UUID3,merchantHash1],"23505");
  await rejectsCode("INSERT INTO public.merchant_trial_claims(id,merchant_id,merchant_hash) VALUES($1,'merchant-first',$2)",[UUID3,merchantHash2],"23505");
  // Another account claiming the same verified phone must fail at UNIQUE hash.
  await db.query("INSERT INTO public.merchant_trial_claims(id,merchant_id,merchant_hash) VALUES($1,'merchant-second',$2)",[UUID3,merchantHash2]);
  await rejectsCode("INSERT INTO public.merchant_trial_evidence(id,claim_id,evidence_kind,evidence_hash) VALUES($1,$2,'verified_phone',$3)",[UUID4,UUID3,phoneHash],"23505");
  // No bypass by self-awarding activated without reviewed timestamps.
  await rejectsCode("UPDATE public.merchant_trial_claims SET decision='activated' WHERE id=$1",[UUID1],"23514");
  await rejectsCode("UPDATE public.merchant_trial_claims SET decision='approved' WHERE id=$1",[UUID1],"23514");
  await db.query("DELETE FROM public.merchants WHERE id='merchant-first'");
  const history=(await db.query("SELECT c.merchant_id,c.decision,e.evidence_hash FROM public.merchant_trial_claims c JOIN public.merchant_trial_evidence e ON e.claim_id=c.id WHERE c.id=$1",[UUID1])).rows[0];
  assert.deepEqual(history,{merchant_id:null,decision:"pending_review",evidence_hash:phoneHash});
  await rejectsCode("INSERT INTO public.merchant_trial_evidence(id,claim_id,evidence_kind,evidence_hash) VALUES($1,$2,'verified_phone',$3)",[UUID4,UUID3,phoneHash],"23505");
  console.log("TRIAL_EVIDENCE_LEDGER_PG18_DUPLICATE_AND_TOMBSTONE_BLOCK_PASS");
  console.log("TRIAL_EVIDENCE_LEDGER_PG18_NO_AUTOMATIC_ACTIVATION_PASS");
  console.log("TRIAL_EVIDENCE_LEDGER_PG18_RLS_ACL_NO_PII_PASS");
} finally {
  if(began) await db.query("ROLLBACK");
  const post=(await db.query("SELECT to_regclass('public.merchant_trial_claims')::text AS claims,to_regclass('public.merchant_trial_evidence')::text AS evidence,(SELECT count(*)::int FROM pg_roles WHERE rolname IN('fawri_auth_issuer','fawri_restricted_runtime','fawri_operator_issuer')) AS roles")).rows[0];
  assert.deepEqual(post,{claims:null,evidence:null,roles:0});
  const proofPost=(await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name LIKE 'trial_wa_proof_%'")).rows[0];
  assert.equal(proofPost.n,0);
  const receiptPost=(await db.query("SELECT to_regclass('public.auth_otp_challenges')::text AS receipt")).rows[0];
  assert.equal(receiptPost.receipt,null);
  await db.end();
  console.log("TRIAL_EVIDENCE_LEDGER_NO_NEON_ALL_ROLLBACK_PASS");
}
