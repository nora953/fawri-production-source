-- SEQ-D3 coordinated authority CANDIDATE ONLY: not in lib/db/drizzle.
-- No runtime LOGIN grants, route activation, canonical promotion or hosted execution.
-- SEQ-D3 PROPOSAL ONLY. Installed/removed solely in owned disposable tests.
-- Not a canonical migration, credential provisioning plan or hosted permission.
CREATE ROLE fawri_cashier_enrollment_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE TABLE public.cashier_stream_enrollment_reviews (
 review_reference_hash text PRIMARY KEY CHECK(review_reference_hash ~ '^[0-9a-f]{64}$'),
 stream_id text NOT NULL UNIQUE,
 merchant_id text NOT NULL,
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 reviewer_reference_hash text NOT NULL CHECK(reviewer_reference_hash ~ '^[0-9a-f]{64}$'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 reviewed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(stream_id,merchant_id) REFERENCES public.cashier_device_streams(id,merchant_id) ON DELETE RESTRICT
);
ALTER TABLE public.cashier_stream_enrollment_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cashier_stream_enrollment_reviews FROM PUBLIC;
CREATE FUNCTION public.fawri_cashier_enrollment_runtime() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS 'SELECT true';
REVOKE ALL ON FUNCTION public.fawri_cashier_enrollment_runtime() FROM PUBLIC;
CREATE FUNCTION public.fawri_enrollment_review_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'enrollment review is immutable' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION public.fawri_enrollment_review_immutable() FROM PUBLIC;
CREATE TRIGGER cashier_stream_enrollment_reviews_immutable BEFORE UPDATE OR DELETE ON public.cashier_stream_enrollment_reviews
FOR EACH ROW EXECUTE FUNCTION public.fawri_enrollment_review_immutable();
CREATE FUNCTION public.fawri_enroll_reviewed_empty_cashier_stream(p_stream text,p_manifest jsonb)
RETURNS TABLE(stream_id text,state text,last_sequence bigint,version integer,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 m text; d text; st text; r text; reviewer text; digest text; review_key text; reviewer_key text; reviewed timestamptz;
 s public.cashier_device_streams%ROWTYPE;
 prior public.cashier_stream_enrollment_reviews%ROWTYPE;
BEGIN
 IF NOT has_function_privilege(session_user,'public.fawri_cashier_enrollment_runtime()','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin
   AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication)) THEN
  RAISE EXCEPTION 'separate trusted enrollment authority required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
 OR p_manifest->'version' IS DISTINCT FROM '1'::jsonb
 OR p_manifest->>'kind' IS DISTINCT FROM 'independent_empty_device_review'
 OR p_manifest->'reviewed_local_counter' IS DISTINCT FROM '0'::jsonb
 OR p_manifest->'reviewed_pending_operations' IS DISTINCT FROM '0'::jsonb
 OR p_manifest-ARRAY['version','kind','merchant_id','station_id','device_id','review_reference','reviewer_reference','evidence_sha256','reviewed_at','reviewed_local_counter','reviewed_pending_operations'] <> '{}'::jsonb
 OR p_stream IS NULL OR p_stream !~ '^cashier_stream_[0-9a-f]{64}$'
 OR COALESCE(p_manifest->>'evidence_sha256','') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'independent fresh-empty review required' USING ERRCODE='23514';
 END IF;
 m:=p_manifest->>'merchant_id';d:=p_manifest->>'device_id';st:=p_manifest->>'station_id';
 r:=p_manifest->>'review_reference';reviewer:=p_manifest->>'reviewer_reference';
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[m,d,st,r,reviewer]) v WHERE v IS NULL OR char_length(v) NOT BETWEEN 1 AND 200 OR v ~ '[[:cntrl:]]') THEN
  RAISE EXCEPTION 'review identity invalid' USING ERRCODE='23514';
 END IF;
 -- Raw review/reviewer references exist only in the transient manifest.
 -- Retain domain-separated correlation hashes, not caller-controlled free text.
 -- Hashes are pseudonymous evidence anchors, not proof of anonymity or an
 -- approved retention schedule. No original reference can be recovered here.
 review_key:=encode(sha256(convert_to('cashier-enrollment-review-v1:'||r,'UTF8')),'hex');
 reviewer_key:=encode(sha256(convert_to('cashier-enrollment-reviewer-v1:'||reviewer,'UTF8')),'hex');
 reviewed:=(p_manifest->>'reviewed_at')::timestamptz;
 IF reviewed IS NULL THEN RAISE EXCEPTION 'review time required' USING ERRCODE='23514';END IF;
 digest:=encode(sha256(convert_to(p_manifest::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('cashier-device:'||m||':'||d,0));
 -- Lock the merchant against deletion/status changes, then the station binding.
 -- No credential/session/shift rotation or client baseline resets this identity.
 PERFORM 1 FROM public.merchants WHERE id=m AND retention_status IS DISTINCT FROM 'deleted'
   AND status='approved' AND account_status='approved' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'merchant unavailable for reviewed enrollment' USING ERRCODE='23514';END IF;
 SELECT * INTO prior FROM public.cashier_stream_enrollment_reviews e WHERE e.review_reference_hash=review_key;
 IF FOUND THEN
  SELECT * INTO s FROM public.cashier_device_streams x WHERE x.id=prior.stream_id AND x.merchant_id=prior.merchant_id;
  IF prior.manifest_hash IS DISTINCT FROM digest OR prior.merchant_id IS DISTINCT FROM m
   OR s.id IS DISTINCT FROM p_stream OR s.device_id IS DISTINCT FROM d OR s.state IS DISTINCT FROM 'active' THEN
   RAISE EXCEPTION 'review reference conflict or retired stream' USING ERRCODE='23514';
  END IF;
  RETURN QUERY SELECT s.id,s.state,s.last_sequence,s.version,true;RETURN;
 END IF;
 IF reviewed < clock_timestamp()-interval '15 minutes' OR reviewed > clock_timestamp()+interval '1 minute' THEN
  RAISE EXCEPTION 'review is stale or future dated' USING ERRCODE='23514';
 END IF;
 PERFORM 1 FROM public.merchant_cashier_stations x WHERE x.id=st AND x.merchant_id=m
  AND x.status='active' AND x.paired_device_id=d AND x.location_id IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'reviewed station/device binding required' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM public.cashier_device_streams x WHERE x.merchant_id=m AND (x.device_id=d OR x.state='retired'))
 OR EXISTS(SELECT 1 FROM public.cashier_device_operation_timeline WHERE merchant_id=m AND device_id=d)
 OR EXISTS(SELECT 1 FROM public.cashier_operation_attribution WHERE merchant_id=m AND device_id=d)
 OR EXISTS(SELECT 1 FROM public.orders o WHERE o.merchant_id=m AND o.source_channel='cashier' AND (
   COALESCE(o.metadata->'cashier_sync'->>'device_id','')='' OR
   (o.metadata->'cashier_sync'->'compensations' IS NOT NULL AND jsonb_typeof(o.metadata->'cashier_sync'->'compensations')<>'array') OR
   o.metadata->'cashier_sync'->>'device_id'=d OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.metadata->'cashier_sync'->'compensations')='array'
      THEN o.metadata->'cashier_sync'->'compensations' ELSE '[]'::jsonb END) c WHERE c->>'device_id'=d OR COALESCE(c->>'device_id','')=''))) THEN
  RAISE EXCEPTION 'existing device history requires reconciliation' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at)
 VALUES(p_stream,m,d,'active',digest,clock_timestamp()) RETURNING * INTO s;
 INSERT INTO public.cashier_stream_enrollment_reviews(review_reference_hash,stream_id,merchant_id,manifest_hash,reviewer_reference_hash,evidence_sha256,reviewed_at)
 VALUES(review_key,s.id,m,digest,reviewer_key,p_manifest->>'evidence_sha256',reviewed);
 RETURN QUERY SELECT s.id,s.state,s.last_sequence,s.version,false;
