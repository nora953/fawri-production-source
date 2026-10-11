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
