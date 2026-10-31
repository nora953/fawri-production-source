import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const {Client}=await import('pg');

test('separate authentication LOGIN protects authority data and preserves signup/session/account transactions',{timeout:90000},async t=>{
  const admin=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});await admin.connect();
  const nonce=randomUUID().replaceAll('-',''),roles=[],clients=[],urls=[],phones=[],ids=[],challengeIds=[];
  let mainPool,originalQuery,originalConnect,closeAuth=async()=>{},mainCalls=0;const saved={};
  t.after(()=>cleanupResources([
    ['main pool methods',async()=>{if(mainPool){mainPool.query=originalQuery;mainPool.connect=originalConnect;}}],
    ['auth pool',()=>closeAuth()],['runtime sessions',async()=>{for(const c of clients)await c.end();}],
    ['owned challenges',()=>admin.query('DELETE FROM auth_otp_challenges WHERE id=ANY($1::text[])',[challengeIds])],
    ['owned auth audits',()=>admin.query('DELETE FROM auth_audit_events WHERE actor_account_id IN (SELECT id FROM accounts WHERE phone=ANY($1::text[]))',[phones])],
    ['owned devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id IN (SELECT id FROM accounts WHERE phone=ANY($1::text[]))',[phones])],
    ['owned accounts',()=>admin.query('DELETE FROM accounts WHERE phone=ANY($1::text[])',[phones])],
    ['owned roles',async()=>{for(const r of roles){await admin.query(`DROP OWNED BY ${r}`);await admin.query(`DROP ROLE ${r}`);}}],
    ['main pool',()=>mainPool?.end()],['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],['bootstrap',()=>admin.end()],
  ]));
  for(const[k,v]of Object.entries({NODE_ENV:'test',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',FAWRI_AUTH_SECURITY_SECRET:'synthetic-auth-pool-security-secret-at-least-32-characters',FAWRI_PASSWORD_SALT:'synthetic-auth-pool-salt',FAWRI_AUTH_DATABASE_URL:undefined,FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused_operator@127.0.0.1/unused'})){
    saved[k]=process.env[k];if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
  const {AUTHENTICATION_INTEGRITY_TABLES,AUTHENTICATION_SENSITIVE_COLUMNS,assertProductionDatabaseRlsReady}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  for(const kind of ['tenant','authentication']){
    const r=`auth_${kind}_${nonce}`,password=randomUUID().replaceAll('-','');
    await admin.query(`CREATE ROLE ${r} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);roles.push(r);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
    if(kind==='authentication'){
      await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${r}`);
      await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${AUTHENTICATION_INTEGRITY_TABLES.join(',')} TO ${r}`);
      await admin.query(`GRANT SELECT,INSERT,UPDATE ON merchants TO ${r}`);
      await admin.query(`GRANT SELECT,INSERT,UPDATE ON merchant_settings TO ${r}`);
    }
    const url=new URL(process.env.DATABASE_URL);url.username=r;url.password=password;url.search='';urls.push(url.toString());
    const c=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});clients.push(c);await c.connect();
    const identity=(await c.query(`SELECT current_user AS active,session_user AS login,rolsuper,rolbypassrls,rolcreaterole,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner FROM pg_roles r WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(identity,{active:r,login:r,rolsuper:false,rolbypassrls:false,rolcreaterole:false,member:false,owner:false});
    assert.equal((await c.query("SELECT has_table_privilege(current_user,'public.database_admin_access_audits','SELECT,INSERT,UPDATE,DELETE') AS allowed")).rows[0].allowed,false);
  }
  process.env.FAWRI_AUTH_DATABASE_URL=urls[1];
  await assert.doesNotReject(()=>assertProductionDatabaseRlsReady(process.env,clients[0]));
  await assert.rejects(()=>assertProductionDatabaseRlsReady(process.env,clients[1]),{code:'PRODUCTION_DATABASE_OPERATOR_AUTHORITY_REACHABLE'});
  ({pool:mainPool}=await import('@workspace/db'));originalQuery=mainPool.query;originalConnect=mainPool.connect;
  mainPool.query=async()=>{mainCalls++;throw Error('authentication borrowed primary query');};mainPool.connect=async()=>{mainCalls++;throw Error('authentication borrowed primary lease');};
  const authority=await import('../src/services/authenticationPostgresAuthority.ts');closeAuth=authority.closeAuthenticationPool;
  const merchants=await import('../src/services/postgresMerchantAccountAuthority.ts'),admins=await import('../src/services/postgresAdminAccountAuthority.ts');
  const {authPostgresSessionAuthority:sessions}=await import('../src/services/authPostgresSessionAuthority.ts');
  const otp=await import('../src/services/postgresMerchantAuthSecurityAuthority.ts');
  const phone=()=>{const value=`+198${randomInt(100000000,999999999)}`;phones.push(value);return value;};
  let merchant,assistant,issued,rotated;
  await t.test('tenant cannot call auth authority, forge actor GUCs or activate auth role',async()=>{
    await clients[0].query("SELECT set_config('fawri.admin_account_id','forged',false),set_config('fawri.admin_audit_id','forged',false)");
    await assert.rejects(()=>clients[0].query('SELECT public.fawri_authentication_runtime()'),{code:'42501'});
    await assert.rejects(()=>clients[0].query(`SET ROLE ${roles[1]}`),{code:'42501'});
  });
  await t.test('real signup and phone lookup use auth LOGIN without primary pool access',async()=>{
    const p=phone();merchant=await merchants.upsertPendingMerchantAuthoritative({phone:p,passwordHash:'synthetic',ownerName:'Synthetic',storeName:'Synthetic',activityType:'retail',language:'ar'});ids.push(merchant.account.id);
    await merchants.markMerchantOtpVerifiedAuthoritative(merchant.account.id);
    const found=await merchants.findMerchantByPhoneAuthoritative(p);assert.equal(found.account.id,merchant.account.id);assert.equal(mainCalls,0);
  });
  await t.test('merchant authentication reads protected rows without tenant GUC authority',async()=>{
    await admin.query('INSERT INTO merchant_settings(merchant_id) VALUES($1)',[merchant.account.id]);
    const actual=await authority.withMerchantAuthenticationTransaction(merchant.account.id,async client=>{
      const identity=(await client.query("SELECT session_user AS login,current_user AS active,nullif(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0];
      assert.deepEqual(identity,{login:roles[1],active:roles[1],tenant:null});
      return (await client.query('SELECT merchant_id FROM merchant_settings WHERE merchant_id=$1',[merchant.account.id])).rows;
    });
    assert.deepEqual(actual,[{merchant_id:merchant.account.id}]);
    for(const value of ['', 'x'.repeat(201)])await assert.rejects(()=>authority.withMerchantAuthenticationTransaction(value,async()=>assert.fail('invalid merchant callback executed')),/AUTHENTICATION_TENANT_INVALID/);
    assert.equal(mainCalls,0);
  });
  await t.test('OTP issue and verify preserve one-time authority through private auth role',async()=>{
    const input={target:merchant.account.phone,purpose:'signup',ip:'127.0.0.21'};
    const challenge=await otp.issueMerchantOtpChallengeAuthoritative(input);challengeIds.push(challenge.challengeId);
    assert.equal(await otp.verifyMerchantOtpChallengeAuthoritative({...input,challengeId:challenge.challengeId,code:challenge.code}),'verified');
    assert.equal(await otp.verifyMerchantOtpChallengeAuthoritative({...input,challengeId:challenge.challengeId,code:challenge.code}),'used');
  });
  await t.test('session issuance, validation, rotation and revocation remain functional',async()=>{
    issued=await sessions.issueSession({accountId:merchant.account.id,accountKind:'merchant',tenantId:merchant.account.id,deviceId:'synthetic-auth-device',deviceLabel:'Synthetic'});
    const input={token:issued.token,expectedKind:'merchant',deviceId:'synthetic-auth-device'};
    assert.ok(await sessions.validateSession(input));
    await admin.query("UPDATE account_sessions SET rotate_after=created_at+interval '1 millisecond' WHERE id=$1",[issued.session.id]);
    rotated=await sessions.rotateSession(input);assert.ok(rotated);assert.notEqual(rotated.token,issued.token);
    assert.equal(await sessions.validateSession(input),null);
    assert.ok(await sessions.validateSession({...input,token:rotated.token}));
    assert.equal(await sessions.revokeSession(rotated.token,'merchant','manual_revocation'),true);
    assert.equal(await sessions.validateSession({...input,token:rotated.token}),null);
  });
  await t.test('admin creation, permission/password/profile changes use same trusted boundary',async()=>{
    assistant=await admins.createAssistantAdminAuthoritative({phone:phone(),ownerName:'Synthetic',passwordHash:'synthetic',language:'ar'});ids.push(assistant.account.id);
    assert.equal(await admins.setAssistantPermissionsAuthoritative(assistant.account.id,['manage_subscriptions']),true);
    assert.equal(await admins.updateAdminPasswordAuthoritative(assistant.account.id,'synthetic-replaced',{mustChangePassword:false}),true);
    const found=await admins.findAdminByPhoneAuthoritative(assistant.account.phone);assert.deepEqual(found.adminProfile.permissions,['manage_subscriptions']);assert.equal(found.adminProfile.mustChangePassword,false);
    assert.equal(await admins.setAdminEnabledAuthoritative(assistant.account.id,false),true);
    assert.equal((await admins.findAdminByIdAuthoritative(assistant.account.id)).account.enabled,false);
    assert.equal(await admins.setAdminEnabledAuthoritative(assistant.account.id,true),true);
  });
  await t.test('tenant cannot rewrite credentials, permissions, sessions, devices, OTPs or audit rows',async()=>{
    for(const execute of [
      ()=>clients[0].query('UPDATE accounts SET password_hash=$2 WHERE id=$1',[assistant.account.id,'forged']),
      ()=>clients[0].query("UPDATE admin_profiles SET role='owner_admin' WHERE id=$1",[assistant.account.id]),
      ()=>clients[0].query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[assistant.account.id]),
      ()=>clients[0].query('UPDATE account_sessions SET account_id=$1 WHERE id=$2',[assistant.account.id,issued.session.id]),
      ()=>clients[0].query("UPDATE trusted_devices SET status='trusted' WHERE account_id=$1",[assistant.account.id]),
      ()=>clients[0].query('UPDATE auth_otp_challenges SET used_at=NULL WHERE id=$1',[challengeIds[0]]),
      ...['SELECT id FROM database_admin_access_audits','INSERT INTO database_admin_access_audits(id) VALUES(\'forged\')','UPDATE database_admin_access_audits SET reason_code=\'forged\'','DELETE FROM database_admin_access_audits'].map(sql=>()=>clients[0].query(sql)),
    ])await assert.rejects(execute,{code:'42501'});
  });
  await t.test('mixed account and merchant updates roll back together on failure',async()=>{
    const before=(await admin.query('SELECT a.state,m.store_name FROM accounts a JOIN merchants m ON m.account_id=a.id WHERE a.id=$1',[merchant.account.id])).rows[0];
    await assert.rejects(()=>authority.withMerchantAuthenticationTransaction(merchant.account.id,async client=>{
      assert.equal((await client.query("SELECT nullif(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
      await client.query("UPDATE accounts SET state='suspended' WHERE id=$1",[merchant.account.id]);
      await client.query("UPDATE merchants SET store_name='rolled-back' WHERE id=$1",[merchant.account.id]);throw Error('synthetic rollback');
    }),{message:'synthetic rollback'});
    assert.deepEqual((await admin.query('SELECT a.state,m.store_name FROM accounts a JOIN merchants m ON m.account_id=a.id WHERE a.id=$1',[merchant.account.id])).rows[0],before);
  });
  await t.test('ordinary account identity reads remain usable without credential access',async()=>{
    await admin.query(`GRANT SELECT(id,phone,state) ON public.accounts TO ${roles[0]}`);
    try {
      const row=(await clients[0].query('SELECT id,phone,state FROM public.accounts WHERE id=$1',[merchant.account.id])).rows[0];
      assert.equal(row.id,merchant.account.id);assert.equal(row.phone,merchant.account.phone);assert.equal(row.state,'active');
      await assert.doesNotReject(()=>assertProductionDatabaseRlsReady(process.env,clients[0]));
      for(const {table_name,column_name} of AUTHENTICATION_SENSITIVE_COLUMNS)
        await assert.rejects(()=>clients[0].query(`SELECT ${column_name} FROM public.${table_name} LIMIT 1`),{code:'42501'});
    } finally { await admin.query(`REVOKE SELECT(id,phone,state) ON public.accounts FROM ${roles[0]}`); }
  });
  const readRole=`auth_read_${nonce}`;
  await admin.query(`CREATE ROLE ${readRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);roles.push(readRole);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${readRole}`);
  for(const {table_name,column_name} of AUTHENTICATION_SENSITIVE_COLUMNS) {
    for(const mode of ['direct','public','inherit-only','set-reachable','unreachable']) {
      await t.test(`sensitive read ${table_name}.${column_name}: ${mode} grant and revoke on actual LOGIN`,async()=>{
        const grantee=mode==='direct'?roles[0]:mode==='public'?'PUBLIC':readRole;
        const sql=`SELECT ${column_name} FROM public.${table_name} LIMIT 1`;
        await assert.rejects(()=>clients[0].query(sql),{code:'42501'});
        try {
          await admin.query(`GRANT SELECT(${column_name}) ON public.${table_name} TO ${grantee}`);
          if(!['direct','public'].includes(mode))await admin.query(`GRANT ${readRole} TO ${roles[0]} WITH INHERIT ${mode==='inherit-only'?'TRUE':'FALSE'}, SET ${mode==='set-reachable'?'TRUE':'FALSE'}`);
          const identity=(await clients[0].query('SELECT session_user AS login,current_user AS active')).rows[0];
          assert.deepEqual(identity,{login:roles[0],active:roles[0]});
          if(mode==='unreachable') {
            await assert.doesNotReject(()=>assertProductionDatabaseRlsReady(process.env,clients[0]));
            await assert.rejects(()=>clients[0].query(sql),{code:'42501'});
            await assert.rejects(()=>clients[0].query(`SET ROLE ${readRole}`),{code:'42501'});
          } else {
            await assert.rejects(()=>assertProductionDatabaseRlsReady(process.env,clients[0]),{code:'PRODUCTION_AUTH_SENSITIVE_READ_AUTHORITY_REACHABLE'});
            if(mode==='set-reachable') {
              await assert.rejects(()=>clients[0].query(sql),{code:'42501'});
              await clients[0].query(`SET ROLE ${readRole}`);
            }
            await assert.doesNotReject(()=>clients[0].query(sql));
            // A restricted effective role cannot hide the original LOGIN's ACL.
            if(mode==='direct') {
              await admin.query(`GRANT ${readRole} TO ${roles[0]} WITH INHERIT FALSE, SET TRUE`);
              await clients[0].query(`SET ROLE ${readRole}`);
              await assert.rejects(()=>clients[0].query(sql),{code:'42501'});
              await assert.rejects(()=>assertProductionDatabaseRlsReady(process.env,clients[0]),{code:'PRODUCTION_AUTH_SENSITIVE_READ_AUTHORITY_REACHABLE'});
            }
          }
        } finally {
          await clients[0].query('RESET ROLE');
          if(mode!=='public')await admin.query(`REVOKE ${readRole} FROM ${roles[0]}`);
          await admin.query(`REVOKE SELECT(${column_name}) ON public.${table_name} FROM ${grantee}`);
        }
        await assert.rejects(()=>clients[0].query(sql),{code:'42501'});
        await assert.doesNotReject(()=>assertProductionDatabaseRlsReady(process.env,clients[0]));
      });
    }
  }
  await t.test('table SELECT and missing sensitive columns fail readiness without weakening auth',async()=>{
    await admin.query(`GRANT SELECT ON public.accounts TO ${roles[0]}`);
    try { await assert.rejects(()=>assertProductionDatabaseRlsReady(process.env,clients[0]),{code:'PRODUCTION_AUTH_SENSITIVE_READ_AUTHORITY_REACHABLE'}); }
    finally { await admin.query(`REVOKE SELECT ON public.accounts FROM ${roles[0]}`); }
    await admin.query('ALTER TABLE public.accounts RENAME COLUMN password_hash TO password_hash_readiness_probe');
    try { await assert.rejects(()=>assertProductionDatabaseRlsReady(process.env,clients[0]),{code:'PRODUCTION_AUTH_SENSITIVE_COLUMNS_REQUIRED'}); }
    finally { await admin.query('ALTER TABLE public.accounts RENAME COLUMN password_hash_readiness_probe TO password_hash'); }
    assert.equal((await merchants.findMerchantByPhoneAuthoritative(merchant.account.phone)).account.id,merchant.account.id);
    await assert.doesNotReject(()=>assertProductionDatabaseRlsReady(process.env,clients[0]));
    assert.equal(mainCalls,0);
  });
  await t.test('legacy broad fixture SELECT is narrowed without expanding existing ordinary grants',async()=>{
    const {restrictTenantAuthenticationPrivileges}=await import('./helpers/disposable-authentication-role.mjs');
    await admin.query(`GRANT SELECT ON public.accounts,public.account_sessions,public.auth_otp_challenges,public.trusted_devices TO ${roles[0]}`);
    await restrictTenantAuthenticationPrivileges(admin,roles[0]);
    for(const {table_name,column_name} of AUTHENTICATION_SENSITIVE_COLUMNS)
      await assert.rejects(()=>clients[0].query(`SELECT ${column_name} FROM public.${table_name} LIMIT 1`),{code:'42501'});
    assert.equal((await clients[0].query('SELECT id,phone,state FROM public.accounts WHERE id=$1',[merchant.account.id])).rows[0].id,merchant.account.id);
    // A second pass must be idempotent and must not create unrelated grants.
    await restrictTenantAuthenticationPrivileges(admin,roles[0]);
    assert.equal((await clients[0].query("SELECT has_column_privilege(current_user,'public.admin_profiles','display_name','SELECT') AS allowed")).rows[0].allowed,false);
    await assert.doesNotReject(()=>assertProductionDatabaseRlsReady(process.env,clients[0]));
    assert.equal((await merchants.findMerchantByPhoneAuthoritative(merchant.account.phone)).account.id,merchant.account.id);
  });
  await t.test('marker revocation, missing auth URL and tenant URL fail closed in production',async()=>{
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${roles[1]}`);
    try{await assert.rejects(()=>admins.findAdminByIdAuthoritative(assistant.account.id),{code:'AUTH_DATABASE_IDENTITY_INVALID'});}finally{await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${roles[1]}`);}
    await closeAuth();delete process.env.FAWRI_AUTH_DATABASE_URL;
    await assert.rejects(()=>admins.findAdminByIdAuthoritative(assistant.account.id),{code:'AUTH_DATABASE_REQUIRED'});
    process.env.FAWRI_AUTH_DATABASE_URL=urls[0];await assert.rejects(()=>admins.findAdminByIdAuthoritative(assistant.account.id),{code:'AUTH_DATABASE_IDENTITY_INVALID'});
    assert.equal(mainCalls,0);await closeAuth();process.env.FAWRI_AUTH_DATABASE_URL=urls[1];
  });
  console.log('P0_AUTHENTICATION_POOL_PROOF '+JSON.stringify({directRestrictedLogins:2,sensitiveColumns:AUTHENTICATION_SENSITIVE_COLUMNS.length,sensitiveReadAclCases:AUTHENTICATION_SENSITIVE_COLUMNS.length*5,sensitiveReadGrantRevokeReadiness:true,ordinaryIdentityReadPreserved:true,missingSensitiveColumnRejected:true,legacyFixtureSelectNarrowed:true,tenantAuthMutationsDenied:true,tenantAuditCrudDenied:true,trustedAuthWithoutTenantGuc:true,signupAndLookup:true,otpSingleUse:true,sessionIssueValidateRotateRevoke:true,adminPermissionPasswordStateChanges:true,mixedTransactionRollback:true,primaryPoolCalls:mainCalls,productionFallbackDenied:true,hostedCertified:false,releaseAccepted:false}));
});
