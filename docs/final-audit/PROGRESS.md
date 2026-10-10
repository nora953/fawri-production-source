# Fawri final audit — resume here

Updated: 2026-10-10
Status: **FA-000 PASS; FA-001 IN PROGRESS**.
Main baseline at last verified merge: `a083262e68557ec6838799da5a869e90b909b56f` (PR #478).

## Completed
- FA-000 continuity ledger: PR #477 squash-merged as `3b51731758ff3e15728bdb61bafb4149976f6882`.
- FA-001 enumeration: 225 branches across GitHub pages 100 + 100 + 25; inventory documented by merged PR #478.
- Priority comparisons: independent cashier licensing branch is 0 ahead/44 behind; FastPay readiness branch 0 ahead/36 behind.
- Old cashier entitlement branch is 3 ahead/179 behind. Its `0027_cashier_subscription_entitlement.sql` is an **obsolete/incompatible design**, not an appropriate direct merge: current main has `0027_cashier_subscription_licensing.sql` and a broader cashier subscription schema. Database migration execution remains unverified.
- `fix/cashier-first-station`: 1 ahead/177 behind, 4 changed paths; main already contains `cashierStationCreation.ts`. Patch equivalence not yet proven.
- `fix/admin-retired-subscription-migration`: 2 ahead/6 behind; requires review.
- Draft PR #476 `fix/staging-admin-ui-qa`: 4 ahead/2 behind, 7 files; author says build/typecheck passed but visual QA pending. Do not merge until verified.
- `feature/whatsapp-offline-foundation`: 240 ahead/3233 behind, 93 changed files; high-risk legacy branch, do not merge blindly.
- `docs/staging-ui-findings`: 1 ahead/2 behind, contains the 2026-10-09 admin UI findings; not on main at same path.

## Next exact action
1. Continue read-only comparison of remaining branches; classify using content equivalence as well as ahead/behind (squash merges change ancestry).
2. Review PR #476 against the three staging UI findings; run or inspect CI and real visual QA before any merge.
3. Verify current cashier migrations/schema against live Neon PostgreSQL in FA-004; absence of legacy file is not a defect.
4. Record further evidence and update this ledger via a PR. Never modify protected main directly.

## Restrictions
No unapproved application code changes, branch deletion, database changes, secret exposure or production deployment. Do not repeat historical 16 core phases without a scoped reason.

## 2026-10-10 staging verification addendum
- Railway `fawri-staging/fawri-web` deployment status SUCCESS; user supplied `/ops/readiness` response with `ready`, `postgresql_authority: up`, and `production_release_configuration: up` at `2026-10-10T18:17:58.935Z`.
- User confirmed `FAWRI_DEPLOYMENT_MODE=staging`, `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE=fawri_staging_rls_runtime`. The readiness code compares `current_user` with the expected role; it does not switch roles itself. No secret values recorded.
- Neon `staging-runtime` branch `br-falling-dust-b1km4gix`: 94 public tables, 28 Drizzle migration records, 1 merchant, 0 Meta channels; 45 RLS-enabled and 49 without RLS. Restricted role has no BYPASSRLS but broad grants to selected non-RLS auth/cashier tables. Default Neon `production` branch is distinct and missing the migration ledger.
- Open: FA-I-006 Meta page routing under RLS; FA-I-007 sensitive non-RLS table grants and application authorization; FA-I-008 branch targeting; FA-I-009 scope of readiness proof. No live data mutation, branch merge, production deploy, or credential changes.
- Next: inspect targeted API authorization paths and run negative tenant isolation / Meta mapping tests on a disposable local database. Do not declare FA-004 PASS from readiness alone.

## FA-I-006 follow-up: source review (2026-10-10)
- The Meta webhook middleware reads the page-to-merchant directory before merchant operational authorization. An unresolved page returns HTTP 503.
- PostgreSQL-only mode uses the channel mapping authority; its all-pages query has no tenant context.
- Migrations 0024 and 0025 establish a tenant-or-audited-admin RLS predicate for merchant_channels.
- The existing Meta ingress integration test is restricted to local fawri_ci and does not prove staging restricted-role behavior.
- Next: reproduce with a synthetic connected page and a restricted role on disposable PostgreSQL. Do not alter live Neon or bypass RLS.

## FA-I-006 reproduction matrix and scope (2026-10-10)
Source verified: `merchantWebhookAccess.ts`, `metaPageDirectory.ts`, `postgresMetaChannelAuthority.ts`, `operationalPostgresAuthority.ts`, `meta-webhook-postgres-ingress-cutover.integration.test.ts`.

Required disposable-PostgreSQL cases (not executed yet):
1. Connected page A for approved merchant A under restricted NOBYPASSRLS role, no tenant/admin context: verify whether `listActiveMetaPageMappingsAuthoritative()` returns page A and middleware calls next. Record actual `current_user` and RLS policy state.
2. Same fixture with tenant context A inside transaction: verify page A visible and merchant B page invisible; reset context on pooled connection.
3. Unknown page: expect HTTP 503 `META_PAGE_DIRECTORY_UNAVAILABLE` (current contract); ensure no merchant data is leaked.
4. Suspended merchant with known page: ensure terminal event handling without enqueue, as current local-only ingress test expects.
5. Batch with one valid and one unknown page: inspect all-or-nothing 503 and webhook retry/idempotency consequences; do not label a defect without an expected-contract decision.
6. Prove no tenant bypass or unrestricted global page-directory grants are introduced by any fix.

Execution blocker: no verified disposable local PostgreSQL runtime attached to this audit session. The existing local-only integration test does not switch to a restricted role. Do not run its mutating fixtures on Neon staging. This is an OPEN_PROOF, not PASS or confirmed production failure.

Audit completion tracking: planning estimate 30/100 overall, unchanged; do not increment until an actual restricted-role test or another closure criterion is evidenced.

## 2026-10-11 audit continuation — current resume checkpoint
- Source of truth is current GitHub `main`; PRs #477-#512 include a series of docs-only audit register merges. #511 was superseded by conflict-free #512, squash merged as `c43fd488ba8386d5b8b4367d30253393e9131651`. Docs PR #510 merged as `6d805640ef27da3ba2acc441830f05ea1ede6e9b`. No application code changes or runtime test executions were made in these audit PRs.
- Current conversational planning estimate: **54/100 overall audit coverage**, not test coverage or launch readiness. Historical 30/100 in earlier section is superseded for this checkpoint, but remains preserved as history. Estimate is qualitative; do not count a docs merge as new tested functionality.
- Railway staging project `fawri-staging`, service `fawri-web`: read-only environment status showed online, one running replica, zero recent deployment failures and zero mounted volumes/buckets. A docs-only `main` merge (#506) triggered a Railway deployment, which completed SUCCESS at 2026-10-10T20:56:15Z. Thus documentation merges may trigger staging deployments automatically; review deployment triggers before further merge cadence. Staging health is not full functional QA.
- Source-confirmed release risks: catalog and support image filesystem-only storage with no verified persistent mount; production `launch_ready` hard-blocked by five unconditional external evidence codes; FastPay production adapter pending; no hosted backup/PITR restore proof; Meta restricted-role page directory unresolved; some DB integration tests lack disposable-only URL guards. Detailed evidence and IDs live in `AUDIT_REGISTER.md`.
- Legacy support JSON routes are mounted after PostgreSQL support routes and a production fallback guard that returns HTTP 410 when operational PostgreSQL authority is required; HTTP behavior still needs safe negative tests.
- **Next exact actions:** (1) inspect current GitHub and Railway deploy SHA/status without touching secrets; (2) verify CI and current PR status; (3) prioritize a remediation acceptance matrix for persistent media, release-gate clearance, DB test safety and Meta RLS, requiring explicit authorization before application code or infrastructure edits; (4) run only verified disposable local tests, never against staging/production; (5) defer final visual QA and domain cutover until safety/functional gates pass.

## 2026-10-11 database test audit checkpoint

Current qualitative planning estimate is 70/100 (user's latest estimate, not a test-pass rate). PR #520 records read-only CI evidence and an eight-suite PostgreSQL safety sample. Three billing suites import the DB module before callback-only URL-presence checks; some delete test fixture rows before seeding. Separate support, historical cashier, and Meta ingress integration tests do contain early local disposable-DB guards. No test was executed. Next: inventory all test entrypoints and workflow runners; propose a shared pre-import guard and runner-level enforcement before any application code changes. Existing test safety findings remain open; do not duplicate IDs. Do not run database-writing tests on Neon staging or production.

## Backup workflow source verification

Verified `.github/workflows/backup-restore-drill.yml` on main. It defines a disposable PostgreSQL 16 service, separate local source/restore databases, backup manifest and checksum validation, restore with source/target consistency check, disposable object-storage restore comparison, and redacted evidence artifact. This proves a defined CI drill, not that it ran successfully in the current audit or that a hosted Neon/PITR or durable production media restore has been proven. Existing BACKUP-DRILL-001 remains open for hosted recovery evidence. No workflow executed or environment changed.

## Production launch gate verification

Read-only verification of `artifacts/api-server/src/services/productionReleaseReadiness.ts` lines 225-248: when the production release gate is required, the function always returns five external blockers (Meta, AI, billing, backup, durable support storage). `launch_ready` therefore remains false even if runtime checks pass. `artifacts/api-server/tests/production-release-readiness.test.ts` explicitly asserts blocked launch. This is intentional fail-closed behavior, not a reason to disable the gate. Existing RELEASE-GATE-STATIC-001 remains open pending approved, auditable evidence-based clearance with negative tests. No application change or test execution.

## Support image transaction review

Source review of `postgresSupportImageAuthority.ts` confirms that ticket ownership, assignment and active status are checked before image file persistence. The service then inserts message and attachment metadata in an operational transaction, and removes the written file if that transaction throws. Image reads check the attachment identifiers and optional merchant ID before resolving a filesystem path. This narrows the previously logged support write-order concern; it does not prove durable storage across deployments or runtime authorization tests. Existing support storage and test findings remain open. No test execution.

## Support attachment read authorization (source-only)

`auth-support-postgres-routes.ts` GET `/support-images/attachments/:attachmentId` requires `requireSupportViewer`: secure merchant session, or secure admin session with `manage_support`. After loading the attachment, merchant access requires matching merchant_id; a mismatch yields 404. Admin viewers with `manage_support` are not additionally restricted by ticket assignment in this GET path. File keys are validated as two safe path segments and responses set `Cache-Control: private, no-store`. This establishes merchant cross-tenant filtering in source, but leaves an explicit product-policy question about whether any support admin should read all ticket attachments or only assigned tickets. Do not claim a vulnerability without the intended admin access policy and runtime negative tests. No tests run.

## Stage-based progress reconciliation (2026-10-11)

The earlier 70/100 is a qualitative conversation estimate, NOT an independently computed completion rate. Use stage statuses instead of incrementing it without exit evidence:

| Stage | Evidence-backed status | Exit evidence still needed |
| --- | --- | --- |
| FA-000 continuity | PASS (merged audit ledger PR #477) | Keep checkpoints current |
| FA-001 GitHub inventory | IN PROGRESS (225 branches enumerated; priority comparisons documented) | Resolve remaining branches and draft PR #476 |
| FA-002 cross-system audit | IN PROGRESS (cashier, Meta RLS, media, support, billing test-safety findings) | Complete scoped coverage and negative proofs |
| FA-003 fixes/cleanup | BLOCKED ON APPROVAL | Approved fixes plus regression tests |
| FA-004 staging operational proof | PARTIAL / BLOCKED | Restricted-role tenant tests, durable media and hosted restore evidence |
| FA-005 visual QA | NOT VERIFIED | Merchant/cashier/admin multilingual responsive end-to-end checks |
| FA-006 release decision | BLOCKED | All launch gate evidence, verified main SHA and owner go/no-go |

This is a stage status matrix, not a weighted percent: stages differ in size, and no complete test inventory exists. Existing audit issue IDs remain canonical. Source reviews are not executed tests. Do not treat draft PR #520 as merged main evidence. Next: finish FA-001 inventory or establish scoped FA-002 exit criteria; then compute coverage from explicit task counts, not arbitrary percentages. No app code, database, deployment or PR merge changes.

## FastPay production readiness source check

`fastPayProductionReadiness.ts` always reports adapter_implemented=false and production_ready=false with production_adapter_pending. `fastpay-production-readiness.test.ts` asserts this remains true even with complete HTTPS configuration. This confirms existing FASTPAY-RELEASE-001; official integration, server-side settlement validation and authenticated callbacks remain launch prerequisites. Source review only; no payment tests run.

## Count-based audit register baseline (2026-10-11)

Read-only count on this PR branch: AUDIT_REGISTER.md has 49 unique evidence rows; exactly 6 are labeled CURRENT_VERIFIED and 1 HISTORICAL_PASS. The other 42 have mixed evidence/proof/pending statuses and MUST NOT be assumed all failed or all completed. ISSUES.md has 23 unique issue rows: 22 OPEN variants and 1 PENDING; no row is explicitly CLOSED. Counts are for recorded entries, not a complete normalized task inventory, so audit completion percentage and issue closure rate for the whole project remain unproven. Next: normalize status vocabulary, reconcile stale register entries against newer evidence and define stage-specific exit criteria before computing coverage. This baseline does not alter code, DB or deployment.

## FA-001 branch delta checkpoint (2026-10-11)

Compared with current main using GitHub compare: fix/admin-retired-subscription-migration ahead 2 / behind 38, files useAdminPageController.tsx and admin-retired-subscription-migration.test.mjs; fix/cashier-first-station ahead 1 / behind 209, four cashier station files; docs/staging-ui-findings ahead 1 / behind 34, only docs/qa/staging-ui-findings-2026-10-09.md. All diverged. Commit ancestry alone does not prove unmerged behavior after squash; inspect content equivalence before merge/closure. No branches merged or deleted.

## Branch content equivalence checkpoint

Compared main and historical branches: `fix/admin-retired-subscription-migration` version of `artifacts/fawri/src/pages/admin/useAdminPageController.tsx` has identical GitHub blob SHA on main. `fix/cashier-first-station` `cashierStationCreationBody` implements the same location bootstrap and recognized-location checks as main, with formatting differences; main's test includes an additional offlineAuthority=true case. These are scoped file-level findings only; remaining branch files and test execution have not been verified. Do not merge/delete either branch based on ancestry alone.

## Additional branch file comparison

`fix/admin-retired-subscription-migration`: both changed files (`useAdminPageController.tsx` and `admin-retired-subscription-migration.test.mjs`) have identical blob SHA on main; branch content is already present at those paths, though no test rerun. `fix/cashier-first-station`: `cashier-station-management-status.test.mjs` identical to main; `CashierManagementPage.tsx` differs (main is larger), so functional equivalence remains open. `docs/staging-ui-findings`: `docs/qa/staging-ui-findings-2026-10-09.md` exists on the old branch but not on main at that path. Do not merge/delete any branch automatically.

## FAWRI-UI-002 source follow-up

On main, `artifacts/fawri/src/components/admin/AdministratorsTab.tsx` permission modal places Cancel before Save in JSX inside `DialogFooter` (lines 1237-1267). `artifacts/fawri/src/components/ui/dialog.tsx` defines footer as `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`, with no explicit locale-dependent order in that component. This leaves the historical RTL action-order observation unresolved pending actual AR/KU/EN responsive rendering; source ordering alone is not visual proof. No app changes or browser tests performed.

## 2026-10-11 — Admin UI source findings pending remediation

- `FAWRI-UI-001` SOURCE CONFIRMED: `artifacts/fawri/src/pages/admin/AdminPageDialogs.tsx` DetailsModal includes bottom Close button (lines 946-950); shared `artifacts/fawri/src/components/ui/dialog.tsx` DialogContent includes automatic X (lines 57-68). Review unsaved-note protection before removing duplicate control.
- `FAWRI-UI-003` SOURCE CONFIRMED: `artifacts/fawri/src/pages/admin/AdminPageSections.tsx` LogsTab falls back to raw `action_type` for unknown codes (lines 602, 628-629), and renders `log.reason` directly (lines 636-640). Needs localized display mapping while preserving raw audit records.
- Merchant notes UNSAVED-CHANGE RISK (not runtime reproduced): DetailsModal uses local `noteText` and explicit `onSaveNote(noteText)`; inspected dismissal paths have no local dirty-state check. Review parent close handler and test before remediation.
- `FAWRI-UI-002` remains RTL visual QA pending; source trace recorded earlier. No source code, database or deployment changes made.

## Audit throughput and count clarification

`ISSUES.md` previously held 23 issue-table rows covering 27 unique issue identifiers (some rows combine IDs). Four distinct UI identifiers `FAWRI-UI-001` through `FAWRI-UI-004` were appended in a separate table on this branch, giving **31 unique tracked issue IDs**, not 31 confirmed defects; 001 and 003 source-confirmed, 002 visual pending, 004 investigate. `AUDIT_REGISTER.md` previously contained 49 evidence IDs; do not treat evidence IDs as completed audit tasks. This is a documentation-count reconciliation, not a project completion percentage. Continue batch auditing; never run mutating PostgreSQL suites on staging/production.

## 2026-10-11 — Parent callback and audit log fallback traced

On main `AdminPageView.tsx` lines 762-776, `DetailsModal` receives `onClose={() => setDetailsMerchant(null)}` and `onSaveNote={(note) => void doSaveNote(detailsMerchant.id, note)}`. The child `AdminPageDialogs.tsx` has local `noteText` edited via Textarea and saved via separate button; dismissal does not check dirty state in either inspected callback. Thus UI-004 is a source-supported unsaved-draft loss path (not browser-reproduced); async save confirmation also warrants separate review because the child immediately toasts success while parent discards the promise.

On main `AdminPageSections.tsx` LogsTab `getLocalizedDetails` maps recognized event types but its default returns `log.details` raw (lines 457-547). Unknown action labels use `actionLabel[action] ?? action` and reasons use `log.reason` raw. UI-003 therefore has three source-confirmed raw display paths: action, details and reason. Preserve stored codes; localize presentation with a safe unknown fallback.

## 2026-10-11 — Merchant notes remediation contract review

Source proof: `AdminPageDialogs.tsx` DetailsModal types `onSaveNote: (note: string) => void` (line 562), initializes `noteText` from `notes` and syncs on `[merchant.id, notes]` (570-573), calls save and immediately shows success toast (935-938). `AdminPageView.tsx` passes `(note) => void doSaveNote(detailsMerchant.id, note)` (772); `useAdminPageController.tsx` performs asynchronous PUT, handles HTTP/response errors internally and returns no success/failure value (1244-1269). Thus simply awaiting the existing callback would not work: the parent discards the Promise, and the controller catches errors. Approved fix should change callback contract to return an explicit success/failure result or propagate failure; show success only after confirmed PUT; disable repeat submission while pending; protect dirty notes against X, footer Close and overlay/Escape dismissal. Shared DialogContent adds X unconditionally (dialog.tsx 57-68); change should be scoped to merchant details, not globally remove X. Source analysis only; no code fix or browser proof.

## 2026-10-11 — Merchant note dismissal surface completeness

`AdminPageDialogs.tsx` DetailsModal has `<Dialog open onOpenChange={onClose}>` (line 689), footer Close invokes `onClose` (947), and the shared DialogContent includes its own Radix X. No `onEscapeKeyDown`, `onPointerDownOutside`, or `onInteractOutside` handler is present in that modal; Radix's actual dismissal behavior needs focused browser testing. Dirty state must be checked for every dismissal entry, including the onOpenChange path. The notes tab is gated by `canManageNotes`, while `noteText` is local state; test note editing and switching merchants as well as close and async save. This is a source-based test design refinement, not runtime proof.

## 2026-10-11 — Cashier first-station historical branch source reconciliation

Compared `artifacts/fawri/src/pages/dashboard/CashierManagementPage.tsx` on main (1001 lines) against `fix/cashier-first-station` (885 lines). Both call `cashierStationCreationBody` with name, locationId, locations, locationsLoaded and offlineAuthority, and both POST the validated body to `/api/cashier/management/stations`; station configuration PATCH logic inspected is equivalent. Main adds entitlement-based gating (`cashierManagementActive` from entitlement state `active`) for Add Station and edit controls, absent on old branch. Main Add Station submit itself is disabled by `busy || !stationCreateBody` rather than explicitly checking entitlement; the launch button is entitlement-gated. This is not proof of server authorization, and requires API permission/entitlement negative test. Do not overwrite main with old branch. Full-page equivalence and tests remain unverified.

## 2026-10-11 — CASHIER-STATION-ENTITLEMENT-011 server source proof

Located POST `/cashier/management/stations` in `artifacts/api-server/src/routes/cashier-staff-operations.ts` lines 280-301: requires merchant authority and derives merchantId from secure session; calls `createCashierStationAuthoritative`. In `services/postgresCashierStaffAuthority.ts` lines 901-978, station insert and `assignCashierStationSeatInTransaction` execute within `withMerchantOperationalTransaction`. In `services/cashierEntitlementAuthority.ts` lines 608-676, seat assignment evaluates entitlement and asserts `active` (620-621), then enforces licensed seat count (636-652). Thus **source-level server enforcement present**, no source evidence of inactive-state or over-seat creation bypass through this route; transactional rollback expected if seat assignment fails. Reclassify CASHIER-STATION-ENTITLEMENT-011 as SOURCE_GUARDED_NEGATIVE_TEST_PENDING, not confirmed bug. Need disposable-DB negative tests for inactive/grace/restricted/suspended, seat limits, rollback, merchant isolation and concurrent requests. No database test executed.

## 2026-10-11 — Cashier station seat concurrency source follow-up

`cashierEntitlementAuthority.ts` subscriptionRow lines 243-259 uses `SELECT ... FOR UPDATE` when `lock=true`. `assignCashierStationSeatInTransaction` lines 615-619 calls it with `true`, then checks `active` entitlement and counts assignments before inserting a seat. `postgresCashierStaffAuthority.ts` lines 929-977 wraps station insert and seat assignment in one merchant operational transaction. This provides source-level subscription-row serialization for concurrent seat assignments and rollback-on-error design; test with two concurrent creates competing for one seat on a disposable PostgreSQL DB before marking race proof PASS. Scheduled downgrade helper lines 261-270 explicitly preserves current licensed stations through 7-day grace, while new station creation requires active state. No runtime execution or database mutation.

## Cashier billing boundary audit — 2026-10-11

Source: `artifacts/api-server/src/services/cashierEntitlementAuthority.ts` lines 132-241. Billing-month addition clamps the day to the next month's last day. Additional-seat proration uses remaining milliseconds, BigInt arithmetic and whole-IQD half-up rounding; zero-IQD results are rejected, as are requests at/after cycle end. Entitlement changes from active to grace at expiry and to restricted at grace end. Follow-up: test leap years, month ends, exact expiry, grace end, and near-expiry sub-0.5-IQD amounts. Decide whether near-zero proration should be rejected or charged a minimum before modifying code. Source review only; no tests run.

## Cashier checkout idempotency source audit — 2026-10-11

`routes/cashier-subscription-operations.ts:97-183` requires secure merchant session, positive integer requested seats and a nonempty idempotency key for checkout. `services/cashierBillingAuthority.ts:455-637` checks PostgreSQL authority, merchant approval, expires old pending orders, queries duplicate `(merchant_id,idempotency_key)` under `FOR UPDATE`, compares operation/seats/amount/provider (409 on conflict), reuses matching checkout, and blocks another pending checkout (409). Checkout is wrapped in `withMerchantOperationalTransaction`. The duplicate matching calculation depends on current plan/amount: retries after subscription/price changes may conflict, so test expected retry contract. Concurrent same-key requests require disposable-DB proof and verification of a unique database constraint; SELECT FOR UPDATE of absent rows alone is not a uniqueness guarantee. Provider sandbox is test-only, not production payment readiness. Source review only.

## 2026-10-11 — Checkout transaction and tenant context proof

`artifacts/api-server/src/services/operationalPostgresAuthority.ts:68-104` confirms `withOperationalTransaction` executes BEGIN, COMMIT on success, ROLLBACK on error, and releases the client. `withMerchantOperationalTransaction` sets transaction-local `fawri.tenant_id` with `set_config(..., true)` before running the callback. `cashierBillingAuthority.ts:489-637` wraps duplicate detection, pending-order check and insert in this transaction. This is source evidence of atomic rollback and tenant context, **not** a database-level unique idempotency constraint or proven cross-tenant RLS isolation. Verify actual migration index and concurrent duplicate-key behavior in disposable DB; do not run mutating tests on staging Neon.

## 2026-10-11 — Sandbox checkout transaction-boundary follow-up

Source: `artifacts/api-server/src/services/cashierBillingAuthority.ts:489-680` and `saasBillingAuthority.ts:628-657`. Both invoke the external SuperQi sandbox payment creation while a database checkout transaction remains open, then attach the provider reference before commit. This requires isolated failure-injection tests for slow provider response, successful provider checkout followed by failed DB update/commit, retry behavior and reconciliation. It is a source-level reliability risk, not an observed production incident; sandbox does not establish production readiness. No external payment or DB write was performed during audit.

## 2026-10-11 — SaaS checkout idempotency parity

`saasBillingAuthority.ts:509-595` expires pending orders, selects existing `(merchant_id,idempotency_key)` `FOR UPDATE`, compares operation, plan, amount, catalog version and provider (409 on conflict), returns a matching existing checkout, rejects any other pending checkout, and validates eligibility. The behavior parallels cashier checkout but also ties replay to the current plan price/catalog version: retry after catalog changes can return 409 rather than original checkout. Need disposable-DB concurrency/unique-index proof and a deliberate stable-retry contract. Existing row lock does not by itself serialize two absent-row inserts. No runtime tests or mutations.
