# Isolated PostgreSQL audit execution — 2026-10-11

This is a checkpoint, not the final launch report. Actual GitHub Actions evidence; no hosted DB, deployment or real provider credentials.

Source audit commit [0a101ba3](https://github.com/nora953/fawri-production-source/commit/0a101ba3dd1e45df4baee0417b66893cacc82ae7), main d38d29229bed0f9575a98e7026e7819fe363bfd4; checkout synthetic merge 3d8c9fdbaf3ba1434a087978af0b222d5d3908ea.

Primary [run 38171428265](https://github.com/nora953/fawri-production-source/actions/runs/38171428265), job114564672592: four sequential fresh owned Docker network-none instances; all four applied 28 committed migrations. Runtime preflight verifies namespace, database/role/run-marker and loopback. Cleanup step succeeded. 21 entrypoints: Node counts **32 pass / 14 fail / 0 skip**. Counts are assertions reported by Node, not independent engineering tasks; some parent/subtests contribute separately. Failures are mostly fixtures/runner limitations, not proven application defects.

| Suite | Pass | Fail | Skip | Exit |
| --- | --- | --- | --- | --- |
| `global-merchant-auth-bootstrap-postgres.integration.test.mjs` | 1 | 0 | 0 | 0 |
| `global-merchant-golden-journey.integration.test.mjs` | 1 | 0 | 0 | 0 |
| `global-merchant-postgres-http-journey.integration.test.ts` | 1 | 0 | 0 | 0 |
| `merchant-deletion-tenant-rls.integration.test.mjs` | 0 | 1 | 0 | 1 |
| `meta-webhook-postgres-ingress-cutover.integration.test.ts` | 1 | 0 | 0 | 0 |
| `meta-page-directory-restricted-rls.integration.test.mjs` | 0 | 1 | 0 | 1 |
| `cashier-subscription-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `cashier-billing-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `cashier-downgrade-grace-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `cashier-historical-operation-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `cashier-operator-logout-pin-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `cashier-operator-own-history-scope-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `catalog-cashier-compensation-history-postgres.integration.test.ts` | 0 | 1 | 0 | 1 |
| `saas-billing-authority.integration.test.ts` | 0 | 4 | 0 | 1 |
| `superqi-sandbox-billing.integration.test.ts` | 1 | 1 | 0 | 1 |
| `subscription-entitlement-postgres.integration.test.ts` | 2 | 0 | 0 | 0 |
| `merchant-customer-payment-authority-postgres.integration.test.ts` | 11 | 0 | 0 | 0 |
| `production-postgres-rls-security.integration.test.ts` | 6 | 0 | 0 | 0 |
| `knowledge-tenant-rls.integration.test.mjs` | 1 | 0 | 0 | 0 |
| `merchant-management-tenant-rls.integration.test.mjs` | 6 | 0 | 0 | 0 |
| `subscription-reminder-rls.integration.test.mjs` | 1 | 0 | 0 | 0 |

## Failure classification and authorized follow-up

- merchant-deletion-tenant-rls: loader worker reattests after test intentionally switches DATABASE_URL to synthetic restricted role; guard rejects query options. Main preflight already established network isolation. Restrict preload attestation to main thread; loader workers share this namespace. Must rerun; no deletion/RLS failure proven by this failed test.
- Meta restricted-role and seven cashier files: legacy dataPaths import tries mkdir beneath read-only checkout when FAWRI_DATA_DIR absent. Add per-suite writable temporary directory, keep source readonly. No Meta routing, billing, cashier authorization or compensation failure is proven by these setup failures.
- SaaS billing four tests and signed SuperQi positive test: synthetic phones use pre-0026 local format and violate migrated accounts_phone_shape_check. Update only fixture phones to E.164, keep production schema unchanged. The invalid-signature SuperQi negative test passes; actual positive settlement still pending.
- Tenant/security/knowledge/merchant management/reminder four suites all pass (14 Node counts), as do reply entitlement (2) and customer payment authority (11). These are current isolated-role proofs, not universal API or hosted environment safety.

## Separate successful gates on the same source

- [Clean deployment run38171428365](https://github.com/nora953/fawri-production-source/actions/runs/38171428365), job114564673362: 28 migrations; PostgreSQL-only HTTP journey 1 pass/0fail/0skip.
- [Global bootstrap/journey run38171428413](https://github.com/nora953/fawri-production-source/actions/runs/38171428413), job114564673192: 28 migrations; two MJS suites each1pass/0fail/0skip. Legacy merchants.json fixture is still present; does not close022/023.
- [Meta owner-role ingress run38171428392](https://github.com/nora953/fawri-production-source/actions/runs/38171428392), job114564673047: 28 migrations;1pass/0fail/0skip. Does not prove restricted-role page directory FA-I-006.
- Final quality gates run38171428211 completed success; no new unit-test counts inferred without job log extraction.

## Safety tooling

Local33 tests pass (guard/security/redaction); current repository scan1584 files passes. History5916 blobs passes after narrowly pinning six fabricated URL rejection inputs in two immutable test blobs by blob SHA+path+rule+index+length; new/changed findings are not suppressed. Future CI scan still needs verification. Fixture URL inputs were never used to connect. No dependency/lockfile changes.

Next: save runner/fixture corrections, inspect fresh CI for actual six-priority+cashier+billing+tenant outcomes, then targeted legacy-json and remaining failure tests. External provider activation, media durability, hosted restore and browser/offline visual QA remain unverified.
# Verified rerun — SEQ-06

Source284a5fa476ad975261099be74597e4cbeb23ba68; Actions38171811645/job114565798191. Four isolated instances, each28migrationsPASS, cleanupPASS. Counts include nested parent failures.20/21filesPASS;48PASS/3FAIL/0SKIP. Meta restricted role has two failed functional subtests plus failed parent. Tenant isolation/context reset and unknown-page generic failurePASS; mapping0/2 and known-page503FAIL. Historical first-run results below remain preserved.

| Suite | Node PASS | FAIL | SKIP |
| --- | --- | --- | --- |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 2 | 3 | 0 |
| cashier-subscription-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 2 | 0 | 0 |
| saas-billing-authority.integration.test.ts | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 11 | 0 | 0 |
| production-postgres-rls-security.integration.test.ts | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 1 | 0 | 0 |

## SEQ-07 negative-path run

Source91d639ff17dad866a89b06c1cea736e8f57bae6f, Actions38172237280/job114567076990:49PASS/6FAIL/0SKIP,20/22filesPASS. Four28-migration chains and cleanupPASS. Meta2functional failures+parent; SaaS2functional failures+parent. Golden fixture-free/root JSON absencePASS. Billing failures027/028 detailed in ISSUES.md.

| Suite | PASS | FAIL | SKIP |
| --- | --- | --- | --- |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 2 | 3 | 0 |
| cashier-subscription-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 2 | 0 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 3 | 0 |
| saas-billing-authority.integration.test.ts | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 11 | 0 | 0 |
| production-postgres-rls-security.integration.test.ts | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 1 | 0 | 0 |

## SEQ-11 expanded run

Source9331c489, run38173288435/job114570243330.52PASS/62FAIL/0SKIP;52Meta failures are premature pool-cleanup harness errors. Other10include3parents/7functional failures;018cross-cycle accounting reproduced. Five28-migration chains andcleanupPASS. Corrected Meta parent hook and standaloneknowledge next.

| Suite | PASS | FAIL | SKIP |
| --- | --- | --- | --- |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 2 | 3 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 11 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 1 | 52 | 0 |

## SEQ-13 corrected Meta functional run

Source2964aba2, run38173603888/job114571197444:106PASS/10FAIL/0SKIP;23/27filesPASS. Sevenfunctionalfailures+threeparents; Meta54PASS and standaloneknowledge1PASS. Five28-migration chains andcleanupPASS.017officialsender blocked;018persists. Prior52Meta harness failures corrected.

| Suite | PASS | FAIL | SKIP |
| --- | --- | --- | --- |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 2 | 3 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 11 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 54 | 0 | 0 |

## SEQ-15 full schema first run

Sourcefe892e69, run38174186237/job114572937993:108PASS/11FAIL/0SKIP;29unique files/30invocations. Six28-migration chains andcleanupPASS. Failed-setup cleanup realDBproofPASS. Fullschema seedPASS; dump/restore commandPASS; fingerprintverifyFAIL pendingcomponentdiagnosis. No fullrestore readiness claim.

| Suite / phase | PASS | FAIL | SKIP |
| --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 2 | 3 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 11 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs / seed | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs / verify | 0 | 1 | 0 |

## SEQ-17 — run38174896098 / source8dcc893e

30 unique files,31 invocations:110PASS/15FAIL/0SKIP. Six28-migration chains and cleanupSUCCESS. Detailed per-file Node counts:

| Suite / phase | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 0 | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 1 | 2 | 3 | 0 |
| cashier-billing-negative-failure-cases.integration.test.mjs | 1 | 2 | 4 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 0 | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 0 | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 0 | 11 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 1 | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 0 | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 0 | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 0 | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (seed) | 0 | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (verify) | 1 | 0 | 1 | 0 |

## SEQ-18 — run38175555975 / sourcefc1ee417

31 unique files/32 invocations:114PASS/14FAIL/0SKIP. Six28-migration chains/cleanupSUCCESS. Full schema seed+verify PASS;303 native CHECK canaries/comparisons on each side, matching fingerprints and postrestore restricted tenant reads. Addon controls3PASS. Ten functional failures plus four parents correspond to existing006/012/018/027/028/032.

| Suite / phase | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 0 | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 1 | 2 | 3 | 0 |
| cashier-billing-negative-failure-cases.integration.test.mjs | 1 | 2 | 4 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 0 | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 0 | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 0 | 11 | 0 | 0 |
| reply-addon-refund-postgres.integration.test.mjs | 0 | 3 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 1 | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 0 | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 0 | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 0 | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (seed) | 0 | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (verify) | 0 | 1 | 0 | 0 |

## SEQ-19 — run38175863733 / source1c498c06

32 unique files/33invocations:115PASS/14FAIL/0SKIP; six28-migration chains/cleanupSUCCESS. Password HTTP proofPASS; fullschema recovery/addon controlsPASS.

| Suite / phase | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 0 | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 1 | 2 | 3 | 0 |
| cashier-billing-negative-failure-cases.integration.test.mjs | 1 | 2 | 4 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 0 | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 0 | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 0 | 11 | 0 | 0 |
| merchant-password-recovery-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| reply-addon-refund-postgres.integration.test.mjs | 0 | 3 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 1 | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 0 | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 0 | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 0 | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (seed) | 0 | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (verify) | 0 | 1 | 0 | 0 |

## SEQ-20 — run38176210529 / source05456ea9

33unique files/34invocations:126PASS/14FAIL/0SKIP; six28-migration chains/cleanupSUCCESS. Priorauth business-route skip nowexecutedPASS. LegacyMeta/foundation workflow repairs separatelySUCCESS.

| Suite / phase | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 0 | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 1 | 2 | 3 | 0 |
| cashier-billing-negative-failure-cases.integration.test.mjs | 1 | 2 | 4 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 0 | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 0 | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 0 | 11 | 0 | 0 |
| auth-cutover-contract.test.mjs | 0 | 11 | 0 | 0 |
| merchant-password-recovery-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| reply-addon-refund-postgres.integration.test.mjs | 0 | 3 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 1 | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 0 | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 0 | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 0 | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (seed) | 0 | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (verify) | 0 | 1 | 0 | 0 |

## SEQ-22 — run38176766705 / sourcefccd677a

34unique files/35invocations:131PASS/14FAIL/0SKIP; six28-migration chains/cleanupSUCCESS. New restrictedbroadgrant HTTPsession suite5PASS.

| Suite / phase | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | 0 | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | 1 | 2 | 3 | 0 |
| cashier-billing-negative-failure-cases.integration.test.mjs | 1 | 2 | 4 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | 1 | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | 1 | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | 0 | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | 0 | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | 0 | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | 0 | 11 | 0 | 0 |
| merchant-session-restricted-http-postgres.integration.test.mjs | 0 | 5 | 0 | 0 |
| auth-cutover-contract.test.mjs | 0 | 11 | 0 | 0 |
| merchant-password-recovery-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| reply-addon-refund-postgres.integration.test.mjs | 0 | 3 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | 1 | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | 0 | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | 0 | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | 0 | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | 0 | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | 0 | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (seed) | 0 | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (verify) | 0 | 1 | 0 | 0 |

## SEQ-23 — run38177206914 / source83999ff1

34unique files/36phase-runtimeinvocations:132PASS/14FAIL/0SKIP; seven28migrationchains/cleanupSUCCESS. HTTPrepeat underNode22 is justified by imageNode22vsoriginalNode24; counteachinvocationbutnot asuniqueadditionalfile.

| Suite / phase / runtime batch | Runtime | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- | --- |
| failed-setup-cleanup-postgres.integration.test.mjs | v24.21.0 | 0 | 1 | 0 | 0 |
| global-merchant-auth-bootstrap-postgres.integration.test.mjs | v24.21.0 | 0 | 1 | 0 | 0 |
| global-merchant-golden-journey.integration.test.mjs | v24.21.0 | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| merchant-deletion-tenant-rls.integration.test.mjs | v24.21.0 | 0 | 1 | 0 | 0 |
| meta-webhook-postgres-ingress-cutover.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| meta-page-directory-restricted-rls.integration.test.mjs | v24.21.0 | 1 | 2 | 3 | 0 |
| cashier-billing-negative-failure-cases.integration.test.mjs | v24.21.0 | 1 | 2 | 4 | 0 |
| cashier-full-lifecycle-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| cashier-subscription-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| cashier-billing-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| cashier-downgrade-grace-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| cashier-historical-operation-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| cashier-operator-logout-pin-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| cashier-operator-own-history-scope-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| catalog-cashier-compensation-history-postgres.integration.test.ts | v24.21.0 | 0 | 2 | 0 | 0 |
| saas-billing-sql-failure-recovery.integration.test.mjs | v24.21.0 | 1 | 1 | 2 | 0 |
| saas-billing-negative-failure-cases.integration.test.mjs | v24.21.0 | 1 | 1 | 4 | 0 |
| saas-billing-authority.integration.test.ts | v24.21.0 | 0 | 4 | 0 | 0 |
| superqi-sandbox-billing.integration.test.ts | v24.21.0 | 0 | 2 | 0 | 0 |
| subscription-entitlement-postgres.integration.test.ts | v24.21.0 | 0 | 2 | 0 | 0 |
| merchant-customer-payment-authority-postgres.integration.test.ts | v24.21.0 | 0 | 11 | 0 | 0 |
| merchant-session-restricted-http-postgres.integration.test.mjs | v24.21.0 | 0 | 5 | 0 | 0 |
| auth-cutover-contract.test.mjs | v24.21.0 | 0 | 11 | 0 | 0 |
| merchant-password-recovery-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| reply-addon-refund-postgres.integration.test.mjs | v24.21.0 | 0 | 3 | 0 | 0 |
| reply-cross-cycle-refund-postgres.integration.test.mjs | v24.21.0 | 1 | 0 | 1 | 0 |
| production-postgres-rls-security.integration.test.ts | v24.21.0 | 0 | 6 | 0 | 0 |
| knowledge-tenant-rls.integration.test.mjs | v24.21.0 | 0 | 1 | 0 | 0 |
| merchant-management-tenant-rls.integration.test.mjs | v24.21.0 | 0 | 6 | 0 | 0 |
| subscription-reminder-rls.integration.test.mjs | v24.21.0 | 0 | 1 | 0 | 0 |
| knowledge-learning-cycle-postgres.integration.test.ts | v24.21.0 | 0 | 1 | 0 | 0 |
| meta-live-reply-postgres.integration.test.ts | v24.21.0 | 0 | 54 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (seed) | v24.21.0 | 0 | 1 | 0 | 0 |
| full-schema-restore-postgres.integration.test.mjs (verify) | v24.21.0 | 0 | 1 | 0 | 0 |
| global-merchant-postgres-http-journey.integration.test.ts [node22-http] | v22.23.3 | 0 | 1 | 0 | 0 |

## SEQ-24 actual isolated CI result (2026-10-12)

[Run 38180374172](https://github.com/nora953/fawri-production-source/actions/runs/38180374172), job 114591512528, Node suite markers parsed from completed job log: **132 PASS / 21 FAIL / 0 SKIP**, **37 phase/runtime invocations**. Compared with SEQ-23 132/14, the seven added failed assertions/parents come from the new checkout rollback suite; do not count all 21 as independent defects. Failed suite markers: `meta-page-directory-restricted-rls.integration.test.mjs` 2P/3F; `cashier-billing-negative-failure-cases.integration.test.mjs` 2P/4F; `billing-external-checkout-rollback-postgres.integration.test.mjs` 0P/7F; `saas-billing-sql-failure-recovery.integration.test.mjs` 1P/2F; `saas-billing-negative-failure-cases.integration.test.mjs` 1P/4F; `reply-cross-cycle-refund-postgres.integration.test.mjs` 0P/1F. All other suite markers passed. New suite tests SaaS and cashier external creation followed by injected SQL rollback and orphan signed payment event; see canonical 013/015 evidence in ISSUES.md. CI steps for Meta injected provider, full committed-schema restore, Node22 HTTP, and owned cleanup succeeded. Final quality and security workflows succeeded, while isolated cashier workflow failed. No production or real gateway assertions.


## SEQ-109–113 — baseline CI reconciliation and new local runtime audit

Source audit23563ffba019a666e3d2f61f29769723d56b7e03; main d38d29229bed0f9575a98e7026e7819fe363bfd4. Read current-head23workflow records:21completedSUCCESS/2completedFAILURE. New documentation/test commit results are not yet known.

[Isolated run38187646375](https://github.com/nora953/fawri-production-source/actions/runs/38187646375), job114613349687:37AUDIT_SUITE_RESULT markers/35unique files;132PASS/21FAIL/0SKIP, including parent tests. Failed suites below reproduce existing findings; not environment skips and not21 independent defects.

| Suite | P/F/S | Canonical IDs |
| --- | --- | --- |
| meta-page-directory-restricted-rls.integration.test.mjs |2/3/0|FA-I-006|
| cashier-billing-negative-failure-cases.integration.test.mjs |2/4/0|027/028/032|
| billing-external-checkout-rollback-postgres.integration.test.mjs |0/7/0|013/015|
| saas-billing-sql-failure-recovery.integration.test.mjs |1/2/0|032|
| saas-billing-negative-failure-cases.integration.test.mjs |1/4/0|027/028/012|
| reply-cross-cycle-refund-postgres.integration.test.mjs |0/1/0|018|

Total failed markers14functional/7parents. Current-run cashier historical-operation1PASS, subscription1PASS, full-lifecycle1PASS, downgrade-grace1PASS, operator logout/PIN1PASS, own-history1PASS, compensation-history2PASS. Restricted session5PASS; injected Meta54PASS; full-schema seed1PASS/verify1PASS,28migration records/94tables/45policies/3functions/matching fingerprint/restricted reads; Node22HTTP1PASS. Owned container/volume cleanup stepSUCCESS. Reuse exact execution as bounded existing evidence, never actual staging/license/real-provider clearance.

[Cashier run38187646619](https://github.com/nora953/fawri-production-source/actions/runs/38187646619): normal job114613350272SUCCESS (API/frontend typecheck and policy tests); isolated job114613350678FAILURE with later unselected phasesSKIPPED and cleanupSUCCESS. Skipped phases are not passed tests. Workflow itselfFAILURE.

Local fresh commands, repository root, Nodev24.19.0:

```sh
node --test scripts/fawri-sync-audit.test.mjs
node --test artifacts/fawri/tests/cashier-operator-outbox-hardening.test.mjs artifacts/api-server/tests/cashier-sync-contract.test.mjs artifacts/api-server/tests/cashier-compensation-sync-contract.test.mjs artifacts/api-server/tests/cashier-cash-tender-sync.test.mjs
git diff --check
```

Results:27/27 mocked runtime audit testsPASS,18/18 source contractsPASS,0FAIL/0SKIP;diff checkPASS. Earlier16/23 intermediate counts are superseded by final27, not added to totals. Runtime scope: full actual uploader orchestration with inert session/fetch/outbox adapters; timeline function with in-memory query adapter; server sale parser/replay with modeled existing order and transaction/authority adapters; offline structural validation/clock functions. No PostgreSQL/IndexedDB, actual permissions middleware, cryptographic licensing, server HTTP, two tabs/devices, power failure or actual provider execution. StripTypeScriptTypes emits experimental warning, not assertion failure. Harness requires Node supporting node:module.stripTypeScriptTypes; bundledNode24 is used here. No dependency installation or CI workflow change.

Browser prerequisite check: Playwright chromium.launch(headless:true) exits1 because chromium_headless_shell-1234 executable is absent. Browser testNOT_RUN / ENVIRONMENT_BLOCKED; application was not loaded. LocalDocker/psql unavailable. Do not bypass disposable guards, use live Neon, or call a real gateway to compensate. Test file and exact source/evidence ledger are committed for reproducibility.


## SEQ-114 — guarded real PostgreSQL proof prepared (2026-10-12)

Continuation from saved commit `3d88d9c78350db1b82036eee6e2a0a6c73c75ba6`. Added test-only `artifacts/api-server/tests/cashier-sync-multidevice-postgres.integration.test.mjs` and registered it first in the existing `cashier` isolated runner batch. No application changes or workflow permissions altered.

Two subtests plus parent: four independent merchant trials, two licensed/credentialed devices competing simultaneously for one physical stock unit at one location; require exactly one sale, one mutation, one timeline record, stock0/version2 and loser CASHIER_SYNC_NEGATIVE_STOCK. Concurrent exact winner replays must cause no second mutation; changed-note replay must reject idempotency conflict; loser retry must remain negative-stock. Separate actual-SQL timeline observation accepts1→3 and rejects later2, preserving the sequence-gap PROOF_GAP instead of approving that behavior. No provider HTTP: subscription activation uses existing test_fake APIs and all fixtures are synthetic.

Shared attestation executes before DB/application imports; teardown registered before first fixture mutation, tracks owned account IDs before INSERT and aggregates cleanup failures. Existing network-none runner and migrated schema retained. Local syntax checks PASS; direct unattested invocation exits1 with expected guard refusal before DB import. Actual PostgreSQL assertions **NOT_RUN locally / CI_PENDING**, no assertion success claimed. Expected inventory becomes36 unique files/38 invocations for the full isolated run if all existing phases execute; counts/results must come from logs, not expectation.

Exact next action: inspect the new commit's isolated CI cashier phase and this test's AUDIT_SUITE_RESULT, distinguish fixture/schema errors from product failures, verify cleanup, and update these ledgers. Do not rerun previous unchanged assertions merely to increase counts; this run is justified by new multi-device/altered-replay/gap assertions. After proof, continue SEQ-115 feasible expired/admin-closed historical shift recovery. Browser/IndexedDB remain blocked locally by missing Chromium. Functional fixes, hosted DB, deploy and merge remain unapproved. SEQ-114 is PREPARED until actual results are reconciled.


## SEQ-114a / SEQ-115 — first real run classified and fixture correction (2026-10-12)

[Run38194961047](https://github.com/nora953/fawri-production-source/actions/runs/38194961047), job114635479479, source `d0be9ea3a3c2361893db170a07ec670fe95eef5c`: **132 PASS / 24 FAIL / 0 SKIP**, 36 unique files/38 invocations. New multi-device suite1PASS/2FAIL: actual SQL1→3→2 observationPASS, final-stock race failed because loser was CASHIER_OPERATION_DEVICE_AUTHORITY_REQUIRED rather than expected stock conflict; parent failed. This is not successful contention proof. Fixture operations used JS millisecond timestamps immediately after PostgreSQL microsecond-issued credentials; corrected synthetic operation time to +1second (inside existing5minute tolerance), with explicit preflight asserting both devices historically authorized before competing. No server tolerance or authorization changed. Corrected actual race/replay results await new CI. Existing21failure markers persist.

Additional password-recovery suite0PASS/1FAIL at test line245: tampered-cookie confirmation returned200 rather than401. Source test mutated the final Base64url authentication-tag character. A22-character encoding of a16-byte tag has unused padding bits: replacing finalA withB may decode to identical bytes. Actual AES-GCM codec runtime test reproduces identical-byte alias acceptance; first-tag-character mutation has provably different bytes and was rejected in64fresh codec trials. Thus classify as **TEST-RECOVERY-TAMPER-001 fixture defect**, not proven cryptographic forgery. Corrected existing integration test to mutate the first tag character and assert byte inequality before HTTP. Local evidence29PASS/0FAIL/0SKIP in scripts/fawri-sync-audit.test.mjs (supersedes27count, do not sum intermediate runs). Actual corrected recovery HTTP proof CI_PENDING. New result132/24 is not a clean app baseline and must not be replaced by older132/21 without explanation.

SourceSEQ115 narrowed existing shift-recovery PROOF_GAP: client parseOperatorSession drops expired proof (`cashierOperatorSessionRuntime.ts:211-250`), but same-staff PIN login reuses the existing open shift (`postgresCashierStaffAuthority.ts:1547-1606`). Ordinary logout refuses pending outbox atclient647-658; station pairing also refuses pending at328-350; station/staff disable or revoke closes shifts server580-617,831-840. Historical routes still authenticate a current valid operator (`cashierStaffSession.ts:121-166`, staffAuthority1651-1720); historical attribution checks operation-time session/shift/credential (`cashierOperatorCommerceAuthority.ts:200-255`). No expiration-only loss claim. Remaining feasible closure/re-enable/new-shift recovery needs disposable HTTP and actual browser tests; retainCASHIER-SYNC-SHIFT-001 asPROOF_GAP, never automatically rebind historical transactions to a differentstaff.

Cleanup, full-schema restore, injected Meta and Node22HTTP stepsSUCCESS in first run. No new real provider or hosted data interaction. Corrected fixtures and29local tests saved; exact next is read the new commit's cashier/recovery suite markers and cleanup, distinguish remaining fixture versus application failures. No functional fix, deployment, merge, live DB or secrets changed.


## SEQ-114 verified / SEQ-115 source — corrected real run (2026-10-12)

[Run38195395321](https://github.com/nora953/fawri-production-source/actions/runs/38195395321), job114636790344, source `bc8ca3691dfa63c2c4495c5f82f2cdae3840ede4`:134PASS/22FAIL/0SKIP,36unique/38invocations. New multi-device suite **3PASS/0FAIL/0SKIP** (two subtests+parent): four independent final-stock races, one winner/one negative-stock loser, exactly one order/mutation/timeline, stock0/version2, concurrent exact replay/no extra stock mutation, altered-note replay409 and loser retrynegative. Actual SQLgap1→3→2 observationPASS. This closes only this isolated service race proof, not browser/allmulti-device/HTTP/operator attribution gates. Fixture +1second correction succeeded; production logic unchanged. Cleanup/full-schema restore/injectedMeta/Node22HTTP stepsSUCCESS; quality/securitySUCCESS.

Remaining extra failure beyond existing21: recovery integration transform failed before test execution because test-only tamper correction reused local namefirst already declared later (esbuild line273). Agent introduced this error; corrected to tagFirstCharacter. Local full-file TypeScript strip + vm.Script compilePASS (transform alone did not catch duplicate lexical declaration); actual corrected recoveryHTTP stillCI_PENDING. TEST-RECOVERY-TAMPER-001 remains verificationpending; no productcrypto defect inferred. Do not call134/22clean or passwordtestPASS. New rerun justified solely by this fixture correction.

Current useful proof:29local mocked-runtime/codecPASS,18sourcePASS,3new actualPostgreSQL suitePASS. Exact next: read correctedrecovery suite and allrun counters/cleanup; then feasibleclosedshiftHTTP and actualbrowser IndexedDB/7day licensing. Normallogout/pairing andsame-staff openshiftreuse safeguards retained. ReleaseBLOCKED, approximately50% audit estimate unchanged; no functionalfix/merge/deploy/liveDB.


## FINAL SEQ-114/115 checkpoint — verified corrected SQL/HTTP execution

Executed source: `0d5b9ef8b967d472e6dbddf832abbb28e4f75b2c`. [Run38195697724](https://github.com/nora953/fawri-production-source/actions/runs/38195697724), job114637714590: **135 PASS / 21 FAIL / 0 SKIP**, 36 unique files / 38 invocations. The six failed suites and eight canonical findings match the original product baseline; fourteen functional failures plus seven parent markers, not21 separate defects. Fixture failures from d0be9ea3 and bc8ca369 are superseded, not erased from historical evidence.

- New cashier-sync-multidevice suite **3 PASS / 0 FAIL / 0 SKIP**: four independent two-device last-stock races; one accepted sale and negative-stock loser; exactly one order/mutation/timeline and stock0/version2; concurrent exact winner replay causes no second mutation; changed-note replay conflicts; loser retry remains negative-stock. Actual SQL1→3→2 gap behavior reproduced. Gap observation being PASS does not close policy/recovery concern.
- Corrected merchant-password-recovery suite **1 PASS / 0 FAIL / 0 SKIP**: changed decoded GCM-tag bytes reject HTTP tamper; normal reset, proof replay denial, concurrent reset serialization and session revocation verified. TEST-RECOVERY-TAMPER-001 fixture correction VERIFIED; no application crypto change.
- Full committed-schema restore, injected Meta, Node22 HTTP and owned container/volume cleanup steps SUCCESS. Quality run38195697710 and security38195697719 completed SUCCESS. At inspection23 workflows:20SUCCESS,2FAIL,1schema workflow still IN_PROGRESS; do not call unfinished schema result PASS.
- Local latest harness29PASS/0FAIL/0SKIP; separate existing source assertions18PASS. Do not add these to PostgreSQL135 as one homogeneous coverage counter. No browser, actual IndexedDB, hosted staging mutation, real provider or money flow here.

This final checkpoint changes documentation only. Executed results belong to0d5b9ef8, not automatically to later documentation SHA. No new runtime rerun requested; existing PR path filters may schedule unchanged checks. Any later failures must be inspected, and no automatic release approval follows from a docs commit.


## SEQ-116 — closed-shift recovery HTTP proof prepared, 2026-10-12

Continuation baseline `57032ce1a88d0ee1588b401fd714668485bb9952`, same audit branch/PR520. User clarified: complete comprehensive audit first; defer all application repair planning/execution until the audit is complete. Earlier billing implementation approval question is withdrawn; no approval requested. No restart of verified stages.

Added `artifacts/api-server/tests/cashier-closed-shift-recovery-http-postgres.integration.test.mjs` to existing guarded cashier runner. Synthetic disposable schema only: real HTTP PIN login, timestamp inside original session, real administrative staff-service disable/re-enable closing original shift, revoked-token rejection/no sale, fresh PIN login/new shift, wrong-device denial, old-operation HTTP upload with original staff/shift/session attribution, complete entity ACK and exact replay/no duplicate stock/order/attribution. Owner administration HTTP middleware, browser outbox, returns/voids and other-staff/tenant cases are outside this bounded new proof. Shared attestation executes before DB/application imports; aggregate HTTP/account/pool cleanup registered before mutation.

Local `node --check` PASS; direct invocation without attestation refuses (exit1) before DB imports as required. SQL/HTTP assertions **PREPARED / NOT_RUN** until isolated Actions logs are read. CI head baseline57032ce1 has23 completed workflows:21SUCCESS/2FAIL (isolated audit/cashier); prior source0d5b9ef8 results135PASS/21FAIL reused, not rerun evidence. New test adds one invocation, expected inventory37 unique/39 invocations, subject to actual logs. CASHIER-SYNC-SHIFT-001 remainsOPEN awaiting results; no new functional bug declared.

Next: read isolated cashier suite result/cleanup, classify fixture vs product failure; continue SEQ117 native IndexedDB versionchange/concurrency/changed-input replay. Existing browser-storage workflow only scans source and executes Node audit behavior; it does not launch a browser. Local Chromium/Docker/psql absent. Whole audit estimate unchanged~50% (40–60% uncertainty); source/runtime/browser/provider/hosted evidence remains separate.


## SEQ-116a / SEQ-117 — test-only continuation

SEQ116 first executed source8d3f4888: cashier run38197881066/job114644536563 reached HTTP200 historical upload, original attribution and HTTP200 replay, then failed newtest156 expecting nonexistent`duplicate` field; actual contract is`replayed`. This is a TEST_FIXTURE_DEFECT, not application failure or fully passing proof. Corrected assertion to`replayed:true` plus0 inventory mutations; end-state counters awaited. Cleanup stepSUCCESS. Existing last-stock suite3PASS; existing cashier billing failures remainOPEN.

SEQ117 new native Chrome/CDP test and minimal CI workflow prepared. Bundles actual IndexedDbCashierAuthority/pure dependencies with existing pinned esbuild; fresh temporary profile and loopback page, CSPconnect-src none, refuse bundle network dependencies, no DB/application HTTP/provider. Four bounded assertions: two same-origin tabs competing for final piece with complete outbox rollback; close/reopen pending durability; changed-valid-quantity sameID must reject; versionchange closes original handles/preserves outbox and old-schema reopening failsVersionError. Last case is observation of compatibility lifecycle, not automatic reconnect clearance. Changed-payload assertion may expose existingSEQ93/94 observation; do not treat expected-red as a repair.

Local syntaxPASS; native command without configured Chrome refusesexit1 rather than skip. Real browserNOT_RUN pendingCI; headless native storage is not physical offline7day/device/visual/linguistic proof. No application code changed. User explicitly deferred all repairs and consolidated repair plan until comprehensive audit completion; previous billing proposal remains historical only. Next read correctedHTTP/native logs and cleanup; continue uncovered scopes with evidence labels, no reset toSEQ1. Estimate unchanged~50%.


## VERIFIED SEQ-116–119 checkpoint — 2026-10-12

Audit-only continuation, PRhead sourceb68d24e9eb4b1d50b3452a224d479fb1ec2b91a6. App code unchanged. Last completedSEQ116 bounded HTTPrecovery,SEQ117 bounded native IndexedDB,SEQ118 report-export input integrity,SEQ119 actualroute coverage inventory. This supersedes earlierNOT_RUN/PREPARED notes only within the proven bounded scenarios.

**Isolated actualSQL/HTTP:**run38198172739/job114645417825:136PASS/21FAIL/0SKIP,37unique/39invocations. Newclosed-shift suite1PASS. Real staff-service disableclosesoriginalshift/re-enable+HTTPPINloginnewshift; originaltoken401/noorder, wrongdevice401, historicalsaleHTTP200 with fullentityACK, preservedoriginalstaff/shift/session, replayHTTP200/replayedtrue/0mutations, oneorder/attribution andstock0. OwneradminHTTP, otherstaff/tenant andreturn/void scenarios not included. Cashier subsetrun38198172963/job114645417428 confirms1PASS/ownedcleanupSUCCESS. First source8d3f4888 wrongduplicate-field assertion corrected; fixturedefectCLOSED, applicationunchanged. Existing21markers remain14functional/7parents for8canonical findings. Meta54/restore/Node22/passwordrecovery/stocksuite3PASS; finalquality38198172713,security38198172727,schemavalidation38198172765SUCCESS.

**Native browser:**run38198172776/job114645417274, Chrome154.0.8037.97. PRheadb68d24e9; checkoutmergeSHA35cc841b7cf8f7d369078879b3dc1d544001b6ca.3PASS/1FAIL: two actualsame-origin tabs finalstock=oneaccepted/oneCASHIER_OUT_OF_STOCK/stock0/onecompletesaleoutbox2; close/reopenretains2pending; versionchangeclosesbotholdhandlesInvalidStateError,preserves2outboxrecords,oldv2reopenonschema3rejectsVersionError. Changedvalidquantity1→2 withsameoperationIDisacceptedandreturnsquantity1(oldsale): priorSEQ93/94 observation nowconfirmednativefailure. No extra stockdecrement/dataloss demonstrated. VersionError is fail-closed old-schema compatibility, not a separate claim of corrupt upgrade. Existing authority retainsclosedpromise; auto-recovery and all appcallers not certified. Freshprofile/browser/server cleanup completes before result emission. No physicaldevice/POSUI/offline7day certification.

**Report-export actualfunction/adapters:**`node --test scripts/fawri-report-export-audit.test.mjs`,Node24.19.0:4PASS/2FAIL/0SKIP. Actual CombinedReports download closure passed explicit inertdownloader; actual moneyUi/reportWorkbook purefunctions executed after TStransformation. IQDwholeunitsPASS, realUIformatter majorunitsPASS, formula-like strings encodeinline/noformulaPASS, XMLescaping/numeric0PASS.USD12345minor suppliedtoworkbookas12345 underUSDsalesheader whileUIdisplays123.45;KWD-1050minor suppliedas-1050 whileUIshows-1.050. Twofailures areoneREPORT-EXPORT-CURRENCY-001 finding, nottwoissues. XLSXzip/Office/PDF/ReactHTTP/exportdownload notexecuted. Initial harness componentmarker typo corrected before these6assertions; no appdefect counted fromthat.

**Scope inventory:**COMPREHENSIVE_RELEASE_AUDIT_SCOPE now lists37named routes+fallback, sourcecomponents/intendedaudiences, all appbrowserjourneysNOT_RUN; separatecashierPOS/history/reports/sync/diagnostic modes andnestedadminpanes remainexplicit. Nativeauthority proofcannotcertify thescreens. Browserrole/AR/EN/KU/RTL/mobile/focus/loading/empty/error andhosted/provider/commercial gates remainOPEN.

**NextSEQ120:** report-range/completeness/PDF and workbook actualconsumer assertions; extend historicalHTTPreturn/void/crossstaff/tenant/permission negatives. Then fullappbrowserjourneys from37route inventory when safe synthetic runtime prepared. Preserve earlier proofs, do not restart. No application repair or consolidated repairplan until comprehensiveaudit complete, as explicitlyrequestedbyuser. Historical paymentrepairproposal is not current execution queue or approval request. No mainmerge/deploy/liveDB/secrets/realpayment.


## SEQ-120 bounded adjacent cashier export follow-up (2026-10-12)

Extended existing REPORT-EXPORT-CURRENCY-001 to actual centralcashierdownloadclosure. `CashierCentralReportsPage.tsx533–590,617–630` exportsrawminor net/profit/refund/average/product/operationamount under ordinary value/amount labels; liveview`formatReportMoneyMinor`169–177/235–236 scalesbycurrencydigits. NewcapturedcentralUSDsummary12345vs123.45FAIL; IQDsummaryandlimited-operationnoticePASS. Topproduct/operation scaling is SOURCE_REVIEW_ONLY, not separately executed. No duplicateissue.

Final`node --test scripts/fawri-report-export-audit.test.mjs` onNode24.19.0: **5PASS/3FAIL/0SKIP**,8tests. Threefailures=onecurrency-scale finding. InitialSEQ118six-test4/2 result is historical and superseded by this expanded sameharness8-test5/3 result; no homogeneousaddition toSQL136/21 ornative3/1. RealZIPgeneration/XLSXofficeopen,PDFpagination andvisual comparison remainNOT_RUN. Noapplicationchange.

**Current definitive continuation:**SEQ116–120 bounded workcomplete; nextSEQ121 actualworkbookZIP/consumer andPDF/range/completeness assertions, plusclosed-shiftreturn/void/currentpermission/crossstaff/tenant HTTPnegatives.37routeinventory remainsNOT_RUN forappjourneys. Sameexplicituserconstraint: completecomprehensiveaudit before consolidatedrepairplan; historicalpaymentproposalnotcurrentqueue. Allnoteddefects preserved, no repairs. Overallplanning~52%,48%remaining(40–60%uncertainty), releaseBLOCKED.


## SEQ-121–122 prepared continuation — 2026-10-12

Baseline `1ba1e94a49281f7388cca7cd77b246712133d7da`, same audit branch and draft PR #520. Comprehensive audit only; no application repair or consolidated repair plan authorized before coverage completion.

- **SEQ-121 / PREPARED:** `scripts/fawri-workbook-package-audit.mjs` executes the actual `reportWorkbook.ts` producer with the locked SheetJS 0.20.3 CFB writer. Only the DOM/download boundary is inert. Actual ZIP bytes will be checked independently by Python zipfile/ElementTree (CRC, parts, XML, Arabic/Sorani text, RTL, merges/filter, numeric zero/negative and formula-as-string), then read by actual SheetJS. No output files, application/DB/provider imports. New minimal Actions workflow requires locked dependencies. Local syntax PASS; actual invocation blocked by missing xlsx package (`MODULE_NOT_FOUND`), not a product failure. Package assertions NOT_RUN pending CI; no Excel/LibreOffice/PDF render claim.
- **SEQ-122 / PREPARED:** new guarded `cashier-historical-compensation-http-postgres.integration.test.mjs`, selected first in existing network-none cashier runner. Two independent fixtures for return and void: old operation timestamp inside original session, staff disable/re-enable closing original shift, sale replay restored, valid compensation rejected by current same-staff `sale.view_own` scope; then synthetic administrative service grants manager `sale.view_all`, fresh PIN login, historical compensation/ACK/original attribution/replay/stock restoration assertions. Expected denial is an observation of the documented policy, not a security defect or automatically approved policy change. Tests must distinguish interrupted historical upload recovery from a newly requested cross-shift refund. No live permissions changed. Local syntax PASS; direct unattested invocation exits1 before DB imports. SQL/HTTP assertions NOT_RUN pending CI.

Current authoritative prior results remain SQL136PASS/21FAIL, native3PASS/1FAIL, export-input5PASS/3FAIL with separate evidence classes. New DB selection is expected to become38 unique/40 invocations; actual counters must come from logs. Next read workbook/isolated job logs and classify failures; then report range/completeness and print/PDF coverage. Estimate unchanged ~52%; release BLOCKED.


## SEQ-121 verified; SEQ-122 bounded HTTP verified; SEQ-123 print prepared

Executed source `75c53d2b57c45a1f120d55c0a2904be3b16cbcb9` (PR head); workbook checkout merge SHA `c77747bff61be95c911321096182b1257feab93c`. Workbook run38199810989/job114650490522 SUCCESS: actual SheetJS0.20.3 ZIP writer and reader, 4240 bytes, six package parts. Independent Python ZIP CRC/all XML/Arabic-Sorani text/RTL/merge/filter/numeric0-negative/formula-as-string assertions PASS. DOM download is inert; no Office visual/PDF or actual report totals claim. Existing currency-scale finding remains OPEN.

Cashier subset run38199811297/job114650491045: new historical compensation suite1PASS. Both valid return and void of original-shift sale receive403/CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN from same-staff sale.view_own after closure; after synthetic manager sale.view_all grant and fresh login, HTTP200, complete ACK, original shift/session attribution, exact replay/no second inventory increment and stock1 PASS. This confirms documented own-shift scope and a historical recovery limitation, not unauthorized permission bypass. Current permission required for replay; broader cross-staff/tenant and missing-action-permission negatives still untested in this new suite. Owned cleanup step SUCCESS. Full aggregate must be read from isolated run38199810864 logs before recording totals.

SEQ-123 PREPARED: `scripts/fawri-report-print-audit.mjs` and minimal workflow. Extract actual online report presentation components/helpers (before useOnlineReport), compile with real React and actual translation/money modules; compile actual frontend CSS through Vite, then fresh headless Chrome renders AR/EN/Sorani synthetic report props and prints PDF. Assert nine metrics, last of eight products, nonempty first page and bounded page count through pdftotext. No HTTP/API/DB/provider imports or report data fetch; loopback CSP blocks external webfonts, so system fallback-font layout only. No full app/mobile/linguistic signoff or production font claim. Local syntax PASS; Chrome/build dependencies absent locally. Print assertions NOT_RUN pending CI.

Next inspect print and isolated aggregate logs; then report date-boundary/completeness and cross-tenant/action-permission negatives. Comprehensive audit only; no application repairs or consolidated repair plan. Planning estimate remains ~52% until the new target proof is assessed.


## SEQ-123 fixture correction; SEQ-124 calendar proof

First print run38200106257/job114651400190 on source43f64c6c: all three locale render waits timed out, so no PDF assertions executed or success claimed. Test extraction removed original Recharts imports but components use PieChart/ResponsiveContainer/Cell. Test-only entry corrected to import actual Recharts, with retained browser error diagnostics and actual SVG readiness assertion. This is an identified harness dependency omission, not an established application defect. Actual print rerun pending. No chart stubs or application edits.

SEQ-124: `node --test scripts/fawri-report-calendar-audit.test.mjs`, Node24.19.0,6PASS/0FAIL/0SKIP. Executes actual ReportToolbar date-query bodies in child processes with explicit TZ: Baghdad leap day/exclusive end, New York23h spring and25h autumn days,7-day preset includes today+6previous dates across DST, year-end advancement, all-time unrestricted. No React/browser/API or database execution; existing local-sale range tests are not repeated. Confirms local-browser timezone contract only, not merchant-timezone normalization or malformed-date validation.

Read completed isolated run38199810864/job114650489926: **137PASS/21FAIL/0SKIP,38unique files/40invocations**; new historical return/void suite1PASS. Existing14functional/7parent failure markers unchanged. Workbook producer/parser PASS previously saved; currency-scale finding remains OPEN. Next inspect corrected real-component print logs before further coverage or final status.


## SEQ-123 cleanup classification; SEQ-125 HTTP negative proof prepared

Print rerun38200387912/job114652264539 on f303575d reached browser execution after restoring real chart imports but did not emit evidence: removal of the temporary Chrome profile failed ENOTEMPTY while a Chrome descendant was still writing. No PDF pass/fail inferred from the lost summary. Test-only lifecycle corrected to own a detached process group, terminate all its descendants and retry bounded profile removal; cleanup failure remains visible in the final result and cannot produce green. Actual render/PDF assertions must be reread from a completed rerun. This is a test-resource cleanup failure, not an established app defect.

SEQ-125 PREPARED: extend existing guarded historical compensation HTTP fixture for each return/void with an actual second licensed tenant/manager denied403; remove current action permissions through staff service and fresh login then replay denied403; administrative closure plus a distinct same-tenant cashier with action+view_own denied403. Require no order in other tenant, unchanged original attribution count2 and restored stock1. This adds real boundary assertions missing from prior mocked tests, so rerun is justified. Local syntax PASS; SQL/HTTP pending CI. No hosted grants/DB or business behavior changed.

No change to verified SQL137/21, workbook package PASS, local calendar6PASS, prior native3/1 and export-input5/3 evidence. Do not count repeated unchanged assertions as progress. Next inspect corrected print and new denial logs, then finish bounded report completeness/source budget coverage. Audit first; repairs and consolidated plan deferred.


## SEQ-125 bounded HTTP verified; SEQ-126 completeness proof; print root correction

Source744372b4, cashier subset38200568005/job114652821787: new HTTP suite1PASS. For both historical return and void, actual second licensed tenant403, current action permission removed/fresh login403, distinct same-tenant staff view_own403; original stock1 and two attribution records unchanged, other tenant has0orders. Normal privileged historical recovery and replay remainPASS. Full aggregate awaits run38200567769 log reconciliation. These are actual disposable service/HTTP proofs, not hosted-role certification.

SEQ-126: `node --test scripts/fawri-report-completeness-audit.test.mjs`, Node24.19.0,4PASS/0FAIL/0SKIP. Actual function bodies with explicit inert SQL adapters: financial report requests50001 rows and rejects over50000 with413 rather than silently truncating totals; empty report explicitly0sales; activity detail500 can expose matching_count750; UI warning uses filtered matching count and does not incorrectly flag a30-of30 filtered set. No actual50000-row load, SQL window/paging, browser warning or Excel/PDF full-detail clearance. Existing source range/filter join remains separately source-only.

Third print run38200567854/job114652821367 on744372b4 emits locale failures at visible product text beforePDF generation. CSS reports-print89–125 hidesbody elements unless inside report-print-root; extracted-component fixture lacked this actual outer ReportsPage wrapper. Added existing report-print-root class to synthetic fixture DOM; applicationCSS unchanged. Prior dependencies/profile errors resolved enough to get this diagnostic. Real corrected PDF result pending; no app defect or print pass inferred.

Next inspect print/PDF first-page/text evidence and aggregateSQL result. No consolidation of repair plan/application changes; continue whole scope after this bounded report batch. Planning estimate stays~52% pending usable print evidence.


## SEQ-123 fourth result and stricter metric diagnostic; SEQ-127 query-budget source gap

Print run38200769264/job114653461100 on fa2f5968: actual-component PDFs EN and Sorani PASS, each2nonempty pages,9metrics,lastchartproduct present (EN81562bytes, firstpage1869characters; KU157941bytes, firstpage2285characters). Arabic reached PDF/text checks but failed a broad body.innerText numeric substring assertion. Actual original Arabic formatting function locally returns`٦٩٧,٩١٠ د.ع` correctly; no app defect inferred yet. Test now checks each actual revenue-card DOM text value with explicit Arabic/extended-Arabic digit normalization and requires exact697910; diagnostic emits synthetic metric strings if it fails. This is a stronger targeted value assertion, not removal of a failed numeric check. Printed numeric glyph placement is still outside text-only consumer clearance. Corrected AR assertion/PDF summary awaits CI; no all-language success claimed.

**REPORT-QUERY-BUDGET-001 / SEQ-127 / SOURCE_CONFIRMED_PROOF_GAP / OPEN MEDIUM:** `cashier-staff-operations.ts:160–177` launches finance and activity report transactions concurrently. `postgresCashierCentralReportAuthority.ts:1179–1237` caps returned affected sales50001; `postgresCashierCentralActivityAuthority.ts:281–340` computesCOUNT(*)OVER before detailLIMIT500. Neither sets an explicit statement deadline; `operationalPostgresAuthority.ts:68–105` does not add one; `lib/db/src/index.ts:20` configures only connectionString. Contrast online report`postgresOnlineOrderReportAuthority.ts:185–193` uses8second SET LOCAL statement_timeout. Row caps are not query-time budgets. Actual database/URL/global role timeout settings and observed slow-load behavior are unknown: no live unbounded query or DoS demonstrated. Launch implication: cashier reporting performance/resource-budget acceptance unverified at large tenant volume. Required proof: guarded disposable large-tenant/lock-contention test with measured bounded response, rollback/release, pagination/completeness and production-like configured timeouts. No application/config changes or repair plan.

SEQ125 actual HTTP denials already PASS in dedicated cashier subset. Some intervening full runs cancelled on new commits; do not report incomplete aggregate as137/21 proof for a new source. Authoritative aggregate remains executed75c53d2b/run38199810864/job114650489926 until a later complete run is inspected. Next read latest print and completedSQL logs; save exact final resume.


## SEQ-123 Arabic fixture charset diagnosis and correction

Fifth print run38201039466/job114654293191 (sourcee05f9701) confirms English/Sorani2-page PDF PASS but Arabic DOM monetary values contain onlycurrency labels, while Arabic integer counts are correct. Original Arabic formatter locally yields correct697910; the test HTTP fixture omitted charset on HTML/JS and omitted meta charset. This can decode raw non-ASCII regex ranges differently from escaped string literals in the esbuild bundle; `formatArabicIqd` uses rawArabic digit range to recover ASCII before grouping. Actual application `artifacts/fawri/index.html` andcashier.html explicitlydeclare UTF-8. Test-only fixture now matches that contract: HTMLmeta andHTML/JS/CSS Content-Type charset=utf-8; assert document.characterSetUTF-8 and retain exact revenue-card value check. Hypothesis must be confirmed by a successful corrected browser run; no Arabic application defect declared yet, no numeric assertion removed. Printed glyph positioning still not visually certified. Next inspect this corrected print run and completed aggregate before saving definitive handoff.


## FINAL VERIFIED SEQ-121–127 checkpoint — 2026-10-12

Executed PR head **e1320f8616b5607536c19b6527c92e8c74bf546e**; no application source changes in this continuation. This supersedes the intermediate prepared/failed-fixture notes only for the bounded assertions below.

| Stage | Evidence | Verified outcome and limits |
| --- | --- | --- |
| SEQ-121 workbook package | run38199810989/job114650490522; repeated unchanged producer run38201278452 SUCCESS | Locked SheetJS0.20.3 actual ZIP writer/reader plus independent Python CRC/XML parser PASS. Six package parts; AR/Sorani text, RTL, merge/filter,0/negative numbers and formula-as-text. DOM download inert; no Office visual or actual accounting clearance. Existing REPORT-EXPORT-CURRENCY-001 OPEN. |
| SEQ-122 historical compensation | run38201278470/job114655029862, new suite1PASS | Two independent return/void fixtures: same-staff view_own403 after original shift closure; manager view_all200 and original historical attribution, complete ACK, replay/no duplicate stock restore. This is policy/recovery evidence; own-shift historical recovery gap remains OPEN. |
| SEQ-123 actual online report print | run38201278442/job114655029719; checkout merge4a31b6150cceaec1efec5bc0ff4d3f571d807d21 | Chrome154.0.8037.97, real React/Recharts report components/helpers/translations and Vite CSS; AR/EN/Sorani **3PASS/0FAIL**. Each2nonempty pages,9metrics, exact revenue697910 in card, last of8products present in PDFtext. AR186462bytes/firstpage2359characters; EN81573/1869; KU157941/2285. Synthetic props, loopback/system fallback fonts, no full app/API/mobile or linguistic/visual signoff. |
| SEQ-124 date query | node --test scripts/fawri-report-calendar-audit.test.mjs; Node24.19.0 |6PASS/0FAIL: Baghdad leap/year-end boundaries, NewYork23h/25h DST days,7local-day preset/alltime. Actual function bodies; no HTTP/DB/browser-calendar proof. |
| SEQ-125 HTTP denials | run38201278470/job114655029862 | For return and void: real second licensed tenant403, missing current action permission403, distinct same-tenant cashier403; stock1/attributions2 unchanged and other tenant0orders. Default disposable role only, not live RLS/grants certification. |
| SEQ-126 completeness | node --test scripts/fawri-report-completeness-audit.test.mjs; Node24.19.0 |4PASS/0FAIL with inert SQL adapters:50001 financial rows cause413 rather than silent truncation; explicit0emptyreport;500activity details preserve750matchingcount; filtered30-of30 does not show false truncation warning. Actual large-data SQL/performance NOT_RUN. |
| SEQ-127 cashier query budget | ISSUES.md REPORT-QUERY-BUDGET-001 | Source-confirmed lack of explicit application deadline in two concurrent cashier report transactions. Database-level timeout settings and load behavior unknown; MEDIUM/OPEN performance proof gap, not demonstrated live DoS. |

**Final isolated SQL/HTTP aggregate:** run38201278470/job114655029862, **137PASS/21FAIL/0SKIP**,38unique files/40invocations. Existing21markers remain14functional+7parents for8existing application findings; no app defect repaired. Actual new suite and all three denial classes PASS. Owned cleanup, full-schema restore, injected Meta54, password recovery and Node22 HTTP PASS. Quality38201278432/security38201278488/schema38201278456 SUCCESS. The overall isolated and cashier workflows remain FAILURE because canonical product defects remain; green new tests do not override them.

**Print fixture failures correctly classified and resolved:** missing actual chart imports, missing original print-root wrapper, browser descendant/profile cleanup, and omitted UTF-8 declaration. Corrected harness retains actual chart/PDF/metric assertions, owns browser group and removes profile before result. Source app index.html/cashier.html already declare UTF-8. Local `node --test scripts/fawri-report-print-fixture.test.mjs`2PASS reproduces wrong decoding of raw Arabic regex (blank monetary number) and correct original UTF-8 output; corrected real browser3PASS confirms fixture diagnosis. Earlier failed runs remain history, not product defects or success. No old failed result silently overwritten.

**Open product/gate scope:** existing billing/Meta/refund defects; local changed-payload replay; unsigned offline cache/licensing and actual7day/device proof; current-shift historical outbox/own-scope recovery; foreign-currency export units; cashier query budget; actual central-cashier/receipt/mobile/PDF visual and37route role journeys; hosted grants/image/media/PITR/monitoring/rollback; real external providers and commercial signoff. All repairs and consolidated repair plan remain deferred until comprehensive audit completion.

**Definitive next SEQ-128:** bounded central-cashier report/receipt print and profit-visibility scope, separating genuine app role/PDF evidence from inert adapters. Then unverified owner/admin/merchant screen groups from the37route inventory. Reuse completed sync/compensation/workbook/date proofs; reopen only for changed code/config or a new justified assertion. No merge/deploy/live DB/secrets/real payments authorized.


## SEQ-128–129 preparation — 2026-10-12

Continue from saved54fdcd78, no audit restart. Application source unchanged; tests and documentation only.

**SEQ-128 profit boundary / PREPARED:** source `postgresCashierOperatorReportAuthority.ts:59–72,175–189` redacts only currency-level profit/cost coverage, spreading nested `top_products`/`top_profitable_products` unchanged. Central product projection936–1014 includes productgross_profit and ranked profit lists. Candidate CASHIER-REPORT-PROFIT-001: a reports.sales+sale.view_own cashier withoutreports.profit may receive profit despite can_view_profit:false. New guarded actualHTTP test seeds a real synthetic1000sale/500cost, checks nested values and ranking absence without grant, then checks authorized grant allows actual500profit. No permission bypass assumed until runtime; positive control prevents false green from unknown costs. Local syntaxPASS, direct no-attestation refusalPASS before DB imports. Registered first in existing network-none cashier batch. SQL/HTTP NOT_RUN pendingCI.

**SEQ-129 receipt native print / PREPARED:** `scripts/fawri-receipt-print-audit.mjs` and minimal workflow bundle actual renderCashierReceiptHtml/translation/money/profile dependencies, fresh UTF-8 loopback Chrome, CSP blocksnetwork/images/fonts. Six cases AR/EN/Sorani×58/80mm: bodywidth/nooverflow, two sale lines, exact2400total, reprint marker, cost sentinel absent, hostileproduct/variant/store/station markup escaped with no activeimg/script/iframe, PDFconsumer retains last item/saleID. Actual caller-generated receipt CSS used; no physicalthermalprinter, POSflow orprintdialog/iframe lifecycle proof. LocalsyntaxPASS; browserNOT_RUN pendingCI. Existing receipt unit tests are source references, not rerun proof.

Prior aggregate137PASS/21FAIL on e1320f86 reused. Expected new inventory39unique/41invocations is provisional; actual counters fromlogs only. Planning estimate~53%, releaseBLOCKED. Next inspect new suites, classify fixturevsproduct failure, then centralcashier report presentation and remaining owner/merchant/administration scope. No repair plan orapplication changes before comprehensive audit completes.


## SEQ-128 confirmed profit disclosure; SEQ-129 fixture correction; SEQ-130 prepared

Executed source4ec5944e6243eaee266341a94504c77d067a47da. Isolated run38203123023/job114660651958: **138PASS/24FAIL/0SKIP,39unique files/41invocations**. New profitHTTP suite1PASS/3FAIL (two functional denials + one parent): account withoutreports.profit returnscan_view_profit:false and currencyprofit omitted, but both productlist/ranking exposegross_profit_minor500 for known1000revenue/1unit. Authorized grantpositivecontrol correctlyreturns500. This confirms new CASHIER-REPORT-PROFIT-001 HIGH/OPEN via actual disposable SQL/authentication/HTTP, not only source; no apprepair. Now9canonical product findings,16functional+8parent failuremarkers. Existing8findings/21markers unchanged.

Receipt first run38203123227/job114660652764:6FAIL beforePDF checks atactiveMarkup1 instead0. Initialharness document.write executes duringoriginalscript parsing, retaining its own bootstrap script. Test-only corrected to replace document onload after parsercompletion, retaining strictzeroactiveElements/escape/cost/width/PDFassertions and diagnostic tag/src onfailure. No receiptappdefect declared from this fixture failure; actual sixreceipt outcomes pending.

SEQ-130 PREPARED: `fawri-central-report-browser-audit.mjs`/minimal workflow renders actual complete CashierCentralReportsPage, ReportToolbar and I18nProvider through realReact, actualRecharts/ViteCSS, syntheticloopback GETreport API. AR/EN/Sorani print checks6summarymetrics/exact697910net/twocharts/30detailrows/partialnotice/nonemptyfirstpage/lastproduct. Separate ENempty state and503error→disabledexport→realdate-dialog7dayselection/apply→freshsuccessfulfetch/re-enabledexport. Synthetic API intentionallysupplies30-of70detailwindow/limit30; it is not current server500-capproof or ownerauthentication. No realDB/provider, no actual financialcomputation. Locale/storage freshprofile/UTF-8/CSP onlyloopback; fallbackfonts. Local syntaxPASS; browserNOT_RUN untilCIlogs.

Next inspect correctedreceipt andcentralcomponent suites; proceed to owner/admin/merchant UI/data scope withoutrepeating alreadyverifiedservice proofs. Audit estimate remains~53% pending newnative evidence; launchBLOCKED. No application repair/consolidated plan before comprehensive audit completion.


## SEQ-129 native receipt verified; SEQ-130 CSS fixture correction; SEQ-131 admin UI authority

Source262ee63e, receipt run38203617345/job114662158918 SUCCESS: Chrome154, **6PASS/0FAIL**, AR/EN/Sorani×58/80mm, each1PDFpage. Exact2400total, correct bodywidth/nohorizontaloverflow, lastitem/saleID present, reprint marker, no privatecostsentinel, no activeimage/script/iframe and injectedmarkerfalse. Original hostile labels are escaped. Physicalprinter, actualiframe/printdialog cleanup andfullPOS flow NOT_RUN. First bootstrap-script artifact resolved by replacingdocument afterload; producerunchanged.

Central report run38203617325/job114662159017 failed beforebrowser: esbuild needs an outputpath for actualReportToolbar importedcalendarCSS. Test bundle now sets logicaloutfile withwrite:false and explicitly servesJSoutput; actual stylesheet still comes from VitecompiledCSS. No app/component/CSS edits and no browser assertions counted as failures. Corrected actualreactivecentralreport/PDF/empty/error-period-recovery suite pendingnewCI.

SEQ-131 `node --test scripts/fawri-admin-ui-authority-audit.test.mjs`, Node24.19.0, **10PASS/0FAIL/0SKIP**. Actual hasAdminPermission andcontrollercapability/refreshcallback bodies with inertstate/HTTPadapters: owner allsurfaces, mandatorypasswordchange gatesall, logs-onlyassistant cannotmanageadmins/merchantdata, missingadminclosed;401/403 clearscachedowner evenpreserve option; successful serverowner→assistantdowngrade closesownercontrols;503preservesUIidentity onlyexplicittransientpreserve;initial503/malformedresponse clearsidentity andloginredirect. No Reactmount/realadminHTTP/cookies/backendpermission/15secondrefresh/browser visual clearance. The old localStorage-auth TODO atcontrollerheader is stale commentary; current authority calls server/api/auth/admin/me; do not labelit a currentbearertoken exploit. Prior source-contract authcutover tests notrerun.

Newprofitdisclosure remainsHIGH/OPEN; prioraggregate138/24 reused fromexecuted4ec5944e. Next readcorrectedcentralnativeproof andfullaggregate before finalcheckpoint; continue owner/admin/merchant scopes. Noapplicationrepair/consolidatedplan ormerge/deploy/livechanges. Planning~53% unchanged untiltargetresults assessed.
