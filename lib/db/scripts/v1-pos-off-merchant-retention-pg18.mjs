/**
 * P0 merchant retention first-commercial POS-OFF compatibility.
 * Exact source HELD V1 patch under a NON-SUPERUSER fawri_owner on a
 * disposable real PostgreSQL 18 database named fawri.
 * Does not run production SQL, retrieve secrets, or access Neon.
 */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const SOURCE=fs.readFileSync(fileURLToPath(new URL(
  '../first-commercial/held/v1_pos_off_merchant_deletion_guard.sql',
  import.meta.url)),'utf8');
const REVIEWED_GIT_BLOB='bd08142e26547aeaa78850c8aa9644ec7495f217';
const actualBlob=createHash('sha1')
  .update('blob '+Buffer.byteLength(SOURCE)+'\0'+SOURCE)
  .digest('hex');
assert.equal(actualBlob,REVIEWED_GIT_BLOB,
  'V1_POS_OFF_HELD_REVIEWED_SQL_SOURCE_DRIFT');
const DB='fawri', OWNER='fawri_owner';
const AUTH='fawri_auth_issuer',TENANT='fawri_restricted_runtime';
const allRoles=[OWNER,AUTH,TENANT];

function requireLocal(){
  assert.equal(process.argv.length,2);
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REPOSITORY,
    'nora953/fawri-production-source');
  assert.equal(process.env.FAWRI_ALLOW_LOCAL_V1_POS_OFF_RETENTION,'1');
  const target=new URL(process.env.DATABASE_URL??'');
  assert.equal(target.protocol,'postgresql:');
  assert.equal(target.hostname,'127.0.0.1');
  assert.equal(target.port,'5432');
  assert.equal(target.pathname,'/fawri_ci');
  assert.equal(decodeURIComponent(target.username),'fawri_ci');
  assert.equal(target.search,'');
  assert.equal(target.hash,'');
  return target;
}
function connection(base,user,pass){
  const u=new URL(base.toString());
  u.username=user;u.password=pass;u.pathname='/'+DB;
  return u.toString();
}
async function fixture(db,authPassword,tenantPassword){
  await db.query('CREATE SCHEMA drizzle');
  await db.query('CREATE TABLE drizzle.__drizzle_migrations (id integer)');
  await db.query(`CREATE TABLE public.merchants (
    id text PRIMARY KEY, status text NOT NULL,
    retention_status text NOT NULL DEFAULT 'active')`);
  await db.query(`CREATE TABLE public.cashier_device_streams (
    id text PRIMARY KEY, merchant_id text NOT NULL
      REFERENCES public.merchants(id),
    state text NOT NULL DEFAULT 'active')`);
  await db.query('ALTER TABLE public.cashier_device_streams ENABLE ROW LEVEL SECURITY');
  await db.query(`CREATE POLICY pos_scoped_read ON public.cashier_device_streams
    FOR SELECT USING (false)`);
  await db.query(`CREATE FUNCTION public.fawri_authentication_runtime()
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  await db.query('REVOKE ALL ON FUNCTION public.fawri_authentication_runtime() FROM PUBLIC');
  await db.query(`CREATE FUNCTION public.fawri_sequence_merchant_deleted()
    RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
    SET search_path=pg_catalog AS $$
    BEGIN
      RAISE EXCEPTION 'old POS retirement requires excluded writer role'
        USING ERRCODE='42501';
    END $$`);
  await db.query(`CREATE TRIGGER cashier_device_streams_merchant_deleted
    AFTER UPDATE OF retention_status ON public.merchants
    FOR EACH ROW WHEN (
      NEW.retention_status='deleted'
      AND OLD.retention_status IS DISTINCT FROM NEW.retention_status
    ) EXECUTE FUNCTION public.fawri_sequence_merchant_deleted()`);
  await db.query(`CREATE ROLE ${AUTH} LOGIN NOINHERIT NOSUPERUSER
    NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
    PASSWORD '${authPassword}'`);
  await db.query(`CREATE ROLE ${TENANT} LOGIN NOINHERIT NOSUPERUSER
    NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
    PASSWORD '${tenantPassword}'`);
  await db.query(`GRANT SELECT, UPDATE ON public.merchants
    TO ${AUTH},${TENANT}`);
  await db.query(`GRANT EXECUTE ON FUNCTION
    public.fawri_authentication_runtime() TO ${AUTH}`);
  await db.query(`INSERT INTO public.merchants (id,status,retention_status)
    VALUES ('no-pos','active','active'),('with-pos','active','active'),
      ('not-suspended','active','active'),('unauthorized','active','active')`);
  await db.query(`INSERT INTO public.cashier_device_streams(id,merchant_id,state)
    VALUES ('retired-history','with-pos','retired')`);
}

async function run(){
  const local=requireLocal();
  const ownerPass=randomBytes(32).toString('hex');
  const authPass=randomBytes(32).toString('hex');
  const tenantPass=randomBytes(32).toString('hex');
  const admin=new pg.Client({connectionString:local.toString(),ssl:false,
    connectionTimeoutMillis:3000});
  await admin.connect();
  let createdOwner=false,createdDb=false,owner;
  try{
    const pre=(await admin.query(`SELECT
      current_database() AS db,
      current_setting('server_version_num')::int/10000 AS major,
      (SELECT count(*)::int FROM pg_database WHERE datname=$1) AS existing_db,
      (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($2::text[]))
        AS existing_roles`,[DB,allRoles])).rows[0];
    assert.deepEqual(pre,{
      db:'fawri_ci',major:18,existing_db:0,existing_roles:0,
    },'V1_POS_OFF_DISPOSABLE_PREIMAGE_NOT_CLEAN');
    await admin.query(`CREATE ROLE ${OWNER} LOGIN NOSUPERUSER BYPASSRLS
      CREATEROLE CREATEDB REPLICATION PASSWORD '${ownerPass}'`);
    createdOwner=true;
    await admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER}`);
    createdDb=true;
    owner=new pg.Client({connectionString:connection(local,OWNER,ownerPass),
      ssl:false,connectionTimeoutMillis:3000});
    await owner.connect();
    await fixture(owner,authPass,tenantPass);

    const legacy=(await owner.query(`SELECT pg_get_functiondef(
      'public.fawri_sequence_merchant_deleted()'::regprocedure
    ) AS code`)).rows[0].code;
    await owner.query(SOURCE);
    const role=(await owner.query(`SELECT rolsuper,rolbypassrls
      FROM pg_roles WHERE rolname=$1`,[OWNER])).rows[0];
    assert.deepEqual(role,{rolsuper:false,rolbypassrls:true});
    const legacyAfter=(await owner.query(`SELECT pg_get_functiondef(
      'public.fawri_sequence_merchant_deleted()'::regprocedure
    ) AS code`)).rows[0].code;
    assert.equal(legacyAfter,legacy,'V1_POS_OFF_HISTORICAL_FUNCTION_MODIFIED');
    // The extra SECURITY DEFINER function cannot be called directly.
    const acl=(await owner.query(`SELECT has_function_privilege(
      $1::text,'public.fawri_v1_pos_off_merchant_deleted()','EXECUTE'
    ) AS direct_execute`,[AUTH])).rows[0];
    assert.equal(acl.direct_execute,false,
      'V1_POS_OFF_TRUSTED_TRIGGER_DIRECT_EXECUTE_DENIED');

    const auth=new pg.Client({connectionString:connection(local,AUTH,authPass),
      ssl:false,connectionTimeoutMillis:3000});
    const tenant=new pg.Client({connectionString:connection(local,TENANT,tenantPass),
      ssl:false,connectionTimeoutMillis:3000});
    try{
      await auth.connect();
      await tenant.connect();
      const restricted=(await auth.query(`SELECT session_user AS login,
        current_user AS actor,
        has_table_privilege(session_user,'public.cashier_device_streams',
          'SELECT,INSERT,UPDATE,DELETE') AS cashier_access`)).rows[0];
      assert.deepEqual(restricted,{
        login:AUTH,actor:AUTH,cashier_access:false,
      });
      const ok=await auth.query(`UPDATE public.merchants SET
        status='suspended',retention_status='deleted'
        WHERE id='no-pos' RETURNING id,retention_status`);
      assert.deepEqual(ok.rows,[{id:'no-pos',retention_status:'deleted'}]);
      // Check *retired historical stream* still blocks, not just active streams.
      await assert.rejects(
        ()=>auth.query(`UPDATE public.merchants SET
          status='suspended',retention_status='deleted' WHERE id='with-pos'`),
        e=>e?.code==='23514'&&/preserved cashier data/.test(e?.message??''));
      await assert.rejects(
        ()=>auth.query(`UPDATE public.merchants SET
          retention_status='deleted' WHERE id='not-suspended'`),
        e=>e?.code==='23514'&&/must be suspended/.test(e?.message??''));
      await assert.rejects(
        ()=>tenant.query(`UPDATE public.merchants SET
          status='suspended',retention_status='deleted'
          WHERE id='unauthorized'`),
        e=>e?.code==='42501'&&/trusted merchant retention authority/.test(e?.message??''));
      await assert.rejects(
        ()=>auth.query('SELECT * FROM public.cashier_device_streams'),
        e=>e?.code==='42501');
      const rows=(await owner.query(`SELECT m.id,m.status,m.retention_status
        FROM public.merchants m ORDER BY m.id`)).rows;
      assert.deepEqual(rows,[
        {id:'no-pos',status:'suspended',retention_status:'deleted'},
        {id:'not-suspended',status:'active',retention_status:'active'},
        {id:'unauthorized',status:'active',retention_status:'active'},
        {id:'with-pos',status:'active',retention_status:'active'},
      ]);
      const history=(await owner.query(`SELECT id,merchant_id,state
        FROM public.cashier_device_streams`)).rows;
      assert.deepEqual(history,[{
        id:'retired-history',merchant_id:'with-pos',state:'retired',
      }]);
      console.log('V1_POS_OFF_ZERO_STREAM_AUTH_DELETION_ALLOWED_PASS');
      console.log('V1_POS_OFF_RETIRED_CASHIER_HISTORY_PRESERVED_DENY_PASS');
      console.log('V1_POS_OFF_NO_AUTH_CASHIER_GRANTS_AND_DENIED_TENANT_PASS');
      console.log('V1_POS_OFF_HELD_PATCH_EXACT_LOCAL_PG18_PASS_NO_NEON');
    }finally{
      await Promise.allSettled([auth.end(),tenant.end()]);
    }
  }finally{
    if(owner)await owner.end();
    if(createdDb)await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    if(createdOwner){
      for(const name of [...allRoles].reverse()){
        await admin.query('DROP ROLE IF EXISTS '+name);
      }
    }
    const remain=(await admin.query(`SELECT count(*)::int AS n FROM pg_roles
      WHERE rolname=ANY($1::text[])`,[allRoles])).rows[0].n;
    assert.equal(remain,0,'V1_POS_OFF_LOCAL_ROLES_NOT_CLEANED');
    await admin.end();
    console.log('V1_POS_OFF_LOCAL_ROLLBACK_ZERO_ROLES_PASS');
  }
}
await run();
