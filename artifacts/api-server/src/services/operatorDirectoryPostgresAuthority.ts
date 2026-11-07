import {
  operationalDatabasePool,
  OperationalPostgresAuthorityError,
  withOperationalTransaction,
  type OperationalDatabasePool,
  type OperationalQueryTarget,
  type OperationalTransactionClient,
} from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";

export const OPERATOR_DIRECTORY_DATABASE_ENV = "FAWRI_OPERATOR_DATABASE_URL";
export const OPERATOR_DATABASE_CAPABILITIES = {
  authentication: "public.fawri_authentication_runtime()",
  directory: "public.fawri_issue_admin_directory_audit(text,text,text)",
  receiptRead: "public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)",
  receiptReview: "public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)",
  receiptExecution: "public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)",
} as const;
type OwnedPool = OperationalDatabasePool & { end(): Promise<void> };


// Only server configuration selects this pool. It never accepts request actors,
// tenant IDs or credentials. Production cannot fall back to the tenant pool.
export function createOperatorDirectoryAuthority(options: {
  capability?: keyof typeof OPERATOR_DATABASE_CAPABILITIES;
  env?: NodeJS.ProcessEnv;
  makePool?: (url: string) => Promise<OwnedPool>;
  sharedPool?: () => Promise<OperationalDatabasePool>;
} = {}) {
  const auth = options.capability === "authentication";
  const unavailable = (code:string):never => {
    throw new OperationalPostgresAuthorityError(auth ? code.replace("OPERATOR_", "AUTH_") : code,
      auth ? "authentication database authority is unavailable" : "operator database authority is unavailable");
  };
  const env = options.env ?? process.env;
  const selected = options.capability ?? "directory";
  if (!Object.hasOwn(OPERATOR_DATABASE_CAPABILITIES, selected)) unavailable("OPERATOR_DATABASE_CAPABILITY_INVALID");
  const capability = OPERATOR_DATABASE_CAPABILITIES[selected];
  if (!capability) unavailable("OPERATOR_DATABASE_CAPABILITY_INVALID");
  let owned: Promise<OwnedPool> | undefined;
  let configuredUrl: string | undefined;
  async function databasePool(): Promise<OperationalDatabasePool> {
    const url = String(env[auth ? "FAWRI_AUTH_DATABASE_URL" : OPERATOR_DIRECTORY_DATABASE_ENV] || "").trim();
    if (!url) {
      if (productionReleaseGateRequired(env)) unavailable("OPERATOR_DATABASE_REQUIRED");
      return (options.sharedPool ?? operationalDatabasePool)();
    }
    try {
      const parsed = new URL(url);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error();
    } catch { unavailable("OPERATOR_DATABASE_CONFIG_INVALID"); }
    if (configuredUrl && configuredUrl !== url) unavailable("OPERATOR_DATABASE_CONFIG_CHANGED");
    configuredUrl = url;
    if (!owned) {
      owned = (options.makePool ?? (async (connectionString: string) => {
        // Keep driver types and sanitized transport handling in @workspace/db.
        const { createPostgresPool } = await import("@workspace/db");
        return createPostgresPool(connectionString, {
          max: 3, connectionTimeoutMillis: 5000,
        }) as unknown as OwnedPool;
      }))(url);
    }
    return owned;
  }
  async function transaction<T>(work: (client: OperationalTransactionClient) => Promise<T>): Promise<T> {
    const pool = await databasePool();
    return withOperationalTransaction(async client => {
      if (owned) {
        const result = await client.query<{
          login: string; active: string; safe: boolean; can_issue: boolean;
        }>(`SELECT session_user AS login, current_user AS active,
          (NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)
            AND NOT EXISTS (SELECT 1 FROM pg_roles privileged
              WHERE (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole)
                AND (pg_has_role(r.oid, privileged.oid, 'USAGE') OR pg_has_role(r.oid, privileged.oid, 'SET')))
            AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relkind IN ('r','p')
                AND (pg_has_role(r.oid, c.relowner, 'USAGE') OR pg_has_role(r.oid, c.relowner, 'SET')))
            AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.oid=to_regprocedure($1::text)
                AND (pg_has_role(r.oid, p.proowner, 'USAGE') OR pg_has_role(r.oid, p.proowner, 'SET')))
          ) AS safe,
          has_function_privilege(session_user,
            $1::text, 'EXECUTE') AS can_issue
          FROM pg_roles r WHERE r.rolname=session_user`, [capability]);
        const row = result.rows[0];
        if (!row || !row.login || row.login !== row.active || row.safe !== true || row.can_issue !== true) {
          unavailable("OPERATOR_DATABASE_IDENTITY_INVALID");
        }
      }
      return work(client);
    }, pool);
  }
  async function close(): Promise<void> {
    const pending = owned;
    owned = undefined;
    configuredUrl = undefined;
    if (pending) await (await pending).end();
  }
  return { databasePool, transaction, close };
}

