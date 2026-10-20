import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableAuthenticationRole,restrictTenantAuthenticationPrivileges} from './disposable-authentication-role.mjs';
import {cleanupResources} from './cleanup-resources.mjs';

// Bootstrap SQL is exclusive to fixture setup/inspection/cleanup. Application
// services import @workspace/db only after its actual LOGIN URL is installed.
export async function createDisposableKnowledgeRuntime() {
  await assertDisposablePostgres();
  const {Pool}=await import('pg');
  const originalUrl=process.env.DATABASE_URL,originalAuthUrl=process.env.FAWRI_AUTH_DATABASE_URL;
  const admin=new Pool({connectionString:originalUrl,connectionTimeoutMillis:5000});
  const role='knowledge_app_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
  let roleCreated=false,authFixture,runtimePool;
  const dispose=()=>cleanupResources([
    ['authentication pool',async()=>{const {closeAuthenticationPool}=await import('../../src/services/authenticationPostgresAuthority.ts');await closeAuthenticationPool();}],
    ['runtime pool',()=>runtimePool?.end()],
    ['authentication role',()=>authFixture?.dispose()],
    ['runtime grants',()=>roleCreated?admin.query(`DROP OWNED BY ${role}`):undefined],
    ['runtime role',()=>roleCreated?admin.query(`DROP ROLE ${role}`):undefined],
    ['bootstrap pool',()=>admin.end()],
    ['environment',()=>{process.env.DATABASE_URL=originalUrl;if(originalAuthUrl===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=originalAuthUrl;}],
  ]);
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);roleCreated=true;
    await admin.query(`GRANT USAGE ON SCHEMA public,fawri_security TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO ${role}`);
    await restrictTenantAuthenticationPrivileges(admin,role);
    authFixture=await createDisposableAuthenticationRole(admin,originalUrl);
    const url=new URL(originalUrl);url.username=role;url.password=password;url.search='';
    process.env.DATABASE_URL=url.toString();process.env.FAWRI_AUTH_DATABASE_URL=authFixture.url;
    runtimePool=(await import('@workspace/db')).pool;
    assert.deepEqual((await runtimePool.query('SELECT session_user::text AS login,current_user::text AS active')).rows[0],{login:role,active:role});
    return {admin,runtimePool,role,authRole:authFixture.role,dispose};
  } catch(error) {await dispose();throw error;}
}
