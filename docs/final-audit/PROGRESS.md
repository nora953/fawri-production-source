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

## 2026-10-11 — Paid cashier order reconciliation source proof

`cashierBillingAuthority.ts:1011-1218` serializes provider events via transaction advisory lock, rejects cross-order payment reference reuse, and records `paid_reconciliation_required` for amount mismatch (1116-1143), payment received after order expiry (1151-1168), and caught `CashierBillingAuthorityError` during entitlement application (1171-1217). Thus paid-but-not-applied is explicitly modeled, narrowing prior risk. Crucial follow-up: if `applyPaidOrder` raises a PostgreSQL statement error rather than an application error, transaction rollback may prevent the reconciliation row from persisting; inject failure on disposable DB and verify durable recovery/operational queue. Also verify duplicate-event and payment-reference uniqueness constraints and operator handling of reconciliation. No runtime tests performed.

## 2026-10-11 — SaaS paid-event reconciliation parity

`artifacts/api-server/src/services/saasBillingAuthority.ts:935-995` applies paid plan, writes `saas_entitlement_applications`, marks order paid, and records event inside checkout-event transaction. On `SubscriptionPlanCycleError` it instead records `paid_reconciliation_required` with reason code. Other exceptions are rethrown; a PostgreSQL statement failure may abort the transaction and prevent in-transaction reconciliation persistence. This mirrors the cashier flow (`cashierBillingAuthority.ts:1171-1218`) but has distinct handled error classes. Require disposable-DB fault injection and provider-event replay recovery proof for both, and operator reconciliation workflow proof. Source review only; no DB writes or provider calls.

## 2026-10-11 — SaaS provider event replay source review

`saasBillingAuthority.ts:739-795` gates provider events to test_fake in test and SuperQi sandbox outside production, requires `signatureVerified === true`, IQD currency, and uses transaction advisory lock keyed by provider/event ID. Duplicate event IDs for same order return duplicate; reuse across orders yields 409. `:851-864` checks provider payment reference collision across orders, but the visible SELECT row-lock does not establish a unique index or serialize an absent-row race. Verify DB unique constraints and concurrent payment-ref replay on disposable DB. Compare cashier's separate provider-payment-ref advisory lock (`cashierBillingAuthority.ts:1095-1115`); SaaS has only event-ID advisory lock in reviewed segment. Do not label this a confirmed exploit absent DB schema proof. No provider calls or database mutations.

## 2026-10-11 — SuperQi sandbox transport timeout and request identity

`artifacts/api-server/src/services/superQiSandboxTransport.ts` reviewed on main. `createSuperQiSandboxPayment` posts to sandbox `/payment` with a UUIDv4 `requestId`, amount, IQD currency and order ID in `additionalInfo`; validates response requestId/amount/status CREATED/formUrl HTTPS and expected sandbox host. `loadConfig` forbids NODE_ENV=production. The transport `SuperQiFetch` init type exposes method/headers/body only; `defaultFetch` delegates directly to global `fetch` without an explicit AbortSignal/deadline in this module. Combined with checkout provider call inside DB transaction, upstream stalls may hold transaction resources. Provider-side idempotency of requestId is not proven by this source; avoid assuming retry safety. Test timeout/ambiguous upstream success, recoverability and provider idempotency with mock and disposable DB. No provider call or DB mutation.

## 2026-10-11 — SuperQi sandbox webhook signature and status query

`superQiSandboxTransport.ts:370-394` status lookup checks the returned paymentId matches requested paymentId; both status GET and create POST use the same fetch transport without explicit per-call deadline. `:409-445` builds webhook signature input from paymentId, amount.toFixed(3), currency, creationDate and status, verifies RSA-SHA256 with configured public key; signature input does not include requestId, orderId, canceled or confirmedAmount. This is not proof of forgery: audit the webhook route's signed-field binding, trusted provider status re-query, payment/order matching and replay controls before concluding. Test signed-field tampering, unsigned-field tampering, duplicate events, mismatched paymentId and status query failure with mocks/disposable DB. No live payment or DB mutation.

## 2026-10-11 — Sandbox webhook confirmation audit

Reviewed `artifacts/api-server/src/services/superQiSandboxWebhook.ts:177-286`. After signature verification, terminal events trigger a gateway status query; payment identity, status, cancellation, currency and amount are compared. Confirmed gateway request/payment identifiers are used to locate the billing order across SaaS and cashier authorities, with ambiguous matches rejected. This reduces the earlier concern about unsigned webhook fields. Remaining isolated tests: provider query failure, duplicate notification, ambiguous billing reference and concurrent reference attachment. Source inspection only; no live provider call or database write.

## 2026-10-11 — SuperQi integration test coverage and isolation

Reviewed `artifacts/api-server/tests/superqi-sandbox-billing.integration.test.ts` (265 lines). Test at lines 89-236 covers sandbox checkout creation, duplicate idempotency key, signed provider-confirmed SUCCESS webhook, duplicate webhook outcome, and exactly one SaaS entitlement application. Test at 238-265 rejects invalid RSA signature before provider status fetch. However, first test calls `cleanup()` DELETE accounts, `seedMerchant()` INSERT accounts and merchants, and uses `DATABASE_URL` presence as only visible precondition (lines 31-55, 89-91, 142-143, 232-235). It is DB-mutating and must NOT run against Neon staging or production. No tests in this file explicitly cover concurrent webhook processing, upstream timeout, DB failure after provider confirmation, cross-authority reference collision, altered unsigned fields or paid reconciliation persistence. These are coverage gaps in this file, not proof no other tests exist. Next: inspect schema constraints on billing order/provider event identities and add disposable-DB preflight guard before execution. No test executed.

## 2026-10-11 — SaaS billing test coverage

Reviewed `artifacts/api-server/tests/saas-billing-authority.integration.test.ts` on main. Tests cover duplicate checkout, duplicate payment notification, successful subscription application, refund, late payment requiring reconciliation, and amount mismatch. The test suite writes and deletes database records and checks only that DATABASE_URL exists. It must run only against a disposable test database. Database statement failure and simultaneous payment-reference reuse remain unverified in this suite. Review was read-only; no tests executed.

## 2026-10-11 — Billing SQL migration uniqueness proof

Read `lib/db/drizzle/0006_saas_billing_authority.sql` and `lib/db/drizzle/0027_cashier_subscription_licensing.sql` on main. Migration 0006 defines unique indexes for SaaS `(merchant_id,idempotency_key)`, partial `(provider,provider_payment_ref)`, provider event ID, pending merchant order, entitlement application order and payment reference. Migration 0027 defines equivalent cashier uniqueness via constraints and indexes. These match Drizzle schema declarations and resolve the prior source/migration lookup question. Deployment-level index existence remains NOT VERIFIED until read-only PostgreSQL catalog inspection; no DB accessed or migrations run.

## 2026-10-11 — Neon connection provenance check

Read-only Neon SQL connection returned database `neondb`, role `neondb_owner`, schema `public`, and zero tables in public; the six billing tables and their indexes were absent in THIS connection. This is not the previously described populated staging runtime connection (`fawri_staging_rls_runtime`), and branch/project identity is unverified. Do not interpret as missing migrations on Fawri staging or production. Source migrations 0006 and 0027 define the billing uniqueness constraints. Must establish exact staging branch and target DB before deployed-index proof. No SQL writes or migration commands.

## Staging billing index check — 2026-10-11

