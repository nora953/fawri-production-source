-- Capability belongs only to a trusted authenticated-operator backend. Actor
-- identity must come from validated session context, never request input.
-- No entitlement, receipt mutation, raw identifiers or general table access.
CREATE FUNCTION public.fawri_read_verified_payment_receipts(
  p_actor_id text, p_limit integer, p_before timestamptz, p_before_event_id text,
  p_audit_id text, p_request_hash text
)
RETURNS TABLE(provider text, provider_event_id text, event_type text, amount_iqd integer,
  first_received_at text, payment_ref_suffix text, request_ref_suffix text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
DECLARE actor_role text;
BEGIN
  IF p_actor_id IS NULL OR char_length(p_actor_id) NOT BETWEEN 1 AND 180
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51
     OR p_audit_id IS NULL OR char_length(p_audit_id) NOT BETWEEN 1 AND 180
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
     OR ((p_before IS NULL) <> (p_before_event_id IS NULL))
     OR (p_before IS NOT NULL AND NOT isfinite(p_before))
     OR (p_before_event_id IS NOT NULL AND char_length(p_before_event_id) NOT BETWEEN 1 AND 300) THEN
    RAISE EXCEPTION 'invalid bounded receipt operator read' USING ERRCODE = '22023';
  END IF;
  SELECT profile.role::text INTO actor_role
    FROM public.accounts AS account JOIN public.admin_profiles AS profile ON profile.account_id = account.id
   WHERE account.id = p_actor_id AND account.kind = 'admin' AND account.state = 'active'
     AND profile.enabled AND NOT profile.must_change_password
   FOR SHARE OF account, profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified receipt operator not authorized' USING ERRCODE = '42501';
  END IF;
  IF actor_role <> 'owner_admin' THEN
    PERFORM 1 FROM public.admin_permissions AS permission
      WHERE permission.admin_id = p_actor_id AND permission.permission = 'manage_subscriptions'
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'verified receipt operator not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- A failed audit INSERT aborts the same transaction and exposes no receipt.
  INSERT INTO public.database_admin_access_audits
    (id,admin_account_id,reason_code,request_hash,expires_at)
  VALUES (p_audit_id,p_actor_id,'BILLING_VERIFIED_RECEIPTS_READ',p_request_hash,now() + interval '1 minute');
  RETURN QUERY SELECT receipt.provider, receipt.provider_event_id, receipt.event_type, receipt.amount_iqd,
    to_char(receipt.first_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    CASE WHEN char_length(receipt.payment_ref) > 8 THEN right(receipt.payment_ref,8) ELSE NULL END,
    CASE WHEN char_length(receipt.request_ref) > 8 THEN right(receipt.request_ref,8) ELSE NULL END
    FROM public.verified_provider_payment_receipts AS receipt
   WHERE p_before IS NULL OR (receipt.first_received_at,receipt.provider_event_id) < (p_before,p_before_event_id)
   ORDER BY receipt.first_received_at DESC,receipt.provider_event_id DESC LIMIT p_limit;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text) FROM PUBLIC;
