import assert from 'node:assert/strict';
import {Client} from 'pg';
export const streamRestoreOwner='fawri_cashier_retirement_owner';
const readerRole='fawri_sequence_restore_reader';
const readerPassword='owned-disposable-sequence-reader-only';
const ids=['audit-restore-merchant-a','audit-restore-merchant-b'];
export async function seedStreamProposalRestore(pool){
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")).rows[0].n,53,'restore uses committed0052');
 await pool.query(`CREATE ROLE ${readerRole} LOGIN PASSWORD '${readerPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
 await pool.query(`GRANT USAGE ON SCHEMA public,fawri_security TO ${readerRole}`);
 await pool.query(`GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO ${readerRole}`);
 await pool.query(`GRANT SELECT ON cashier_device_streams,cashier_operation_receipts TO ${readerRole}`);
 for(const id of ids){
  await pool.query("INSERT INTO merchant_locations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",['location-'+id,id]);
  await pool.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,pin_hash) VALUES($1,$2,'Synthetic',repeat('0',64))",['staff-'+id,id]);
  await pool.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name,location_id) VALUES($1,$2,'Synthetic',$3)",['station-'+id,id,'location-'+id]);
  await pool.query('INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id) VALUES($1,$2,$3,$4)',['shift-'+id,id,'station-'+id,'staff-'+id]);
  await pool.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) VALUES($1,$2,$3,'active',repeat('a',64),now())",['stream-'+id,id,'device-'+id]);
  const c=await pool.connect();try{
   await c.query('BEGIN');
   await c.query("INSERT INTO cashier_operation_receipts(id,stream_id,merchant_id,device_sequence,operation_id,operation_kind,canonical_version,request_hash,result_id,station_id,location_id,staff_id,shift_id,occurred_at) VALUES($1,$2,$3,1,$4,'sale',1,repeat('b',64),$5,$6,$7,$8,$9,now())",['receipt-'+id,'stream-'+id,id,'operation-'+id,'synthetic-result-'+id,'station-'+id,'location-'+id,'staff-'+id,'shift-'+id]);
   await c.query('UPDATE cashier_device_streams SET last_sequence=1,version=version+1 WHERE id=$1',['stream-'+id]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}
export async function streamRestoreComponents(pool){
 return {
  streams:(await pool.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t ORDER BY id')).rows,
  receipts:(await pool.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows,
  roles:(await pool.query('SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[[streamRestoreOwner,readerRole]])).rows,
  columns:(await pool.query("SELECT c.relname,a.attname,ARRAY(SELECT x::text FROM unnest(coalesce(a.attacl,ARRAY[]::aclitem[])) x ORDER BY x::text) AS acl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE a.attrelid IN ('cashier_device_streams'::regclass,'cashier_operation_receipts'::regclass) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum")).rows,
  triggers:(await pool.query("SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.oid IN ('merchants'::regclass,'cashier_device_streams'::regclass,'cashier_operation_receipts'::regclass) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows,
 };
}
export async function verifyStreamProposalRestore(pool,phase,authenticationUrl){
 const owner=(await pool.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[streamRestoreOwner])).rows[0];
 assert.deepEqual(owner,{rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false});
 assert.equal((await pool.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.fawri_sequence_merchant_deleted()'::regprocedure")).rows[0].owner,streamRestoreOwner);
 for(const column of ['state','device_id','version'])assert.equal((await pool.query("SELECT has_column_privilege($1,'cashier_device_streams',$2,'UPDATE') AS allowed",[streamRestoreOwner,column])).rows[0].allowed,true);
 assert.equal((await pool.query("SELECT has_column_privilege($1,'cashier_device_streams','last_sequence','UPDATE') AS allowed",[streamRestoreOwner])).rows[0].allowed,false);
 assert.equal((await pool.query("SELECT has_table_privilege($1,'cashier_operation_receipts','SELECT,INSERT,UPDATE,DELETE') AS allowed",[streamRestoreOwner])).rows[0].allowed,false);
 const url=new URL(process.env.DATABASE_URL);url.username=readerRole;url.password=readerPassword;url.search='';
 const client=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000}),issuer=new Client({connectionString:authenticationUrl,connectionTimeoutMillis:5000});
 try{
  await client.connect();await issuer.connect();
  const flags=(await client.query('SELECT session_user::text AS login,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=session_user')).rows[0];assert.deepEqual(flags,{login:readerRole,rolsuper:false,rolbypassrls:false});
  assert.equal((await client.query('SELECT id FROM cashier_device_streams')).rowCount,0);
  assert.equal((await client.query('SELECT id FROM cashier_operation_receipts')).rowCount,0);
  assert.equal((await client.query("SELECT pg_has_role(current_user,$1,'USAGE') OR pg_has_role(current_user,$1,'SET') AS member",[streamRestoreOwner])).rows[0].member,false);
  await assert.rejects(client.query('SELECT public.fawri_sequence_merchant_deleted()'),e=>e.code==='42501');
  for(const id of ids){
   await client.query('BEGIN');try{
    await client.query("SELECT set_config('fawri.tenant_id',$1,true)",[id]);assert.equal((await client.query('SELECT id FROM cashier_operation_receipts')).rowCount,0,'forged GUC denied');
    const target=(await client.query('SELECT session_user::text AS login,pg_backend_pid() AS pid,txid_current()::text AS xid')).rows[0];
    await issuer.query('SELECT fawri_security.issue_scope($1::name,$2::integer,$3::bigint,$4::text)',[target.login,target.pid,target.xid,id]);
    assert.deepEqual((await client.query('SELECT merchant_id FROM cashier_device_streams')).rows,[{merchant_id:id}]);
    assert.deepEqual((await client.query('SELECT merchant_id FROM cashier_operation_receipts')).rows,[{merchant_id:id}]);
   }finally{await client.query('ROLLBACK');}
  }
  await assert.rejects(client.query("UPDATE cashier_device_streams SET state='retired',device_id=NULL,version=version+1"),e=>e.code==='42501');
 }finally{await client.end();await issuer.end();}
 await assert.rejects(pool.query("UPDATE cashier_operation_receipts SET request_hash=repeat('c',64) WHERE id=$1",['receipt-'+ids[0]]),e=>e.code==='23514');
 if(phase==='verify'){
  const receipts=(await pool.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows;
  const peer=(await pool.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t WHERE merchant_id=$1',[ids[1]])).rows;
  const oldAuth=process.env.FAWRI_AUTH_DATABASE_URL,oldAuthority=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;process.env.FAWRI_AUTH_DATABASE_URL=authenticationUrl;process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  try{
   const management=await import('../../src/services/postgresMerchantManagementAuthority.ts');
   const adminId='sequence-restore-owner-admin';
   await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin','+19995550199','synthetic','active')",[adminId]);
   await pool.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic','owner_admin',true,false)",[adminId]);
   await pool.query("UPDATE merchants SET status='suspended',account_status='suspended' WHERE id=$1",[ids[0]]);
   const request=await management.createDeletionRequestPostgres({merchantId:ids[0],reason:'policy_violation',details:'Synthetic restored stream deletion',actorAdminId:adminId});
   const result=await management.completeMerchantDeletionPostgres({merchantId:ids[0],deletionRequestId:request.id,actorAdminId:adminId});assert.equal(result.ok,true);
   assert.deepEqual((await pool.query('SELECT state,device_id,last_sequence FROM cashier_device_streams WHERE merchant_id=$1',[ids[0]])).rows,[{state:'retired',device_id:null,last_sequence:'1'}]);
   assert.deepEqual((await pool.query('SELECT to_jsonb(t) AS row FROM cashier_operation_receipts t ORDER BY id')).rows,receipts);
   assert.deepEqual((await pool.query('SELECT to_jsonb(t) AS row FROM cashier_device_streams t WHERE merchant_id=$1',[ids[1]])).rows,peer);
  }finally{const {closeAuthenticationPool}=await import('../../src/services/authenticationPostgresAuthority.ts');await closeAuthenticationPool();if(oldAuth===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=oldAuth;if(oldAuthority===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=oldAuthority;}
 }
 console.log('P0_STREAM_PROPOSAL_RESTORE '+JSON.stringify({phase,proposalOutsideCanonicalJournal:false,ownerAndColumnAcl:true,realRestrictedLogin:true,tenantReadIsolation:true,immutableReceipts:true,actualDeletionServiceAfterRestore:phase==='verify',rolesPreprovisionedSameOwnedCluster:true,hostedAccepted:false}));
}
