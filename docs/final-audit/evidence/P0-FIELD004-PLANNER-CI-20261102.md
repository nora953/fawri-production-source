# F004-R1 — Offline legacy draft planner CI evidence (2026-11-02)

- Scope: GitHub-only source and synthetic offline planner tests. No hosted access, migration execution, SQL import, deploy, order continuation, or release approval.
- Source commit tested: `535c7448f5846a4e340019fec31e2c0f6c33b616` (Draft PR #550).
- CI: [Complete migration safety run 41437863334](https://github.com/nora953/fawri-production-source/actions/runs/41437863334), job `125252078476`: **completed/success; 50 tests passed, 0 failed**.
- Verified job command includes `scripts/tests/plan-postgresql-migration.test.mjs`, `scripts/tests/run-postgresql-migration-plan.test.mjs` and five previously covered migration/operational-safety suites. Both planner files also passed `node --check`.
- Verified named F004-R1 regressions: duplicate matching conversation identity rejected; unverified historical TTL evidence rejected without source mutation; self-consistent but untrusted historical TTL claim rejected; explicit expired drafts preserved for both supported states.
- Workflow change: commit `535c7448f584` adds both planner suites to CI trigger paths, syntax checks, and test command; this is an automated future regression gate, not an application runtime change.
- Owner-approved scope remains bounded to source-bound offline legacy draft mapping. Historical TTL/config attestation has **not** been certified; planner must fail closed when missing. Current consumer/retention/hosted inventory and F004-R2 remain unresolved. No automatic continuation, order creation, TTL guessing, or source deletion authorized.
- Closure status: **F004-R1 OPEN (CI evidence improved; final source-contract and lifecycle acceptance reconciliation pending)**; **F004-R2 BLOCKED_HOSTED_VERIFICATION**; parent `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` OPEN; release **NO-GO**. Do not interpret 50 passing synthetic tests as hosted data acceptance.
- Next exact action: reconcile this current-source proof against F004-R1 acceptance checklist and consumer/disposition contract; do not duplicate already-passing tests. Preserve separate hosted F004-R2 block and existing approved boundaries.
