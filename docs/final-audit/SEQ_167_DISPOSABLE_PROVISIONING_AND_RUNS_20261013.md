# SEQ-167 — Proven network-none PostgreSQL provisioning path and CI status (2026-10-13)

Source and GitHub Actions metadata audit, not a new database execution.

## Real provisioning mechanism located

`scripts/run-isolated-postgres-audit.sh` creates fresh Docker `postgres:16-alpine` with `--network none`, random run ID/password, `fawri_ci` database marker `fawri-disposable:<runId>`, writes 0600 attestation file containing container ID and namespace, then starts Node container with `--network container:<postgres-id>`, read-only repository and proof mounts, local-only database URL, no host DB credentials, and cleanup trap. Executes `scripts/execute-disposable-postgres-audit.mjs`. It also implements full schema dump/restore for `full-restore`. This **is** the actual isolation provisioning missing from the separate global-admin-golden-journey workflow.

`.github/workflows/audit-isolated-postgres.yml` calls this script for priority, cashier, billing, tenant, meta-bot, full-restore, Node22 HTTP suites. Thus admin auth integration is included under `tenant` in this protected runner. Distinguish existence of workflow/script from successful execution.

## Current run state

At inspection, isolated workflow run 38335621370 was **queued**, preceding 38335614360 and 38335596565 **cancelled** by concurrency. No PASS established in this stage. The admin golden workflow remains independently blocked by missing attestation, despite an isolated runner existing elsewhere.

## Follow-up

Read completed isolated workflow logs and per-suite `AUDIT_SUITE_RESULT` before assigning DB-00..08 statuses. Confirm `tenant` batch executes admin-auth-router test and distinguish setup vs test failures. Do not disable isolation guard or run against hosted DB. No app fixes, release BLOCKED, planning estimate ~54%/46%.
