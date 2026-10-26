import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';

test('owned disposable stream/receipt schema proposal constraints and scoped read-only access',{timeout:120000},async t=>{
 const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin,ids=[];let installed=false,ownerCreated=false;
 const retirementOwner='sequence_retire_'+randomUUID().replaceAll('-','');
 const tables=['cashier_device_streams','cashier_operation_receipts'];
 t.after(()=>cleanupResources([
  ['proposal tables',async()=>{if(installed){await admin.query('DROP TRIGGER cashier_device_streams_merchant_deleted ON public.merchants');await admin.query('DROP FUNCTION public.fawri_sequence_merchant_deleted()');await admin.query('DROP TABLE public.cashier_operation_receipts');await admin.query('DROP FUNCTION public.fawri_sequence_receipt_guard(),public.fawri_sequence_receipt_commit_guard()');await admin.query('DROP TABLE public.cashier_device_streams');await admin.query('DROP FUNCTION public.fawri_sequence_stream_guard()');}}],
  ['retirement owner',async()=>{if(ownerCreated){await admin.query(`DROP OWNED BY ${retirementOwner}`);await admin.query(`DROP ROLE ${retirementOwner}`);}}],
  ['fixture requests',()=>admin.query('DELETE FROM merchant_deletion_requests WHERE merchant_id_snapshot=ANY($1::text[])',[ids])],
  ['fixture accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
  ['runtime',()=>runtime.dispose()],
 ]));
 for(const table of tables)assert.equal((await admin.query('SELECT to_regclass($1) AS present',['public.'+table])).rows[0].present,null,'proposal must not overwrite canonical objects');
 const sql=fs.readFileSync(new URL('../../../docs/final-audit/evidence/seq-d2-stream-receipt-schema-proposal.sql',import.meta.url),'utf8');
 const setup=await admin.connect();try{await setup.query('BEGIN');await setup.query(sql);await setup.query('COMMIT');installed=true;}catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.cashier_device_streams,public.cashier_operation_receipts TO ${runtime.role}`);
 await admin.query(`CREATE ROLE ${retirementOwner} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);ownerCreated=true;
 await admin.query(`GRANT USAGE,CREATE ON SCHEMA public TO ${retirementOwner}`);
 await admin.query(`GRANT SELECT ON public.cashier_device_streams TO ${retirementOwner}`);
 await admin.query(`GRANT UPDATE(state,device_id,version) ON public.cashier_device_streams TO ${retirementOwner}`);
 await admin.query(`CREATE POLICY sequence_retirement_owner_read ON public.cashier_device_streams FOR SELECT TO ${retirementOwner} USING(true)`);
 await admin.query(`CREATE POLICY sequence_retirement_owner_update ON public.cashier_device_streams FOR UPDATE TO ${retirementOwner} USING(state<>'retired') WITH CHECK(state='retired' AND device_id IS NULL)`);
 await admin.query(`ALTER FUNCTION public.fawri_sequence_merchant_deleted() OWNER TO ${retirementOwner}`);
 await admin.query(`REVOKE CREATE ON SCHEMA public FROM ${retirementOwner}`);
 const {withMerchantOperationalTransaction:tenant}=await import('../src/services/operationalPostgresAuthority.ts');
 async function actor(){const id='storage-'+randomUUID();ids.push(id);const f={id,device:'device-'+randomUUID(),station:'station-'+randomUUID(),location:'location-'+randomUUID(),staff:'staff-'+randomUUID(),shift:'shift-'+randomUUID(),stream:'stream-'+randomUUID()};
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','active')",[id,'+199'+randomInt(100000000,999999999)]);
  await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type) VALUES($1,$1,'Synthetic','Synthetic','retail')",[id]);
  await admin.query("INSERT INTO merchant_locations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[f.location,id]);
  await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,pin_hash) VALUES($1,$2,'Synthetic',repeat('0',64))",[f.staff,id]);
  await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name,location_id) VALUES($1,$2,'Synthetic',$3)",[f.station,id,f.location]);
  await admin.query('INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id) VALUES($1,$2,$3,$4)',[f.shift,id,f.station,f.staff]);
  await admin.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) VALUES($1,$2,$3,'active',repeat('a',64),now())",[f.stream,id,f.device]);return f;}
 const a=await actor(),b=await actor();
 async function receipt(client,f,n,overrides={}){const row={id:'receipt-'+randomUUID(),stream:f.stream,merchant:f.id,n:String(n),operation:'operation-'+randomUUID(),kind:'sale',hash:'a'.repeat(64),station:f.station,location:f.location,staff:f.staff,shift:f.shift,...overrides};await client.query(`INSERT INTO cashier_operation_receipts(id,stream_id,merchant_id,device_sequence,operation_id,operation_kind,canonical_version,request_hash,result_id,station_id,location_id,staff_id,shift_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,now())`,[row.id,row.stream,row.merchant,row.n,row.operation,row.kind,row.hash,'synthetic-result-'+row.id,row.station,row.location,row.staff,row.shift]);return row;}
 async function tx(work){const c=await admin.connect();try{await c.query('BEGIN');const r=await work(c);await c.query('COMMIT');return r;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 async function append(f,n,overrides){return tx(async c=>{const r=await receipt(c,f,n,overrides);await c.query('UPDATE cashier_device_streams SET last_sequence=$2,version=version+1 WHERE id=$1',[f.stream,n]);return r;});}
 async function snapshot(){return {streams:(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t ORDER BY id')).rows,receipts:(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows};}
 const first=await append(a,1);await append(b,1);
 await t.test('retirement definer has a non-login non-owner role and only retirement column authority',async()=>{
  const flags=(await admin.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=$1',[retirementOwner])).rows[0];
  assert.deepEqual(flags,{rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false});
  const fn=(await admin.query("SELECT pg_get_userbyid(proowner) AS owner,prosecdef,proconfig FROM pg_proc WHERE oid='public.fawri_sequence_merchant_deleted()'::regprocedure")).rows[0];
  assert.deepEqual(fn,{owner:retirementOwner,prosecdef:true,proconfig:['search_path=pg_catalog']});
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)",[retirementOwner])).rows[0].n,0,'function owner owns no tables/indexes');
  for(const role of [runtime.role,runtime.authRole]){
   assert.equal((await admin.query("SELECT pg_has_role($1,$2,'USAGE') OR pg_has_role($1,$2,'SET') AS member",[role,retirementOwner])).rows[0].member,false);
   assert.equal((await admin.query("SELECT has_function_privilege($1,'public.fawri_sequence_merchant_deleted()','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await admin.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[retirementOwner])).rows[0].allowed,false);
  for(const column of ['state','device_id','version'])assert.equal((await admin.query("SELECT has_column_privilege($1,'public.cashier_device_streams',$2,'UPDATE') AS allowed",[retirementOwner,column])).rows[0].allowed,true);
  for(const column of ['last_sequence','merchant_id','id','enrollment_evidence_hash'])assert.equal((await admin.query("SELECT has_column_privilege($1,'public.cashier_device_streams',$2,'UPDATE') AS allowed",[retirementOwner,column])).rows[0].allowed,false);
  for(const [table,privileges] of [['cashier_device_streams','INSERT,DELETE,TRUNCATE,TRIGGER,REFERENCES'],['cashier_operation_receipts','SELECT,INSERT,UPDATE,DELETE'],['accounts','SELECT,INSERT,UPDATE,DELETE'],['merchants','SELECT,INSERT,UPDATE,DELETE']])assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[retirementOwner,'public.'+table,privileges])).rows[0].allowed,false);
 });

 await t.test('proposal permits own scoped reads but denies cross-tenant, unscoped and direct runtime writes',async()=>{
  assert.equal((await runtime.runtimePool.query('SELECT id FROM cashier_device_streams')).rowCount,0);
  await tenant(a.id,async c=>{assert.equal((await c.query('SELECT id FROM cashier_device_streams')).rowCount,1);assert.equal((await c.query('SELECT id FROM cashier_operation_receipts')).rowCount,1);assert.equal((await c.query('SELECT id FROM cashier_device_streams WHERE id=$1',[b.stream])).rowCount,0);});
  await tenant(b.id,async c=>assert.equal((await c.query('SELECT id FROM cashier_device_streams WHERE id=$1',[b.stream])).rowCount,1));
  const before=await snapshot();await assert.rejects(tenant(a.id,c=>c.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)',['forged-'+randomUUID(),a.id,'new-device'])),e=>e.code==='42501');
  await tenant(a.id,async c=>{assert.equal((await c.query("UPDATE cashier_device_streams SET last_sequence=2,version=version+1 WHERE id=$1",[a.stream])).rowCount,0);assert.equal((await c.query('DELETE FROM cashier_operation_receipts WHERE stream_id=$1',[a.stream])).rowCount,0);});assert.deepEqual(await snapshot(),before);
 });
 await t.test('proposal rejects partial commit, gaps, unsafe sequence, identity mutation and immutable receipt changes',async()=>{
  const before=await snapshot();
  await assert.rejects(tx(c=>c.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id,last_sequence) VALUES($1,$2,$3,5)',['guessed-'+randomUUID(),a.id,'guessed-device'])),e=>e.code==='23514');
  await assert.rejects(tx(c=>receipt(c,a,2)),e=>e.code==='23514');
  await assert.rejects(tx(c=>c.query('UPDATE cashier_device_streams SET last_sequence=2,version=version+1 WHERE id=$1',[a.stream])),e=>e.code==='23514');
  await assert.rejects(append(a,3),e=>e.code==='23514');
  await assert.rejects(append(a,'9007199254740992'),e=>e.code==='23514');
  await assert.rejects(tx(c=>c.query('UPDATE cashier_device_streams SET device_id=$2,version=version+1 WHERE id=$1',[a.stream,'rebound'])),e=>e.code==='23514');
  await assert.rejects(tx(c=>c.query("UPDATE cashier_operation_receipts SET request_hash=repeat('b',64) WHERE id=$1",[first.id])),e=>e.code==='23514');
  await assert.rejects(tx(c=>c.query('DELETE FROM cashier_operation_receipts WHERE id=$1',[first.id])),e=>e.code==='23514');
  assert.deepEqual(await snapshot(),before);await append(a,2);assert.equal((await admin.query('SELECT last_sequence FROM cashier_device_streams WHERE id=$1',[a.stream])).rows[0].last_sequence,'2');
 });
 await t.test('proposal preserves tenant identity, unique operation receipts and shift/location foreign keys',async()=>{
  const replacement={...a,stream:'replacement-'+randomUUID(),device:'replacement-device-'+randomUUID()};
  await admin.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) VALUES($1,$2,$3,'active',repeat('b',64),now())",[replacement.stream,replacement.id,replacement.device]);
  const before=await snapshot();
  await assert.rejects(append(replacement,1,{operation:first.operation}),e=>e.code==='23505');
  for(const overrides of [{merchant:b.id},{station:b.station},{location:b.location},{staff:b.staff},{shift:b.shift}])await assert.rejects(append(a,3,overrides),e=>e.code==='23503');
  await assert.rejects(append(a,3,{operation:first.operation}),e=>e.code==='23505');
  await assert.rejects(append(a,3,{hash:'invalid'}),e=>e.code==='23514');
  assert.deepEqual(await snapshot(),before);
 });
 await t.test('proposal serializes same-stream receipt writers through commit and rollback while peer proceeds',async()=>{
  async function race(commitFirst){
   const f=await actor(),peer=await actor();
   const left=await admin.connect(),right=await admin.connect();let pending;
   try{
    await left.query('BEGIN');await right.query('BEGIN');
    await right.query("SET LOCAL statement_timeout='15000ms'");
    const leftPid=(await left.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const rightPid=(await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const firstReceipt=await receipt(left,f,1);
    pending=receipt(right,f,1).then(value=>({value}),error=>({error}));
    let blocked=false;
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){
     const r=await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[leftPid,rightPid]);
     if(r.rows[0].blocked){blocked=true;break;}
     await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(blocked,true,'second writer must actually wait on first stream lock');
    await append(peer,1);
    assert.equal((await admin.query('SELECT last_sequence FROM cashier_device_streams WHERE id=$1',[peer.stream])).rows[0].last_sequence,'1','peer stream proceeds while target blocked');
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM cashier_operation_receipts WHERE stream_id=$1',[f.stream])).rows[0].n,0,'uncommitted receipt invisible');
    if(commitFirst){
     await left.query('UPDATE cashier_device_streams SET last_sequence=1,version=version+1 WHERE id=$1',[f.stream]);await left.query('COMMIT');
     const result=await pending;assert.equal(result.error?.code,'23514','waiter rechecks committed checkpoint');await right.query('ROLLBACK');
     assert.equal((await admin.query('SELECT id FROM cashier_operation_receipts WHERE stream_id=$1',[f.stream])).rows[0].id,firstReceipt.id);
    }else{
     await left.query('ROLLBACK');const result=await pending;assert.ifError(result.error);
     await right.query('UPDATE cashier_device_streams SET last_sequence=1,version=version+1 WHERE id=$1',[f.stream]);await right.query('COMMIT');
     assert.equal((await admin.query('SELECT id FROM cashier_operation_receipts WHERE stream_id=$1',[f.stream])).rows[0].id,result.value.id);
     assert.equal((await admin.query('SELECT id FROM cashier_operation_receipts WHERE id=$1',[firstReceipt.id])).rowCount,0,'rolled back receipt absent');
    }
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM cashier_operation_receipts WHERE stream_id=$1',[f.stream])).rows[0].n,1);
    assert.deepEqual((await admin.query('SELECT last_sequence,version FROM cashier_device_streams WHERE id=$1',[f.stream])).rows[0],{last_sequence:'1',version:2});
   }finally{
    await left.query('ROLLBACK');await right.query('ROLLBACK');if(pending)await pending;left.release();right.release();
   }
  }
  const peerBefore={stream:(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t WHERE id=$1',[b.stream])).rows,receipts:(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t WHERE stream_id=$1',[b.stream])).rows};
  await race(true);await race(false);
  assert.deepEqual({stream:(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t WHERE id=$1',[b.stream])).rows,receipts:(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t WHERE stream_id=$1',[b.stream])).rows},peerBefore,'existing peer unchanged exactly');
 });
 await t.test('retirement erases device binding while receipts and peer remain exact and stream cannot resume',async()=>{
  const f=await actor();await append(f,1);
  const before=(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows;
  const peer=(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t WHERE id=$1',[b.stream])).rows;
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='cashier_operation_receipts' AND column_name='device_id'")).rows[0].n,0,'immutable receipt has no raw device binding column');
  await assert.rejects(tx(c=>c.query("UPDATE cashier_device_streams SET device_id=NULL,version=version+1 WHERE id=$1",[f.stream])),e=>e.code==='23514','active stream cannot silently lose binding');
  await assert.rejects(tx(c=>c.query("UPDATE cashier_device_streams SET state='retired',version=version+1 WHERE id=$1",[f.stream])),e=>e.code==='23514','retirement must erase binding');
  await tenant(f.id,async c=>assert.equal((await c.query("UPDATE cashier_device_streams SET state='retired',device_id=NULL,version=version+1 WHERE id=$1",[f.stream])).rowCount,0,'runtime cannot retire stream'));
  const retiring=await admin.connect(),waiting=await admin.connect();let pending;
  try{
   await retiring.query('BEGIN');await waiting.query('BEGIN');await waiting.query("SET LOCAL statement_timeout='15000ms'");
   const retirePid=(await retiring.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,waitPid=(await waiting.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await retiring.query("UPDATE cashier_device_streams SET state='retired',device_id=NULL,version=version+1 WHERE id=$1",[f.stream]);
   pending=receipt(waiting,f,2).then(value=>({value}),error=>({error}));
   let blocked=false;const deadline=Date.now()+8000;
   while(Date.now()<deadline){if((await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[retirePid,waitPid])).rows[0].blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
   assert.equal(blocked,true,'receipt writer actually waits for retirement lock');
   await retiring.query('COMMIT');assert.equal((await pending).error?.code,'23514','waiter rechecks retired state after commit');await waiting.query('ROLLBACK');
  }finally{await retiring.query('ROLLBACK');await waiting.query('ROLLBACK');if(pending)await pending;retiring.release();waiting.release();}
  assert.deepEqual((await admin.query('SELECT state,device_id,last_sequence,version FROM cashier_device_streams WHERE id=$1',[f.stream])).rows[0],{state:'retired',device_id:null,last_sequence:'1',version:3});
  assert.equal((await admin.query('SELECT id FROM cashier_device_streams WHERE device_id=$1',[f.device])).rowCount,0);
  await assert.rejects(append(f,2),e=>e.code==='23514');
  await assert.rejects(tx(c=>c.query("UPDATE cashier_device_streams SET state='active',device_id=$2,version=version+1 WHERE id=$1",[f.stream,f.device])),e=>e.code==='23514');
  await assert.rejects(tx(c=>c.query("UPDATE cashier_device_streams SET device_id=$2,version=version+1 WHERE id=$1",[f.stream,f.device])),e=>e.code==='23514');
  assert.deepEqual((await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows,before,'all selected immutable receipts preserved exactly');
  assert.deepEqual((await admin.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t WHERE id=$1',[b.stream])).rows,peer);
 });
 await t.test('canonical deletion service atomically retires proposal streams and rolls back a later account failure',async()=>{
  const management=await import('../src/services/postgresMerchantManagementAuthority.ts');
  const owner='storage-owner-'+randomUUID();ids.push(owner);
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')",[owner,'+199'+randomInt(100000000,999999999)]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic','owner_admin',true,false)",[owner]);
  const f=await actor();await append(f,1);
  const reviewStream='review-'+randomUUID(),oldRetired='retired-'+randomUUID();
  await admin.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)",[reviewStream,f.id,'review-device-'+randomUUID()]);
  await admin.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state) VALUES($1,$2,NULL,'retired')",[oldRetired,f.id]);
  await admin.query("UPDATE merchants SET status='suspended',account_status='suspended' WHERE id=$1",[f.id]);
  const request=await management.createDeletionRequestPostgres({merchantId:f.id,reason:'policy_violation',details:'Synthetic proposal lifecycle',actorAdminId:owner});
  const input={merchantId:f.id,deletionRequestId:request.id,actorAdminId:owner};
  async function lifecycleSnapshot(merchant){
   const result={};
   for(const table of ['merchants','accounts','cashier_device_streams','cashier_operation_receipts','merchant_cashier_staff','merchant_cashier_stations','cashier_shifts']){
    const column=['merchants','accounts'].includes(table)?'id':'merchant_id';
    result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE ${column}=$1 ORDER BY to_jsonb(t)::text`,[merchant])).rows;
   }
   result.requests=(await admin.query('SELECT to_jsonb(t) AS row FROM merchant_deletion_requests t WHERE merchant_id_snapshot=$1 ORDER BY id',[merchant])).rows;
   return result;
  }
  const before=await lifecycleSnapshot(f.id),peerBefore=await lifecycleSnapshot(b.id);
  const receiptsBefore=(await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows;
  await admin.query(`REVOKE UPDATE(version) ON public.cashier_device_streams FROM ${retirementOwner}`);
  try{await assert.rejects(management.completeMerchantDeletionPostgres(input),e=>e.code==='42501','missing definer column authority must fail deletion closed');}
  finally{await admin.query(`GRANT UPDATE(version) ON public.cashier_device_streams TO ${retirementOwner}`);}
  assert.deepEqual(await lifecycleSnapshot(f.id),before,'owner misconfiguration rolls back whole selected deletion transaction');
  assert.deepEqual(await lifecycleSnapshot(b.id),peerBefore);

  await assert.rejects(runtime.runtimePool.query('SELECT public.fawri_sequence_merchant_deleted()'),e=>e.code==='42501');
  await assert.rejects(tenant(f.id,c=>c.query("UPDATE merchants SET retention_status='deleted' WHERE id=$1",[f.id])),e=>e.code==='42501');
  assert.deepEqual(await lifecycleSnapshot(f.id),before);
  // Fault runs after the real service's merchant update and its retirement
  // trigger, but before account closure. Inspect that uncommitted retirement
  // happened, then fail so the transaction must restore every selected row.
  await admin.query(`CREATE FUNCTION public.fawri_sequence_fixture_delete_fault() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
   BEGIN
    IF EXISTS(SELECT 1 FROM public.cashier_device_streams WHERE merchant_id=NEW.id AND (state<>'retired' OR device_id IS NOT NULL)) THEN RAISE EXCEPTION 'retirement not reached'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.cashier_device_streams WHERE merchant_id=NEW.id AND state='retired') THEN RAISE EXCEPTION 'retirement fixture missing'; END IF;
    RAISE EXCEPTION 'synthetic post-retirement account fault';
   END $$`);
  await admin.query('REVOKE ALL ON FUNCTION public.fawri_sequence_fixture_delete_fault() FROM PUBLIC');
  // Fixture-only fault is installed just for the one deletion attempt.
  await admin.query(`CREATE TRIGGER sequence_fixture_delete_fault BEFORE UPDATE OF state ON public.accounts FOR EACH ROW WHEN (NEW.state='closed' AND OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION public.fawri_sequence_fixture_delete_fault()`);
  try{await assert.rejects(management.completeMerchantDeletionPostgres(input),e=>e.code==='P0001'&&e.message==='synthetic post-retirement account fault');}
  finally{await admin.query('DROP TRIGGER sequence_fixture_delete_fault ON public.accounts');await admin.query('DROP FUNCTION public.fawri_sequence_fixture_delete_fault()');}
  assert.deepEqual(await lifecycleSnapshot(f.id),before,'later fault rolls back merchant, account, requests, retained identities, streams and receipts');
  assert.deepEqual(await lifecycleSnapshot(b.id),peerBefore);
  const result=await management.completeMerchantDeletionPostgres(input);assert.equal(result.ok,true);assert.equal(result.deletionRequest.status,'completed');
  const streams=(await admin.query('SELECT id,state,device_id,last_sequence,version FROM cashier_device_streams WHERE merchant_id=$1 ORDER BY id',[f.id])).rows;
  assert.equal(streams.length,3);for(const row of streams){assert.equal(row.state,'retired');assert.equal(row.device_id,null);assert.equal(row.version,row.id===f.stream?3:row.id===reviewStream?2:1);}
  assert.deepEqual((await admin.query('SELECT retention_status FROM merchants WHERE id=$1',[f.id])).rows[0],{retention_status:'deleted'});
  assert.deepEqual((await admin.query('SELECT state FROM accounts WHERE id=$1',[f.id])).rows[0],{state:'closed'});
  assert.deepEqual((await admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows,receiptsBefore);
  assert.deepEqual(await lifecycleSnapshot(b.id),peerBefore,'peer business and proposal data unchanged');
  await assert.rejects(tx(c=>c.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)',['late-'+randomUUID(),f.id,'late-device'])),e=>e.code==='23514');
  await assert.rejects(append(f,2),e=>e.code==='23514');
  const done=await lifecycleSnapshot(f.id);
  await assert.rejects(management.completeMerchantDeletionPostgres(input),e=>e.code==='MERCHANT_NOT_FOUND');
  assert.deepEqual(await lifecycleSnapshot(f.id),done,'repeat deletion cannot mutate retirement state');
 });
 console.log('P0_STREAM_STORAGE_PROPOSAL '+JSON.stringify({draftOutsideCanonicalJournal:true,actualRestrictedSql:true,scopedReads:true,directRuntimeWritesDenied:true,immutableReceipt:true,atomicReceiptCheckpoint:true,gapAndIdentityConstraints:true,tenantShiftLocationForeignKeys:true,sameStreamCommitRollbackConcurrency:true,peerProgressWhileBlocked:true,deviceBindingErasedOnRetirement:true,receiptHasNoRawDeviceColumn:true,retirementBlocksWaitingReceipt:true,canonicalDeletionServiceWithProposalTrigger:true,postRetirementFailureRollback:true,nonLoginColumnLimitedRetirementOwner:true,ownerGrantFailureRollsBackDeletion:true,liveWriterInstalled:false,financialEffectProof:false,canonicalMigrationAccepted:false,hostedAccepted:false}));
});
