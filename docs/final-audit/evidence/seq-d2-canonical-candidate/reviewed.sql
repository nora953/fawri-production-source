-- Candidate only; generated snapshot and historical reproduction must pass before adoption.
CREATE TABLE public.cashier_device_streams (
 id text PRIMARY KEY NOT NULL,
 merchant_id text NOT NULL,
 device_id text,
 protocol_version integer NOT NULL DEFAULT 2,
 state text NOT NULL DEFAULT 'review',
 last_sequence bigint NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 1,
 enrollment_evidence_hash text,
 enrolled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cashier_device_streams_protocol_check CHECK (protocol_version=2),
 CONSTRAINT cashier_device_streams_state_check CHECK (state IN ('review','active','retired')),
 CONSTRAINT cashier_device_streams_sequence_check CHECK (last_sequence BETWEEN 0 AND 9007199254740991),
 CONSTRAINT cashier_device_streams_version_check CHECK (version>0),
 CONSTRAINT cashier_device_streams_id_check CHECK (char_length(id) BETWEEN 1 AND 200),
 CONSTRAINT cashier_device_streams_binding_check CHECK ((state='retired' AND device_id IS NULL) OR (state<>'retired' AND device_id IS NOT NULL AND char_length(device_id) BETWEEN 1 AND 200)),
 CONSTRAINT cashier_device_streams_evidence_check CHECK (enrollment_evidence_hash IS NULL OR enrollment_evidence_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT cashier_device_streams_active_check CHECK (state<>'active' OR (enrollment_evidence_hash IS NOT NULL AND enrolled_at IS NOT NULL)),
 CONSTRAINT cashier_device_streams_identity_unique UNIQUE(id,merchant_id),
 CONSTRAINT cashier_device_streams_merchant_fk FOREIGN KEY(merchant_id) REFERENCES public.merchants(id) ON DELETE RESTRICT
);
CREATE TABLE public.cashier_operation_receipts (
 id text PRIMARY KEY NOT NULL,
 stream_id text NOT NULL,
 merchant_id text NOT NULL,
 device_sequence bigint NOT NULL,
 operation_id text NOT NULL,
 operation_kind text NOT NULL,
 canonical_version integer NOT NULL,
 request_hash text NOT NULL,
 result_id text NOT NULL,
 station_id text NOT NULL,
 location_id text NOT NULL,
 staff_id text NOT NULL,
 shift_id text NOT NULL,
 occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cashier_operation_receipts_sequence_check CHECK (device_sequence BETWEEN 1 AND 9007199254740991),
 CONSTRAINT cashier_operation_receipts_kind_check CHECK (operation_kind IN ('sale','return','void')),
 CONSTRAINT cashier_operation_receipts_canonical_check CHECK (canonical_version=1),
 CONSTRAINT cashier_operation_receipts_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT cashier_operation_receipts_identity_check CHECK (char_length(id) BETWEEN 1 AND 200 AND char_length(operation_id) BETWEEN 1 AND 200 AND char_length(result_id) BETWEEN 1 AND 200),
 CONSTRAINT cashier_operation_receipts_sequence_unique UNIQUE(stream_id,device_sequence),
 CONSTRAINT cashier_operation_receipts_stream_operation_unique UNIQUE(stream_id,operation_id),
 CONSTRAINT cashier_operation_receipts_merchant_operation_unique UNIQUE(merchant_id,operation_id),
 CONSTRAINT cashier_operation_receipts_stream_fk FOREIGN KEY(stream_id,merchant_id) REFERENCES public.cashier_device_streams(id,merchant_id) ON DELETE RESTRICT,
 CONSTRAINT cashier_operation_receipts_station_fk FOREIGN KEY(station_id,merchant_id) REFERENCES public.merchant_cashier_stations(id,merchant_id) ON DELETE RESTRICT,
 CONSTRAINT cashier_operation_receipts_location_fk FOREIGN KEY(location_id,merchant_id) REFERENCES public.merchant_locations(id,merchant_id) ON DELETE RESTRICT,
 CONSTRAINT cashier_operation_receipts_shift_fk FOREIGN KEY(shift_id,merchant_id,station_id,staff_id) REFERENCES public.cashier_shifts(id,merchant_id,station_id,staff_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX cashier_device_streams_current_device_unique ON public.cashier_device_streams(merchant_id,device_id) WHERE state IN ('review','active');
ALTER TABLE public.cashier_device_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_operation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cashier_device_streams,public.cashier_operation_receipts FROM PUBLIC;
-- Only scoped reads are proposed now. No primary/auth/operator writer policy.
CREATE POLICY cashier_device_streams_scoped_read ON public.cashier_device_streams FOR SELECT USING (fawri_security.allows_merchant(merchant_id));
CREATE POLICY cashier_operation_receipts_scoped_read ON public.cashier_operation_receipts FOR SELECT USING (fawri_security.allows_merchant(merchant_id));
CREATE FUNCTION public.fawri_sequence_stream_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  -- Serialize enrollment against the merchant deletion row lock. This is not
  -- sufficient enrollment provenance; it only rejects already deleted targets.
  PERFORM 1 FROM public.merchants WHERE id=NEW.merchant_id AND retention_status IS DISTINCT FROM 'deleted' FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream target is absent or deleted' USING ERRCODE='23514'; END IF;
  IF NEW.last_sequence<>0 OR NEW.version<>1 THEN RAISE EXCEPTION 'stream must begin without a guessed checkpoint' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.id,NEW.merchant_id,NEW.protocol_version) IS DISTINCT FROM (OLD.id,OLD.merchant_id,OLD.protocol_version)
 OR (NEW.device_id IS DISTINCT FROM OLD.device_id AND NOT (OLD.state<>'retired' AND NEW.state='retired' AND NEW.device_id IS NULL))
 OR (OLD.enrollment_evidence_hash IS NOT NULL AND (NEW.enrollment_evidence_hash,NEW.enrolled_at) IS DISTINCT FROM (OLD.enrollment_evidence_hash,OLD.enrolled_at))
 OR (OLD.state='retired' AND NEW.state<>'retired')
 OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'stream identity or version conflict' USING ERRCODE='23514'; END IF;
 IF NEW.last_sequence<>OLD.last_sequence THEN
  IF OLD.state<>'active' OR NEW.state<>'active' OR NEW.last_sequence<>OLD.last_sequence+1
  OR NOT EXISTS(SELECT 1 FROM public.cashier_operation_receipts WHERE stream_id=OLD.id AND device_sequence=NEW.last_sequence) THEN
   RAISE EXCEPTION 'stream checkpoint requires the next receipt' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER cashier_device_streams_guard BEFORE INSERT OR UPDATE ON public.cashier_device_streams FOR EACH ROW EXECUTE FUNCTION public.fawri_sequence_stream_guard();
CREATE FUNCTION public.fawri_sequence_receipt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent public.cashier_device_streams%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'operation receipt is immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO parent FROM public.cashier_device_streams WHERE id=NEW.stream_id FOR UPDATE;
 IF NOT FOUND OR parent.state<>'active' OR NEW.device_sequence<>parent.last_sequence+1 THEN
  RAISE EXCEPTION 'receipt requires the active next sequence' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cashier_operation_receipts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cashier_operation_receipts FOR EACH ROW EXECUTE FUNCTION public.fawri_sequence_receipt_guard();
CREATE FUNCTION public.fawri_sequence_receipt_commit_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cashier_device_streams WHERE id=NEW.stream_id AND last_sequence>=NEW.device_sequence) THEN
  RAISE EXCEPTION 'receipt and checkpoint must commit together' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cashier_operation_receipts_commit_guard AFTER INSERT ON public.cashier_operation_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fawri_sequence_receipt_commit_guard();
REVOKE ALL ON FUNCTION public.fawri_sequence_stream_guard(),public.fawri_sequence_receipt_guard(),public.fawri_sequence_receipt_commit_guard() FROM PUBLIC;

-- Proposal-only lifecycle bridge. Installed only in the disposable fixture;
-- canonical promotion requires a separately reviewed least-privilege owner.
-- Trigger execution grants no caller a standalone retirement capability.
CREATE FUNCTION public.fawri_sequence_merchant_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreaterole)) THEN
  RAISE EXCEPTION 'trusted deletion authority required' USING ERRCODE='42501';
 END IF;
 IF NEW.status<>'suspended' THEN
  RAISE EXCEPTION 'deleted merchant must be suspended' USING ERRCODE='23514';
 END IF;
 UPDATE public.cashier_device_streams
 SET state='retired',device_id=NULL,version=version+1
 WHERE merchant_id=NEW.id AND state<>'retired';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fawri_sequence_merchant_deleted() FROM PUBLIC;
