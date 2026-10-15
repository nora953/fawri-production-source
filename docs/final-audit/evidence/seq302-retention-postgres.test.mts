// Audit-only modern E164 synthetic fixtures; original tests unchanged.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
Object.assign(process.env,{NODE_ENV:'test',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',FAWRI_AUTH_SECURITY_SECRET:'owned-retention-audit-security-secret-over32',FAWRI_PASSWORD_SALT:'owned-retention-audit-salt-over32characters'});
const {pool}=await import('../../../lib/db/src/index.ts');
const {hashPassword}=await import('../../../artifacts/api-server/src/services/authPasswordService.js');
const {authPostgresSessionAuthority:auth}=await import('../../../artifacts/api-server/src/services/authPostgresSessionAuthority.js');
const retention=await import('../../../artifacts/api-server/src/services/postgresMerchantRetentionAuthority.js');
const management=await import('../../../artifacts/api-server/src/services/postgresMerchantManagementAuthority.js');
const now=new Date('2026-10-13T00:00:00Z');
function phone(){return `+96477${crypto.randomInt(0,100000000).toString().padStart(8,'0')}`;}
async function seed(expiry='2026-01-01T00:00:00Z'){
 const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12),id=`retention-${suffix}`,sub=`retention-sub-${suffix}`;
 await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,language,phone_verified,phone_verified_at) VALUES($1,'merchant',$2,$3,'active','en',true,now())",[id,phone(),hashPassword('OwnedRetention9!')]);
 await pool.query("INSERT INTO merchants(id,account_id,profile_kind,owner_name,store_name,activity_type,status,account_status,onboarding_status,trial_status,signup_source,last_subscription_ended_at,warning_stage,products_read_only) VALUES($1,$1,'merchant','Owned retention owner','Owned retention store','retail','approved','approved','awaiting_channel','expired','direct',$2,0,false)",[id,expiry]);
 await pool.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining,auto_reply_enabled,starts_at,expires_at,version) VALUES($1,$2,'silver',$4::subscription_status,25000,1,4000,0,4000,0,$5,'2025-01-01T00:00:00Z',$3,1)",[sub,id,expiry,new Date(expiry)>now?'active':'expired',new Date(expiry)>now]);
 return {id,sub,suffix};
}
async function state(s:Awaited<ReturnType<typeof seed>>){
 return {account:(await pool.query('SELECT state,session_version,security_version,suspended_at,updated_at FROM accounts WHERE id=$1',[s.id])).rows[0],merchant:(await pool.query('SELECT status,account_status,retention_status,warning_stage,products_read_only,retention_suspended_at,grace_period_ends_at,eligible_for_deletion_at,updated_at FROM merchants WHERE id=$1',[s.id])).rows[0],subscription:(await pool.query('SELECT status,auto_reply_enabled,base_replies_remaining,addon_replies_remaining,version,suspended_at,updated_at FROM subscriptions WHERE id=$1',[s.sub])).rows[0],sessions:(await pool.query('SELECT id,status,revoked_at,revoke_reason FROM account_sessions WHERE account_id=$1 ORDER BY id',[s.id])).rows};
}
async function session(s:Awaited<ReturnType<typeof seed>>){return auth.issueSession({accountId:s.id,accountKind:'merchant',tenantId:s.id});}
async function assistant(){const id=`retention-assistant-${crypto.randomUUID()}`;await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,language,phone_verified,phone_verified_at) VALUES($1,'admin',$2,$3,'active','en',true,now())",[id,phone(),hashPassword('OwnedAssistant9!')]);await pool.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Owned retention assistant','assistant_admin',true,false)",[id]);return id;}
function deletion(s:Awaited<ReturnType<typeof seed>>,actorAdminId:string){return management.createDeletionRequestPostgres({merchantId:s.id,actorAdminId,reason:'retention_expired',details:'Owned retention audit deletion request'});}
test('warning2 persists read-only without suspending account',async()=>{
 const s=await seed('2026-07-01T00:00:00Z');const r=await retention.refreshMerchantRetentionPostgres(s.id,now);const v=await state(s);
 assert.equal(r?.productsReadOnly,true);assert.equal(r?.accountSuspended,false);assert.equal(r?.retentionStatus,'warning_2');assert.equal(v.account.state,'active');assert.equal(v.merchant.products_read_only,true);assert.equal(v.merchant.warning_stage,2);
});
test('overdue suspension revokes sessions once and preserves other tenant',async()=>{
 const s=await seed(),other=await seed('2026-11-15T00:00:00Z');await session(s);await session(other);const before=await state(s),foreign=await state(other);
 const r=await retention.refreshMerchantRetentionPostgres(s.id,now),first=await state(s);assert.equal(r?.accountSuspended,true);assert.equal(r?.retentionStatus,'eligible_for_deletion');assert.equal(first.account.state,'suspended');assert.equal(first.account.session_version,before.account.session_version+1);assert.equal(first.account.security_version,before.account.security_version+1);assert.equal(first.subscription.status,'suspended');assert.equal(first.subscription.auto_reply_enabled,false);assert.equal(first.sessions.length,1);assert.equal(first.sessions[0].status,'revoked');
 await retention.refreshMerchantRetentionPostgres(s.id,now);const second=await state(s);assert.equal(second.account.session_version,first.account.session_version);assert.equal(second.account.security_version,first.account.security_version);assert.equal(second.subscription.version,first.subscription.version);assert.deepEqual(second.sessions,first.sessions);assert.deepEqual(await state(other),foreign);
 console.log('RETENTION_OBSERVATION '+JSON.stringify({scenario:'suspend-repeat',revokedSessions:1,versionsIncrementOnce:true,otherTenantUnchanged:true}));
});
for(const replies of [0,10])test(`renewal restores retention suspension with ${replies} replies but never revives old session`,async()=>{
 const s=await seed();await session(s);await retention.refreshMerchantRetentionPostgres(s.id,now);const old=await state(s);
 await pool.query("UPDATE subscriptions SET expires_at='2026-11-15T00:00:00Z',base_replies_remaining=$2,base_replies_used=4000-$2 WHERE id=$1",[s.sub,replies]);
 const r=await retention.refreshMerchantRetentionPostgres(s.id,now),v=await state(s);assert.equal(r?.retentionStatus,'protected');assert.equal(v.account.state,'active');assert.equal(v.merchant.status,'approved');assert.equal(v.merchant.products_read_only,false);assert.equal(v.merchant.retention_suspended_at,null);assert.equal(v.subscription.status,replies===0?'replies_exhausted':'active');assert.equal(v.subscription.auto_reply_enabled,replies>0);assert.equal(v.subscription.version,old.subscription.version+1);assert.deepEqual(v.sessions,old.sessions);
});
test('administrative suspension stays suspended and current renewal blocks retention deletion',async()=>{
 const s=await seed('2026-11-15T00:00:00Z'),actor=await assistant();await pool.query("UPDATE accounts SET state='suspended',suspended_at=now() WHERE id=$1",[s.id]);await pool.query("UPDATE merchants SET status='suspended',account_status='suspended' WHERE id=$1",[s.id]);
 await retention.refreshMerchantRetentionPostgres(s.id,now);const v=await state(s);assert.equal(v.account.state,'suspended');assert.equal(v.merchant.status,'suspended');assert.equal(v.merchant.retention_suspended_at,null);
 await assert.rejects(deletion(s,actor),{code:'MERCHANT_NOT_ELIGIBLE_FOR_DELETION'});assert.equal((await pool.query('SELECT count(*)::int AS n FROM merchant_deletion_requests WHERE merchant_id=$1',[s.id])).rows[0].n,0);
});
test('closed account cannot be revived by a future subscription',async()=>{
 const s=await seed('2026-11-15T00:00:00Z');await pool.query("UPDATE accounts SET state='closed',closed_at=now() WHERE id=$1",[s.id]);const before=await state(s);assert.equal(await retention.refreshMerchantRetentionPostgres(s.id,now),null);assert.deepEqual(await state(s),before);
});
test('SQL session-revocation fault rolls back all suspension changes',async()=>{
 const s=await seed();await session(s);const before=await state(s);
 await pool.query("CREATE FUNCTION audit_seq302_reject_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='revoked' THEN RAISE EXCEPTION 'AUDIT_SEQ302_REVOKE_FAILURE'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER audit_seq302_revoke BEFORE UPDATE ON account_sessions FOR EACH ROW EXECUTE FUNCTION audit_seq302_reject_revoke()');
 try{await assert.rejects(retention.refreshMerchantRetentionPostgres(s.id,now),/AUDIT_SEQ302_REVOKE_FAILURE/);assert.deepEqual(await state(s),before);console.log('RETENTION_OBSERVATION '+JSON.stringify({scenario:'revocation-fault',requestRejected:true,allSelectedLifecycleStateUnchanged:true}));}
 finally{await pool.query('DROP TRIGGER audit_seq302_revoke ON account_sessions');await pool.query('DROP FUNCTION audit_seq302_reject_revoke()');}
});
test('concurrent deletion requests create one pending request and one audit row',async()=>{
 const s=await seed(),actor=await assistant();await retention.refreshMerchantRetentionPostgres(s.id,now);const results=await Promise.allSettled([deletion(s,actor),deletion(s,actor)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const rejected=results.find(x=>x.status==='rejected') as PromiseRejectedResult;assert.equal(rejected.reason.code,'DELETION_REQUEST_ALREADY_PENDING');
 const requests=(await pool.query('SELECT status FROM merchant_deletion_requests WHERE merchant_id=$1',[s.id])).rows;assert.deepEqual(requests,[{status:'pending'}]);assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE merchant_id=$1 AND action_type='deletion_requested'",[s.id])).rows[0].n,1);
 console.log('RETENTION_OBSERVATION '+JSON.stringify({scenario:'concurrent-deletion-request',pendingRequests:1,auditRows:1,duplicateRejected:true}));
});
test.after(async()=>{await pool.end();});
