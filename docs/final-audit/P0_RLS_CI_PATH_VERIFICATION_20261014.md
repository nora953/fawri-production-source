# P0 RLS CI execution path — 2026-10-14

## Scope
Read-only review of complete GitHub workflow, Docker runner and test launcher on audit branch. No manual database access, deployment or test invocation.

## New verified facts (corrects earlier source-only concern)
- `.github/workflows/audit-isolated-postgres.yml` runs `scripts/disposable-postgres-test-guard.test.mjs` before calling `scripts/run-isolated-postgres-audit.sh`.
- `scripts/run-isolated-postgres-audit.sh` creates a fresh Docker-owned PostgreSQL 16 container with `--network none`, no published ports, a fresh password and disposable attestation; starts a Node container in the PostgreSQL network namespace and cleans containers via trap.
- `scripts/execute-disposable-postgres-audit.mjs` calls `await assertDisposablePostgres()` **before** migration and test dispatch; every selected test runs with `--import ./scripts/lib/disposable-postgres-preload.mjs`.
- `tenant` suite explicitly includes `production-postgres-rls-security.integration.test.ts`. Therefore **the canonical isolated CI route does have an external disposable-target guard**, despite its absence inside the test file.
- Standalone/direct execution of that test file remains **not demonstrated safe**; do not run against Neon or Railway. Existing PG-TEST-GUARD-002/003 remain relevant for alternate invocation coverage, not proof of an unsafe canonical route.

## Observed live CI state
GitHub Actions run [38504687050](https://github.com/nora953/fawri-production-source/actions/runs/38504687050) on audit commit `23c5dc718e4b3ae012664299be50fbf86b1d9893` was **in_progress** at observation. Job 115659368212 showed: install SUCCESS, no-DB fail-closed guard SUCCESS, API build SUCCESS; first 'Run migrations and selected tests with no external network' step FAILURE; cashier step in progress; tenant step pending. Job logs unavailable at observation (GitHub returned BlobNotFound), so **root cause is unknown** and no product failure can be claimed.

## Classification
- Canonical CI test isolation design: SOURCE_CONFIRMED; guard smoke step: CI_STEP_SUCCESS.
- RLS SQL assertions: NOT_YET_OBSERVED; tenant suite pending at observation.
- First priority suite: CI_STEP_FAILURE, reason UNKNOWN; preserve original failure and inspect logs when available.
- No P0 test marked PASS solely from source review.
