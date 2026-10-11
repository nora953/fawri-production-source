# Fawri final audit — issue and decision ledger

Issues are not automatically defects. Classify as DEFECT, PROOF_GAP, EXTERNAL_DEPENDENCY, or PROCESS.

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-001 | PROOF_GAP | OPEN | Direct Neon connector returned tool-not-found errors. Need non-secret read-only DB role/readiness evidence before FA-004 PASS. Do not infer database is absent. |
| FA-I-002 | PROCESS | OPEN | GitHub branches page 1 has 100 results; full branch pagination and comparison required in FA-001. |
| FA-I-003 | PROCESS | OPEN | [Draft PR #476](https://github.com/nora953/fawri-production-source/pull/476) awaits review and evidence; not part of core freeze automatically. |
| FA-I-004 | PROOF_GAP | OPEN | Reported Claude offline cashier integration concern not supplied verbatim. Request precise reproduction/code path before reopening existing cashier tests. |
| FA-I-005 | EXTERNAL_DEPENDENCY | OPEN | Production provider activation, backups/PITR, durable media storage and release gates tracked in [release blockers](../FAWRI_RELEASE_BLOCKERS.md). |


| FA-I-006 | CONFIRMED_RESTRICTED_ROLE_RUNTIME_FAILURE | OPEN / HIGH PRIORITY | Meta page-to-merchant routing under RLS: `listActiveMetaPageMappingsAuthoritative()` executes a cross-merchant `SELECT page_id, merchant_id FROM merchant_channels` through `withOperationalTransaction()`, which does not set `fawri.tenant_id`. Migration `0025_tenant_rls_policy_predicate_cutover.sql` sets the `merchant_channels_tenant_boundary` predicate to `fawri_tenant_or_audited_admin(merchant_id)`. If the deployed runtime role is subject to RLS and lacks a specifically authorized cross-tenant resolver, this SELECT may return zero rows. Validate actual role, table RLS flags, policy grants and a synthetic connected-page lookup in staging. Do not disable RLS or add BYPASSRLS to runtime; design a narrowly scoped, audited, least-privilege resolver if reproduction confirms. |

## Reopening a closed audit
Record exact commit/config delta or reproducible failure, affected components, minimal necessary tests, and closure evidence. No broad restart.

## Decisions
- 2026-10-10: freeze new features; stage-by-stage final audit; visual QA last.
- 2026-10-10: GitHub documents are continuity source; conversation memory is supplementary.
- 2026-10-10: Railway staging already exists; no duplicate environment creation.

## 2026-10-10 staging security follow-up (read-only)

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-007 | PROOF_GAP | OPEN / SECURITY REVIEW | On Neon `staging-runtime`, 94 public tables exist, 45 with RLS enabled and 49 without. The restricted runtime role has SELECT/INSERT/UPDATE/DELETE on non-RLS tables including `accounts`, `account_sessions`, `merchants`, `merchant_cashier_staff`, and `cashier_station_credentials`. This does not establish an API exploit: inspect authorization and least-privilege access, then run two-merchant negative access tests on disposable infrastructure before release. Do not blindly enable RLS on global/auth tables. |
| FA-I-008 | PROOF_GAP | OPEN | `staging-runtime` has 28 applied Drizzle migration records and 94 public tables; Neon's separate default `production` branch lacks the migration ledger. Verify deployed DATABASE_URL branch safely without publishing its value; never migrate the default branch accidentally. |
| FA-I-009 | PROOF_GAP | OPEN | `/ops/readiness` screenshot at 2026-10-10T18:17:58.935Z reports `ready`, `postgresql_authority: up`, `production_release_configuration: up`. Railway `FAWRI_DEPLOYMENT_MODE=staging` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE=fawri_staging_rls_runtime` were supplied by operator. This proves expected-role match for the readiness query, not complete tenant isolation or production release gate. Verify operational flows and safe branch target. |

FA-I-006 follow-up: GitHub `postgresMetaChannelAuthority.ts` still calls `listActiveMetaPageMappingsAuthoritative()` via `withOperationalTransaction()` without `fawri.tenant_id`; Neon staging has zero connected Meta channels, so real routing cannot yet be reproduced. Preserve RLS; test a synthetic mapping on disposable infrastructure and design a narrowly scoped resolver if needed.

FA-I-006 update (2026-10-10): The webhook middleware calls the authoritative page map before merchant authorization; missing page mapping returns HTTP 503. PostgreSQL-only map lookup is an all-pages query without tenant context. Migrations 0024/0025 use tenant-or-audited-admin RLS. Local Meta ingress integration tests do not prove behavior with the restricted staging role. Reproduce on disposable PostgreSQL before any least-privilege fix.

## 2026-10-11 reconciliation: actionable register findings not yet indexed in this issue ledger

This is an **index**, not a second evidence register. Detailed source observations remain in `AUDIT_REGISTER.md`; IDs below are stable existing IDs unless explicitly marked NEW. These findings are not all vulnerabilities.

| Register ID | Classification | State | Specific next proof / decision |
| --- | --- | --- | --- |
| CASHIER-SW-001 | DEFECT (source mismatch) | OPEN | Align SW cache generation and cold-start readiness check only after app-code approval; run targeted browser test. |
| CASHIER-DEMO-001 | PROOF_GAP | OPEN | Test `?demo=1` UI and normal POS runtime authorization; do not infer unauthorized sale from UI alone. |
| CASHIER-OFFLINE-001 | SECURITY_DESIGN_DECISION | OPEN | Decide whether offline license must be server-signed; test cache tampering under agreed threat model. |
| CASHIER-SYNC-SESSION-002 | PROOF_GAP | OPEN | Negative test legacy merchant-session bridge with historical operator permissions and device binding on disposable DB. |
| CASHIER-ATTRIBUTION-006 | PROOF_GAP (existing retry mitigation) | OPEN | Fault-inject after core sale commit and before attribution; retry must avoid duplicate sale and persist correct operator. |
| CASHIER-HIST-PERMISSION-009 | PROOF_GAP (PR #519, NOT MAIN) | OPEN | Historical `permission_snapshot` check absent in attribution lookup; decide historical vs current authorization policy and test unauthorized historical operator case. |
| CASHIER-HIST-IDENTITY-010 | PROOF_GAP (PR #520, NOT MAIN) | OPEN | Forge occurred_at and mismatched sequence/session; prove all binding checks across service boundaries. |
| TEST-DB-SAFETY-008 | PROCESS / TEST_SAFETY | OPEN | Add local disposable allowlist guard before running compensation-history integration suite; code approval required. |
| SAAS-BILL-TEST-001 / PG-TEST-GUARD-002 / PG-TEST-GUARD-003 | PROCESS / TEST_SAFETY | OPEN | Audit unsafe billing, subscription and RLS suites; complete CI workflow command inventory; do not run on Neon. |
| SUPPORT-IMAGE-TEST-002 | PROCESS / TEST_SAFETY | OPEN | Add disposable DB protection to support-image write-order integration suite before execution. |
| CATALOG-MEDIA-001 / SUPPORT-STORAGE-001 | EXTERNAL_DEPENDENCY | OPEN | Decide durable object storage or mounted volume; demonstrate survival across redeploy. |
| BACKUP-DRILL-001 | EXTERNAL_DEPENDENCY | OPEN | Document and safely prove hosted backup/PITR restoration separately from disposable drill. |
| RELEASE-GATE-STATIC-001 / FASTPAY-RELEASE-001 | EXTERNAL_DEPENDENCY | OPEN | Establish production Meta/AI/payment/billing evidence and release-gate clearance design. |
| FA-005 | PROCESS | PENDING | Perform owner/merchant/cashier and AR/KU/EN visual QA after functional and safety gates. |

**Status:** PR #518 verified merged; PRs #519 and #520 verified open drafts on 2026-10-11. This index is committed to PR #520 only, **not main** until reviewed and merged. CI inventory remains incomplete: attempting `.github/workflows/ci.yml` returned 404, but no inference is made about other workflow filenames. No integration test, database mutation, code change, or deploy performed.

**Resumption order:** (1) inventory CI/workflow paths and PostgreSQL integration test commands, (2) close safe-test guard coverage with approved code fixes, (3) historical operator negative test and Meta restricted-role reproduction on disposable PostgreSQL, (4) external media/backup/provider proof, (5) visual QA. Do not raise audit completion estimate for documentation-only activity.

## UI findings from historical staging notes — current main source review (2026-10-11)

| ID | Status | Evidence / next proof |
| --- | --- | --- |
| FAWRI-UI-001 | SOURCE_CONFIRMED_FIX_PENDING | Merchant DetailsModal bottom Close and shared DialogContent top X both present. Confirm unsaved note behavior before UI fix. |
| FAWRI-UI-002 | VISUAL_QA_PENDING | Permission footer has Cancel then Save and responsive flex layout; verify AR/KU/EN desktop/mobile. |
| FAWRI-UI-003 | SOURCE_CONFIRMED_FIX_PENDING | LogsTab unknown action codes fall back to raw codes; reason rendered verbatim. Localize display only, preserve stored audit data. |
| FAWRI-UI-004 | INVESTIGATE | Possible unsaved merchant note loss on dialog dismissal: local noteText and explicit save; parent close behavior and runtime reproduction still pending. |

These findings are documentation-only on draft PR #520, not merged into main and not repaired.

| FAWRI-UI-005 | SOURCE_CONFIRMED_FIX_PENDING | Merchant note save success toast fires before async PUT result: `AdminPageDialogs.tsx` lines 933-938 calls `onSaveNote(noteText)` then `toast.success`, while `AdminPageView.tsx` passes a voided async `doSaveNote` and `useAdminPageController.tsx` lines 1244-1268 awaits PUT and handles failure. Need awaitable save contract, success only on confirmed result, failure messaging, and pending-state protection; no runtime test or code fix yet. |

| CASHIER-STATION-ENTITLEMENT-011 | NEGATIVE_TEST_PENDING | Main `CashierManagementPage.tsx` lines 265-266 derives management eligibility from `cashierEntitlement.state === 'active'`; Add Station launcher line 727 is disabled unless active, but modal submit line 908 checks only `busy || !stationCreateBody` and `addStation` lines 433-440 posts the body without local entitlement recheck. UI restriction is not an API security guarantee. Identify server POST `/api/cashier/management/stations` handler and verify server-side entitlement/authorization rejects inactive, grace, restricted, suspended, and cross-merchant attempts using disposable test DB. No confirmed server bypass and no runtime test executed. |

**CASHIER-STATION-ENTITLEMENT-011 update (2026-10-11):** `SOURCE_GUARDED_NEGATIVE_TEST_PENDING`, not a confirmed server authorization defect. Server route `cashier-staff-operations.ts:280-301` requires merchant session; station creation `postgresCashierStaffAuthority.ts:901-978` inserts and assigns seat in a merchant transaction; `cashierEntitlementAuthority.ts:608-676` enforces active entitlement and seat limit. Pending disposable-DB negative/concurrency/rollback proof; see PROGRESS. The original issue row records the initial UI-only concern and is superseded by this evidence.

## Billing checkout reliability — source-reviewed, tests pending (2026-10-11)

| ID | Status | Evidence / remaining proof |
| --- | --- | --- |
| BILLING-IDEMPOTENCY-012 | CONFIRMED_SAAS_CHECKOUT_RACE / CASHIER_PENDING | `cashierBillingAuthority.ts:489-595` and `saasBillingAuthority.ts:509-595` check same-merchant idempotency keys under `FOR UPDATE` and reject mismatched retries, but absent-row SELECT alone cannot prove concurrent uniqueness. Verify actual DB unique constraints and simultaneous checkout attempts on disposable PostgreSQL. Catalog/price changes can also cause 409 on retry; agree replay contract. |
| BILLING-EXTERNAL-TX-013 | SOURCE_CONFIRMED_RELIABILITY_TEST_PENDING | Both cashier (`cashierBillingAuthority.ts:639-665`) and SaaS (`saasBillingAuthority.ts:628-657`) invoke SuperQi **sandbox** while DB checkout transaction remains open, then attach external payment reference. Test provider latency, external success + DB rollback/commit failure, retry and reconciliation on disposable DB with mocked provider. No observed production incident. |
| CASHIER-PRORATION-014 | POLICY_AND_BOUNDARY_TEST_PENDING | `cashierEntitlementAuthority.ts:132-241` uses UTC calendar-month clamp and BigInt whole-IQD half-up proration; near expiry a positive amount below 0.5 IQD rounds to zero and is rejected. Decide intended minimum/next-cycle policy; test leap year, month-end, expiry and grace boundaries. |

These are **audit work items, not three proven vulnerabilities**. No integration tests, external payment, DB mutation or deployment performed.

## 2026-10-11 source review continuation — test gaps (not executed)

| ID | Status | Source observation / exit proof |
| --- | --- | --- |
| BILLING-WEBHOOK-ORPHAN-015 | RECONCILIATION_TEST_PENDING | `superQiSandboxWebhook.ts` verifies signed payload and gateway status, but returns `ignored/order_not_found` when no order matches. Together with BILLING-EXTERNAL-TX-013, inject sandbox provider-success/DB-rollback and prove recovery, retries and reconciliation. No confirmed incident. |
| CASHIER-SEAT-RELEASE-016 | POLICY_AND_DB_TEST_PENDING | `cashierEntitlementAuthority.ts` seat assignment returns existing snapshot for both `active` and `release_scheduled` rows; test whether merchant retention of a scheduled-release station cancels the release as intended. |
| REPLY-LEDGER-DUPLICATE-017 | OFFICIAL_TRANSPORT_RUNTIME_DENIAL_PASS / OTHER_CALLERS_OPEN | `postgresSubscriptionEntitlement.ts` duplicate reservation returns allowed/duplicate after matching prior debit and checking current subscription row, without reapplying the initial new-event status checks; verify caller does not send an unauthorized new reply on replay after suspension. |
| REPLY-RESTORE-CYCLE-018 | CONFIRMED_SYNTHETIC_CROSS_CYCLE_FAILURE | `restoreMerchantAutoReplyPostgres` credits the original subscription/batch and guards duplicate credits. Test late refund after renewal, old batch missing/expired and balance invariants. |
| CASHIER-STATION-ROLLBACK-019 | VERIFIED_SERVICE_DB_NEGATIVES | `postgresCashierStaffAuthority.ts` station insert and seat assignment share merchant transaction; test exhausted-seat rollback, no orphan station and concurrent create. |

All entries are source review or test design, not executed proof. No changes to application code, live DB, payment providers, or deployment.

## 2026-10-11 integration entrypoint safety

| ID | Status | Evidence / required fix |
| --- | --- | --- |
| DB-TEST-TARGET-GUARD-020 | VERIFIED_SOURCE_GAP / NOT_EXECUTED | `artifacts/api-server/tests/global-merchant-auth-bootstrap-postgres.integration.test.mjs:79` and `global-merchant-golden-journey.integration.test.mjs:223` skip only when `DATABASE_URL` is absent, with no disposable/local DB assertion in those entrypoints. Both use `@workspace/db` and write/delete synthetic accounts; `test:global-merchant-journey` invokes both. Require pre-import fail-closed target attestation and isolated ephemeral Postgres; prove rejection of remote/tunneled DB. No test execution or real-data impact observed. |

| DB-TEST-CLEANUP-021 | VERIFIED_SOURCE_GAP / NOT_EXECUTED | `global-merchant-golden-journey.integration.test.mjs:238-380` creates accounts, merchant, cashier subscription, billing order and entitlement application before registering `t.after` at line 377. Any error during fixture setup leaves synthetic rows behind. `global-merchant-auth-bootstrap-postgres.integration.test.mjs` also registers cleanup after initial pool query, temp directory and port reservation. Register cleanup before first mutation and use an isolated transaction/teardown strategy with failed-setup tests. |
| GOLDEN-LEGACY-FIXTURE-022 | CLOSED_BY_EXECUTED_CONTRACT | `global-merchant-golden-journey.integration.test.mjs:321-344` still writes a `merchants.json` compatibility fixture described as pre-PR #139. Confirm whether current runtime still needs this; if not, remove fixture and assert fully PostgreSQL-backed behavior. No runtime test performed. |

| GOLDEN-CONTRACT-DIVERGENCE-023 | CLOSED_BY_EXECUTED_CONTRACT | `global-merchant-golden-journey.integration.test.mjs:321-344` explicitly writes a pre-PR-#139 `merchants.json` fixture, while `global-merchant-postgres-http-journey.integration.test.ts:46-56,704` asserts no root-level `.json` files in its test data directory. The latter tests a stricter no-legacy-JSON contract but is not the same entrypoint as `test:global-merchant-journey`. Establish whether the legacy fixture is still necessary and make the npm command exercise the canonical contract. Source evidence only; neither test was executed. |

## Autonomous sequential audit — task SEQ-01 (2026-10-11)

User authorizes test guards, test additions and isolated CI on the audit branch; earlier approval-only wording for these scoped actions is superseded. No app/business changes, main merge or hosted DB mutation authorized.

| ID | Classification | State | Evidence / next action |
| --- | --- | --- | --- |
| DB-TEST-CLEANUP-024 | CONFIRMED_TEST_PROCESS_DEFECT | OPEN | Both MJS merchant journeys swallow account DELETE failures with `.catch(() => {})`; the direct TS HTTP journey and Meta ingress do the same with `.catch(() => undefined)`. This can report a green test after failed cleanup. Separate from late hook registration DB-TEST-CLEANUP-021. Use teardown that attempts every resource release, propagates redacted aggregate errors, and register before setup; test failed setup and failed cleanup. Source evidence only at baseline 09d5b8cd; no DB execution. |

DB-TEST-TARGET-GUARD-020 through GOLDEN-CONTRACT-DIVERGENCE-023 already exist; no duplicate entries created. Merchant deletion RLS suite has finally-based role cleanup but retains fixture rows until instance disposal; runner must destroy its owned instance.

## SEQ-02 — scoped guard and cleanup remediation (audit branch only)

- DB-TEST-TARGET-GUARD-020: IMPLEMENTED / 15 SAFETY REGRESSIONS PASS / ACTUAL CI INSTANCE PROOF PENDING. Five priority suites now call shared attestation before application DB imports. Guard requires a loopback-only network namespace matching runner-owned Docker identity, exact fawri_ci target/role, per-run marker verified by read-only probe, no URL query overrides and NODE_ENV=test. An environment flag or local tunnel URL alone cannot pass.
- DB-TEST-CLEANUP-021: both MJS cleanup hooks moved before mkdir/first mutation; removed unnecessary initial DELETE. Failed-setup helper regression PASS; actual failed-DB-fixture cleanup proof still pending.
- DB-TEST-CLEANUP-024: swallowed DELETE errors removed in both MJS journeys, TS HTTP and Meta ingress. Aggregate teardown attempts every cleanup and fails with redacted errors. Helper failure-injection PASS; actual PostgreSQL cleanup behavior pending.
- GOLDEN-LEGACY-FIXTURE-022 and GOLDEN-CONTRACT-DIVERGENCE-023 remain OPEN; compatibility fixture intentionally retained until measured canonical journey proof. No application implementation changed.
- Unselected unsafe suites under PG-TEST-GUARD-002/003 and TEST-DB-SAFETY-008 remain OPEN; the five-suite guard is not a repository-wide claim.

SEQ-03a follow-up to DB-TEST-TARGET-GUARD-020: first real CI refused at preflight because test guard used the per-database comment function instead of shared-object database comment function. Corrected to shobj_description; no application or hosted DB defect claimed. Closure remains pending fresh CI proof.

FA-I-006: dedicated restricted-role test added in SEQ-03b. Requires real tenant-reset passes and known-page routing passes; do not close from source or owner-role Meta suite. Runner startup race fixed by TCP readiness after actual CI init failure; no application defect inferred from that failure.

| AUDIT-FIXTURE-SCAN-025 | TEST_INFRASTRUCTURE / FALSE_POSITIVE_REVIEW | OPEN | Security run 38171061371 flags three fabricated remote connection strings in guard regression tests. Current inputs now use recognized placeholder passwords; historical blobs may still be flagged. These inputs were rejected before connections. Do not suppress real secret findings or rewrite history; verify narrowly scoped false-positive handling if needed. |

DB-TEST-TARGET-GUARD-020 SEQ-04: actual isolated instance matched database/role/run marker; address failed exact text comparison due PostgreSQL inet mask representation. host(inet_server_addr()) corrects the comparison, retains strict loopback-only rule. Wider legacy suites protected by runner preload only; direct-entrypoint PG-TEST-GUARD findings remain OPEN. No integration PASS yet.

| BILLING-TEST-E164-026 | CONFIRMED_TEST_FIXTURE_DEFECT | FIXED_AND_CI_VERIFIED | SaaS billing and signed SuperQi positive fixtures use local077... phones; actual migration0026 now requires E.164. Run38171428265 showed accounts_phone_shape_check SQLSTATE23514 before payment assertions. Changed test fixtures only to +964...; source constraint preserved. No billing runtime defect established by those failures. |

AUDIT-FIXTURE-SCAN-025: local current repository+history scans now PASS after recognized current placeholders and six exact immutable historical fixture exceptions (two blob SHAs/path/rule/offset/length). Regression rejects any widened match. CI security proof pending.

## SEQ-06 — isolated rerun, actual restricted-role failure (2026-10-11)

FA-I-006 is now reproduced under committed schema on disposable PostgreSQL16. [Commit284a5fa4](https://github.com/nora953/fawri-production-source/commit/284a5fa476ad975261099be74597e4cbeb23ba68), [run38171811645](https://github.com/nora953/fawri-production-source/actions/runs/38171811645), job114565798191: roleNOLOGIN/NOSUPERUSER/NOBYPASSRLS, merchant_channels RLS enabled; tenant-only lookup and pool context reset PASS; unknown-page generic503/noidentity leak PASS. Global approved mapping count actual0/expected2 FAIL; known approved page actual503/expected accepted FAIL. Three Node failures include the parent, representing two failed functional subtests, not three independent defects. No cross-tenant leak demonstrated. Live staging has no approved connected-page reproduction. Preserve RLS; application resolver change requires user approval.

Twenty of21 suite files PASS, totals48NodePASS/3FAIL/0SKIP. Deletion RLS, seven cashier suites, four billing suites and four tenant suites PASS. Four fresh DB instances each applied28 committed migrations; teardown PASS. BILLING-TEST-E164-026 is verified fixed by successful SaaS4/SuperQi2 cases. All other workflow runs on this commit, including final security/supply chain and final quality gates, completed SUCCESS. These facts do not establish release readiness or omitted failure paths.

Prepared next: remove golden journey legacy merchants.json fixture and assert no root JSON persistence; add synthetic late-paid-expired, mismatched-paid replay and shared-payment-reference concurrency tests. Not yet executed. Dependency audit reports two moderate advisory records (postcss-selector-parser GHSA-rj75-hqrm-r3gf; fast-copy GHSA-jggr-w7fw-pc2j); exploitability/dependency path pending, no new issue until reconciled with existing register.

## SEQ-07 — negative billing and fixture-free journey; SEQ-08 restore safety

[Source91d639ff](https://github.com/nora953/fawri-production-source/commit/91d639ff17dad866a89b06c1cea736e8f57bae6f), [run38172237280](https://github.com/nora953/fawri-production-source/actions/runs/38172237280), job114567076990:22suite files,49NodePASS/6FAIL/0SKIP;20filesPASS. Four committed-schema chains28migrations eachPASS; owned-container teardownPASS. Six failures are four failed subtests plus two parent failures (Meta two, SaaS two).

| ID | Classification/status | Actual evidence / next action |
| --- | --- | --- |
| BILLING-LATE-EXPIRED-027 | CONFIRMED_SYNTHETIC_RUNTIME_DEFECT / OPEN HIGH | Create checkout1hour in past, list orders proactively marks expired, then verified matching test_fake payment throws SAAS_BILLING_ORDER_NOT_PAYABLE instead of durable paid_reconciliation_required. Source saasBillingAuthority.ts checks nonpending status before late-payment reconciliation. No production charge; operational consequence is missing automatic reconciliation for a received payment. Approved business correction and replay recovery proof needed. |
| BILLING-PAID-REPLAY-028 | CONFIRMED_SYNTHETIC_RUNTIME_DEFECT / OPEN HIGH | Valid payment applied, distinct verified event with same payment ref and amount1 changes durable order paid -> paid_reconciliation_required. Amount mismatch branch precedes paid terminal guard. Existing entitlement stays applied; no double-credit demonstrated. Preserve terminal state and audit rejected event after approved fix; also test refunded state. |
| RESTORE-LIBPQ-OVERRIDE-029 | CONFIRMED_TOOL_GUARD_GAP / FIXED_LOCAL_TEST_PASS_CI_PENDING | Backup/restore accepted loopback URLs containing hostaddr/service parameters and inherited libpq routing variables. Six new rejection tests failed before patch;15passed after URL search/hash rejection, then17passed including mocked binary PGHOSTADDR/PGSERVICE/PGOPTIONS stripping. No database connection occurred (local pg tools absent; fake tools only). Existing direct tools still lack ownership/network attestation; arbitrary loopback tunnel and SELECT side effects remain unproven safety gaps. Do not run these direct against unproven DB. |
| SUPPLYCHAIN-MODERATE-030 | ADVISORY_DETECTED / EXPLOITABILITY_UNPROVEN | pnpm audit2moderate,0high,0critical; selector-parser6.0.10 via frontend dev @tailwindcss/typography (GHSA-rj75-hqrm-r3gf; fixed>=7.1.6); fast-copy4.0.3 via API dev pino-pretty/esbuild-plugin-pino (GHSA-jggr-w7fw-pc2j; fixed>=4.1.0). Recursive pnpm why confirmed paths. Dev declaration does not alone prove absence from deployed bundle. Patch/override compatibility and artifact reachability pending. No lockfile changes. |

GOLDEN-LEGACY-FIXTURE-022 and GOLDEN-CONTRACT-DIVERGENCE-023: CLOSED_BY_EXECUTED_CONTRACT on source91d639ff. MJS journey removed pre-PR139 merchants.json compatibility fixture; unchanged operational journey passes and asserts zero root JSON. HTTP journey alsoPASS. No claim all legacy app routes are removed.

SaaS concurrent distinct orders/shared provider payment ref PASS: exactly one entitlement, other rejected SAAS_BILLING_PROVIDER_PAYMENT_COLLISION in this execution. This single simultaneous attempt narrows earlier absent-row race concern; stress distribution and commit-failure recovery remain untested. Existing positive billing/refund suites stillPASS.

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

## SEQ-11 verified: cross-cycle accounting; Meta harness corrected

[Source9331c489](https://github.com/nora953/fawri-production-source/commit/9331c489903c315a24d41726a3efa1b77954513b), [run38173288435](https://github.com/nora953/fawri-production-source/actions/runs/38173288435), job114570243330:26files,52NodePASS/62FAIL/0SKIP;21filesPASS. Five fresh isolated instances each28migrationsPASS; cleanupPASS. Of62failures,52are the Meta harness prematurely ending its pool after first awaited top-leveltest; other10include3parents and7functionalfailures. Do not label52Meta failures as product defects or completed functional coverage.

REPLY-RESTORE-CYCLE-018: CONFIRMED_SYNTHETIC_CROSS_CYCLE_ACCOUNTING_FAILURE. Old-cycle base reply reserved; subscription renewed after expiry; new-cycle reply reserved; refund oldevent returns refundedtrue and changes newcycleused1->0/remaining3999->4000. Renewal reuses subscription ID; refund has no original-cycle discriminator. The new event debit stays in ledger while base usage is erased. No real balances touched. Approved accounting policy/fix needed: reject or reconcile historical refund separately, preserve new-cycle debit, prove duplicate/concurrent cases and add-on batch behavior.

Meta harness correction (024 follow-up): early root afterhook incorrectly ran after first awaited top-level test and closed shared pool. Move all53cases under one parent with early parent t.after, retain aggregatedcleanup and disposableguard. This is an audit test-infrastructure correction; the original application Meta cases remain unproven until rerun.017suspended duplicate send negative did not reach its assertions in this run. Add independent knowledge-learning-cycle file with fakeembedding to isolatedbatch (27files planned). Syntax transformPASS; real CIpending.

[Cashier workflow38173288724](https://github.com/nora953/fawri-production-source/actions/runs/38173288724): both jobsSUCCESS. Job114570243664 API/frontendtypecheck and7policytestsPASS (calendar-month/leap-year/proration cases); job1145702440248suitefiles9NodePASS/0FAIL/0SKIP,28migrationsPASS. This verifies replacement for obsolete schema-push runner and full cashier lifecycle; near-zero proration policy and changed-retention selection stillpending014/016.

New FINAL_REPORT_DRAFT.md and REMAINING_WORK_MATRIX.md consolidate current evidence, priorities and14short-task planning estimate3.5–7hours excluding additional failures/queues/externalproof/fixes. Draft is not release approval.

## SEQ-13 — Meta/AI functional proof and cleanup fault preparation

[Source2964aba2](https://github.com/nora953/fawri-production-source/commit/2964aba2800274f704adbe5cf820e458958f0915), [run38173603888](https://github.com/nora953/fawri-production-source/actions/runs/38173603888), job114571197444:27files,106NodePASS/10FAIL/0SKIP;23filesPASS. Five isolated28migration chains andcleanupPASS. Four failedfiles correspond to existing006/012/027/028/032/018, sevenfailedfunctionalcases plus threeparents.

Meta parent harness corrected:54NodePASS/0FAIL/0SKIP (53functional subtests plus parent), owner-role committed-schema/injectedproviders only. Covers deduplicated send, confirmed failure retry, uncertain send prevention, tenant knowledge isolation, manual takeover, media provenance/forgery/redelivery, mixed attachments, SSRF-like unsafe URLs and event identity collision. No real Meta/OpenAI availability/token permission proof. Standalone knowledge learning-cycle1PASS. Restricted Meta page mapping failure006 is separate and persists.

017: reservation duplicate after subscription suspended returns allowedtrue/duplicatetrue; official PostgreSQL transport.send rejects MERCHANT_AUTO_REPLY_DISABLED and fake send counter remains0. This narrows concern to reservation API semantics/other callers; no unauthorized official send demonstrated.018crosscycle failure persists. Historical52Meta harness failures remain recorded, now corrected.

021/024 next real DB proof prepared: guarded child inserts synthetic account/merchant then setupthrows; first cleanup SELECT throws SQL error, subsequent DELETE and pool teardown must still run. Parent checks childexit1, bounded cleanup failure log, zero account/merchant rows and no raw PostgreSQL error. Node24 probe showed a setup error masks an after-hook error in reporter; helper now emits only TEST_CLEANUP_FAILURE count before aggregated throw.15guard/local cleanup testsPASS; real DB child proof pending28file rerun.
