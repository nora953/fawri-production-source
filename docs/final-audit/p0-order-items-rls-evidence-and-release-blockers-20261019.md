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

## Direct LOGIN provisioning acceptance criteria (read-only verification)
- The restricted policy-test role fawri_staging_rls_runtime has NOLOGIN, NOSUPERUSER, NOBYPASSRLS and cannot SET or inherit any of the five privileged roles inspected (cloud_admin, fawri_staging_runtime, neon_service, neon_superuser, neondb_owner). This is necessary but insufficient: it is not a direct LOGIN.
- Provision a new direct LOGIN with NOSUPERUSER NOBYPASSRLS; no ownership of protected tables, no privileged SET ROLE reachability, no privileged session_user, and only audited schema/table/sequence/function privileges. Prefer an independent account rather than granting LOGIN to an inherited staging audit role without reviewing all grants.
- Confirm both current_user and session_user of the application's **actual authenticated connection**, not an impersonated transaction, and execute both production RLS readiness and observability PostgreSQL authority checks.
- Verify default deny without tenant context, own-tenant SELECT/INSERT/UPDATE/DELETE where required, and cross-tenant denial using two synthetic merchants in an isolated environment. Record SQLSTATE and effective rows. Ensure the app's background workers and cashier/AI inventory paths remain separately scoped.
- Rollout needs an explicit reversible migration plan and credential rotation; do not make privilege changes in production or staging during this audit.

## Direct-login Neon provisioning experiment — 2026-10-19
- CI for e50f38be96a497cbb120942bada6ae92ee0b3f19: 41/41 completed successfully.
- On disposable Neon branch br-billowing-leaf-b14yamgu only, created LOGIN fawri_p0_direct_login_audit_20261019 using Neon role creation. Direct current_user and session_user both matched the new login.
- **FAIL:** New login has BYPASSRLS=true and CREATEROLE=true, and inherited SET-enabled membership in neon_superuser. It is unsafe for application traffic; do not use its credentials in staging/production.
- Attempts to ALTER ROLE ... NOBYPASSRLS and REVOKE neon_superuser from this test login using fawri_staging_runtime failed with permission denied. No privilege reduction was applied.
- Existing fawri_staging_rls_runtime remains NOLOGIN, NOBYPASSRLS, NOCREATEROLE. SET ROLE from a privileged session does not establish a safe direct login.
- **Remaining P0 blocker:** provision a direct LOGIN without privileged memberships and verify effective privileges using its own authenticated session. Escalate to a supported Neon administrative provisioning path rather than weaken the runtime safety gate. Test-only account should be retired in a reviewed cleanup.

## CI closure and disposable role cleanup — 2026-10-19
- Commit b0681e247b6fe12fd88e44d15622e8a6cdbc6f43: all 41/41 GitHub Actions workflow runs completed successfully, no failures.
- Deleted unsafe experimental LOGIN fawri_p0_direct_login_audit_20261019 from disposable Neon branch br-billowing-leaf-b14yamgu via Neon role deletion. A subsequent role listing confirmed it is absent. Prior check showed zero owned pg_class objects.
- No changes to production or staging credentials/roles; existing restricted NOLOGIN role retained.
- Release blocker remains: establish and prove a direct-authenticated least-privilege LOGIN with NOBYPASSRLS, NOCREATEROLE, no privileged role membership, and cross-tenant deny proofs. CI success alone is not production approval.

## Final CI completion for cleanup commit — 2026-10-19
- Commit 3d91b943ede629bf54c81dd403f772015e8b676d: 41/41 GitHub Actions workflow runs completed with success; zero failures, including PostgreSQL schema validation and isolated PostgreSQL engineering audit.
- This closes the CI cycle for that commit, **not** the P0 release gate. Safe directly authenticated LOGIN provisioning and least-privilege tenant-isolation acceptance proofs remain outstanding. P0 NO-GO; no production or staging role changes authorized.

## PostgreSQL 16 restore drill recovery — 2026-10-19
- Commit `d7503515c4f8cc3d76c2f48a9e89d5effb858771`: **41/41 GitHub Actions workflows successful**, zero failures, including both jobs in Backup and restore drill and the isolated PostgreSQL engineering audit.
- Root cause of earlier restore-drill failure: runner PostgreSQL 18 `pg_dump` emitted `SET transaction_timeout = 0`, unsupported by disposable PostgreSQL 16 server. Runner lacked PostgreSQL 16 client binaries and its default apt sources lacked `postgresql-client-16`; workflow now configures the PostgreSQL apt repository and installs the matching client.
- CI proof is complete for the cited commit; **P0 remains NO-GO** pending a genuinely directly authenticated nonprivileged LOGIN role (no BYPASSRLS, no CREATEROLE, no reachable privileged SET ROLE), audited tenant isolation and required access grants. No production/staging DB changes performed.

## Runtime role hardening and complete CI — 2026-10-19
- Commit `77dd99232188efbd393ba908de2b8f5eac49621f` introduced fail-closed runtime rejection for authenticated session `CREATEROLE` and inherited SUPERUSER/BYPASSRLS membership. Its CI exposed two regression failures caused by previous test expectations.
- Commit `f7cdf4b744afeb6ce5c0d429c3c649189b29c5ef` added disposable PostgreSQL regression tests for both hazards; commit `3cf5a584e7b9b35488df95de2a67224de8629e00` preserves rejection precedence for SET-reachable privileged roles.
- Verified via GitHub Actions on commit `3cf5a584e7b9b35488df95de2a67224de8629e00`: **41/41 workflows completed successfully**, including Foundation integration final gate, isolated PostgreSQL engineering audit, Final security and supply chain, and Merchant account security UI (the latter passed after rerunning a cancelled job). No failed, cancelled, pending, or running workflows remained at the final check.
- This is **CI PASS, release NO-GO**: no verified direct-authenticated least-privilege LOGIN exists for the intended runtime; the disposable role `fawri_staging_rls_runtime` is NOLOGIN, while the known staging LOGIN has privileged authority. Do not approve merge or production rollout on CI alone. No production/staging role or credential changes were performed.
