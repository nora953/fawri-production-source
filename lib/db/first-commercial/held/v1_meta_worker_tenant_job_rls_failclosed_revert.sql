-- FAWRI V1 — HELD FAIL-CLOSED worker capability rollback, NO DATA LOSS.
-- NOT AUTHORIZED FOR NEON OR HOSTED EXECUTION; previous owner approval was
-- for one READ-ONLY catalog SELECT only.
-- Use only after an separately approved new-host rollout and independent
-- DB+media backup/restore evidence, with exact project/branch/DB attested.
-- This stops the tenant worker's DML/SELECT rights; it deliberately leaves
-- merchant_id columns, history, composite foreign keys, RLS/policies, and
-- original background_jobs/other app schema intact. The worker will stop
-- processing until an independently reviewed resume approval.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $v1_meta_worker_revert_preimage$
DECLARE t text;
BEGIN
  IF current_database()<>'fawri'
    OR current_setting('server_version_num')::integer/10000<>18
    OR session_user<>'fawri_owner'
    OR current_user<>session_user
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='fawri_restricted_runtime'
        AND rolcanlogin AND NOT (rolsuper OR rolbypassrls
          OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)
    )
  THEN RAISE EXCEPTION 'V1_META_WORKER_REVERT_WRONG_TARGET'; END IF;
  FOREACH t IN ARRAY ARRAY[
    'background_jobs','background_job_payloads',
    'job_attempts','job_dead_letters'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind IN ('r','p')
        AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'V1_META_WORKER_REVERT_RLS_DRIFT'; END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='job_attempts'
      AND column_name='merchant_id' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='job_dead_letters'
      AND column_name='merchant_id' AND is_nullable='NO'
  )
  THEN RAISE EXCEPTION 'V1_META_WORKER_REVERT_HISTORY_SCHEMA_MISSING'; END IF;
END;
$v1_meta_worker_revert_preimage$;

REVOKE ALL PRIVILEGES ON
  public.background_jobs,
  public.background_job_payloads,
  public.job_attempts,
  public.job_dead_letters
FROM fawri_restricted_runtime;

DO $v1_meta_worker_revert_postimage$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'background_jobs','background_job_payloads',
    'job_attempts','job_dead_letters'
  ] LOOP
    IF has_table_privilege('fawri_restricted_runtime',
       ('public.'||t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity)
    THEN RAISE EXCEPTION 'V1_META_WORKER_REVERT_NOT_FAIL_CLOSED'; END IF;
  END LOOP;
END;
$v1_meta_worker_revert_postimage$;
COMMIT;
