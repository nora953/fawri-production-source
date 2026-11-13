-- Preserve commerce row locks without granting tenant writes to staff credentials.
-- PUBLIC can invoke only this scope-checked, fixed projection. Provision its owner
-- as unreachable to application LOGINs with SELECT/UPDATE on staff and EXECUTE on
-- the private scope predicate; this migration creates no application role grants.
CREATE FUNCTION public.fawri_lock_cashier_approver(p_merchant_id text, p_staff_id text)
RETURNS TABLE(id text, display_name text, role text, status text, revoked_at timestamptz)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
BEGIN
  IF char_length(p_merchant_id) NOT BETWEEN 1 AND 200
     OR char_length(p_staff_id) NOT BETWEEN 1 AND 200
     OR NOT fawri_security.allows_merchant(p_merchant_id) THEN
    RAISE EXCEPTION 'cashier approver scope is unavailable' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT staff.id, staff.display_name, staff.role, staff.status, staff.revoked_at
      FROM public.merchant_cashier_staff AS staff
     WHERE staff.merchant_id=p_merchant_id AND staff.id=p_staff_id
     FOR UPDATE OF staff;
END
$body$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_lock_cashier_approver(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_lock_cashier_approver(text,text) TO PUBLIC;
