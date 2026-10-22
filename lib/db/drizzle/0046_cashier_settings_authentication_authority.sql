-- Lock the current configuration without granting tenant configuration writes.
-- Trusted auth already owns configuration and approval mutation authority.
CREATE FUNCTION public.fawri_lock_cashier_discount_setting(p_merchant text)
RETURNS TABLE(discount_kind text,version bigint)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
BEGIN
  IF NOT (fawri_security.allows_merchant(p_merchant)
    OR (has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
      AND EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin
        AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) THEN
    RAISE EXCEPTION 'cashier configuration authority is unavailable' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT s.discount_kind,s.version FROM public.merchant_cashier_discount_settings s
    WHERE s.merchant_id=p_merchant FOR UPDATE OF s;
END
$body$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_lock_cashier_discount_setting(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_lock_cashier_discount_setting(text) TO PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fawri_invalidate_pending_cashier_discount_approvals(p_merchant text)
RETURNS void LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
BEGIN
  IF NOT (fawri_security.allows_merchant(p_merchant)
    OR (has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
      AND EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin
        AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) THEN
    RAISE EXCEPTION 'cashier configuration authority is unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cashier-discount-kind:'||p_merchant));
  PERFORM 1 FROM public.merchant_cashier_discount_settings s WHERE s.merchant_id=p_merchant FOR UPDATE;
  DELETE FROM public.merchant_cashier_discount_override_approvals a
    WHERE a.merchant_id=p_merchant AND a.consumed_at IS NULL;
END
$body$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_invalidate_pending_cashier_discount_approvals(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_invalidate_pending_cashier_discount_approvals(text) TO PUBLIC;
