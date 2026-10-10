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
