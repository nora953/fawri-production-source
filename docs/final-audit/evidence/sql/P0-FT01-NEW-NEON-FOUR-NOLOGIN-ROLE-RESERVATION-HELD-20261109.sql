-- FT-01 / P0-ACCESS-HOSTED-ROLLOUT. REVIEWED SOURCE ONLY.
-- DO NOT EXECUTE ON NEON until *separate, exact scoped owner authorization*,
-- verified independent new project/branch, recovery point, approved SHA,
-- and provider connection. This is a WRITE operation even though NOLOGIN.
-- New project ID crimson-cherry-65705041, branch br-holy-waterfall-b993zglb.
-- SQL CANNOT independently prove provider project/branch identity.
-- No LIVE application role is created, NO password/LOGIN or object grants,
-- NO migration or app deploy. PostgreSQL18 automatically gives the creating
-- fawri_owner a single ADMIN-only membership on each new NOLOGIN role:
-- ADMIN=true, SET=false, INHERIT=false. This is NOT zero membership;
-- the postimage requires exactly that edge, and no others.
-- Transaction rolls back on SQL failure.
-- First run only; deliberately fails if any of FOUR roles already exists.

BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $ft01_preimage$
DECLARE relation_count integer;
BEGIN
  IF current_database() <> 'fawri'
     OR current_setting('server_version_num')::integer / 10000 <> 18
     OR session_user <> 'fawri_owner'
     OR current_user <> session_user
     OR (SELECT rolcreaterole FROM pg_catalog.pg_roles
           WHERE rolname=session_user) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'FT01_WRONG_NEW_TARGET_OR_ROLE'; END IF;

  SELECT COUNT(*)::integer INTO relation_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
     AND n.nspname NOT LIKE 'pg_toast%'
     AND n.nspname NOT LIKE 'pg_temp_%'
     AND n.nspname NOT LIKE 'pg_toast_temp_%'
     AND c.relkind IN ('r','p','v','m','f','S');

  IF relation_count <> 0
     OR to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN (
       'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer'))
  THEN RAISE EXCEPTION 'FT01_NEW_TARGET_PREIMAGE_CHANGED'; END IF;

  -- A clean catalogue alone is not a substitute for a provider snapshot,
  -- exact compute endpoint identity or explicit authorization.
END;
$ft01_preimage$;

CREATE ROLE fawri_restricted_runtime
  NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE fawri_auth_issuer
  NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE fawri_operator_issuer
  NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
-- Separate NOLOGIN retirement writer. It must NEVER shadow the real
-- fawri_auth_issuer LOGIN; it gets no table grants in this reservation step.
CREATE ROLE fawri_cashier_retirement_writer
  NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

DO $ft01_postimage$
DECLARE role_count integer;
BEGIN
  SELECT count(*)::integer INTO role_count
    FROM pg_catalog.pg_roles r
   WHERE r.rolname IN (
       'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer')
     AND NOT (r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls
              OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
     -- These group roles must never inherit some other role.
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
     -- PostgreSQL 18 CREATEROLE automatically grants role-creator ADMIN.
     -- Enforce exactly ONE inbound creator-only ADMIN edge, without SET
     -- or INHERIT. An unknown extra member or writable membership aborts.
     AND (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m
           WHERE m.roleid=r.oid)=1
     AND EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE m.roleid=r.oid
         AND u.rolname='fawri_owner'
         AND m.admin_option IS TRUE
         AND m.inherit_option IS FALSE
         AND m.set_option IS FALSE)
     AND NOT has_schema_privilege(r.oid,'public','CREATE');
  IF role_count <> 4 THEN
     RAISE EXCEPTION 'FT01_FOUR_NOLOGIN_ROLE_POSTIMAGE_UNSAFE';
  END IF;
END;
$ft01_postimage$;

COMMIT;
-- This SELECT is informational only; the prior transaction committed above.
SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls,
       rolcreatedb, rolcreaterole, rolreplication
  FROM pg_catalog.pg_roles
 WHERE rolname IN (
   'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer')
 ORDER BY rolname;
