# FAWRI — Risk-Based Parallel Engineering Audit (Operating Charter)

Status: ADOPTED by project owner, 2026-10-19. Scope: remaining P0 audit/remediation, followed by P1/P2 only after stage gates. This is the cross-conversation source of truth for audit execution; re-read at the start of every new chat or Work session, and reconcile with current GitHub state before acting.

## Non-negotiable method
1. Prioritize by severity, exploitability, blast radius, and production exposure. Track each finding with identifier, evidence, owner, status, test, and closure proof. Never equate test count or commit count with completion.
2. Do not re-audit proven unchanged surfaces without a new trigger (code/schema/config change, failed regression, or new threat evidence). Maintain traceability from requirement to test to result.
3. Parallelize **independent investigation/review** across code and authorization, Neon/PostgreSQL/RLS, integrations, and Railway/runtime. Serialize dependent migrations, shared-file edits, and releases. Resolve conflicts before integration.
4. Batch related code fixes and targeted tests into coherent reviewable commits. Run targeted tests locally/disposably first, then full CI at batch boundaries. Avoid repeated tiny pushes that cancel previous GitHub Actions runs. Wait for conclusive CI results; investigate job steps/logs on failure.
5. Treat an all-green CI as necessary but insufficient. Require evidence of actual tenant isolation and hosted-role/migration/security acceptance; document residual risks and NO-GO blockers.
6. Keep cashier licensing/authorization and intelligent bot subscription authorization distinct. Shared inventory does not imply shared licensing or permissions.
7. Do not merge, deploy, execute hosted migrations/grants, change production credentials, or modify production data without explicit owner authorization. Prefer read-only inspections and disposable tests.
8. Persist every meaningful checkpoint to GitHub: evidence, completed items, blockers, exact branch/PR/commit, CI links, and next safe action. In a new conversation, inspect current GitHub truth rather than trusting old SHA/status in chat.

## Immediate P0 hosted gates (OPEN until independently verified)
- H-01: Identify **actual** Railway runtime database role and privileges, not merely an isolated Neon role.
- H-02: Reconcile Neon migration ledger with committed migrations and document gaps.
- H-03: Verify payment-identity guard migration 0034 installation in intended environment, with safe approval gate.
- H-04: Perform payment-identity collision preflight before any migration.
- H-05: Prove tenant API + RLS isolation with appropriately restricted runtime role in hosted-like environment.
- H-06: Obtain explicit owner authorization for any deployment/production mutation.

## Baseline evidence at adoption
- Repository: nora953/fawri-production-source
- Audit branch: fix/p0-provider-receipt-order-discovery-20261015
- Draft PR: #550 (dependent on #549)
- CI baseline commit: 4a22db695a3c1a262ed0f76940654820e32cb321
- All 41/41 GitHub CI workflows for this commit completed successfully, including Isolated PostgreSQL engineering audit run #575 (ID 39203625003), verified 2026-10-19.
- CI green is **not** P0 release approval. P0 status: NO-GO pending hosted gates.

## Per-batch report contract
Report (a) risks closed with links/evidence, (b) findings still open, (c) CI/test results and exact commit, (d) what changed and why, (e) next dependency-aware batch, and (f) P0 GO/NO-GO. State unknowns explicitly; never invent progress percentages.

## Continuity protocol
At the start of every new session: read this charter, inspect active PR/branch and latest CI, inspect audit records in docs/final-audit/, select the highest-risk unblocked batch, execute within approval boundaries, and update durable evidence. This charter survives chat transitions only through GitHub; do not rely on assistant memory alone.
