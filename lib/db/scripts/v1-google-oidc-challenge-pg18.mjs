import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import pg from "pg";

const source=readFileSync(new URL("../first-commercial/held/v1_google_oidc_challenge_once.sql",import.meta.url),"utf8");
assert.equal(createHash("sha1").update("blob "+Buffer.byteLength(source)+"\0"+source).digest("hex"),"1ffbe1c6a1987810f5351bf019333506f68753e9");
assert.equal(process.argv.length,2);
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.GITHUB_REPOSITORY,"nora953/fawri-production-source");
assert.equal(process.env.FAWRI_ALLOW_GOOGLE_CHALLENGE_LOCAL_PG18,"1");
const url=new URL(process.env.DATABASE_URL||"");
assert.deepEqual([url.protocol,url.hostname,url.port,url.pathname,decodeURIComponent(url.username),decodeURIComponent(url.password),url.search,url.hash],
  ["postgresql:","127.0.0.1","5432","/fawri_ci","fawri_ci","fawri_ci","",""]);
const head="BEGIN;\nSET LOCAL statement_timeout = '20s';\nSET LOCAL lock_timeout = '3s';\n";
assert.ok(source.includes(head));
assert.match(source,/\nCOMMIT;\n$/);
const sql=source.replace(head,"").replace(/\nCOMMIT;\n$/,"\n")
  .replace("current_database() <> 'fawri'","current_database() <> 'fawri_ci'")
  .replace("session_user <> 'fawri_owner'","session_user <> 'fawri_ci'");
const client=new pg.Client({connectionString:url.toString(),ssl:false,connectionTimeoutMillis:3000});
await client.connect();
let began=false;
const id="11aabbcc-1111-4111-8111-112233445566", A="A".repeat(43),B="B".repeat(43),C="C".repeat(43);
const consume="UPDATE public.google_oidc_challenges SET used_at=now() WHERE id=$1 AND nonce_hash=$2 AND csrf_hash=$3 AND used_at IS NULL AND expires_at > now() RETURNING id";
try {
  const pre=(await client.query("SELECT current_database() AS db,current_setting('server_version_num')::int/10000 AS major,to_regclass('public.google_oidc_challenges')::text AS name")).rows[0];
  assert.deepEqual(pre,{db:"fawri_ci",major:18,name:null});
  await client.query("BEGIN");began=true;
  await client.query("SET LOCAL statement_timeout='20s'");
  await client.query("CREATE TABLE public.accounts(id text PRIMARY KEY)");
  await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  for(const role of ["fawri_auth_issuer","fawri_restricted_runtime","fawri_operator_issuer"])
    await client.query("CREATE ROLE "+role+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");
  await client.query(sql);
  const acl=(await client.query("SELECT has_table_privilege('fawri_auth_issuer','public.google_oidc_challenges','SELECT') AS auth,has_table_privilege('fawri_restricted_runtime','public.google_oidc_challenges','SELECT') AS tenant,has_table_privilege('fawri_operator_issuer','public.google_oidc_challenges','SELECT') AS operator")).rows[0];
  assert.deepEqual(acl,{auth:true,tenant:false,operator:false});
  assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.google_oidc_challenges'::regclass")).rows[0].relrowsecurity,true);
  const insert="INSERT INTO public.google_oidc_challenges(id,nonce_hash,csrf_hash,ip_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')";
  await client.query(insert,[id,A,B,C]);
  assert.equal((await client.query(consume,[id,B,B])).rows.length,0);
  assert.equal((await client.query(consume,[id,A,A])).rows.length,0);
  assert.equal((await client.query(consume,[id,A,B])).rows.length,1);
  assert.equal((await client.query(consume,[id,A,B])).rows.length,0);
  await client.query("INSERT INTO public.google_oidc_challenges(id,nonce_hash,csrf_hash,ip_hash,created_at,expires_at) VALUES($1,$2,$3,$4,now()-interval '12 minutes',now()-interval '10 minutes')",["22aabbcc-1111-4111-8111-112233445566",A,B,C]);
  assert.equal((await client.query(consume,["22aabbcc-1111-4111-8111-112233445566",A,B])).rows.length,0);
  console.log("GOOGLE_OIDC_PG18_ONE_USE_EXPIRY_ACL_RLS_PASS");
} finally {
  if(began) await client.query("ROLLBACK");
  const clean=(await client.query("SELECT to_regclass('public.google_oidc_challenges')::text AS name,(SELECT count(*)::int FROM pg_roles WHERE rolname IN('fawri_auth_issuer','fawri_restricted_runtime','fawri_operator_issuer')) AS roles")).rows[0];
  assert.deepEqual(clean,{name:null,roles:0});
  await client.end();
  console.log("GOOGLE_OIDC_PG18_NO_NEON_ALL_ROLLBACK_PASS");
}
