/**
 * Exact-source HELD V1 operator capability-only admission, LOCAL PG18.
 * Synthetic SQL functions, reviewed GRANT source copied only into disposable
 * transaction, no real receipts, funds, Neon, service secrets or hosted DDL.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const file=readFileSync(fileURLToPath(new URL(
  '../first-commercial/held/v1_operator_receipt_review_grants.sql',
  import.meta.url)),'utf8');
const PINNED_BLOB='22445192803ea7043d30ffb87c4ee355c0497566';
const digest=createHash('sha1').update('blob '+Buffer.byteLength(file)+'\0'+file).digest('hex');
assert.equal(digest,PINNED_BLOB,'V1_OPERATOR_REVIEW_HELD_SOURCE_DRIFT');
const functions=[
  'public.fawri_issue_admin_directory_audit(text,text,text)',
  'public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)',
  'public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)',
  'public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)',
  'public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text)',
  'public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text)',
  'public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text)',
  'public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text)',
  'public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text)',
];
const ROLES=['fawri_operator_issuer','fawri_auth_issuer','fawri_restricted_runtime'];
const deniedTables=[
  'accounts','auth_otp_challenges','account_sessions','notifications',
  'order_drafts','orders','order_items','verified_provider_payment_receipts',
  'saas_billing_orders','saas_billing_refunds','cashier_device_streams',
];
function localConnection() {
  assert.equal(process.argv.length,2);
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REPOSITORY,'nora953/fawri-production-source');
  assert.equal(process.env.FAWRI_ALLOW_LOCAL_V1_OPERATOR_GRANTS,'1');
  const u=new URL(process.env.DATABASE_URL??'');
  assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'127.0.0.1');
  assert.equal(u.port,'5432');assert.equal(u.pathname,'/fawri_ci');
  assert.equal(decodeURIComponent(u.username),'fawri_ci');
  assert.equal(u.search,'');assert.equal(u.hash,'');
  return u.toString();
}
function testSource(){
  const head="BEGIN;\nSET LOCAL statement_timeout='20s';\nSET LOCAL lock_timeout='3s';\n";
  assert.equal(file.split(head).length,2,'V1_OPERATOR_BEGIN_DRIFT');
  assert.match(file,/\nCOMMIT;\n$/);
  const body=file.replace(head,'').replace(/\nCOMMIT;\n$/,'\n')
    .replace("current_database()<>'fawri'","current_database()<>'fawri_ci'")
    .replace("session_user<>'fawri_owner'","session_user<>'fawri_ci'");
  const found=body.match(/DO \$v1_operator_postimage\$[\s\S]*?\$v1_operator_postimage\$;/);
  assert.ok(found,'V1_OPERATOR_HELD_POSTIMAGE_NOT_FOUND');
  return {body,post:found[0]};
}
async function init(client){
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations (id integer)');
  await client.query('CREATE SCHEMA fawri_security');
  await client.query('REVOKE ALL ON SCHEMA fawri_security FROM PUBLIC');
  await client.query(`CREATE FUNCTION public.fawri_authentication_runtime()
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  await client.query(`CREATE FUNCTION fawri_security.issue_scope(name,integer,bigint,text)
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  await client.query('REVOKE ALL ON FUNCTION public.fawri_authentication_runtime() FROM PUBLIC');
  await client.query('REVOKE ALL ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) FROM PUBLIC');
  for(const fn of functions)
    await client.query(`CREATE FUNCTION ${fn}
      RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  for(const name of deniedTables)
    await client.query(`CREATE TABLE public.${name} (id text PRIMARY KEY)`);
  for(const name of ROLES)
    await client.query(`CREATE ROLE ${name} NOLOGIN NOINHERIT NOSUPERUSER
      NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
  // Test that the operator NOLOGIN reservation alone never satisfies preimage.
}
async function privilege(client,role,fn){
  const q=await client.query(`SELECT has_function_privilege(
    $1::text,$2::text,'EXECUTE') AS allowed`,[role,fn]);
  return q.rows[0].allowed;
}
async function check(client){
  for(const fn of functions) {
    assert.equal(await privilege(client,ROLES[0],fn),true,
      'V1_OPERATOR_ALLOWLIST_REQUIRED_'+fn);
    for(const role of ROLES.slice(1))
      assert.equal(await privilege(client,role,fn),false,
        'V1_OPERATOR_CROSSROLE_DENIED_'+role+'_'+fn);
    const q=await client.query(`SELECT EXISTS(
      SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl,
        acldefault('f',p.proowner))) item
      WHERE p.oid=to_regprocedure($1)
        AND item.grantee=0 AND item.privilege_type='EXECUTE'
      ) AS public_exec`,[fn]);
    assert.equal(q.rows[0].public_exec,false,
      'V1_OPERATOR_PUBLIC_EXEC_DENIED_'+fn);
  }
  const role=(await client.query(`SELECT rolcanlogin AS login,rolsuper AS super,
    rolbypassrls AS bypass,rolcreaterole AS create_role
    FROM pg_roles WHERE rolname=$1`,[ROLES[0]])).rows[0];
  assert.deepEqual(role,{login:true,super:false,bypass:false,create_role:false});
  for(const name of deniedTables){
    const q=await client.query(`SELECT has_table_privilege($1::text,
      $2::text,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AS access`,
      [ROLES[0],'public.'+name]);
    assert.equal(q.rows[0].access,false,'V1_OPERATOR_DIRECT_TABLE_'+name);
  }
  const p=await client.query(`SELECT
    has_schema_privilege($1,'fawri_security','USAGE') AS private_usage,
    has_schema_privilege($1,'public','CREATE') AS public_create`,[ROLES[0]]);
  assert.deepEqual(p.rows[0],{private_usage:false,public_create:false});
  for(const fn of [
    'public.fawri_authentication_runtime()',
    'fawri_security.issue_scope(name,integer,bigint,text)',
  ]) assert.equal(await privilege(client,ROLES[0],fn),false);
}
async function negative(client,post,label,sql){
  await client.query('SAVEPOINT op_negative');
  try{
    await client.query(sql);
    await assert.rejects(()=>client.query(post),
      error=>/V1_OPERATOR_/.test(error?.message??''),label);
  }finally{
    await client.query('ROLLBACK TO SAVEPOINT op_negative');
    await client.query('RELEASE SAVEPOINT op_negative');
  }
  await check(client);
}
async function main(){
  const target=localConnection();
  const {body,post}=testSource();
  const client=new pg.Client({connectionString:target,ssl:false,
    connectionTimeoutMillis:3000});
  await client.connect();
  let begun=false;
  try{
    const pre=(await client.query(`SELECT current_database()::text AS db,
      current_setting('server_version_num')::integer/10000 AS major,
      (SELECT count(*)::integer FROM pg_roles WHERE rolname=ANY($1::text[]))
       AS preexisting`,[ROLES])).rows[0];
    assert.deepEqual(pre,{db:'fawri_ci',major:18,preexisting:0});
    await client.query('BEGIN');begun=true;
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await init(client);
    await client.query('SAVEPOINT op_nologin');
    try{
      await assert.rejects(()=>client.query(body),
        e=>/V1_OPERATOR_LOGIN_UNSAFE/.test(e?.message??''));
    }finally{
      await client.query('ROLLBACK TO SAVEPOINT op_nologin');
      await client.query('RELEASE SAVEPOINT op_nologin');
    }
    for(const name of ROLES)
      await client.query(`ALTER ROLE ${name} LOGIN`);
    await client.query(body);
    await check(client);
    await negative(client,post,'PUBLIC EXECUTE forbidden',
      'GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO PUBLIC');
    await negative(client,post,'cross auth role forbidden',
      'GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO fawri_auth_issuer');
    await negative(client,post,'cross tenant function forbidden',
      'GRANT EXECUTE ON FUNCTION public.fawri_review_verified_payment_receipt(text,text,text,text,text,text) TO fawri_restricted_runtime');
    await negative(client,post,'direct receipt access forbidden',
      'GRANT SELECT ON public.verified_provider_payment_receipts TO fawri_operator_issuer');
    await negative(client,post,'direct order writes forbidden',
      'GRANT UPDATE ON public.orders TO fawri_operator_issuer');
    await negative(client,post,'operator must not issue auth scopes',
      'GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO fawri_operator_issuer');
    await negative(client,post,'operator must not have private schema USAGE',
      'GRANT USAGE ON SCHEMA fawri_security TO fawri_operator_issuer');
    await negative(client,post,'operator must not become privileged',
      'ALTER ROLE fawri_operator_issuer BYPASSRLS');
    await negative(client,post,'missing required review entrypoint',
      'REVOKE EXECUTE ON FUNCTION public.fawri_review_verified_payment_receipt(text,text,text,text,text,text) FROM fawri_operator_issuer');
    console.log('V1_OPERATOR_NINE_EXACT_FUNCTION_GRANTS_LOCAL_PG18_PASS');
    console.log('V1_OPERATOR_PUBLIC_CROSSROLE_FINANCIAL_DENIAL_PASS');
  }finally{
    if(begun)await client.query('ROLLBACK');
    const remain=(await client.query(`SELECT count(*)::integer AS n
      FROM pg_roles WHERE rolname=ANY($1::text[])`,[ROLES])).rows[0].n;
    assert.equal(remain,0,'V1_OPERATOR_DISPOSABLE_ROLES_NOT_CLEANED');
    await client.end();
    console.log('V1_OPERATOR_LOCAL_ONLY_ROLLBACK_ZERO_ROLES_NO_NEON_PASS');
  }
}
await main();
