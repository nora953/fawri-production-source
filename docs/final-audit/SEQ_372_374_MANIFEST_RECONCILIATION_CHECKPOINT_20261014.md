# SEQ-372–374 — manifest reconciliation checkpoint (2026-10-14)

Audit-only checkpoint; no application fixes, tests, DB mutations, merge or deployment.

## Verified inputs
- Read AUDIT_EXECUTION_CONTROL_PLAN_V1_20261014.md and AUDIT_MANIFEST_SCHEMA_AND_DOMAIN_QUEUE_20261014.md on audit branch.
- Read latest heads of AUDIT_REGISTER.md, PROGRESS.md, ISSUES.md, MASTER_PLAN.md and SEQ_366_371_EMERGENCY_WORKSPACE_INTEGRITY_20261014.md; PR #520 checked.
- Latest authoritative checkpoint remains SEQ-371; this is the next documentation reconciliation checkpoint, not new test execution.

## SEQ-372 inventory reconciliation
- UI baseline: 222 scoped; 84 PASS_BOUNDED_FULL_APP, 138 NOT_RUN, as recorded at SEQ-371. This is UI baseline only.
- Extra 36 state cases and 8 diagnostics are outside baseline and do not increase its denominator or accepted count.
- 21 unmapped selectors; 11 partial domains. Exact row-level case IDs and canonical CSV source still require locating and importing. Do not synthesize IDs.
- Required proof layers remain separate: source/static, unit, native browser, SQL, HTTP, real integration, staging/operational.

## SEQ-373 domain and priority mapping (queue, not executed cases)
- P0: tenant/RLS/authorization; admin/emergency; billing callbacks; cashier offline/sync/concurrency; backup/restore; secrets/readiness.
- P1: inventory/returns/reporting; Meta/AI; subscriptions; migrations; i18n/accessibility; observability.
- P2: cosmetic/responsive low-impact findings.
- Canonical issues must be linked from ISSUES.md before any new issue is created. Source-only findings must not be promoted to SQL/HTTP acceptance.

## SEQ-374 manifest gate
- Schema is defined in AUDIT_MANIFEST_SCHEMA_AND_DOMAIN_QUEUE_20261014.md; actual complete machine-readable manifest and frozen denominator NOT YET VERIFIED.
- Status: BLOCKED for overall percentage, release BLOCKED. No new cases executed or accepted in this checkpoint.
- Next: locate original 222-row CSV in repository/CI evidence, import IDs verbatim, attach per-row source SHA/evidence, enumerate non-UI code/config/route/migration inventory, freeze v1 denominator; then select 5–12 unique unverified P0 cases for safe disposable-fixture execution.

This document intentionally does not claim SEQ-372–374 are complete proof gates. It records the reconciliation performed and remaining blockers.