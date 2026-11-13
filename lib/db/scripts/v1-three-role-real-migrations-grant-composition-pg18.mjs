/**
 * P0-ACCESS-HOSTED-IDENTITY / P0-ACCESS-HOSTED-ROLLOUT:
 * NEW first-merchant integration of the 3 pinned V1 HELD grant sources
 * on the ACTUAL source-pinned 0000..0053 first-commercial candidate schema.
 * No legacy cashier grants, no staging imports, no external provider data.
 *
 * ONLY an isolated GitHub Actions PostgreSQL 18 LOCAL service.
 * This cannot become a production provisioning tool. No connection to Neon,
 * no production credentials, no deployment authority, no GO/P0 closure.
 */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {materializeFt01LocalOnlyBundle}
  from '../../../scripts/lib/ft01-first-commercial-disposable-bundle.mjs';
import {buildP0Held0053SourceAdmissionPlan}
  from '../../../scripts/lib/p0-held-0053-source-admission-plan.mjs';
import {buildV1FirstMerchantGrantSourcePlan}
  from '../../../scripts/lib/v1-first-merchant-grant-package-source-plan.mjs';
import {stabilizeMigrationDependencyOrder} from './lib/migration-sql-order.mjs';

const {Client,Pool}=pg;
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const DB='fawri';
const OWNER='fawri_owner';
const roles=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'];
const disposableRoles=[...roles,'fawri_cashier_retirement_writer'];
const RESERVED='docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql';
const read=relative=>fs.readFileSync(path.join(repoRoot,relative),'utf8');
const sha256=s=>createHash('sha256').update(s,'utf8').digest('hex');
const sha1blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');

function localOnly(){
  assert.equal(process.argv.length,2,'V1_COMBINED_NO_ARGS');
  assert.equal(process.env.GITHUB_ACTIONS,'true','V1_COMBINED_CI_ONLY');
  assert.equal(process.env.GITHUB_REPOSITORY,
    'nora953/fawri-production-source','V1_COMBINED_REPO_ONLY');
  assert.equal(process.env.FAWRI_ALLOW_FT01_INVOKER_CANDIDATE,'1',
    'V1_COMBINED_PINNED_MIGRATION_REQUIRED');
  assert.equal(process.env.FAWRI_ALLOW_LOCAL_V1_THREE_ROLE_COMPOSITION,'1',
    'V1_COMBINED_EXPLICIT_LOCAL_FLAG_REQUIRED');
  const url=new URL(process.env.DATABASE_URL??'');
  assert.equal(url.protocol,'postgresql:');
  assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.port,'5432');
  assert.equal(url.pathname,'/fawri_ci');
  assert.equal(decodeURIComponent(url.username),'fawri_ci');
  assert.equal(url.search,'');assert.equal(url.hash,'');
  return url;
}
function urlFor(u,role,secret,db=DB){
  const v=new URL(u.toString());v.username=role;v.password=secret;
  v.pathname='/'+db;return v.toString();
}
async function ensureCleanLocalCluster(admin){
  const row=(await admin.query(`SELECT current_database() AS db,
    current_setting('server_version_num')::int/10000 AS pg_major,
    (SELECT count(*)::int FROM pg_database WHERE datname=$1) AS db_count,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname=$2 OR rolname=ANY($3::text[])
        OR rolname='fawri_cashier_retirement_owner') AS role_count`,
    [DB,OWNER,disposableRoles])).rows[0];
  assert.deepEqual(row,{db:'fawri_ci',pg_major:18,db_count:0,role_count:0},
    'V1_COMBINED_DISPOSABLE_CLUSTER_NOT_EMPTY');
}
async function proveActualRole({rootUrl,role,password,privateFunctionOids}){
  const client=new Client({connectionString:urlFor(rootUrl,role,password),
    connectionTimeoutMillis:3000,ssl:false});
  await client.connect();
  try {
    const row=(await client.query(`SELECT session_user AS session_login,
      current_user AS active_login,current_database() AS observed_db,
      r.rolcanlogin AS can_login,r.rolinherit AS inherit,
      r.rolsuper AS superuser,r.rolbypassrls AS bypassrls,
      r.rolcreaterole AS createrole,r.rolcreatedb AS createdb,
      r.rolreplication AS replication,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
         AS outgoing_membership,
      has_schema_privilege(session_user,'public','CREATE') AS public_create,
      has_function_privilege(session_user,
        'public.fawri_authentication_runtime()','EXECUTE') AS auth_marker,
      -- Checking a private function by text signature may throw 42501 for
      -- a correctly denied schema USAGE role. Its catalog OID is fetched
      -- only by the owner before these role sessions are created.
      has_function_privilege(session_user,$1::oid,'EXECUTE') AS issue_scope,
      has_function_privilege(session_user,$2::oid,'EXECUTE')
         AS tenant_predicate,
      has_function_privilege(session_user,
        'public.fawri_issue_admin_directory_audit(text,text,text)',
        'EXECUTE') AS operator_directory,
      has_table_privilege(session_user,'public.cashier_device_streams',
         'SELECT,INSERT,UPDATE,DELETE') AS cashier_data,
      has_table_privilege(session_user,'public.verified_provider_payment_receipts',
         'SELECT,INSERT,UPDATE,DELETE') AS verified_receipt_table,
      has_table_privilege(session_user,'public.products','SELECT') AS products_select,
      (has_table_privilege(session_user,'public.commerce_promotions','SELECT')
       AND has_table_privilege(session_user,'public.commerce_promotions','INSERT')
       AND has_table_privilege(session_user,'public.commerce_promotions','UPDATE')
       AND has_table_privilege(session_user,'public.commerce_promotions','DELETE')) AS promotion_crud,
      has_table_privilege(session_user,'public.merchants','SELECT') AS global_merchant_select,
      has_column_privilege(session_user,'public.subscription_reply_batches',
        'remaining','SELECT') AS scoped_subscription_batch_balance_read,
      has_table_privilege(session_user,'public.subscription_reply_batches',
        'SELECT') AS global_subscription_batch_select,
      has_table_privilege(session_user,'public.subscription_reply_batches',
        'UPDATE') AS subscription_batch_update,
      has_column_privilege(session_user,'public.order_payment_decisions',
        'id','SELECT') AS scoped_payment_decision_read,
      has_column_privilege(session_user,'public.order_terminal_decision_links',
        'decision_id','SELECT') AS scoped_terminal_link_read,
      has_table_privilege(session_user,'public.order_payment_decisions',
        'SELECT,INSERT,UPDATE,DELETE') AS payment_decision_whole_table,
      has_table_privilege(session_user,'public.order_terminal_decision_links',
        'SELECT,INSERT,UPDATE,DELETE') AS terminal_link_whole_table,
      has_function_privilege(session_user,
        'public.fawri_v1_scoped_merchant_region(text,boolean)',
        'EXECUTE') AS scoped_region_read,
      has_function_privilege(session_user,
        'public.fawri_v1_update_scoped_merchant_currency(text,text)',
        'EXECUTE') AS scoped_currency_update,
      has_table_privilege(session_user,'public.merchants','UPDATE')
        AS global_merchant_update,
      has_column_privilege(session_user,'public.merchant_channels',
        'page_id','SELECT') AS meta_page_read,
      has_column_privilege(session_user,'public.merchant_channels',
        'credential_ciphertext','SELECT') AS meta_ciphertext_read,
      has_table_privilege(session_user,'public.merchant_channels',
        'INSERT') AS meta_channel_insert,
      has_function_privilege(session_user,
        'public.fawri_resolve_meta_page_merchants(text[])',
        'EXECUTE') AS meta_ingress_resolution,
      has_table_privilege(session_user,'public.background_jobs',
        'SELECT') AS durable_jobs_read,
      has_table_privilege(session_user,'public.background_job_payloads',
        'INSERT') AS durable_payload_insert,
      has_table_privilege(session_user,'public.job_attempts',
        'SELECT') AS durable_attempt_read,
      has_table_privilege(session_user,'public.job_dead_letters',
        'SELECT') AS durable_dead_letter_read
      FROM pg_roles r WHERE r.rolname=session_user`,
      [privateFunctionOids.scope,privateFunctionOids.tenant])).rows[0];
    assert.deepEqual(row,{
      session_login:role,active_login:role,observed_db:DB,
      can_login:true,inherit:false,superuser:false,bypassrls:false,
      createrole:false,createdb:false,replication:false,
      outgoing_membership:false,public_create:false,
      auth_marker:role==='fawri_auth_issuer',
      issue_scope:role==='fawri_auth_issuer',
      tenant_predicate:role==='fawri_restricted_runtime',
      operator_directory:role==='fawri_operator_issuer',
      cashier_data:false,verified_receipt_table:false,
      products_select:role==='fawri_restricted_runtime',
      promotion_crud:role==='fawri_restricted_runtime',
      global_merchant_select:role==='fawri_auth_issuer',
      scoped_subscription_batch_balance_read:role==='fawri_restricted_runtime',
      global_subscription_batch_select:false,
      subscription_batch_update:false,
      scoped_payment_decision_read:role==='fawri_restricted_runtime',
      scoped_terminal_link_read:role==='fawri_restricted_runtime',
      payment_decision_whole_table:false,
      terminal_link_whole_table:false,
      scoped_region_read:role==='fawri_restricted_runtime',
      scoped_currency_update:role==='fawri_restricted_runtime',
      global_merchant_update:role==='fawri_auth_issuer',
      meta_page_read:role!=='fawri_operator_issuer',
      meta_ciphertext_read:role==='fawri_auth_issuer',
      meta_channel_insert:role==='fawri_auth_issuer',
      meta_ingress_resolution:role==='fawri_restricted_runtime',
      durable_jobs_read:role==='fawri_restricted_runtime',
      durable_payload_insert:role==='fawri_restricted_runtime',
      durable_attempt_read:role==='fawri_restricted_runtime',
      durable_dead_letter_read:role==='fawri_restricted_runtime',
    },'V1_COMBINED_REAL_ROLE_GRANTS_MISMATCH_'+role);
    // Online merchant reads are scoped by the real migrated policies, even
    // though the tenant has SELECT on the catalog relation.
    if (role==='fawri_restricted_runtime') {
      const result=await client.query('SELECT count(*)::int AS n FROM public.products');
      assert.equal(result.rows[0]?.n,0,
        'V1_COMBINED_NO_MERCHANT_SCOPE_MUST_SHOW_ZERO_PRODUCTS');
      const promotions=await client.query(
        'SELECT count(*)::int AS n FROM public.commerce_promotions');
      assert.equal(promotions.rows[0]?.n,0,
        'V1_COMBINED_NO_SCOPE_MUST_HIDE_COMMERCE_PROMOTIONS');
      const columns=await client.query(
        'SELECT id,page_id,platform FROM public.merchant_channels LIMIT 1');
      assert.deepEqual(columns.rows,[],
        'V1_META_TENANT_NO_SCOPE_CHANNELS_MUST_BE_HIDDEN');
      const routing=await client.query(
        "SELECT page_id,merchant_id FROM public.fawri_resolve_meta_page_merchants(ARRAY['unconnected-page']::text[])");
      assert.deepEqual(routing.rows,[],'V1_META_BOUNDED_UNMATCHED_PAGE');
      await assert.rejects(
        ()=>client.query(
          'SELECT credential_ciphertext FROM public.merchant_channels LIMIT 1'),
        e=>e?.code==='42501','V1_META_CREDENTIAL_COLUMN_MUST_BE_DENIED');
      await assert.rejects(
        ()=>client.query('SELECT id FROM public.merchants LIMIT 1'),
        e=>e?.code==='42501','V1_WORKER_TENANT_MERCHANT_ENUM_DENIED');
      await assert.rejects(
        ()=>client.query(`SELECT id FROM
          public.fawri_v1_scoped_merchant_region(
            'v1-fixture-tenant-a',false)`),
        e=>e?.code==='42501','V1_REGION_NO_SCOPE_MUST_DENY');
      await assert.rejects(
        ()=>client.query(`SELECT id FROM
          public.fawri_v1_update_scoped_merchant_currency(
            'v1-fixture-tenant-a','USD')`),
        e=>e?.code==='42501','V1_CURRENCY_NO_SCOPE_MUST_DENY');
      // No authenticated scoped transaction -> both merchants' histories
      // are filtered by real tenant RLS despite table SELECT grants.
      const hiddenAttempts=await client.query(
        'SELECT id FROM public.job_attempts ORDER BY id');
      const hiddenLetters=await client.query(
        'SELECT id FROM public.job_dead_letters ORDER BY id');
      assert.deepEqual(hiddenAttempts.rows,[],
        'V1_WORKER_UNSCOPED_JOB_ATTEMPTS_VISIBLE');
      assert.deepEqual(hiddenLetters.rows,[],
        'V1_WORKER_UNSCOPED_DEAD_LETTERS_VISIBLE');
    }
    if (role==='fawri_auth_issuer') {
      const all=await client.query(
        'SELECT id FROM public.merchants ORDER BY id');
      assert.deepEqual(all.rows,[
        {id:'v1-fixture-tenant-a'},{id:'v1-fixture-tenant-b'}
      ],'V1_META_AUTH_MERCHANT_ENUM_OWNS_GLOBAL_SCOPE');
      const channels=await client.query(
        'SELECT id,credential_ciphertext FROM public.merchant_channels LIMIT 1');
      assert.deepEqual(channels.rows,[],
        'V1_META_AUTH_CREDENTIAL_QUERY_AVAILABLE_ON_EMPTY_SOURCE');
    }
  }finally{await client.end();}
}

