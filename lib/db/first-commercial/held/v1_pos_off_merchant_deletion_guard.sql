-- FAWRI V1 / approved POS-off safe retirement compatibility
-- P0 commercial hosted-retention/identity gate: HELD, NOT AUTHORIZED TO APPLY.
-- This is a post-0052 source-only additive patch, not an edit to accepted
-- canonical/HELD 0052/0053 migrations. Must be applied ONLY after a
-- separately approved exact-source schema+roles rollout and recoverable
-- independent backup on new selected Neon project crimson-cherry-65705041,
-- branch br-holy-waterfall-b993zglb, database fawri, PostgreSQL 18.
-- SQL cannot independently attest Neon project/branch identity.
--
-- Rationale: INVOKER 0052 cashier-deletion trigger requires an inherited
-- cashier writer group and cashier DML that the owner expressly EXCLUDED from
-- first-commercial POS-off auth role. Without this patch even a merchant
-- with ZERO cashier streams cannot complete authorized retention deletion.
--
-- Safety: under the trusted dedicated AUTH LOGIN only, permits merchant
-- retention update IF AND ONLY IF **NO historical cashier_device_streams
-- rows** exist for that merchant (including retired). Fail-closed if any
-- cashier stream exists, without deleting/updating its records or weakening
-- 0052's historic stream/receipt checks. No cashier grants added to any
-- application role. Existing 0052 function retained unchanged for history.
-- Uses SECURITY DEFINER only for one existence check otherwise forbidden
-- by POS-off: function owner must be the non-superuser fawri_owner with
-- restricted search_path=pg_catalog; no direct EXECUTE for PUBLIC/roles.
--
-- This source does NOT make merchant deletion a universally approved hosted
-- feature. Real authenticated HTTP, financial holds, retention rules, RLS,
-- backup/restore, runtime prelistener and first merchant E2E remain gated.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $v1_pos_off_preimage$
BEGIN
  IF current_database()<>'fawri'
     OR current_setting('server_version_num')::integer/10000<>18
     OR session_user<>'fawri_owner'
     OR current_user<>session_user
     OR to_regclass('drizzle.__drizzle_migrations') IS NULL
     OR to_regprocedure('public.fawri_sequence_merchant_deleted()') IS NULL
     OR to_regprocedure('public.fawri_authentication_runtime()') IS NULL
     OR to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()') IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass
         AND tgenabled='O' AND NOT tgisinternal
         AND tgfoid=to_regprocedure('public.fawri_sequence_merchant_deleted()')
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid='public.cashier_device_streams'::regclass
         AND relrowsecurity
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='fawri_auth_issuer'
         AND rolcanlogin AND NOT (rolsuper OR rolbypassrls
           OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles r ON r.oid=m.member
       WHERE r.rolname='fawri_auth_issuer'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
       WHERE r.rolname='fawri_auth_issuer'
         AND has_table_privilege(r.oid,'public.cashier_device_streams',
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
     )
  THEN RAISE EXCEPTION 'V1_POS_OFF_RETENTION_PREIMAGE_REJECTED'; END IF;
END;
$v1_pos_off_preimage$;

CREATE FUNCTION public.fawri_v1_pos_off_merchant_deleted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $v1_pos_guard$
BEGIN
  -- Trust check BEFORE consulting cashier rows, even for the zero-row case.
  -- Inside SECURITY DEFINER current_user is fawri_owner; session_user
  -- remains the independently authenticated client LOGIN.
  IF TG_OP<>'UPDATE' OR TG_TABLE_SCHEMA<>'public'
     OR TG_TABLE_NAME<>'merchants'
     OR NEW.retention_status IS DISTINCT FROM 'deleted'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR session_user<>'fawri_auth_issuer'
     OR NOT has_function_privilege(session_user,
         'public.fawri_authentication_runtime()','EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
       WHERE r.rolname=session_user AND r.rolcanlogin
         AND NOT (r.rolinherit OR r.rolsuper OR r.rolbypassrls
           OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
     )
  THEN RAISE EXCEPTION 'V1 POS-off trusted merchant retention authority required'
       USING ERRCODE='42501'; END IF;
  IF NEW.status<>'suspended' THEN
    RAISE EXCEPTION 'deleted merchant must be suspended'
      USING ERRCODE='23514';
  END IF;
  -- Deliberate exact-zero restriction, NOT a cashier-retirement shortcut:
  -- any stream, even retired, must go through separate owner-reviewed
  -- financial-data preservation and retirement policy before deletion.
  IF EXISTS (
    SELECT 1 FROM public.cashier_device_streams s
    WHERE s.merchant_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'V1 POS-off retention blocked by preserved cashier data'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$v1_pos_guard$;
REVOKE ALL ON FUNCTION public.fawri_v1_pos_off_merchant_deleted()
  FROM PUBLIC;
-- Original 0052 function and all merchant/receipt data remain untouched.
DROP TRIGGER cashier_device_streams_merchant_deleted
  ON public.merchants;
CREATE TRIGGER cashier_device_streams_merchant_deleted
AFTER UPDATE OF retention_status ON public.merchants
FOR EACH ROW WHEN (
  NEW.retention_status='deleted'
  AND OLD.retention_status IS DISTINCT FROM NEW.retention_status
)
EXECUTE FUNCTION public.fawri_v1_pos_off_merchant_deleted();

DO $v1_pos_off_postimage$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid=to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()')
      AND n.nspname='public'
      AND p.prosecdef
      AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles
                      WHERE rolname='fawri_owner')
      AND 'search_path=pg_catalog'=ANY(p.proconfig)
      AND 'row_security=off'=ANY(p.proconfig)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname='cashier_device_streams_merchant_deleted'
      AND tgrelid='public.merchants'::regclass AND tgenabled='O'
      AND tgfoid=to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()')
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl,
        acldefault('f',p.proowner))) acl
    WHERE p.oid=to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()')
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  )
  THEN RAISE EXCEPTION 'V1_POS_OFF_RETENTION_POSTIMAGE_REJECTED'; END IF;
END;
$v1_pos_off_postimage$;
COMMIT;
