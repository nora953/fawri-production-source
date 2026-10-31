-- Trusted verified-provider backend capability, never a merchant/admin lookup API.
CREATE FUNCTION public.fawri_resolve_confirmed_payment_order(
 p_event_id text,p_payment_ref text,p_request_ref text,p_event_type text,p_amount integer,p_payload_hash text
) RETURNS TABLE(order_id text,authority text,merchant_id text,first_received_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off
AS $$
DECLARE receipt record; candidate record; candidate_id text; candidate_authority text; matches integer:=0; saas_matches integer:=0; cashier_matches integer:=0; assigned record;
BEGIN
 IF p_event_id IS NULL OR char_length(p_event_id) NOT BETWEEN 1 AND 300
 OR p_payment_ref IS NULL OR char_length(p_payment_ref) NOT BETWEEN 1 AND 300
 OR p_request_ref IS NULL OR char_length(p_request_ref) NOT BETWEEN 1 AND 300
 OR p_event_type IS NULL OR p_event_type NOT IN ('payment_succeeded','payment_failed','payment_cancelled')
 OR p_amount IS NULL OR p_amount<=0 OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'invalid confirmed payment identity' USING ERRCODE='22023';
 END IF;
 SELECT r.* INTO receipt FROM public.verified_provider_payment_receipts r
 WHERE r.provider='superqi_sandbox' AND r.provider_event_id=p_event_id FOR SHARE;
 IF NOT FOUND OR receipt.payment_ref IS DISTINCT FROM p_payment_ref OR receipt.request_ref IS DISTINCT FROM p_request_ref
 OR receipt.event_type IS DISTINCT FROM p_event_type OR receipt.amount_iqd IS DISTINCT FROM p_amount OR receipt.payload_hash IS DISTINCT FROM p_payload_hash THEN
  RAISE EXCEPTION 'SUPERQI_SANDBOX_RECEIPT_IDENTITY_COLLISION' USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('confirmed-payment:'||p_payment_ref));
 FOR candidate IN
  SELECT c.* FROM (
   (SELECT o.id,'bot_subscription'::text AS authority FROM public.saas_billing_orders o WHERE o.provider='superqi_sandbox' AND (o.provider_checkout_ref=p_payment_ref OR o.metadata->>'provider_request_id'=p_request_ref) LIMIT 2)
   UNION ALL
   (SELECT o.id,'cashier_subscription'::text AS authority FROM public.cashier_billing_orders o WHERE o.provider='superqi_sandbox' AND (o.provider_checkout_ref=p_payment_ref OR o.metadata->>'provider_request_id'=p_request_ref) LIMIT 2)
  ) c ORDER BY c.authority LIMIT 3
 LOOP
  matches:=matches+1;candidate_id:=candidate.id;candidate_authority:=candidate.authority;
  IF candidate.authority='bot_subscription' THEN saas_matches:=saas_matches+1;ELSE cashier_matches:=cashier_matches+1;END IF;
 END LOOP;
 IF matches=0 THEN RETURN; END IF;
 IF saas_matches>1 THEN RAISE EXCEPTION 'SUPERQI_SANDBOX_ORDER_AMBIGUOUS' USING ERRCODE='23514'; END IF;
 IF cashier_matches>1 THEN RAISE EXCEPTION 'CASHIER_BILLING_ORDER_AMBIGUOUS' USING ERRCODE='23514'; END IF;
 IF matches>1 THEN RAISE EXCEPTION 'SUPERQI_SANDBOX_ORDER_AUTHORITY_COLLISION' USING ERRCODE='23514'; END IF;
 IF candidate_authority='bot_subscription' THEN
  SELECT o.* INTO assigned FROM public.saas_billing_orders o WHERE o.id=candidate_id FOR UPDATE;
 ELSE
  SELECT o.* INTO assigned FROM public.cashier_billing_orders o WHERE o.id=candidate_id FOR UPDATE;
 END IF;
 IF assigned.provider IS DISTINCT FROM 'superqi_sandbox' OR assigned.metadata->>'provider_request_id' IS DISTINCT FROM p_request_ref
 OR (assigned.provider_checkout_ref IS NOT NULL AND assigned.provider_checkout_ref IS DISTINCT FROM p_payment_ref) THEN
  IF candidate_authority='cashier_subscription' THEN RAISE EXCEPTION 'CASHIER_BILLING_ORDER_IDENTITY_MISMATCH' USING ERRCODE='23514'; END IF;
  RAISE EXCEPTION 'SUPERQI_SANDBOX_ORDER_IDENTITY_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF assigned.amount_iqd IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'SUPERQI_SANDBOX_ORDER_AMOUNT_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN QUERY SELECT assigned.id::text,candidate_authority,assigned.merchant_id::text,receipt.first_received_at;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_resolve_confirmed_payment_order(text,text,text,text,integer,text) FROM PUBLIC;
