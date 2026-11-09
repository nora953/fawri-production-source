-- FT-01 / P0-ACCESS-HOSTED-ROLLOUT. REVIEWED SOURCE ONLY.
-- DO NOT EXECUTE ON NEON until *separate, exact scoped owner authorization*,
-- verified independent new project/branch, recovery point, approved SHA,
-- and provider connection. This is a WRITE operation even though NOLOGIN.
-- New project ID crimson-cherry-65705041, branch br-holy-waterfall-b993zglb.
-- SQL CANNOT independently prove provider project/branch identity.
-- No LIVE application role is created, NO password/LOGIN, NO grants, NO import,
-- NO migration, NO app deploy. Transaction rolls back on SQL failure.
-- First run only; deliberately fails if even one role already exists.

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
       'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'))
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

DO $ft01_postimage$
DECLARE role_count integer;
BEGIN
  SELECT count(*)::integer INTO role_count
    FROM pg_catalog.pg_roles r
   WHERE r.rolname IN (
       'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer')
     AND NOT (r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls
              OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
     AND NOT has_schema_privilege(r.oid,'public','CREATE');
  IF role_count <> 3 THEN
     RAISE EXCEPTION 'FT01_THREE_NOLOGIN_ROLE_POSTIMAGE_UNSAFE';
  END IF;
END;
$ft01_postimage$;

COMMIT;
-- This SELECT is informational only; the prior transaction committed above.
SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls,
       rolcreatedb, rolcreaterole, rolreplication
  FROM pg_catalog.pg_roles
 WHERE rolname IN (
   'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer')
 ORDER BY rolname;
