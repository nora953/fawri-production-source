-- FAWRI V1 — P0-ACCESS-HOSTED-IDENTITY; source-only HELD first-merchant
-- auth core, EXCLUDES cashier/POS/offline authority and all operator receipts.
--
-- NOT authorized for Neon or any hosted execution. DDL/GRANT writes.
-- Intended only AFTER independently authorized fresh 53-stage schema and
-- independently created authenticated fawri_auth_issuer LOGIN on the exact
-- new project crimson-cherry-65705041 / br-holy-waterfall-b993zglb / fawri.
-- This SQL CANNOT attest a Neon project ID or solve secret/LOGIN provisioning.
-- Run only as a separately reviewed step with independent recovery, source
-- digest, role membership/owner preflight and explicit separate owner consent.
-- No broad ALL PRIVILEGES / default grants / function wildcard.
--
-- Based on real signup, OTP, session, admin identity flows in:
-- postgresMerchantAccountAuthority / postgresAdminAccountAuthority
-- postgresMerchantAuthSecurityAuthority / authPostgresSessionAuthority
-- authenticationPostgresAuthority / postgresRuntimeRlsSecurity
-- RLS + authentication marker must be independently proven after migration.
--
-- This file does NOT claim to be a complete V1 tenant/auth/operator package.
-- The V1 commercial role launch gate remains BLOCKED until actual LOGIN
-- identity, complete role ACL, SQL+HTTP and provider recovery proof.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $v1_auth_preimage$
BEGIN
  IF current_database() <> 'fawri'
    OR current_setting('server_version_num')::integer / 10000 <> 18
    OR session_user <> 'fawri_owner'
    OR current_user <> session_user
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname = 'fawri_auth_issuer'
        AND (NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
          OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit)
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname='fawri_auth_issuer' AND r.rolcanlogin
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles r ON r.oid=m.member
      WHERE r.rolname='fawri_auth_issuer'
    )
    OR to_regprocedure('public.fawri_authentication_runtime()') IS NULL
    OR to_regprocedure('fawri_security.issue_scope(name,integer,bigint,text)') IS NULL
    OR to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)') IS NULL
    OR to_regclass('public.accounts') IS NULL
    OR to_regclass('public.auth_otp_challenges') IS NULL
    OR to_regclass('public.account_sessions') IS NULL
    OR to_regclass('public.merchants') IS NULL
    OR to_regclass('public.merchant_settings') IS NULL
    OR to_regclass('drizzle.__drizzle_migrations') IS NULL
  THEN RAISE EXCEPTION 'V1_AUTH_CORE_GRANT_PREIMAGE_NOT_ACCEPTED'; END IF;
END;
$v1_auth_preimage$;

-- These identity tables are needed for V1 signup, SMS OTP and sessions.
-- Never grant direct table access to tenant or operator LOGIN.
-- Explicitly remove dangerous default PUBLIC EXECUTE on the trusted
-- marker and scope issuer before granting only the dedicated auth LOGIN.
-- The canonical migrations already revoke them; this is a fail-safe guard.
REVOKE ALL ON FUNCTION public.fawri_authentication_runtime() FROM PUBLIC;
REVOKE ALL ON FUNCTION
  fawri_security.issue_scope(name,integer,bigint,text) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO fawri_auth_issuer;
GRANT USAGE ON SCHEMA fawri_security TO fawri_auth_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime()
  TO fawri_auth_issuer;
GRANT EXECUTE ON FUNCTION
  fawri_security.issue_scope(name,integer,bigint,text)
  TO fawri_auth_issuer;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.accounts,
  public.admin_profiles,
  public.admin_permissions,
  public.account_sessions,
  public.trusted_devices,
  public.auth_otp_challenges,
  public.login_attempts,
  public.auth_audit_events
TO fawri_auth_issuer;

GRANT SELECT, INSERT, UPDATE ON
  public.merchants,
  public.merchant_settings
TO fawri_auth_issuer;

DO $v1_auth_postimage$
DECLARE auth oid;
BEGIN
  SELECT oid INTO auth FROM pg_catalog.pg_roles
   WHERE rolname='fawri_auth_issuer' AND rolcanlogin
     AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb
       OR rolreplication OR rolinherit);
  IF auth IS NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
       WHERE member=auth)
    OR NOT has_function_privilege(auth,
       'public.fawri_authentication_runtime()', 'EXECUTE')
    OR NOT has_function_privilege(auth,
       'fawri_security.issue_scope(name,integer,bigint,text)', 'EXECUTE')
    OR has_function_privilege(auth,
       'public.fawri_issue_admin_directory_audit(text,text,text)', 'EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles other
      WHERE other.rolname IN (
        'fawri_restricted_runtime','fawri_operator_issuer'
      ) AND (
        has_function_privilege(other.oid,
          'public.fawri_authentication_runtime()', 'EXECUTE')
        OR has_function_privilege(other.oid,
          'fawri_security.issue_scope(name,integer,bigint,text)', 'EXECUTE')
      )
    )
    OR has_table_privilege(auth,'public.cashier_device_streams',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(auth,'public.notifications',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(auth,'public.order_drafts',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_schema_privilege(auth,'public','CREATE')
    OR has_schema_privilege(auth,'fawri_security','CREATE')
  THEN RAISE EXCEPTION 'V1_AUTH_CORE_GRANT_POSTIMAGE_NOT_ACCEPTED'; END IF;
END;
$v1_auth_postimage$;
COMMIT;
