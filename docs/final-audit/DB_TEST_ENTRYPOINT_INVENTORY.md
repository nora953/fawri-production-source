# PostgreSQL test entrypoint inventory — source verified

Status: source inspection only, NOT RUN. Ref: main as reviewed 2026-10-11. The database execution plan is `DISPOSABLE_POSTGRES_EXECUTION_PLAN.md`.

| File or command | Observed requirement | Audit finding |
| --- | --- | --- |
| `artifacts/api-server/tests/global-merchant-postgres-http-journey.integration.test.ts` | Requires `DATABASE_URL`, host `localhost`/`127.0.0.1`, DB exactly `fawri_ci` | Direct TS HTTP golden journey; not proven invoked by package.json `test:global-merchant-journey` |
| `artifacts/api-server/tests/merchant-deletion-tenant-rls.integration.test.mjs` | Host `localhost`/`127.0.0.1`, DB `fawri_ci` or `fawri_final_audit`; creates role, synthetic accounts and merchants, then purges one | Must use isolated ephemeral database; localhost is not sufficient proof |
| `artifacts/api-server/tests/meta-webhook-postgres-ingress-cutover.integration.test.ts` | Validates local `fawri_ci` if URL exists; test has `{ skip: !DATABASE_URL }` | An absent URL skips this DB regression; skip must be tracked explicitly |
| `artifacts/api-server/package.json` `test:global-merchant-journey` | Runs build, `global-merchant-auth-bootstrap-postgres.integration.test.mjs`, `global-merchant-golden-journey.integration.test.mjs` | Different entrypoints from the direct `global-merchant-postgres-http-journey.integration.test.ts`; review and run both if independently meaningful |
| `.github/workflows/quality-gates.yml` | API unit test glob excludes `*.integration.test.ts` | Successful quality CI does not establish DB integration coverage |

## Before any DB test execution
Use a disposable local Postgres service container, new schema/role, migration proof and a verified non-tunneled network endpoint. Record test names, exit status, skipped count, logs and exact SHA. Do not point these suites at Neon, Railway, staging or production. No integration tests have been run as part of this audit update.
