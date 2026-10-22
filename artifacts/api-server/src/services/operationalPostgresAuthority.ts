export const OPERATIONAL_POSTGRES_AUTHORITY_ENV =
  "FAWRI_OPERATIONAL_POSTGRES_AUTHORITY";

export type OperationalQueryResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  rows: T[];
  rowCount?: number | null;
};

export type OperationalQueryTarget = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<OperationalQueryResult<T>>;
};

/**
 * Query-only SQL client used by PostgreSQL runtime authorities. The alias keeps
 * authority implementations explicit without granting pool/transaction control.
 */
export type OperationalSqlClient = OperationalQueryTarget;

export type OperationalTransactionClient = OperationalQueryTarget & {
  release(error?: Error | boolean): void;
};

export type OperationalDatabasePool = OperationalQueryTarget & {
  connect(): Promise<OperationalTransactionClient>;
};

export class OperationalPostgresAuthorityError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "OperationalPostgresAuthorityError";
    this.code = code;
    this.status = status;
  }
}

export function operationalPostgresAuthorityRequired(): boolean {
  return process.env[OPERATIONAL_POSTGRES_AUTHORITY_ENV] === "required";
}

export async function operationalDatabasePool(): Promise<OperationalDatabasePool> {
  if (!process.env.DATABASE_URL) {
    throw new OperationalPostgresAuthorityError(
      "OPERATIONAL_POSTGRES_DATABASE_REQUIRED",
      `${OPERATIONAL_POSTGRES_AUTHORITY_ENV}=required requires DATABASE_URL`,
    );
  }
  const module = await import("@workspace/db");
  return module.pool as unknown as OperationalDatabasePool;
}

export async function operationalQueryRows<T extends Record<string, unknown>>(
  target: OperationalQueryTarget,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await target.query<T>(sql, values);
  return result.rows;
}

export async function withOperationalTransaction<T>(
  work: (client: OperationalTransactionClient) => Promise<T>,
  poolOverride?: OperationalDatabasePool,
): Promise<T> {
  const pool = poolOverride ?? await operationalDatabasePool();
  const client = await pool.connect();
  let discardClient = false;
  let transactionStarted = false;
  let commitAttempted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const result = await work(client);
    commitAttempted = true;
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // An unsuccessful BEGIN, COMMIT, or ROLLBACK leaves connection state
    // uncertain. Never return such a connection to the shared pool.
    if (!transactionStarted || commitAttempted) discardClient = true;
    try {
      await client.query("ROLLBACK");
    } catch {
      discardClient = true;
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}

export async function withMerchantOperationalTransaction<T>(
  merchantIdValue: string,
  work: (client: OperationalTransactionClient) => Promise<T>,
): Promise<T> {
  const merchantId = String(merchantIdValue || "").trim();
  if (!merchantId || merchantId.length > 200) {
    throw new OperationalPostgresAuthorityError(
      "OPERATIONAL_TENANT_INVALID",
      "merchant tenant is invalid",
      400,
    );
  }
  return withOperationalTransaction(async (client) => {
    // Load after BEGIN to avoid the issuer/authentication module cycle. Only
    // merchant transactions mint; generic and authentication leases never do.
    // The separate issuer must commit before merchant or foreign-key locks.
    const { issueMerchantTransactionScope } = await import("./tenantTransactionScope");
    await issueMerchantTransactionScope(client, merchantId);
    return work(client);
  });
}
