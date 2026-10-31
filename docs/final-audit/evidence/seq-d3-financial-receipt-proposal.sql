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