END $$;
REVOKE ALL ON FUNCTION public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb) FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO fawri_cashier_enrollment_owner;
GRANT SELECT ON public.cashier_device_streams,public.cashier_stream_enrollment_reviews TO fawri_cashier_enrollment_owner;
GRANT INSERT(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) ON public.cashier_device_streams TO fawri_cashier_enrollment_owner;
GRANT INSERT ON public.cashier_stream_enrollment_reviews TO fawri_cashier_enrollment_owner;
GRANT SELECT(id,merchant_id,device_id) ON public.cashier_device_operation_timeline,public.cashier_operation_attribution TO fawri_cashier_enrollment_owner;
GRANT SELECT(id,merchant_id,source_channel,metadata) ON public.orders TO fawri_cashier_enrollment_owner;
GRANT SELECT(id,retention_status,status,account_status) ON public.merchants TO fawri_cashier_enrollment_owner;
-- Row locking needs UPDATE privilege, but no policy authorizes an actual update.
GRANT UPDATE(id) ON public.merchants TO fawri_cashier_enrollment_owner;
GRANT SELECT(id,merchant_id,status,paired_device_id,location_id) ON public.merchant_cashier_stations TO fawri_cashier_enrollment_owner;
GRANT UPDATE(id) ON public.merchant_cashier_stations TO fawri_cashier_enrollment_owner;
CREATE POLICY enrollment_owner_stream_read ON public.cashier_device_streams FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_stream_insert ON public.cashier_device_streams FOR INSERT TO fawri_cashier_enrollment_owner WITH CHECK(state='active' AND last_sequence=0 AND version=1);
CREATE POLICY enrollment_owner_review_read ON public.cashier_stream_enrollment_reviews FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_review_insert ON public.cashier_stream_enrollment_reviews FOR INSERT TO fawri_cashier_enrollment_owner WITH CHECK(true);
CREATE POLICY enrollment_owner_timeline_read ON public.cashier_device_operation_timeline FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_attribution_read ON public.cashier_operation_attribution FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_order_read ON public.orders FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_station_read ON public.merchant_cashier_stations FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_station_lock ON public.merchant_cashier_stations FOR UPDATE TO fawri_cashier_enrollment_owner USING(true) WITH CHECK(false);
CREATE POLICY enrollment_owner_merchant_read ON public.merchants FOR SELECT TO fawri_cashier_enrollment_owner USING(true);
CREATE POLICY enrollment_owner_merchant_lock ON public.merchants FOR UPDATE TO fawri_cashier_enrollment_owner USING(true) WITH CHECK(false);
-- merchants may have no RLS policy in a legacy fixture; no UPDATE is executed.
ALTER FUNCTION public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb) OWNER TO fawri_cashier_enrollment_owner;
REVOKE CREATE ON SCHEMA public FROM fawri_cashier_enrollment_owner;