const authority = createOperatorDirectoryAuthority();
export const withOperatorDirectoryTransaction = authority.transaction;
export const closeOperatorDirectoryPool = authority.close;


// FIELD002: prove the dedicated operator-directory LOGIN before admitting a
// commercial listener. A configured URL alone cannot certify PostgreSQL grants.
// The real transaction path also checks reachable owner/privileged roles and
// the directory issuer signature. No secrets or raw SQL errors escape startup.
export type OperatorStartupProbe = (
  work: (client: OperationalQueryTarget) => Promise<void>,
) => Promise<void>;

export async function assertProductionOperatorDatabaseReady(
  env: NodeJS.ProcessEnv = process.env,
  runProbe?: OperatorStartupProbe,
): Promise<void> {
  if (!productionReleaseGateRequired(env)) return;
  const deny = () => Object.assign(
    new Error("production operator database is not ready"),
    { code: "PRODUCTION_OPERATOR_DATABASE_IDENTITY_NOT_READY" },
  );
  try {
    const url = new URL(String(env.FAWRI_OPERATOR_DATABASE_URL || "").trim());
    const expectedLogin = decodeURIComponent(url.username);
    const expectedDatabase = decodeURIComponent(url.pathname.slice(1));
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        !/^[a-z_][a-z0-9_]{0,62}$/.test(expectedLogin) ||
        !/^[A-Za-z0-9_]+$/.test(expectedDatabase)) throw deny();
    const execute: OperatorStartupProbe = runProbe ??
      (work => withOperatorDirectoryTransaction(work));
    await execute(async client => {
      const result = await client.query<{
        login: string; active: string; database_name: string;
        directory_ready: boolean; authentication_reachable: boolean;
        scope_issuer_reachable: boolean;
      }>(`SELECT session_user::text AS login, current_user::text AS active,
        current_database()::text AS database_name,
        has_function_privilege(session_user,
          'public.fawri_issue_admin_directory_audit(text,text,text)',
          'EXECUTE') AS directory_ready,
        has_function_privilege(session_user,
          'public.fawri_authentication_runtime()', 'EXECUTE')
          AS authentication_reachable,
        -- Operator is intentionally denied USAGE on fawri_security:
        -- avoid resolving the private function signature under its role.
        -- Catalog OID lookup remains read-only and privilege-specific.
        has_function_privilege(session_user,(
          SELECT p.oid FROM pg_proc p JOIN pg_namespace n
            ON n.oid=p.pronamespace
          WHERE n.nspname='fawri_security' AND p.proname='issue_scope'
            AND p.pronargs=4
            AND p.proargtypes[0]='name'::regtype
            AND p.proargtypes[1]='integer'::regtype
            AND p.proargtypes[2]='bigint'::regtype
            AND p.proargtypes[3]='text'::regtype
        ), 'EXECUTE') AS scope_issuer_reachable`);
      const row = result.rows[0];
      if (!row || row.login !== expectedLogin ||
          row.active !== expectedLogin ||
          row.database_name !== expectedDatabase ||
          row.directory_ready !== true ||
          row.authentication_reachable !== false ||
          row.scope_issuer_reachable !== false) throw deny();
    });
  } catch {
    throw deny();
  }
}
