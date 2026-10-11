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

## SEQ-18 — expanded direct-entrypoint inventory

Source checkpoint fc1ee4171eac9b75189383539857664afa37b264 (2026-10-11). Initial rows above describe the earlier baseline and are historical; selected disposable runner execution is now proven by linked Actions in EXECUTION_RESULTS. This expansion is **source inspection only** and executes no original integration test.

Candidate rule: top-level API test filenames `*integration.test.*` whose text mentions DATABASE_URL or @workspace/db. This is not an exhaustive transitive dependency analysis or a claim that every candidate mutates data. Direct column means an `await assertDisposablePostgres(` source marker, not a new execution proof; conditional guards may allow no-URL skips. Static column counts direct static imports from @workspace/db only, excluding transitive service imports. Literal workflow references omit package scripts, globs and reusable selection; absence is not proof of no CI invocation. Runner coverage means filename appears in the isolated driver's selection lists, where its preloader runs before test imports.

Counts: {"candidateFiles": 64, "directGuardMarkers": 16, "selectedByIsolatedRunner": 31, "staticDirectDbImports": 10, "withoutDirectGuardMarker": 48, "withoutDirectGuardOrSelectedRunner": 33}.

| Candidate API test file | Direct guard marker | Isolated selection | Static DB import | Literal workflow references |
| --- | --- | --- | --- | --- |
| `admin-auth-router-postgres.integration.test.ts` | no | no | no | global-admin-golden-journey.yml |
| `auth-otp-postgres-concurrency.integration.test.ts` | no | no | yes | auth-concurrency-proof.yml |
| `auth-postgres-concurrency.integration.test.mjs` | no | no | yes | auth-concurrency-proof.yml, pending-approval-ux-coherence.yml |
| `cashier-billing-negative-failure-cases.integration.test.mjs` | yes | yes | no | none |
| `cashier-billing-postgres.integration.test.ts` | no | yes | no | cashier-subscription.yml |
| `cashier-downgrade-grace-postgres.integration.test.ts` | yes | yes | no | cashier-subscription.yml |
| `cashier-full-lifecycle-postgres.integration.test.ts` | no | yes | no | cashier-subscription.yml |
| `cashier-historical-operation-postgres.integration.test.ts` | no | yes | no | cashier-subscription.yml |
| `cashier-operational-cutoff-postgres.integration.test.ts` | no | no | no | cashier-operational-cutoff.yml |
| `cashier-operator-logout-pin-postgres.integration.test.ts` | no | yes | no | cashier-operational-cutoff.yml |
| `cashier-operator-own-history-scope-postgres.integration.test.ts` | no | yes | no | cashier-operational-cutoff.yml |
| `cashier-subscription-postgres.integration.test.ts` | yes | yes | no | cashier-subscription.yml |
| `catalog-cashier-compensation-history-postgres.integration.test.ts` | no | yes | no | cashier-operational-cutoff.yml |
| `catalog-variant-inventory-history-postgres.integration.test.ts` | no | no | no | none |
| `catalog-variant-promotion-survival-postgres.integration.test.ts` | no | no | no | none |
| `catalog-variant-removal-history-conflict-postgres.integration.test.ts` | no | no | no | none |
| `catalog-variant-row-preservation-postgres.integration.test.ts` | no | no | no | none |
| `catalog-variant-signature-postgres.integration.test.ts` | no | no | no | catalog-variant-signature-schema-contract.yml |
| `emergency-read-access-postgres.integration.test.ts` | no | no | no | none |
| `failed-setup-cleanup-postgres.integration.test.mjs` | yes | yes | no | none |
| `full-schema-restore-postgres.integration.test.mjs` | yes | yes | no | none |
| `global-merchant-auth-bootstrap-postgres.integration.test.mjs` | yes | yes | no | global-merchant-golden-journey.yml |
| `global-merchant-golden-journey.integration.test.mjs` | yes | yes | no | global-merchant-golden-journey.yml |
| `global-merchant-postgres-http-journey.integration.test.ts` | yes | yes | no | golden-journey.yml |
| `knowledge-learning-cycle-postgres.integration.test.ts` | no | yes | yes | none |
| `knowledge-management-postgres-cutover.integration.test.ts` | no | no | yes | dashboard-channel-coherence.yml |
| `knowledge-postgres-lifecycle.integration.test.ts` | no | no | yes | none |
| `knowledge-tenant-rls.integration.test.mjs` | no | yes | no | foundation-integration-final-gate.yml |
| `location-inventory-authority-postgres.integration.test.ts` | no | no | no | location-inventory-authority.yml |
| `merchant-channels-postgres-http.integration.test.ts` | no | no | no | dashboard-channel-coherence.yml |
| `merchant-customer-payment-authority-postgres.integration.test.ts` | no | yes | no | location-routing-engine.yml |
| `merchant-deletion-cashier-lifecycle-postgres.integration.test.ts` | no | no | no | merchant-deletion-cashier-lifecycle.yml |
| `merchant-deletion-physical-media-postgres.integration.test.ts` | no | no | no | merchant-deletion-physical-media.yml |
| `merchant-deletion-provider-identifiers-postgres.integration.test.ts` | no | no | no | merchant-deletion-provider-identifiers.yml |
| `merchant-deletion-tenant-rls.integration.test.mjs` | yes | yes | no | none |
| `merchant-management-postgres.integration.test.ts` | no | no | no | none |
| `merchant-management-tenant-rls.integration.test.mjs` | no | yes | no | foundation-integration-final-gate.yml |
| `merchant-password-recovery-postgres.integration.test.ts` | no | no | no | none |
| `merchant-regional-postgres-http.integration.test.ts` | no | no | no | merchant-regional-postgres-authority.yml |
| `merchant-retention-postgres.integration.test.ts` | no | no | no | none |
| `merchant-settings-clock.integration.test.mjs` | no | no | no | foundation-integration-final-gate.yml |
| `merchant-settings-postgres-http.integration.test.ts` | no | no | no | merchant-settings.yml |
| `meta-live-reply-postgres.integration.test.ts` | yes | yes | no | foundation-integration-final-gate.yml, meta-webhook-pipeline.yml |
| `meta-oauth-operational-cutoff-postgres.integration.test.ts` | no | no | no | meta-oauth-operational-cutoff.yml |
| `meta-page-directory-restricted-rls.integration.test.mjs` | yes | yes | no | none |
| `meta-webhook-postgres-ingress-cutover.integration.test.ts` | yes | yes | no | meta-webhook-postgres-ingress-cutover.yml |
| `observability-mounted.integration.test.mjs` | no | no | no | observability-mounted.yml |
| `owner-admin-postgres.integration.test.ts` | no | no | yes | none |
| `owner-break-glass-recovery.integration.test.ts` | no | no | no | owner-break-glass-recovery.yml |
| `postgres-outage-recovery.integration.test.mjs` | no | no | no | postgres-outage-recovery.yml |
| `production-postgres-rls-security.integration.test.ts` | no | yes | yes | foundation-integration-final-gate.yml |
| `queue-expired-lease-race.integration.test.mjs` | no | no | no | foundation-integration-final-gate.yml |
| `reply-addon-refund-postgres.integration.test.mjs` | yes | yes | no | none |
| `reply-cross-cycle-refund-postgres.integration.test.mjs` | yes | yes | no | none |
| `runtime-authorities-postgres.integration.test.ts` | no | no | no | none |
| `saas-billing-authority.integration.test.ts` | no | yes | yes | none |
| `saas-billing-negative-failure-cases.integration.test.mjs` | yes | yes | no | none |
| `saas-billing-sql-failure-recovery.integration.test.mjs` | yes | yes | no | none |
| `subscription-entitlement-postgres.integration.test.ts` | no | yes | yes | global-subscription-golden-journey.yml |
| `subscription-http-postgres-golden-journey.integration.test.ts` | no | no | no | global-subscription-golden-journey.yml |
| `subscription-reminder-rls.integration.test.mjs` | no | yes | no | foundation-integration-final-gate.yml |
| `superqi-sandbox-billing.integration.test.ts` | no | yes | yes | none |
| `support-image-write-order-postgres.integration.test.ts` | no | no | no | foundation-integration-final-gate.yml |
| `support-postgres-cutover.integration.test.ts` | no | no | no | none |

Success criterion met: remaining direct-entrypoint coverage is enumerated without running a possibly mutating suite. Uncovered files must not be run directly against an arbitrary DATABASE_URL. Do not add the strict attestation guard blindly to a legacy service-container workflow; migrate its workflow to the disposable runner or provide an equivalent owned target proof first. Static/transitive DB imports require preloader protection or import restructuring. Existing issue020 remains open for this broader scope; no duplicate finding. Five priority entrypoints and common runner safety are already proven and were not independently rerun for this inventory.

Follow-up in this checkpoint: merchant-password-recovery-postgres.integration.test.ts gains direct guard and isolated selection; current markers17/selection32, uncovered32 (same64 candidates). Two actual local invocations reject before application DB imports; HTTP functionality awaits CI. Original inventory table remains an exact sourcefc1ee417 snapshot.

SEQ-21 prepared newrestricted HTTP integrationcandidate with directguard/selectedrunner:65 textual integrationcandidates,18directmarkers/33selectedintegrationfiles,32outsideboth. authcutover non-integration test additionallyselected (total34distinctfiles/35restorephaseinvocations). Countsare scoped inventories, not exhaustive transitive safety closure. Newfixture onlylocalrefusal/syntaxproven, DBpending.
