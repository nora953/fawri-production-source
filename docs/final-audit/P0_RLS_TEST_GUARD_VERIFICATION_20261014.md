# P0 RLS test guard verification — 2026-10-14

Scope: read-only verification of actual test source, no test execution or production write. Source: `artifacts/api-server/tests/production-postgres-rls-security.integration.test.ts` on audit branch.

## Verified
- Test asserts only that `DATABASE_URL` exists (line 18), then connects to `@workspace/db` pool (line 19).
- Before a disposable-target allowlist assertion in this file, it runs `DROP ROLE IF EXISTS fawri_runtime_rls_probe`, `CREATE ROLE`, and grants (lines 33 onward).
- Further subtests run transactional `ALTER TABLE public.merchant_channels OWNER TO ...` and role grants, with ROLLBACK (lines 120 onward).
- The file has no direct `assertDisposablePostgres` invocation or explicit localhost/database-name allowlist. An external CI or runner guard might exist and has not yet been proven or disproven.
- Historical canonical issues `PG-TEST-GUARD-002 / PG-TEST-GUARD-003` already cover PostgreSQL test safety in `ISSUES.md`. **No new defect ID opened**.

## Disposition
P0 test-harness execution: **BLOCKED pending independent disposable DB attestation and CI command-path inspection**. Do not execute this test on Neon staging or Railway production-named environment. This is confirmation of an existing open risk, not a new product defect and not a successful RLS test.

## Next checks
1. Inspect CI workflow/runner to establish whether an external disposable DB guard executes before importing this test.
2. Provision or identify a dedicated disposable local/CI PostgreSQL target; attest hostname, DB name, role privileges, no customer data, and teardown.
3. Run the exact RLS suite on that target, capture SHA, workflow/job logs and assertions; classify independently from hosted RLS readiness.
