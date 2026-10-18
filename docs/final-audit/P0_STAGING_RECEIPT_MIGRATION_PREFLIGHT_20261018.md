# P0 — Staging receipt migration preflight (2026-10-18)

## Confirmed live read-only evidence

- Neon project `round-fire-18493605`, explicit non-default branch `staging-runtime` (`br-falling-dust-b1km4gix`), database `neondb`.
- Migration journal `drizzle.__drizzle_migrations`: 28 entries. This count is not a proof of exactly which migrations were applied; reconcile hashes/tags before any rollout.
- `public.verified_provider_payment_receipts` absent; `public.fawri_resolve_confirmed_payment_order(text,text,text,text,integer,text)` absent.
- `saas_billing_orders` and `cashier_billing_orders`: RLS enabled, FORCE RLS false, owner `neondb_owner`.
- `fawri_staging_rls_runtime`: NOSUPERUSER, NOBYPASSRLS, NOLOGIN. Read-only probes used `neondb_owner`, which has BYPASSRLS, so runtime isolation has NOT been proven on staging.
- GitHub PR #550 commit `a524acc1afe3ba475ee815baa27aa540ab7939c0`: 25/25 CI SUCCESS on disposable infrastructure. Railway staging was last observed running old `main` commit `d38d29229bed0f9575a98e7026e7819fe363bfd4`, not PR #550.

## Migration review (repository only, no SQL executed)

- `0029_verified_provider_payment_receipts.sql` creates a global, no-tenant-assignment verified receipt inbox with RLS and no PUBLIC privileges; admission is a SECURITY DEFINER capability. This is not an entitlement grant.
- `0032_authorized_receipt_replay_execution.sql` permits audited, authorized replay only for an existing matching order and explicitly refuses null-reference repair.
- `0033_confirmed_provider_order_resolution.sql` requires a previously admitted matching receipt; zero matching orders returns zero rows, never guesses tenant ownership; ambiguous/colliding identities fail closed; PUBLIC EXECUTE revoked.
- New functions are SECURITY DEFINER with `search_path=pg_catalog` and `row_security=off`; this makes **function ownership and narrowly reviewed EXECUTE grants release-critical**. The app must not run as a BYPASSRLS owner. Merely applying migrations will not establish a safe restricted runtime.

## Required gated rollout sequence (NOT authorized for execution)

1. Identify approved staging database/branch, deployed code revision, and intended runtime login + `SET ROLE`/session authority. Confirm no default/production branch target.
2. Capture backup/restore point and reconcile actual migration journal IDs/hashes against the committed migration manifest; do not infer missing files solely from count 28.
3. On a newly created disposable clone, rehearse only missing migrations in repository order with the repository's migration runner; capture migration output, object owners and grants, rollback/restore evidence.
4. Verify PUBLIC and runtime EXECUTE privileges on all receipt functions, ownership, RLS/FORCE RLS, and direct table access; approve least-privilege grant plan before touching staging.
5. Run restricted-role signed webhook HTTP acceptance for both **bot/SaaS subscription** and **cashier subscription** separately: matched order once-only entitlement, unmatched durable receipt without tenant attribution, duplicate/collision fail closed, revoked capability fail closed, and no cross-tenant visibility.
6. Independently decide operator orphan reconciliation, retention and deletion policy. Never auto-assign an unmatched payment to a merchant or merge/GO while these remain unresolved.
7. Only after explicit user approval: apply approved staging migration/deployment in controlled order, rerun acceptance and readiness, record evidence and rollback status.

## Stop conditions

Stop on journal mismatch, missing/incorrect owner, BYPASSRLS runtime, broad EXECUTE grant, missing restricted-role proof, non-idempotent migration, wrong branch, or unclear backup/rollback. No hosted writes, DDL, grant, deploy or merge were performed in this review. **P0 NO-GO**.

## Journal reconciliation update — read-only

- Live `staging-runtime` migration journal last row: `id=28`, `created_at=1791244800000`.
- Committed `lib/db/drizzle/meta/_journal.json` entry `idx=27`, tag `0027_cashier_subscription_licensing`, has `when=1791244800000`; entries `idx=28..33` are `0028_meta_ingress_bounded_page_resolver` through `0033_confirmed_provider_order_resolution` with `when=1791936000000..1791936000005`.
- This timestamp alignment and absence of newer objects support that six committed migrations remain unapplied on staging. **Still reconcile migration hashes and complete history before writing**; journal row ID is not the file index, and matching timestamp alone does not authenticate SQL contents.


## Latest PR #550 CI evidence — 2026-10-18

- Commit `cf369918ec102e0f86b683ddb163ed817d11323e` (runtime readiness rejects missing/blank PostgreSQL role identity, with regression cases) completed **40/40 GitHub Actions workflow runs successfully**. Verified via commit-associated workflow runs; no failures, cancellations, or outstanding runs at the check.
- Isolated PostgreSQL engineering audit and PostgreSQL schema validation both finished successfully in that set. This is CI evidence from disposable infrastructure, **not** proof of hosted staging migrations, runtime role/EXECUTE grants, or signed-provider acceptance.
- Release gate remains **P0 NO-GO** pending the controlled, explicitly approved staging acceptance sequence above. No hosted database writes, deployment, or merge occurred during this verification.
