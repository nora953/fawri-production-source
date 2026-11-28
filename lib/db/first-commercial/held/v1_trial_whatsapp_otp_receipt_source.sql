-- HELD / REVIEW REQUIRED / NOT IN DRIZZLE LEDGER.
-- Durable evidence that Meta accepted an approved WhatsApp Authentication
-- template request for a specific server-issued OTP challenge (NOT delivery).
-- No historical backfill. Never run on Neon without separate owner-approved
-- rollback and backup/restore proof. All fields NULL for legacy challenges.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $wa_receipt_preimage$
BEGIN
 IF current_database()<>'fawri'
    OR current_setting('server_version_num')::int / 10000<>18
    OR session_user<>'fawri_owner' OR current_user<>session_user
    OR to_regclass('public.auth_otp_challenges') IS NULL
    OR EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='auth_otp_challenges'
        AND column_name IN ('wa_auth_message_id_hash','wa_auth_accepted_at')
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname='fawri_auth_issuer' AND rolcanlogin
        AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)
    )
    OR has_table_privilege('fawri_restricted_runtime','public.auth_otp_challenges','UPDATE')
    OR has_table_privilege('fawri_operator_issuer','public.auth_otp_challenges','UPDATE')
 THEN RAISE EXCEPTION 'TRIAL_WA_RECEIPT_PREIMAGE_NOT_ACCEPTED'; END IF;
END;
$wa_receipt_preimage$;

ALTER TABLE public.auth_otp_challenges
 ADD COLUMN wa_auth_message_id_hash text,
 ADD COLUMN wa_auth_accepted_at timestamptz;

ALTER TABLE public.auth_otp_challenges
 ADD CONSTRAINT auth_otp_wa_receipt_complete CHECK (
   (wa_auth_message_id_hash IS NULL AND wa_auth_accepted_at IS NULL)
   OR (wa_auth_message_id_hash IS NOT NULL
       AND wa_auth_message_id_hash ~ '^[A-Za-z0-9_-]{43}$'
       AND wa_auth_accepted_at IS NOT NULL)
 );

CREATE UNIQUE INDEX auth_otp_wa_message_id_unique
 ON public.auth_otp_challenges(wa_auth_message_id_hash)
 WHERE wa_auth_message_id_hash IS NOT NULL;

COMMENT ON COLUMN public.auth_otp_challenges.wa_auth_message_id_hash IS
 'HMAC of accepted WhatsApp Authentication template message ID, never raw ID/OTP. API acceptance is NOT proof of delivery.';
COMMENT ON COLUMN public.auth_otp_challenges.wa_auth_accepted_at IS
 'When provider accepted the trusted AUTHENTICATION template for this server-issued challenge.';

DO $wa_receipt_postimage$
BEGIN
 IF NOT EXISTS(
     SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid='public.auth_otp_challenges'::regclass
       AND conname='auth_otp_wa_receipt_complete'
   )
   OR has_table_privilege('fawri_restricted_runtime','public.auth_otp_challenges','UPDATE')
   OR has_table_privilege('fawri_operator_issuer','public.auth_otp_challenges','UPDATE')
 THEN RAISE EXCEPTION 'TRIAL_WA_RECEIPT_POSTIMAGE_NOT_ACCEPTED'; END IF;
END;
$wa_receipt_postimage$;
COMMIT;
