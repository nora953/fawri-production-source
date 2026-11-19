-- HELD / REVIEW REQUIRED / NOT IN DRIZZLE LEDGER — WhatsApp-only trial proof columns.
-- SOURCE-ONLY: No Neon/Render writes; no production authorization. Existing rows
-- intentionally get NULL proof. Do not backfill from phone_verified or SMS.
-- A future trusted OTP redemption authority MUST atomically bind these columns
-- only after a real WhatsApp AUTHENTICATION/COPY_CODE message challenge succeeds.
-- The phone HMAC must be HMAC-SHA256(base64url), using FAWRI_TRIAL_EVIDENCE_HMAC_SECRET
-- and scope "trial-evidence:verified-phone:v1" over the canonical E.164 number.
-- Record the exact consumed challenge ID; never record an OTP or plain phone.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $trial_wa_proof_preimage$
BEGIN
  IF current_database() <> 'fawri'
     OR current_setting('server_version_num')::integer / 10000 <> 18
     OR session_user <> 'fawri_owner' OR current_user <> session_user
     OR to_regclass('public.accounts') IS NULL
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='accounts'
         AND column_name IN ('trial_wa_proof_hash',
                             'trial_wa_proof_verified_at',
                             'trial_wa_proof_challenge_id')
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
       WHERE r.rolname='fawri_auth_issuer' AND r.rolcanlogin
         AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb)
     )
     OR has_table_privilege('fawri_restricted_runtime','public.accounts','UPDATE')
     OR has_table_privilege('fawri_operator_issuer','public.accounts','UPDATE')
  THEN RAISE EXCEPTION 'TRIAL_WHATSAPP_PROOF_PREIMAGE_NOT_ACCEPTED'; END IF;
END;
$trial_wa_proof_preimage$;

ALTER TABLE public.accounts
  ADD COLUMN trial_wa_proof_hash text,
  ADD COLUMN trial_wa_proof_verified_at timestamptz,
  ADD COLUMN trial_wa_proof_challenge_id text;

-- A proof is complete or absent; an arbitrary phone_verified=true is NOT proof.
ALTER TABLE public.accounts
  ADD CONSTRAINT account_trial_wa_proof_complete CHECK (
    (trial_wa_proof_hash IS NULL
      AND trial_wa_proof_verified_at IS NULL
      AND trial_wa_proof_challenge_id IS NULL)
    OR
    (trial_wa_proof_hash ~ '^[A-Za-z0-9_-]{43}$'
      AND trial_wa_proof_verified_at IS NOT NULL
      AND trial_wa_proof_challenge_id ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  );
CREATE UNIQUE INDEX accounts_trial_wa_proof_challenge_unique
  ON public.accounts(trial_wa_proof_challenge_id)
  WHERE trial_wa_proof_challenge_id IS NOT NULL;

COMMENT ON COLUMN public.accounts.trial_wa_proof_hash IS
  'Only a trusted WhatsApp Authentication OTP redemption may populate this keyed current-phone HMAC; legacy phone_verified is insufficient.';
COMMENT ON COLUMN public.accounts.trial_wa_proof_verified_at IS
  'Trusted WhatsApp Authentication OTP challenge redemption time; NULL for legacy verification.';
COMMENT ON COLUMN public.accounts.trial_wa_proof_challenge_id IS
  'Consumed and unique trusted WhatsApp Authentication challenge ID, never OTP material.';

DO $trial_wa_proof_postimage$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='accounts'
        AND column_name IN ('trial_wa_proof_hash',
                            'trial_wa_proof_verified_at',
                            'trial_wa_proof_challenge_id')) <> 3
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conname='account_trial_wa_proof_complete'
         AND conrelid='public.accounts'::regclass
     )
     OR has_table_privilege('fawri_restricted_runtime','public.accounts','UPDATE')
     OR has_table_privilege('fawri_operator_issuer','public.accounts','UPDATE')
  THEN RAISE EXCEPTION 'TRIAL_WHATSAPP_PROOF_POSTIMAGE_NOT_ACCEPTED'; END IF;
END;
$trial_wa_proof_postimage$;
COMMIT;
