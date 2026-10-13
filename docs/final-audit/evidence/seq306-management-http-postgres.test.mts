// Audit-only synthetic E164/full Authv2 HTTP fixture. Original test unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const ownerId='admin-owned-mgmt-owner',assistantId='admin-owned-mgmt-assistant',deniedId='admin-owned-mgmt-denied',merchantId='merchant-owned-mgmt',productId='product-owned-mgmt',subscriptionId='subscription-owned-mgmt';
const ownerPhone='+9647987111001',assistantPhone='+9647987111002',merchantPhone='+9647987111003';
const ownerPassword='OwnedManagement9!',assistantPassword='OwnedAssistant9!',merchantPassword='OwnedMerchant9!';
Object.assign(process.env,{NODE_ENV:'test',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',FAWRI_AUTH_SECURITY_SECRET:'owned-management-http-security-secret-over32',FAWRI_PASSWORD_SALT:'owned-management-http-salt-over32characters'});
test('current full Authv2 management and session boundaries on owned SQL',async t=>{
 let pool:any,server:any,stopSupport:any;
 t.after(async()=>{
  try{if(stopSupport)await stopSupport();}finally{try{if(server){server.closeAllConnections();await new Promise<void>((ok,no)=>server.close((e:any)=>e?no(e):ok()));}}finally{if(pool)await pool.end();}}
 });
 ({pool}=await import('../../../lib/db/src/index.ts'));
 const {hashPassword}=await import('../../../artifacts/api-server/src/services/authPasswordService.js');
 const {authPostgresSessionAuthority:auth}=await import('../../../artifacts/api-server/src/services/authPostgresSessionAuthority.js');
 ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../../../artifacts/api-server/src/services/postgresSupportRuntimeCutover.js'));
 const {ADMIN_SESSION_COOKIE,MERCHANT_SESSION_COOKIE}=await import('../../../artifacts/api-server/src/middleware/authSession.js');
 const {default:authRouter}=await import('../../../artifacts/api-server/src/routes/auth-security.js');
 const requireApi=createRequire(path.resolve('artifacts/api-server/package.json'));const express=requireApi('express'),cookieParser=requireApi('cookie-parser');
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES
       ($1, 'admin', $2, $3, 'active', 'en', true, now(), now(), now()),
       ($4, 'admin', $5, $6, 'active', 'en', true, now(), now(), now()),
       ($7, 'merchant', $8, $9, 'active', 'ar', true, now(), now(), now())`,
    [
      ownerId,
      ownerPhone,
      hashPassword(ownerPassword),
      assistantId,
      assistantPhone,
      hashPassword(assistantPassword),
      merchantId,
      merchantPhone,
      hashPassword(merchantPassword),
    ],
  );
  await pool.query(
    `INSERT INTO admin_profiles (
       id, account_id, profile_kind, display_name, role,
       enabled, must_change_password, created_at, updated_at
     ) VALUES
       ($1, $1, 'admin', 'Lifecycle Owner', 'owner_admin', true, false, now(), now()),
       ($2, $2, 'admin', 'Lifecycle Assistant', 'assistant_admin', true, false, now(), now())`,
    [ownerId, assistantId],
  );
  await pool.query(
    `INSERT INTO admin_permissions (admin_id, permission, granted_by_admin_id)
     VALUES
       ($1, 'view_merchants', $2),
       ($1, 'manage_merchant_status', $2),
       ($1, 'manage_channels', $2)`,
    [assistantId, ownerId],
  );
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       requested_plan, warning_stage, products_read_only, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'Merchant Owner PII', 'Merchant Store PII', 'retail',
       'pending_activation', 'pending_review', 'pending_review', 'eligible', 'direct',
       'silver', 0, false, now(), now()
     )`,
    [merchantId],
  );
  await pool.query(
    `INSERT INTO subscriptions (
       id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
       base_reply_limit, base_replies_used, base_replies_remaining,
       addon_replies_remaining, auto_reply_enabled, starts_at, expires_at,
       version, metadata, created_at, updated_at
     ) VALUES (
       $1, $2, 'silver', 'active', 25000, 15,
       4000, 0, 4000,
       0, true, now() - interval '1 day', now() + interval '30 days',
       1, '{"sensitive":"remove"}'::jsonb, now(), now()
     )`,
    [subscriptionId, merchantId],
  );
  await pool.query(
    `INSERT INTO products (
       id, merchant_id, name, original_price_iqd, current_price_iqd,
       quantity, low_stock_threshold, version, status, allow_fawri_reply,
       metadata, created_at, updated_at
     ) VALUES (
       $1, $2, 'Sensitive Product Name', 1000, 1000,
       4, 0, 1, 'available', true,
       '{"sensitive":"remove"}'::jsonb, now(), now()
     )`,
    [productId, merchantId],
  );


 await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,language,phone_verified,phone_verified_at) VALUES($1,'admin','+9647987111004',$2,'active','en',true,now())",[deniedId,hashPassword('OwnedDenied9!')]);
 await pool.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Owned denied assistant','assistant_admin',true,false)",[deniedId]);
 const ownerSession=await auth.issueSession({accountId:ownerId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'owner_admin',permissions:[]});
 const assistantSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',permissions:['view_merchants','manage_merchant_status','manage_channels']});
 const deniedSession=await auth.issueSession({accountId:deniedId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',permissions:[]});
 const ownerCookie=`${ADMIN_SESSION_COOKIE}=${ownerSession.token}`,assistantCookie=`${ADMIN_SESSION_COOKIE}=${assistantSession.token}`,deniedCookie=`${ADMIN_SESSION_COOKIE}=${deniedSession.token}`;
 const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/auth',authRouter);
 server=await new Promise<any>((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});const origin=`http://127.0.0.1:${server.address().port}`;
 const observations:any[]=[];
 async function run(name:string,fn:()=>Promise<any>){let passed=false;await t.test(name,async()=>{const details=await fn();observations.push({name,status:'PASS',details});passed=true;});if(!passed)throw Error('Later dependent cases BLOCKED after '+name);}
 async function req(route:string,cookie?:string,method='GET',value?:unknown){const r=await fetch(origin+'/api/auth'+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(value!==undefined?{'Content-Type':'application/json'}:{})},...(value!==undefined?{body:JSON.stringify(value)}:{})});return {status:r.status,body:await r.json().catch(()=>null)};}
 async function state(){return (await pool.query('SELECT a.state,m.status,m.account_status FROM accounts a JOIN merchants m ON m.id=a.id WHERE a.id=$1',[merchantId])).rows[0];}
 const merchantRoute='/merchants/'+merchantId;let merchantSession:any,firstRequest:any,secondRequest:any;
 await run('unauthenticated management read is denied',async()=>{assert.equal((await req('/merchants')).status,401);return {status:401};});
 await run('assistant permission matrix restricts read and allows granted list',async()=>{assert.equal((await req('/merchants',deniedCookie)).status,403);const r=await req('/merchants',assistantCookie);assert.equal(r.status,200);assert.ok(r.body.merchants.some((x:any)=>x.id===merchantId));return {ungranted:403,granted:200};});
 await run('granted assistant approves merchant authoritatively',async()=>{const r=await req(merchantRoute+'/status',assistantCookie,'PATCH',{status:'approved'});assert.equal(r.status,200);assert.equal(r.body.merchant.status,'approved');merchantSession=await auth.issueSession({accountId:merchantId,accountKind:'merchant',tenantId:merchantId});return {status:200};});
 await run('note and channel override write to SQL without legacy JSON',async()=>{assert.equal((await req(merchantRoute+'/note',assistantCookie,'PUT',{note:'Owned synthetic internal note'})).status,200);assert.equal((await req(merchantRoute+'/channels/messenger',assistantCookie,'PATCH',{status:'connected'})).status,200);assert.equal((await pool.query('SELECT count(*)::int AS n FROM merchant_admin_notes WHERE merchant_id=$1',[merchantId])).rows[0].n,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM merchant_channel_overrides WHERE merchant_id=$1',[merchantId])).rows[0].n,1);return {noteRows:1,overrideRows:1};});
 await run('assistant suspension revokes merchant HTTP session and pauses subscription',async()=>{assert.equal((await req(merchantRoute+'/status',assistantCookie,'PATCH',{status:'suspended',reason:'Owned policy review'})).status,200);assert.equal((await state()).state,'suspended');assert.equal((await pool.query('SELECT status FROM account_sessions WHERE id=$1',[merchantSession.session.id])).rows[0].status,'revoked');assert.equal((await req('/me',`${MERCHANT_SESSION_COOKIE}=${merchantSession.token}`)).status,401);assert.deepEqual((await pool.query('SELECT status,auto_reply_enabled FROM subscriptions WHERE id=$1',[subscriptionId])).rows[0],{status:'suspended',auto_reply_enabled:false});return {revokedSession:true,merchantHTTP:401};});
 await run('assistant creates one deletion request and duplicate is denied',async()=>{const r=await req(merchantRoute+'/deletion-requests',assistantCookie,'POST',{reason:'policy_violation',details:'Owned deletion review'});assert.equal(r.status,201);firstRequest=r.body.deletion_request;assert.equal((await req(merchantRoute+'/deletion-requests',assistantCookie,'POST',{reason:'policy_violation',details:'Owned duplicate review'})).status,409);return {created:201,duplicate:409};});
 await run('assistant cannot review owner deletion request',async()=>{const r=await req('/admin/deletion-requests/'+firstRequest.id+'/reject',assistantCookie,'POST');assert.equal(r.status,403);assert.equal((await pool.query('SELECT status FROM merchant_deletion_requests WHERE id=$1',[firstRequest.id])).rows[0].status,'pending');return {status:403,pending:true};});
 await run('owner rejects first review and a new request is allowed',async()=>{const r=await req('/admin/deletion-requests/'+firstRequest.id+'/reject',ownerCookie,'POST');assert.equal(r.status,200);assert.equal(r.body.deletion_request.status,'rejected');const next=await req(merchantRoute+'/deletion-requests',assistantCookie,'POST',{reason:'policy_violation',details:'Owned final deletion review'});assert.equal(next.status,201);secondRequest=next.body.deletion_request;return {rejected:true,newCreated:true};});
 await run('assistant cannot spoof owner body to complete deletion',async()=>{assert.equal((await req(merchantRoute+'/delete',assistantCookie,'POST',{adminId:ownerId,adminPassword:ownerPassword,deletionRequestId:secondRequest.id})).status,403);assert.equal((await state()).state,'suspended');return {status:403};});
 await run('owner incorrect password cannot complete deletion',async()=>{assert.equal((await req(merchantRoute+'/delete',ownerCookie,'POST',{adminId:ownerId,adminPassword:'OwnedWrongPassword9!',deletionRequestId:secondRequest.id})).status,401);assert.equal((await pool.query('SELECT status FROM merchant_deletion_requests WHERE id=$1',[secondRequest.id])).rows[0].status,'pending');return {status:401,pending:true};});
 await run('owner complete deletion anonymizes fixture and removes its operational rows',async()=>{
  const r=await req(merchantRoute+'/delete',ownerCookie,'POST',{adminId:ownerId,adminPassword:ownerPassword,deletionRequestId:secondRequest.id});assert.equal(r.status,200);assert.equal(r.body.deletion_request.status,'completed');assert.deepEqual((await pool.query('SELECT state,phone,phone_verified FROM accounts WHERE id=$1',[merchantId])).rows[0],{state:'closed',phone:null,phone_verified:false});
  assert.deepEqual((await pool.query('SELECT owner_name,store_name,activity_type,retention_status FROM merchants WHERE id=$1',[merchantId])).rows[0],{owner_name:'[deleted merchant]',store_name:'[deleted merchant]',activity_type:'[deleted]',retention_status:'deleted'});
  for(const table of ['products','merchant_admin_notes','merchant_channel_overrides'])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
  const reviews=(await pool.query('SELECT status,merchant_name_snapshot,merchant_phone_snapshot,details FROM merchant_deletion_requests WHERE merchant_id_snapshot=$1 ORDER BY status',[merchantId])).rows;assert.equal(reviews.length,2);for(const x of reviews){assert.equal(x.merchant_name_snapshot,'[deleted merchant]');assert.equal(x.merchant_phone_snapshot,'');assert.equal(x.details,'[merchant data deleted]');}
  assert.deepEqual((await pool.query('SELECT status,auto_reply_enabled,metadata FROM subscriptions WHERE id=$1',[subscriptionId])).rows[0],{status:'suspended',auto_reply_enabled:false,metadata:{}});assert.ok(!(await req('/merchants',ownerCookie)).body.merchants.some((x:any)=>x.id===merchantId));assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE merchant_id=$1 AND action_type='merchant_deleted'",[merchantId])).rows[0].n,1);return {closed:true,anonymized:true,operationalRowsGone:true,subscriptionRetained:true,auditRows:1};
 });
 const sessionRoute='/admins/'+assistantId+'/sessions/';
 await run('assistant cannot invoke owner session revocation',async()=>{assert.equal((await req(sessionRoute+ownerSession.session.id+'/revoke',assistantCookie,'POST',{owner_password:ownerPassword})).status,403);return {status:403};});
 await run('owner cannot revoke another account session under assistant target',async()=>{assert.equal((await req(sessionRoute+ownerSession.session.id+'/revoke',ownerCookie,'POST',{owner_password:ownerPassword})).status,404);assert.equal((await pool.query('SELECT status FROM account_sessions WHERE id=$1',[ownerSession.session.id])).rows[0].status,'active');return {status:404,ownerSessionActive:true};});
 await run('owner incorrect password cannot revoke assistant session',async()=>{assert.equal((await req(sessionRoute+assistantSession.session.id+'/revoke',ownerCookie,'POST',{owner_password:'OwnedWrongPassword9!'})).status,401);assert.equal((await pool.query('SELECT status FROM account_sessions WHERE id=$1',[assistantSession.session.id])).rows[0].status,'active');return {status:401,assistantSessionActive:true};});
 await run('owner valid revoke invalidates assistant cookie at real HTTP middleware',async()=>{assert.equal((await req(sessionRoute+assistantSession.session.id+'/revoke',ownerCookie,'POST',{owner_password:ownerPassword})).status,200);assert.equal((await req('/merchants',assistantCookie)).status,401);assert.equal((await pool.query('SELECT status FROM account_sessions WHERE id=$1',[assistantSession.session.id])).rows[0].status,'revoked');return {revoked:true,assistantHTTP:401};});
 const data=process.env.FAWRI_DATA_DIR!;for(const f of ['merchants.json','auth-security.json'])assert.equal(fs.existsSync(path.join(data,f)),false);
 console.log('MANAGEMENT_HTTP_OBSERVATIONS '+JSON.stringify({cases:observations.length,results:observations,noLegacyJSON:true}));
});
