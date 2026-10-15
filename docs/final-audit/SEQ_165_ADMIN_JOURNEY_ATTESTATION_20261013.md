# SEQ-165 — Global admin journey disposable PostgreSQL attestation root cause (2026-10-13)

Source + actual CI log review. No app code change, no test rerun.

- [Global admin golden journey run 38335320862](https://github.com/nora953/fawri-production-source/actions/runs/38335320862), job 115093972373, FAILED at `tsx --test ./tests/admin-auth-router-postgres.integration.test.ts`, before any app DB import; log: `Disposable PostgreSQL attestation rejected; no application DB import permitted`, test file line 9.
- `.github/workflows/global-admin-golden-journey.yml` starts GitHub Actions `services.postgres` (postgres:16-alpine) and DATABASE_URL localhost fawri_ci; it does not establish `FAWRI_DISPOSABLE_PG_ATTESTATION`, `FAWRI_DISPOSABLE_PG_RUN_ID`, `NODE_ENV=test`, a network-none namespace, or a signed/marked database identity.
- `scripts/lib/disposable-postgres-test-guard.mjs`: requires proof file with run ID, containerId, networkMode none, matching namespace, only loopback interface, exact localhost fawri_ci URL, NODE_ENV=test, and database marker `fawri-disposable:<runId>`. Fail-closed is intentional.
- `artifacts/api-server/tests/admin-auth-router-postgres.integration.test.ts` top-level `await assertDisposablePostgres()` executes before application imports, so this is a **CI orchestration incompatibility**, not proof of a failed admin auth scenario.
- Canonical candidate `ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001` HIGH test-gate blocking, distinct from production app security. No suggestion to disable guard; remediation only after audit complete, should preserve network isolation and attestation.
- Pending verify if other workflows use approved isolated runner and whether the global admin journey can be moved there. Release BLOCKED; ~54%/46% planning estimate unchanged.
