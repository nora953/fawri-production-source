# Conversation-to-GitHub audit notes reconciliation — 2026-10-11

Status: PARTIAL RECONCILIATION; **NOT** proof that every prior conversation observation has been captured.
Scope: evidence available in the current audit session and retrievable prior-conversation context. No application-code changes, test execution, database writes, merges, or deployment.

## Verified against GitHub
- `docs/final-audit/MASTER_PLAN.md`, `PROGRESS.md`, `AUDIT_REGISTER.md`, and `ISSUES.md` exist on main.
- `AUDIT_REGISTER.md` on main and `refs/pull/518/head` have identical blob SHA `04a6e0b774f7bc50f9a1b746be1aa630ad1ad10e`. This establishes **content presence** for the PR #518 consolidated cashier entries, not execution of their tests.
- PR #519 remains open as of inspection; its version of the register adds `CASHIER-HIST-PERMISSION-009` (historical operator permission not explicitly checked during attribution). This entry is **not** on the inspected main register. Do not merge automatically; review CI and possible staging auto-deploy.
- PR #476 is open for staging admin UI fixes; build/typecheck are reported in PR body, but final visual QA remains unverified.

## Conversation findings matched to the register
| Prior observation / concern | Existing main register evidence | Classification |
| --- | --- | --- |
| Historical cashier licensing, clock and device sequence | CASHIER-HIST-AUTH-005 | RECORDED / TEST NOT RUN |
| Historical attribution, replay, ACK ordering | CASHIER-ATTRIBUTION-006 | RECORDED / NEGATIVE TEST PENDING |
| Partial return, void and inventory restoration | CASHIER-COMPENSATION-007 | RECORDED / TEST NOT RUN |
| Unsafe compensation integration test against configured DB | TEST-DB-SAFETY-008 | RECORDED / FIX PENDING |
| Merchant-session legacy cashier sync operator permission | CASHIER-SYNC-SESSION-002 | RECORDED / PROOF OPEN |
| Current operator sync authorization vs legacy bridge | CASHIER-SYNC-OPERATOR-003 | RECORDED / PROOF OPEN |
| Staff revocation vs historical offline replay | CASHIER-OP-REVOCATION-004 | RECORDED / NEGATIVE TEST PENDING |
| Historical operator permission at operation time | PR #519 CASHIER-HIST-PERMISSION-009 | PR ONLY / NOT ON MAIN |

## Earlier conversation leads not yet reconciled to exact current-main evidence
These are **leads**, not newly confirmed defects; do not reopen historical PASS without relevant delta or reproducible failure.

1. **2026-10-09 staging restore writer rehearsal**: prior conversation described `lib/db/scripts/staging-restore-writer.mjs` invariant helper, 317 planned/inserted rows, single owner, legacy owner absent, forced rollback, and an attempted wiring step that failed to match an anchor. Earlier working tree reportedly had modifications to `.replit` and the restore writer; no verified GitHub commit or final script state established here. Compare current main script and existing restore runbook before deciding whether a new issue is needed. **UNVERIFIED CURRENT STATE**.
2. **2026-10-05 local PostgreSQL gate**: prior conversation reported disposable `fawri_ci`, 27 migrations and migration smoke passing. Later Neon staging snapshot has 28 migration records; these are different environments/times. A referenced 45/50 comprehensive-gate outcome is unavailable, so do not claim it passed or failed. **HISTORICAL ENVIRONMENT-ONLY EVIDENCE**.
3. **2026-10-06 legacy cashier entitlement branch**: prior review mentioned `licensedStations`, `expired`, and `grace_until = expires_at + 7 days` in a foundation branch behind main. `PROGRESS.md` already classifies legacy `0027_cashier_subscription_entitlement.sql` as obsolete/incompatible relative to current licensing migration. **DOCUMENTED BRANCH RISK; NO DIRECT MERGE**.
4. **2026-09-29 bot knowledge/grounding audit**: prior plan called for stale-message ordering, unsupported claims, current product facts overriding old memory, and tenant-safe knowledge writes. These were audit questions, not confirmed defects. Main register has knowledge RLS/AI safeguards evidence, but exact equivalence to every proposed scenario is not established. **SCENARIO COVERAGE TO VERIFY, NOT DEFECT**.

## Completion criterion for a 100% reconciliation claim
Obtain the complete prior conversation note inventory or exported transcript; map each actionable finding to an exact main register ID, linked PR-only entry, superseding evidence, or explicitly missing entry. Verify current main SHA and record disposition. No claim of complete coverage until that mapping is exhaustive.

