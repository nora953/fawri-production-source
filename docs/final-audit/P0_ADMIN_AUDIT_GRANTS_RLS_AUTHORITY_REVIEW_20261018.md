# P0 — admin audit authorization boundary review (2026-10-18)

## Isolated Neon evidence (read-only)
Project `round-fire-18493605`, branch `br-snowy-voice-b1bovtwi`, database `neondb`.

- `public.database_admin_access_audits`: RLS disabled; owner `neondb_owner`.
- Both `fawri_staging_runtime` (LOGIN, BYPASSRLS) and `fawri_staging_rls_runtime` (NOLOGIN, no BYPASSRLS) have direct SELECT, INSERT, UPDATE and DELETE table grants.
- `public.fawri_tenant_or_audited_admin(p_merchant_id)` is SECURITY DEFINER and allows a scoped, unexpired audit row matched against session settings `fawri.admin_audit_id` and `fawri.admin_account_id`.
- Audit row includes `admin_account_id`, nullable `merchant_id`, `reason_code`, `request_hash`, `started_at`, `expires_at`. A FK requires an existing admin profile; CHECK constrains expiration to 30 minutes after start and request hash length 32–128. These constraints do not by themselves establish that the caller is an authorized admin.
- The catalog results alone do **not** prove an exploit or application exposure. No write test was run.

## Risk hypothesis and acceptance requirement
A role with unrestricted DML on the audit authority table may be able to create or alter audit grants if it can supply a valid admin account ID and corresponding session settings. Confirm actual application access, trust boundaries for session GUCs, and privilege design before labeling exploitable. Treat this as a **P0 security gate pending validation**, not as a confirmed vulnerability.

## Proposed safe remediation (requires review and authorization)
- Separate trusted admin-audit issuance from merchant runtime connections.
- Evaluate revoking INSERT/UPDATE/DELETE on the audit authority table from merchant-facing runtime roles and granting only narrowly scoped, authenticated SECURITY DEFINER functions to a trusted administrative path, with hardened search_path and explicit identity checks.
- Validate transaction-local GUC context, privilege inheritance, connection pooling, and audit expiry/scope.
- On a disposable isolated test branch with synthetic data, verify a restricted merchant role cannot mint or alter admin audit grants; verify legitimate admin flows continue to work.
- Do not change grants, policies, roles, data or apply migrations without an approved migration and rollback plan.

## Status
**P0 NO-GO**. Static evidence gathered and documented; runtime exploitability and remediation not yet verified.
