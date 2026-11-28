-- HELD candidate — GLOBAL GOOGLE OIDC one-use login challenge, NO DEPLOY
-- Owner must separately approve after backup, full-schema ACL review and PG18
-- staging proof; not registered in the Drizzle executable migration journal.
-- No Google callback route or trial entitlement is enabled by this SQL.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $google_oidc_challenge_preimage$
BEGIN
 IF current_database() <> 'fawri'
 OR current_setting('server_version_num')::integer / 10000 <> 18
 OR session_user <> 'fawri_owner' OR current_user <> session_user
 OR to_regclass('public.google_oidc_challenges') IS NOT NULL
 OR to_regclass('public.accounts') IS NULL
 OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_roles
   WHERE rolname='fawri_auth_issuer' AND rolcanlogin
     AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)
 )
 OR has_schema_privilege('fawri_restricted_runtime','public','CREATE')
 OR has_schema_privilege('fawri_operator_issuer','public','CREATE')
 THEN RAISE EXCEPTION 'GOOGLE_OIDC_CHALLENGE_PREIMAGE_REJECTED'; END IF;
END;
$google_oidc_challenge_preimage$;

CREATE TABLE public.google_oidc_challenges (
 id text PRIMARY KEY,
 nonce_hash text NOT NULL,
 csrf_hash text NOT NULL,
 ip_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 CONSTRAINT google_oidc_challenges_id_check
 CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 CONSTRAINT google_oidc_challenges_hashes_check
 CHECK (
   nonce_hash ~ '^[A-Za-z0-9_-]{43}$' AND
   csrf_hash ~ '^[A-Za-z0-9_-]{43}$' AND
   ip_hash ~ '^[A-Za-z0-9_-]{43}$'
 ),
 CONSTRAINT google_oidc_challenges_time_check
 CHECK (
   expires_at > created_at
   AND expires_at <= created_at + interval '10 minutes'
   AND (used_at IS NULL OR used_at >= created_at)
 )
);
CREATE INDEX google_oidc_challenges_ip_created_idx
 ON public.google_oidc_challenges (ip_hash, created_at);
CREATE INDEX google_oidc_challenges_expires_idx
 ON public.google_oidc_challenges (expires_at);
ALTER TABLE public.google_oidc_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_oidc_challenges FROM PUBLIC;
CREATE POLICY google_oidc_challenges_auth_only
 ON public.google_oidc_challenges
 FOR ALL TO fawri_auth_issuer USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.google_oidc_challenges TO fawri_auth_issuer;

DO $google_oidc_challenge_postimage$
BEGIN
 IF NOT has_table_privilege('fawri_auth_issuer',
  'public.google_oidc_challenges','SELECT')
 OR NOT has_table_privilege('fawri_auth_issuer',
  'public.google_oidc_challenges','INSERT')
 OR NOT has_table_privilege('fawri_auth_issuer',
  'public.google_oidc_challenges','UPDATE')
 OR has_table_privilege('fawri_restricted_runtime',
  'public.google_oidc_challenges','SELECT')
 OR has_table_privilege('fawri_restricted_runtime',
  'public.google_oidc_challenges','INSERT')
 OR has_table_privilege('fawri_operator_issuer',
  'public.google_oidc_challenges','SELECT')
 OR has_table_privilege('fawri_operator_issuer',
  'public.google_oidc_challenges','UPDATE')
 OR EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c,
 LATERAL pg_catalog.aclexplode(c.relacl) AS privilege
 WHERE c.oid = 'public.google_oidc_challenges'::regclass
   AND privilege.grantee = 0 AND privilege.privilege_type = 'SELECT'
 )
 THEN RAISE EXCEPTION 'GOOGLE_OIDC_CHALLENGE_POSTIMAGE_REJECTED'; END IF;
END;
$google_oidc_challenge_postimage$;
COMMIT;