-- SEQ-D3 financial receipt authority PROPOSAL ONLY. Offline disposable CI only.
CREATE ROLE fawri_cashier_receipt_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE FUNCTION public.fawri_cashier_stream_financial_runtime() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS 'SELECT true';
REVOKE ALL ON FUNCTION public.fawri_cashier_stream_financial_runtime() FROM PUBLIC;
CREATE FUNCTION public.fawri_lock_cashier_financial_stream(m text,d text,sid text)
RETURNS TABLE(last_sequence bigint,version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.cashier_device_streams%ROWTYPE;
BEGIN
 IF NOT has_function_privilege(session_user,'public.fawri_cashier_stream_financial_runtime()','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication))
 OR NOT fawri_security.allows_merchant(m) THEN
  RAISE EXCEPTION 'scoped financial runtime required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM public.cashier_device_streams x WHERE x.id=sid AND x.merchant_id=m AND x.device_id=d FOR UPDATE;
 IF NOT FOUND OR s.state<>'active' THEN RAISE EXCEPTION 'active reviewed stream required' USING ERRCODE='23514';END IF;
 RETURN QUERY SELECT s.last_sequence,s.version;
END $$;
REVOKE ALL ON FUNCTION public.fawri_lock_cashier_financial_stream(text,text,text) FROM PUBLIC;
CREATE FUNCTION public.fawri_commit_cashier_financial_receipt(r jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.cashier_device_streams%ROWTYPE; at_time timestamptz; n bigint; m text; d text;
BEGIN
 m:=r->>'merchant_id';d:=r->>'device_id';n:=(r->>'device_sequence')::bigint;at_time:=(r->>'occurred_at')::timestamptz;
 PERFORM public.fawri_lock_cashier_financial_stream(m,d,r->>'stream_id');
 SELECT * INTO s FROM public.cashier_device_streams x WHERE x.id=r->>'stream_id' AND x.merchant_id=m;
 IF n IS NULL OR n<>s.last_sequence+1 OR n>9007199254740991 OR COALESCE(r->>'request_hash','')!~'^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'next exact financial receipt required' USING ERRCODE='23514';
 END IF;
 -- Require a matching historical identity, not a currently logged-in replacement.
 IF NOT EXISTS(SELECT 1 FROM public.cashier_operator_sessions os
   JOIN public.cashier_shifts sh ON sh.id=os.shift_id AND sh.merchant_id=os.merchant_id AND sh.station_id=os.station_id AND sh.staff_id=os.staff_id
   JOIN public.merchant_cashier_stations st ON st.id=os.station_id AND st.merchant_id=os.merchant_id
   JOIN public.cashier_station_credentials cr ON cr.id=r->>'credential_id' AND cr.station_id=os.station_id AND cr.merchant_id=os.merchant_id AND cr.device_id=d
   WHERE os.id=r->>'operator_session_id' AND os.merchant_id=m AND os.station_id=r->>'station_id'
    AND os.staff_id=r->>'staff_id' AND os.shift_id=r->>'shift_id' AND st.location_id=r->>'location_id'
    AND os.issued_at<=at_time AND os.expires_at>at_time AND (os.revoked_at IS NULL OR os.revoked_at>at_time)
    AND cr.issued_at<=at_time AND cr.expires_at>at_time AND (cr.revoked_at IS NULL OR cr.revoked_at>at_time)
    AND sh.started_at<=at_time AND (sh.ended_at IS NULL OR sh.ended_at>=at_time)) THEN
  RAISE EXCEPTION 'historical financial attribution required' USING ERRCODE='23514';
 END IF;
 -- xmin is used only as same-transaction provenance, never an application ID.
 -- Compare the 32-bit tuple XID to the low 32 bits of the current full XID.
 -- Existing legacy rows cannot be silently adopted by calling the receipt API.
 IF NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=r->>'result_id' AND o.merchant_id=m AND o.source_channel='cashier'
   AND o.fulfillment_location_id=r->>'location_id'
   AND o.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296)
   AND ((r->>'operation_kind'='sale' AND o.metadata->'cashier_sync'->>'operation_id'=r->>'operation_id'
     AND o.metadata->'cashier_sync'->>'device_id'=d AND o.metadata->'cashier_sync'->>'device_sequence'=n::text
     AND o.metadata->'cashier_sync'->>'request_hash'=r->>'request_hash'
     AND (o.metadata->'cashier_sync'->'sale_snapshot'->>'occurred_at')::timestamptz=at_time)
    OR (r->>'operation_kind' IN ('return','void') AND EXISTS(
     SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.metadata->'cashier_sync'->'compensations')='array'
      THEN o.metadata->'cashier_sync'->'compensations' ELSE '[]'::jsonb END) c
     WHERE c->>'operation_id'=r->>'operation_id' AND c->>'kind'=r->>'operation_kind' AND c->>'device_id'=d
      AND c->>'device_sequence'=n::text AND c->>'request_hash'=r->>'request_hash' AND (c->>'occurred_at')::timestamptz=at_time)))) THEN
  RAISE EXCEPTION 'matching financial effect in this transaction required' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.cashier_operation_receipts(id,stream_id,merchant_id,device_sequence,operation_id,operation_kind,canonical_version,request_hash,result_id,station_id,location_id,staff_id,shift_id,occurred_at)
 VALUES('receipt_'||encode(sha256(convert_to((r->>'stream_id')||':'||n::text,'UTF8')),'hex'),
   s.id,m,n,r->>'operation_id',r->>'operation_kind',1,r->>'request_hash',r->>'result_id',
   r->>'station_id',r->>'location_id',r->>'staff_id',r->>'shift_id',at_time);
 UPDATE public.cashier_device_streams x SET last_sequence=n,version=x.version+1 WHERE x.id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO fawri_cashier_receipt_owner;