CREATE TRIGGER cashier_device_streams_merchant_deleted
AFTER UPDATE OF retention_status ON public.merchants
FOR EACH ROW WHEN (NEW.retention_status='deleted' AND OLD.retention_status IS DISTINCT FROM NEW.retention_status)
EXECUTE FUNCTION public.fawri_sequence_merchant_deleted();
CREATE ROLE fawri_cashier_retirement_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
GRANT USAGE,CREATE ON SCHEMA public TO fawri_cashier_retirement_owner;
GRANT SELECT ON public.cashier_device_streams TO fawri_cashier_retirement_owner;
GRANT UPDATE(state,device_id,version) ON public.cashier_device_streams TO fawri_cashier_retirement_owner;
CREATE POLICY sequence_retirement_owner_read ON public.cashier_device_streams FOR SELECT TO fawri_cashier_retirement_owner USING(true);
CREATE POLICY sequence_retirement_owner_update ON public.cashier_device_streams FOR UPDATE TO fawri_cashier_retirement_owner USING(state<>'retired') WITH CHECK(state='retired' AND device_id IS NULL);
ALTER FUNCTION public.fawri_sequence_merchant_deleted() OWNER TO fawri_cashier_retirement_owner;
REVOKE CREATE ON SCHEMA public FROM fawri_cashier_retirement_owner;
