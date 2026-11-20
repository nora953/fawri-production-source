-- HELD / REVIEW REQUIRED / NOT IN DRIZZLE LEDGER.
-- V1 Google merchant creation must persist the approved legal document versions
-- and the server-observed consent time in the SAME transaction as admission.
-- No default values, no legacy backfill and no hosted deployment approval.
-- A new merchant's checkbox booleans alone are not durable acceptance evidence.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $google_consent_preimage$
BEGIN
  IF current_database() <> 'fawri'
     OR current_setting('server_version_num')::integer / 10000 <> 18
     OR session_user <> 'fawri_owner' OR current_user <> session_user
     OR to_regclass('public.merchants') IS NULL
     OR to_regclass('public.accounts') IS NULL
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='merchants'
         AND column_name IN ('google_signup_terms_version',
                             'google_signup_privacy_version',
                             'google_signup_consented_at')
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='fawri_auth_issuer' AND rolcanlogin
         AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)
     )
     OR NOT has_table_privilege('fawri_auth_issuer','public.merchants','INSERT')
  THEN RAISE EXCEPTION 'GOOGLE_SIGNUP_CONSENT_PREIMAGE_NOT_ACCEPTED'; END IF;
END;
$google_consent_preimage$;

ALTER TABLE public.merchants
  ADD COLUMN google_signup_terms_version text,
  ADD COLUMN google_signup_privacy_version text,
  ADD COLUMN google_signup_consented_at timestamptz;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_google_signup_consent_complete CHECK (
    (
      google_signup_terms_version IS NULL
      AND google_signup_privacy_version IS NULL
      AND google_signup_consented_at IS NULL
    )
    OR (
      google_signup_terms_version IS NOT NULL
      AND google_signup_privacy_version IS NOT NULL
      AND google_signup_consented_at IS NOT NULL
      AND google_signup_terms_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$'
      AND google_signup_privacy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$'
    )
  );

COMMENT ON COLUMN public.merchants.google_signup_terms_version IS
 'Immutable published terms revision accepted at first Google merchant signup; server-authoritative, never a browser-supplied version.';
COMMENT ON COLUMN public.merchants.google_signup_privacy_version IS
 'Immutable published privacy revision accepted at first Google merchant signup; server-authoritative, never a browser-supplied version.';
COMMENT ON COLUMN public.merchants.google_signup_consented_at IS
 'Server timestamp when both legal consents were asserted on first Google merchant registration; no consent inferred for existing accounts.';

-- First-signup evidence can never be silently erased or revised by an
-- application UPDATE. Subsequent consent version changes require a distinct,
-- audited future consent log, not rewriting first-admission provenance.
CREATE FUNCTION public.fawri_google_signup_consent_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $google_consent_guard$
BEGIN
  IF OLD.google_signup_consented_at IS NOT NULL
     AND (
       NEW.google_signup_terms_version IS DISTINCT FROM OLD.google_signup_terms_version
       OR NEW.google_signup_privacy_version IS DISTINCT FROM OLD.google_signup_privacy_version
       OR NEW.google_signup_consented_at IS DISTINCT FROM OLD.google_signup_consented_at
     )
  THEN RAISE EXCEPTION 'GOOGLE_SIGNUP_CONSENT_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$google_consent_guard$;
REVOKE ALL ON FUNCTION public.fawri_google_signup_consent_immutable() FROM PUBLIC;
CREATE TRIGGER merchants_google_signup_consent_immutable_guard
BEFORE UPDATE OF google_signup_terms_version,
                 google_signup_privacy_version,
                 google_signup_consented_at ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.fawri_google_signup_consent_immutable();

DO $google_consent_postimage$
BEGIN
  IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='public.merchants'::regclass
        AND conname='merchants_google_signup_consent_complete'
     )
     OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.merchants'::regclass
        AND tgname='merchants_google_signup_consent_immutable_guard'
     )
     OR NOT has_table_privilege('fawri_auth_issuer','public.merchants','INSERT')
  THEN RAISE EXCEPTION 'GOOGLE_SIGNUP_CONSENT_POSTIMAGE_NOT_ACCEPTED'; END IF;
END;
$google_consent_postimage$;
COMMIT;