GRANT USAGE ON SCHEMA fawri_security TO fawri_cashier_receipt_owner;
GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO fawri_cashier_receipt_owner;
GRANT SELECT ON public.cashier_device_streams,public.cashier_operation_receipts,public.orders TO fawri_cashier_receipt_owner;
GRANT INSERT ON public.cashier_operation_receipts TO fawri_cashier_receipt_owner;
GRANT UPDATE(last_sequence,version) ON public.cashier_device_streams TO fawri_cashier_receipt_owner;
GRANT SELECT(id,merchant_id,station_id,staff_id,shift_id,issued_at,expires_at,revoked_at) ON public.cashier_operator_sessions TO fawri_cashier_receipt_owner;
GRANT SELECT(id,merchant_id,station_id,staff_id,started_at,ended_at) ON public.cashier_shifts TO fawri_cashier_receipt_owner;
GRANT SELECT(id,merchant_id,location_id) ON public.merchant_cashier_stations TO fawri_cashier_receipt_owner;
GRANT SELECT(id,merchant_id,station_id,device_id,issued_at,expires_at,revoked_at) ON public.cashier_station_credentials TO fawri_cashier_receipt_owner;
CREATE POLICY receipt_owner_stream_read ON public.cashier_device_streams FOR SELECT TO fawri_cashier_receipt_owner USING(true);
CREATE POLICY receipt_owner_stream_update ON public.cashier_device_streams FOR UPDATE TO fawri_cashier_receipt_owner USING(state='active') WITH CHECK(state='active');
CREATE POLICY receipt_owner_receipt_read ON public.cashier_operation_receipts FOR SELECT TO fawri_cashier_receipt_owner USING(true);
CREATE POLICY receipt_owner_receipt_insert ON public.cashier_operation_receipts FOR INSERT TO fawri_cashier_receipt_owner WITH CHECK(true);
CREATE POLICY receipt_owner_order_read ON public.orders FOR SELECT TO fawri_cashier_receipt_owner USING(true);
CREATE POLICY receipt_owner_session_read ON public.cashier_operator_sessions FOR SELECT TO fawri_cashier_receipt_owner USING(true);
CREATE POLICY receipt_owner_shift_read ON public.cashier_shifts FOR SELECT TO fawri_cashier_receipt_owner USING(true);
CREATE POLICY receipt_owner_station_read ON public.merchant_cashier_stations FOR SELECT TO fawri_cashier_receipt_owner USING(true);
CREATE POLICY receipt_owner_credential_read ON public.cashier_station_credentials FOR SELECT TO fawri_cashier_receipt_owner USING(true);
ALTER FUNCTION public.fawri_lock_cashier_financial_stream(text,text,text) OWNER TO fawri_cashier_receipt_owner;
ALTER FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) OWNER TO fawri_cashier_receipt_owner;
REVOKE CREATE ON SCHEMA public FROM fawri_cashier_receipt_owner;
