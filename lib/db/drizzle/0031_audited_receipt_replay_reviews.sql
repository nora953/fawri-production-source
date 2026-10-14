-- Trusted authenticated-operator backend only. Review does not apply payment,
-- repair ownership or create orders. Never grant this raw capability to merchants.
CREATE FUNCTION public.fawri_review_verified_payment_receipt(
  p_actor_id text,p_event_id text,p_authority text,p_order_id text,p_audit_id text,p_request_hash text
)
RETURNS TABLE(provider text,provider_event_id text,payment_ref text,request_ref text,event_type text,
  amount_iqd integer,payload_hash text,first_received_at text,order_id text,authority text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off
AS $$
DECLARE actor_role text; receipt public.verified_provider_payment_receipts%ROWTYPE;
  matches integer; candidate record;
BEGIN
  IF p_actor_id IS NULL OR char_length(p_actor_id) NOT BETWEEN 1 AND 180
    OR p_event_id IS NULL OR char_length(p_event_id) NOT BETWEEN 1 AND 300
    OR p_authority IS NULL OR p_authority NOT IN ('bot_subscription','cashier_subscription')
    OR p_order_id IS NULL OR char_length(p_order_id) NOT BETWEEN 1 AND 180
    OR p_audit_id IS NULL OR char_length(p_audit_id) NOT BETWEEN 1 AND 180
    OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid bounded receipt replay review' USING ERRCODE='22023';
  END IF;
  SELECT profile.role::text INTO actor_role FROM public.accounts account
    JOIN public.admin_profiles profile ON profile.account_id=account.id
    WHERE account.id=p_actor_id AND account.kind='admin' AND account.state='active'
      AND profile.enabled AND NOT profile.must_change_password FOR SHARE OF account,profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt operator not authorized' USING ERRCODE='42501'; END IF;
  IF actor_role <> 'owner_admin' THEN
    PERFORM 1 FROM public.admin_permissions permission WHERE permission.admin_id=p_actor_id
      AND permission.permission='manage_subscriptions' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt operator not authorized' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.database_admin_access_audits(id,admin_account_id,reason_code,request_hash,expires_at)
    VALUES(p_audit_id,p_actor_id,'BILLING_RECEIPT_REPLAY_REVIEW',p_request_hash,now()+interval '1 minute');
  SELECT * INTO receipt FROM public.verified_provider_payment_receipts r
    WHERE r.provider='superqi_sandbox' AND r.provider_event_id=p_event_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO matches FROM (
    SELECT o.id FROM public.saas_billing_orders o WHERE o.provider=receipt.provider
      AND (o.provider_checkout_ref=receipt.payment_ref OR o.metadata->>'provider_request_id'=receipt.request_ref)
    UNION ALL
    SELECT o.id FROM public.cashier_billing_orders o WHERE o.provider=receipt.provider
      AND (o.provider_checkout_ref=receipt.payment_ref OR o.metadata->>'provider_request_id'=receipt.request_ref)
    LIMIT 3
  ) bounded;
  IF matches <> 1 THEN RETURN; END IF;
  SELECT candidates.*,count(*) OVER () AS candidate_count INTO candidate FROM (
    SELECT o.id,o.amount_iqd,o.provider_checkout_ref,o.metadata->>'provider_request_id' AS request_id,
      'bot_subscription'::text AS order_authority FROM public.saas_billing_orders o WHERE o.provider=receipt.provider
      AND (o.provider_checkout_ref=receipt.payment_ref OR o.metadata->>'provider_request_id'=receipt.request_ref)
    UNION ALL
    SELECT o.id,o.amount_iqd,o.provider_checkout_ref,o.metadata->>'provider_request_id',
      'cashier_subscription'::text FROM public.cashier_billing_orders o WHERE o.provider=receipt.provider
      AND (o.provider_checkout_ref=receipt.payment_ref OR o.metadata->>'provider_request_id'=receipt.request_ref)
    LIMIT 2
  ) candidates;
  IF NOT FOUND OR candidate.candidate_count <> 1 THEN RETURN; END IF;
  IF candidate.id <> p_order_id OR candidate.order_authority <> p_authority
    OR candidate.request_id IS DISTINCT FROM receipt.request_ref
    OR (candidate.provider_checkout_ref IS NOT NULL AND candidate.provider_checkout_ref <> receipt.payment_ref)
    OR candidate.amount_iqd <> receipt.amount_iqd THEN RETURN; END IF;
  RETURN QUERY SELECT receipt.provider,receipt.provider_event_id,receipt.payment_ref,receipt.request_ref,
    receipt.event_type,receipt.amount_iqd,receipt.payload_hash,
    to_char(receipt.first_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),candidate.id::text,candidate.order_authority;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_review_verified_payment_receipt(text,text,text,text,text,text) FROM PUBLIC;
