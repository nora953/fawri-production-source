# FAWRI P0 / FIELD002 — tenant runtime can reach trusted auth marker on migrated Neon clone

**Date:** 2026-11-04 · **Source:** draft PR #550, branch `fix/p0-provider-receipt-order-discovery-20261015`. This evidence is **read-only hosted catalog verification plus real disposable CI proof**. It is **not proof of an actual customer disclosure** and does not close FIELD002.

## New material finding: 8/8 RLS is necessary but not sufficient

- Source migration `0039_role_bound_authentication_runtime.sql` creates `public.fawri_authentication_runtime()` as a trusted authorization **marker function**, with EXECUTE revoked from PUBLIC. This privilege is meant for a **separate authentication database LOGIN**, not the tenant runtime. Migration `0038_role_bound_admin_directory_issuer.sql` similarly reserves `public.fawri_issue_admin_directory_audit(text,text,text)` for operator authority.
- Source migration `0040_transaction_scoped_tenant_authority.sql` **explicitly rejects** a tenant scope target for which `has_function_privilege(p_runtime_login,'public.fawri_authentication_runtime()','EXECUTE')` is true (lines 39–45), and requires scope issuance by an independent trusted auth login.
- Several actual RLS policies in `0050_merchant_management_privacy_authentication_authority.sql` and `0051_residual_merchant_privacy_scoped_authority.sql` allow the authenticated **LOGIN** to read/write across a merchant boundary when `has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')` is true. This is intentional for the trusted authentication role **only**. It becomes an unsafe bypass if the ordinary tenant runtime also has marker EXECUTE.
- Independently queried `pg_roles`, `pg_proc`, function ACLs and `pg_policies` with **SELECT only** on both Neon branches. **Original `staging-runtime`** (branch `br-falling-dust-b1km4gix`) has **28 migrations, 28 historical notifications, 283 audit records**, **0/8** residual privacy tables with RLS/policy, and `fawri_staging_rls_runtime` is **NOLOGIN**. The auth marker/issuer functions are not present at that old migration stage; current effective EXECUTE checks return false.
- **Authorized isolated clone** `br-young-hill-b1x9vhlz`: **52 migrations, 28 notifications, 283 audit records**, **8/8** privacy tables with RLS/policy. But the **same** `fawri_staging_rls_runtime` principal remains **NOLOGIN** and has **direct non-PUBLIC EXECUTE grants for both** `fawri_authentication_runtime()` **and** `fawri_issue_admin_directory_audit(text,text,text)`. In particular, the first grant **contradicts the `0040` tenant-scope precondition** and would make its 8/8 RLS checklist **insufficient** if this principal were enabled as a LOGIN. The old `fawri_staging_runtime` remains `BYPASSRLS/CREATEROLE`; it is also not a safe tenant login.
- **Do not** merely `ALTER ROLE fawri_staging_rls_runtime LOGIN`, switch the application URL to the old high-privilege role, grant auth/operator EXECUTE to the tenant role, or deploy migrations to original `staging-runtime` without a separately approved and tested role/tenant-scope cutover.

## Executable code defenses added to PR #550

1. `artifacts/api-server/src/observability/runtime.ts` (source `6c831d63`): the `postgresql_authority` query checks **effective role**, authenticated `SESSION_USER`, and **SET-activatable role** access to *both* sensitive function signatures, in addition to previous BYPASSRLS, CREATEROLE, ownership, and eight-table RLS/policy checks. It fails closed on any missing or unsafe boolean. `to_regprocedure` handles functions absent on lightweight CI. This is unconditional for these dangerous capabilities, including when the expected role variable is not configured.
2. `artifacts/api-server/tests/postgres-runtime-role-readiness.test.ts` (`92d1d4ed`): rejects any direct/auth-admin/reachable marker and absent evidence even when **8/8** RLS/policy pairs pass.
3. `artifacts/api-server/tests/observability-mounted.integration.test.mjs` (`a989e5db`, test fixture path guard correction `8edd889a`): **real mounted API + disposable localhost PostgreSQL**. Creates eight mock RLS-protected tables and deny-all policies; matching restricted user initially returns **200/ready**. After adding **only** EXECUTE on the synthetic auth marker to that user, readiness must return **503/not_ready**. Guards restrict these CREATE/GRANT/DROP fixtures to disposable `fawri_observability_test` and clean all fixture objects. There is **no external Neon or Railway write**. The corrected [Observability mounted routes CI run](https://github.com/nora953/fawri-production-source/actions/runs/41827195823) **SUCCESS**.
4. `artifacts/api-server/src/services/postgresRuntimeRlsSecurity.ts` (`3f0c04ec`): separate **production startup gate** now inventories the trusted auth marker accessible through current/session/inherited/SET-reachable roles. It refuses any such role with `PRODUCTION_AUTHENTICATION_MARKER_REACHABLE`, rather than relying only on an HTTP readiness response. `artifacts/api-server/tests/production-postgres-rls-security.test.ts` (`16cd89b8`) checks reachable and malformed inventories fail closed.
5. **Full 59-workflow GitHub CI for the *latest code* `16cd89b8d8c9b0f6252d237fc7b56e5559741080` was still in progress at this evidence checkpoint**. Do not quote the previous 59/59 green `0f3dda4` as final acceptance for the newer security guard. Re-query exact commit SHA and inspect failures.

## Reproducible hosted read-only source/role comparison

```sql
SELECT r.rolname,r.rolcanlogin,r.rolbypassrls,r.rolcreaterole,
  COALESCE(has_function_privilege(r.oid,
    to_regprocedure('public.fawri_authentication_runtime()'),'EXECUTE'),false)
      AS can_invoke_trusted_auth_marker,
  COALESCE(has_function_privilege(r.oid,
    to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)'),'EXECUTE'),false)
      AS can_invoke_operator_issuer
FROM pg_roles r
WHERE r.rolname='fawri_staging_rls_runtime';
```

No customer data fields, credentials, role passwords, connection strings or merchant IDs were queried or copied. This does **not** exercise same-/foreign-merchant/revoked on a verified non-bypass app LOGIN.

## Remaining release gate

The clone is **not** safe for commercial admission as presently configured: permission separation must be designed, owner-approved, tested and installed through controlled authority provisioning on an isolated branch; `0052` still cannot be applied through current non-superuser owner handoff, and original Neon remains at migration 28. Verify a truly restricted tenant LOGIN with **no auth marker/issuer grants**, trusted separate authentication connection issuing transaction-scoped merchant proof, authenticated same-merchant positive / foreign denial / revoked-session denial, all eight privacy tables and alternative HTTP paths, then backup/rollback and application deployment plan. **FIELD002 OPEN, parent privacy gate OPEN, known P0 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, NO-GO**.
