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
       WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
         AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
         AND admin_audit.started_at <= clock_timestamp()
         AND admin_audit.expires_at > clock_timestamp()
         AND (
           admin_audit.merchant_id IS NULL
           OR admin_audit.merchant_id = p_merchant_id
         )
    )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_tenant_or_audited_admin(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_tenant_or_audited_admin(text) TO PUBLIC;
