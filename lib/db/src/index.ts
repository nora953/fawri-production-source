import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const configuredDatabaseUrl = String(process.env.DATABASE_URL || "").trim();
const databaseUrl =
  configuredDatabaseUrl ||
  (process.env.NODE_ENV === "test"
    ? "postgresql://fawri_test:fawri_test@127.0.0.1:1/fawri_test"
    : "");

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
function reportConnectionFailure(error: unknown): void {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code) : "";
  // Never emit driver messages, connection URLs or query parameters.
  console.error("POSTGRES_CONNECTION_FAILURE", {
    sqlState: /^[A-Z0-9]{5}$/.test(code) ? code : "unavailable",
  });
}
// A leased pg client can emit an additional connection error after its active
// query rejects. Drain that event so transport loss cannot crash the process;
// query/transaction promises still reject and failed clients are discarded by pg.
pool.on("connect", client => client.on("error", reportConnectionFailure));
pool.on("error", reportConnectionFailure);
export const db = drizzle(pool, { schema });

export * from "./schema";