async function proveBoundedMerchantRegion({rootUrl,passwords,ownerPool}) {
  const tenant=new Client({connectionString:urlFor(rootUrl,
    'fawri_restricted_runtime',passwords.fawri_restricted_runtime),
    ssl:false,connectionTimeoutMillis:3000});
  const issuer=new Client({connectionString:urlFor(rootUrl,
    'fawri_auth_issuer',passwords.fawri_auth_issuer),
    ssl:false,connectionTimeoutMillis:3000});
  await tenant.connect();await issuer.connect();
  // Synthetic monetary history belongs only to the second merchant; it
  // must not allow a restricted caller to change that merchant's currency.
  await ownerPool.query(`INSERT INTO public.products(id,merchant_id,name)
    VALUES ('v1-region-money-b','v1-fixture-tenant-b','Synthetic product')`);
  let began=false;
  try {
    await tenant.query('BEGIN');began=true;
    const identity=(await tenant.query(`SELECT session_user::name AS login,
      pg_backend_pid() AS pid,txid_current()::text AS xid`)).rows[0];
    await issuer.query(`SELECT fawri_security.issue_scope(
      $1::name,$2::integer,$3::bigint,$4::text)`,
      [identity.login,identity.pid,identity.xid,'v1-fixture-tenant-a']);
    const own=(await tenant.query(`SELECT id,country_code,timezone,currency_code
      FROM public.fawri_v1_scoped_merchant_region($1::text,false)`,
      ['v1-fixture-tenant-a'])).rows;
    assert.equal(own.length,1,'V1_REGION_OWN_ROW_REQUIRED');
    assert.equal(own[0].id,'v1-fixture-tenant-a');
    for(const col of ['country_code','timezone','currency_code'])
      assert.ok(own[0][col],'V1_REGION_OWN_PROFILE_'+col);
    await tenant.query('SAVEPOINT region_foreign_negative');
    try {
      await assert.rejects(
        ()=>tenant.query(`SELECT id FROM
          public.fawri_v1_scoped_merchant_region($1::text,true)`,
          ['v1-fixture-tenant-b']),
        e=>e?.code==='42501','V1_REGION_FOREIGN_LOCK_MUST_DENY');
    }finally{
      await tenant.query('ROLLBACK TO SAVEPOINT region_foreign_negative');
      await tenant.query('RELEASE SAVEPOINT region_foreign_negative');
    }
    await tenant.query('SAVEPOINT v1_currency_foreign');
    try {
      await assert.rejects(
        ()=>tenant.query(`SELECT id FROM
          public.fawri_v1_update_scoped_merchant_currency(
            $1::text,$2::text)`,['v1-fixture-tenant-b','USD']),
        e=>e?.code==='42501','V1_CURRENCY_FOREIGN_UPDATE_DENIED');
    }finally{
      await tenant.query('ROLLBACK TO SAVEPOINT v1_currency_foreign');
      await tenant.query('RELEASE SAVEPOINT v1_currency_foreign');
    }
    const changed=(await tenant.query(`SELECT id,currency_code FROM
      public.fawri_v1_update_scoped_merchant_currency($1::text,$2::text)`,
      ['v1-fixture-tenant-a','USD'])).rows;
    assert.deepEqual(changed,[{id:'v1-fixture-tenant-a',currency_code:'USD'}],
      'V1_CURRENCY_OWN_EMPTY_STORE_CHANGE_ACCEPTED');
    const locked=(await tenant.query(`SELECT id FROM
      public.fawri_v1_scoped_merchant_region($1::text,true)`,
      ['v1-fixture-tenant-a'])).rows;
    assert.deepEqual(locked,[{id:'v1-fixture-tenant-a'}],
      'V1_REGION_OWN_FOR_UPDATE_MUST_RETAIN_TRANSACTION_LOCK');
    await assert.rejects(()=>tenant.query(
      'SELECT id FROM public.merchants LIMIT 1'),
      e=>e?.code==='42501','V1_REGION_GLOBAL_MERCHANT_READ_FORBIDDEN');
    // End the first transaction; a second fresh scope must never inherit it.
    await tenant.query('ROLLBACK');began=false;
    await tenant.query('BEGIN');began=true;
    const second=(await tenant.query(`SELECT session_user::name AS login,
      pg_backend_pid() AS pid,txid_current()::text AS xid`)).rows[0];
    await issuer.query(`SELECT fawri_security.issue_scope(
      $1::name,$2::integer,$3::bigint,$4::text)`,
      [second.login,second.pid,second.xid,'v1-fixture-tenant-b']);
    await tenant.query('SAVEPOINT v1_currency_money');
    try {
      await assert.rejects(
        ()=>tenant.query(`SELECT currency_code FROM
          public.fawri_v1_update_scoped_merchant_currency(
            $1::text,$2::text)`,['v1-fixture-tenant-b','EUR']),
        e=>e?.code==='23514' &&
          /V1_MERCHANT_CURRENCY_MONETARY_GUARD/.test(e.message),
        'V1_CURRENCY_EXISTING_MONEY_CANNOT_CHANGE');
    }finally{
      await tenant.query('ROLLBACK TO SAVEPOINT v1_currency_money');
      await tenant.query('RELEASE SAVEPOINT v1_currency_money');
    }
    const stayed=(await issuer.query(`SELECT currency_code
      FROM public.merchants WHERE id=$1`,['v1-fixture-tenant-b'])).rows;
    assert.deepEqual(stayed,[{currency_code:'IQD'}],
      'V1_CURRENCY_BLOCKED_TENANT_STAYS_ORIGINAL');
    console.log('V1_SCOPED_REGION_AND_CURRENCY_GUARDS_REAL_PG18_PASS');
  }finally{
    if(began)await tenant.query('ROLLBACK');
    await ownerPool.query(`DELETE FROM public.products
      WHERE id='v1-region-money-b'`);
    await issuer.end();await tenant.end();
  }
}


