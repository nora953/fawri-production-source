# P0 — Isolated Neon all 94 public tables policy and grants audit (2026-10-18)

## Source and safety
Read-only PostgreSQL catalog inspection on project `round-fire-18493605`, isolated branch `br-snowy-voice-b1bovtwi`, database `neondb`. No writes, role changes, migrations, deployments or data fixtures.

## Verified facts
- 94 ordinary/partitioned public tables total.
- 45 have RLS enabled; each has exactly one policy, `PERMISSIVE FOR ALL TO PUBLIC`, with identical USING and WITH CHECK predicate `fawri_tenant_or_audited_admin(merchant_id)`.
- All 45 RLS tables owned by `neondb_owner`; none has FORCE ROW LEVEL SECURITY enabled.
- The restricted role `fawri_staging_rls_runtime` has SELECT, INSERT, UPDATE, DELETE privileges on **all 45 RLS tables**. Thus tenant isolation depends on effective RLS identity and the shared predicate, not table-level denial.
- 49 tables have RLS disabled; the same restricted role has SELECT, INSERT, UPDATE, DELETE privileges on **all 49**.
- Net catalog-level coverage: restricted role has all four privileges on **94/94 public tables**.
- The role is NOLOGIN and NOBYPASSRLS. The separate `fawri_staging_runtime` role is LOGIN and BYPASSRLS, and has SET membership to the restricted role. The connector session as `neondb_owner` cannot SET ROLE to these staging roles.

## Interpretation
These are verified role privileges, not evidence of a tenant data leak. Some global/system tables may appropriately have no RLS but should be reviewed for least privilege. The centralized policy function is a high-impact authorization boundary, and admin audit/profile/permission DML grants require focused review. Ownership and BYPASSRLS identities are not suitable evidence for restricted tenant acceptance.

## P0 next steps
1. Audit application connection identity, transaction-scoped tenant GUC provenance, and whether SET ROLE is enforced before tenant SQL; inspect pooled connection behavior.
2. Inventory authorized application/worker/admin writes per table before proposing least-privilege GRANT/REVOKE changes.
3. Run authorized synthetic cross-tenant tests in an isolated environment with a genuine restricted role; verify both SELECT and write denials, admin audit scoping, and no GUC spoofing.
4. Keep hosted integration acceptance and six pending migrations separate from the verified applied-hash audit.

**Gate: P0 NO-GO** until verified hosted runtime authorization and integration acceptance.
