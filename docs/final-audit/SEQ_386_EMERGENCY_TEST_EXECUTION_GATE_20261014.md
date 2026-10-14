# SEQ-386 — Emergency PostgreSQL test execution gate

Date: 2026-10-14. Audit-only inspection; no runtime test launched in this checkpoint.

## Verified
- `.github/workflows/audit-isolated-postgres.yml` has `workflow_dispatch` and reusable `workflow_call` with `suite` input. The job runs a no-network Docker PostgreSQL fixture and cleanup.
- `scripts/run-isolated-postgres-audit.sh` creates a new offline PostgreSQL 16 container with no published ports, attestation marker, and isolated Node runner; runs migrations, then suite selector.
- `scripts/execute-disposable-postgres-audit.mjs` checks `assertDisposablePostgres()` before migrations and tests. It runs each selected test with a disposable preload and TAP reporter, and rejects skipped/empty summaries.
- Its named suite map **does not contain** `emergency-read-access-postgres.integration.test.ts`; `AUDIT_SUITE=emergency` currently fails `unknown audit suite`. `workflow_dispatch` alone cannot execute the emergency test without a test-harness-only suite mapping.
- Existing emergency test checks loopback and database name, but relies on harness for full disposable proof.

## Decision and constraints
No workflow was dispatched, no PostgreSQL tests executed, and no application/original-test code was changed. The audit-only harness could later add a single `emergency` suite mapping, with code review and branch-only CI; such a change must be explicitly separated from application repair and executed solely against the disposable attested database. Do not rerun broad failing `priority` as a substitute for the missing suite.

## Follow-up
1. Introduce a **test-harness-only** emergency suite selector on audit branch after verifying test isolation/cleanup and its dependencies.
2. Trigger only the emergency suite through workflow dispatch or a reviewable PR trigger, capture run/job/SHA, test outcome and teardown.
3. Preserve failures and add missing directory GET 403/200 and original browser revocation proofs as separate evidence, not by claiming existing assertions were run.

Coverage newly executed 0. New defects 0. Whole-audit progress NOT_YET_MEASURABLE; release BLOCKED.
