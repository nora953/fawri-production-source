import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './cleanup-resources.mjs';

// Only owned fixture setup may create the separate directory LOGIN. This is
// not an authentication role and cannot manufacture audit rows via table CRUD.
async function createDirectoryOperator(admin,bootstrapUrl,merchantDirectory) {
  await assertDisposablePostgres({...process.env,DATABASE_URL:bootstrapUrl});
  const role='directory_operator_'+randomUUID().replaceAll('-','');
  const password=randomUUID().replaceAll('-',''),previous=process.env.FAWRI_OPERATOR_DATABASE_URL;
  let created=false;
  const dispose=()=>cleanupResources([
    ['directory pool',async()=>{await (await import('../../src/services/operatorDirectoryPostgresAuthority.ts')).closeOperatorDirectoryPool();}],
    ['directory grants',()=>created?admin.query(`DROP OWNED BY ${role}`):undefined],
    ['directory role',()=>created?admin.query(`DROP ROLE ${role}`):undefined],
    ['operator environment',()=>{if(previous===undefined)delete process.env.FAWRI_OPERATOR_DATABASE_URL;else process.env.FAWRI_OPERATOR_DATABASE_URL=previous;}],
  ]);
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);created=true;
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT ON public.subscriptions TO ${role}`);
    await admin.query(`GRANT SELECT(account_id,role) ON public.admin_profiles TO ${role}`);
    await admin.query(`GRANT SELECT(admin_id,permission) ON public.admin_permissions TO ${role}`);
    if(merchantDirectory){
      await admin.query(`GRANT SELECT(id,phone,kind,state,phone_verified,language,created_at) ON public.accounts TO ${role}`);
      await admin.query(`GRANT SELECT(id,enabled,display_name) ON public.admin_profiles TO ${role}`);
      await admin.query(`GRANT SELECT ON public.merchants TO ${role}`);
    }
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO ${role}`);
    assert.equal((await admin.query("SELECT has_table_privilege($1,'public.database_admin_access_audits','SELECT,INSERT,UPDATE,DELETE') AS authority_crud",[role])).rows[0].authority_crud,false);
    const url=new URL(bootstrapUrl);url.username=role;url.password=password;url.search='';
    process.env.FAWRI_OPERATOR_DATABASE_URL=url.toString();
    return {role,url:url.toString(),dispose};
  } catch(error){await dispose();throw error;}
}

export const createDisposableSubscriptionDirectoryOperator=(admin,url)=>createDirectoryOperator(admin,url,false);
export const createDisposableMerchantDirectoryOperator=(admin,url)=>createDirectoryOperator(admin,url,true);
