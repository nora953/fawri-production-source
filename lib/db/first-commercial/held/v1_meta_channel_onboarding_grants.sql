-- FAWRI first merchant V1 / P0-ACCESS-HOSTED-ROLLOUT
-- HELD additive Meta channel onboarding and ingress identity ACL.
-- NOT approved for Neon or hosted execution. Separate write consent required.
-- Exact new project crimson-cherry-65705041, branch br-holy-waterfall-b993zglb,
-- database fawri, PostgreSQL 18. SQL cannot attest Neon project or branch.
--
-- Real source contracts:
-- postgresMetaChannelAuthority.ts: auth LOGIN connects/disconnects/rotates
-- encrypted Meta credentials (merchant_channels SELECT/INSERT/UPDATE).
-- postgresManualConversationAuthority.ts and postgresMetaAutoReplyIntent.ts:
-- tenant LOGIN reads only id/merchant_id/platform/page_id/status in channels.
-- postgresMetaChannelAuthority.ts listActiveMetaPageMappingsAuthoritative:
-- tenant LOGIN calls bounded fawri_resolve_meta_page_merchants(text[])
-- before a per-merchant transaction exists. Function returns IDs only, never
-- credentials; SOURCE-REVIEWED security definer and bound arguments required.
--
-- The auth role is a specially trusted issuer; no direct channel credential
-- SELECT/DML for the generic tenant role. No default/ALL/DELETE/TRUNCATE
-- privileges, no secret literals, no granting PUBLIC EXECUTE.
-- This is a V1 supplemental role fragment, NOT full channel/jobs/Meta provider
-- onboarding, provider auth verification or hosted rollout approval.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $v1_meta_channels_preimage$
DECLARE
  auth_role oid;
  tenant_role oid;
BEGIN
  IF current_database()<>'fawri'
     OR current_setting('server_version_num')::integer / 10000<>18
     OR session_user<>'fawri_owner'
     OR current_user<>session_user
     OR to_regclass('drizzle.__drizzle_migrations') IS NULL
     OR to_regclass('public.merchant_channels') IS NULL
     OR to_regprocedure('public.fawri_resolve_meta_page_merchants(text[])') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class c
       WHERE c.oid='public.merchant_channels'::regclass
         AND c.relrowsecurity
         AND EXISTS(
           SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
       WHERE p.oid=to_regprocedure('public.fawri_resolve_meta_page_merchants(text[])')
         AND p.prosecdef AND r.rolname='fawri_owner'
         AND 'search_path=pg_catalog'=ANY(p.proconfig)
         AND 'row_security=off'=ANY(p.proconfig)
     )
  THEN RAISE EXCEPTION 'V1_META_CHANNEL_PREIMAGE_NOT_ACCEPTED'; END IF;
  SELECT oid INTO auth_role FROM pg_catalog.pg_roles
    WHERE rolname='fawri_auth_issuer' AND rolcanlogin
      AND NOT (rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
        OR rolcreatedb OR rolreplication);
  SELECT oid INTO tenant_role FROM pg_catalog.pg_roles
    WHERE rolname='fawri_restricted_runtime' AND rolcanlogin
      AND NOT (rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
        OR rolcreatedb OR rolreplication);
  IF auth_role IS NULL OR tenant_role IS NULL
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members
      WHERE member IN (auth_role,tenant_role))
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid='public.merchant_channels'::regclass
        AND c.relowner IN (auth_role,tenant_role))
  THEN RAISE EXCEPTION 'V1_META_CHANNEL_ROLES_NOT_RESTRICTED'; END IF;
END;
$v1_meta_channels_preimage$;

REVOKE ALL ON FUNCTION public.fawri_resolve_meta_page_merchants(text[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[])
  TO fawri_restricted_runtime;

-- Auth connects, rekeys and disconnects a Meta page with encrypted
-- credentials. It must not gain table DELETE / TRUNCATE / TRIGGER rights.
GRANT SELECT, INSERT, UPDATE ON public.merchant_channels
  TO fawri_auth_issuer;

-- Tenant channel lookups may use these public routing fields, but MUST NOT
-- SELECT encrypted tokens, IV, tags or key identifiers.
GRANT SELECT (id,merchant_id,platform,page_id,status)
  ON public.merchant_channels TO fawri_restricted_runtime;

DO $v1_meta_channels_postimage$
DECLARE
  auth_role oid;
  tenant_role oid;
  secret_column text;
  routing_column text;
BEGIN
  SELECT oid INTO auth_role FROM pg_catalog.pg_roles
    WHERE rolname='fawri_auth_issuer' AND rolcanlogin
      AND NOT (rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
        OR rolcreatedb OR rolreplication);
  SELECT oid INTO tenant_role FROM pg_catalog.pg_roles
    WHERE rolname='fawri_restricted_runtime' AND rolcanlogin
      AND NOT (rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
        OR rolcreatedb OR rolreplication);
  IF auth_role IS NULL OR tenant_role IS NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
       WHERE member IN (auth_role,tenant_role))
     OR NOT has_table_privilege(auth_role,'public.merchant_channels','SELECT')
     OR NOT has_table_privilege(auth_role,'public.merchant_channels','INSERT')
     OR NOT has_table_privilege(auth_role,'public.merchant_channels','UPDATE')
     OR has_table_privilege(auth_role,'public.merchant_channels',
       'DELETE,TRUNCATE,TRIGGER,REFERENCES')
     OR has_table_privilege(tenant_role,'public.merchant_channels',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
     OR NOT has_function_privilege(tenant_role,
       'public.fawri_resolve_meta_page_merchants(text[])','EXECUTE')
     OR has_function_privilege(auth_role,
       'public.fawri_resolve_meta_page_merchants(text[])','EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p,
         LATERAL aclexplode(COALESCE(p.proacl,
           acldefault('f',p.proowner))) acl
       WHERE p.oid=to_regprocedure('public.fawri_resolve_meta_page_merchants(text[])')
         AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'V1_META_CHANNEL_POSTIMAGE_PRIVILEGE_REJECTED'; END IF;
  FOREACH secret_column IN ARRAY ARRAY[
    'credential_ciphertext','credential_nonce','credential_auth_tag',
    'credential_key_id','credential_algorithm'
  ] LOOP
    IF has_column_privilege(tenant_role,'public.merchant_channels',
      secret_column,'SELECT')
      OR has_column_privilege(tenant_role,'public.merchant_channels',
        secret_column,'UPDATE')
    THEN RAISE EXCEPTION 'V1_META_TENANT_CREDENTIAL_COLUMN_EXPOSED'; END IF;
  END LOOP;
  FOREACH routing_column IN ARRAY ARRAY[
    'id','merchant_id','platform','page_id','status'
  ] LOOP
    IF NOT has_column_privilege(tenant_role,'public.merchant_channels',
       routing_column,'SELECT')
    THEN RAISE EXCEPTION 'V1_META_TENANT_ROUTING_COLUMN_MISSING'; END IF;
  END LOOP;
END;
$v1_meta_channels_postimage$;
COMMIT;
