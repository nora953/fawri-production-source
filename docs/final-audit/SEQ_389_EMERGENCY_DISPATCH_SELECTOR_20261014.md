# SEQ-389 — Emergency CI dispatch selector

Audit-only change; 2026-10-14.

## Verified
- Prior isolated PostgreSQL run 38507438461, SHA 329f6369197f92b3aec97d36d98195d0d38f97b7, completed **cancelled**. It was a PR-triggered `priority` suite, not emergency; no emergency PASS/FAIL can be inferred.
- Audit-branch workflow `.github/workflows/audit-isolated-postgres.yml` now defines a `workflow_dispatch` input `suite`, choice type, required, default `emergency`; allowed options emergency, priority, cashier, billing, tenant, meta-bot, full-restore, node22-http.
- Commit c579f790d137a0ccdf29c61afb48e92343205d4c, re-fetched workflow content SHA 554ff8841f127ca36159ea4e785641b5c6ba7080 and confirmed selector present.
- Existing workflow's `AUDIT_SUITE: ${{ inputs.suite || 'priority' }}` passes selected dispatch input to `scripts/run-isolated-postgres-audit.sh`, and audit runner contains emergency suite mapping from SEQ-387.

## Runtime limitation
This audit connection can inspect workflow runs and update files but does not expose a workflow-dispatch operation. **No emergency run was triggered in this stage.** Do not claim suite success, failure or cleanup. GitHub Actions UI can now dispatch the audit branch with `suite=emergency` (requires user action or a separately available dispatch integration).

## Next
Capture exact emergency run ID/job/SHA, isolation attestation, migration status, TAP case counts, cleanup; then isolate missing GET directory and browser revocation proof. Do not use cancelled priority run as evidence.

0 newly executed cases; release BLOCKED; overall audit progress NOT_YET_MEASURABLE.
