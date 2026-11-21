## Session and receipt RLS readiness accepted — 2026-10-15

Draft#550 / fix/p0-provider-receipt-order-discovery-20261015, tested source `92ad7bbef94bda674194205220975d0220190856`: **25/25 workflows SUCCESS**. Isolated `38723072880` / job `116382166372`, checkout `8b9eaca442f46c605aabb85fee59d25a32707f18`: **329 PASS / 0 FAIL / 0 SKIP**,55unique/57invocations including parents/repeated runtimes. RLS25PASS; knowledge and deletion each1PASS using direct restricted LOGIN connections with current_user=session_user. Production gate checks current and session role superuser/BYPASSRLS/protected-table ownership; the protected inventory includes the global receipt inbox and an independent migration inventory test. Local unit8/0. Fullrestore/cleanupPASS, unchanged34migrations/95tables/45policies/9functions/fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Exact evidence: evidence/P0_SESSION_RLS_READINESS_RESULTS_20261015.json; report SEQ_377_P0_RLS_RESTORE_ADMIN_SYNC_READINESS_20261014.md. Current commands and remaining gates in WORK_HANDOFF. Historical85%/15% unmeasured; releaseNO-GO. Earlier pending headings below are superseded only by this accepted source.

Source9f544274 remains a recorded failed integration: isolated38685444022/job116259113377327PASS/2FAIL/0SKIP, RLS25PASS. Knowledge and deletion fixtures authenticated as administrator and then SET ROLE; new session guard correctly rejected both. Foundation38685443941/job116259113025 also failed knowledge after RLS25PASS. Corrected fixtures authenticate as per-run synthetic restricted LOGIN roles; separate administrator pool handles fixture setup/cleanup. No weakening of the production guard or tenant assertions.

Publishing incident: intermediatefeeb37f2 accidentally created a3-file tree because the base-tree reference was absent after ephemeral orchestration state was lost. It had no workflow files, so no CI run was observed. Restored92ad7bbe contains all2213source files and exactly matches intended local tree9d92e19f03892e865dcc75fab0060604059ed6c8; relative to9f only the2fixturefiles and handoff differ. No main or hosted change occurred. History is retained. Publication requirement for resumption: never accept an undefined/empty base_tree_sha for edits to this repository; obtain explicit live base SHA, validate every40-hex SHA and compare created tree with complete local intended tree BEFORE ref update.

No tests are running at this checkpoint. The final documentation checkpoint uses [skip ci], with tested code fixed at92ad7bbe above. Resume from remote, since local synthetic commit IDs can differ:

```sh
git fetch origin fix/p0-provider-receipt-order-discovery-20261015
git switch --detach FETCH_HEAD
# Only the owned, attested disposable Docker runner; never hosted:
bash scripts/run-isolated-postgres-audit.sh tenant
```

Next exact safe unit: assess and test SET-reachable privileged-role/capability-owner readiness configurations not certified by the current direct session-attribute checks. Use isolated fixture roles and preserve all current negative/positive assertions; do not change hosted grants. Additional provider mapping-change concurrency after discovery/admission remainsNOTRUN after prior delegated content flag. Do not claim those races or every role-reachability configuration passed. Hosted owner/RLS/EXECUTE/provider acceptance, deployment gating/storage and ownership/retention-duration/privileged-deletion policy remainOPEN. Railway/Neon/main were not mutated. No main merge, deployment, hosted migration/grant/secret change or real payment is authorized. Do not repeat accepted329 tests without affected source or a new distinct case.

## Active session identity readiness hardening — CI pending, 2026-10-15

Active Draft#550 / fix/p0-provider-receipt-order-discovery-20261015. Separate root cause: readiness checked current_user only; a privileged session_user can remain behind SET ROLE. New local unit reproduced7PASS/1FAIL (missing rejection), repaired8/0; TypeScript/diffPASS. New code separately checks session role superuser/BYPASSRLS/protected-table ownership. New disposable cases reject bootstrap-superuser session behind restricted current role, and independently test non-superuser session roles with BYPASSRLS or receipt-table ownership; RESET ROLE is observed to restore unsafe RLS state, all fixture DDL rolls back. Existing normal acceptance fixtures now set both current/session identities to the restricted role with SET SESSION AUTHORIZATION, preserving original ownership membership cases. Actual new SQL/CI NOT RUN until publication; do not count previous326PASS as this source's acceptance.

Next: inspect new CI/source, exact session-role SQL outcomes, fullrestore/cleanup and all workflows; record results. Resume git fetch origin fix/p0-provider-receipt-order-discovery-20261015; git switch --detach FETCH_HEAD. Owned runner only: bash scripts/run-isolated-postgres-audit.sh tenant. Prior provider mapping-change concurrency remainsNOTRUN after delegated content flag; no bypass of that block is attempted here. Hosted owner/grants/provider/storage/deployment and ownership/retention policy remainOPEN; historical85%/15% unmeasured, releaseNO-GO. No main merge/deploy/hosted writes. PostgreSQL rationale: https://www.postgresql.org/docs/17/sql-set-role.html and https://www.postgresql.org/docs/17/role-attributes.html . This is bounded startup/session-readiness hardening, not certification of actual hosted credentials or every reachable privileged-role configuration.

## Receipt inbox RLS readiness accepted — 2026-10-15

Draft#550 source `e1b31378ff7acc3ead9850db2eb418dee90b31c7`: **25/25 workflows SUCCESS**. Isolated run `38684893840`, job `116257386044`, checkout `2f4abef901f29cb9295800f80ae0e5b25472abfa`: **326 PASS / 0 FAIL / 0 SKIP**,55unique/57invocations (parents/repeated runtimes included). RLS suite22/0/0 includes two new global inbox drift cases. Independent migration-inventory unit baseline6/1 identified only verified_provider_payment_receipts missing; repaired7/0. Runtime protected-table inventory now covers the capability-only inbox alongside tenant tables, while keeping legacy field/error IDs compatible. No policy/migration/grant changes. Fullrestore/ownedcleanupPASS:34migrations/95tables/45policies/9functions, unchanged fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Evidence: evidence/P0_RECEIPT_INBOX_RLS_READINESS_RESULTS_20261015.json.

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