async function proveScopedOrderDecisionProjection({rootUrl,passwords,ownerPool}){
  // The order-list/details handler always joins links+decisions, including
  // ordinary orders with no decision. Exercise the exact column set under
  // the real first-commercial RLS and three independently authenticated roles.
  await ownerPool.query(`INSERT INTO public.orders
    (id,merchant_id,customer_name,source_channel)
    VALUES ('v1-view-order-a','v1-fixture-tenant-a','Synthetic A','messenger'),
      ('v1-view-order-b','v1-fixture-tenant-b','Synthetic B','messenger')`);
  await ownerPool.query(`INSERT INTO public.order_payment_decisions
    (id,merchant_id,order_id,operation,payment_channel,outcome,
     previous_order_status,resulting_order_status,
     previous_payment_status,resulting_payment_status,
     actor_type,actor_account_id,expected_version,resulting_version)
    VALUES
      ('v1-view-decision-a','v1-fixture-tenant-a','v1-view-order-a',
        'confirm','cash_on_delivery','paid','pending_confirmation','delivered',
        'cash_on_delivery','paid','merchant','v1-fixture-tenant-a',1,2),
      ('v1-view-decision-b','v1-fixture-tenant-b','v1-view-order-b',
        'confirm','cash_on_delivery','paid','pending_confirmation','delivered',
        'cash_on_delivery','paid','merchant','v1-fixture-tenant-b',1,2)`);
  await ownerPool.query(`INSERT INTO public.order_terminal_decision_links
    (merchant_id,order_id,decision_id)
    VALUES ('v1-fixture-tenant-a','v1-view-order-a','v1-view-decision-a'),
      ('v1-fixture-tenant-b','v1-view-order-b','v1-view-decision-b')`);
  const tenant=new Client({connectionString:urlFor(rootUrl,
    'fawri_restricted_runtime',passwords.fawri_restricted_runtime),
    connectionTimeoutMillis:3000,ssl:false});
  const issuer=new Client({connectionString:urlFor(rootUrl,
    'fawri_auth_issuer',passwords.fawri_auth_issuer),
    connectionTimeoutMillis:3000,ssl:false});
  await tenant.connect();await issuer.connect();
  const query=`SELECT d.id,d.merchant_id,d.order_id,
    d.operation::text AS operation,d.payment_channel::text AS payment_channel,
    d.outcome::text AS outcome,d.confirmation_source::text AS confirmation_source,
    d.previous_order_status::text AS previous_order_status,
    d.resulting_order_status::text AS resulting_order_status,
    d.previous_payment_status::text AS previous_payment_status,
    d.resulting_payment_status::text AS resulting_payment_status,
    d.actor_type::text AS actor_type,d.actor_account_id,
    d.request_id,d.reason,d.expected_version,d.resulting_version,d.decided_at
    FROM public.order_terminal_decision_links l
    JOIN public.order_payment_decisions d
      ON d.id=l.decision_id AND d.order_id=l.order_id
        AND d.merchant_id=l.merchant_id
    WHERE l.merchant_id=$1 AND l.order_id=$2 LIMIT 1`;
  let began=false;
  try {
    const naked=(await tenant.query(query,
      ['v1-fixture-tenant-a','v1-view-order-a'])).rows;
    assert.deepEqual(naked,[],'V1_ORDER_DECISION_UNSCOPED_ROW_DENIED');
    await tenant.query('BEGIN');began=true;
    const session=(await tenant.query(`SELECT session_user::name AS login,
      pg_backend_pid() AS pid,txid_current()::text AS xid`)).rows[0];
    await issuer.query(`SELECT fawri_security.issue_scope(
      $1::name,$2::integer,$3::bigint,$4::text)`,
      [session.login,session.pid,session.xid,'v1-fixture-tenant-a']);
    const own=(await tenant.query(query,
      ['v1-fixture-tenant-a','v1-view-order-a'])).rows;
    assert.equal(own.length,1,'V1_ORDER_DECISION_OWN_REQUIRED');
    assert.equal(own[0].id,'v1-view-decision-a');
    assert.equal(own[0].actor_type,'merchant');
    assert.equal(own[0].outcome,'paid');
    assert.deepEqual((await tenant.query(query,
      ['v1-fixture-tenant-b','v1-view-order-b'])).rows,[],
      'V1_ORDER_DECISION_FOREIGN_ROW_FORBIDDEN');
    for(const [label,sql] of [
      ['whole decision SELECT','SELECT * FROM public.order_payment_decisions'],
      ['whole link SELECT','SELECT * FROM public.order_terminal_decision_links'],
      ['decision mutation','UPDATE public.order_payment_decisions SET reason=NULL'],
      ['provider event read','SELECT id FROM public.order_payment_provider_events'],
      ['private provenance read','SELECT source_file FROM public.order_payment_decisions'],
    ]){
      await tenant.query('SAVEPOINT v1_order_decision_denial');
      try{
        await assert.rejects(()=>tenant.query(sql),
          e=>e?.code==='42501','V1_ORDER_DECISION_DENY_'+label);
      }finally{
        await tenant.query('ROLLBACK TO SAVEPOINT v1_order_decision_denial');
        await tenant.query('RELEASE SAVEPOINT v1_order_decision_denial');
      }
    }
    console.log('V1_ORDER_DECISION_VIEW_OWN_FOREIGN_SCOPE_COLUMN_ONLY_PG18_PASS');
  } finally {
    if(began)await tenant.query('ROLLBACK');
    await issuer.end();await tenant.end();
  }
}


