declare module "@workspace/db" {
  // The driver and its declarations belong to @workspace/db. API services use
  // this typed factory without importing an untyped second driver boundary.
  export function createPostgresPool(
    connectionString: string,
    options?: { max?: number; connectionTimeoutMillis?: number },
  ): typeof pool & { end(): Promise<void> };
  export const pool: {
    query(
      sql: string,
      values?: unknown[],
    ): Promise<{ rows: Record<string, unknown>[] }>;
    connect(): Promise<{
      query(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }>;
      release(): void;
    }>;
  };
}
