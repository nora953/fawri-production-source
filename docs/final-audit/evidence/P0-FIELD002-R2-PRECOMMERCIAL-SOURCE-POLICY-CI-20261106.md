# FIELD002-R2 — precommercial source-admission policy (2026-11-06)

## Current boundary
The owner approved deletion of the explicitly reviewed **precommercial test notifications** in original nondefault staging and the two isolated test clones. The fresh clone has now passed **real hosted 7/7 tenant SQL/HTTP tests** and was restored to the baseline. This is **not** permission to use staging-derived data in the first commercial release.

Neon read-only branch metadata on 2026-11-06 independently confirmed seven known project branches, including **three archived staging-derived ancestors**. Their contents were not read, deleted, restored or unarchived. The archived status and exact branch lineage match the source catalog.

## New executable source policy and CI
- \`scripts/lib/field002-r2-precommercial-source-admission.mjs\` refuses **all branch-data imports, backups and restores**, including ostensibly clean staging clones, for the first commercial bootstrap. It admits only a declarative **fresh schema-migrations-only, zero data import** plan targeting the pinned production branch.
- Known archived branches get an explicit quarantine rejection, even if a caller claims there are zero notifications. Unknown branch sources and malformed or extra fields are rejected.
- Known live Neon branch metadata must preserve the observed production/staging/clone ancestry and the three archived states; changed names do not grant authority. The check consumes non-secret **branch metadata only**, not customer data.
- \`scripts/tests/field002-r2-precommercial-source-admission.test.mjs\` has positive and negative tests for branch-copy attempts, archived/unknown source branches, forged restore modes, missing fields and changed archived/default status. It is wired into the existing \`Backup and restore drill\` GitHub Actions workflow.
- Crucially, the policy **always** returns \`deploymentAuthorized: false\` and \`field002Closed: false\`. Passing a source-policy check is not hosted SQL proof and cannot authorize the release. It is an executable, regression-tested constraint for a future first-launch procedure, not a deployed release gate.

## Separate remaining release requirements (not waived)
The actual deployment environment and any external/manual Neon branch restore, backup, seed or import process **must independently enforce** a source-provenance and hosted post-restore fixture-exclusion gate. The existing loopback-only test restore script cannot enforce this on Neon. Future legitimate **merchant recovery** is distinct from first-commercial-bootstrap and cannot use a blanket zero-notifications rule.

Controlled original \`staging-runtime\` ACL repair/migration rollout, production restricted runtime identity, 0052 migration-owner bootstrap, real production backup/restore proof and hosted launch admission all remain separate. No original-staging/default-production SQL mutation, archived branch unarchive or merge is part of this commit. **FIELD002 OPEN / 0052 BLOCKED / P0 NO-GO**, historical 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED (overall P0% not certified).