## Next safe actions
1. Review PR #519 and decide whether to preserve its new entry through normal review/CI; do not merge here.
2. Read current-main staging restore writer and compare with prior rehearsal claims; classify any concrete gap.
3. Check historical bot scenario coverage against current tests without running DB-mutating suites.
4. Continue reconciliation as new prior-conversation evidence becomes available. Keep this document as an explicit, auditable checkpoint.

## 2026-10-11 follow-up source checks
- **Restore rehearsal script path check:** `lib/db/scripts/staging-restore-writer.mjs` returns GitHub 404 on inspected main. GitHub repository search for `staging-restore-writer` returned no indexed results. This does **not** prove no equivalent script exists elsewhere or that an uncommitted historical working tree was lost. Classify the earlier reported rehearsal as **NOT VERIFIED IN CURRENT MAIN AT REPORTED PATH**; locate an alternative path or commit before creating a defect.
- **Cashier historical integration test safety:** `artifacts/api-server/tests/cashier-historical-operation-postgres.integration.test.ts` on main (blob `ecf4073bc1bb0a54da15d787fe6b224741b42e5d`) explicitly asserts `DATABASE_URL` hostname is localhost/127.0.0.1 and database name `fawri_ci` before importing DB modules. This particular test is **SOURCE-GUARDED**, unlike the separately documented unsafe compensation test. No test executed.
- **Historical local migration claims:** `PROGRESS.md` describes 28 Drizzle records on Neon staging-runtime at its prior snapshot, but that is not evidence of the older 27-migration disposable-local run or any missing comprehensive-gate outcome. Retain **UNRECONCILED HISTORICAL CLAIM**, not a mismatch defect.
- **Open PR #519:** historical permission-attribution entry remains PR-only in the inspected main/register comparison; do not treat this as merged or as an exploited vulnerability.

## 2026-10-11 knowledge and restore documentation comparison
- **Knowledge / bot audit coverage:** current-main `AUDIT_REGISTER.md` includes `KNOWLEDGE-RLS-001`, documenting `knowledge-tenant-rls.integration.test.mjs`, `knowledge-learning-cycle-postgres.integration.test.ts`, `knowledge-ai-security.test.ts`, and `knowledge-openai-approved-translation-provider.test.ts`. These are documented test inventories with **execution unverified**, covering tenant isolation, approved knowledge and prompt-injection defenses. This does **not** establish exhaustive tests for stale-message ordering, latest product facts superseding old memory, or every bot modality; retain these as scenario-level coverage questions rather than confirmed defects.
- **Backup / restore:** current-main `docs/backup-restore-runbook.md` (blob `3d126f3a1959715a054c560eb59d8ecb509b4254`) describes disposable-only PostgreSQL/object restore checks, manifests, hashes, and row-count consistency. This is distinct from the prior reported `staging-restore-writer.mjs` rehearsal, which remains unlocated at its claimed path. No hosted backup, PITR, production restore or rehearsal execution was observed in this session.
- **Search limitation:** GitHub code search for the restore script name and bot scenario phrases returned no indexed matches; absence of a code-search result does not prove code absence. Exact register and runbook fetches are positive evidence of existing documentation.
- **Safety:** no tests run and no changes to application code, database, secrets, `main`, or deployment.

## Screenshot-to-ledger cross-check — 2026-10-11
User-provided screenshots of the prior conversation show the following **specific claims**. Each is classified against the inspected main register or PR #519, without interpreting source review as executed proof.

