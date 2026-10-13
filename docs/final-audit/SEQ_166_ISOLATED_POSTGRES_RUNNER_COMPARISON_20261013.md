# SEQ-166 — Isolated PostgreSQL audit runner versus GitHub admin workflow (2026-10-13)

Source-only comparison and workflow status, no test execution or code fix.

1. `scripts/execute-disposable-postgres-audit.mjs` requires `assertDisposablePostgres()` before migrations and tests, runs `lib/db/scripts/audit-disposable-migrate.mjs`, then per-file isolated `node --import ./scripts/lib/disposable-postgres-preload.mjs --import tsx --test --test-concurrency=1`. Enforces no all-skipped or zero-PASS green and cleans fixture data. `tenant` batch includes `admin-auth-router-postgres.integration.test.ts`; `billing` batch includes `superqi-sandbox-billing.integration.test.ts`.
2. Runner **consumes**, but does not create, mandatory disposable attestation. Actual network-none container and database marker must be created by separate execution environment. The existence of runner is not proof that GitHub admin workflow satisfies it.
3. `.github/workflows/global-admin-golden-journey.yml` instead starts ordinary `services.postgres` and directly invokes tsx test, without runner/proof; therefore CI incompatibility `ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001` persists. Do not disable guard or fake attestation.
4. `scripts/disposable-postgres-test-guard.test.mjs` covers remote-target denial, namespace/loopback mismatch, identity marker mismatch and cleanup failures through injected fakes; unit guard checks do not substitute for real isolated integration.
5. `docs/final-audit/DISPOSABLE_POSTGRES_EXECUTION_PLAN.md` remains labeled PLAN ONLY, DB-00..DB-08 NOT RUN. Some later independent CI results exist elsewhere; the matrix's statuses should be reconciled only by exact suite/runner proof, not silently flipped based on similarly named workflows.
6. Latest observed GitHub admin run 38335462585 FAIL; repeated audit-document commits retrigger workflows and cancel in-progress concurrency siblings. No new runtime PASS claimed.

Pending: inspect runner's actual CI invocation or job evidence, identify gaps in isolation orchestration, then test admin journey on proven network-none disposable DB after audit/remediation approval. Audit-only, release BLOCKED, ~54%/46% estimate unchanged.
