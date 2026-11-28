# P0 migration runner safety review — 2026-10-18

Reviewed `lib/db/scripts/smoke-migration.mjs` and `lib/db/scripts/lib/migration-sql-order.mjs` on audit branch.

The existing smoke runner requires `FAWRI_ALLOW_MIGRATION_SMOKE=1`, connection hostname `localhost` or `127.0.0.1`, and database name `fawri_ci`. It additionally asserts the target public schema is empty before migration, applies migrations twice to test idempotent no-op behavior, checks schema and critical foreign keys against committed expectations, and verifies journal row count. It is intentionally **not** an isolated Neon branch migration runner. Do not bypass these guards or point this script at a hosted database.

The dependency-order stabilizer copies migrations into a temporary directory, reorders necessary UNIQUE constraints ahead of matching foreign keys, and checks that the statement multiset is unchanged. It does not by itself establish equivalence of migration hashes in a preexisting hosted Drizzle journal, so a separate branch-pinned migration acceptance procedure is required.

Next implementation work: a dedicated hosted-isolated-branch preflight with explicit branch ID and database identity verification, journal timestamp/hash checks, schema/function owner checks, and a reviewed application/rollback plan. Existing Railway environment named production must not be used for migration experiments. No code or database changes made in this review. P0 NO-GO.
