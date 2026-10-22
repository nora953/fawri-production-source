-- Approval issuance/immutable evidence belongs to trusted authentication only.
-- Commerce uses fixed scope-checked capabilities on its OWN transaction/locks.
-- Owners must remain unreachable to application LOGINs; no role grants here.
CREATE FUNCTION public.fawri_lock_cashier_discount_approval(p_merchant text,p_id text,p_operation text)
RETURNS TABLE(id text,merchant_id text,station_id text,operator_staff_id text,approver_staff_id text,operation_id text,manual_discount_minor bigint,manual_discount_reason text,expires_at timestamptz,consumed_at timestamptz,created_at timestamptz)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
BEGIN
  IF NOT fawri_security.allows_merchant(p_merchant) THEN
    RAISE EXCEPTION 'cashier approval scope is unavailable' USING ERRCODE='42501';
  END IF;
  -- Same order as consumption: settings -> approval -> manager staff.
  PERFORM 1 FROM public.merchant_cashier_discount_settings s WHERE s.merchant_id=p_merchant FOR UPDATE;
  RETURN QUERY SELECT a.id,a.merchant_id,a.station_id,a.operator_staff_id,a.approver_staff_id,a.operation_id,a.manual_discount_minor,a.manual_discount_reason,a.expires_at,a.consumed_at,a.created_at
    FROM public.merchant_cashier_discount_override_approvals a
    WHERE a.merchant_id=p_merchant AND a.id=p_id AND a.operation_id=p_operation
    FOR UPDATE OF a;
END
$body$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_lock_cashier_discount_approval(text,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_lock_cashier_discount_approval(text,text,text) TO PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.fawri_consume_cashier_discount_approval(p_merchant text,p_id text,p_operation text,p_station text,p_operator text,p_amount bigint,p_reason text,p_sale_at timestamptz,p_base bigint,p_kind text)
RETURNS TABLE(decision_code text,manager_limit_minor bigint)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
DECLARE
  a public.merchant_cashier_discount_override_approvals%ROWTYPE;
  manager public.merchant_cashier_staff%ROWTYPE;
  policy public.merchant_cashier_staff_discount_policies%ROWTYPE;
  configured_kind text;
  max_discount bigint;
BEGIN
  IF NOT fawri_security.allows_merchant(p_merchant) THEN
    RAISE EXCEPTION 'cashier approval scope is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_amount NOT BETWEEN 1 AND 9007199254740991 OR p_base NOT BETWEEN 0 AND 9007199254740991
     OR NOT isfinite(p_sale_at) OR char_length(p_reason) NOT BETWEEN 1 AND 200
     OR p_kind NOT IN ('amount','percentage') THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_INPUT_INVALID'::text,NULL::bigint; RETURN;
  END IF;
  SELECT s.discount_kind INTO configured_kind FROM public.merchant_cashier_discount_settings s
    WHERE s.merchant_id=p_merchant FOR UPDATE;
  configured_kind:=coalesce(configured_kind,'amount');
  IF configured_kind<>p_kind THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_KIND_MISMATCH'::text,NULL::bigint; RETURN;
  END IF;
  SELECT * INTO a FROM public.merchant_cashier_discount_override_approvals x
    WHERE x.merchant_id=p_merchant AND x.id=p_id AND x.operation_id=p_operation FOR UPDATE;
  IF NOT FOUND OR a.station_id<>p_station OR a.operator_staff_id<>p_operator
     OR a.manual_discount_minor<>p_amount OR a.manual_discount_reason<>p_reason THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_INVALID'::text,NULL::bigint; RETURN;
  END IF;
  -- Match the application's millisecond Date precision and original sale window.
  IF p_sale_at<date_trunc('milliseconds',a.created_at)-interval '1 minute'
     OR p_sale_at>date_trunc('milliseconds',a.expires_at) THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_EXPIRED'::text,NULL::bigint; RETURN;
  END IF;
  -- Auth-issued immutable evidence is replayable only after exact binding/window.
  IF a.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'OK'::text,NULL::bigint; RETURN;
  END IF;
  SELECT * INTO manager FROM public.merchant_cashier_staff s
    WHERE s.merchant_id=p_merchant AND s.id=a.approver_staff_id FOR UPDATE;
  IF NOT FOUND OR manager.status<>'active' OR manager.revoked_at IS NOT NULL OR manager.role<>'manager' THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED'::text,NULL::bigint; RETURN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.merchant_cashier_staff_permissions p
      WHERE p.merchant_id=p_merchant AND p.staff_id=manager.id AND p.permission='sale.discount_override') THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_PERMISSION_REQUIRED'::text,NULL::bigint; RETURN;
  END IF;
  SELECT * INTO policy FROM public.merchant_cashier_staff_discount_policies p
    WHERE p.merchant_id=p_merchant AND p.staff_id=manager.id;
  IF NOT FOUND OR NOT policy.enabled OR NOT policy.can_approve_override THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_PERMISSION_REQUIRED'::text,NULL::bigint; RETURN;
  END IF;
  IF p_kind='amount' THEN max_discount:=least(p_base,coalesce(policy.max_amount_minor,0));
  ELSE max_discount:=least(p_base,floor(p_base::numeric*policy.max_percentage_bps/10000)::bigint);
  END IF;
  IF p_amount>max_discount THEN
    RETURN QUERY SELECT 'CASHIER_DISCOUNT_OVERRIDE_MANAGER_LIMIT_EXCEEDED'::text,max_discount; RETURN;
  END IF;
  UPDATE public.merchant_cashier_discount_override_approvals x SET consumed_at=now()
    WHERE x.merchant_id=p_merchant AND x.id=p_id AND x.operation_id=p_operation AND x.consumed_at IS NULL;
  RETURN QUERY SELECT 'OK'::text,max_discount;
END
$body$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_consume_cashier_discount_approval(text,text,text,text,text,bigint,text,timestamptz,bigint,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_consume_cashier_discount_approval(text,text,text,text,text,bigint,text,timestamptz,bigint,text) TO PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.fawri_invalidate_pending_cashier_discount_approvals(p_merchant text)
RETURNS void LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
BEGIN
  IF NOT fawri_security.allows_merchant(p_merchant) THEN
    RAISE EXCEPTION 'cashier approval scope is unavailable' USING ERRCODE='42501';
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
