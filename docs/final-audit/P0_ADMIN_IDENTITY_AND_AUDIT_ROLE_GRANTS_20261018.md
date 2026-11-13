# P0 — Admin identity and audit authority grants, isolated Neon (2026-10-18)

## Read-only findings
On isolated Neon branch `br-snowy-voice-b1bovtwi` (project `round-fire-18493605`):
- `public.admin_profiles` is owned by `neondb_owner` and has RLS disabled.
- `fawri_staging_rls_runtime` has INSERT/UPDATE/DELETE privileges on `public.admin_profiles`.
- The same restricted role has INSERT/UPDATE/DELETE privileges on `public.database_admin_access_audits`, which also has RLS disabled.
- `fawri_tenant_or_audited_admin` is owned by `neondb_owner`, executes SECURITY DEFINER, and grants EXECUTE to the restricted runtime; function ACL includes PUBLIC EXECUTE.
- Its authorization predicate uses a valid admin-audit record matched to session settings, making the integrity of both tables and trusted GUCs security-critical.
- These are catalog facts, **not** a demonstrated exploit. No data was inserted, updated or deleted.

## Security gate
**P0 NO-GO pending investigation.** Verify whether application-facing connections can exercise these DML grants. If so, evaluate least-privilege revocation on both admin identity and audit authority tables, and isolate issuance behind a trusted, authenticated admin pathway. Review migration compatibility, bootstrap operations, administrative flows, rollback and synthetic tenant acceptance tests before modifying grants. Do not change production or isolated database permissions without explicit approval.

## CI
Latest commit CI was still running when checked; do not claim green until all checks complete.
