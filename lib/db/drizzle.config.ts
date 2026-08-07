import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Keep generation anchored to every schema module so committed migrations
  // cannot silently omit tables that are not re-exported by schema/index.ts.
  schema: path.join(__dirname, "./src/schema/*.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