Read-only Neon staging query confirmed billing idempotency, payment-reference, event identity, pending-order and entitlement application uniqueness indexes for SaaS and cashier. All inspected names match source migrations. Production and concurrency behavior remain unverified. No database changes.

## Production branch schema check

Read-only inspection found no public tables in Neon production branch; staging has 94. Production migration readiness remains blocked pending approval. No changes made.

## 2026-10-11 — Meta page directory source follow-up and stage estimates

Read `metaPageDirectory.ts`, `postgresMetaChannelAuthority.ts`, and migration `0025_tenant_rls_policy_predicate_cutover.sql`. The authoritative page-directory read uses the PostgreSQL merchant_channels table; migration 0025 defines a tenant-or-audited-admin RLS predicate for that table. This supports existing FA-I-006 restricted-role visibility concern, but does not prove an actual failure. Negative test with a synthetic page and restricted role on disposable PostgreSQL remains required. No duplicate issue created and no tests run.

User-requested planning progress estimates (NOT measured code/test coverage): FA-000 100%, FA-001 60%, FA-002 45%, FA-003 0%, FA-004 35%, FA-005 0%, FA-006 0%. Percentages are provisional, not evidence-backed pass rates or launch readiness; update only with explicit stage exit evidence. No reliable overall percentage.

## Meta RLS policy check

Read-only staging query confirms merchant_channels has policy merchant_channels_tenant_boundary with predicate fawri_tenant_or_audited_admin(merchant_id). Source page-directory lookup uses a general transaction without merchant context. FA-I-006 remains an untested integration risk, not a confirmed runtime failure. No changes to app or database.

## SuperQi sandbox checkout reference review

Source review: `superQiSandboxWebhook.ts` attachProviderPaymentReference checks for another order using provider_checkout_ref, then updates the matched order in separate pool queries. This does not by itself establish atomic exclusion between concurrent attachments. Previously verified billing uniqueness covers provider_payment_ref, a distinct field. Treat as concurrency test gap, not a proven exploit. `superQiSandboxTransport.ts` defaultFetch delegates directly to fetch; explicit request timeout not visible there. No tests executed; use disposable fixtures for concurrency proof.

## SuperQi network timeout source verification

`superQiSandboxTransport.ts` createSuperQiSandboxPayment and getSuperQiSandboxPaymentStatus both use fetchImpl without an explicit request deadline. SuperQiFetch init type exposes method, headers, and body but no AbortSignal. Default fetch delegates directly to global fetch. A network-stall regression test is needed before remediation; no runtime failure claimed. No tests or code changes.


## 2026-10-11 verified CI runner inventory — continuation

- Current `main` `.github/workflows/quality-gates.yml` is the **Final quality gates** workflow (not `.github/workflows/ci.yml`). It has `quality-tool-tests`, `full-typecheck`, `full-build`, and `translation-structure-audit` jobs. The `full-typecheck` job explicitly enumerates API `tests/*.test.ts` **excluding** `*.integration.test.ts`; its additional frontend and contract tests do not establish PostgreSQL integration-suite coverage. The frontend TypeScript unit suite runs separately. This is a **coverage boundary**, not a CI failure.
- Current `main` `artifacts/api-server/tsconfig.json` has `include: ["src"]`; the API package typecheck alone therefore does **not** establish that `tests/*.ts` were typechecked. This distinction applies even if CI is green.
- `artifacts/api-server/tests/merchant-reply-entitlement.test.ts` uses temporary local JSON fixtures and cleanup; `observability-components.test.ts` covers readiness fail-closed, timeout, secret-safe metrics, and runtime-role matching. Both are already eligible for the non-integration API unit-test selector, but no new execution is claimed.
- Current `main` `.github/workflows/backup-restore-drill.yml` has a disposable PostgreSQL 16 restore job and an observability contract job. Workflow existence and defined commands do not prove current run success, hosted Neon PITR restore, or durable hosted media.
- Execution boundary: repository code is readable through GitHub connector; this session has no verified local Fawri checkout or disposable PostgreSQL. No DB-writing integration test was executed, no CI rerun initiated, no application or infrastructure change made.
- Next closure evidence: enumerate other CI workflows; verify recent `quality-gates.yml` run/jobs against a specific SHA; establish disposable-only pre-import guards for unsafe integration suites (approval required); then execute restricted-role Meta and SuperQi negative cases on disposable PostgreSQL. Keep existing test-safety and release findings OPEN. **Do not increment stage percentages for this documentation update.**


## 2026-10-11 GitHub Actions run/job/step verification

GitHub connector fetched **actual jobs** (not merely workflow definitions) for prior PR #518 runs:

| Workflow run ID | Job | Job conclusion | Nuance |
| --- | --- | --- | --- |
| `38090880741` | `full-build` | success | Build job; no DB integration claim |
| `38090880741` | `full-typecheck` | success | `Run all API unit tests`, frontend TypeScript unit tests, source contracts and repository typecheck all have successful step conclusions; API selector excludes `*.integration.test.ts` |
| `38090880741` | `quality-tool-tests` | success | Quality/security tooling tests |
| `38090880741` | `translation-structure-audit` | success | Arabic, Sorani and English translation structure step success; not visual/semantic translation QA |
| `38090880764` | `lockfile-integrity` | success | Frozen install/lockfile checks successful |
| `38090880764` | `repository-security` | success | Tracked content and reachable Git history secret scans successful |
| `38090880764` | `dependency-review` | success | Dependency graph detection successful; **three subsequent conditional dependency-graph checks skipped**; do not claim they ran |
| `38090880764` | `dependency-audit` | success | Separate dependency audit command completed successfully; no severity counts extracted here |

Evidence boundary: these are **historical PR #518 run IDs**, not new runs for the current `main` SHA or the audit branch. CI job success does not establish integration DB safety, tenant RLS isolation, production Meta/SuperQi, hosted restore or UI visual QA. Do not increment stage percentages from these observations. No workflow rerun, database operation, merge, deployment or application change.


## 2026-10-11 SuperQi reference attachment — narrower source proof

Current `main` `artifacts/api-server/src/services/superQiSandboxWebhook.ts:118-160` selects `cashier_billing_orders` or `saas_billing_orders` by authority, checks `provider_checkout_ref` collision with a separate `SELECT`, then issues an `UPDATE` conditioned on same-order null/equal reference. The SQL is **not an atomic cross-order uniqueness guarantee by itself**; whether concurrent different-order requests can attach the same payment ID depends on a database unique index/constraint not yet verified in this audit. The conditional UPDATE does protect against changing a different reference on the *same* order. Keep the concurrency concern classified as `SCHEMA_AND_RACE_PROOF_PENDING`, not a confirmed exploit. The relevant column is `provider_checkout_ref`, not `provider_payment_ref`.

Current `main` `quality-gates.yml` includes a `translation-structure-audit` CI job with successful historical execution, but that only checks translation structure, not Arabic wording quality or visual layout. Historical CI run/job/step evidence is documented above. GitHub compare `main...audit/conversation-notes-reconciliation-20261011` after previous audit commits: ahead 59, behind 0, exactly three documentation files changed; no application source change. No tests run or database touched.

Next precise evidence: inspect the actual schema/migration unique indexes for both billing order tables; run two-order same-reference race only on a verified disposable DB, and test delayed/hung SuperQi sandbox provider responses. Do not infer absence of constraints from unsuccessful path guesses; no code change authorized.

