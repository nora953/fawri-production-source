-- R-OWN-5 HELD AFTER 0052: source-only, NOT in canonical Drizzle journal.
-- Never apply to hosted Neon without source lineage/role/backup review.
-- No reassignment, refund, entitlement, approval or financial disposition.
-- This candidate permits durable HOLD + escalation only; independent provider
-- outcome approval and production privilege adoption are separate gates.
CREATE TABLE public.verified_receipt_manual_cases (
  id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'superqi_sandbox',
  provider_event_id text NOT NULL,
  opened_by text NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  opened_session_id text NOT NULL,
  opened_device_hash text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT manual_case_id_check CHECK (char_length(id) BETWEEN 1 AND 180),
  CONSTRAINT manual_case_session_check CHECK (char_length(opened_session_id) BETWEEN 1 AND 180 AND char_length(opened_device_hash) BETWEEN 32 AND 128),
  CONSTRAINT manual_case_provider_check CHECK (provider = 'superqi_sandbox'),
  CONSTRAINT manual_case_event_id_check CHECK (char_length(provider_event_id) BETWEEN 1 AND 300),
  CONSTRAINT manual_case_receipt_unique UNIQUE(provider,provider_event_id),
  CONSTRAINT manual_case_verified_receipt_fk FOREIGN KEY(provider,provider_event_id)
    REFERENCES public.verified_provider_payment_receipts(provider,provider_event_id) ON DELETE RESTRICT
);

CREATE TABLE public.verified_receipt_manual_case_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  case_id text NOT NULL REFERENCES public.verified_receipt_manual_cases(id) ON DELETE RESTRICT,
  action text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  actor_id text NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  session_id text NOT NULL,
  device_hash text NOT NULL,
  provider_evidence_hash text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT manual_case_history_event_id_check CHECK(char_length(event_id) BETWEEN 1 AND 180),
  CONSTRAINT manual_case_history_session_check CHECK (char_length(session_id) BETWEEN 1 AND 180 AND char_length(device_hash) BETWEEN 32 AND 128),
  CONSTRAINT manual_case_history_evidence_check CHECK (
    provider_evidence_hash IS NULL OR provider_evidence_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT manual_case_history_action_check CHECK (
    (action = 'OPEN_HOLD' AND from_state IS NULL AND to_state = 'UNRESOLVED_HOLD' AND provider_evidence_hash IS NULL)
    OR (action = 'ESCALATE_TO_PROVIDER' AND from_state = 'UNRESOLVED_HOLD'
        AND to_state = 'PROVIDER_REVIEW' AND provider_evidence_hash IS NULL)
    OR (action = 'RECORD_PROVIDER_DISPUTE' AND from_state = 'PROVIDER_REVIEW'
        AND to_state = 'PROVIDER_DISPUTE' AND provider_evidence_hash IS NOT NULL)
  )
);

ALTER TABLE public.verified_receipt_manual_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_receipt_manual_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_receipt_manual_cases, public.verified_receipt_manual_case_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.verified_receipt_manual_case_events_sequence_seq FROM PUBLIC;

CREATE FUNCTION public.fawri_manual_case_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'manual case original record is immutable' USING ERRCODE='42501';
END $$;
CREATE TRIGGER manual_case_immutable BEFORE UPDATE OR DELETE
ON public.verified_receipt_manual_cases FOR EACH ROW
EXECUTE FUNCTION public.fawri_manual_case_immutable();
CREATE TRIGGER manual_case_event_immutable BEFORE UPDATE OR DELETE
ON public.verified_receipt_manual_case_events FOR EACH ROW
EXECUTE FUNCTION public.fawri_manual_case_immutable();

