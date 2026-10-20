import {
  operationalDatabasePool,
  OperationalPostgresAuthorityError,
  withOperationalTransaction,
  type OperationalDatabasePool,
  type OperationalTransactionClient,
} from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";

export const OPERATOR_DIRECTORY_DATABASE_ENV = "FAWRI_OPERATOR_DATABASE_URL";
type OwnedPool = OperationalDatabasePool & { end(): Promise<void> };

function unavailable(code: string): never {
  throw new OperationalPostgresAuthorityError(code, "operator database authority is unavailable");
}

// Only server configuration selects this pool. It never accepts request actors,
// tenant IDs or credentials. Production cannot fall back to the tenant pool.
export function createOperatorDirectoryAuthority(options: {
  env?: NodeJS.ProcessEnv;
  makePool?: (url: string) => Promise<OwnedPool>;
  sharedPool?: () => Promise<OperationalDatabasePool>;
} = {}) {
  const env = options.env ?? process.env;
  let owned: Promise<OwnedPool> | undefined;
  let configuredUrl: string | undefined;
  async function databasePool(): Promise<OperationalDatabasePool> {
    const url = String(env[OPERATOR_DIRECTORY_DATABASE_ENV] || "").trim();
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
              WHERE n.nspname='public' AND p.proname='fawri_issue_admin_directory_audit'
                AND (pg_has_role(r.oid, p.proowner, 'USAGE') OR pg_has_role(r.oid, p.proowner, 'SET')))
          ) AS safe,
          has_function_privilege(session_user,
            'public.fawri_issue_admin_directory_audit(text,text,text)', 'EXECUTE') AS can_issue
          FROM pg_roles r WHERE r.rolname=session_user`);
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
