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
test('current session cap expiry rotation and self-session HTTP boundaries on owned SQL',async t=>{
 let pool:any,server:any,stopSupport:any;
 t.after(async()=>{
  try{if(stopSupport)await stopSupport();}finally{try{if(server){server.closeAllConnections();await new Promise<void>((ok,no)=>server.close((e:any)=>e?no(e):ok()));}}finally{if(pool)await pool.end();}}
 });
 ({pool}=await import('../../../lib/db/src/index.ts'));
 const {hashPassword,verifyPassword}=await import('../../../artifacts/api-server/src/services/authPasswordService.js');
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
 const devices={owner:'owned-owner-device',assistant:'owned-assistant-device',denied:'owned-denied-device'};
 const records:Record<string,string>={};
 const security=await import('../../../artifacts/api-server/src/services/postgresAdminSecurityAuthority.js');
 for(const [accountId,deviceId] of [[ownerId,devices.owner],[assistantId,devices.assistant],[deniedId,devices.denied]]){const device=await security.registerAdminDeviceAuthoritative({accountId,accountKind:'admin',deviceId,deviceLabel:'Owned synthetic trusted device'});records[accountId]=device.id;await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:ownerId});}
 const ownerSession=await auth.issueSession({accountId:ownerId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'owner_admin',deviceId:devices.owner,permissions:[]});
 const assistantSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:devices.assistant,permissions:['view_merchants','manage_merchant_status','manage_channels']});
 const deniedSession=await auth.issueSession({accountId:deniedId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:devices.denied,permissions:[]});
 const ownerCookie=`${ADMIN_SESSION_COOKIE}=${ownerSession.token}`,assistantCookie=`${ADMIN_SESSION_COOKIE}=${assistantSession.token}`,deniedCookie=`${ADMIN_SESSION_COOKIE}=${deniedSession.token}`;
 const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/auth',authRouter);
 server=await new Promise<any>((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});const origin=`http://127.0.0.1:${server.address().port}`;
 const observations:any[]=[];
 async function run(name:string,fn:()=>Promise<any>){let passed=false;await t.test(name,async()=>{const details=await fn();observations.push({name,status:'PASS',details});passed=true;});if(!passed)throw Error('Later dependent cases BLOCKED after '+name);}
 const cookieDevices=new Map([[ownerCookie,devices.owner],[assistantCookie,devices.assistant],[deniedCookie,devices.denied]]);
 async function req(route:string,cookie?:string,method='GET',value?:unknown,deviceOverride?:string|null){const device=deviceOverride===undefined?cookieDevices.get(cookie||''):deviceOverride;const r=await fetch(origin+'/api/auth'+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(device?{'x-fawri-device-id':device}:{}),...(value!==undefined?{'Content-Type':'application/json'}:{})},...(value!==undefined?{body:JSON.stringify(value)}:{})});return {status:r.status,body:await r.json().catch(()=>null),setCookie:r.headers.get('set-cookie')||''};}
 async function sessionStatus(id:string){return (await pool.query('SELECT status FROM account_sessions WHERE id=$1',[id])).rows[0].status;}
 async function issue(accountId:string,deviceId:string,role:'owner_admin'|'assistant_admin'='assistant_admin'){const x=await auth.issueSession({accountId,accountKind:'admin',tenantId:'fawri-admin',adminRole:role,deviceId,permissions:role==='owner_admin'?[]:['view_merchants']});const cookie=`${ADMIN_SESSION_COOKIE}=${x.token}`;cookieDevices.set(cookie,deviceId);return {issued:x,cookie};}
 async function row(id:string){return (await pool.query('SELECT status,revoke_reason,replaced_by_session_id,idle_expires_at,absolute_expires_at FROM account_sessions WHERE id=$1',[id])).rows[0];}
 async function due(id:string){await pool.query("UPDATE account_sessions SET created_at=now()-interval '1 hour',rotate_after=now()-interval '1 minute' WHERE id=$1",[id]);}
 function replacement(header:string,deviceId:string){const pair=header.split(';',1)[0];assert.ok(pair.startsWith(ADMIN_SESSION_COOKIE+'=')&&pair.length>ADMIN_SESSION_COOKIE.length+8,'replacement cookie missing');const token=decodeURIComponent(pair.slice(ADMIN_SESSION_COOKIE.length+1));assert.ok(token.startsWith('fs1.'),'replacement token format');const cookie=`${ADMIN_SESSION_COOKIE}=${token}`;cookieDevices.set(cookie,deviceId);return {cookie,id:token.split('.')[1]};}
 let ownerSecond:any,ownerOther:any,assistantSecond:any,assistantThird:any,rotating:any,rotated:any,winner:any;
 await run('owner third session on same device is refused without revoking first two',async()=>{ownerSecond=await issue(ownerId,devices.owner,'owner_admin');await assert.rejects(()=>issue(ownerId,devices.owner,'owner_admin'),/OWNER_SESSION_LIMIT_REACHED/);assert.equal((await req('/admin/me',ownerCookie)).status,200);assert.equal((await req('/admin/me',ownerSecond.cookie)).status,200);assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_sessions WHERE account_id=$1 AND status='active'",[ownerId])).rows[0].n,2);return {sameDeviceCap:2,thirdRefused:true,firstTwoHTTP:200};});
 await run('owner cap is per device and second trusted device may have its own session',async()=>{const deviceId='owned-session-owner-other';const d=await security.registerAdminDeviceAuthoritative({accountId:ownerId,accountKind:'admin',deviceId,deviceLabel:'Owned second owner device'});await security.setAdminDeviceTrustAuthoritative({deviceRecordId:d.id,trusted:true,actorAccountId:ownerId});ownerOther=await issue(ownerId,deviceId,'owner_admin');assert.equal((await req('/admin/me',ownerOther.cookie)).status,200);assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_sessions WHERE account_id=$1 AND status='active'",[ownerId])).rows[0].n,3);return {activeAcrossTwoDevices:3,secondDeviceHTTP:200};});
 await run('assistant third session replaces oldest while retaining account cap two',async()=>{assistantSecond=await issue(assistantId,devices.assistant);assistantThird=await issue(assistantId,devices.assistant);assert.equal(await sessionStatus(assistantSession.session.id),'revoked');assert.equal((await req('/admin/me',assistantCookie)).status,401);for(const x of [assistantSecond,assistantThird])assert.equal((await req('/admin/me',x.cookie)).status,200);assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_sessions WHERE account_id=$1 AND status='active'",[assistantId])).rows[0].n,2);return {oldestHTTP:401,retainedHTTP:200,cap:2};});
 await run('self session list is account scoped and has no token hash or token',async()=>{const r=await req('/admin/sessions',assistantThird.cookie);assert.equal(r.status,200);assert.deepEqual(r.body.sessions.map((x:any)=>x.id).sort(),[assistantSecond.issued.session.id,assistantThird.issued.session.id].sort());for(const x of r.body.sessions){assert.equal(x.account_id,assistantId);assert.ok(!Object.hasOwn(x,'token_hash')&&!Object.hasOwn(x,'token'));}return {status:200,ownedSessions:2,tokenMaterialAbsent:true};});
 await run('self session delete cannot target owner account',async()=>{assert.equal((await req('/admin/sessions/'+ownerSession.session.id,assistantThird.cookie,'DELETE')).status,404);assert.equal(await sessionStatus(ownerSession.session.id),'active');return {status:404,ownerActive:true};});
 await run('self session delete invalidates selected own cookie and keeps current cookie',async()=>{assert.equal((await req('/admin/sessions/'+assistantSecond.issued.session.id,assistantThird.cookie,'DELETE')).status,200);assert.equal((await req('/admin/me',assistantSecond.cookie)).status,401);assert.equal((await req('/admin/me',assistantThird.cookie)).status,200);return {delete:200,selectedHTTP:401,currentHTTP:200};});
 await run('idle expiration is rejected and SQL expired marker persists',async()=>{const x=await issue(deniedId,devices.denied);await pool.query("UPDATE account_sessions SET created_at=now()-interval '2 hours',idle_expires_at=now()-interval '1 minute' WHERE id=$1",[x.issued.session.id]);assert.equal((await req('/admin/me',x.cookie)).status,401);assert.equal(await sessionStatus(x.issued.session.id),'expired');return {status:401,sql:'expired'};});
 await run('absolute expiration is rejected with valid SQL deadline ordering',async()=>{const x=await issue(deniedId,devices.denied);await pool.query("UPDATE account_sessions SET created_at=now()-interval '2 hours',rotate_after=now()-interval '1 hour',idle_expires_at=now()-interval '1 minute',absolute_expires_at=now()-interval '30 seconds' WHERE id=$1",[x.issued.session.id]);assert.equal((await req('/admin/me',x.cookie)).status,401);assert.equal(await sessionStatus(x.issued.session.id),'expired');return {status:401,sql:'expired',idleAlsoExpired:true};});
 await run('successful HTTP touch cannot extend idle deadline past absolute deadline',async()=>{const x=await issue(deniedId,devices.denied);await pool.query("UPDATE account_sessions SET idle_expires_at=now()+interval '10 seconds',absolute_expires_at=now()+interval '60 seconds',rotate_after=now()+interval '30 seconds' WHERE id=$1",[x.issued.session.id]);assert.equal((await req('/admin/me',x.cookie)).status,200);const r=await row(x.issued.session.id);assert.equal(r.idle_expires_at.getTime(),r.absolute_expires_at.getTime());return {status:200,idleBoundedToAbsolute:true};});
 await run('due HTTP session rotates to one replacement preserving absolute expiry',async()=>{rotating=await issue(assistantId,devices.assistant);await due(rotating.issued.session.id);const before=await row(rotating.issued.session.id);const r=await req('/admin/me',rotating.cookie);assert.equal(r.status,200);assert.ok(/HttpOnly/i.test(r.setCookie)&&/Path=\/api/i.test(r.setCookie)&&/SameSite=Lax/i.test(r.setCookie));rotated=replacement(r.setCookie,devices.assistant);const old=await row(rotating.issued.session.id),next=await row(rotated.id);assert.equal(old.status,'revoked');assert.equal(old.revoke_reason,'rotated');assert.equal(old.replaced_by_session_id,rotated.id);assert.equal(next.status,'active');assert.equal(next.absolute_expires_at.getTime(),before.absolute_expires_at.getTime());assert.equal((await req('/admin/me',rotating.cookie)).status,401);assert.equal((await req('/admin/me',rotated.cookie)).status,200);return {status:200,oldHTTP:401,newHTTP:200,oneLinkedReplacement:true,absolutePreserved:true,cookieFlags:true};});
 await run('logout using original rotated cookie follows two replacements and revokes latest',async()=>{await due(rotated.id);const second=await req('/admin/me',rotated.cookie);assert.equal(second.status,200);const latest=replacement(second.setCookie,devices.assistant);assert.equal((await req('/admin/logout',rotating.cookie,'POST')).status,200);assert.equal(await sessionStatus(latest.id),'revoked');assert.equal((await req('/admin/me',latest.cookie)).status,401);assert.equal((await req('/admin/me',ownerCookie)).status,200);return {logout:200,lineageDepth:2,latestHTTP:401,ownerHTTP:200};});
 await run('two concurrent due HTTP requests produce one rotation winner and one stale denial',async()=>{const x=await issue(assistantId,devices.assistant);await due(x.issued.session.id);const replies=await Promise.all([req('/admin/me',x.cookie),req('/admin/me',x.cookie)]);assert.deepEqual(replies.map(x=>x.status).sort(),[200,401]);const success=replies.find(x=>x.status===200)!;winner=replacement(success.setCookie,devices.assistant);assert.equal((await row(x.issued.session.id)).replaced_by_session_id,winner.id);assert.equal(await sessionStatus(winner.id),'active');assert.equal((await req('/admin/me',winner.cookie)).status,200);const loser=replies.find(x=>x.status===401)!;return {statuses:[200,401],oneLinkedWinner:true,winnerHTTP:200,loserEmittedCookieClear:loser.setCookie.startsWith(ADMIN_SESSION_COOKIE+'=;')};});
 await run('self logout-all requires session and revokes own cookies without harming owner',async()=>{assert.equal((await req('/admin/logout-all',undefined,'POST')).status,401);const r=await req('/admin/logout-all',winner.cookie,'POST');assert.equal(r.status,200);assert.equal((await req('/admin/me',winner.cookie)).status,401);assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_sessions WHERE account_id=$1 AND status='active'",[assistantId])).rows[0].n,0);assert.equal((await req('/admin/me',ownerCookie)).status,200);return {anonymous:401,logout:200,ownHTTP:401,activeOwn:0,ownerHTTP:200};});
 await run('tampered secret and merchant cookie kind cannot revoke rightful admin session',async()=>{const x=await issue(assistantId,devices.assistant);const parts=x.issued.token.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);const tampered=`${ADMIN_SESSION_COOKIE}=${parts.join('.')}`;cookieDevices.set(tampered,devices.assistant);assert.equal((await req('/admin/me',tampered)).status,401);const wrongKind=`${MERCHANT_SESSION_COOKIE}=${x.issued.token}`;cookieDevices.set(wrongKind,devices.assistant);assert.equal((await req('/me',wrongKind)).status,401);assert.equal(await sessionStatus(x.issued.session.id),'active');assert.equal((await req('/admin/me',x.cookie)).status,200);return {tampered:401,wrongKind:401,rightful:200,sessionActive:true};});
 const data=process.env.FAWRI_DATA_DIR!;for(const f of ['merchants.json','auth-security.json'])assert.equal(fs.existsSync(path.join(data,f)),false);
 console.log('SESSION_HTTP_OBSERVATIONS '+JSON.stringify({cases:observations.length,results:observations,noLegacyJSON:true}));
});
