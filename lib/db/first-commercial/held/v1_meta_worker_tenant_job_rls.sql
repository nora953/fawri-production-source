-- FAWRI V1 launch P0: durable Meta worker tenant-scoped job history
-- HELD only: NO AUTHORIZATION FOR NEON OR ANY HOSTED DATABASE CHANGE.
-- The historic 54-stage first-commercial candidate is immutable; this
-- proposed additive patch fixes job_attempts/job_dead_letters lacking
-- merchant_id + RLS, without wiping preexisting rows or weakening roles.
-- Exact proposed target crimson-cherry-65705041 / br-holy-waterfall-b993zglb
-- / fawri / PG18; SQL cannot prove the provider's project or branch identity.
--
-- Operations affected: postgresDurableJobQueue.ts claim/attempt/finish/dead
-- letter/requeue, first Meta webhook -> encrypted durable queue -> order.
-- Authentication role enumerates merchant IDs; NEVER grant tenant role global
-- merchants SELECT just to poll the queue. No cashier/financial privileges.
-- This is not an approved production migration; it requires a separately
-- authorized exact-source SHA, independent DB+media restore and API E2E.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';

DO $v1_jobs_preimage$
DECLARE t text;
BEGIN
  IF current_database()<>'fawri'
    OR current_setting('server_version_num')::integer/10000<>18
    OR session_user<>'fawri_owner'
    OR current_user<>session_user
    OR to_regclass('drizzle.__drizzle_migrations') IS NULL
    OR to_regprocedure('public.fawri_tenant_or_audited_admin(text)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname='fawri_restricted_runtime' AND rolcanlogin
        AND NOT (rolinherit OR rolsuper OR rolbypassrls
          OR rolcreaterole OR rolcreatedb OR rolreplication))
    OR EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r ON r.oid=m.member
      WHERE r.rolname='fawri_restricted_runtime')
  THEN RAISE EXCEPTION 'V1_META_JOB_RLS_PREIMAGE_REJECTED'; END IF;

  FOREACH t IN ARRAY ARRAY[
    'background_jobs','background_job_payloads',
    'job_attempts','job_dead_letters'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind IN ('r','p')
        AND c.relowner=(SELECT oid FROM pg_roles
          WHERE rolname='fawri_owner'))
    THEN RAISE EXCEPTION 'V1_META_JOB_EXPECTED_TABLE_OWNER_REQUIRED'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('job_attempts','job_dead_letters')
      AND column_name='merchant_id'
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('job_attempts','job_dead_letters')
      AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'V1_META_JOB_ALREADY_PATCHED_OR_DRIFTED'; END IF;

  -- Retain ALL pre-existing job history, or refuse migration if historic
  -- job IDs cannot be resolved to an actual merchant. No data deletion.
  IF EXISTS (
     SELECT 1 FROM public.job_attempts a
     LEFT JOIN public.background_jobs j ON j.id=a.job_id
     WHERE j.id IS NULL OR j.merchant_id IS NULL
  ) OR EXISTS (
     SELECT 1 FROM public.job_dead_letters d
     LEFT JOIN public.background_jobs j ON j.id=d.job_id
     WHERE j.id IS NULL OR j.merchant_id IS NULL
  ) THEN RAISE EXCEPTION 'V1_META_JOB_UNOWNED_HISTORY_REQUIRES_REVIEW'; END IF;
END;
$v1_jobs_preimage$;

ALTER TABLE public.job_attempts ADD COLUMN merchant_id text;
ALTER TABLE public.job_dead_letters ADD COLUMN merchant_id text;

UPDATE public.job_attempts a
   SET merchant_id=j.merchant_id
  FROM public.background_jobs j
 WHERE a.job_id=j.id;
UPDATE public.job_dead_letters d
   SET merchant_id=j.merchant_id
  FROM public.background_jobs j
 WHERE d.job_id=j.id;

