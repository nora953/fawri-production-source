import {randomUUID} from 'node:crypto';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';

export async function restrictTenantAuthenticationPrivileges(admin,role) {
  await assertDisposablePostgres();
  if(!/^[a-z][a-z0-9_]{1,62}$/.test(role))throw Error('invalid disposable role');
  const {AUTHENTICATION_INTEGRITY_TABLES}=await import('../../src/services/postgresRuntimeRlsSecurity.ts');
  await admin.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON ${AUTHENTICATION_INTEGRITY_TABLES.map(t=>`public.${t}`).join(',')} FROM ${role}`);
  await admin.query(`REVOKE ALL ON public.database_admin_access_audits FROM ${role}`);
}
export async function createDisposableAuthenticationRole(admin,connectionString) {
  await assertDisposablePostgres();
  const role=`auth_isolated_${randomUUID().replaceAll('-','')}`,password=randomUUID().replaceAll('-','');
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
  try {
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    // Mixed signup/retention/delete fixture only. This is not a hosted grant plan.
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await admin.query(`REVOKE ALL ON public.database_admin_access_audits FROM ${role}`);
    await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${role}`);
  } catch(error) {await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);throw error;}
  const url=new URL(connectionString);url.username=role;url.password=password;url.search='';
  return {role,url:url.toString(),async dispose(){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}};
}
