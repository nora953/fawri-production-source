// Audit-only actual SQL tests. No original application/test changes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
const {pool}=await import('../../../lib/db/src/index.ts');
const accounts=await import('../../../artifacts/api-server/src/services/postgresMerchantAccountAuthority.js');
const support=await import('../../../artifacts/api-server/src/services/postgresSupportAuthority.js');
const inspection=await import('../../../artifacts/api-server/src/services/postgresSupportInspectionAuthority.js');
const lifecycle=await import('../../../artifacts/api-server/src/services/postgresSupportLifecycleAuthority.js');
async function seed(expired=false){
 const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12);
 const pending=await accounts.upsertPendingMerchantAuthoritative({phone:`+96477${crypto.randomInt(0,100000000).toString().padStart(8,'0')}`,passwordHash:`hash-${suffix}`,ownerName:'Expiry audit owner',storeName:'Expiry audit store',activityType:'retail',language:'en',requestedPlan:'silver'});
 await accounts.markMerchantOtpVerifiedAuthoritative(pending.account.id);
 const merchantId=pending.account.id,adminId=`admin-expiry-${suffix}`,ticketId=`ticket-expiry-${suffix}`,requestId=`request-expiry-${suffix}`,sessionId=`preview-expiry-${suffix}`;
 await pool.query("INSERT INTO accounts(id,kind,password_hash,state,language,phone_verified) VALUES($1,'admin',$2,'active','en',true)",[adminId,`hash-${suffix}`]);
 await pool.query("INSERT INTO support_tickets(id,merchant_id,subject,category,status,assigned_admin_account_id,waiting_on,waiting_since) VALUES($1,$2,'Owned expiry proof','technical','in_progress',$3,'admin',now())",[ticketId,merchantId,adminId]);
 await pool.query("INSERT INTO support_inspection_requests(id,ticket_id,merchant_id,admin_account_id,mode,reason,request_expires_at) VALUES($1,$2,$3,$4,'independent_read_only','Owned expiry audit',now()+($5::int * interval '1 hour'))",[requestId,ticketId,merchantId,adminId,expired?-1:1]);
 return {merchantId,adminId,ticketId,requestId,sessionId};
}
async function row(s:Awaited<ReturnType<typeof seed>>){return (await pool.query('SELECT status,consent_decision,expired_at,ended_at,end_reason FROM support_inspection_requests WHERE id=$1',[s.requestId])).rows[0];}
function decision(s:Awaited<ReturnType<typeof seed>>,d:'approve'|'reject'='approve'){return inspection.decideInspectionRequestCanonicalPostgres({merchantId:s.merchantId,ticketId:s.ticketId,requestId:s.requestId,decision:d});}
async function preview(s:Awaited<ReturnType<typeof seed>>,expired=true){
 await pool.query("UPDATE support_inspection_requests SET status='approved',consent_decision='approved',approved_at=now()+($2::int * interval '1 hour') WHERE id=$1",[s.requestId,expired?-1:0]);
 await pool.query("INSERT INTO support_preview_sessions(id,request_id,ticket_id,merchant_id,admin_account_id,started_at,expires_at) VALUES($1,$2,$3,$4,$5,now()-interval '2 hours',now()+($6::int * interval '1 hour'))",[s.sessionId,s.requestId,s.ticketId,s.merchantId,s.adminId,expired?-1:1]);
}
async function previewRow(s:Awaited<ReturnType<typeof seed>>){return (await pool.query('SELECT status,ended_at,end_reason,viewed_sections FROM support_preview_sessions WHERE id=$1',[s.sessionId])).rows[0];}
function validate(s:Awaited<ReturnType<typeof seed>>){return support.validateSupportPreviewSessionPostgres({sessionId:s.sessionId,adminId:s.adminId,viewedSection:'inventory'});}
for(const d of ['approve','reject'] as const)test(`unexpired canonical ${d} commits consent`,async()=>{
 const s=await seed();await decision(s,d);const r=await row(s);assert.equal(r.status,d==='approve'?'approved':'rejected');assert.equal(r.consent_decision,d==='approve'?'approved':'rejected');
});
test('foreign merchant cannot decide another tenant request',async()=>{
 const s=await seed(),foreign=await seed();await assert.rejects(inspection.decideInspectionRequestCanonicalPostgres({merchantId:foreign.merchantId,ticketId:s.ticketId,requestId:s.requestId,decision:'approve'}),{code:'SUPPORT_INSPECTION_NOT_FOUND'});assert.equal((await row(s)).status,'pending');
});
test('concurrent opposite decisions serialize to one committed outcome',async()=>{
 const s=await seed();const outcomes=await Promise.allSettled([decision(s,'approve'),decision(s,'reject')]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);const rejected=outcomes.find(x=>x.status==='rejected') as PromiseRejectedResult;assert.equal(rejected.reason.code,'SUPPORT_INSPECTION_NOT_PENDING');
 const r=await row(s);assert.ok(['approved','rejected'].includes(r.status));assert.equal(r.consent_decision,r.status);
 console.log('SUPPORT_EXPIRY_OBSERVATION '+JSON.stringify({scenario:'concurrent-consent',fulfilled:1,rejected:1,status:r.status}));
});
test('expired consent denial should persist its expired marker',async()=>{
 const s=await seed(true);await assert.rejects(decision(s),{code:'SUPPORT_INSPECTION_EXPIRED'});const r=await row(s);
 console.log('SUPPORT_EXPIRY_OBSERVATION '+JSON.stringify({scenario:'consent-expiry',accessDenied:true,status:r.status,expiredAtPresent:!!r.expired_at,endedAtPresent:!!r.ended_at}));
 assert.equal(r.status,'expired','SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001: consent marker should survive denial');
});
test('expired preview denial should persist its ended marker',async()=>{
 const s=await seed();await preview(s);await assert.rejects(validate(s),{code:'SUPPORT_PREVIEW_EXPIRED'});const r=await previewRow(s);
 console.log('SUPPORT_EXPIRY_OBSERVATION '+JSON.stringify({scenario:'preview-expiry',accessDenied:true,status:r.status,endedAtPresent:!!r.ended_at,viewedSections:r.viewed_sections}));
 assert.equal(r.status,'ended','SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001: preview marker should survive denial');
});
test('canonical lifecycle persists expired rows, preserves live other tenant and repeats idempotently',async()=>{
 const pending=await seed(true),expired=await seed(),live=await seed();await preview(expired);await preview(live,false);
 const liveBefore={request:await row(live),preview:await previewRow(live)};
 const first=await lifecycle.refreshSupportLifecyclePostgresCanonical();
 assert.equal((await row(pending)).status,'expired');assert.ok((await row(pending)).expired_at);assert.ok((await row(expired)).ended_at);assert.equal((await previewRow(expired)).status,'ended');assert.ok((await previewRow(expired)).ended_at);
 assert.deepEqual({request:await row(live),preview:await previewRow(live)},liveBefore);
 await assert.rejects(decision(pending),{code:'SUPPORT_INSPECTION_NOT_PENDING'});await assert.rejects(validate(expired),{code:'SUPPORT_PREVIEW_ENDED'});
 const second=await lifecycle.refreshSupportLifecyclePostgresCanonical();assert.equal(second.expired_inspection_requests,0);assert.equal(second.expired_preview_sessions,0);
 const active=await validate(live);assert.equal(active.read_only,true);assert.deepEqual((await previewRow(live)).viewed_sections,['inventory']);
 console.log('SUPPORT_EXPIRY_OBSERVATION '+JSON.stringify({scenario:'lifecycle',first,second,unexpiredOtherTenantPreserved:true,expiredAccessDenied:true,liveReadOnly:true}));
});
test.after(async()=>{await pool.end();});
