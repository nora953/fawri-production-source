import {randomUUID} from 'node:crypto';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';

export async function restrictTenantAuthenticationPrivileges(admin,role,bootstrapUrl=process.env.DATABASE_URL) {
  await assertDisposablePostgres({...process.env,DATABASE_URL:bootstrapUrl});
  if(!/^[a-z][a-z0-9_]{1,62}$/.test(role))throw Error('invalid disposable role');
  const {AUTHENTICATION_INTEGRITY_TABLES,AUTHENTICATION_SENSITIVE_COLUMNS}=await import('../../src/services/postgresRuntimeRlsSecurity.ts');
  await admin.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON ${AUTHENTICATION_INTEGRITY_TABLES.map(t=>`public.${t}`).join(',')} FROM ${role}`);
  const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
  const tables=[...new Set(AUTHENTICATION_SENSITIVE_COLUMNS.map(c=>c.table_name))];
  for(const table of tables) {
    const sensitive=AUTHENTICATION_SENSITIVE_COLUMNS.filter(c=>c.table_name===table).map(c=>c.column_name);
    // Table SELECT implies every column. Preserve only columns already readable
    // by this fixture role; never expand its original non-credential grants.
    const columns=(await admin.query(`SELECT a.attname,
      has_column_privilege((SELECT oid FROM pg_roles WHERE rolname=$1),c.oid,a.attnum,'SELECT') AS readable
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY a.attnum`,[role,table])).rows;
    const retained=columns.filter(c=>c.readable===true&&!sensitive.includes(c.attname)).map(c=>quote(c.attname));
    await admin.query(`REVOKE SELECT ON public.${table} FROM ${role}`);
    await admin.query(`REVOKE SELECT(${sensitive.map(quote).join(',')}) ON public.${table} FROM ${role}`);
    if(retained.length)await admin.query(`GRANT SELECT(${retained.join(',')}) ON public.${table} TO ${role}`);
  }
  await admin.query(`REVOKE ALL ON public.database_admin_access_audits FROM ${role}`);
}
export async function createDisposableAuthenticationRole(admin,connectionString) {
  await assertDisposablePostgres({...process.env,DATABASE_URL:connectionString});
  const role=`auth_isolated_${randomUUID().replaceAll('-','')}`,password=randomUUID().replaceAll('-','');
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
  try {
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    // Mixed signup/retention/delete fixture only. This is not a hosted grant plan.
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await admin.query(`REVOKE ALL ON public.database_admin_access_audits FROM ${role}`);
    await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${role}`);
    await admin.query(`GRANT USAGE ON SCHEMA fawri_security TO ${role}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO ${role}`);
  } catch(error) {await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);throw error;}
  const url=new URL(connectionString);url.username=role;url.password=password;url.search='';
  return {role,url:url.toString(),async dispose(){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}};
}