ALTER TABLE public.job_attempts ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE public.job_dead_letters ALTER COLUMN merchant_id SET NOT NULL;

ALTER TABLE public.job_attempts
  ADD CONSTRAINT v1_job_attempts_merchant_fk
  FOREIGN KEY (job_id,merchant_id)
  REFERENCES public.background_jobs(id,merchant_id) ON DELETE CASCADE;
ALTER TABLE public.job_dead_letters
  ADD CONSTRAINT v1_job_dead_letters_merchant_fk
  FOREIGN KEY (job_id,merchant_id)
  REFERENCES public.background_jobs(id,merchant_id) ON DELETE CASCADE;

CREATE INDEX v1_job_attempts_merchant_idx ON public.job_attempts
  (merchant_id,job_id,attempt_number);
CREATE INDEX v1_job_dead_letters_merchant_idx ON public.job_dead_letters
  (merchant_id,job_id,occurrence);

ALTER TABLE public.job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY v1_job_attempts_tenant_boundary ON public.job_attempts
  FOR ALL TO PUBLIC
  USING (public.fawri_tenant_or_audited_admin(merchant_id))
  WITH CHECK (public.fawri_tenant_or_audited_admin(merchant_id));
CREATE POLICY v1_job_dead_letters_tenant_boundary ON public.job_dead_letters
  FOR ALL TO PUBLIC
  USING (public.fawri_tenant_or_audited_admin(merchant_id))
  WITH CHECK (public.fawri_tenant_or_audited_admin(merchant_id));

GRANT SELECT,INSERT,UPDATE ON public.background_jobs
  TO fawri_restricted_runtime;
GRANT SELECT,INSERT ON public.background_job_payloads
  TO fawri_restricted_runtime;
GRANT SELECT,INSERT,UPDATE ON public.job_attempts,public.job_dead_letters
  TO fawri_restricted_runtime;

DO $v1_jobs_postimage$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_attempts','job_dead_letters'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t
        AND c.relrowsecurity AND c.relowner=(SELECT oid FROM pg_roles
           WHERE rolname='fawri_owner')
        AND EXISTS (
          SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid
            AND pg_get_expr(p.polqual,p.polrelid)
              LIKE '%fawri_tenant_or_audited_admin%')
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND a.attname='merchant_id'
        AND a.attnotnull AND NOT a.attisdropped
    )
    THEN RAISE EXCEPTION 'V1_META_JOB_RLS_POSTIMAGE_REJECTED'; END IF;
  END LOOP;
  -- All required privileges checked individually: PostgreSQL interprets a
  -- comma-separated has_table_privilege argument as ANY, not ALL.
  IF EXISTS (
    SELECT 1 FROM (
      VALUES
        ('background_jobs','SELECT'),('background_jobs','INSERT'),
        ('background_jobs','UPDATE'),
        ('background_job_payloads','SELECT'),
        ('background_job_payloads','INSERT'),
        ('job_attempts','SELECT'),('job_attempts','INSERT'),
        ('job_attempts','UPDATE'),
        ('job_dead_letters','SELECT'),('job_dead_letters','INSERT'),
        ('job_dead_letters','UPDATE')
    ) AS required(table_name,action)
    WHERE NOT has_table_privilege('fawri_restricted_runtime',
       ('public.'||required.table_name),required.action)
  ) OR EXISTS (
    SELECT 1 FROM (
      VALUES
        ('background_jobs'),('background_job_payloads'),
        ('job_attempts'),('job_dead_letters')
    ) AS prohibited(table_name)
    WHERE has_table_privilege('fawri_restricted_runtime',
       ('public.'||prohibited.table_name),
       'DELETE,TRUNCATE,TRIGGER,REFERENCES')
  ) OR has_table_privilege('fawri_restricted_runtime','public.merchants','SELECT')
  THEN RAISE EXCEPTION 'V1_META_JOB_DML_POSTIMAGE_REJECTED'; END IF;
END;
$v1_jobs_postimage$;
COMMIT;
