import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
const originalUrl=process.env.DATABASE_URL;
const {createDisposableKnowledgeRuntime}=await import('./helpers/disposable-knowledge-runtime.mjs');

test('reviewed empty-device enrollment proposal has isolated authority and atomic provenance',{timeout:120000},async t=>{
 const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin,ids=[];
 const {enrollReviewedEmptyCashierStreamInTransaction:enroll}=await import('../src/services/cashierStreamEnrollmentAuthority.ts');
 const {Pool}=await import('pg');
 const role='enrollment_reviewer_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
 let reviewer,roleCreated=false,proposalInstalled=false;
 t.after(()=>cleanupResources([
  ['reviewer pool',()=>reviewer?.end()],
  ['proposal objects',async()=>{
   if(!proposalInstalled)return;
   await admin.query('DROP FUNCTION IF EXISTS public.enrollment_fixture_fault() CASCADE');
   await admin.query('DROP FUNCTION IF EXISTS public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb)');
   await admin.query('DROP TABLE IF EXISTS public.cashier_stream_enrollment_reviews');
   await admin.query('DROP FUNCTION IF EXISTS public.fawri_enrollment_review_immutable()');
   await admin.query('DROP FUNCTION IF EXISTS public.fawri_cashier_enrollment_runtime()');
   for(const [policy,table] of [['enrollment_owner_stream_read','cashier_device_streams'],['enrollment_owner_stream_insert','cashier_device_streams'],['enrollment_owner_timeline_read','cashier_device_operation_timeline'],['enrollment_owner_attribution_read','cashier_operation_attribution'],['enrollment_owner_order_read','orders'],['enrollment_owner_station_read','merchant_cashier_stations'],['enrollment_owner_station_lock','merchant_cashier_stations'],['enrollment_owner_merchant_read','merchants'],['enrollment_owner_merchant_lock','merchants']])await admin.query('DROP POLICY IF EXISTS '+policy+' ON public.'+table);
   await admin.query('DROP OWNED BY fawri_cashier_enrollment_owner');
   await admin.query('DROP ROLE fawri_cashier_enrollment_owner');
  }],
  ['fixture streams',()=>admin.query('DELETE FROM cashier_device_streams WHERE merchant_id=ANY($1::text[])',[ids])],
  ['fixture accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
  ['reviewer grants',()=>roleCreated?admin.query(`DROP OWNED BY ${role}`):undefined],
  ['reviewer role',()=>roleCreated?admin.query(`DROP ROLE ${role}`):undefined],
  ['runtime',()=>runtime.dispose()],
 ]));
 // Install the whole proposal atomically. No partial owner/table remains if SQL fails.
 const ddl=await readFile(new URL('../../../docs/final-audit/evidence/seq-d3-reviewed-empty-enrollment-proposal.sql',import.meta.url),'utf8');
 const setup=await admin.connect();
 try{await setup.query('BEGIN');await setup.query(ddl);await setup.query('COMMIT');proposalInstalled=true;}catch(e){await setup.query('ROLLBACK');throw e;}finally{setup.release();}
 await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);roleCreated=true;
 await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
 await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_cashier_enrollment_runtime(),public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb) TO ${role}`);
 const url=new URL(originalUrl);url.username=role;url.password=password;url.search='';
 reviewer=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
 assert.equal((await reviewer.query('SELECT session_user AS login')).rows[0].login,role);
 async function actor(){const id='enrollment-'+randomUUID();ids.push(id);const f={id,device:'device-'+randomUUID(),station:'station-'+randomUUID(),location:'location-'+randomUUID()};
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','active')",[id,'+199'+randomInt(100000000,999999999)]);
  await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Enrollment','retail','approved','approved')",[id]);
  await admin.query("INSERT INTO merchant_locations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[f.location,id]);
  await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name,location_id,paired_device_id,status,paired_at) VALUES($1,$2,'Synthetic',$3,$4,'active',now())",[f.station,id,f.location,f.device]);return f;}
 function proof(f,overrides={}){return {merchantId:f.id,stationId:f.station,deviceId:f.device,reviewReference:'review-'+randomUUID(),reviewerReference:'independent-synthetic-reviewer',evidenceSha256:'b'.repeat(64),reviewedAt:new Date().toISOString(),reviewedLocalCounter:0,reviewedPendingOperations:0,...overrides};}
 async function tx(pool,work){const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const apply=p=>tx(reviewer,c=>enroll(c,p));
 async function snapshot(){const state={};for(const table of ['cashier_device_streams','cashier_stream_enrollment_reviews','orders','order_items','inventory_mutations','cashier_device_operation_timeline','cashier_operation_attribution'])state[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[ids])).rows;return state;}
 async function order(f,metadata){await admin.query("INSERT INTO orders(id,merchant_id,customer_name,source_channel,metadata) VALUES($1,$2,'Synthetic','cashier',$3::jsonb)",['orphan-'+randomUUID(),f.id,JSON.stringify(metadata)]);}
 async function blockedBy(left,right){const a=left.processID,b=right.processID;assert.ok(Number.isInteger(a)&&Number.isInteger(b));const until=Date.now()+5000;while(Date.now()<until){if((await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[a,b])).rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('expected actual shared device advisory lock wait');}
 const a=await actor(),peer=await actor();
 await t.test('dedicated LOGIN has only function capability; ordinary primary and auth cannot enroll or assume owner',async()=>{
  const before=await snapshot(),p=proof(a);
  for(const candidate of [runtime.runtimePool]){
   await assert.rejects(tx(candidate,c=>enroll(c,p)),e=>e.code==='42501');
  }
  const {withAuthenticationTransaction}=await import('../src/services/authenticationPostgresAuthority.ts');
  await assert.rejects(withAuthenticationTransaction(c=>enroll(c,p)),e=>e.code==='42501');
  for(const name of [role,runtime.role,runtime.authRole]){
   assert.equal((await admin.query("SELECT pg_has_role($1,'fawri_cashier_enrollment_owner','USAGE') OR pg_has_role($1,'fawri_cashier_enrollment_owner','SET') AS member",[name])).rows[0].member,false);
  }
  for(const table of ['cashier_device_streams','cashier_operation_receipts','cashier_stream_enrollment_reviews'])await assert.rejects(reviewer.query('SELECT * FROM '+table),e=>e.code==='42501');
  assert.equal((await admin.query("SELECT has_column_privilege('fawri_cashier_enrollment_owner','cashier_device_streams','last_sequence','UPDATE') AS allowed")).rows[0].allowed,false);
  assert.equal((await admin.query("SELECT has_table_privilege('fawri_cashier_enrollment_owner','cashier_operation_receipts','INSERT') AS allowed")).rows[0].allowed,false);
  assert.deepEqual(await snapshot(),before);
 });
 await t.test('reviewed fresh-empty mutation and exact retry preserve zero checkpoint and peer state',async()=>{
  const p=proof(a),peerBefore=await snapshot(),result=await apply(p);
  assert.equal(result.state,'active');assert.equal(result.last_sequence,'0');assert.equal(result.version,1);assert.equal(result.replayed,false);
  const after=await snapshot();assert.equal(after.cashier_device_streams.length,1);assert.equal(after.cashier_stream_enrollment_reviews.length,1);
  assert.equal(after.cashier_device_streams[0].row.enrollment_evidence_hash,after.cashier_stream_enrollment_reviews[0].row.manifest_hash);
  assert.deepEqual(await apply(p),{...result,replayed:true});assert.deepEqual(await snapshot(),after);
  for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','cashier_operation_attribution'])assert.deepEqual(after[table],peerBefore[table]);
  await assert.rejects(apply({...p,evidenceSha256:'c'.repeat(64)}),e=>e.code==='23514');
  await assert.rejects(apply({...p,merchantId:peer.id,stationId:peer.station,deviceId:peer.device}),e=>e.code==='23514');
  await assert.rejects(apply(proof(a)),e=>e.code==='23514');assert.deepEqual(await snapshot(),after);
  await assert.rejects(admin.query('UPDATE cashier_stream_enrollment_reviews SET evidence_sha256=$1 WHERE review_reference=$2',['c'.repeat(64),p.reviewReference]),e=>e.code==='23514');
  await admin.query("UPDATE cashier_device_streams SET state='retired',device_id=NULL,version=version+1 WHERE id=$1",[result.stream_id]);
  const retired=await snapshot();await assert.rejects(apply(p),e=>e.code==='23514');await assert.rejects(apply(proof(a)),e=>e.code==='23514','new review reference cannot reset an erased retired binding');assert.deepEqual(await snapshot(),retired);
 });
 await t.test('nonempty or stale reviews, wrong station and canonical orphan financial records remain held',async()=>{
  const f=await actor(),p=proof(f),before=await snapshot();
  for(const changed of [{reviewedLocalCounter:1},{reviewedPendingOperations:1},{evidenceSha256:'bad'},{reviewedAt:'invalid'}])await assert.rejects(apply({...p,...changed}),e=>e.code==='CASHIER_ENROLLMENT_REVIEW_INVALID');
  for(const changed of [{reviewedAt:new Date(Date.now()-3600000).toISOString()},{reviewedAt:new Date(Date.now()+3600000).toISOString()},{stationId:peer.station},{deviceId:peer.device}])await assert.rejects(apply({...p,...changed}),e=>e.code==='23514');
  const manifest={version:1,kind:'independent_empty_device_review',merchant_id:f.id,station_id:f.station,device_id:f.device,review_reference:p.reviewReference,reviewer_reference:p.reviewerReference,evidence_sha256:p.evidenceSha256,reviewed_at:p.reviewedAt,reviewed_local_counter:0,reviewed_pending_operations:0};
  for(const changed of [{reviewed_local_counter:1},{reviewed_local_counter:'0'},{reviewed_pending_operations:1},{unexpected_baseline:100}])await assert.rejects(tx(reviewer,c=>c.query('SELECT * FROM public.fawri_enroll_reviewed_empty_cashier_stream($1,$2::jsonb)',['cashier_stream_'+'a'.repeat(64),JSON.stringify({...manifest,...changed})])),e=>e.code==='23514');
  assert.deepEqual(await snapshot(),before);
  for(const kind of ['sale','compensation','unknown-origin']){
   const financial=await actor();await order(financial,{cashier_sync:kind==='sale'?{device_id:financial.device}:kind==='compensation'?{device_id:'unrelated',compensations:[{device_id:financial.device,operation_id:'synthetic-compensation'}]}:{}});
   const existing=await snapshot();await assert.rejects(apply(proof(financial)),e=>e.code==='23514');assert.deepEqual(await snapshot(),existing);
  }
 });
 await t.test('failure after stream insert rolls back stream and immutable review together',async()=>{
  const f=await actor(),p=proof(f,{reviewReference:'fault-'+randomUUID()}),before=await snapshot();
  await admin.query("CREATE FUNCTION public.enrollment_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic review persistence fault'; END $$");
  await admin.query('CREATE TRIGGER enrollment_fixture_fault BEFORE INSERT ON cashier_stream_enrollment_reviews FOR EACH ROW EXECUTE FUNCTION public.enrollment_fixture_fault()');
  try{await assert.rejects(apply(p),e=>e.code==='P0001');assert.deepEqual(await snapshot(),before);}
  finally{await admin.query('DROP TRIGGER enrollment_fixture_fault ON cashier_stream_enrollment_reviews');await admin.query('DROP FUNCTION public.enrollment_fixture_fault()');}
  const result=await apply(p);assert.equal(result.replayed,false);
 });
 await t.test('same-device enrollment overlaps serialize commit and rollback while peer merchant proceeds',async()=>{
  for(const commit of [true,false]){
   const f=await actor(),other=await actor(),p=proof(f),q=proof(f),left=await reviewer.connect(),right=await reviewer.connect();let pending;
   try{
    await left.query('BEGIN');await right.query('BEGIN');await right.query("SET LOCAL statement_timeout='10000ms'");
    const first=await enroll(left,p);pending=enroll(right,q).then(value=>({value}),error=>({error}));
    await blockedBy(left,right);await apply(proof(other));
    await left.query(commit?'COMMIT':'ROLLBACK');const outcome=await pending;
    if(commit){assert.equal(outcome.error?.code,'23514');await right.query('ROLLBACK');}
    else{assert.ifError(outcome.error);await right.query('COMMIT');assert.equal(outcome.value.replayed,false);}
    const selected=(await admin.query('SELECT id FROM cashier_device_streams WHERE merchant_id=$1',[f.id])).rows;
    assert.equal(selected.length,1);if(commit)assert.equal(selected[0].id,first.stream_id);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM cashier_stream_enrollment_reviews WHERE merchant_id=$1',[f.id])).rows[0].n,1);
   }finally{await left.query('ROLLBACK');await right.query('ROLLBACK');if(pending)await pending;left.release();right.release();}
  }
 });
 await t.test('shared canonical financial-device lock rechecks committed history and permits rolled-back absence',async()=>{
  for(const commit of [true,false]){
   const f=await actor(),left=await admin.connect(),right=await reviewer.connect();let pending;
   try{
    await left.query('BEGIN');await right.query('BEGIN');await right.query("SET LOCAL statement_timeout='10000ms'");
    await left.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['cashier-device:'+f.id+':'+f.device]);
    await left.query("INSERT INTO orders(id,merchant_id,customer_name,source_channel,metadata) VALUES($1,$2,'Synthetic','cashier',$3::jsonb)",['race-order-'+randomUUID(),f.id,JSON.stringify({cashier_sync:{device_id:f.device}})]);
    pending=enroll(right,proof(f)).then(value=>({value}),error=>({error}));await blockedBy(left,right);
    await left.query(commit?'COMMIT':'ROLLBACK');const result=await pending;
    if(commit){assert.equal(result.error?.code,'23514');await right.query('ROLLBACK');}
    else{assert.ifError(result.error);await right.query('COMMIT');}
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM cashier_device_streams WHERE merchant_id=$1',[f.id])).rows[0].n,commit?0:1);
   }finally{await left.query('ROLLBACK');await right.query('ROLLBACK');if(pending)await pending;left.release();right.release();}
  }
 });
 console.log('P0_REVIEWED_ENROLLMENT_PROPOSAL '+JSON.stringify({realSeparateLogin:true,sourceCanonicalPromotion:false,independentReviewAssumedNotBrowserVerified:true,emptyZeroOnly:true,atomicReviewAndStream:true,exactRetry:true,observedAdvisoryOverlap:true,financialWriterRaceSyntheticSql:true,financialReceiptWriter:false,publicEndpoint:false,hosted:false}));
});
