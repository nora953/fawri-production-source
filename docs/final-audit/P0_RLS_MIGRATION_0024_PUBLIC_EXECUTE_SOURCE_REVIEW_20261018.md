# P0 — Source review: migration 0024 explicitly grants PUBLIC EXECUTE (2026-10-18)

## Direct repository evidence
Inspected `lib/db/drizzle/0024_tenant_rls_security_definer_predicate.sql` on `fix/p0-provider-receipt-order-discovery-20261015`:
- Defines `public.fawri_tenant_or_audited_admin(text)` as `SECURITY DEFINER`, `STABLE`, `STRICT`, `search_path=pg_catalog`.
- Predicate allows matching `fawri.tenant_id` or an unexpired, matching `database_admin_access_audits` record keyed by `fawri.admin_audit_id` and `fawri.admin_account_id`.
- The migration explicitly executes `REVOKE ALL ... FROM PUBLIC` followed by `GRANT EXECUTE ... TO PUBLIC`. The observed PUBLIC EXECUTE function ACL in isolated Neon is consistent with source, not an unexplained drift.
- `0025_tenant_rls_policy_predicate_cutover.sql` explicitly attaches this predicate to tenant RLS policies.

## Assessment
PUBLIC EXECUTE alone does not establish an exploitable bypass. More important trust boundaries are tenant/admin GUC provenance, privileged admin-audit record issuance, and runtime role identity. Review whether PUBLIC EXECUTE is intended and whether a narrower EXECUTE grant is compatible with all policy callers. Avoid a blind REVOKE that would break policy evaluation.

## Required next verification
Trace application DB client and transaction setup; check GUC input provenance, app role transitions, admin audit issuance, pool reuse, and authenticated cross-tenant acceptance. No database changes made.

**Gate: P0 NO-GO.**
