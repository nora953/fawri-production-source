## 2026-10-15 — production cashier RLS readiness correction

Draft #549 source `36f955e32d0f6f7284b5fcfb850ea117e0c00ee0`. All14observed workflowsSUCCESS; isolated run38681113382/job116245665218:321PASS/0FAIL/0SKIP across54unique/56invocations. Fullrestore/ownedcleanupPASS, unchanged33migrations/95tables/45policies/8functions fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498. Evidence: evidence/P0_CASHIER_RLS_READINESS_RESULTS_20261015.json. Root cause: the production runtime RLS table list predates migration0027 and omitted its seven cashier licensing/billing tables. A restricted role could therefore pass this check while owning one of those tables, or after its RLS was disabled. This finding concerns readiness detection; it does not establish a hosted permission defect.

The fix includes all seven tables in the existing ownership (including inherited/SET ROLE ownership) and missing/disabled-RLS checks. No SQL migration, policy, grant or hosted setting changes. Before repair the extended contract unit suite reproduced5PASS/1FAIL; after repair6PASS/0FAIL. Foundation run `38681113396`, job `116245665263` SUCCESS: real PostgreSQL RLS suite **20PASS/0FAIL/0SKIP**, including14new cases. Each transaction alters one table, observes row_security_active=false under the restricted runtime, verifies the exact failed readiness table/code, rolls back and confirms safe readiness again. The original five ownership-membership scenarios remain intact.

The seven tables are merchant_cashier_subscriptions, cashier_station_seat_assignments, cashier_billing_orders, cashier_billing_events, cashier_entitlement_applications, cashier_entitlement_audit_events and cashier_device_operation_timeline. Disposable runner attestation/teardown remains mandatory; historical source-only findings below are superseded only for the executed guarded paths. Hosted owner/grants and release acceptance remain OPEN. Historical85% is not a new measurement.

# SEQ-377 — P0 RLS, restore, admin, sync and readiness source inspection (2026-10-14)

**Audit only; no tests executed, no DB or deployment touched.** Six source files inspected at branch checkpoint preceding this report.

| Source file (under artifacts/api-server/tests/) | Direct source observation | Required acceptance evidence / gap |
|---|---|---|
| production-postgres-rls-security.integration.test.ts | Requires DATABASE_URL; creates/drops `fawri_runtime_rls_probe`, grants, switches roles and asserts restricted access, RLS readiness and role ownership. | Source excerpt does **not** show a disposable-DB guard before destructive role DDL. **Execution safety gate:** inspect full file and guard orchestration; never run on staging/prod. Need captured restricted-role SQL run. |
| full-schema-restore-postgres.integration.test.mjs | Calls `assertDisposablePostgres()`; requires `FAWRI_AUDIT_RESTORE_PHASE` seed or verify; inspects tables, RLS policies, functions, constraints and ACLs. | Requires actual dump/restore orchestration and both phases with matching evidence; test source alone is not a successful restore. |
| cashier-sync-multidevice-postgres.integration.test.mjs | Explicit disposable DB guard before pool import, fake billing provider, fixture with two cashier seats and stock quantity one. | Requires execution logs and race/replay assertions, plus device/IndexedDB/real network sync proof separately. |
| admin-auth-router-postgres.integration.test.ts | Disposable guard plus explicit localhost/127.0.0.1 and database `fawri_ci` assertions; seeds admin_profiles, checks auth cookies/device headers. | Need actual PostgreSQL-backed HTTP run, authorization negative cases and production restricted-role parity. |
| production-release-readiness.test.ts | Unit tests production/staging mode and fail-closed configuration using synthetic env values. | Does not prove deployed readiness endpoint, live KMS/Meta/provider credentials, runtime secrets or operational alerting. |
| merchant-deletion-tenant-rls.integration.test.mjs | Guard if DATABASE_URL exists; then asserts localhost + `fawri_ci` or `fawri_final_audit`; creates RLS role and synthetic merchant records to exercise deletion. | Requires isolated DB execution and evidence of media/provider cleanup and restricted-role behavior. |

## Safety finding to triage, not a product defect
`production-postgres-rls-security.integration.test.ts` visibly performs `DROP ROLE IF EXISTS` / `CREATE ROLE` and grants, without an explicit disposable guard in the inspected top-level excerpt. This is **a test execution safety gap requiring full-file and CI invocation review**, not proof that the test ran against an unsafe database. Do not execute until verified.

## Next actions
1. Inspect full RLS test and CI invocation for effective disposable guard; if absent, register a test-harness safety issue before execution.
2. Correlate GitHub Actions runs to each source SHA; skipped, mocked and source-only cases remain unaccepted.
3. Inspect backup/restore seed and verify workflow, including external `pg_dump` / `pg_restore` proof.
4. Build distinct P0 cases and missing proof layers from observed assertions, without using file count as denominator.

**Overall coverage NOT_YET_MEASURABLE; release BLOCKED.**
