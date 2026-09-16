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
export const db = drizzle(pool, { schema });

export * from "./schema";