## 2026-10-11 — Verified PR #520 GitHub Actions execution

Commit `73c04b4406601c596324220e965edc1b515bd3b8` has two successful PR-triggered runs, confirmed by fetching their job and step results:

- [Final quality gates, run 38154369254](https://github.com/nora953/fawri-production-source/actions/runs/38154369254): 4/4 jobs successful. `quality-tool-tests`, `full-typecheck` (including API non-integration TS unit tests, frontend unit tests, source contracts), `full-build`, and `translation-structure-audit` (Arabic/Sorani/English).
- [Final security and supply chain, run 38154369225](https://github.com/nora953/fawri-production-source/actions/runs/38154369225): 4/4 jobs successful. Repository secret/history scan, dependency review, dependency audit, lockfile integrity. In dependency-review, the dependency-graph-specific install, policy, and High/Critical audit steps were **skipped**; the independent `dependency-audit` job completed successfully.

Scope: these prove GitHub CI execution for this PR commit, not disposable PostgreSQL integration tests, Meta tenant RLS, payment failure injection, offline cashier browser QA, staging acceptance, or production release readiness. No local tests or live DB changes were made. Avoid treating this docs-only commit's CI success as functional release approval.

## SEQ-01 — current autonomous audit checkpoint

Baseline audit 09d5b8cde1145031c26da8a315f63117cf20fcbe; main d38d29229bed0f9575a98e7026e7819fe363bfd4, both verified through Git refs. Read all nine audit documents and PR #520 discussion (including last safety comments). Latest baseline PR workflows 38169088260 (quality) and 38169088266 (security) completed successfully. No DB suite run by this task. Existing clean-deployment and Meta workflows already provision PostgreSQL services; reuse the migration stabilization helper rather than schema push. New cleanup error finding indexed as DB-TEST-CLEANUP-024. Next SEQ-02: shared pre-import target attestation plus negative safety tests and aggregate teardown; then SEQ-03 isolated network CI provisioning. Work balance unavailable; no estimate of credit.

## SEQ-02 — safety implementation and isolated runner preparation

Local `node --test scripts/disposable-postgres-test-guard.test.mjs`: 15 passed, zero failed/skipped. Actual MJS remote-target rejection exercised without connecting to any DB. Shell syntax, JS syntax, workflow YAML parsing and git whitespace checks passed. Guard covers five prioritized entrypoints; teardown errors now propagate in four. New reusable Actions workflow provisions its own PostgreSQL Docker container with network none and no published port, then Node shares that loopback-only namespace, with read-only checkout/attestation mounts and only synthetic env values. Full committed migrations run with existing dependency-order stabilization, exact journal count asserted; tests sequential, zero-pass/skipped suites rejected. Trap plus always step removes owned containers/anonymous volumes. Existing four journey/Meta workflows delegate to reusable runner; foundation deletion step uses it directly. No secrets inherited and no app/main/staging edits.

Execution state: PostgreSQL migration/integration NOT RUN yet. Local default pnpm was v11 and rejected existing xlsx missing integrity; switched to repository-pinned corepack pnpm 10.26.1 without changing lockfile or policies. Pinned install was still running at checkpoint; premature API build failed with esbuild missing before install completed, not an application defect. Next: save, verify PR head, inspect Actions jobs, classify actual migration/suite failures and reconcile legacy JSON test only with evidence.

## SEQ-03a — first real isolated CI preflight (infrastructure failure, corrected)

Saved SEQ-02 as [9b1e1199](https://github.com/nora953/fawri-production-source/commit/9b1e11994a27dded1ca7c1f2328b1460af55e0a5), PR head verified. Actions [38170796690](https://github.com/nora953/fawri-production-source/actions/runs/38170796690), job 114562799838, ran checkout synthetic merge 812e409b5a87e1d03105cfe9fb5b577ce309de0b. Install, all 15 safety tests and API build succeeded. The read-only DB attestation rejected before migrations or application DB imports. Runner cleanup succeeded. Diagnosis: PostgreSQL database comments are in shared-object catalog; marker query incorrectly used obj_description rather than shobj_description. Corrected probe and tightened regression assertion; rerun required. This is an audit runner defect, not Fawri runtime failure. No application DB test executed in that run. Pinned local install and API build now succeeded, resolving earlier install timing failure.

## SEQ-03b — startup readiness race and restricted-role Meta reproduction added

[Correction e3115e16](https://github.com/nora953/fawri-production-source/commit/e3115e1644d355ae29a8fe1d19b0289bde008c51) saved/verified. Run 38170920460 / job 114563167460 failed during runner initialization: pg_isready on Unix socket observed PostgreSQL image temporary init server, followed by `database system is shutting down` at marker setup. This was before migrations/integration. Cleanup PASS. Changed readiness to loopback TCP, which temporary initialization server does not expose. No weakened target guard.

Added meta-page-directory-restricted-rls.integration.test.mjs: two synthetic tenants/pages, restricted NOLOGIN/NOBYPASSRLS role, real migrated merchant_channels RLS, reused single connection, tenant visibility/reset, global mapping expected contract, unknown page 503/no identity leak, known approved page reaches next. Desired routing assertions are deliberately not inverted to match suspected failure: FA-I-006 can become runtime-confirmed only after execution. This is test addition, NOT a confirmed result yet. Runner priority includes this sixth suite after existing five. Current new source syntax/safety checks PASS; CI pending.

## SEQ-03c — preflight diagnostics and scanner fixture correction

Commit b5e53f4a89b143ebf6636bca7a142f466ca04d4a saved/PR verified. Run 38171061437 / job 114563593426 still failed closed at the read-only identity probe, after TCP startup correction; migrations/tests NOT RUN, cleanup PASS. Add bounded stage/SQLSTATE and four identity-match booleans only, never connection URL/password/SQL error detail, to determine remaining cause without weakening validation. Local TS entrypoints were also executed with invalid remote target and both rejected before DB connection.

Security run 38171061371 repository-security job 114563593327 detected three fake credential-URL literals in the new safety-test file (lines 14,15,86); lockfile/dependency checks PASS. These are test inputs never connected, not real leaked credentials. Changed passwords to recognized `placeholder` strings. Historical fake literal detections may remain because immutable blobs are scanned; do not rewrite history or broadly disable the scanner. Record actual next security result before claiming closure.

## SEQ-04 — isolated runner identity diagnosed, wider bounded batches prepared

Saved diagnostics [f5063824](https://github.com/nora953/fawri-production-source/commit/f50638241b9e0ed3b20da8e9e0547d932963d2fa). Actual run38171237527/job114564105163 identity output: database=true, role=true, marker=true, loopback=false. PostgreSQL inet-to-text includes CIDR mask; use host(inet_server_addr()) to compare actual address correctly, while continuing to reject remote addresses. Unit assertion added for host() query. No hosted connection or application defect inferred. Migrations/integration still pending at this checkpoint.

Prepared sequential, separate-instance cashier (7 suites), billing/reply (4 suites with fake providers), and tenant/RLS (4 suites) batches after the 6 priority suites. Each independently provisions network-none DB and applies full migrations; a preceding suite failure does not prevent collecting other batch evidence. Added Node --import attestation preload, completed before test dependency graph, to protect legacy static pool-import suites inside this runner. This does NOT fix those suites' unsafe direct standalone commands; existing guard issues remain open for that scope. Fake providers only, no external network/credentials. Local safety32/32 and current repository secret scan1583 files PASS; historical scan still in progress.

## SEQ-05 — first complete 21-suite execution and evidence-driven fixture fixes

Actual run38171428265/job114564672592 on 0a101ba3 (synthetic merge3d8c9fdb): 28 committed migrations PASS in four separate network-none instances, 21 suite files executed, Node totals32PASS/14FAIL/0SKIP, cleanup PASS. Detailed per-file evidence: EXECUTION_RESULTS_2026-10-11.md. Current tenant/security/knowledge/management/reminder proofs pass; HTTP/bootstrap/merchant journey and owner-role Meta ingress pass. Failures classified before any product change: loader-worker preflight under deliberately switched role, missing writable temp data directory with readonly source, and old local-format billing fixture phones after migration0026. Corrected runner preload scope to main thread (workers share proven namespace), per-suite writable temporary data, E.164 fixture phones only. Original schema and app remain unchanged. FA-I-006 restricted-role test failed at setup, so mapping defect still NOT CONFIRMED.

New BILLING-TEST-E164-026 records fixture mismatch. AUDIT-FIXTURE-SCAN-025 current literals corrected; exact six historical fabricated findings pinned to two immutable blobs with tests rejecting wrong path/blob/rule/offset/length. Local33guard/security/redaction PASS, repository1584files scan PASS, history5916blobs scan PASS; fresh CI security pending. This is narrow fixture classification, no history rewrite/broad rule bypass. Next save and rerun modified suites; retain new application failures as issues rather than fixing business behavior.

## SEQ-06 — execution checkpoint2026-10-11

[Source284a5fa4](https://github.com/nora953/fawri-production-source/commit/284a5fa476ad975261099be74597e4cbeb23ba68), [run38171811645](https://github.com/nora953/fawri-production-source/actions/runs/38171811645), job114565798191:21files,48NodePASS/3FAIL/0SKIP;20files successful. Four isolated fresh PostgreSQL chains each28migrationsPASS; teardownPASS. FA-I-006 runtime-confirmed under synthetic restricted role: tenant isolation/reset and unknown-page safe failurePASS; global mapping0 vs2 and known page503FAIL. Three failures include parent; two functional failures. Cashier7files8passes, billing4files19passes, tenant4files14passes; deletionRLSPASS. E.164 fixture correction026verified. Final quality/security/schema and all other workflow runs on this sourceSUCCESS. Existing gaps are not closed by unrelated successes. Next: negative billing edge cases and golden journey without compatibility JSON, prepared, CI pending.

## SEQ-07/08 — saved execution and safety follow-up

Source91d639ff, run38172237280/job114567076990:49NodePASS/6FAIL/0SKIP across22files;20filesPASS; four28-migration chains and cleanupPASS. Two Meta functional failures persist. Two new SaaS functional failures runtime-confirmed (027late payment after proactive expiry;028terminal paid rewritten by amount mismatch); two parent failures included. Shared-payment-reference concurrencyPASS with applicationcollision rejection. Golden MJS noJSON fixture and no rootJSON assertionPASS, closes022/023 only. Backup/object local tests9PASS; new URL rejection initially6FAIL, then17PASS after safety-only patch including fake CLI PG routing environment stripping. No DB restore executed; direct backup tools lack attestation. Dependencyaudit2moderate precise dev paths recorded030, artifact exploitability unknown. Next short task: simultaneous checkout identity and cashier exhausted-seat/rollback/retention, guarded disposable execution only. Business fixes remain outside current authorization.

## SEQ-09 prepared — checkout concurrency and station rollback

Scope: test-only evidence additions for BILLING-IDEMPOTENCY-012 and CASHIER-STATION-ROLLBACK-019. Existing subscription test already proves final-seat serialization; added database station-count assertions after unlicensed, exhausted and losing concurrent creation, plus exact rejected code. Reason to rerun: orphan persistence was not asserted before. Added same-key simultaneous SaaS checkout test with up to6independent merchant trials, expects both callers receive one durable order; no result claimed until CI. Cashier entrypoint now has direct pre-import disposable guard and aggregated cleanup (extends020/024 coverage). Isolated workflow path trigger includes changed PostgreSQL integration tests and negative billing file. Golden fixture-free contract already established; do not re-open022/023 from unrelated failed suites.

## SEQ-09 verified; SEQ-10 prepared

[Sourcef956b689](https://github.com/nora953/fawri-production-source/commit/f956b689b0135ebe56503687a8557e8c8a579739), [run38172594527](https://github.com/nora953/fawri-production-source/actions/runs/38172594527), job114568154729:22files49NodePASS/7FAIL/0SKIP; four28migration chains andcleanupPASS. Seven failures include2parents: Meta2functional failures, SaaS3functional failures. Prior027/028persist.

BILLING-IDEMPOTENCY-012: CONFIRMED_SYNTHETIC_CHECKOUT_RACE. Trial0both callers succeeded; trial1one caller failed SQLSTATE23505, other succeeded. Test stopped on trial1; do NOT claim all6trials executed. Identical merchant/operation/plan/key concurrent requests should replay one checkout for both callers; unique constraint prevents duplication but service lacks successful conflict replay in this observed path. This is an idempotent response/reliability defect, not evidence of duplicate charge or entitlement. Source SELECT FOR UPDATE cannot lock absent key. Approved business fix and concurrent regression required.

CASHIER-STATION-ROLLBACK-019: VERIFIED_SERVICE_DB_NEGATIVES. Unlicensed insert rolls back to0stations; exhausted seat preserves1station; competing final-seat creation preserves2stations/2assignments and loser CASHIER_LICENSED_SEAT_LIMIT_REACHED. Existing cashier grace/suspension/tenant checksPASS. No HTTP/browser claim; retention016pending.

Restore evidence: [source861524b4](https://github.com/nora953/fawri-production-source/commit/861524b46143668079055a280db32e4c403d436e), [run38172470218](https://github.com/nora953/fawri-production-source/actions/runs/38172470218). Actual fresh PostgreSQL16 workflow service creation and synthetic fixed loopback URL verified in job114567775409 logs;1835byte dump checksum verified;3row restore count and source/target consistency hashPASS;2localobjectsrestore/hashPASS; secret scans/evidence uploadPASS; normal DROP database and service removalPASS. Observabilityjob11456777521312PASS/0FAIL/0SKIP; typecheckPASS. This proves tiny synthetic drill, not complete Fawri schema/full merchant recovery, external storage/PITR/RPO/RTO or production recovery.

| RESTORE-SELECT-EFFECTS-031 | CONFIRMED_TOOL_VALIDATION_GAP / FIXED_LOCAL_TEST_PASS_CI_PENDING | SELECT prefix guard accepted writable function/SELECT INTO/locking/predicate function. Four denial tests failed prepatch. Restricted verification to simple SELECT count(*) FROM unquoted optional-schema table; combined backup/restore/object tests21PASS/0FAIL/0SKIP. No SQL effects executed: missing manifest prevented tool use. Workflow now verifies owned running PostgreSQL service loopback-only published port and empty public schema before writes; cleanup no longer swallows psql failure. New workflow proof pending. |

Prepared SQL-fault/retry test: pre-importguard, synthetic verified payment, temporary trigger raisesP0001 during entitlement INSERT; captures persisted order/event/subscription state, removes trigger, tests exact eventretry/duplicate and expects durable reconciliation. New test23rdfile not executed yet; no defect claimed. Cleanup attempts trigger/function/accounts/pool independently. No hosted data/provider calls.

## SEQ-10 actual SQL fault and restore ownership; SEQ-11 prepared

[Sourcefbbb9d0c](https://github.com/nora953/fawri-production-source/commit/fbbb9d0cb8806d1e0fc7bd04d57aa7fdd34f1132), [run38172886288](https://github.com/nora953/fawri-production-source/actions/runs/38172886288), job114569035624:23files50NodePASS/9FAIL/0SKIP;20filesPASS; four28-migration chains andcleanupPASS. Nine failures include3parents;6functional failures. Prior Meta/012/027/028persist.

| BILLING-SQL-RECONCILIATION-032 | CONFIRMED_SYNTHETIC_FAILURE_RECOVERY_LIMIT / OPEN | Inject P0001 trigger on entitlementapplicationINSERT during verified syntheticpayment. Entiretransactionrollsback: orderpending,events0,applications0,subscriptions0; no durablepaid/reconciliationwork. Faultremoved/exacteventretryPASS(appliedonce,duplicateonreplay). Thus atomic rollback and repeat recovery work; a permanent error or exhausted providerretry leaves no received-payment evidence in these tables. No realpaymentorpermanentlossproven. Operator reconciliation/replay SLA and approved durable failure recording needed; cashier equivalent remains untested. |

[Restore run38172886344](https://github.com/nora953/fawri-production-source/actions/runs/38172886344) on same source, job114569035881:21unitPASS/0FAIL/0SKIP; RESTORE_SERVICE_OWNERSHIP_PASS, RESTORE_FRESH_DATABASE_PASS before writes;3rowdump/restore/hashPASS;2localobjectrestorePASS;cleanupPASS. Guards029/031now CIverified. Full Fawri schema/storage/PITR recovery remains open.

Cashier subscription legacy workflow run38172886355/job114569035424 failed disposable attestation before DB import; this was the newly protected test refusing the old push-force/service runner, not cashier business failure. Replaced only DB job with reusable isolatedcashier suite; preserve frontend/APItypecheck/policyunitjob and add previously presentfull-lifecycle suite to isolatedbatch, pendingCI.

SEQ-11 prepared: add existing Meta bot/AI full PostgreSQL testfile to new isolatedbatch with injected send/media/embedding providers and no externalnetwork/credentials; add directguard/early aggregatedpool/tempcleanup. New duplicate reservation/suspended subscription test expects sendguard rejection and zero fake sends (017). Add cross-cycle replyrefund test (018) preserving new-cycle debit after late old-cycle refund. Total26suitefiles planned, no results yet. Syntax transform and MJSchecksPASS; TypeScript type coverage for this test remains runtime/CI rather than full new compile proof.

## SEQ-11 execution / SEQ-12 report checkpoint

Source9331c489, run38173288435/job114570243330:26files52PASS/62FAIL/0SKIP;21filesPASS. Five28migration chains andcleanupPASS.52Meta failures are prematurepoolcleanupharness errors; corrected by parent t.after, rerunpending. Other10failures include3parents and7functional assertions;018oldcycle refund erasesnewcycle debit confirmed (used1->0,remaining3999->4000). Prior findingspersist. Cashier38173288724bothjobsSUCCESS:7policytests and8DBsuitefiles9passes; API/frontendtypechecksPASS. New draftreport and remainingmatrix saved; no launchclaim or applicationfix. Next27file run addsfakeembeddingknowledgecycle and correctsMeta harness.

## SEQ-13 — functional Meta rerun

Source2964aba2/run38173603888/job114571197444:27files106NodePASS/10FAIL/0SKIP,23filesPASS. Five28migration chains/cleanupPASS. Meta54passes (53subtests+parent), standaloneknowledgecycle1pass; injected providers/owner-role only.017officialtransport rejects suspendedsubscription duplicate before fakeprovider invocation; othercallers remain open.006restrictedmap failure and012/027/028/032/018persist. Testcleanup helper now logs bounded count because Node masks afterhook error aftersetupfailure;15localguardtestsPASS. Realfailedsetup/cleanupSQL-childcase prepared,28fileCIpending. Report refreshed; no applicationchange.

## SEQ-14 — failed-setup harness diagnosis; full schema restore prepared

[Source43e60b16](https://github.com/nora953/fawri-production-source/commit/43e60b164282beec5feba9546625b4c16faca21f), [run38173870161](https://github.com/nora953/fawri-production-source/actions/runs/38173870161), job114571997037:28files106NodePASS/11FAIL/0SKIP;23filesPASS. Five28migration chains andcleanupPASS. Existing10functional/parent failures persist; additional1is the new cleanup child harness, not app failure. Child unexpectedlyexit0, so DB cleanup proof not reached. Confirmed locally NODE_TEST_CONTEXT=child-v8 makes nested node --test skipfiles with a recursive-run warning; remove only this inherited context in childenvironment. No claim child fixture rows were inserted in failedrun.

Full-schema restore prepared: new separate sixth fresh offline cluster,28migrations; two synthetic merchants/channels; restricted NOLOGIN/NOSUPERUSER/NOBYPASSRLS readrole. Seed fingerprint includes publictables/RLSflags/ACLs,policies/functions,constraints/indexes,migrationjournal andfixturechanneldata. Dockerexec pg_dump/customdump, restore toemptyDB, replace only ownedsourceDB, reattest marker, compare fingerprint and rerun restrictedtenantreads without rerunning migrations. Roles remain in same disposablecluster (not cluster-role restore proof). Rawdump remains inside disposablecontainer, neveruploaded. Allcontainers/volumes/temp proof removed by existingtrap. MJS/shell/YAML/diffchecksPASS; actualrestorepending.29unique files planned,30invocations includingseed/verifyphases.

## SEQ-15 actual failed-setup cleanup and first full-schema restore

[Sourcefe892e69](https://github.com/nora953/fawri-production-source/commit/fe892e6973907e93c808f2c5af80b7273c224e9e), [run38174186237](https://github.com/nora953/fawri-production-source/actions/runs/38174186237), job114572937993:29unique files/30invocations,108NodePASS/11FAIL/0SKIP. Six fresh isolated instances each28migrationsPASS; cleanupPASS. Existing10functional/parent failures plus fullschema fingerprint comparison failure. Security/supplychain fourjobsSUCCESS onthissource; no productchange.

021/024 real failure proofPASS: child setup throws after synthetic account/merchant inserts, first SQLcleanup throws; expectedchildexit1, boundedcleanup error visible, rawerror redacted, remainingaccount0/merchant0. Later cleanup and pool end execute despite first failure. This proves common early-hook/aggregate strategy with actual DB writes/errors; it is not fault injection at every journey mutation.

Full-schema seedPASS:94publictables,45policies,3functions,28migrationrows,two syntheticconnectedchannels; restricted tenant readsPASS. Owned-container pg_dump/pg_restore commandPASS and source DB replacement/reattest completed. VerificationtestFAIL: fullfingerprint mismatch; no componentdetail yet, because assertion preceded restrictedrole reads. Do NOT call fullrestore verified or assume appdefect/data loss. Add bounded component/key/field diagnostics (no rawSQL/secrets) and run restricted tenant reads before finalfingerprint assertion. Roles remain in samecluster. Next actualrerun must identify semantic vs representation difference.

014: added nearzero half-up monthly boundary test;8localpolicytestsPASS/0FAIL/0SKIP using node --importtsx with DATABASE_URL absent. InitialtsxCLI failed sandboxIPCsocketEPERM beforetests; safe node-loader alternativePASS, no appfailure. Business choice for positive roundedzero remains policydecision. Existingcalendar/leapyear behavior alreadyCIverified, reused.016: explicitdowngradekeepselection switch cancels release + staleversion rejection prepared; directguard and aggregatecleanup added tothissuite. SyntaxPASS; DBassertionspending.

030artifact follow-up: local API build's pino-pretty.mjs.map lists fast-copy4.0.3 source; APIbuild always emits prettytransport, Dockerfile.staging copies fullnode_modules anddist withoutpruning. logger.ts skips prettytransport when NODE_ENVproduction; Dockerfile.staging sets production. Thus dev declaration does not imply artifactabsence, but defaultproductionruntime activation/exploit not demonstrated. Selector-parser frontendbuild dependency remains in copiednode_modules; not proven in browserasset. No dependency changes.

## SEQ-16 — restore difference localized; cashier retention proof

[Source3a9e83ab](https://github.com/nora953/fawri-production-source/commit/3a9e83ab580c7f0845c5b9309707901b9fe14523), [run38174557888](https://github.com/nora953/fawri-production-source/actions/runs/38174557888), job114574050281:29unique files/30invocations,108NodePASS/11FAIL/0SKIP; six28-migration chains andcleanupPASS. No newappdefect fromrerun.

Restoreverify restrictedtenantreadsPASS afteractualdump/restore. Tables/ACL/RLSflags,policies/functions,indexes,journal andfixturechannels compareidentically. Only constraint.definition differs; all638constraints and validation/deferral flags/counts preserved. SamplefullDDL notyetrecorded; semanticdifference remainsunknown. Add one original/restoredconstraint sample (publicschema metadata only) and retain finalfingerprintfailure until evidence permitsrepresentation normalization. No premature fullrestorePASS.

016explicit retention selectionPASS: keeperchange cancels its scheduledrelease, previouslykeptstation becomesrelease_scheduled; staleexpectedVersion rejected, validswitchback retainsoriginalkeeper through existinggrace/paidrenewalflow. assignseat helperis notexposedasretentionroute inreviewedsource; ordinaryassignmentnoop onrelease_scheduled isnot demonstrated UIretention failure. Officialscheduledselection servicebehaviorverified; UI/browser nottested.014nearzero proration8localpolicytestsPASS; pricingpolicydecision remainsopen.

Prepared newcashier billingnegativefile: latepaymentafterproactiveexpiry, mismatchafterappliedstate, samekey concurrentcheckout(up to6independent trials), globalpaymentrefcompetition and SQLfault/retry. Usesguard,syntheticfixtures/fakeprovider,earlyaggregatecleanup/faulttriggerremoval. SyntaxPASS; actualtestsnotrun. Next30unique files/31invocations. Updateexisting012/027/028/032 scope rather thanduplicatefindings if reproduced.

## SEQ-17 — cashier payment boundaries and restore representation evidence

Source [8dcc893e](https://github.com/nora953/fawri-production-source/commit/8dcc893ebf9c15a9162b93cb5276c392a7e4d4f9), [run 38174896098](https://github.com/nora953/fawri-production-source/actions/runs/38174896098), job 114575105770: 30 unique files/31 invocations, **110 PASS / 15 FAIL / 0 SKIP**. Six isolated PostgreSQL instances applied 28 migrations each; owned container/volume cleanup SUCCESS. Failures comprise ten existing functional/parent failures, four new cashier failures (three functional and their parent), and one restore comparison failure. These are not fifteen independent defects.

027 now confirmed for cashier as well as SaaS: matching verified payment after proactive order expiry throws CASHIER_BILLING_ORDER_NOT_PAYABLE. 028 now confirmed for cashier applied orders: a distinct mismatched-amount event rewrites applied to paid_reconciliation_required while entitlement remains applied. 032 cashier SQL trigger fault P0001 rolls back payment/application/subscription writes but leaves order pending and no durable provider-event evidence; removing fault permits exact-event retry and duplicate protection. These extend existing issue scope, not new issue IDs. No real provider charge or loss was tested.

012 remains confirmed for SaaS only. Cashier identical concurrent checkout succeeded for both callers with one stable order in all six independent trials, with no rejected SQLSTATE. Shared cashier payment-reference competition also passed. Do not generalize SaaS concurrency failure to cashier.

Full-schema dump/restore commands and restored restricted tenant reads passed. The sampled cashier_operation_attribution_identity_check differs only by flattening its leading associative AND group; 638 constraints retain counts/flags and other components match. One sample is insufficient to classify every constraint. Prepared native PostgreSQL parse/deparse normalization for CHECK constraints only, with equivalent-grouping positive canary and changed-predicate negative canary; all ACL/RLS/data/index/function/journal assertions retained. Syntax passed; actual normalization/restore proof pending.

Next guarded fixture covers addon-batch FK protection, concurrent duplicate refunds and expired-addon refund after renewal, separately from confirmed base-cycle defect018. Synthetic setup/early aggregate teardown; syntax passed, DB execution pending. Matrix expands to31 unique files/32 phase invocations. No application change.

## SEQ-18 — full committed schema restore and addon refunds verified

[Source fc1ee417](https://github.com/nora953/fawri-production-source/commit/fc1ee4171eac9b75189383539857664afa37b264), [run38175555975](https://github.com/nora953/fawri-production-source/actions/runs/38175555975), job114577082735:31 unique files/32 phase invocations, **114 PASS / 14 FAIL / 0 SKIP**. Six offline isolated PostgreSQL clusters each applied28 committed migrations; container/volume cleanup SUCCESS. Fourteen failures comprise ten functional failures and four parents across existing006/012/018/027/028/032. No new product finding.

Full committed-schema restore seed AND verify PASS. Native parser round-trips303 CHECK definitions on each side; equivalent-AND positive canary and changed-predicate negative canary PASS. Both fingerprints identical:54f2997b3d8a921daf2aa3d11bef4ab7e62114570d9ecb132cd10fe9bdee05ee.94 public tables/RLS flags/ACLs,45 policies,3 functions,638 constraint definitions/counts/flags, indexes,28 migration journal entries and two fixture channels match; restricted tenant reads PASS after real pg_dump/pg_restore. Previous mismatch is now experimentally classified as CHECK deparse representation, not data loss. This is synthetic schema/channel recovery in one owned offline cluster; roles remain pre-existing. No cluster-role/PITR/external-media/redeploy/RPO-RTO guarantee.

018 addon controls PASS (three Node tests including parent): committed FK rejects referenced batch deletion with23503; concurrent refunds credit exactly once and preserve batch identity; expired addon refund after renewal keeps current baseused1/baseRemaining unchanged and addonAvailable0. Confirmed base-cycle defect018 still FAIL. Do not conflate safe addon behavior with unsafe base refund.

020 expanded source inventory:64 candidate DB-dependent integration files,16 direct guard markers,31 isolated selections,33 outside both at sourcefc1ee417. Candidate scan is textual, excludes transitive imports and is not a mutation/CI safety proof. Add guarded merchant-password recovery entrypoint to isolated selection; two local direct invocations (missing URL and unattested hosted-shaped URL) rejected before dynamic application DB imports. New early aggregate hook registered before seed/temp/server setup. TS syntax/API typecheck/diff check PASS. Actual password recovery HTTP tamper/replay/concurrent-reset assertions pending next CI; broader32 unprotected/unselected candidates remain open. No legacy workflow references this filename literally; no blanket attestation change was made to legacy service workflows.

## SEQ-19 — password recovery proof and CI evidence reconciliation

[Source1c498c06](https://github.com/nora953/fawri-production-source/commit/1c498c06e27da42ccb73bfbadb4bd7599d9e2601), [run38175863733](https://github.com/nora953/fawri-production-source/actions/runs/38175863733), job114578004547:32 unique files/33 invocations, **115PASS/14FAIL/0SKIP**. Six28-migration chains and teardownSUCCESS. New password recovery HTTP proofPASS: tampered cookie rejected without password/version change; valid reset revokes prior sessions and increments versions; replay rejected; two concurrent confirmations serialize to200/400 with one further version change. Existing ten functional/four parent failures persist; schema restore/addon controls stillPASS. No application change.

R11 reused completed sourcefc1ee417 CI logs, not reran its proven checks. Returned20 PR workflows:16SUCCESS/4FAIL. Bot adversarial22PASS and workflow-boundary1PASS; both synthetic runtime/SQL/provider substitutes. Quality tool18PASS; source contracts386PASS/0FAIL/1SKIP (387total), APIunit818PASS/0FAIL/0SKIP, frontendTS179PASS/0FAIL/0SKIP; full typecheck/build SUCCESS. Translation structure SUCCESS; reported core777 keys and admin299 keys each in en/ar/ku, missing0/extra0; this is structural, not semantic or browser proof. Security fourjobsSUCCESS; dependency audit retains two moderate advisories030, so green blocking policy is not zero advisories.

Recorded skipped DB subtest: auth-cutover-contract.test.mjs, validated PostgreSQL merchant context reaches business routes without merchants.json authority, skip when DATABASE_URL absent. Now selected explicitly under attested isolated runner; early aggregate teardown before mutations, child stop awaits exit. Local source-only invocation10PASS/0FAIL/1SKIP; DB assertion pending. Its intentionally empty legacy fixture checks absence of legacy merchant authority, unlike removed golden JSON compatibility fixture. No standalone guard added because legacy workflows need separate migration; preloader protects selected execution.

Two other CI failures were infrastructure, not product findings: Meta pipeline audio mixed command60PASS/1FAIL/0SKIP because guarded Meta DB file was invoked on unattested legacy service; foundation knowledge-gap step failed at same pre-import guard. Corrected both workflow invocations to owned offline meta-bot runner, preserving full seed/parent/teardown and pool-contention assertion. No weakening of guard or removing business assertions. YAML, bot workflow path1test and diff checksPASS; actual workflow repair pending. Cashier reusable job failure was existing027/028/032 (policy8PASS), not new infrastructure. Isolated audit failure is existing six indexed findings. CI table/counts in CI_EVIDENCE_RECONCILIATION_2026-10-11.md. PR body updated and publication verified to current evidence before this checkpoint.

## SEQ-20 — safe legacy CI callers verified; critical UI source review

[Source05456ea9](https://github.com/nora953/fawri-production-source/commit/05456ea9c5bfdf9c007159aae0226f8c949db1e6), [isolatedrun38176210529](https://github.com/nora953/fawri-production-source/actions/runs/38176210529), job114579031278:33 unique files/34invocations, **126PASS/14FAIL/0SKIP**. Six28-migration chains/cleanupSUCCESS. auth-cutover-contract11PASS/0SKIP includes previously skipped PostgreSQL business-route assertion; empty legacy merchant fixture remains empty. NoJSON golden and fullschema recovery remainPASS. Ten existing functional failures/fourparents persist.

Legacy Meta pipeline [run38176210628](https://github.com/nora953/fawri-production-source/actions/runs/38176210628), job114579031565 SUCCESS: isolated knowledge1PASS/Meta54PASS,28migrations. Foundation [run38176210612](https://github.com/nora953/fawri-production-source/actions/runs/38176210612), job114579031408 SUCCESS: deletion1PASS plus isolatedknowledge1/Meta54PASS across two28migration chains; finalFOUNDATION_CLEAN_INTEGRATION_FINAL_PASS reached. Guard refusals from previous source repaired by safe invocation, not weakened checks. TEST_CLEANUP_FAILURE failedResources2 in isolated logs is deliberate no-DB guard unit fixture before suites; no teardown failure inferred from that expected marker. Source-linked job cleanup stepsSUCCESS.

R12 bounded source task complete (not browser/linguistic certification). Existing016 now SOURCE_CONFIRMED_UI_SELECTION_GAP / SERVICE_PASS / BROWSER_PENDING: CashierSubscriptionPanel filters release_scheduled out of loaded selection, request and checkboxes although backend accepts both; merchant cannot pick that pending-release station as replacement through this component. Service keeper switch previouslyPASS. New FAWRI-UI-006 SOURCE_CONFIRMED_LOCALIZATION_GAP: billing operation/status render raw and server English errors pass into toast in AR/KU, despite translation key parity. No runtime display test, app fix, payment breach or data leak claimed. CRITICAL_UI_SEMANTIC_REVIEW_2026-10-11.md has exact bindings/accessibility/editorial limits. Existing003 admin logs is a different surface; no duplicate016 created.

## SEQ-21 — restricted-role sensitive-session HTTP proof prepared

Bounded FA-I-007 follow-up fixture merchant-session-restricted-http-postgres.integration.test.mjs prepared, **not DB-executed yet**. Pre-import attestation runs before @workspace/db; actual local no-attestation invocation exits1 with expected refusal before DB import. Syntax/diffPASS. Owner connection reserved exclusively for setup/teardown; all newly created application pool connections use startup rolefawri_audit_sensitive_http. Fixture must assert current_user, NOSUPERUSER/NOBYPASSRLS/non-owner and allfourDMLprivileges on five sensitive tables before HTTP. Account_sessions RLSflag must befalse to model application defense rather than rely on a protective RLS predicate there. Two synthetic merchants, three bound sessions; no external provider or hosted data.

Four planned HTTP subtests: missing/tampered/wrongdevice rejection; own-only session list with no rawtokens/tokenhash and no-store; cross-merchant revoke404 versus selected-own revoke200; origin denial before logout mutation and own logout-all leaving othermerchant active. Early aggregate teardown closes HTTP, deletes own accounts, removes role grants/role, restores pooloptions, releases ownerclient and ends pool. Actual outcome/cleanup awaited in next isolatedCI,34 unique files/35phaseinvocations. Role is modeled from historical observation, not live staging role; staff/credential endpoints and complete grantleastprivilege remain openFA-I-007. No new vulnerability ID and no change to app or actual grants.

## SEQ-22 — restricted HTTP session defense verified; deployment/recovery boundaries

[Sourcefccd677a](https://github.com/nora953/fawri-production-source/commit/fccd677a1798470b3dba70e20ccbc37662177ceb), [run38176766705](https://github.com/nora953/fawri-production-source/actions/runs/38176766705), job114580690925:34 unique files/35invocations, **131PASS/14FAIL/0SKIP**; six28-migration chains/owned cleanupSUCCESS. New restricted HTTP suite5PASS (four subtests+parent). Actual applicationrolefawri_audit_sensitive_http is nonowner/NOSUPERUSER/NOBYPASSRLS; fourDMLprivileges on accounts/account_sessions/merchants/merchant_cashier_staff/cashier_station_credentials proven and allfive actualRLSflagsfalse. Own-only session list/tokenredaction/no-storePASS; no-cookie/tampered/wrong-device401PASS; crossmerchantrevoke404/ownrevoke200PASS; foreignOrigin403/no mutation and ownlogout-all preservingothermerchantPASS. This partially addressesFA-I-007 with modeled broadgrants, not actualhostedgrants/staff/credential endpoints or total leastprivilege certification. No newvulnerability.

R13source review/drill proposal saved in DEPLOYMENT_RECOVERY_REVIEW_2026-10-11.md. Clean-deployment gate is isolatedHTTP, container contract runs shellfile/default checks rather thanserverstartup, DockerfileNode22 differs fromNode24testedjourney; hostedauto-deploy/mount/roles notqueried. Catalog/supportfilesystemroots and priorreleasefreeze statements do not close existingstorage/PITR/currentfindings. No duplicate externaldependency IDs and no hostedmutation.

Prepared fixednode22-http isolated selection with sameguard/migrations/assertions; explicitruntime/auditBatch summaries, seventhfreshcluster,34unique/36phase-runtimeinvocations. Repetition technically justified by runtimeversiondelta; syntax/shell/YAMLPASS, actualNode22HTTPproofpending. This remainsNODE_ENVtest, not packagedimage/stagingproductiongate proof. Proposed role/media/rollback/recoverydrill requires approvedsyntheticenvironment and explicit hostedmutation approval for redeploy; RPO/RTO/retention undecided, not invented.

## SEQ-23 — Node22 HTTP compatibility verified; external checkout rollback proof prepared

[Source83999ff1](https://github.com/nora953/fawri-production-source/commit/83999ff1ff1986ce5284142f089b1c459abab2e9), [run38177206914](https://github.com/nora953/fawri-production-source/actions/runs/38177206914), job114581998702:34unique files/36phase-runtimeinvocations, **132PASS/14FAIL/0SKIP**; sevenfresh28-migration chains/cleanupSUCCESS. Existing HTTPassertionsPASS onactualNodev22.23.3 andv24.21.0 (runtime/auditBatch logged). Repetition reason is DockerfileNode22 versus previously testedNode24. This closes boundedcompiledAPI/testmode compatibility only; actualpackagedimage/stagingproductionstartup remainsunproved. Restricted session5PASS andfullschema recovery remainPASS. Tenfunctional/fourparent failures unchanged.

Prepared guarded billing-external-checkout-rollback-postgres.integration.test.mjs for existing013/015, **DB_NOT_RUN**. Each SaaS/cashier synthetic fixture creates a sandbox-shaped payment through injectedfetch, observes an open INSERTtransaction via pg_stat_activity, then triggers SQLP0001 on referenceattachment; mustinspect durableorderstate. Removesfault, verifies signed status-confirmed orphan webhook through injectedfetchImpl, then retries identicalbusinesskey and comparesproviderrequest/orderidentity. Statusmockcall countasserted, preventing accidentaldefaultfetch from producing falsegreen. RSAkeys are generated transiently; onlyfake credentials, no liveprovidercall. Two nestedcontracts perkind separate identityretention and orphanpaymentacknowledgment; actualoutcome awaited.

Earlyaggregateteardown removesfixturetriggers/functions/accounts/pool. Local noattestation invocationexit1beforeDB/providerimports, syntax/diffPASS. Next35unique files/37phase-runtimeinvocations. Interpretfailureas modeled reliability evidence, neverreal duplicatecharge/loss. Updateexisting013/015 rather thancreate duplicateissue IDs; external latency/actualCOMMITfailure/liveproviderretrycontract still separateproof.

## SEQ-27 (2026-10-12): evidence reconciliation

Latest completed isolated CI: run 38180374172, 132 passed, 21 failed, 0 skipped. Payment rollback and orphan webhook findings in SaaS/cashier are saved under existing 013/015 in ISSUES.md. UI language/accessibility/mobile checks remain source-only; actual browser tests not run. Hosted startup, role grants, media recovery, PITR, offline devices and real provider settlement remain unverified. No additional functional tests were executed in this documentation checkpoint. Continue from the saved evidence; no launch approval.


## Current SEQ-113 checkpoint — 2026-10-12 (supersedes historical resume notes)

SEQ109–113 completed within bounded audit scope: actual server ingestion/caller trace, mocked replay/tenant/money negatives, ACK/partial upload, device sequence/clock, source concurrency/recovery, offline validation. Baseline23563ffb; new proof27mocked-runtimePASS +18source-contractPASS,0FAIL/0SKIP. No actual browser/DB execution locally. Current-head CI reused132PASS/21FAIL/0SKIP; canonical product failures remainOPEN. New sequence/shift recovery proof gaps indexed inISSUES; existing unsigned-cache concern narrowed with runtime structural acceptance test. No functional fixes, main merge, deployment, live mutations or finance.

### Provisional whole-audit planning estimate (not release readiness)

Because a complete screen/role/scenario denominator is still missing, percentages below are transparent planning judgments, not measured pass rates. Model weights: source/caller coverage20%, automated functional execution30%, adversarial/concurrency evidence20%, target environment/browser/provider proof20%, final acceptance10%. Each column is a0–100 estimated completion of that milestone; partial tests do not earn full credit. Equal domain weights; changing scope changes estimate. This explicitly replaces arbitrarySEQ-based counting and is not a claim of universal coverage.

| Domain | Source | Functional | Adversarial | Target | Acceptance | Weighted audit estimate |
| --- | --- | --- | --- | --- | --- | --- |
| Repository/build/lineage |100|80|60|0|50|61%|
| Cashier cloud sync |100|80|50|0|0|54%|
| Cashier offline/licensing |100|50|40|0|0|43%|
| Finance/subscriptions/payments |100|80|80|0|20|62%|
| Security/auth/tenant boundaries |100|90|75|25|0|67%|
| Owner/merchant/staff dashboards |80|60|50|0|0|44%|
| Catalog/inventory/orders |100|80|50|0|0|54%|
| Reports/PDF/Excel |75|50|25|0|0|35%|
| Languages/RTL/mobile/accessibility |80|30|0|0|0|25%|
| Bot/Meta/AI integration |100|80|80|0|0|60%|
| Hosting/backup/restore/operations |100|80|50|0|0|54%|

Equal-domain mean50.8%, report **approximately50% audited toward complete evidence/acceptance, plausible40–60% range**. This can be lower than earlier conversation guesses because physical/browser/hosted/provider and commercial gates are included. Passing more synthetic tests does not make an open defect ready; fixing is a separate approval scope. Commercial/legal/settlement acceptance remains an additional unverified gate, so this engineering estimate cannot estimate release date. Exact source/runtime/staging/browser labels in register remain authoritative over estimates.

NextSEQ114: prepare disposable PostgreSQL gap/backfill and simultaneous two-device stock/sale/return/replay proofs, preserving guards/tenant context; reproduce session-expiry/admin-close recovery without normal-logout shortcut. ExistingCI lacks these exact assertions. Then browserversionchange/local changed-payload/durable-outbox proofs when a browser is available. Billing/Meta/refund repair and signed-license design require separate concrete approval before application changes.
