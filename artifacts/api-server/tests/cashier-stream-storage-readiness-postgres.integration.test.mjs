import assert from 'node:assert/strict';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {assertCashierStreamStorageCandidateReady} from '../../../lib/db/scripts/lib/cashier-stream-storage-candidate-readiness.mjs';
await assertDisposablePostgres();
test('candidate readiness detects metadata faults without changing business rows',{timeout:120000},async t=>{
 const runtime=await createDisposableKnowledgeRuntime();t.after(()=>runtime.dispose());
 const roles={primaryRole:runtime.role,authenticationRole:runtime.authRole};
 const snapshot=async()=>({streams:(await runtime.admin.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t ORDER BY id')).rows,receipts:(await runtime.admin.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows});
 const before=await snapshot();
 await t.test('positive inspector executes in READ ONLY transaction',async()=>{
  const c=await runtime.runtimePool.connect();try{await c.query('BEGIN READ ONLY');assert.equal((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');assert.deepEqual(await assertCashierStreamStorageCandidateReady(c,roles),{ok:true,internalCandidateOnly:true,statementSnapshotOnly:true,operationalAdoption:false});}finally{await c.query('ROLLBACK');c.release();}
 });
 const owner='fawri_cashier_retirement_owner';
 const cases=[
 ['RLS disabled','ALTER TABLE cashier_device_streams DISABLE ROW LEVEL SECURITY','TABLE_RLS'],
 ['owner login',`ALTER ROLE ${owner} LOGIN`,'OWNER_ROLE_FLAGS'],
 ['extra checkpoint authority',`GRANT UPDATE(last_sequence) ON cashier_device_streams TO ${owner}`,'OWNER_COLUMN_ACL'],
 ['owner reachable',`GRANT ${owner} TO ${runtime.role}`,'CALLER_OWNER_REACHABILITY'],
 ['owner auth capability',`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${owner}`,'OWNER_AUTH_CAPABILITY'],
 ['public function execute','GRANT EXECUTE ON FUNCTION public.fawri_sequence_merchant_deleted() TO PUBLIC','FUNCTION_PUBLIC_EXECUTE'],
 ['unsafe search path','ALTER FUNCTION public.fawri_sequence_merchant_deleted() SET search_path=public','FUNCTION_SEARCH_PATH'],
 ['wrong function security','ALTER FUNCTION public.fawri_sequence_merchant_deleted() SECURITY INVOKER','FUNCTION_SECURITY'],
 ['disabled commit trigger','ALTER TABLE cashier_operation_receipts DISABLE TRIGGER cashier_operation_receipts_commit_guard','TRIGGER_STATE'],
 ['broad tenant read','ALTER POLICY cashier_device_streams_scoped_read ON cashier_device_streams USING(true)','SCOPED_READ_POLICY'],
 ['function body drift',"CREATE OR REPLACE FUNCTION public.fawri_sequence_stream_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RETURN NEW; END $$",'FUNCTION_BODY'],
 ['public write policy','CREATE POLICY candidate_bad_public_write ON cashier_device_streams FOR UPDATE TO PUBLIC USING(true) WITH CHECK(true)','PUBLIC_WRITE_POLICY'],
 ['weakened owner policy','ALTER POLICY sequence_retirement_owner_update ON cashier_device_streams WITH CHECK(true)','OWNER_POLICY'],

 ];
 for(const [name,sql,issue]of cases)await t.test(name,async()=>{
  const c=await runtime.admin.connect();try{await c.query('BEGIN');await c.query(sql);await assert.rejects(assertCashierStreamStorageCandidateReady(c,roles),e=>e.code==='CASHIER_STREAM_STORAGE_CANDIDATE_NOT_READY'&&e.issues.includes(issue));}finally{await c.query('ROLLBACK');c.release();}
  await assertCashierStreamStorageCandidateReady(runtime.runtimePool,roles);assert.deepEqual(await snapshot(),before);
 });
 console.log('SEQ_D2_CANDIDATE_READINESS '+JSON.stringify({readOnlyPositive:true,metadataFaults:cases.length,rollbackRestoresPositive:true,selectedBusinessRowsUnchanged:true,liveReadinessWired:false,hostedAccepted:false}));
});