async function proveSubscriptionBalanceReadOnly({rootUrl,passwords,ownerPool}) {
  // One bounded merchant subscription GET must need ONLY SELECT rights:
  // no writes to expired batches, cycle status or entitlement financial rows.
  // All data below is synthetic and lives solely in isolated CI PG18.
  await ownerPool.query(`INSERT INTO public.subscriptions
    (id,merchant_id,plan_name,billing_anchor_day,starts_at,expires_at,
     status,base_reply_limit,base_replies_remaining,auto_reply_enabled)
    VALUES
     ('v1-balance-sub-a','v1-fixture-tenant-a','silver',13,
      now()-interval '1 day',now()+interval '30 days','active',100,100,true),
     ('v1-balance-sub-b','v1-fixture-tenant-b','silver',13,
      now()-interval '1 day',now()+interval '30 days','active',100,100,true)`);
  await ownerPool.query(`INSERT INTO public.subscription_reply_batches
    (id,subscription_id,merchant_id,source,amount,remaining,
     purchased_at,expires_at)
    VALUES
      ('v1-balance-batch-a','v1-balance-sub-a','v1-fixture-tenant-a',
       'purchase',10,7,now(),now()+interval '30 days'),
      ('v1-balance-batch-b','v1-balance-sub-b','v1-fixture-tenant-b',
       'purchase',10,5,now(),now()+interval '30 days')`);
  const tenant=new Client({connectionString:urlFor(rootUrl,
    'fawri_restricted_runtime',passwords.fawri_restricted_runtime),
    ssl:false,connectionTimeoutMillis:3000});
  const issuer=new Client({connectionString:urlFor(rootUrl,
    'fawri_auth_issuer',passwords.fawri_auth_issuer),
    ssl:false,connectionTimeoutMillis:3000});
  await tenant.connect();await issuer.connect();
  let began=false;
  const projection=`SELECT id,subscription_id,merchant_id,source,amount,
    remaining,purchased_at,expires_at,expiry_reminder_sent_at
    FROM public.subscription_reply_batches
    WHERE merchant_id=$1 AND remaining>0
      AND expires_at>now() ORDER BY expires_at,id`;
  try {
    assert.deepEqual((await tenant.query(projection,
      ['v1-fixture-tenant-a'])).rows,[],
      'V1_SUBSCRIPTION_BALANCE_MUST_HIDE_UNSCOPED_ROWS');
    await tenant.query('BEGIN');began=true;
    const session=(await tenant.query(`SELECT session_user::name AS login,
       pg_backend_pid() AS pid,txid_current()::text AS xid`)).rows[0];
    await issuer.query(`SELECT fawri_security.issue_scope(
      $1::name,$2::integer,$3::bigint,$4::text)`,
      [session.login,session.pid,session.xid,'v1-fixture-tenant-a']);
    const own=(await tenant.query(projection,
      ['v1-fixture-tenant-a'])).rows;
    assert.equal(own.length,1,'V1_SUBSCRIPTION_OWN_BATCH_REQUIRED');
    assert.equal(own[0].id,'v1-balance-batch-a');
    assert.equal(own[0].remaining,7);
    assert.deepEqual((await tenant.query(projection,
      ['v1-fixture-tenant-b'])).rows,[],
      'V1_SUBSCRIPTION_FOREIGN_BATCH_MUST_BE_HIDDEN');
    for(const [label,sql] of [
      ['whole-table','SELECT * FROM public.subscription_reply_batches'],
      ['batch mutation',`UPDATE public.subscription_reply_batches
        SET remaining=0 WHERE id='v1-balance-batch-a'`],
      ['subscription mutation',`UPDATE public.subscriptions
        SET base_replies_remaining=0 WHERE id='v1-balance-sub-a'`],
      ['private created timestamp',`SELECT created_at
        FROM public.subscription_reply_batches LIMIT 1`],
    ]) {
      await tenant.query('SAVEPOINT v1_readonly_negative');
      try {
        await assert.rejects(()=>tenant.query(sql),
          e=>e?.code==='42501',
          'V1_SUBSCRIPTION_READONLY_PRIVILEGE_DENY_'+label);
      } finally {
        await tenant.query('ROLLBACK TO SAVEPOINT v1_readonly_negative');
        await tenant.query('RELEASE SAVEPOINT v1_readonly_negative');
      }
    }
  } finally {
    if(began)await tenant.query('ROLLBACK');
    await issuer.end();await tenant.end();
  }
  const saved=(await ownerPool.query(`SELECT id,remaining
    FROM public.subscription_reply_batches
    WHERE id IN ('v1-balance-batch-a','v1-balance-batch-b')
    ORDER BY id`)).rows;
  assert.deepEqual(saved,[
    {id:'v1-balance-batch-a',remaining:7},
    {id:'v1-balance-batch-b',remaining:5},
  ],'V1_SUBSCRIPTION_FINANCIAL_BALANCES_UNCHANGED_AFTER_READ');
  console.log('V1_SUBSCRIPTION_GET_READONLY_OWN_FOREIGN_ZERO_FINANCIAL_WRITES_PG18_PASS');
}


