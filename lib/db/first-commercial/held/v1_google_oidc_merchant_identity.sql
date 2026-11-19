-- HELD / SOURCE CANDIDATE ONLY — FAWRI V1 Google OIDC merchant identity
-- NEVER run against Neon production without an approved backup, isolated PG18
-- proof, role/grant review and explicit owner approval. NOT in Drizzle journal.
-- Google subject must come from cryptographically verified OIDC and bound CSRF.
-- This does NOT issue sessions, phone OTP, account access, or trials.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $google_identity_preimage$
BEGIN
  IF current_database() <> 'fawri'
     OR current_setting('server_version_num')::integer / 10000 <> 18
     OR session_user <> 'fawri_owner' OR current_user <> session_user
     OR to_regclass('public.accounts') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid='public.accounts'::regclass
         AND c.conname='accounts_active_phone_required_check'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute a
       WHERE a.attrelid='public.accounts'::regclass AND NOT a.attisdropped
         AND a.attname IN ('google_issuer','google_subject')
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname='fawri_auth_issuer'
         AND r.rolcanlogin AND NOT (
           r.rolsuper OR r.rolbypassrls OR r.rolcreaterole
           OR r.rolcreatedb OR r.rolreplication
         )
     )
     OR has_table_privilege('fawri_restricted_runtime','public.accounts','SELECT')
     OR has_table_privilege('fawri_operator_issuer','public.accounts','SELECT')
  THEN RAISE EXCEPTION 'GOOGLE_IDENTITY_PREIMAGE_NOT_ACCEPTED'; END IF;
END;
$google_identity_preimage$;

ALTER TABLE public.accounts ADD COLUMN google_issuer text;
ALTER TABLE public.accounts ADD COLUMN google_subject text;

-- Both absent OR a valid Google subject attached ONLY to a merchant.
ALTER TABLE public.accounts ADD CONSTRAINT accounts_google_identity_pair_check
CHECK (
  (google_issuer IS NULL AND google_subject IS NULL)
  OR (
    kind = 'merchant'::public.account_kind
    AND google_issuer IS NOT NULL
    AND google_issuer = 'https://accounts.google.com'
    AND google_subject IS NOT NULL
    AND google_subject ~ '^[A-Za-z0-9_-]{1,128}$'
  )
);
-- The stable Google subject (not email) must belong to at most one account.
CREATE UNIQUE INDEX accounts_google_identity_unique_idx
ON public.accounts (google_issuer, google_subject)
WHERE google_subject IS NOT NULL;

ALTER TABLE public.accounts DROP CONSTRAINT accounts_active_phone_required_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_active_phone_required_check
CHECK (
  state = 'closed'::public.account_state
  OR phone IS NOT NULL
  OR (
    kind = 'merchant'::public.account_kind
    AND google_issuer IS NOT NULL
    AND google_issuer = 'https://accounts.google.com'
    AND google_subject IS NOT NULL
  )
);

-- A linked subject cannot silently be transferred; only closing the account
-- may erase it. Separate audited recovery is required for a new Google ID.
CREATE FUNCTION public.fawri_google_identity_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $guard$
BEGIN
  IF OLD.google_subject IS NOT NULL
     AND (
       NEW.google_subject IS DISTINCT FROM OLD.google_subject
       OR NEW.google_issuer IS DISTINCT FROM OLD.google_issuer
     )
     AND NOT (
       NEW.state = 'closed'::public.account_state
       AND NEW.google_subject IS NULL AND NEW.google_issuer IS NULL
     )
  THEN RAISE EXCEPTION 'GOOGLE_IDENTITY_SUBJECT_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.fawri_google_identity_immutable() FROM PUBLIC;
CREATE TRIGGER accounts_google_identity_immutable_guard
BEFORE UPDATE OF google_issuer, google_subject ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.fawri_google_identity_immutable();

-- Preserve existing auth issuer-only table ACL; no tenant or operator grant.
DO $google_identity_postimage$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid='public.accounts'::regclass
         AND c.conname='accounts_google_identity_pair_check'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_indexes
       WHERE schemaname='public' AND tablename='accounts'
         AND indexname='accounts_google_identity_unique_idx'
     )
     OR NOT has_table_privilege('fawri_auth_issuer','public.accounts','INSERT')
     OR NOT has_table_privilege('fawri_auth_issuer','public.accounts','UPDATE')
     OR has_table_privilege('fawri_restricted_runtime','public.accounts','SELECT')
     OR has_table_privilege('fawri_restricted_runtime','public.accounts','UPDATE')
     OR has_table_privilege('fawri_operator_issuer','public.accounts','SELECT')
     OR has_table_privilege('fawri_operator_issuer','public.accounts','UPDATE')
  THEN RAISE EXCEPTION 'GOOGLE_IDENTITY_POSTIMAGE_NOT_ACCEPTED'; END IF;
END;
$google_identity_postimage$;
COMMIT;
