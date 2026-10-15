import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to generate the complete schema candidate");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/*.ts",
  out: "./drizzle-complete-candidate",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
