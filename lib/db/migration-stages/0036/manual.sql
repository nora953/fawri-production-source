-- P0 defense-in-depth: revoke audited cross-tenant access when an
-- administrator is suspended or their admin profile becomes unavailable.
-- Audit minting and bearer replay still require separate remediation.
CREATE OR REPLACE FUNCTION public.fawri_tenant_or_audited_admin(p_merchant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    p_merchant_id = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
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
         AND admin_audit.started_at <= clock_timestamp()
         AND admin_audit.expires_at > clock_timestamp()
         AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = p_merchant_id)
    )
$$;
REVOKE ALL ON FUNCTION public.fawri_tenant_or_audited_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fawri_tenant_or_audited_admin(text) TO PUBLIC;
