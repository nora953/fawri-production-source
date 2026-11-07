import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";
import { assertTenantScopeSession } from "./tenantScopePostgresBoundary";
import type { OperationalDatabasePool, OperationalQueryTarget, OperationalTransactionClient } from "./operationalPostgresAuthority";

export const AUTHENTICATION_DATABASE_ENV = "FAWRI_AUTH_DATABASE_URL";
const authority = createOperatorDirectoryAuthority({ capability: "authentication" });
export const withAuthenticationTransaction = authority.transaction;
export const closeAuthenticationPool = authority.close;

// Every query uses an identity-checked transaction; no raw unvalidated lease is
// exposed. Mixed account/merchant writes must share withAuthenticationTransaction.
const facade: OperationalDatabasePool = {
  query: (sql, values) => authority.transaction(client => client.query(sql, values)),
  async connect(): Promise<OperationalTransactionClient> {
    throw new Error("use withAuthenticationTransaction for authentication leases");
  },
};
export async function authenticationDatabasePool(): Promise<OperationalDatabasePool> { return facade; }
export async function withMerchantAuthenticationTransaction<T>(merchantId:string,work:(client:OperationalQueryTarget)=>Promise<T>):Promise<T> {
  const tenant=String(merchantId || "").trim();
  if(!tenant || tenant.length>200) throw new Error("AUTHENTICATION_TENANT_INVALID");
  // This trusted authentication LOGIN is authorized by its non-PUBLIC marker,
  // not a tenant GUC. Callers still bind merchant IDs in their SQL predicates.
  return authority.transaction(work);
}


// FIELD002: admission of the real authentication LOGIN is a pre-listener
// requirement, not merely the presence of an auth URL or a tenant RLS result.
// This probe is read-only and runs through the same dedicated, identity-checked
// auth pool used by real login/session issuance.
export type AuthenticationStartupProbe = (
  work: (client: OperationalQueryTarget) => Promise<void>,
) => Promise<void>;

export async function assertProductionAuthenticationDatabaseReady(
  env: NodeJS.ProcessEnv = process.env,
  runProbe?: AuthenticationStartupProbe,
): Promise<void> {
  if (!productionReleaseGateRequired(env)) return;

  const rejected = (): Error & { code: string } =>
    Object.assign(new Error("production authentication database is not ready"), {
      code: "PRODUCTION_AUTH_DATABASE_IDENTITY_NOT_READY",
    });

  try {
    const configured = new URL(String(env.FAWRI_AUTH_DATABASE_URL || "").trim());
    if (!["postgres:", "postgresql:"].includes(configured.protocol)) throw rejected();
    const expectedLogin = decodeURIComponent(configured.username);
    const expectedDatabase = decodeURIComponent(configured.pathname.slice(1));
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(expectedLogin) ||
        !expectedDatabase || !/^[a-zA-Z0-9_]+$/.test(expectedDatabase)) throw rejected();

    const execute: AuthenticationStartupProbe = runProbe ??
      (work => withAuthenticationTransaction(work));
    await execute(async (client) => {
      // The issuer must not own protected objects or reach administrative
      // roles, but must reach the private scope issuer by a bounded GRANT.
      await assertTenantScopeSession(client, true);
      const result = await client.query<{
        login: string; active: string; database_name: string;
        authentication_ready: boolean; issuer_ready: boolean;
        tenant_data_reachable: boolean;
      }>(`SELECT session_user::text AS login, current_user::text AS active,
            current_database()::text AS database_name,
            has_function_privilege(session_user,
              'public.fawri_authentication_runtime()', 'EXECUTE') AS authentication_ready,
            has_function_privilege(session_user,
              'fawri_security.issue_scope(name,integer,bigint,text)', 'EXECUTE') AS issuer_ready,
            EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relkind IN ('r','p')
                AND c.relname IN (
                  'notifications','order_drafts','support_inspection_requests',
                  'merchant_admin_notes','merchant_deletion_requests'
                )
                AND (
                  has_table_privilege(session_user,c.oid,
                    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
                  OR has_any_column_privilege(session_user,c.oid,
                    'SELECT,INSERT,UPDATE,REFERENCES')
                )
            ) AS tenant_data_reachable`);
      const row = result.rows[0];
      if (!row || row.login !== expectedLogin ||
          row.active !== expectedLogin ||
          row.database_name !== expectedDatabase ||
          row.authentication_ready !== true ||
          row.issuer_ready !== true ||
          row.tenant_data_reachable !== false) throw rejected();
    });
  } catch {
    // Never forward database errors, URLs or SQL strings to boot logs.
    throw rejected();
  }
}
