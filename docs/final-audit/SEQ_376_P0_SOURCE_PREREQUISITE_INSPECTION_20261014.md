# SEQ-376 — P0 source-level prerequisite inspection (2026-10-14)

**Scope:** Read-only source inspection of four selected test files; **no execution, no database connection, no product acceptance**.

| Source | Observed proof intent | Critical limitation / next proof |
|---|---|---|
| `artifacts/api-server/tests/cashier-billing-negative-failure-cases.integration.test.mjs` | Exercises fake-provider cashier payment expiry/reconciliation, duplicate/replay and concurrent checkout, with SQL assertions. Calls `assertDisposablePostgres()` before pool import and creates disposable trigger fixtures. | Needs safe disposable PostgreSQL, actual test execution/logs and provider-independent callback proof. Do not run against staging or production. |
| `artifacts/api-server/tests/billing-external-checkout-rollback-postgres.integration.test.mjs` | Exercises SaaS/cashier checkout retry after SQL attachment rollback, with synthetic SuperQi sandbox credentials, local RSA keys, stubbed provider `fetch` and SQL trigger faults. | **Provider fetch is mocked**: cannot establish real SuperQi sandbox availability, signing contract, network delivery or reconciliation. Disposable PostgreSQL required. |
| `artifacts/api-server/tests/admin-permissions.integration.test.mjs` | Launches a local compiled API and checks role permission behavior using seeded JSON merchants. | JSON fixture and `/api/healthz` path are not proof of current production PostgreSQL authority, real admin RLS or `/ops/readiness` release gate. Must inspect runtime compatibility before reusing. |
| `artifacts/api-server/tests/cashier-downgrade-grace-postgres.integration.test.ts` | Covers scheduled cashier downgrade, pre-expiry seats and grace; configures 3,900 IQD seat price and seven-day grace. | Test is `skip: !DATABASE_URL`; missing DB means **skip, not pass**. Guard checks disposable DB if URL exists. Need test-run evidence and clock/expiry boundary verification. |

## Audit-only decisions
- These four source files are **candidate P0 checks**, not four accepted test cases; each contains potentially multiple subtests/assertions.
- No test execution has been observed in this SEQ. No defect is confirmed solely from these excerpts; limitations are proof gaps.
- Before any execution, verify disposable DB isolation, expected migration state, CI environment and source/harness SHAs. Do not mutate staging/prod.
- Further work: inspect full source, existing CI run evidence and actual backend auth/RLS/billing/cashier boundaries; create canonical per-assertion case IDs only after extracting declarations.
- Overall denominator **NOT_YET_MEASURABLE**, release **BLOCKED**.
