-- Tenant authority comes only from a committed LOGIN/backend/full-XID scope.
-- Preserve the separate authentication and audited operator branches.
-- This migration provisions no roles or new caller privileges. The existing
-- predicate owner must retain USAGE/EXECUTE on the private scope predicate.
CREATE OR REPLACE FUNCTION public.fawri_tenant_or_audited_admin(p_merchant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    fawri_security.allows_merchant(p_merchant_id)
    OR (has_function_privilege(session_user,
      'public.fawri_authentication_runtime()', 'EXECUTE')
      AND EXISTS (SELECT 1 FROM pg_roles authenticated
        WHERE authenticated.rolname=session_user AND authenticated.rolcanlogin
          AND NOT (authenticated.rolsuper OR authenticated.rolbypassrls OR authenticated.rolcreaterole)))
    OR (has_function_privilege(session_user,
      'public.fawri_issue_admin_directory_audit(text,text,text)', 'EXECUTE')
      AND EXISTS (
      SELECT 1
        FROM public.database_admin_access_audits AS admin_audit
        JOIN public.accounts AS actor
          ON actor.id = admin_audit.admin_account_id
         AND actor.kind = 'admin'
         AND actor.state = 'active'
        JOIN public.admin_profiles AS profile
          ON profile.account_id = actor.id
         AND profile.enabled = true
         AND profile.must_change_password = false
       WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
         AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
         AND admin_audit.authority_transaction_id = txid_current()
         AND admin_audit.started_at <= clock_timestamp()
         AND admin_audit.expires_at > clock_timestamp()
         AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = p_merchant_id)
    ))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_tenant_or_audited_admin(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_tenant_or_audited_admin(text) TO PUBLIC;
