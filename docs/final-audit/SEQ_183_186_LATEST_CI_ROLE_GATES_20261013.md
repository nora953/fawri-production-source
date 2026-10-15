# SEQ-183–186 — current CI role and cashier evidence (2026-10-13)

Inspected GitHub Actions associated with commit c3972baf7058735558e476d0769fd8dbfd4865c4. These are existing CI executions, not tests started by this audit stage.

## SEQ-183 — merchant PostgreSQL HTTP journey
Run 38338290905, job 115103293984 SUCCESS. `global-merchant-postgres-http-journey.integration.test.ts` emitted `AUDIT_SUITE_RESULT` 1 pass, 0 fail under disposable audit. This establishes that specific scripted HTTP journey, not all merchant screens or real providers.

## SEQ-184 — merchant bootstrap/golden journey
Run 38338290967, job 115103294249 SUCCESS. Two disposable bootstrap files: `global-merchant-auth-bootstrap-postgres.integration.test.mjs` and `global-merchant-golden-journey.integration.test.mjs`, each 1 pass, 0 fail. Not equivalent to all role/permission journeys.

## SEQ-185 — cashier isolated subscription
Run 38338290820 has ordinary cashier-subscription job SUCCESS but isolated-cashier-subscription job 115103293509 FAILURE. Actual disposable suite summaries: 13 files, 17 pass, 7 fail (including parent markers). Failing files: `cashier-operator-profit-http-postgres.integration.test.mjs` 1P/3F (existing CASHIER-REPORT-PROFIT-001); `cashier-billing-negative-failure-cases.integration.test.mjs` 2P/4F (existing BILLING-PAID-REPLAY-028 and CASHIER-BILLING-SQL-RECOVERY-001). Other 11 file summaries were green. Do not call subscription feature fully passing.

## SEQ-186 — admin CI and isolated runner status
Global admin golden journey run 38338290440 job 115103292315 FAILURE due `Disposable PostgreSQL attestation rejected; no application DB import permitted`, an existing CI setup incompatibility `ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001`, not a failed application admin auth assertion. Isolated PostgreSQL engineering audit run 38338290411 job 115103292150 was IN_PROGRESS at inspection; no final result claimed. Release BLOCKED.

No app changes or repair plan. These checks add narrow runtime proof while preserving outstanding full role/tenant, billing, restore and production-provider gates. Planning estimate ~54% complete/~46% remaining until a coverage-based recalculation.