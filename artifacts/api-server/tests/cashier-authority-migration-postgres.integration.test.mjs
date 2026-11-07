import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {verifyCashierAuthorityCandidate,candidateDirectory} from '../../../scripts/lib/cashier-authority-candidate.mjs';
import {createStabilizedMigrationFolder} from '../../../lib/db/scripts/lib/migration-sql-order.mjs';
await assertDisposablePostgres();
const mode=process.env.FAWRI_AUDIT_AUTHORITY_MIGRATION_MODE;
assert.ok(['fresh','upgrade'].includes(mode),'explicit owned migration rehearsal required');
const {Pool}=await import('pg');
const {drizzle}=await import('drizzle-orm/node-postgres');
const {migrate}=await import('drizzle-orm/node-postgres/migrator');
const root=fileURLToPath(new URL('../../../',import.meta.url));
verifyCashierAuthorityCandidate(root);
const candidate=path.join(root,candidateDirectory);
const sqlName='0053_cashier_stream_authority.sql';
const sql=fs.readFileSync(path.join(candidate,'generated',sqlName),'utf8');
const journal=JSON.parse(fs.readFileSync(path.join(candidate,'generated/meta/_journal.json')));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const owners=['fawri_cashier_enrollment_owner','fawri_cashier_receipt_owner'];
const stateCode=e=>e?.code||e?.cause?.code;

