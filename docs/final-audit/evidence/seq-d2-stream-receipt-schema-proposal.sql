-- SEQ-D2 proposal ONLY: not in the canonical migration journal, no live writer.
-- Revision2: opaque stream identity; raw device binding erased on retirement.
-- Execute only inside the owned disposable regression; review before promotion.
CREATE TABLE public.cashier_device_streams (
 id text PRIMARY KEY,
 merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
 device_id text,
 protocol_version integer NOT NULL DEFAULT 2 CHECK (protocol_version=2),
 state text NOT NULL DEFAULT 'review' CHECK (state IN ('review','active','retired')),
 last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence BETWEEN 0 AND 9007199254740991),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 enrollment_evidence_hash text,
 enrolled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,merchant_id),
 CHECK (char_length(id) BETWEEN 1 AND 200),
 CHECK ((state='retired' AND device_id IS NULL) OR (state<>'retired' AND device_id IS NOT NULL AND char_length(device_id) BETWEEN 1 AND 200)),
 CHECK (enrollment_evidence_hash IS NULL OR enrollment_evidence_hash ~ '^[0-9a-f]{64}$'),
 CHECK (state<>'active' OR (enrollment_evidence_hash IS NOT NULL AND enrolled_at IS NOT NULL))
);
CREATE UNIQUE INDEX cashier_device_streams_current_device_unique ON public.cashier_device_streams(merchant_id,device_id) WHERE state IN ('review','active');
CREATE TABLE public.cashier_operation_receipts (
 id text PRIMARY KEY,
 stream_id text NOT NULL,
 merchant_id text NOT NULL,
 device_sequence bigint NOT NULL CHECK (device_sequence BETWEEN 1 AND 9007199254740991),
 operation_id text NOT NULL,
 operation_kind text NOT NULL CHECK (operation_kind IN ('sale','return','void')),
 canonical_version integer NOT NULL CHECK (canonical_version=1),
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 result_id text NOT NULL,
 station_id text NOT NULL,
 location_id text NOT NULL,
 staff_id text NOT NULL,
 shift_id text NOT NULL,
 occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(stream_id,merchant_id) REFERENCES public.cashier_device_streams(id,merchant_id) ON DELETE RESTRICT,
 FOREIGN KEY(station_id,merchant_id) REFERENCES public.merchant_cashier_stations(id,merchant_id) ON DELETE RESTRICT,
 FOREIGN KEY(location_id,merchant_id) REFERENCES public.merchant_locations(id,merchant_id) ON DELETE RESTRICT,
 FOREIGN KEY(shift_id,merchant_id,station_id,staff_id) REFERENCES public.cashier_shifts(id,merchant_id,station_id,staff_id) ON DELETE RESTRICT,
 UNIQUE(stream_id,device_sequence), UNIQUE(stream_id,operation_id), UNIQUE(merchant_id,operation_id),
 CHECK (char_length(id) BETWEEN 1 AND 200 AND char_length(operation_id) BETWEEN 1 AND 200 AND char_length(result_id) BETWEEN 1 AND 200)
);
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
  PERFORM 1 FROM public.merchants WHERE id=NEW.merchant_id AND retention_status<>'deleted' FOR KEY SHARE;
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
