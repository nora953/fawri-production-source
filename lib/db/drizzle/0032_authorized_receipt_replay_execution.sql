-- Execution capability for trusted authenticated operator backend only.
-- It resolves one tenant and holds current permission/session/device rows through
-- the caller transaction. It never grants payment or repairs an order itself.
CREATE FUNCTION public.fawri_authorize_verified_receipt_replay(
  p_actor_id text,p_session_id text,p_device_hash text,p_event_id text,p_authority text,p_order_id text,p_audit_id text,p_request_hash text
)
RETURNS TABLE(provider text,provider_event_id text,payment_ref text,request_ref text,event_type text,amount_iqd integer,
  payload_hash text,first_received_at text,order_id text,authority text,merchant_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off
AS $$
DECLARE reviewed record; tenant text; assigned_payment text; assigned_request text; assigned_amount integer; assigned_provider text;
BEGIN
  IF p_session_id IS NULL OR char_length(p_session_id) NOT BETWEEN 1 AND 180
    OR p_device_hash IS NULL OR char_length(p_device_hash) NOT BETWEEN 32 AND 128 THEN
    RAISE EXCEPTION 'invalid receipt replay session' USING ERRCODE='22023';
  END IF;
  -- The nested bounded review takes account/profile/permission SHARE locks and
  -- creates an audit. Exception rolls this transaction back if session is invalid.
  SELECT * INTO reviewed FROM public.fawri_review_verified_payment_receipt(p_actor_id,p_event_id,p_authority,p_order_id,p_audit_id,p_request_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt replay conflict' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.account_sessions s JOIN public.accounts a ON a.id=s.account_id
    WHERE s.id=p_session_id AND s.account_id=p_actor_id AND s.kind='admin' AND s.status='active'
      AND s.device_fingerprint_hash=p_device_hash AND s.session_version=a.session_version AND s.security_version=a.security_version
      AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp() FOR SHARE OF s, a;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt operator not authorized' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.trusted_devices d WHERE d.account_id=p_actor_id AND d.kind='admin'
    AND d.device_fingerprint_hash=p_device_hash AND d.status='trusted' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt operator not authorized' USING ERRCODE='42501'; END IF;
  IF p_authority='bot_subscription' THEN
    SELECT o.merchant_id,o.provider_checkout_ref,o.metadata->>'provider_request_id',o.amount_iqd,o.provider INTO tenant,assigned_payment,assigned_request,assigned_amount,assigned_provider FROM public.saas_billing_orders o WHERE o.id=p_order_id FOR SHARE;
  ELSE
    SELECT o.merchant_id,o.provider_checkout_ref,o.metadata->>'provider_request_id',o.amount_iqd,o.provider INTO tenant,assigned_payment,assigned_request,assigned_amount,assigned_provider FROM public.cashier_billing_orders o WHERE o.id=p_order_id FOR SHARE;
  END IF;
  -- Execution accepts reviewed existing assignment; no null-reference repair.
  IF tenant IS NULL OR assigned_provider IS DISTINCT FROM reviewed.provider
    OR assigned_payment IS DISTINCT FROM reviewed.payment_ref
    OR assigned_request IS DISTINCT FROM reviewed.request_ref
    OR assigned_amount IS DISTINCT FROM reviewed.amount_iqd
    OR reviewed.event_type<>'payment_succeeded' THEN
    RAISE EXCEPTION 'verified receipt replay conflict' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.database_admin_access_audits(id,admin_account_id,reason_code,request_hash,expires_at)
    VALUES(p_audit_id||'-execute',p_actor_id,'BILLING_RECEIPT_REPLAY_EXECUTE',p_request_hash,now()+interval '1 minute');
  RETURN QUERY SELECT reviewed.provider,reviewed.provider_event_id,reviewed.payment_ref,reviewed.request_ref,reviewed.event_type,
    reviewed.amount_iqd,reviewed.payload_hash,reviewed.first_received_at,reviewed.order_id,reviewed.authority,tenant;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text) FROM PUBLIC;
