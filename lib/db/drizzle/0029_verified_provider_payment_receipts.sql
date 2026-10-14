-- Unknown payment ownership cannot be guessed from webhook input. RLS has no
-- merchant policy; this inbox grants no entitlement and stores no raw payload.
CREATE TABLE public.verified_provider_payment_receipts (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payment_ref text NOT NULL,
  request_ref text NOT NULL,
  event_type text NOT NULL,
  amount_iqd integer NOT NULL,
  payload_hash text NOT NULL,
  first_received_at timestamptz NOT NULL,
  CONSTRAINT verified_provider_payment_receipts_provider_provider_event_id_pk PRIMARY KEY(provider,provider_event_id),
  CONSTRAINT verified_payment_receipt_provider_check CHECK (provider = 'superqi_sandbox'),
  CONSTRAINT verified_payment_receipt_identity_check CHECK (char_length(provider_event_id) BETWEEN 1 AND 300 AND char_length(payment_ref) BETWEEN 1 AND 300 AND char_length(request_ref) BETWEEN 1 AND 300),
  CONSTRAINT verified_payment_receipt_type_check CHECK (event_type IN ('payment_succeeded','payment_failed','payment_cancelled')),
  CONSTRAINT verified_payment_receipt_amount_check CHECK (amount_iqd > 0),
  CONSTRAINT verified_payment_receipt_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE public.verified_provider_payment_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.verified_provider_payment_receipts FROM PUBLIC;
--> statement-breakpoint
-- Trusted schema owner only. Runtime EXECUTE requires an explicit reviewed
-- deployment grant; never grant table access or this capability to merchants.
-- Caller must first verify signature and confirm identical gateway state.
CREATE FUNCTION public.fawri_admit_verified_payment_receipt(
  p_event_id text, p_payment_ref text, p_request_ref text, p_event_type text,
  p_amount_iqd integer, p_payload_hash text, p_received_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
DECLARE stored public.verified_provider_payment_receipts%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR char_length(p_event_id) NOT BETWEEN 1 AND 300
     OR p_payment_ref IS NULL OR char_length(p_payment_ref) NOT BETWEEN 1 AND 300
     OR p_request_ref IS NULL OR char_length(p_request_ref) NOT BETWEEN 1 AND 300
     OR p_event_type IS NULL OR p_event_type NOT IN ('payment_succeeded','payment_failed','payment_cancelled')
     OR p_amount_iqd IS NULL OR p_amount_iqd <= 0
     OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
     OR p_received_at IS NULL OR NOT isfinite(p_received_at) THEN
    RAISE EXCEPTION 'invalid bounded verified payment receipt' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.verified_provider_payment_receipts
    (provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at)
  VALUES ('superqi_sandbox',p_event_id,p_payment_ref,p_request_ref,p_event_type,p_amount_iqd,p_payload_hash,p_received_at)
  ON CONFLICT (provider,provider_event_id) DO NOTHING;
  SELECT * INTO STRICT stored FROM public.verified_provider_payment_receipts
    WHERE provider = 'superqi_sandbox' AND provider_event_id = p_event_id FOR UPDATE;
  IF stored.payment_ref <> p_payment_ref OR stored.request_ref <> p_request_ref
     OR stored.event_type <> p_event_type OR stored.amount_iqd <> p_amount_iqd
     OR stored.payload_hash <> p_payload_hash THEN
    RAISE EXCEPTION 'verified payment receipt identity collision' USING ERRCODE = '23505';
  END IF;
  RETURN stored.first_received_at;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_admit_verified_payment_receipt(text,text,text,text,integer,text,timestamptz) FROM PUBLIC;
