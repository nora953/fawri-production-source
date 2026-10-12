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