| Screenshot claim | GitHub match | Disposition |
| --- | --- | --- |
| Returns cannot exceed remaining sold quantity, restore after void, void after prior compensation, refund mismatch | `CASHIER-COMPENSATION-007` on main | DOCUMENTED SOURCE REVIEW; runtime tests not executed |
| Partial returns/replay and original-location restock after station transfer | `CASHIER-COMPENSATION-007` on main | DOCUMENTED TEST INVENTORY; execution pending |
| Compensation integration test has no explicit localhost/`fawri_ci` guard | `TEST-DB-SAFETY-008` on main | DOCUMENTED FIX PENDING; do not run against shared DB |
| Sale saved but attribution/ACK interrupted: retain local queue, retry idempotently without new sale | `CASHIER-ATTRIBUTION-006`, `CASHIER-SYNC-001`, `CASHIER-SYNC-OPERATOR-003` on main | DOCUMENTED SOURCE REVIEW; end-to-end failure test pending |
| Current uploader permission and historical operator attribution are distinct | `CASHIER-OP-REVOCATION-004`, `CASHIER-SYNC-OPERATOR-003` on main | DOCUMENTED; historical negative proof pending |
| Current uploader authorized, historical operator lacked sale/return/void permission at occurred_at | `CASHIER-HIST-PERMISSION-009` in PR #519 only | DOCUMENTED PR-ONLY; review before main merge |
| PR #518 merged and triggered Railway build/deployment | Main register contains PR #518 additions; screenshot reports merge and subsequent Railway SUCCESS | MAIN CONTENT CONFIRMED; deployment SUCCESS is historical screenshot claim, not independently rechecked this turn |
| Audit 70% estimate | Screenshot reports 70%; current-main `PROGRESS.md` retains older 54% planning estimate | UNRECONCILED ESTIMATES; neither is launch readiness |

**Scope limit:** screenshots are overlapping excerpts, not an exhaustive export of the full previous conversation. All actionable findings visible in the supplied screenshots have a matching main register entry or PR #519 entry; this is **not** a claim that every finding in the entire previous conversation has been matched.

## User-supplied comprehensive audit handoff — 2026-10-11

This section reconciles the user's explicit handoff against four **freshly fetched** canonical files on `main` (MASTER_PLAN blob `55ab1a4`, PROGRESS `3a53247`, AUDIT_REGISTER `04a6e0b`, ISSUES `ecc3ab5`). The user's 70% is a historical *qualitative* estimate; main PROGRESS still records 54/100. Do not increment for this documentation work.

| ID | Area | File / evidence | Finding / category | Documentation | Test state | Risk | Action / status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FA-I-006 | Meta/RLS | `postgresMetaChannelAuthority.ts`; `ISSUES.md` FA-I-006 | Cross-merchant page lookup under tenant RLS, potential security/functionality proof gap | MAIN COMPLETE | Restricted-role test NOT RUN | HIGH (unconfirmed) | Disposable-role negative test; OPEN |
| FA-I-007 | PostgreSQL grants | `ISSUES.md` FA-I-007; `AUDIT_REGISTER.md` DB-002 | Non-RLS tables with broad grants; not automatically an exploit | MAIN COMPLETE | Tenant-negative test NOT RUN | HIGH (unconfirmed) | Least-privilege review; OPEN |
| RELEASE-GATE-STATIC-001 | Release | `productionReleaseReadiness.ts` | Five unconditional external blockers | MAIN COMPLETE | Live release proof NOT RUN | HIGH launch blocker | Provider/evidence decisions; OPEN |
| CASHIER-SW-001 | Offline app | `cashier-sw.js`; `cashierOfflineAppShell.ts` | SW cache version mismatch | MAIN COMPLETE | Cold-start runtime NOT RUN | MEDIUM | Targeted fix/test approval; OPEN |
| CASHIER-DEMO-001 | Cashier UI | `cashierMain.tsx`; `CashierPosPage.tsx` | Demo query/UI gate mismatch; not proven unauthorized sale | MAIN COMPLETE | Runtime negative test NOT RUN | UNRESOLVED | Targeted UI/authorization test; OPEN |
| CASHIER-OFFLINE-001 | Licensing | `cashierOfflineEntitlementAuthority.ts` | Local IndexedDB cache, no observed cryptographic signature | MAIN COMPLETE | Tamper test NOT RUN | UNRESOLVED | Security/product policy decision; OPEN |
| CASHIER-SYNC-SESSION-002 | Legacy sync | `cashier-sync-operations.ts` | Merchant-session compatibility bridge | MAIN COMPLETE | Abuse negative test NOT RUN | UNRESOLVED | Test reachability and binding; OPEN |
| CASHIER-ATTRIBUTION-006 | Sync | `cashierOperatorCommerceAuthority.ts` lines 406-550 | Separate sale/attribution transactions; code comments explicitly specify repair on retry | MAIN COMPLETE; EXTRA SOURCE CHECK 2026-10-11 | Failure injection NOT RUN | MEDIUM proof gap | Simulate commit then attribution failure in disposable DB; OPEN |
| CASHIER-HIST-PERMISSION-009 | Historical permissions | `cashierOperatorCommerceAuthority.ts` lines 200-254 | Historical session query checks time/shift/credential but does not select historical `permission_snapshot`; current uploader permission distinct. Potential authorization policy gap, not proven exploit | PR #519 ONLY | Negative test NOT RUN | HIGH (unconfirmed) | Decide policy and run disposable test; OPEN |
| CASHIER-HIST-IDENTITY-010 | Historical identity | `cashierOperatorCommerceAuthority.ts` lines 154-186, 406-477 | Merchant/device asserted; attribution conflict checks operation ID, sale ID, kind, staff, shift, session, device and occurred_at. However forged `occurred_at` and sequence-to-session end-to-end negative proof not established | **NEW SCENARIO DETAIL IN THIS DRAFT PR**, related to CASHIER-ATTRIBUTION-006 | Negative test NOT RUN | UNRESOLVED | Verify cross-service sequence/timeline and forged-time test; OPEN |
| TEST-DB-SAFETY-008 | Test safety | `catalog-cashier-compensation-history-postgres.integration.test.ts` lines 1-30 | Imports `@workspace/db` and mutates DB without explicit local-only URL guard | MAIN COMPLETE; RECONFIRMED 2026-10-11 | TEST NOT RUN (unsafe) | HIGH test-process risk | Add guard with code approval; OPEN |
| PG-TEST-GUARD-002 / 003 | Test safety | Register entries for billing/subscription and RLS security suites | Additional unsafe suites documented, but complete PostgreSQL test/CI inventory **not yet done** | MAIN PARTIAL INVENTORY | NOT RUN | HIGH test-process risk | Enumerate all integration suites and actual workflow commands; OPEN |
| BACKUP-DRILL-001 | Restore | `backup-restore-runbook.md` | Disposable-only backup proof, not hosted PITR restore | MAIN COMPLETE | Hosted recovery NOT PROVEN | HIGH launch blocker | Safe external proof plan; OPEN |
| CATALOG-MEDIA-001 / SUPPORT-STORAGE-001 | Media | Storage services and Railway volume inventory | Filesystem-only and no verified durable staging mount | MAIN COMPLETE | Redeploy durability NOT PROVEN | HIGH launch blocker | Storage architecture decision; OPEN |
| FASTPAY-RELEASE-001 | Billing | FastPay readiness test and production adapter | Production adapter pending | MAIN COMPLETE | Production end-to-end NOT RUN | HIGH launch blocker | Provider integration approval; OPEN |
| FA-005 | Visual QA | `MASTER_PLAN.md`; PR #476 | Final visual QA still pending | MAIN PLAN DOCUMENTED | NOT RUN | UNRESOLVED | Perform after safe functional gates; OPEN |

