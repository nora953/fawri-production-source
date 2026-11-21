-- HELD / REVIEW REQUIRED / NOT EXECUTABLE VIA DRIZZLE — V1 trial evidence ledger
-- NO NEON PRODUCTION WRITE WITHOUT OWNER APPROVAL AND RESTORE PROOF.
-- Records a historic verified business evidence reservation across Google IDs.
-- This does NOT approve or activate any trial. GDPR/market privacy & retention
-- rules require separate approval before use in a commercial release.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $trial_evidence_preimage$
BEGIN
 IF current_database() <> 'fawri'
    OR current_setting('server_version_num')::integer / 10000 <> 18
    OR session_user <> 'fawri_owner' OR current_user <> session_user
    OR to_regclass('public.merchants') IS NULL
    OR to_regclass('public.accounts') IS NULL
    OR to_regclass('public.merchant_trial_claims') IS NOT NULL
    OR to_regclass('public.merchant_trial_evidence') IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname='fawri_auth_issuer' AND r.rolcanlogin
      AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb)
    )
    OR has_table_privilege('fawri_restricted_runtime','public.accounts','SELECT')
    OR has_table_privilege('fawri_operator_issuer','public.accounts','SELECT')
 THEN RAISE EXCEPTION 'TRIAL_EVIDENCE_PREIMAGE_NOT_ACCEPTED'; END IF;
END;
$trial_evidence_preimage$;

-- Merchant FK can become NULL after deletion, but scoped HMAC merchant
-- fingerprint persists for fraud/duplicate analysis subject to retention policy.
-- Do not store email, phone, IP, store name or raw registration numbers here.
CREATE TABLE public.merchant_trial_claims (
 id text PRIMARY KEY,
 merchant_id text REFERENCES public.merchants(id) ON DELETE SET NULL,
 merchant_hash text NOT NULL UNIQUE,
 decision text NOT NULL DEFAULT 'pending_review',
 reviewed_at timestamptz,
 activated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT merchant_trial_claim_id_format CHECK
   (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 CONSTRAINT merchant_trial_claim_hash_format CHECK
   (merchant_hash ~ '^[A-Za-z0-9_-]{43}$'),
 CONSTRAINT merchant_trial_claim_decision_check CHECK
   (decision IN ('pending_review','approved','denied','activated')),
 CONSTRAINT merchant_trial_claim_approval_check CHECK
   ((decision='pending_review' AND reviewed_at IS NULL AND activated_at IS NULL)
    OR (decision IN ('approved','denied') AND reviewed_at IS NOT NULL AND activated_at IS NULL)
    OR (decision='activated' AND reviewed_at IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE UNIQUE INDEX merchant_trial_claim_active_merchant_unique
 ON public.merchant_trial_claims(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX merchant_trial_claim_created_idx ON public.merchant_trial_claims(created_at);

-- One evidence digest is globally reserved to exactly one trial claim.
-- Additional evidence types may be added only after trustworthy verification.
CREATE TABLE public.merchant_trial_evidence (
 id text PRIMARY KEY,
 claim_id text NOT NULL REFERENCES public.merchant_trial_claims(id) ON DELETE RESTRICT,
 evidence_kind text NOT NULL,
 evidence_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT merchant_trial_evidence_id_format CHECK
   (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 CONSTRAINT merchant_trial_evidence_kind_check CHECK
   (evidence_kind IN ('verified_phone','verified_business_registration','verified_domain')),
 CONSTRAINT merchant_trial_evidence_hash_format CHECK
   (evidence_hash ~ '^[A-Za-z0-9_-]{43}$')
);
CREATE INDEX merchant_trial_evidence_claim_idx ON public.merchant_trial_evidence(claim_id);

ALTER TABLE public.merchant_trial_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_trial_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.merchant_trial_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.merchant_trial_evidence FROM PUBLIC;
CREATE POLICY merchant_trial_claims_auth_issuer_only ON public.merchant_trial_claims
 FOR ALL TO fawri_auth_issuer USING (true) WITH CHECK (true);
CREATE POLICY merchant_trial_evidence_auth_issuer_only ON public.merchant_trial_evidence
 FOR ALL TO fawri_auth_issuer USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE ON public.merchant_trial_claims TO fawri_auth_issuer;
GRANT SELECT,INSERT ON public.merchant_trial_evidence TO fawri_auth_issuer;
-- No UPDATE or DELETE of evidence: a verified trial history cannot be reassigned.
-- No tenant role, operator role, or public role receives direct access.

DO $trial_evidence_postimage$
BEGIN
 IF NOT has_table_privilege('fawri_auth_issuer','public.merchant_trial_claims','SELECT')
    OR NOT has_table_privilege('fawri_auth_issuer','public.merchant_trial_claims','INSERT')
    OR NOT has_table_privilege('fawri_auth_issuer','public.merchant_trial_evidence','INSERT')
    OR has_table_privilege('fawri_auth_issuer','public.merchant_trial_evidence','UPDATE')
    OR has_table_privilege('fawri_auth_issuer','public.merchant_trial_evidence','DELETE')
    OR has_table_privilege('fawri_restricted_runtime','public.merchant_trial_claims','SELECT')
    OR has_table_privilege('fawri_operator_issuer','public.merchant_trial_claims','SELECT')
    OR has_table_privilege('fawri_restricted_runtime','public.merchant_trial_evidence','INSERT')
    OR has_table_privilege('fawri_operator_issuer','public.merchant_trial_evidence','UPDATE')
 THEN RAISE EXCEPTION 'TRIAL_EVIDENCE_POSTIMAGE_NOT_ACCEPTED'; END IF;
END;
$trial_evidence_postimage$;
COMMIT;
