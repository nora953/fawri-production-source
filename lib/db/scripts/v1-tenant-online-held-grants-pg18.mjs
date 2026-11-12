/**
 * Validate exact HELD tenant online catalog/order/inventory GRANT source.
 * GitHub Actions owned local disposable PG18 only; no Neon, secrets, hosted SQL,
 * or customer data. Synthetic table RLS denies ALL rows, not production policy.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const source=readFileSync(fileURLToPath(new URL(
  '../first-commercial/held/v1_tenant_online_commerce_grants.sql',
  import.meta.url)),'utf8');
const PINNED_BLOB='309669fcaaef09d4f11c63093611bb03add2efa5';
const digest=createHash('sha1')
  .update('blob '+Buffer.byteLength(source)+'\0'+source).digest('hex');
assert.equal(digest,PINNED_BLOB,'V1_TENANT_HELD_SOURCE_PIN_DRIFT');
const TENANT='fawri_restricted_runtime';
const rights=Object.freeze({
  products:['SELECT','INSERT','UPDATE'],
  product_variants:['SELECT','INSERT','UPDATE','DELETE'],
  catalog_variant_options:['SELECT','INSERT','UPDATE','DELETE'],
  catalog_identifiers:['SELECT','INSERT','UPDATE','DELETE'],
  catalog_image_references:['SELECT','INSERT','UPDATE','DELETE'],
  catalog_idempotency_keys:['SELECT','INSERT','UPDATE','DELETE'],
  commerce_promotions:['SELECT','INSERT','UPDATE','DELETE'],
  merchant_locations:['SELECT','INSERT','UPDATE'],
  location_inventory_levels:['SELECT','INSERT','UPDATE'],
  inventory_mutations:['SELECT','INSERT'],
  merchant_settings:['SELECT','INSERT','UPDATE'],
  merchant_delivery_area_rates:['SELECT','INSERT','UPDATE','DELETE'],
  merchant_location_delivery_areas:['SELECT','INSERT','UPDATE','DELETE'],
  orders:['SELECT','INSERT','UPDATE'],
  order_items:['SELECT','INSERT','UPDATE'],
});
const forbidden=['accounts','auth_otp_challenges','account_sessions',
  'cashier_device_streams','verified_provider_payment_receipts',
  'saas_billing_refunds'];

function exactLocalConnection() {
  assert.equal(process.argv.length,2);
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REPOSITORY,'nora953/fawri-production-source');
  assert.equal(process.env.FAWRI_ALLOW_LOCAL_V1_TENANT_GRANTS,'1');
  const u=new URL(process.env.DATABASE_URL??'');
  assert.equal(u.protocol,'postgresql:');
  assert.equal(u.hostname,'127.0.0.1');
  assert.equal(u.port,'5432');
  assert.equal(u.pathname,'/fawri_ci');
  assert.equal(decodeURIComponent(u.username),'fawri_ci');
  assert.equal(u.search,'');assert.equal(u.hash,'');
  return u.toString();
}
function localizeSource() {
  const header="BEGIN;\nSET LOCAL statement_timeout = '20s';\nSET LOCAL lock_timeout = '3s';\n";
  assert.equal(source.split(header).length,2,'V1_TENANT_SOURCE_BEGIN_DRIFT');
  assert.match(source,/\nCOMMIT;\n$/);
  const body=source.replace(header,'').replace(/\nCOMMIT;\n$/,'\n')
    .replace("current_database() <> 'fawri'",
      "current_database() <> 'fawri_ci'")
    .replace("session_user <> 'fawri_owner'",
      "session_user <> 'fawri_ci'");
  const post=body.match(/DO \$v1_online_postimage\$[\s\S]*?\$v1_online_postimage\$;/);
  assert.ok(post,'V1_TENANT_SOURCE_POSTIMAGE_MISSING');
  return {body,post:post[0]};
}
async function setup(client) {
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations (id integer)');
  await client.query('CREATE SCHEMA fawri_security');
  await client.query('REVOKE ALL ON SCHEMA fawri_security FROM PUBLIC');
  await client.query(`CREATE FUNCTION fawri_security.allows_merchant(text)
    RETURNS boolean LANGUAGE sql AS 'SELECT false'`);
  await client.query(`CREATE FUNCTION fawri_security.issue_scope(name,integer,bigint,text)
    RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END;$$`);
  await client.query(`CREATE FUNCTION public.fawri_authentication_runtime()
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  await client.query(`CREATE FUNCTION public.fawri_issue_admin_directory_audit(text,text,text)
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  for (const fn of [
    'public.fawri_authentication_runtime()',
    'fawri_security.issue_scope(name,integer,bigint,text)',
    'public.fawri_issue_admin_directory_audit(text,text,text)',
  ]) await client.query(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
  for (const name of [...Object.keys(rights),...forbidden]) {
    await client.query(`CREATE TABLE public.${name}
      (id text PRIMARY KEY, merchant_id text NOT NULL)`);
  }
  await client.query(`CREATE TABLE public.merchants
    (id text PRIMARY KEY,country_code text,timezone text,currency_code text)`);
  // The fixture rejects ALL row access. This only tests mandatory RLS
  // enabled/policy preconditions, NOT production reviewed predicate hashes.
  for (const name of Object.keys(rights)) {
    await client.query(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
    await client.query(`CREATE POLICY fixture_deny ON public.${name}
      USING (false) WITH CHECK (false)`);
  }
  await client.query(`CREATE ROLE ${TENANT} LOGIN NOINHERIT NOSUPERUSER
    NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`);
}
async function granted(client,table,privilege){
  const result=await client.query(`SELECT has_table_privilege($1::text,
    $2::text,$3::text) AS allowed`,[TENANT,'public.'+table,privilege]);
  return result.rows[0].allowed;
}
async function verifyPositive(client){
  for (const [name,allowed] of Object.entries(rights)){
    const flags=(await client.query(`SELECT c.relrowsecurity AS rls,
      (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=$2`,
      [TENANT,name])).rows[0];
    assert.deepEqual(flags,{rls:true,owner:false},'V1_TENANT_RLS_'+name);
    for(const right of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']){
      assert.equal(await granted(client,name,right),allowed.includes(right),
        `V1_TENANT_GRANT_${name}_${right}`);
    }
  }
  for(const name of forbidden){
    for(const right of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']){
      assert.equal(await granted(client,name,right),false,
        `V1_TENANT_FORBIDDEN_${name}_${right}`);
    }
  }
  const role=await client.query(`SELECT r.rolcanlogin AS can_login,
    r.rolsuper AS superuser,r.rolbypassrls AS bypass,
    r.rolcreaterole AS create_role,
    EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS member
    FROM pg_roles r WHERE r.rolname=$1`,[TENANT]);
  assert.deepEqual(role.rows[0],
    {can_login:true,superuser:false,bypass:false,create_role:false,member:false});
  for(const fn of ['public.fawri_authentication_runtime()',
    'public.fawri_issue_admin_directory_audit(text,text,text)',
    'fawri_security.issue_scope(name,integer,bigint,text)']){
    const q=await client.query(`SELECT has_function_privilege($1::text,
      $2::text,'EXECUTE') AS allowed`,[TENANT,fn]);
    assert.equal(q.rows[0].allowed,false,'V1_TENANT_ISSUER_DENY_'+fn);
  }
  const scoped=await client.query(`SELECT has_function_privilege(
     $1::text,'fawri_security.allows_merchant(text)','EXECUTE') AS allowed`,
     [TENANT]);
  assert.equal(scoped.rows[0].allowed,true);
  const region=(await client.query(`SELECT
    has_function_privilege($1::text,
      'public.fawri_v1_scoped_merchant_region(text,boolean)','EXECUTE')
        AS scoped_execute,
    has_table_privilege($1::text,'public.merchants','SELECT')
        AS global_merchant_read`,[TENANT])).rows[0];
  assert.deepEqual(region,{scoped_execute:true,global_merchant_read:false},
    'V1_REGION_BOUND_PROJECTION_ONLY_NOT_GLOBAL_MERCHANT_SELECT');
}
async function negative(client,post,label,mutation){
  await client.query('SAVEPOINT v1_online_negative');
  try{
    await client.query(mutation);
    await assert.rejects(()=>client.query(post),
      e=>/V1_ONLINE_TENANT_/.test(e?.message??''),
      label);
  } finally{
    await client.query('ROLLBACK TO SAVEPOINT v1_online_negative');
    await client.query('RELEASE SAVEPOINT v1_online_negative');
  }
  await verifyPositive(client);
}
async function main(){
  const conn=exactLocalConnection();
  const {body,post}=localizeSource();
  const client=new pg.Client({connectionString:conn,ssl:false,
    connectionTimeoutMillis:3000});
  await client.connect();
  let began=false;
  try {
    const pre=(await client.query(`SELECT current_database()::text AS db,
      current_setting('server_version_num')::integer/10000 AS major,
      (SELECT count(*)::int FROM pg_roles WHERE rolname=$1) AS prior`,
      [TENANT])).rows[0];
    assert.deepEqual(pre,{db:'fawri_ci',major:18,prior:0});
    await client.query('BEGIN');began=true;
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await setup(client);
    // Explicitly test that a source preimage rejects RLS absence.
    await client.query('ALTER TABLE public.products DISABLE ROW LEVEL SECURITY');
    await client.query('SAVEPOINT v1_bad_preimage');
    try{
      await assert.rejects(()=>client.query(body),
        e=>/V1_ONLINE_TENANT_RLS_REQUIRED/.test(e?.message??''));
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT v1_bad_preimage');
      await client.query('RELEASE SAVEPOINT v1_bad_preimage');
    }
    await client.query('ALTER TABLE public.products ENABLE ROW LEVEL SECURITY');
    await client.query(body);
    await verifyPositive(client);
    await negative(client,post,'RLS removed',
      'ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY');
    await negative(client,post,'receipt access',
      'GRANT SELECT ON public.verified_provider_payment_receipts TO fawri_restricted_runtime');
    await negative(client,post,'auth credential access',
      'GRANT SELECT ON public.accounts TO fawri_restricted_runtime');
    await negative(client,post,'cashier access',
      'GRANT SELECT ON public.cashier_device_streams TO fawri_restricted_runtime');
    await negative(client,post,'payments refund mutation',
      'GRANT UPDATE ON public.saas_billing_refunds TO fawri_restricted_runtime');
    await negative(client,post,'trusted auth marker escalation',
      'GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO fawri_restricted_runtime');
    await negative(client,post,'BYPASSRLS flag escalation',
      'ALTER ROLE fawri_restricted_runtime BYPASSRLS');
    await negative(client,post,'promotion RLS disabled',
      'ALTER TABLE public.commerce_promotions DISABLE ROW LEVEL SECURITY');
    await negative(client,post,'merchant global SELECT forbidden',
      'GRANT SELECT ON public.merchants TO fawri_restricted_runtime');
    await negative(client,post,'unsafe promotion truncate',
      'GRANT TRUNCATE ON public.commerce_promotions TO fawri_restricted_runtime');
    await negative(client,post,'unsafe order delete',
      'GRANT DELETE ON public.orders TO fawri_restricted_runtime');
    await negative(client,post,'unsafe inventory movement update',
      'GRANT UPDATE ON public.inventory_mutations TO fawri_restricted_runtime');
    await negative(client,post,'missing required product grant',
      'REVOKE UPDATE ON public.products FROM fawri_restricted_runtime');
    await negative(client,post,'unsafe nonrow privilege',
      'GRANT TRUNCATE ON public.products TO fawri_restricted_runtime');
    console.log('V1_TENANT_ONLINE_CATALOG_ORDER_STOCK_GRANT_LOCAL_PG18_PASS');
    console.log('V1_TENANT_RLS_REQUIRED_NEGATIVE_ESCALATION_ROLLBACK_PASS');
  } finally{
    if(began)await client.query('ROLLBACK');
    const remaining=(await client.query(`SELECT count(*)::int AS n
      FROM pg_roles WHERE rolname=$1`,[TENANT])).rows[0];
    assert.equal(remaining.n,0,'V1_TENANT_LOCAL_ROLE_NOT_ROLLED_BACK');
    await client.end();
    console.log('V1_TENANT_LOCAL_ONLY_ZERO_ROLES_NO_NEON_PASS');
  }
}
await main();