**New detail rather than duplicate defect:** CASHIER-HIST-IDENTITY-010 is a distinct scenario-level proof question; the existing CASHIER-ATTRIBUTION-006 and CASHIER-HIST-AUTH-005 already cover much of the underlying logic. No exploit is asserted.

**Source check:** On main, `cashierOperatorCommerceAuthority.ts` `resolveHistoricalOperatorAttributionContext` query (lines 200-254) selects historical session, shift, station, device credential and timestamps but does not select historical permission_snapshot. `recordAttribution` (lines 406-477) uses ON CONFLICT DO NOTHING then compares stored binding; `syncCashierOperatorSaleAuthoritative` (491-518) explicitly documents retry repair after core sale commit, and compensation (520-549) persists attribution after core compensation. These are source findings, not executed tests.

**CI safety check limitation:** `.github/workflows/ci.yml` returned 404; this is not evidence that no CI workflow or central guard exists. Discover actual workflow filenames before concluding. **Do not execute any PostgreSQL-writing suite**.

**Process gap:** Canonical `ISSUES.md` primarily lists FA-I-001..009, whereas many later register findings (cashier SW, test guards, release/media blockers, historical permissions) are open in `AUDIT_REGISTER.md` without mirrored issue rows. The canonical register is the evidence source; mirroring *actionable* unresolved findings in ISSUES is recommended as a later batch, without duplicating IDs or treating each as a vulnerability.

**Checkpoint:** Matching and new scenario detail saved in this draft documentation branch; neither PR #519 nor this PR #520 is merged into main. No code edits, DB operations, or tests.

## CI workflow run evidence — 2026-10-11 (read-only)