CREATE FUNCTION public.fawri_manual_case_event_append_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE latest text;
BEGIN
  -- The parent lock serializes concurrent state changes across different event IDs.
  PERFORM 1 FROM public.verified_receipt_manual_cases
  WHERE id=NEW.case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case not found' USING ERRCODE='23514';
  END IF;
  SELECT event.to_state INTO latest
  FROM public.verified_receipt_manual_case_events AS event
  WHERE event.case_id=NEW.case_id
  ORDER BY event.sequence DESC LIMIT 1;
  IF NEW.action='OPEN_HOLD' THEN
    IF latest IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate manual case opening' USING ERRCODE='23514';
    END IF;
  ELSIF latest IS NULL OR latest IS DISTINCT FROM NEW.from_state THEN
    RAISE EXCEPTION 'manual case state conflict' USING ERRCODE='23514';
  END IF;
  NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER manual_case_event_append BEFORE INSERT
ON public.verified_receipt_manual_case_events FOR EACH ROW
EXECUTE FUNCTION public.fawri_manual_case_event_append_guard();

-- Privileged stored capability. No runtime role is granted EXECUTE by this
-- candidate. Session authentication and restricted issuer are separately gated.
CREATE FUNCTION public.fawri_open_unmatched_verified_receipt_case(
  p_actor text,p_session_id text,p_device_hash text,p_case_id text,p_event_id text
) RETURNS TABLE(case_id text,receipt_event_id text,case_state text,applied boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE actor_role text; receipt public.verified_provider_payment_receipts%ROWTYPE;
        inserted integer; existing_case_id text; actual_state text;
BEGIN
  IF p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 180
    OR p_session_id IS NULL OR char_length(p_session_id) NOT BETWEEN 1 AND 180
    OR p_device_hash IS NULL OR char_length(p_device_hash) NOT BETWEEN 32 AND 128
    OR p_case_id IS NULL OR p_case_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$'
    OR p_event_id IS NULL OR char_length(p_event_id) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid manual case intake' USING ERRCODE='22023';
  END IF;
  SELECT profile.role::text INTO actor_role
    FROM public.accounts AS account JOIN public.admin_profiles AS profile
      ON profile.account_id=account.id
   WHERE account.id=p_actor AND account.kind='admin' AND account.state='active'
     AND profile.enabled AND NOT profile.must_change_password
   FOR SHARE OF account,profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case actor not authorized' USING ERRCODE='42501';
  END IF;
  IF actor_role<>'owner_admin' THEN
    PERFORM 1 FROM public.admin_permissions
     WHERE admin_id=p_actor AND permission='manage_subscriptions' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'manual case actor not authorized' USING ERRCODE='42501';
    END IF;
  END IF;
  -- Revalidate the real current session/device in the same SQL transaction;
  -- actor ID alone is never independent financial-operation authority.
  PERFORM 1 FROM public.account_sessions s JOIN public.accounts a ON a.id=s.account_id
    WHERE s.id=p_session_id AND s.account_id=p_actor AND s.kind='admin' AND s.status='active'
      AND s.device_fingerprint_hash=p_device_hash
      AND s.session_version=a.session_version AND s.security_version=a.security_version
      AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
    FOR SHARE OF s,a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case session not authorized' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.trusted_devices d
    WHERE d.account_id=p_actor AND d.kind='admin'
      AND d.device_fingerprint_hash=p_device_hash AND d.status='trusted' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case device not authorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO receipt FROM public.verified_provider_payment_receipts
   WHERE provider='superqi_sandbox' AND provider_event_id=p_event_id
     AND event_type='payment_succeeded'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified successful receipt required' USING ERRCODE='23514';
  END IF;
  -- This is deliberately conservative: any known checkout/payment/request
  -- linkage blocks "missing original order" case creation. No guessed owner.
  IF EXISTS(
      SELECT 1 FROM public.saas_billing_orders AS b
       WHERE b.provider=receipt.provider
         AND (b.provider_checkout_ref=receipt.payment_ref
           OR b.provider_payment_ref=receipt.payment_ref
           OR b.metadata->>'provider_request_id'=receipt.request_ref))
    OR EXISTS(
      SELECT 1 FROM public.cashier_billing_orders AS b
       WHERE b.provider=receipt.provider
         AND (b.provider_checkout_ref=receipt.payment_ref
           OR b.provider_payment_ref=receipt.payment_ref
           OR b.metadata->>'provider_request_id'=receipt.request_ref))
  THEN
    RAISE EXCEPTION 'receipt has a candidate original order' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.verified_receipt_manual_cases(id,provider,provider_event_id,opened_by,opened_session_id,opened_device_hash)
    VALUES(p_case_id,receipt.provider,receipt.provider_event_id,p_actor,p_session_id,p_device_hash)
    ON CONFLICT (provider,provider_event_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN
    INSERT INTO public.verified_receipt_manual_case_events
      (event_id,case_id,action,from_state,to_state,actor_id,session_id,device_hash)
    VALUES ('open:'||p_case_id,p_case_id,'OPEN_HOLD',NULL,'UNRESOLVED_HOLD',p_actor,p_session_id,p_device_hash);
  ELSE
    SELECT id INTO existing_case_id FROM public.verified_receipt_manual_cases
     WHERE provider=receipt.provider AND provider_event_id=receipt.provider_event_id FOR SHARE;
    IF existing_case_id IS DISTINCT FROM p_case_id THEN
      RAISE EXCEPTION 'manual case event already assigned' USING ERRCODE='23505';
    END IF;
    SELECT event.to_state INTO actual_state
      FROM public.verified_receipt_manual_case_events event WHERE event.case_id=p_case_id
      ORDER BY event.sequence DESC LIMIT 1;
    IF actual_state IS NULL THEN
      RAISE EXCEPTION 'manual case history missing' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN QUERY SELECT p_case_id,p_event_id,COALESCE(actual_state,'UNRESOLVED_HOLD'::text),false;
END $$;

-- This does NOT mark a payment settled or refunded. A second independent
-- authenticated decision is required before any terminal provider outcome.
CREATE FUNCTION public.fawri_escalate_verified_receipt_manual_case(
  p_actor text,p_session_id text,p_device_hash text,p_case_id text,p_action text,p_event_id text,p_evidence_hash text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE actor_role text; latest text; new_state text;
BEGIN
  IF p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 180
    OR p_session_id IS NULL OR char_length(p_session_id) NOT BETWEEN 1 AND 180
    OR p_device_hash IS NULL OR char_length(p_device_hash) NOT BETWEEN 32 AND 128
    OR p_case_id IS NULL OR char_length(p_case_id) NOT BETWEEN 1 AND 180
    OR p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$'
    OR p_action NOT IN ('ESCALATE_TO_PROVIDER','RECORD_PROVIDER_DISPUTE') THEN
    RAISE EXCEPTION 'invalid manual case transition' USING ERRCODE='22023';
  END IF;
  SELECT profile.role::text INTO actor_role
    FROM public.accounts AS account JOIN public.admin_profiles AS profile
      ON profile.account_id=account.id
   WHERE account.id=p_actor AND account.kind='admin' AND account.state='active'
     AND profile.enabled AND NOT profile.must_change_password
   FOR SHARE OF account,profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case actor not authorized' USING ERRCODE='42501';
  END IF;
  IF actor_role<>'owner_admin' THEN
    PERFORM 1 FROM public.admin_permissions
     WHERE admin_id=p_actor AND permission='manage_subscriptions' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'manual case actor not authorized' USING ERRCODE='42501';
    END IF;
  END IF;
  -- Revalidate the real current session/device in the same SQL transaction;
  -- actor ID alone is never independent financial-operation authority.
  PERFORM 1 FROM public.account_sessions s JOIN public.accounts a ON a.id=s.account_id
    WHERE s.id=p_session_id AND s.account_id=p_actor AND s.kind='admin' AND s.status='active'
      AND s.device_fingerprint_hash=p_device_hash
      AND s.session_version=a.session_version AND s.security_version=a.security_version
      AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
    FOR SHARE OF s,a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case session not authorized' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.trusted_devices d
    WHERE d.account_id=p_actor AND d.kind='admin'
      AND d.device_fingerprint_hash=p_device_hash AND d.status='trusted' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case device not authorized' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.verified_receipt_manual_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case not found' USING ERRCODE='23514';
  END IF;
  SELECT to_state INTO latest FROM public.verified_receipt_manual_case_events
   WHERE case_id=p_case_id ORDER BY sequence DESC LIMIT 1;
  IF p_action='ESCALATE_TO_PROVIDER' AND latest='UNRESOLVED_HOLD'
     AND p_evidence_hash IS NULL THEN new_state:='PROVIDER_REVIEW';
  ELSIF p_action='RECORD_PROVIDER_DISPUTE' AND latest='PROVIDER_REVIEW'
     AND p_evidence_hash ~ '^[a-f0-9]{64}$' THEN new_state:='PROVIDER_DISPUTE';
  ELSE
    RAISE EXCEPTION 'manual case transition denied' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.verified_receipt_manual_case_events
    (event_id,case_id,action,from_state,to_state,actor_id,session_id,device_hash,provider_evidence_hash)
  VALUES(p_event_id,p_case_id,p_action,latest,new_state,p_actor,p_session_id,p_device_hash,p_evidence_hash);
  RETURN new_state;
END $$;

REVOKE ALL ON FUNCTION
  public.fawri_manual_case_immutable(),
  public.fawri_manual_case_event_append_guard(),
  public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text),
  public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text)
FROM PUBLIC;
-- No EXECUTE grants to auth/operator/merchant/tenant LOGIN in this HELD source.


-- R-OWN-5 HELD case-work queue/history; read-only, audited, no table grants.
-- No change to canonical Drizzle journal or any hosted database.
CREATE INDEX verified_receipt_manual_cases_opened_cursor_idx
  ON public.verified_receipt_manual_cases(opened_at DESC,id DESC);
CREATE INDEX verified_receipt_manual_case_events_latest_idx
  ON public.verified_receipt_manual_case_events(case_id,sequence DESC);

CREATE FUNCTION public.fawri_assert_manual_receipt_case_reader(
  p_actor text,p_session_id text,p_device_hash text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE actor_role text;
BEGIN
  IF p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 180
    OR p_session_id IS NULL OR char_length(p_session_id) NOT BETWEEN 1 AND 180
    OR p_device_hash IS NULL OR char_length(p_device_hash) NOT BETWEEN 32 AND 128 THEN
    RAISE EXCEPTION 'manual case reader invalid' USING ERRCODE='22023';
  END IF;
  SELECT profile.role::text INTO actor_role
    FROM public.accounts a JOIN public.admin_profiles profile ON profile.account_id=a.id
   WHERE a.id=p_actor AND a.kind='admin' AND a.state='active'
     AND profile.enabled AND NOT profile.must_change_password
   FOR SHARE OF a,profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual case reader unauthorized' USING ERRCODE='42501';
  END IF;
  IF actor_role<>'owner_admin' THEN
    PERFORM 1 FROM public.admin_permissions permission
     WHERE permission.admin_id=p_actor AND permission.permission='manage_subscriptions'
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'manual case reader unauthorized' USING ERRCODE='42501';
    END IF;
  END IF;
  PERFORM 1 FROM public.account_sessions s JOIN public.accounts a ON a.id=s.account_id
   WHERE s.id=p_session_id AND s.account_id=p_actor
     AND s.kind='admin' AND s.status='active'
     AND s.device_fingerprint_hash=p_device_hash
     AND s.session_version=a.session_version AND s.security_version=a.security_version
     AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
   FOR SHARE OF s,a;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual case reader unauthorized' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.trusted_devices d
   WHERE d.account_id=p_actor AND d.kind='admin'
     AND d.device_fingerprint_hash=p_device_hash AND d.status='trusted'
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual case reader unauthorized' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.fawri_list_verified_receipt_manual_cases(
  p_actor text,p_session_id text,p_device_hash text,
  p_limit integer,p_before_at timestamptz,p_before_id text,
  p_audit_id text,p_request_hash text
) RETURNS TABLE(case_id text,receipt_event_id text,case_state text,
                opened_at text,last_changed_at text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51
     OR ((p_before_at IS NULL) <> (p_before_id IS NULL))
     OR (p_before_at IS NOT NULL AND NOT isfinite(p_before_at))
     OR (p_before_id IS NOT NULL AND char_length(p_before_id) NOT BETWEEN 1 AND 180)
     OR p_audit_id IS NULL OR char_length(p_audit_id) NOT BETWEEN 1 AND 180
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'manual case list invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.fawri_assert_manual_receipt_case_reader(p_actor,p_session_id,p_device_hash);
  -- If audit insertion fails, the same transaction returns zero case data.
  INSERT INTO public.database_admin_access_audits
    (id,admin_account_id,reason_code,request_hash,expires_at)
  VALUES(p_audit_id,p_actor,'BILLING_MANUAL_CASE_QUEUE_READ',p_request_hash,now()+interval '1 minute');
  RETURN QUERY
  SELECT c.id,c.provider_event_id,e.to_state,
    to_char(c.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    to_char(e.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  FROM public.verified_receipt_manual_cases c
  JOIN LATERAL (
    SELECT ev.to_state,ev.recorded_at
    FROM public.verified_receipt_manual_case_events ev
    WHERE ev.case_id=c.id ORDER BY ev.sequence DESC LIMIT 1
  ) e ON true
  WHERE p_before_at IS NULL OR (c.opened_at,c.id)<(p_before_at,p_before_id)
  ORDER BY c.opened_at DESC,c.id DESC LIMIT p_limit;
END $$;

CREATE FUNCTION public.fawri_read_verified_receipt_manual_case_history(
  p_actor text,p_session_id text,p_device_hash text,p_case_id text,
  p_limit integer,p_before_sequence bigint,p_audit_id text,p_request_hash text
) RETURNS TABLE(event_sequence bigint,event_action text,case_state text,
                actor_id text,provider_evidence_hash text,recorded_at text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
BEGIN
  IF p_case_id IS NULL OR p_case_id !~ '^receipt-case-[a-f0-9]{64}$'
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51
     OR (p_before_sequence IS NOT NULL AND p_before_sequence<=0)
     OR p_audit_id IS NULL OR char_length(p_audit_id) NOT BETWEEN 1 AND 180
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'manual case history invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.fawri_assert_manual_receipt_case_reader(p_actor,p_session_id,p_device_hash);
  PERFORM 1 FROM public.verified_receipt_manual_cases WHERE id=p_case_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual case history missing' USING ERRCODE='23514'; END IF;
  INSERT INTO public.database_admin_access_audits
    (id,admin_account_id,reason_code,request_hash,expires_at)
  VALUES(p_audit_id,p_actor,'BILLING_MANUAL_CASE_HISTORY_READ',p_request_hash,now()+interval '1 minute');
  RETURN QUERY
  SELECT ev.sequence,ev.action,ev.to_state,ev.actor_id,ev.provider_evidence_hash,
    to_char(ev.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  FROM public.verified_receipt_manual_case_events ev
  WHERE ev.case_id=p_case_id AND (p_before_sequence IS NULL OR ev.sequence<p_before_sequence)
  ORDER BY ev.sequence DESC LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION
  public.fawri_assert_manual_receipt_case_reader(text,text,text),
  public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text),
  public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text)
FROM PUBLIC;
-- HELD: no EXECUTE on these read capabilities for any production LOGIN.
