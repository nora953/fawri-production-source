# Fawri final audit — master plan

Status: FA-000 in progress. Source of truth: GitHub `main` plus this audit ledger once merged.
Baseline commit: `56d7ac266d2d02d0cc5197f2dfeda134199b2baf` (2026-10-09).
Last recorded: 2026-10-10.

## Purpose
Close the existing Fawri engineering audit without repeating already proven work. Freeze feature scope. Visual QA is last. Production domain and external Meta/AI/billing integrations follow a separately approved release gate.

## Non-negotiable rules
1. Each task has an ID, scope, baseline SHA, evidence links, outcome, and exact next action.
2. A prior PASS is historical evidence, not automatic proof at a later commit. Reopen only for a relevant code/config change or reproducible new finding; record why.
3. Separate **implemented**, **tested**, **deployed**, and **verified end-to-end**. Do not equate one with another.
4. Audit read-only by default. No branch merges/deletions, DB writes, secrets changes, redeploys, or production actions without explicit authorization.
5. Before any new work read PROGRESS.md, AUDIT_REGISTER.md, ISSUES.md, and check current GitHub SHA. At end, record what was verified and where to resume.
6. Do not record credentials, tokens, personal data, database connection strings, or private logs.
7. PASS requires evidence and closure criteria; BLOCKED must name the missing proof. Do not invent completion percentages.

## Stages
- FA-000 Continuity system: create four audit files on a review branch, open PR, merge only after review/checks.
- FA-001 GitHub inventory: paginate all branches and PRs, classify merged/obsolete/diverged/unmerged; do not merge or delete automatically.
- FA-002 Delta and cross-system integration audit: inspect only changed or unproven paths; cashier offline, bot/order/inventory/subscription interactions, tenant isolation, and failures; evaluate concrete external findings.
- FA-003 Targeted fixes and cleanup: fix evidenced defects; run relevant regression gates; dictionary/AR/KU/EN review and structural cleanup only when justified.
- FA-004 Staging operational proof: Railway API/frontend, Neon PostgreSQL role/migrations, readiness, backups and service workflows. No production DB mutations.
- FA-005 Final visual QA: merchant, cashier, owner admin, AR/KU/EN, responsive and accessibility; last.
- FA-006 Final release decision: one verified main SHA, gate report, documented external-provider blockers, controlled domain/integration plan.

## Stage exit record
Task ID | baseline SHA | checked scope | prior evidence reused | new evidence | issues opened/closed | PASS/BLOCKED | next task.

## References
- [Historical 16-phase core freeze](../fawri-core-freeze-audit-2026-10-07.md)
- [Release blockers](../FAWRI_RELEASE_BLOCKERS.md)
- [Staging deployment contract](../staging-deployment-contract.md)
