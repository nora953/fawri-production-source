declare module "@workspace/db" {
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
