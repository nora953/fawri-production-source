# SEQ-375 — Source-test inventory and denominator guard (2026-10-14)

Status: **SOURCE INVENTORY ONLY; NOT A TEST EXECUTION OR ACCEPTANCE REPORT**.

## Verified inputs
- Git tree on audit branch before inventory write: `e9a4e90bd601a1ccce3d18ee659ae843d117576d` (recursive tree returned 2,085 blobs).
- Source-test candidates matching test/spec path and .ts/.tsx/.js/.mjs/.sql extensions: **453 files**.
- Source inventory: `docs/final-audit/evidence/audit_non_ui_test_source_inventory_20261014.csv`, 453 paths and Git blob SHAs.
- Distribution by directory: API 279, frontend 126, remaining 48 in scripts/db. Directory distribution is descriptive, not acceptance coverage.
- Keyword classification is **multi-label and non-exclusive**; 116 files matched none of the preliminary keyword labels. Do not sum category counts into a denominator.
- Existing UI baseline: 222 unique cases, 84 historical bounded UI passes, 138 NOT_RUN; the 453 test *files* are not added as 453 test cases.

## Required next gates
1. Inspect the 116 unclassified source files, especially catalog and delivery functionality, and refine domain taxonomy.
2. Extract test declarations and parameterized cases from each file to build a deduplicated case denominator; preserve each source SHA and runtime proof layer.
3. Correlate prior CI run IDs/logs, assertions, skipped cases, and required environment; assign PASS only for proven execution and correct proof layer.
4. Prioritize tenant/RLS, auth/admin, billing callbacks, offline cashier/sync, backup/restore, readiness/secrets as P0, then inspect missing live HTTP/SQL/provider acceptance.
5. Publish separate counts for source inventory, executed checks, bounded evidence, and fully accepted checks. Overall coverage remains NOT_YET_MEASURABLE; release remains BLOCKED.

No application code, database, deployment, or migration was modified in this batch.
