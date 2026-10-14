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
test('current Authv2 device and permission HTTP boundaries on owned SQL',async t=>{
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
 let secondCookie:string,secondSession:any,newCookie:string,newSession:any;
 const secondDevice='owned-assistant-second-device';
 // Fresh-cluster prerequisites recreate the already-proven two-device state; no prior six business cases rerun.
 const d=await security.registerAdminDeviceAuthoritative({accountId:assistantId,accountKind:'admin',deviceId:secondDevice,deviceLabel:'Owned second device'});await security.setAdminDeviceTrustAuthoritative({deviceRecordId:d.id,trusted:true,actorAccountId:ownerId});
 secondSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:secondDevice,permissions:['view_merchants']});secondCookie=`${ADMIN_SESSION_COOKIE}=${secondSession.token}`;cookieDevices.set(secondCookie,secondDevice);
 await security.setAdminDeviceTrustAuthoritative({deviceRecordId:records[assistantId],trusted:false,actorAccountId:ownerId});
 await auth.revokeAllSessions({accountId:assistantId,accountKind:'admin',reason:'device_revoked',deviceHash:(await security.listAdminDevicesAuthoritative(assistantId)).find(x=>x.id===records[assistantId])!.device_hash});
 await run('permission removal revokes live device session and fresh cookie lacks access',async()=>{assert.equal((await req(target+'/permissions',ownerCookie,'PATCH',{permissions:[]})).status,200);assert.equal(await sessionStatus(secondSession.session.id),'revoked');assert.equal((await req('/merchants',secondCookie)).status,401);newSession=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:secondDevice,permissions:[]});newCookie=`${ADMIN_SESSION_COOKIE}=${newSession.token}`;cookieDevices.set(newCookie,secondDevice);assert.equal((await req('/merchants',newCookie)).status,403);assert.equal((await req('/admin/me',newCookie)).status,200);return {oldHTTP:401,newRestrictedHTTP:403,newIdentityHTTP:200};});
 await run('invalid enabled value cannot mutate profile or revoke session',async()=>{assert.equal((await req(target+'/enabled',ownerCookie,'PATCH',{enabled:'false'})).status,400);assert.equal((await pool.query('SELECT enabled FROM admin_profiles WHERE id=$1',[assistantId])).rows[0].enabled,true);assert.equal(await sessionStatus(newSession.session.id),'active');return {status:400,enabled:true,sessionActive:true};});
 await run('disable revokes current cookie and blocks profile access',async()=>{assert.equal((await req(target+'/enabled',ownerCookie,'PATCH',{enabled:false})).status,200);assert.equal((await pool.query('SELECT enabled FROM admin_profiles WHERE id=$1',[assistantId])).rows[0].enabled,false);assert.equal(await sessionStatus(newSession.session.id),'revoked');assert.equal((await req('/admin/me',newCookie)).status,401);return {disabled:true,revoked:true,identityHTTP:401};});
 await run('reenable permits fresh session without reviving revoked cookies',async()=>{assert.equal((await req(target+'/enabled',ownerCookie,'PATCH',{enabled:true})).status,200);assert.equal((await req('/admin/me',newCookie)).status,401);assert.equal((await req('/admin/me',secondCookie)).status,401);const fresh=await auth.issueSession({accountId:assistantId,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:secondDevice,permissions:[]});const freshCookie=`${ADMIN_SESSION_COOKIE}=${fresh.token}`;cookieDevices.set(freshCookie,secondDevice);assert.equal((await req('/admin/me',freshCookie)).status,200);assert.equal((await req('/merchants',freshCookie)).status,403);return {oldCookiesHTTP:401,freshIdentityHTTP:200,freshPermissionsHTTP:403};});
 const data=process.env.FAWRI_DATA_DIR!;for(const f of ['merchants.json','auth-security.json'])assert.equal(fs.existsSync(path.join(data,f)),false);
 console.log('DEVICE_HTTP_OBSERVATIONS '+JSON.stringify({cases:observations.length,results:observations,noLegacyJSON:true}));
});