async function proveAtomicReplyWriter({rootUrl,passwords,ownerPool}) {
  const tenant=new Client({connectionString:urlFor(rootUrl,
    'fawri_restricted_runtime',passwords.fawri_restricted_runtime),
    ssl:false,connectionTimeoutMillis:3000});
  const issuer=new Client({connectionString:urlFor(rootUrl,
    'fawri_auth_issuer',passwords.fawri_auth_issuer),
    ssl:false,connectionTimeoutMillis:3000});
  await tenant.connect();await issuer.connect();
  let began=false;
  async function scoped(merchantId) {
    await tenant.query('BEGIN');began=true;
    const a=(await tenant.query(`SELECT session_user::name AS login,
      pg_backend_pid() AS pid,txid_current()::text AS xid`)).rows[0];
    await issuer.query(`SELECT fawri_security.issue_scope(
      $1::name,$2::integer,$3::bigint,$4::text)`,
      [a.login,a.pid,a.xid,merchantId]);
  }
  async function commit() {await tenant.query('COMMIT');began=false;}
  async function negative(sql,args,label,code='42501') {
    await tenant.query('SAVEPOINT v1_finance_negative');
    try{await assert.rejects(()=>tenant.query(sql,args),
       e=>e?.code===code,'V1_FINANCE_DENIAL_'+label);}
    finally{await tenant.query('ROLLBACK TO SAVEPOINT v1_finance_negative');
      await tenant.query('RELEASE SAVEPOINT v1_finance_negative');}
  }
  const reserve=`SELECT public.fawri_v1_auto_reply_reserve($1::text,$2::text)
    AS decision`;
  const sendAdmit=`SELECT public.fawri_v1_auto_reply_send_admit(
    $1::text,$2::text) AS can_send`;
  const restore=`SELECT public.fawri_v1_auto_reply_restore(
      $1::text,$2::text,$3::text,$4::text) AS decision`;
  const A='v1-fixture-tenant-a',B='v1-fixture-tenant-b';
  try {
    await assert.rejects(()=>tenant.query(reserve,[A,'v1-finance-a']),
      e=>e?.code==='42501','V1_FINANCE_SCOPE_REQUIRED_WITHOUT_ISSUER');
    await assert.rejects(()=>tenant.query(sendAdmit,[A,'v1-finance-a']),
      e=>e?.code==='42501','V1_SEND_ADMIT_SCOPE_REQUIRED_WITHOUT_ISSUER');
    await scoped(A);
    await negative(reserve,[B,'v1-finance-foreign'],
      'CROSS_MERCHANT_RESERVATION');
    await negative(restore,[B,'v1-finance-a','release','MERCHANT_AUTO_REPLY_DISABLED'],
      'CROSS_MERCHANT_RELEASE');
    await negative(sendAdmit,[B,'v1-finance-a'],'CROSS_MERCHANT_SEND_ADMIT');
    await negative('UPDATE public.subscriptions SET base_replies_used=1 WHERE id=$1',
      ['v1-balance-sub-a'],'NO_DIRECT_SUBSCRIPTION_UPDATE');
    await negative('UPDATE public.subscription_reply_batches SET remaining=0 WHERE id=$1',
      ['v1-balance-batch-a'],'NO_DIRECT_BATCH_UPDATE');
    await negative(`INSERT INTO public.reply_ledger
       (id,merchant_id,direction,amount,reason_code)
       VALUES ('v1-hijack', $1,'credit',1,'fake')`,
       [A],'NO_DIRECT_LEDGER_INSERT');
    const original=(await tenant.query(reserve,[A,'v1-finance-a'])).rows[0].decision;
    assert.deepEqual(original,{allowed:true,duplicate:false,
      subscriptionId:'v1-balance-sub-a',repliesRemaining:106},
      'V1_FINANCE_OWN_ATOMIC_BASE_RESERVE');
    assert.deepEqual((await tenant.query(sendAdmit,[A,'v1-finance-a'])).rows,
      [{can_send:true}],
      'V1_SEND_ADMIT_ISSUER_SCOPED_DEBIT_ROW_LOCK_ALLOWED');
    const dupe=(await tenant.query(reserve,[A,'v1-finance-a'])).rows[0].decision;
    assert.deepEqual(dupe,{allowed:true,duplicate:true,
      subscriptionId:'v1-balance-sub-a',repliesRemaining:106},
      'V1_FINANCE_EVENT_DUPLICATE_NOT_DOUBLE_DEBITED');
    const notFailed=(await tenant.query(restore,
      [A,'v1-finance-a','refund','META_REPLY_FAILED'])).rows[0].decision;
    assert.deepEqual(notFailed,{restored:false,reason:'provider_failure_unproven'},
      'V1_FINANCE_NO_UNVERIFIED_PROVIDER_REFUND');
    const release=(await tenant.query(restore,
      [A,'v1-finance-a','release','MERCHANT_AUTO_REPLY_DISABLED'])).rows[0].decision;
    assert.deepEqual(release,{restored:true,merchantId:A,
      subscriptionId:'v1-balance-sub-a'},'V1_FINANCE_RELEASE_UNSENT');
    assert.deepEqual((await tenant.query(sendAdmit,[A,'v1-finance-a'])).rows,
      [{can_send:false}],
      'V1_SEND_ADMIT_RELEASED_DEBIT_CANNOT_PROCEED_TO_PROVIDER');
    const releaseReplay=(await tenant.query(restore,
      [A,'v1-finance-a','release','MERCHANT_AUTO_REPLY_DISABLED'])).rows[0].decision;
    assert.deepEqual(releaseReplay,{restored:false,reason:'already_released'},
      'V1_FINANCE_NO_DOUBLE_RESTORE');
    const rebook=(await tenant.query(reserve,[A,'v1-finance-a'])).rows[0].decision;
    assert.equal(rebook.allowed,false,
      'V1_FINANCE_RELEASED_EVENT_CANNOT_RESERVE_AGAIN');
    await commit();
    const restored=(await ownerPool.query(`SELECT
      base_replies_used,base_replies_remaining FROM public.subscriptions
      WHERE id='v1-balance-sub-a'`)).rows[0];
    assert.deepEqual(restored,{base_replies_used:0,base_replies_remaining:100},
      'V1_FINANCE_RELEASE_ATOMIC_BASE_COUNTERS');
    const ledger=(await ownerPool.query(`SELECT direction,count(*)::int AS n
      FROM public.reply_ledger WHERE external_event_id='v1-finance-a'
      GROUP BY direction ORDER BY direction`)).rows;
    assert.deepEqual(ledger,[{direction:'credit',n:1},{direction:'debit',n:1}],
      'V1_FINANCE_EXACTLY_ONE_DEBIT_ONE_CREDIT');
    await ownerPool.query(`INSERT INTO public.merchant_channels
      (id,merchant_id,platform,status,page_id)
      VALUES ('v1-finance-channel-a',$1,'messenger','connected',
        'v1-finance-page-a')`,[A]);
    await ownerPool.query(`INSERT INTO public.channel_inbound_events
      (id,merchant_id,channel_id,provider,external_event_id,payload_hash,
       enqueue_job_id)
      VALUES ('v1-finance-inbound-a',$1,'v1-finance-channel-a',
       'messenger','v1-finance-b',repeat('a',64),'v1-fixture-job-a')`,[A]);
    await ownerPool.query(`INSERT INTO public.outbound_deliveries
      (id,merchant_id,inbound_event_id,reply_intent_id,outcome)
      VALUES ('v1-finance-outbound-a',$1,'v1-finance-inbound-a',
      'auto:v1-finance-b','pending')`,[A]);
    await scoped(A);
    const second=(await tenant.query(reserve,[A,'v1-finance-b'])).rows[0].decision;
    assert.equal(second.allowed,true,'V1_FINANCE_PROVIDER_EVENT_RESERVE');
    const pending=(await tenant.query(restore,
      [A,'v1-finance-b','refund','META_REPLY_FAILED'])).rows[0].decision;
    assert.deepEqual(pending,{restored:false,reason:'delivery_not_terminal'},
      'V1_FINANCE_PENDING_PROVIDER_OUTCOME_NOT_REFUNDABLE');
    const releasePending=(await tenant.query(restore,
      [A,'v1-finance-b','release','MERCHANT_AUTO_REPLY_DISABLED'])).rows[0].decision;
    assert.deepEqual(releasePending,{restored:false,reason:'delivery_not_terminal'},
      'V1_FINANCE_PENDING_PROVIDER_OUTCOME_NOT_RELEASABLE');
    await commit();
    await ownerPool.query(`UPDATE public.outbound_deliveries
      SET outcome='confirmed_failed',failure_code='TEST_FAILED',
          finalized_at=now()
      WHERE id='v1-finance-outbound-a'`);
    await scoped(A);
    const refunded=(await tenant.query(restore,
      [A,'v1-finance-b','refund','META_REPLY_FAILED'])).rows[0].decision;
    assert.deepEqual(refunded,{restored:true,merchantId:A,
      subscriptionId:'v1-balance-sub-a'},
      'V1_FINANCE_CONFIRMED_PROVIDER_FAILURE_REFUND');
    const again=(await tenant.query(restore,
      [A,'v1-finance-b','refund','META_REPLY_FAILED'])).rows[0].decision;
    assert.equal(again.restored,false,'V1_FINANCE_NO_DOUBLE_REFUND');
    assert.deepEqual((await tenant.query(sendAdmit,[A,'v1-finance-b'])).rows,
      [{can_send:false}],
      'V1_SEND_ADMIT_REFUNDED_DEBIT_CANNOT_PROCEED_TO_PROVIDER');
    await commit();
    const remaining=(await ownerPool.query(`SELECT
      base_replies_used,base_replies_remaining
      FROM public.subscriptions WHERE id='v1-balance-sub-a'`)).rows[0];
    assert.deepEqual(remaining,{base_replies_used:0,base_replies_remaining:100},
      'V1_FINANCE_CONFIRMED_FAILURE_COUNTERS_RESTORED');
    const foreign=(await ownerPool.query(`SELECT base_replies_used,
      base_replies_remaining FROM public.subscriptions
      WHERE id='v1-balance-sub-b'`)).rows[0];
    assert.deepEqual(foreign,{base_replies_used:0,base_replies_remaining:100},
      'V1_FINANCE_SECOND_MERCHANT_BALANCE_UNCHANGED');
    console.log('V1_REPLY_FINANCE_ATOMIC_SCOPE_EVENT_DUPLICATE_AND_FAILURE_REFUND_PASS');
  }finally{
    if(began)await tenant.query('ROLLBACK');
    await issuer.end();await tenant.end();
  }
}