GitHub Actions workflow runs associated with PR #518 head `ec15937aea43819ff279d5aa0a6cf690ed0f6b8d` were inspected directly:
- `Final quality gates`, run `38090880741`, conclusion `success`: `full-build`, `full-typecheck`, `quality-tool-tests`, `translation-structure-audit` all succeeded. Step summaries include API unit tests, frontend TypeScript unit tests, source contracts, build/typecheck and localization structure.
- `Final security and supply chain`, run `38090880764`, conclusion `success`: `lockfile-integrity`, `repository-security`, `dependency-review`, `dependency-audit` all succeeded.
- These are **eight successful jobs across two workflow runs**, not proof of PostgreSQL integration test execution. Their exposed job steps do **not** list a PostgreSQL integration suite or a database URL allowlist. This does not prove that no guard exists in other scripts or workflows.
- Root `package.json` scripts: `build`, `typecheck`, `migration:test` (`node --test --test-concurrency=1 ./scripts/tests/*.test.mjs`), others. API `artifacts/api-server/package.json` includes `test:global-merchant-journey` calling `global-merchant-auth-bootstrap-postgres.integration.test.mjs`; this script exists but was **not evidenced as executed by the above eight jobs**.
- `.github/workflows/ci.yml` 404 means only that exact guessed path is absent. Actual workflow run metadata establishes the two real workflow names; path enumeration and exact YAML audit still pending.
- **Safe next action:** enumerate repository workflows and all PostgreSQL integration tests from a complete repository tree or verified local checkout; classify each as DB-writing vs read-only, guarded vs unguarded, and map actual CI invocations. No integration test executed in this review.

## CI execution log evidence — 2026-10-11

Read-only GitHub Actions log inspection of `Final quality gates` run `38090880741`, job `full-typecheck` `114326882816`, on PR #518 head:

1. The API TypeScript test command builds its file list with `find tests -maxdepth 1 -name '*.test.ts' ! -name '*.integration.test.ts' | sort`, then invokes `pnpm exec tsx --test --test-concurrency=2 --test-timeout=60000 "${tests[@]}"`. This **explicitly excludes `*.integration.test.ts`** from that job step.
2. Other commands in the same job include `node --test artifacts/fawri/tests/*.test.mjs` plus named API contract tests, and `pnpm exec tsx --test --test-concurrency=2 --test-timeout=60000 tests/*.test.ts` for frontend TypeScript tests. Do not assume these commands prove PostgreSQL integration coverage.
3. Therefore this specific successful quality workflow is **not evidence of PostgreSQL integration suite execution**. Separate workflows, manual runs or historical test evidence may exist; none is disproved here.
4. Workflow YAML filenames were not identified by guessed paths; exact workflow path enumeration remains OPEN. No test was run in this audit session.

**Disposition:** This is additional execution-scope evidence under existing `PG-TEST-GUARD-002/003` and `TEST-DB-SAFETY-008`, not a new defect ID. It does not establish that the workflow itself is defective: excluding DB integration tests may be intentional for safe CI.

## PostgreSQL test sample — 2026-10-11

Read-only source inspection, eight suites, none executed. Six mutating suites had no explicit local-only URL guard observed: `saas-billing-authority.integration.test.ts` (lines 3,22-40,75), `superqi-sandbox-billing.integration.test.ts` (4,32-44,90), `subscription-entitlement-postgres.integration.test.ts` (6,24-55,222), `merchant-customer-payment-authority-postgres.integration.test.ts` (18-36,86-231), `production-postgres-rls-security.integration.test.ts` (3,18,26-35,128-129), `support-image-write-order-postgres.integration.test.ts` (11,37,54). Two mutating suites have explicit localhost and disposable database checks: `cashier-historical-operation-postgres.integration.test.ts` (5-13,26) and `merchant-management-tenant-rls.integration.test.mjs` (7-12). All six unguarded examples are already tracked in the main audit register; no duplicate finding opened. This is a sample, not full inventory, and does not rule out central runner safeguards. CI job `114326882816` excluded TypeScript integration tests from its unit suite. Next: obtain full test/workflow path inventory. No database test was run.

## Additional CI evidence checkpoint

Inspected three more successful job logs. Quality tooling job 114326882847 ran security audit script tests and policy validation. Repository security job 114326883052 ran security tests, an HTTP security contract test, and repository/history checks. Translation job 114326882853 ran the repository translation audit. These observed commands do not constitute PostgreSQL integration test execution. Translation output included long-file diagnostics, not a demonstrated build failure. Code search returned no results for database test terms, which does not establish that those files are absent. Full CI workflow and test inventory remain open. No tests executed during this audit.
