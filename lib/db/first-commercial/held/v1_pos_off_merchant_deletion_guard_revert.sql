-- FAWRI V1 / HELD fail-closed revert for the V1 POS-off retention trigger.
-- NOT APPROVED for Neon/hosted execution. Source-only; execute on approved
-- project/branch/database only after explicit owner authorization and
-- independently recoverable DB+media backup.
-- This reverts only the V1 replacement trigger and function; the original
-- held 0052 INVOKER function and all merchant/cashier/financial records
-- are preserved. Returning to the original trigger intentionally BLOCKS
-- merchant deletion if the V1 auth role lacks cashier writer membership.
-- It is a fail-closed service rollback, not proof of complete POS retirement.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $v1_pos_revert_preimage$
BEGIN
  IF current_database()<>'fawri'
     OR current_setting('server_version_num')::integer/10000<>18
     OR session_user<>'fawri_owner' OR current_user<>session_user
     OR to_regclass('drizzle.__drizzle_migrations') IS NULL
     OR to_regprocedure('public.fawri_sequence_merchant_deleted()') IS NULL
     OR to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass
         AND tgenabled='O' AND NOT tgisinternal
         AND tgfoid=to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()')
     )
  THEN RAISE EXCEPTION 'V1_POS_OFF_RETENTION_REVERT_PREIMAGE_REJECTED'; END IF;
END;
$v1_pos_revert_preimage$;

DROP TRIGGER cashier_device_streams_merchant_deleted
  ON public.merchants;
CREATE TRIGGER cashier_device_streams_merchant_deleted
AFTER UPDATE OF retention_status ON public.merchants
FOR EACH ROW WHEN (
  NEW.retention_status='deleted'
  AND OLD.retention_status IS DISTINCT FROM NEW.retention_status
)
EXECUTE FUNCTION public.fawri_sequence_merchant_deleted();
DROP FUNCTION public.fawri_v1_pos_off_merchant_deleted();

DO $v1_pos_revert_postimage$
BEGIN
  IF to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()') IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass
         AND tgenabled='O' AND NOT tgisinternal
         AND tgfoid=to_regprocedure('public.fawri_sequence_merchant_deleted()')
     )
  THEN RAISE EXCEPTION 'V1_POS_OFF_RETENTION_REVERT_POSTIMAGE_REJECTED'; END IF;
END;
$v1_pos_revert_postimage$;
COMMIT;
