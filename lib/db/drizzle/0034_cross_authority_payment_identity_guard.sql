-- P0: a provider identity may resolve to at most one billing authority.
-- Database-enforced identity ownership covers direct SQL writers as well as API writers.
-- Acquire a shared identity namespace lock for each provider reference. Order updates
-- that share a reference serialize even when they target different tables.
-- A transaction-scoped advisory lock serializes all changes sharing either identity.
-- Both references are guarded separately because the resolver matches with OR.
CREATE FUNCTION public.fawri_guard_provider_order_identity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off
AS $$
DECLARE
  old_payment text;
  old_request text;
  new_payment text;
  new_request text;
  lock_key text;
  matches integer;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    old_payment := CASE WHEN OLD.provider='superqi_sandbox' THEN OLD.provider_checkout_ref ELSE NULL END;
    old_request := CASE WHEN OLD.provider='superqi_sandbox' THEN OLD.metadata->>'provider_request_id' ELSE NULL END;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_payment := CASE WHEN NEW.provider='superqi_sandbox' THEN NEW.provider_checkout_ref ELSE NULL END;
    new_request := CASE WHEN NEW.provider='superqi_sandbox' THEN NEW.metadata->>'provider_request_id' ELSE NULL END;
  END IF;
  -- Lock old and new keys, sorted to avoid opposite-order deadlocks.
  FOR lock_key IN SELECT DISTINCT key FROM (
    VALUES
      (CASE WHEN old_payment IS NOT NULL THEN 'payment:'||old_payment END),
      (CASE WHEN old_request IS NOT NULL THEN 'request:'||old_request END),
      (CASE WHEN new_payment IS NOT NULL THEN 'payment:'||new_payment END),
      (CASE WHEN new_request IS NOT NULL THEN 'request:'||new_request END)
  ) AS keys(key) WHERE key IS NOT NULL ORDER BY key LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fawri-provider-order:'||lock_key));
  END LOOP;
  IF TG_OP <> 'DELETE' AND (new_payment IS NOT NULL OR new_request IS NOT NULL) THEN
    SELECT count(*) INTO matches FROM (
      SELECT id FROM public.saas_billing_orders
      WHERE provider='superqi_sandbox'
        AND (new_payment IS NOT NULL AND provider_checkout_ref=new_payment
          OR new_request IS NOT NULL AND metadata->>'provider_request_id'=new_request)
        AND (TG_TABLE_NAME <> 'saas_billing_orders' OR id IS DISTINCT FROM NEW.id)
      UNION ALL
      SELECT id FROM public.cashier_billing_orders
      WHERE provider='superqi_sandbox'
        AND (new_payment IS NOT NULL AND provider_checkout_ref=new_payment
          OR new_request IS NOT NULL AND metadata->>'provider_request_id'=new_request)
        AND (TG_TABLE_NAME <> 'cashier_billing_orders' OR id IS DISTINCT FROM NEW.id)
      LIMIT 1
    ) collision;
    IF matches > 0 THEN
      RAISE EXCEPTION 'SUPERQI_SANDBOX_ORDER_AUTHORITY_COLLISION' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER fawri_saas_provider_identity_guard
BEFORE INSERT OR UPDATE OF provider,provider_checkout_ref,metadata OR DELETE
ON public.saas_billing_orders FOR EACH ROW EXECUTE FUNCTION public.fawri_guard_provider_order_identity();
--> statement-breakpoint
CREATE TRIGGER fawri_cashier_provider_identity_guard
BEFORE INSERT OR UPDATE OF provider,provider_checkout_ref,metadata OR DELETE
ON public.cashier_billing_orders FOR EACH ROW EXECUTE FUNCTION public.fawri_guard_provider_order_identity();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_guard_provider_order_identity() FROM PUBLIC;
