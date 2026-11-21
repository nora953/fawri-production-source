-- This EXECUTE ACL is the operator trust boundary. Never grant it to the
-- tenant runtime, PUBLIC, or any role the tenant login can inherit/activate.
-- The authenticated session_user, not a caller-controlled GUC/current_user,
-- must carry this capability. No roles or hosted grants are provisioned here.
CREATE FUNCTION public.fawri_issue_admin_directory_audit(
  p_actor_id text, p_audit_id text, p_request_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE actor_role text;
BEGIN
  IF NOT has_function_privilege(session_user,
    'public.fawri_issue_admin_directory_audit(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'directory operator connection required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR char_length(p_actor_id) NOT BETWEEN 1 AND 180
     OR p_audit_id IS NULL OR char_length(p_audit_id) NOT BETWEEN 1 AND 180
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid bounded directory audit' USING ERRCODE = '22023';
  END IF;
  SELECT profile.role::text INTO actor_role
    FROM public.accounts AS account
    JOIN public.admin_profiles AS profile ON profile.account_id = account.id
   WHERE account.id = p_actor_id AND account.kind = 'admin' AND account.state = 'active'
     AND profile.enabled AND NOT profile.must_change_password
   FOR SHARE OF account, profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'directory administrator not authorized' USING ERRCODE = '42501';
  END IF;
  IF actor_role <> 'owner_admin' THEN
    PERFORM 1 FROM public.admin_permissions AS permission
      WHERE permission.admin_id = p_actor_id
        AND permission.permission IN ('view_merchants', 'manage_merchant_status',
          'manage_subscriptions', 'manage_channels', 'inspect_merchant_sessions')
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'directory administrator not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.database_admin_access_audits
    (id, admin_account_id, reason_code, request_hash, expires_at)
  VALUES (p_audit_id, p_actor_id, 'MERCHANT_DIRECTORY_READ', p_request_hash,
    now() + interval '1 minute');
  PERFORM set_config('fawri.admin_account_id', p_actor_id, true),
          set_config('fawri.admin_audit_id', p_audit_id, true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) FROM PUBLIC;
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
