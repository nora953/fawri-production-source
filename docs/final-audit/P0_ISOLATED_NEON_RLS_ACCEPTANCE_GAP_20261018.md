# P0 — isolated Neon restricted-role RLS acceptance gap (2026-10-18)

## Evidence (read-only catalog queries)
- Neon isolated branch `br-snowy-voice-b1bovtwi`, project `round-fire-18493605`, database `neondb`.
- `fawri_staging_runtime`: LOGIN=true, BYPASSRLS=true; member of `neon_superuser`, and has SET privilege for `fawri_staging_rls_runtime`.
- `fawri_staging_rls_runtime`: LOGIN=false, BYPASSRLS=false; SELECT/INSERT/UPDATE/DELETE privileges on `orders`, `products`, `merchant_locations`, `location_inventory_levels`.
- These four tables have RLS enabled, not FORCE RLS; owner is `neondb_owner`.
- Each table has `*_tenant_boundary` policy for ALL with USING and WITH CHECK calling `fawri_tenant_or_audited_admin(merchant_id)`.
- That function is STABLE STRICT SECURITY DEFINER, sets search_path to pg_catalog, and compares `fawri.tenant_id` or validates an active, scoped admin audit.
- The connector session runs as `neondb_owner` and `pg_has_role(...,'SET')` is false for both staging roles. Consequently the current connector session cannot demonstrate restricted-role behavior with SET ROLE.
- `merchants` currently has RLS disabled on this isolated branch; review its intended access model separately.
- `preflight-isolated-neon-migrations.mjs` checks role metadata but does not perform SET ROLE or cross-tenant authorization tests.

## Required hosted acceptance (not yet executed)
1. In a disposable, explicitly authorized isolated branch with non-production test data, establish an authenticated connection as `fawri_staging_runtime` and run `SET ROLE fawri_staging_rls_runtime` within a controlled session/transaction.
2. Verify `current_user=fawri_staging_rls_runtime`, `rolbypassrls=false`, and transaction-scoped, trusted tenant context.
3. Seed two synthetic tenants via an authorized fixture setup. For tenant A, verify own rows visible, tenant B rows not visible; verify cross-tenant INSERT/UPDATE/DELETE rejected or scoped. Repeat inversely for tenant B and verify missing/invalid tenant context denies access.
4. Test audited-admin access: valid audit scope/time and expired/mismatched audit denied; ensure callers cannot forge privileged GUC context.
5. Verify application connection paths never execute tenant SQL with BYPASSRLS identity and that pooled connections cannot leak tenant context.
6. Record exact test commands, role identities, redacted evidence, and rollback/cleanup.

## Gate
**NO-GO.** This is a documented gap, not evidence of an exploit. No role, schema, policy, data, or migration modifications were performed. Do not treat owner-connection SELECTs or static CI tests as hosted RLS acceptance.
