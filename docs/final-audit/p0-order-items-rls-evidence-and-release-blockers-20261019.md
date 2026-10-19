# P0 order_items RLS — verified evidence and release blockers (2026-10-19)

## Scope and branch
- Repository: nora953/fawri-production-source
- Audit branch: fix/p0-provider-receipt-order-discovery-20261015
- Operational migration: lib/db/drizzle/0035_order_items_tenant_rls.sql
- Canonical stage: lib/db/migration-stages/0035/{stage.json,manual.sql}
- Snapshot: lib/db/drizzle/meta/0035_snapshot.json
- Readiness guard: artifacts/api-server/src/services/postgresRuntimeRlsSecurity.ts

## Evidence
- Disposable Neon audit branch: br-billowing-leaf-b14yamgu, project round-fire-18493605, database neondb. Never confuse with production/default or staging branches.
- Before mitigation, order_items had RLS disabled; restricted-role queries exposed cross-tenant rows in the disposable fixture.
- After applying policy on disposable branch, no-tenant context returned zero order_items rows. With tenant A context, tenant A only was visible; cross-tenant update/delete had zero affected rows and cross-tenant insert was rejected. Tenant B context returned only item-p0-rls-b-20261019, not tenant A.
- The tested connection authenticated as fawri_staging_runtime has rolbypassrls=true, even when SET LOCAL ROLE fawri_staging_rls_runtime gives a non-bypass effective current_user. This is NOT acceptable production-runtime attestation: session_user can recover its original privileges.
- Neon owner neondb_owner also has BYPASSRLS. Never use owner credentials for runtime RLS attestation.
- Commit 752a36ecc084aa4f286fe8d6c98105bf45ca39ec: GitHub CI observed 40 completed successful workflows out of 41, zero failures, while Isolated PostgreSQL engineering audit was still in progress (run 39218484604). PostgreSQL schema validation, PostgreSQL migration candidate, and Location inventory authority each completed successfully. Recheck final CI before claiming complete.

## Release blockers and next actions
1. Wait for Isolated PostgreSQL engineering audit run 39218484604 to complete; inspect job logs on failure.
2. Verify actual deployment DATABASE_URL authenticates as a dedicated LOGIN role with NOSUPERUSER NOBYPASSRLS, without table ownership or SET access to privileged roles. Do not alter existing staging/production role grants without reviewed rollout.
3. Run isolated least-privilege integration tests using the real login role (not SET ROLE from a BYPASSRLS session), including tenant isolation, allowed own-tenant writes, and forbidden cross-tenant writes.
4. Validate all production RLS readiness tables, role ownership, and policy/grant coverage in the intended deployment environment.
5. No production deployment, no merge, and no P0 GO until gates pass. Keep cashier and AI reply services separate; they share inventory but have distinct authority paths.

## Safety
All synthetic writes and policy experiments were performed on the disposable Neon branch. This note does not authorize a production migration or privilege changes.

## Additional role inventory (disposable Neon, 2026-10-19)
- Login-enabled roles inspected: cloud_admin (SUPERUSER/BYPASSRLS), neon_service (BYPASSRLS), neondb_owner (BYPASSRLS), and fawri_staging_runtime (BYPASSRLS). None of these qualifies as an unprivileged runtime login.
- fawri_staging_rls_runtime is NOSUPERUSER NOBYPASSRLS but NOLOGIN. It cannot establish a direct application session. Its SET ROLE test is useful for checking policies, **not** sufficient for runtime-login attestation.
- Required next step: provision a separate LOGIN NOSUPERUSER NOBYPASSRLS role with no protected-table ownership and no SET privilege to any privileged role; grant only the audited operational privileges and confirm the deployment authenticates as that role. This must be planned and reviewed before any role changes on staging or production.

## Additional P0 runtime readiness defense (2026-10-19)
- Commit fef7ecfdd3b1cbed251709eaca32a8ae16b63ba2 hardens artifacts/api-server/src/observability/runtime.ts: PostgreSQL authority readiness now checks whether session_user can SET ROLE to any SUPERUSER/BYPASSRLS role and fails closed.
- Commit 7a9aefa2b8e53468dd7d2af31ddcb550d7fb5afb adds negative tests for missing/true session_can_set_privileged_role.
- Direct disposable-Neon SQL probe with authenticated fawri_staging_runtime returned session_can_set_privileged_role=true. This is expected to be rejected by the new readiness gate.
- CI for commit 7a9aefa2b8e53468dd7d2af31ddcb550d7fb5afb was in progress at observation; do not claim this new patch has passed until final checks complete.

## CI checkpoint for latest security patch
- Commit deb6e3b65b7d1b45a59f217c6ad833c3cc9fa199: 40/41 GitHub workflows completed successfully; isolated PostgreSQL engineering audit (run 39220252703, disposable-audit job 117954169840) still in progress at checkpoint. No failed workflows observed. Do not interpret running as passed.
- Runtime security fix is committed in fef7ecfdd3b1cbed251709eaca32a8ae16b63ba2 and covered by tests in 7a9aefa2b8e53468dd7d2af31ddcb550d7fb5afb.
- The next release decision must separately check the latest commit's CI status and a directly authenticated least-privilege LOGIN role. Passing CI alone is not P0 GO.
