-- Retained audit records are history, not transferable bearer capabilities.
-- Existing records are deliberately invalidated (0); only new INSERTs receive
-- the issuing full transaction ID. Direct audit writers remain a separate P0
-- boundary: this change does not authenticate an actor or replace role isolation.
ALTER TABLE public.database_admin_access_audits
  ADD COLUMN authority_transaction_id bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.database_admin_access_audits
  ALTER COLUMN authority_transaction_id SET DEFAULT txid_current();
--> statement-breakpoint
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
         AND admin_audit.authority_transaction_id = txid_current()
         AND admin_audit.started_at <= clock_timestamp()
         AND admin_audit.expires_at > clock_timestamp()
         AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = p_merchant_id)
    )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_tenant_or_audited_admin(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_tenant_or_audited_admin(text) TO PUBLIC;
