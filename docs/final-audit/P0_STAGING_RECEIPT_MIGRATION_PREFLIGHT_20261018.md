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


## CI completion and final read-only gate — 2026-10-18

- Commit `1923c83a08f642868f91dbda4ff0c64feb042885` completed **40/40 GitHub Actions workflows successfully**, including isolated PostgreSQL audit and schema validation. This verifies the PR branch on disposable CI infrastructure, not the hosted staging release.
- Read-only Neon staging query reconfirmed `drizzle.__drizzle_migrations` has 28 records with latest `created_at=1791244800000` (journal tag `0027_cashier_subscription_licensing`). `to_regclass('public.verified_provider_payment_receipts')` is NULL and the confirmed-payment order resolver was absent. Journal entries `0028` through `0033` remain ahead of hosted staging.
- Read-only ACL query found existing public `fawri_tenant_or_audited_admin` is SECURITY DEFINER and publicly executable; committed migration `0024_tenant_rls_security_definer_predicate.sql` explicitly grants that predicate to PUBLIC. Do not misclassify this preexisting intended RLS helper as an accidental new receipt capability grant.
- The new `0028` Meta resolver and `0029`–`0033` receipt functions revoke PUBLIC EXECUTE. Their intended trusted runtime EXECUTE grants and owner remain deployment approval gates; never automatically grant PUBLIC or deploy with an owner/BYPASSRLS application role.
- **P0 NO-GO** remains in effect. No staging DDL/DML, runtime grants, deployment or PR merge was executed in this read-only check.


## Third complete green CI cycle — 2026-10-18

- Commit `e183ecae5f405f1bf97e4291affa219c599a72d6` completed **40/40 GitHub Actions workflow runs successfully**; no pending or failed runs. This is the third consecutive completed all-green 40-workflow cycle (`cf369918`, `1923c83`, `e183eca`).
- Re-read `0033_confirmed_provider_order_resolution.sql`: it requires a matching durable verified receipt, serializes by payment reference, checks bot and cashier order authority independently, rejects ambiguity/cross-authority collisions and amount/reference mismatches, and returns no owner when no matching order exists. This source review does not replace hosted signed-provider acceptance.
- P0 remains **NO-GO** pending the explicitly approved staging migration, least-privilege runtime/SECURITY DEFINER grants, deployment and end-to-end acceptance. No hosted changes were performed.


## Fourth all-green CI and unchanged staging gate — 2026-10-18

- Commit `cc6920d30165182d2bd8202fa2a9d17b7dc020f0` completed **40/40 GitHub Actions workflow runs successfully**, including the isolated PostgreSQL engineering audit. This is the fourth consecutive fully green cycle on the PR branch.
- Fresh read-only query against explicit Neon `staging-runtime` branch returned **28** migration ledger rows, latest timestamp `1791244800000`, and `to_regclass('public.verified_provider_payment_receipts') IS NOT NULL = false`. Hosted schema remains behind committed `0028`–`0033`.
- No staging migration, grant, Railway deployment, or merge was executed. CI success alone does not lift the **P0 NO-GO** gate; the approved isolated migration rehearsal, hash reconciliation, role/grant proof and hosted acceptance remain outstanding.


## P0 current checkpoint — 2026-10-18 (read-only, no rollout)

- PR #550 commit `925e888bea0aae526eb1fa523e7e1c3113483274` passed **40/40** commit-associated GitHub Actions workflows, with no failed or pending workflows at verification.
- `0032_authorized_receipt_replay_execution.sql` now holds SHARE locks on both account/session and the selected SaaS or cashier billing order during replay authorization. The authoritative `migration-stages/0032/manual.sql` was synchronized; migration candidate CI passed.
- Isolated Neon audit branch `br-snowy-voice-b1bovtwi` still reports **28** Drizzle migration ledger entries and no `public.verified_provider_payment_receipts` table. Six migrations (`0028`–`0033`) remain unapplied there.
- Read-only Neon connection used `neondb_owner` (BYPASSRLS); `fawri_staging_runtime` is LOGIN/BYPASSRLS and `fawri_staging_rls_runtime` is NOLOGIN/NOBYPASSRLS. This is **not** evidence of safe deployed application login/session identity. Verify both `current_user` and `session_user` using the hosted app readiness path after an approved rollout.
- P0 progress is **approximately 87% (historical engineering estimate, not a computed or release-accepted score)**. P0 remains **NO-GO** until authorized isolated migration rehearsal, exact role/function ACL verification, restricted-runtime tenant isolation and hosted provider receipt/replay acceptance. No Neon writes, Railway changes, deploy or merge authorized or performed.