test('candidate0053 actual Drizzle migration '+mode+': atomic faults, collision, preservation and rerun',{timeout:150000},async t=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-authority-migration-'));
  let runtime,reviewer;
  t.after(async()=>{
    await reviewer?.end();
    if(runtime)await runtime.dispose();
    await pool.end();fs.rmSync(temporary,{recursive:true,force:true});
  });
  async function folder(name,body=sql){
    const destination=path.join(temporary,name);
    fs.cpSync(path.join(root,'lib/db/drizzle'),destination,{recursive:true});
    fs.writeFileSync(path.join(destination,sqlName),body);
    fs.copyFileSync(path.join(candidate,'generated/meta/0053_snapshot.json'),path.join(destination,'meta/0053_snapshot.json'));
    fs.writeFileSync(path.join(destination,'meta/_journal.json'),JSON.stringify(journal));
    return destination;
  }
  async function run(source,target=pool){
    const stabilized=createStabilizedMigrationFolder(source);
    try{await migrate(drizzle(target),{migrationsFolder:stabilized});}
    finally{fs.rmSync(stabilized,{recursive:true,force:true});}
  }
  async function data(){
    const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const rows={};for(const {tablename} of tables)rows[tablename]=(await pool.query('SELECT to_jsonb(t) AS row FROM public.'+quote(tablename)+' t ORDER BY to_jsonb(t)::text')).rows;
    return rows;
  }
  async function snapshot(){
    return {
      data:await data(),
      journal:(await pool.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows,
      schemas:(await pool.query("SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text FROM pg_namespace WHERE nspname IN ('public','fawri_security','drizzle') ORDER BY nspname")).rows,
      roles:(await pool.query("SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname")).rows,
      memberships:(await pool.query('SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,admin_option FROM pg_auth_members ORDER BY role,member')).rows,
      tables:(await pool.query("SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','fawri_security','drizzle') ORDER BY n.nspname,c.relname")).rows,
      columns:(await pool.query("SELECT n.nspname,c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','fawri_security','drizzle') AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum")).rows,
      functions:(await pool.query("SELECT n.nspname,p.proname,pg_get_userbyid(p.proowner) AS owner,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','fawri_security') AND p.prokind='f' ORDER BY n.nspname,p.proname,args")).rows,
      policies:(await pool.query("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows,
      constraints:(await pool.query("SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','fawri_security','drizzle') ORDER BY n.nspname,c.relname,k.conname")).rows,
      triggers:(await pool.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows,
    };
  }
  async function seed(){
    for(const [i,id] of ['migration-merchant-a','migration-merchant-b'].entries()){
      await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','active')",[id,'+1999777000'+i]);
      await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
      await pool.query("INSERT INTO merchant_locations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",['location-'+id,id]);
      await pool.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,pin_hash) VALUES($1,$2,'Synthetic',repeat('0',64))",['staff-'+id,id]);
      await pool.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name,location_id) VALUES($1,$2,'Synthetic',$3)",['station-'+id,id,'location-'+id]);
      await pool.query('INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id) VALUES($1,$2,$3,$4)',['shift-'+id,id,'station-'+id,'staff-'+id]);
      await pool.query("INSERT INTO products(id,merchant_id,name,current_price_iqd,quantity) VALUES($1,$2,'Synthetic',1000,7)",['product-'+id,id]);
      await pool.query("INSERT INTO orders(id,merchant_id,customer_name,source_channel,subtotal_iqd,total_iqd,fulfillment_location_id) VALUES($1,$2,'Synthetic','cashier',1000,1000,$3)",['order-'+id,id,'location-'+id]);
      await pool.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) VALUES($1,$2,$3,'active',repeat('a',64),now())",['stream-'+id,id,'device-'+id]);
      const c=await pool.connect();try{
        await c.query('BEGIN');
        await c.query("INSERT INTO cashier_operation_receipts(id,stream_id,merchant_id,device_sequence,operation_id,operation_kind,canonical_version,request_hash,result_id,station_id,location_id,staff_id,shift_id,occurred_at) VALUES($1,$2,$3,1,$4,'sale',1,repeat('b',64),$5,$6,$7,$8,$9,now())",['receipt-'+id,'stream-'+id,id,'operation-'+id,'order-'+id,'station-'+id,'location-'+id,'staff-'+id,'shift-'+id]);
        await c.query('UPDATE cashier_device_streams SET last_sequence=1,version=version+1 WHERE id=$1',['stream-'+id]);await c.query('COMMIT');
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    }
  }
  if(mode==='fresh'){
    assert.equal(Object.keys(await data()).length,0,'fresh suite must skip canonical bootstrap');
    const empty=path.join(temporary,'empty');fs.mkdirSync(path.join(empty,'meta'),{recursive:true});
    fs.writeFileSync(path.join(empty,'meta/_journal.json'),JSON.stringify({version:'7',dialect:'postgresql',entries:[]}));
    // Match the real migrator's journal bootstrap, which precedes its DDL transaction.
    await run(empty);
  }else{
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,53);
    assert.equal(Object.keys(await data()).length,97);await seed();
  }
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])',[owners])).rows[0].n,0);
  const before=await snapshot(),valid=await folder('valid');
  const fault="\nDO $migration_fault$ BEGIN RAISE EXCEPTION 'owned candidate migration fault' USING ERRCODE='P0001'; END $migration_fault$;\n";
  for(const position of ['midpoint','tail'])await t.test('actual migrator rolls back '+position+' DDL and preserves complete prior tenant data/ACLs/journal',async()=>{
    const anchor='CREATE ROLE fawri_cashier_receipt_owner ';
    assert.ok(sql.includes(anchor));
    const body=position==='tail'?sql+fault:sql.replace(anchor,()=>fault+anchor);
    await assert.rejects(run(await folder(position,body)),e=>stateCode(e)==='P0001');
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('receipt-owner collision refuses reuse and rolls back earlier enrollment DDL',async()=>{
    await pool.query('CREATE ROLE fawri_cashier_receipt_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION');
    try{const collided=await snapshot();await assert.rejects(run(valid),e=>stateCode(e)==='42710');assert.deepEqual(await snapshot(),collided);}
    finally{await pool.query('DROP ROLE fawri_cashier_receipt_owner');}
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('successful actual migration commits54 entries and preserves all existing table rows',async()=>{
    await run(valid);
    const rows=await data();assert.equal(Object.keys(rows).length,98);
    for(const [table,values] of Object.entries(before.data))assert.deepEqual(rows[table],values,'prior rows changed: '+table);
    assert.deepEqual(rows.cashier_stream_enrollment_reviews,[]);
    const entries=(await pool.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
    assert.equal(entries.length,54);assert.deepEqual(entries.slice(0,before.journal.length),before.journal);
    assert.equal(entries[53].hash,createHash('sha256').update(sql).digest('hex'));
    assert.equal(String(entries[53].created_at),String(journal.entries[53].when));
  });
  if(mode==='fresh')await seed();
  // Synthetic migration-preservation row, not independent reviewer issuance.
  await pool.query("INSERT INTO cashier_stream_enrollment_reviews(review_reference_hash,stream_id,merchant_id,manifest_hash,reviewer_reference_hash,evidence_sha256,reviewed_at) VALUES(repeat('c',64),'stream-migration-merchant-a','migration-merchant-a',repeat('d',64),repeat('e',64),repeat('f',64),now())");
  await t.test('rerunning actual migrator preserves hashed review, advanced checkpoints, receipts, finance, stock and peers',async()=>{
    const accepted=await snapshot();await run(valid);assert.deepEqual(await snapshot(),accepted);
  });
  await t.test('actual restricted LOGIN identities pass read-only candidate readiness with explicit fixture grants',async sub=>{
    process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
    const {createDisposableKnowledgeRuntime}=await import('./helpers/disposable-knowledge-runtime.mjs');runtime=await createDisposableKnowledgeRuntime();
    const role='migration_reviewer_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
    await pool.query('CREATE ROLE '+role+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION");
    await pool.query('REVOKE ALL ON public.cashier_stream_enrollment_reviews FROM '+runtime.role+','+runtime.authRole);
    await pool.query('GRANT USAGE ON SCHEMA public TO '+role);
    const url=new URL(process.env.DATABASE_URL);url.username=role;url.password=password;url.search='';
    reviewer=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
    assert.equal((await reviewer.query('SELECT session_user::text AS actor')).rows[0].actor,role);
    await assert.rejects(reviewer.query('SELECT * FROM public.cashier_stream_enrollment_reviews'),e=>stateCode(e)==='42501');
    const {assertCashierAuthorityCandidateInstallationReady:preflight}=await import('../src/services/cashierAuthorityCandidateInstallationReadiness.ts');
    const identities={primaryRole:runtime.role,authenticationRole:runtime.authRole,reviewerRole:role,bootstrapRole:'fawri_ci'};
    const installationCode=code=>e=>e.code==='CASHIER_AUTHORITY_CANDIDATE_INSTALLATION_NOT_READY'&&e.issues.includes(code);
    let positiveChecks=0,faultChecks=0,actorChecks=0,snapshotChecks=0;
    async function positive(){
      const client=await pool.connect();try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const result=await preflight(client,identities);
        assert.equal(result.ok,true);assert.equal(result.transactionReadOnly,true);assert.equal(result.historyEntries,54);
        assert.equal(result.capabilitiesWithheld,true);assert.equal(result.grantsAuthorized,false);assert.equal(result.operationalAdoption,false);positiveChecks++;
      }finally{await client.query('ROLLBACK');client.release();}
    }
    await sub.test('actual READ ONLY preflight accepts the complete pinned54-entry install with capabilities withheld',positive);
    const firstTime=journal.entries[0].when,lastTime=journal.entries[53].when;
    const faults=[
      ['missing journal entry','DELETE FROM drizzle.__drizzle_migrations WHERE created_at='+lastTime,'HISTORY_COUNT'],
      ['early hash drift',"UPDATE drizzle.__drizzle_migrations SET hash=repeat('0',64) WHERE created_at="+firstTime,'HISTORY_HASH'],
      ['timestamp drift','UPDATE drizzle.__drizzle_migrations SET created_at=created_at+1 WHERE created_at='+lastTime,'HISTORY_TIMESTAMP'],
      ['extra future history',"INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(repeat('1',64),"+(lastTime+10)+')','HISTORY_COUNT'],
      ['duplicate history','INSERT INTO drizzle.__drizzle_migrations(hash,created_at) SELECT hash,created_at FROM drizzle.__drizzle_migrations WHERE created_at='+firstTime,'HISTORY_COUNT'],
      ['null timestamp','UPDATE drizzle.__drizzle_migrations SET created_at=NULL WHERE created_at='+lastTime,'HISTORY_TIMESTAMP'],
      ['missing journal relation','ALTER TABLE drizzle.__drizzle_migrations RENAME TO held_migrations','JOURNAL_RELATION'],
      ['view replacing journal','ALTER TABLE drizzle.__drizzle_migrations RENAME TO held_migrations; CREATE VIEW drizzle.__drizzle_migrations AS SELECT * FROM drizzle.held_migrations','JOURNAL_RELATION'],
      ['journal RLS drift','ALTER TABLE drizzle.__drizzle_migrations ENABLE ROW LEVEL SECURITY','JOURNAL_RELATION'],
      ['journal field type drift','ALTER TABLE drizzle.__drizzle_migrations ALTER COLUMN hash TYPE varchar','JOURNAL_COLUMNS'],
      ['public journal access','GRANT SELECT ON drizzle.__drizzle_migrations TO PUBLIC','JOURNAL_PUBLIC_ACL'],
      ['public journal column access','GRANT SELECT(hash) ON drizzle.__drizzle_migrations TO PUBLIC','JOURNAL_PUBLIC_ACL'],
      ['primary journal column access','GRANT SELECT(hash) ON drizzle.__drizzle_migrations TO '+runtime.role,'JOURNAL_CALLER_ACL'],
      ['reviewer journal schema access','GRANT USAGE ON SCHEMA drizzle TO '+role,'JOURNAL_CALLER_ACL'],
      ['foreign journal owner','GRANT CREATE ON SCHEMA drizzle TO '+role+'; ALTER TABLE drizzle.__drizzle_migrations OWNER TO '+role,'JOURNAL_RELATION'],
      ['partial missing financial function','DROP FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb)','WITHHELD_AUTHORITY_BOUNDARY'],
      ['unsafe owner login','ALTER ROLE fawri_cashier_receipt_owner LOGIN','WITHHELD_AUTHORITY_BOUNDARY'],
      ['disabled review RLS','ALTER TABLE public.cashier_stream_enrollment_reviews DISABLE ROW LEVEL SECURITY','WITHHELD_AUTHORITY_BOUNDARY'],
      ['premature primary capability','GRANT EXECUTE ON FUNCTION public.fawri_cashier_stream_financial_runtime() TO '+runtime.role,'WITHHELD_AUTHORITY_BOUNDARY'],
      ['premature reviewer capability','GRANT EXECUTE ON FUNCTION public.fawri_cashier_enrollment_runtime() TO '+role,'WITHHELD_AUTHORITY_BOUNDARY'],
      ['authentication financial capability','GRANT EXECUTE ON FUNCTION public.fawri_lock_cashier_financial_stream(text,text,text) TO '+runtime.authRole,'WITHHELD_AUTHORITY_BOUNDARY'],
      ['active role mismatch','SET LOCAL ROLE '+role,'BOOTSTRAP_CONTEXT'],
    ];
    for(const [name,mutation,expected] of faults)await sub.test('installation preflight refuses '+name+' and rollback restores prior state',async()=>{
      const prior=await snapshot(),client=await pool.connect();try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        await client.query(mutation);await assert.rejects(preflight(client,identities),installationCode(expected));
      }finally{await client.query('ROLLBACK');client.release();}
      assert.deepEqual(await snapshot(),prior);await positive();faultChecks++;
    });
    for(const [name,target] of [['primary',runtime.runtimePool],['reviewer',reviewer],['authentication',new Pool({connectionString:process.env.FAWRI_AUTH_DATABASE_URL,connectionTimeoutMillis:5000})]])await sub.test('actual '+name+' LOGIN is denied bootstrap preflight',async()=>{
      const prior=await snapshot(),client=await target.connect();try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await assert.rejects(preflight(client,identities),installationCode('BOOTSTRAP_CONTEXT'));
      }finally{await client.query('ROLLBACK');client.release();if(name==='authentication')await target.end();}
      assert.deepEqual(await snapshot(),prior);actorChecks++;
    });
    await sub.test('preflight refuses read-committed inspection without the required snapshot context',async()=>{
      const client=await pool.connect();try{await client.query('BEGIN READ ONLY');await assert.rejects(preflight(client,identities),installationCode('SNAPSHOT_CONTEXT'));}
      finally{await client.query('ROLLBACK');client.release();}
      snapshotChecks++;
    });
    assert.deepEqual({positiveChecks,faultChecks,actorChecks,snapshotChecks},{positiveChecks:23,faultChecks:22,actorChecks:3,snapshotChecks:1},'emit proof only after every preflight assertion passes');
    console.log('P0_AUTHORITY_INSTALLATION_PREFLIGHT '+JSON.stringify({mode,historyEntries:54,metadataFaults:22,deniedLoginActors:3,readOnlyPositive:true,repeatableRead:true,capabilitiesWithheld:true,grantsAuthorized:false,priorPublicDataAndSelectedCatalogsPreserved:true,canonicalSourceUnchanged:true,hosted:false}));
    // Explicit fixture grants are applied only AFTER the withheld preflight proof.
    await pool.query('GRANT EXECUTE ON FUNCTION public.fawri_cashier_enrollment_runtime(),public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb) TO '+role);
    await pool.query('GRANT EXECUTE ON FUNCTION public.fawri_cashier_stream_financial_runtime(),public.fawri_lock_cashier_financial_stream(text,text,text),public.fawri_commit_cashier_financial_receipt(jsonb) TO '+runtime.role);
    const {assertCashierStreamAuthorityCandidateReady}=await import('../src/services/cashierStreamAuthorityReadiness.ts');
    const c=await runtime.runtimePool.connect();try{
      await c.query('BEGIN READ ONLY');
      const result=await assertCashierStreamAuthorityCandidateReady(c,{primaryRole:runtime.role,authenticationRole:runtime.authRole,reviewerRole:role,bootstrapRole:'fawri_ci'});
      assert.equal(result.ok,true);assert.equal(result.operationalAdoption,false);await c.query('ROLLBACK');
    }finally{await c.query('ROLLBACK');c.release();}
  });
  await t.test('restricted primary cannot run the administrative migrator or change its journal',async()=>{
    const accepted=await snapshot();await assert.rejects(run(valid,runtime.runtimePool),e=>stateCode(e)==='42501');assert.deepEqual(await snapshot(),accepted);
  });
  verifyCashierAuthorityCandidate(root);
  console.log('P0_AUTHORITY_CANDIDATE_MIGRATION '+JSON.stringify({mode,actualDrizzleMigrator:true,stabilizedMigrationFolder:true,journalEntries:54,publicTables:98,ddlFaultsRolledBack:2,collisionRefused:true,idempotentRerun:true,priorPublicDataPreserved:true,syntheticFinancialAndReviewFixtures:true,realRestrictedReadiness:true,canonicalSourceUnchanged:true,candidateOnly:true,hosted:false}));
});
