# FAWRI P0 / FIELD002 — Configured runtime eight-table RLS readiness

**Observed and implemented:** 2026-11-04. Repository `nora953/fawri-production-source`; working branch `fix/p0-provider-receipt-order-discovery-20261015`; draft PR #550. This is a **source hardening / disposable CI** checkpoint; **no hosted rollout or FIELD002 closure**.

## Hosted facts grounding the code gate

- Railway operator privately confirmed that `DATABASE_URL` username is `fawri_staging_rls_runtime`, the same displayed expected-role name. Original Neon `Fawri-Staging / staging-runtime` has that role as **NOLOGIN**, **NOBYPASSRLS**, **NOCREATEROLE**.
- Critically, on that original branch this NOLOGIN principal has **SELECT, INSERT, UPDATE, DELETE across all eight** known residual merchant privacy tables, while **0/8 have RLS enabled and zero corresponding policies exist**. Turning on LOGIN alone would enable broad unscoped data privileges and is **not an acceptable fix**.
- The authorized isolated Neon rehearsal branch has exactly the same eight historical table grants, but **8/8 tables have RLS enabled** and eight corresponding policies. Its last historical migration `0052` remains independently **BLOCKED** due to trusted function-owner role handoff requirements.
- The original `fawri_staging_runtime` login, a different role, has **BYPASSRLS and CREATEROLE**, and is not a safe replacement in the connection string. The web service is still deployed from older `main`; **nothing in this PR is live on Railway**.

## New executable source gate

- Source: `artifacts/api-server/src/observability/runtime.ts`, commit **`4fd812d984d744acaae3a58b430ee98fa2ef8d1c`**.
- For an API deployment that explicitly sets `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE`, `postgresql_authority` readiness now requires **all eight** residual tables to exist in `public`, have `relrowsecurity=true`, and have **at least one actual `pg_policy` entry per table**. The query runs as a single SELECT alongside current/session role privilege checks, takes a parameterized list of table names, and returns only an integer count.
- The eight tables are: `audit_events`, `manual_reply_requests`, `merchant_admin_notes`, `merchant_channel_overrides`, `merchant_deletion_requests`, `notifications`, `order_drafts`, `processed_channel_events`.
- A configured runtime fails closed with `POSTGRES_RUNTIME_PRIVACY_RLS_NOT_READY` unless the database reports **exactly 8/8 qualifying table-policy pairs**. The expected current PostgreSQL username must still match the configured role, with BYPASSRLS, CREATEROLE and privileged membership paths separately prohibited.
- Unconfigured local/development readiness keeps existing behavior so disposable tests without full tenant migration fixtures can run. **Policy presence is a minimum admission requirement, not evidence that the policy content enforces tenant isolation**; positive-own, foreign-negative, revoked authentication and SQL/HTTP acceptance remain independently mandatory.

## Executable regression coverage

- Unit test source `artifacts/api-server/tests/postgres-runtime-role-readiness.test.ts`, commit `e0f2d394372ab0de2190e7f9ffe2ad21db21534f`: three new tests confirm the canonical eight-table inventory, reject counts 0/1/7/9/missing/malformed under an explicitly configured expected role, and preserve unconfigured local readiness.
- Mounted integration source `artifacts/api-server/tests/observability-mounted.integration.test.mjs`, commit `71f50542e263a5c962200ac5146b48ce7bec52c5`: starts the real API against **disposable CI PostgreSQL** using a restricted LOGIN with matching expected-role config but **without the eight privacy RLS migrations**. Verifies **HTTP 503 / not_ready**, `postgresql_authority` DOWN, no connection URL leaked to the HTTP result. It does not write hosted database state.
- The first code CI run failed one security-candidate job due solely to a documentation line using a **credential-URL-shaped dummy example** in `P0-FIELD002-RAILWAY-NEON-LIVE-ENDPOINT-CORRELATION-20261104.md`. The repository scanner correctly rejected the example; the dummy was replaced with plain prose in commit `e4e6e4a616258d3d04032cdf1a538fd0c2c28c5e`. **No real secret was committed**, and scanner rules were not disabled.
- [Observability mounted routes — corrected commit](https://github.com/nora953/fawri-production-source/actions/runs/41821213862) **SUCCESS**. [Merchant access security](https://github.com/nora953/fawri-production-source/actions/runs/41821214580) **SUCCESS**. **Full 59-workflow CI on `e4e6e4a6` was still in progress as of this documentation checkpoint**; check runs on that exact SHA before accepting full green.

## Real Neon read-only query and outcome

The count expression from the source readiness gate was re-executed on **both real Neon branches** using SELECT without a deployed app session. The original branch reported **0/8** qualifying RLS/policy table pairs, while the isolated rehearsal reported **8/8**. This is direct database validation of the gate's discriminating condition, **not** proof that the deployed app uses the role successfully.

```sql
SELECT count(*)::int AS critical_privacy_rls_ready_count
FROM pg_class protected
JOIN pg_namespace privacy_ns ON privacy_ns.oid=protected.relnamespace
WHERE privacy_ns.nspname='public'
  AND protected.relkind IN ('r','p')
  AND protected.relname=ANY(ARRAY[
    'audit_events','manual_reply_requests','merchant_admin_notes',
    'merchant_channel_overrides','merchant_deletion_requests',
    'notifications','order_drafts','processed_channel_events']::text[])
  AND protected.relrowsecurity
  AND EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=protected.oid);
```

## Release gate

No mutation to original `staging-runtime`, any Railway service/variable, data, SQL ledger, role login, RLS settings or source historical migration. A proper owner-approved staged rollout remains necessary. The 15 historical source-less notification records and all external/custom consumer/hosted actor tests remain independent `FIELD002` blockers. **FIELD002 and parent privacy gate OPEN; 0052 BLOCKED; overall release NO-GO; canonical known P0 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, overall percentage unverified.**
