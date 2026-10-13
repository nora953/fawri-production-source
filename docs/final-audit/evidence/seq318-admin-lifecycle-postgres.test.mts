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
test('current admin lifecycle HTTP boundaries on owned SQL',async t=>{
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
 async function req(route:string,cookie?:string,method='GET',value?:unknown,deviceOverride?:string|null){const device=deviceOverride===undefined?cookieDevices.get(cookie||''):deviceOverride;const r=await fetch(origin+'/api/auth'+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(device?{'x-fawri-device-id':device}:{}),...(value!==undefined?{'Content-Type':'application/json'}:{})},...(value!==undefined?{body:JSON.stringify(value)}:{})});return {status:r.status,body:await r.json().catch(()=>null)};}
 async function sessionStatus(id:string){return (await pool.query('SELECT status FROM account_sessions WHERE id=$1',[id])).rows[0].status;}
 const target='/admins/'+assistantId;
 const createdPhone='+9647987111005',temporary='OwnedTemporary9!',changed='OwnedChangedNext9!';
 const createBody={owner_name:'Owned created assistant',phone:createdPhone,password:temporary,confirm_password:temporary,language:'en'};
 let createdId:string,secondSession:any,secondCookie:string,resetSession:any,resetCookie:string;
 async function snapshot(){return (await pool.query('SELECT a.password_hash,a.password_version,a.security_version,a.session_version,p.must_change_password FROM accounts a JOIN admin_profiles p ON p.id=a.id WHERE a.id=$1',[assistantId])).rows[0];}
 function assertNoSecrets(v:any){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){assert.ok(!['password_hash','token','token_hash','refresh_token','device_hash','device_fingerprint_hash'].includes(k),'private field in response');assertNoSecrets(x);}}
 await run('assistant cannot list or create administrators',async()=>{assert.equal((await req('/admins',assistantCookie)).status,403);assert.equal((await req('/admins',assistantCookie,'POST',createBody)).status,403);assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE phone=$1',[createdPhone])).rows[0].n,0);return {list:403,create:403,noNewAccount:true};});
 await run('owner invalid assistant input creates no account',async()=>{assert.equal((await req('/admins',ownerCookie,'POST',{...createBody,confirm_password:'DifferentOwned9!'})).status,400);assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE phone=$1',[createdPhone])).rows[0].n,0);return {status:400,noNewAccount:true};});
 await run('owner creates assistant with zero grants and mandatory password change',async()=>{const r=await req('/admins',ownerCookie,'POST',createBody);assert.equal(r.status,201);createdId=r.body.account.id;assert.equal(r.body.admin.admin_role,'assistant_admin');assert.equal(r.body.admin.must_change_password,true);assert.deepEqual(r.body.admin.permissions,[]);assertNoSecrets(r.body);const row=(await pool.query('SELECT a.phone,p.role,p.must_change_password FROM accounts a JOIN admin_profiles p ON p.id=a.id WHERE a.id=$1',[createdId])).rows[0];assert.deepEqual(row,{phone:createdPhone,role:'assistant_admin',must_change_password:true});return {status:201,role:'assistant_admin',grants:0,mustChange:true};});
 await run('duplicate assistant phone is rejected without second account',async()=>{assert.equal((await req('/admins',ownerCookie,'POST',createBody)).status,409);assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE phone=$1',[createdPhone])).rows[0].n,1);return {status:409,accountRows:1};});
 await run('work monitor is owner-only and excludes foreign sessions and private material',async()=>{assert.equal((await req(target+'/work-monitor')).status,401);assert.equal((await req(target+'/work-monitor',assistantCookie)).status,403);const r=await req(target+'/work-monitor',ownerCookie);assert.equal(r.status,200);assert.equal(r.body.admin.id,assistantId);assert.deepEqual(r.body.sessions.map((x:any)=>x.id),[assistantSession.session.id]);assert.ok(!r.body.sessions.some((x:any)=>x.id===ownerSession.session.id||x.id===deniedSession.session.id));assert.equal(r.body.summary.open_session_count,1);assertNoSecrets(r.body);return {anonymous:401,assistant:403,owner:200,ownedSessions:1,privateFieldsAbsent:true};});
 await run('HTTP trust refuses third device and preserves existing trusted devices',async()=>{const d=await security.registerAdminDeviceAuthoritative({accountId:assistantId,accountKind:'admin',deviceId:'owned-lifecycle-second-device',deviceLabel:'Owned second'});await security.setAdminDeviceTrustAuthoritative({deviceRecordId:d.id,trusted:true,actorAccountId:ownerId});const pending=await security.registerAdminDeviceAuthoritative({accountId:assistantId,accountKind:'admin',deviceId:'owned-lifecycle-third-device',deviceLabel:'Owned third'});const r=await req(target+'/devices/'+pending.id+'/trust',ownerCookie,'POST',{owner_password:ownerPassword});assert.equal(r.status,409);assert.equal(r.body.code,'ADMIN_TRUSTED_DEVICE_LIMIT_REACHED');const ds=await security.listAdminDevicesAuthoritative(assistantId);assert.equal(ds.filter(x=>x.status==='trusted').length,2);assert.equal(ds.find(x=>x.id===pending.id)!.status,'pending');secondSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:'owned-lifecycle-second-device',permissions:['view_merchants']});secondCookie=`${ADMIN_SESSION_COOKIE}=${secondSession.token}`;cookieDevices.set(secondCookie,'owned-lifecycle-second-device');return {status:409,trusted:2,thirdPending:true};});
 await run('logout-all rejects assistant actor and owner target',async()=>{assert.equal((await req(target+'/logout-all',assistantCookie,'POST')).status,403);assert.equal((await req('/admins/'+ownerId+'/logout-all',ownerCookie,'POST')).status,404);assert.equal(await sessionStatus(ownerSession.session.id),'active');return {assistant:403,ownerTarget:404,ownerActive:true};});
 await run('owner logout-all revokes both assistant devices and preserves other accounts',async()=>{const r=await req(target+'/logout-all',ownerCookie,'POST');assert.equal(r.status,200);assert.equal(r.body.revoked_count,2);for(const x of [assistantSession,secondSession])assert.equal(await sessionStatus(x.session.id),'revoked');for(const c of [assistantCookie,secondCookie])assert.equal((await req('/admin/me',c)).status,401);assert.equal((await req('/admin/me',ownerCookie)).status,200);assert.equal((await req('/admin/me',deniedCookie)).status,200);resetSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:devices.assistant,permissions:['view_merchants']});resetCookie=`${ADMIN_SESSION_COOKIE}=${resetSession.token}`;cookieDevices.set(resetCookie,devices.assistant);return {status:200,revoked:2,targetCookies:401,otherAccounts:200};});
 await run('wrong owner reset password leaves hash versions flag and session unchanged',async()=>{const before=await snapshot();assert.equal((await req(target+'/password',ownerCookie,'PATCH',{owner_password:'OwnedWrongPassword9!',temporary_password:temporary,confirm_temporary_password:temporary})).status,401);assert.deepEqual(await snapshot(),before);assert.equal(await sessionStatus(resetSession.session.id),'active');return {status:401,stateUnchanged:true,sessionActive:true};});
 await run('temporary password mismatch leaves account and session unchanged',async()=>{const before=await snapshot();assert.equal((await req(target+'/password',ownerCookie,'PATCH',{owner_password:ownerPassword,temporary_password:temporary,confirm_temporary_password:'OwnedMismatch9!'})).status,400);assert.deepEqual(await snapshot(),before);assert.equal(await sessionStatus(resetSession.session.id),'active');return {status:400,stateUnchanged:true};});
 await run('valid owner password reset changes SQL hash flag versions and revokes cookie',async()=>{const before=await snapshot();const r=await req(target+'/password',ownerCookie,'PATCH',{owner_password:ownerPassword,temporary_password:temporary,confirm_temporary_password:temporary});assert.equal(r.status,200);assert.equal(r.body.reauthentication_required,true);const after=await snapshot();assert.ok(verifyPassword(temporary,after.password_hash));assert.ok(!verifyPassword(assistantPassword,after.password_hash));assert.equal(after.must_change_password,true);for(const k of ['password_version','security_version','session_version'])assert.equal(after[k],before[k]+1);assert.equal(await sessionStatus(resetSession.session.id),'revoked');assert.equal((await req('/admin/me',resetCookie)).status,401);return {status:200,passwordUpdated:true,mustChange:true,versionsIncremented:true,oldHTTP:401};});
 await run('fresh temporary-password session exposes identity but blocks operational access',async()=>{resetSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:devices.assistant,permissions:['view_merchants']});resetCookie=`${ADMIN_SESSION_COOKIE}=${resetSession.token}`;cookieDevices.set(resetCookie,devices.assistant);const me=await req('/admin/me',resetCookie);assert.equal(me.status,200);assert.equal(me.body.admin.must_change_password,true);const blocked=await req('/merchants',resetCookie);assert.equal(blocked.status,403);assert.equal(blocked.body.code,'ADMIN_PASSWORD_CHANGE_REQUIRED');return {identity:200,operations:403,reason:'ADMIN_PASSWORD_CHANGE_REQUIRED'};});
 await run('forced change cannot reuse temporary password and preserves live session',async()=>{const before=await snapshot();const r=await req('/admin/change-password',resetCookie,'POST',{new_password:temporary,confirm_password:temporary});assert.equal(r.status,409);assert.equal(r.body.code,'PASSWORD_UNCHANGED');assert.deepEqual(await snapshot(),before);assert.equal(await sessionStatus(resetSession.session.id),'active');return {status:409,unchanged:true};});
 await run('forced password change clears flag revokes cookie and fresh session regains granted access',async()=>{const r=await req('/admin/change-password',resetCookie,'POST',{new_password:changed,confirm_password:changed});assert.equal(r.status,200);assert.equal(r.body.reauthentication_required,true);const after=await snapshot();assert.ok(verifyPassword(changed,after.password_hash));assert.equal(after.must_change_password,false);assert.equal(await sessionStatus(resetSession.session.id),'revoked');assert.equal((await req('/admin/me',resetCookie)).status,401);const fresh=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:devices.assistant,permissions:['view_merchants']});const c=`${ADMIN_SESSION_COOKIE}=${fresh.token}`;cookieDevices.set(c,devices.assistant);assert.equal((await req('/merchants',c)).status,200);assert.equal((await req('/admin/me',ownerCookie)).status,200);return {status:200,flagCleared:true,oldHTTP:401,freshOperations:200,ownerStillAuthorized:true};});
 const data=process.env.FAWRI_DATA_DIR!;for(const f of ['merchants.json','auth-security.json'])assert.equal(fs.existsSync(path.join(data,f)),false);
 console.log('ADMIN_LIFECYCLE_OBSERVATIONS '+JSON.stringify({cases:observations.length,results:observations,noLegacyJSON:true}));
});