async function main(){
  const root=localOnly();
  const grants=buildV1FirstMerchantGrantSourcePlan();
  const migration=buildP0Held0053SourceAdmissionPlan();
  assert.equal(grants.approved_to_execute,false);
  assert.equal(grants.selected_grant_sources.length,3);
  assert.equal(grants.legacy_not_selected.length,2);
  assert.equal(migration.proposed_held_source_migrations,54);
  assert.equal(migration.approved_to_execute,false);
  const reservation=read(RESERVED);
  assert.equal(sha256(reservation),grants.reservation_sql_sha256,
    'V1_COMBINED_RESERVED_FOUR_ROLE_SQL_DRIFT');
  const admin=new Client({connectionString:root.toString(),
    ssl:false,connectionTimeoutMillis:3000});
  const ownerPassword=randomBytes(32).toString('hex');
  const passwords=Object.fromEntries(roles.map(role=>[
    role,randomBytes(32).toString('hex')]));
  let dbCreated=false,ownerCreated=false,ownerPool,folder;
  await admin.connect();
  try {
    await ensureCleanLocalCluster(admin);
    await admin.query(`CREATE ROLE ${OWNER} LOGIN NOSUPERUSER
      BYPASSRLS CREATEROLE CREATEDB REPLICATION
      PASSWORD '${ownerPassword}'`);
    ownerCreated=true;
    // Canonical issue_scope (0040) checks another backend's xid via
    // pg_stat_activity. Grant stats visibility only to the disposable
    // non-runtime trusted FUNCTION OWNER; no runtime LOGIN gains membership.
    // Hosted first-commercial owner capability still requires real proof.
    await admin.query(`GRANT pg_read_all_stats TO ${OWNER}`);
    await admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER}`);
    dbCreated=true;
    ownerPool=new Pool({connectionString:urlFor(root,OWNER,ownerPassword),
      max:2,ssl:false,connectionTimeoutMillis:3000});
    const who=(await ownerPool.query(`SELECT session_user AS role,
      current_database() AS db,rolsuper AS super
      FROM pg_roles WHERE rolname=session_user`)).rows[0];
    assert.deepEqual(who,{role:OWNER,db:DB,super:false});
    const stats=(await ownerPool.query(`SELECT
      pg_has_role(session_user,'pg_read_all_stats','USAGE')
        AS trusted_owner_stat_visibility`)).rows[0];
    assert.deepEqual(stats,{trusted_owner_stat_visibility:true},
      'V1_REAL_SCOPE_ISSUER_STATS_VISIBILITY_REQUIRED');
    // This is the pre-migration HELD reservation source unchanged.
    await ownerPool.query(reservation);
    const noLogin=(await ownerPool.query(`SELECT count(*)::int AS n
      FROM pg_roles WHERE rolname=ANY($1::text[])
        AND NOT (rolcanlogin OR rolinherit OR rolsuper
          OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)`,
      [disposableRoles])).rows[0].n;
    assert.equal(noLogin,4,'V1_COMBINED_RESERVED_ROLES_NOT_HELD');
    const bundle=materializeFt01LocalOnlyBundle();
    folder=bundle.folder;
    assert.equal(bundle.manifest.entries.length,53);
    const tail=read(migration.proposed_sql_path);
    const heldJournal=read(migration.proposed_journal_path);
    assert.equal(sha256(tail),migration.candidate_0053_sql_sha256);
    assert.equal(sha256(heldJournal),migration.candidate_0053_held_journal_sha256);
    fs.writeFileSync(path.join(folder,'meta','_journal.json'),heldJournal,'utf8');
    fs.writeFileSync(path.join(folder,'0053_verified_receipt_manual_cases_candidate.sql'),
      stabilizeMigrationDependencyOrder(tail),{flag:'wx',mode:0o600});
    assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.sql')).length,54);
    // Migrate ONCE for this NEW integrated V1-grants case, not rerun the
    // already accepted separate 53/54-stage migration smoke suites.
    await migrate(drizzle(ownerPool),{migrationsFolder:folder});
    const count=(await ownerPool.query(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
    assert.equal(count,54,'V1_COMBINED_0052_0053_LEDGER_REQUIRED');
    console.log('V1_COMBINED_REAL_54_STAGE_HELD_SCHEMA_READY');

    for(const role of roles){
      assert.match(passwords[role],/^[0-9a-f]{64}$/);
      // The actual Neon-style NON-SUPERUSER CREATEROLE owner cannot issue
      // NOSUPERUSER / NOBYPASSRLS ALTER attributes even if already false.
      // Verify the exact reserved role's immutable security flags first,
      // then change only LOGIN, CONNECTION LIMIT and ephemeral CI password.
      const prior=(await ownerPool.query(`SELECT
        rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole,
        rolcreatedb,rolreplication,
        EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
          AS has_inherited_or_set_role
        FROM pg_roles r WHERE r.rolname=$1`,[role])).rows[0];
      assert.deepEqual(prior,{
        rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,
        rolcreaterole:false,rolcreatedb:false,rolreplication:false,
        has_inherited_or_set_role:false,
      },'V1_COMBINED_ROLE_PREPROMOTION_PRIVILEGES_CHANGED_'+role);
      await ownerPool.query(`ALTER ROLE ${role}
        LOGIN CONNECTION LIMIT 2 PASSWORD '${passwords[role]}'`);
    }
    // Execute only the SELECTED V1 GRANT fragments. 0052 legacy cashier
    // grants and 0053 overlapping legacy operator grants are NOT executed.
    const selected=new Set(grants.selected_grant_sources.map(x=>x.role));
    assert.deepEqual([...selected].sort(),[...roles].sort());
    for(const item of grants.selected_grant_sources){
      const sql=read(item.source_path);
      assert.equal(sha1blob(sql),item.reviewed_git_blob_sha1,
        'V1_COMBINED_UNPINNED_GRANT_SOURCE');
      await ownerPool.query(sql);
    }
    // NEW approved POS-off scope compatibility, not part of original 0052.
    // The merchant-retention hook must remain callable without cashier ACL,
    // but must refuse any preserved cashier stream and have safe revert.
    const v1PosSource=read(
      'lib/db/first-commercial/held/v1_pos_off_merchant_deletion_guard.sql');
    assert.equal(sha1blob(v1PosSource),
      'bd08142e26547aeaa78850c8aa9644ec7495f217',
      'V1_COMBINED_POS_OFF_SOURCE_DRIFT');
    const legacyFunction=(await ownerPool.query(`SELECT pg_get_functiondef(
      'public.fawri_sequence_merchant_deleted()'::regprocedure
      ) AS original`)).rows[0].original;
    await ownerPool.query(v1PosSource);
    const v1Trigger=(await ownerPool.query(`SELECT
       tgfoid=to_regprocedure(
         'public.fawri_v1_pos_off_merchant_deleted()') AS v1_hook
       FROM pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass`)).rows[0];
    assert.deepEqual(v1Trigger,{v1_hook:true},
      'V1_COMBINED_POS_OFF_HOOK_NOT_ADOPTED');
    // New POS-off V1 startup admission: verify the legacy receipts/stream
    // tables and original guard triggers are still protected, but all
    // application LOGINs have ZERO cashier rights or writer-group access.
    // This is the missing production source integration, not a hosted test.
    const {assertV1PosOffStorageReady}=await import(
      '../../../artifacts/api-server/src/services/v1PosOffStorageReadiness.ts');
    const commercialTenant=new Client({
      connectionString:urlFor(root,'fawri_restricted_runtime',
        passwords.fawri_restricted_runtime),
      connectionTimeoutMillis:3000,ssl:false,
    });
    await commercialTenant.connect();
    try {
      const identities={
        primaryRole:'fawri_restricted_runtime',
        authenticationRole:'fawri_auth_issuer',
        operatorRole:'fawri_operator_issuer',
      };
      await assertV1PosOffStorageReady(commercialTenant,identities);
      await assert.rejects(
        ()=>assertV1PosOffStorageReady(commercialTenant,{
          ...identities,authenticationRole:'fawri_cashier_retirement_writer',
        }),
        /V1_POS_OFF_HISTORICAL_FINANCIAL_STORAGE_NOT_PROVEN/,
        'V1_POS_OFF_STARTUP_MUST_REJECT_CASHIER_WRITER_AS_AUTH');
    }finally{await commercialTenant.end();}
    console.log('V1_POS_OFF_STARTUP_READONLY_NO_CASHIER_ACL_PASS');
    const metaChannelSource=read(
      'lib/db/first-commercial/held/v1_meta_channel_onboarding_grants.sql');
    assert.equal(sha1blob(metaChannelSource),
      '6d87f7e87ff2e7210b4929a4ba9572bc5a1e5b41',
      'V1_META_FIRST_COMMERCIAL_GRANT_SOURCE_SHA_DRIFT');
    await ownerPool.query(metaChannelSource);
    // Preserve two local pre-patch job histories and verify deterministic
    // merchant_id backfill + full tenant RLS on the actual source schema.
    await ownerPool.query(`INSERT INTO public.accounts
       (id,kind,phone,password_hash)
       VALUES
        ('v1-fixture-tenant-a','merchant','+9647900000001','synthetic-not-login'),
        ('v1-fixture-tenant-b','merchant','+9647900000002','synthetic-not-login')`);
    await ownerPool.query(`INSERT INTO public.merchants
       (id,account_id,owner_name,store_name,activity_type)
       VALUES
        ('v1-fixture-tenant-a','v1-fixture-tenant-a','A','A Shop','test'),
        ('v1-fixture-tenant-b','v1-fixture-tenant-b','B','B Shop','test')`);
    await ownerPool.query(`INSERT INTO public.background_jobs
       (id,type,dedupe_key,merchant_id)
       VALUES
        ('v1-fixture-job-a','v1.synthetic','v1-dedupe-a','v1-fixture-tenant-a'),
        ('v1-fixture-job-b','v1.synthetic','v1-dedupe-b','v1-fixture-tenant-b')`);
    await ownerPool.query(`INSERT INTO public.job_attempts
       (id,job_id,attempt_number,worker_id,lease_generation,status)
       VALUES
        ('v1-fixture-attempt-a','v1-fixture-job-a',1,'v1-worker',1,'processing'),
        ('v1-fixture-attempt-b','v1-fixture-job-b',1,'v1-worker',1,'processing')`);
    await ownerPool.query(`INSERT INTO public.job_dead_letters
       (id,job_id,occurrence,reason_code,attempts)
       VALUES
        ('v1-fixture-letter-a','v1-fixture-job-a',1,'V1_TEST',1),
        ('v1-fixture-letter-b','v1-fixture-job-b',1,'V1_TEST',1)`);
    const workerRlsSource=read(
       'lib/db/first-commercial/held/v1_meta_worker_tenant_job_rls.sql');
    assert.equal(sha1blob(workerRlsSource),
      'a56842ad262c3a83ed41dd24109d241eb4fb6861',
      'V1_META_WORKER_RLS_SOURCE_DRIFT');
    await ownerPool.query(workerRlsSource);
    const history=(await ownerPool.query(`SELECT
       'attempt' AS kind,a.id,a.merchant_id FROM public.job_attempts a
       UNION ALL SELECT 'dead_letter',d.id,d.merchant_id
       FROM public.job_dead_letters d ORDER BY kind,id`)).rows;
    assert.deepEqual(history,[
      {kind:'attempt',id:'v1-fixture-attempt-a',merchant_id:'v1-fixture-tenant-a'},
      {kind:'attempt',id:'v1-fixture-attempt-b',merchant_id:'v1-fixture-tenant-b'},
      {kind:'dead_letter',id:'v1-fixture-letter-a',merchant_id:'v1-fixture-tenant-a'},
      {kind:'dead_letter',id:'v1-fixture-letter-b',merchant_id:'v1-fixture-tenant-b'},
    ],'V1_META_WORKER_HISTORY_BACKFILL_WRONG_OR_LOST');
    await assert.rejects(
      ()=>ownerPool.query(`INSERT INTO public.job_attempts
         (id,job_id,merchant_id,attempt_number,worker_id,lease_generation,status)
         VALUES ('v1-invalid','v1-fixture-job-a','v1-fixture-tenant-b',
           2,'v1-worker',2,'processing')`),
      e=>e?.code==='23503',
      'V1_META_WORKER_CROSS_MERCHANT_FK_MUST_DENY');
    const metaReplySource=read(
      'lib/db/first-commercial/held/v1_meta_inbound_conversation_grants.sql');
    assert.equal(sha1blob(metaReplySource),
      '9d2822c7b4c9323b2bd34be92e65990d6ddef594',
      'V1_META_REPLY_HELD_SOURCE_PIN_DRIFT');
    await ownerPool.query(metaReplySource);
    const v1ReplyWriterSource=read(
      'lib/db/first-commercial/held/v1_auto_reply_bounded_financial_writer.sql');
    assert.equal(sha1blob(v1ReplyWriterSource),
      '9d03a49ad5d3719f485e2d63a25794204c4478a5',
      'V1_REPLY_FINANCIAL_WRITER_SOURCE_PIN_DRIFT');
    await ownerPool.query(v1ReplyWriterSource);
    const metaReplyTables=[
      'channel_inbound_events','conversations','messages',
      'manual_reply_requests','outbound_deliveries','reply_ledger',
      'subscriptions'
    ];
    const privilegeEvidence=(await ownerPool.query(`SELECT
      c.relname,
      c.relrowsecurity AS rls,
      has_table_privilege('fawri_restricted_runtime',c.oid,'SELECT') AS can_read,
      has_table_privilege('fawri_restricted_runtime',c.oid,'DELETE') AS can_delete
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])
      ORDER BY c.relname`,[metaReplyTables])).rows;
    assert.equal(privilegeEvidence.length,metaReplyTables.length,
      'V1_META_REPLY_REQUIRED_TABLE_MISSING');
    assert.ok(privilegeEvidence.every(x=>x.rls&&x.can_read),
      'V1_META_REPLY_RLS_OR_SELECT_MISSING');
    assert.deepEqual(privilegeEvidence.filter(x=>x.can_delete).map(x=>x.relname),
      ['messages'],'V1_META_REPLY_DELETE_MUST_BE_RESTRICTED_TO_MESSAGES');
    const safeDelete=(await ownerPool.query(`SELECT p.polcmd,p.polpermissive,
      pg_get_expr(p.polqual,p.polrelid) AS clause
      FROM pg_policy p WHERE p.polrelid='public.messages'::regclass
      AND p.polname='v1_meta_queued_unsent_reply_delete_only'`)).rows[0];
    assert.equal(safeDelete?.polcmd,'d');
    assert.equal(safeDelete?.polpermissive,false);
    assert.match(safeDelete?.clause??'',/external_message_id IS NULL/);
    assert.match(safeDelete?.clause??'',/queued/);
    const privateFunctionOids=(await ownerPool.query(`SELECT
      'fawri_security.issue_scope(name,integer,bigint,text)'::regprocedure::oid
        AS scope,
      'fawri_security.allows_merchant(text)'::regprocedure::oid AS tenant`
    )).rows[0];
    assert.ok(privateFunctionOids?.scope&&privateFunctionOids?.tenant,
      'V1_COMBINED_PINNED_PRIVATE_FUNCTIONS_NOT_FOUND');
    for(const role of roles) {
      await proveActualRole({
        rootUrl:root,role,password:passwords[role],privateFunctionOids
      });
    }
    await proveBoundedMerchantRegion({rootUrl:root,passwords,ownerPool});
    await proveScopedOrderDecisionProjection({rootUrl:root,passwords,ownerPool});
    await proveSubscriptionBalanceReadOnly({rootUrl:root,passwords,ownerPool});
    await proveAtomicReplyWriter({rootUrl:root,passwords,ownerPool});
    // Real 54-stage migration RLS presence, not a synthetic policy fixture.
    const required=['products','orders','order_items',
      'location_inventory_levels','background_jobs',
      'background_job_payloads','job_attempts','job_dead_letters'];
    const flags=(await ownerPool.query(`SELECT c.relname,c.relrowsecurity,
      EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_exists
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])
        AND c.relkind IN ('r','p') ORDER BY c.relname`,[required])).rows;
    assert.equal(flags.length,required.length);
    assert.ok(flags.every(f=>f.relrowsecurity&&f.policy_exists),
      'V1_COMBINED_REAL_RLS_POLICY_MISSING');
    const workerRevert=read(
      'lib/db/first-commercial/held/v1_meta_worker_tenant_job_rls_failclosed_revert.sql');
    assert.equal(sha1blob(workerRevert),
      '3e27c9efb75803676db083acd4e1e4e7eb5deee0',
      'V1_META_WORKER_REVERT_SOURCE_DRIFT');
    const workerHistoryBefore=(await ownerPool.query(`SELECT
      'attempt' AS kind,id,merchant_id FROM public.job_attempts
      UNION ALL SELECT 'dead_letter',id,merchant_id
        FROM public.job_dead_letters ORDER BY kind,id`)).rows;
    await ownerPool.query(workerRevert);
    const workerHistoryAfter=(await ownerPool.query(`SELECT
      'attempt' AS kind,id,merchant_id FROM public.job_attempts
      UNION ALL SELECT 'dead_letter',id,merchant_id
        FROM public.job_dead_letters ORDER BY kind,id`)).rows;
    assert.deepEqual(workerHistoryAfter,workerHistoryBefore,
      'V1_META_WORKER_REVERT_MODIFIED_HISTORIC_JOB_DATA');
    const revoked=(await ownerPool.query(`SELECT
      has_table_privilege('fawri_restricted_runtime',
        'public.job_attempts','SELECT') AS attempt_select,
      has_table_privilege('fawri_restricted_runtime',
        'public.job_dead_letters','INSERT') AS deadletter_insert`)).rows[0];
    assert.deepEqual(revoked,{attempt_select:false,deadletter_insert:false},
      'V1_META_WORKER_REVERT_NOT_FAIL_CLOSED');
    const revokedTenant=new Client({connectionString:urlFor(
      root,'fawri_restricted_runtime',passwords.fawri_restricted_runtime),
      ssl:false,connectionTimeoutMillis:3000});
    await revokedTenant.connect();
    try {
      await assert.rejects(
        ()=>revokedTenant.query('SELECT id FROM public.job_attempts LIMIT 1'),
        e=>e?.code==='42501',
        'V1_META_WORKER_REVERT_TENANT_STILL_CAN_READ_HISTORY');
    }finally{await revokedTenant.end();}
    console.log('V1_META_WORKER_FAIL_CLOSED_NO_DATA_LOSS_REVERT_PASS');

    const v1PosRevert=read(
      'lib/db/first-commercial/held/v1_pos_off_merchant_deletion_guard_revert.sql');
    assert.equal(sha1blob(v1PosRevert),
      'f6a98b30cb053c13b5321283b8d63d8929f38f0e',
      'V1_COMBINED_POS_OFF_REVERT_SOURCE_DRIFT');
    await ownerPool.query(v1PosRevert);
    const revokedCommercialTenant=new Client({
      connectionString:urlFor(root,'fawri_restricted_runtime',
        passwords.fawri_restricted_runtime),
      connectionTimeoutMillis:3000,ssl:false,
    });
    await revokedCommercialTenant.connect();
    try {
      await assert.rejects(
        ()=>assertV1PosOffStorageReady(revokedCommercialTenant,{
          primaryRole:'fawri_restricted_runtime',
          authenticationRole:'fawri_auth_issuer',
          operatorRole:'fawri_operator_issuer',
        }),
        /V1_POS_OFF_HISTORICAL_FINANCIAL_STORAGE_NOT_PROVEN/,
        'V1_POS_OFF_REVERTED_TRIGGER_MUST_BLOCK_STARTUP');
    }finally{await revokedCommercialTenant.end();}
    const restored=(await ownerPool.query(`SELECT
       tgfoid=to_regprocedure(
         'public.fawri_sequence_merchant_deleted()') AS legacy_hook
       FROM pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass`)).rows[0];
    assert.deepEqual(restored,{legacy_hook:true},
      'V1_COMBINED_POS_OFF_REVERT_NOT_RESTORED');
    const legacyNow=(await ownerPool.query(`SELECT pg_get_functiondef(
      'public.fawri_sequence_merchant_deleted()'::regprocedure
      ) AS original`)).rows[0].original;
    assert.equal(legacyNow,legacyFunction,
      'V1_COMBINED_POS_OFF_REVERT_ALTERED_HISTORY');
    console.log('V1_META_INBOUND_REPLY_RESTRICTED_DELETE_REAL_54_STAGE_PASS');
    console.log('V1_META_WORKER_TENANT_JOB_HISTORY_RLS_FK_PASS');
    console.log('V1_META_AUTH_CHANNEL_AND_TENANT_ROUTING_ACL_PASS');
    console.log('V1_COMBINED_POS_OFF_PATCH_AND_REVERT_REAL_54_STAGE_PASS');
    console.log('V1_COMBINED_THREE_ACTUAL_AUTHENTICATED_LOGIN_ACL_PASS');
    console.log('V1_COMBINED_POS_OFF_CASHIER_GRANTS_EXCLUDED_PASS');
    console.log('V1_COMBINED_SOURCE_ONLY_NOT_HOSTED_OR_RELEASE_APPROVAL');
  }finally{
    if(ownerPool)await ownerPool.end();
    if(folder)fs.rmSync(folder,{recursive:true,force:true});
    if(dbCreated)await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    if(ownerCreated){
      for(const role of [
        'fawri_cashier_retirement_owner',
        ...[...disposableRoles].reverse(),
        OWNER]){
        await admin.query('DROP ROLE IF EXISTS '+role);
      }
    }
    const remain=(await admin.query(`SELECT count(*)::int AS n FROM pg_roles
      WHERE rolname=$1 OR rolname=ANY($2::text[])
        OR rolname='fawri_cashier_retirement_owner'`,
      [OWNER,disposableRoles])).rows[0].n;
    assert.equal(remain,0,'V1_COMBINED_DISPOSABLE_ROLES_LEFT_BEHIND');
    await admin.end();
    console.log('V1_COMBINED_LOCAL_PG18_ALL_ROLES_CLEANED_NO_NEON');
  }
}
await main();
