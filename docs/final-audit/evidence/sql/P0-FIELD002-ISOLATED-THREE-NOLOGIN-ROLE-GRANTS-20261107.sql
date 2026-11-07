-- FIELD002: reviewed, isolated-only THREE NOLOGIN principal grant admission.
-- DO NOT use on the original staging branch (br-falling-dust-b1km4gix)
-- or default production (br-shiny-lab-b1vxj4wn).
-- Exact allowed target: fawri-field002-clean-staging-rehearsal-20261106
-- Neon project round-fire-18493605 / branch br-polished-mouse-b1proel7 / neondb.
-- Before running, visually recheck Neon SQL Editor's selected branch.
-- ZERO credentials; ZERO login activation. Full rollback if an assertion fails.
-- Do not rerun after success: deliberately requires previously ungranted roles.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $field002_preflight$
DECLARE r record;
BEGIN
  IF current_database() <> 'neondb'
     OR session_user <> 'neondb_owner'
     OR current_user <> session_user
     OR (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 52
     OR (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)
         <> '1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea'
     OR (SELECT count(*) FROM public.notifications) <> 0
     OR (SELECT count(*) FROM public.audit_events) <> 283
     OR (SELECT count(*) FROM fawri_security.transaction_scopes) <> 0
     OR (SELECT count(*) FROM pg_class c
         WHERE c.relnamespace='public'::regnamespace
           AND c.relname IN ('audit_events','manual_reply_requests',
              'merchant_admin_notes','merchant_channel_overrides',
              'merchant_deletion_requests','notifications','order_drafts',
              'processed_channel_events')
           AND c.relrowsecurity) <> 8
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN (
         'fawri_field002_tenant_probe','fawri_field002_auth_probe',
         'fawri_field002_operator_probe')) <> 3
  THEN RAISE EXCEPTION 'FIELD002_THREE_ROLE_PREFLIGHT_REJECTED'; END IF;

  FOR r IN SELECT * FROM pg_roles WHERE rolname IN (
      'fawri_field002_tenant_probe','fawri_field002_auth_probe',
      'fawri_field002_operator_probe')
  LOOP
    IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
       OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
       OR r.rolinherit OR r.rolconnlimit <> 0
       OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
       OR has_schema_privilege(r.oid,'public','CREATE')
       OR has_schema_privilege(r.oid,'fawri_security','CREATE')
       OR has_function_privilege(r.oid,
          'public.fawri_authentication_runtime()','EXECUTE')
       OR has_function_privilege(r.oid,
          'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
       OR has_function_privilege(r.oid,
          'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE')
       OR EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p')
             AND (has_table_privilege(r.oid,c.oid,
                'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
                OR has_any_column_privilege(r.oid,c.oid,
                'SELECT,INSERT,UPDATE,REFERENCES'))
       )
    THEN RAISE EXCEPTION 'FIELD002_THREE_ROLE_BASELINE_UNSAFE'; END IF;
  END LOOP;
END
$field002_preflight$;

GRANT CONNECT ON DATABASE neondb
  TO fawri_field002_tenant_probe, fawri_field002_auth_probe,
     fawri_field002_operator_probe;

GRANT USAGE ON SCHEMA public TO
  fawri_field002_tenant_probe, fawri_field002_auth_probe,
  fawri_field002_operator_probe;
GRANT USAGE ON SCHEMA fawri_security TO
  fawri_field002_tenant_probe, fawri_field002_auth_probe;

-- Tenant-only: exact bounded previously approved read/write surface.
GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text)
  TO fawri_field002_tenant_probe;
GRANT SELECT ON public.notifications, public.subscriptions,
  public.subscription_reply_batches, public.support_inspection_requests
  TO fawri_field002_tenant_probe;
GRANT SELECT (id, account_id) ON public.merchants
  TO fawri_field002_tenant_probe;
GRANT INSERT ON public.notifications TO fawri_field002_tenant_probe;
GRANT UPDATE (read_at) ON public.notifications
  TO fawri_field002_tenant_probe;
GRANT UPDATE (expiry_reminder_sent_at, expired_notification_sent_at, updated_at)
  ON public.subscriptions TO fawri_field002_tenant_probe;
GRANT UPDATE (expiry_reminder_sent_at)
  ON public.subscription_reply_batches TO fawri_field002_tenant_probe;

-- Authentication-only: trusted marker + scoped issuer; account/session bounds.
GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime(),
  fawri_security.issue_scope(name,integer,bigint,text)
  TO fawri_field002_auth_probe;
GRANT SELECT ON public.accounts, public.merchants
  TO fawri_field002_auth_probe;
GRANT UPDATE (id) ON public.accounts TO fawri_field002_auth_probe;
GRANT SELECT, INSERT, UPDATE ON public.account_sessions
  TO fawri_field002_auth_probe;

-- Operator-only: bounded SECURITY DEFINER directory and receipt issuers.
-- No direct table CRUD, auth marker, or private tenant scope issuer.
GRANT EXECUTE ON FUNCTION
  public.fawri_issue_admin_directory_audit(text,text,text),
  public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text),
  public.fawri_review_verified_payment_receipt(text,text,text,text,text,text),
  public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)
  TO fawri_field002_operator_probe;

DO $field002_verify$
DECLARE r record; public_tables integer;
BEGIN
  FOR r IN SELECT * FROM pg_roles WHERE rolname IN (
       'fawri_field002_tenant_probe','fawri_field002_auth_probe',
       'fawri_field002_operator_probe')
  LOOP
    IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
       OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
       OR r.rolinherit OR r.rolconnlimit <> 0
       OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
       OR has_schema_privilege(r.oid,'public','CREATE')
       OR has_schema_privilege(r.oid,'fawri_security','CREATE')
       OR has_table_privilege(r.oid,'public.database_admin_access_audits',
                             'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege(r.oid,'fawri_security.transaction_scopes',
                             'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    THEN RAISE EXCEPTION 'FIELD002_ROLE_ELEVATION_REJECTED'; END IF;

    SELECT count(*) INTO public_tables FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
        AND (has_table_privilege(r.oid,c.oid,
               'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          OR has_any_column_privilege(r.oid,c.oid,
               'SELECT,INSERT,UPDATE,REFERENCES'));
    IF public_tables <> CASE r.rolname
       WHEN 'fawri_field002_tenant_probe' THEN 5
       WHEN 'fawri_field002_auth_probe' THEN 3
       ELSE 0 END
    THEN RAISE EXCEPTION 'FIELD002_DIRECT_TABLE_GRANT_SCOPE_REJECTED'; END IF;

    IF r.rolname <> 'fawri_field002_auth_probe'
       AND (has_function_privilege(r.oid,
             'public.fawri_authentication_runtime()','EXECUTE')
          OR has_function_privilege(r.oid,
             'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE'))
    THEN RAISE EXCEPTION 'FIELD002_AUTH_MARKER_SEPARATION_REJECTED'; END IF;
    IF r.rolname <> 'fawri_field002_operator_probe'
       AND has_function_privilege(r.oid,
             'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'FIELD002_OPERATOR_SEPARATION_REJECTED'; END IF;
  END LOOP;

  IF NOT has_function_privilege('fawri_field002_tenant_probe',
         'fawri_security.allows_merchant(text)','EXECUTE')
     OR has_function_privilege('fawri_field002_tenant_probe',
         'public.fawri_authentication_runtime()','EXECUTE')
     OR has_table_privilege('fawri_field002_tenant_probe',
         'public.account_sessions','SELECT,INSERT,UPDATE,DELETE')
     OR has_column_privilege('fawri_field002_tenant_probe',
         'public.accounts','password_hash','SELECT')
     OR NOT has_table_privilege('fawri_field002_tenant_probe',
         'public.notifications','SELECT')
     OR NOT has_table_privilege('fawri_field002_tenant_probe',
         'public.notifications','INSERT')
     OR NOT has_column_privilege('fawri_field002_tenant_probe',
         'public.notifications','read_at','UPDATE')
     OR has_table_privilege('fawri_field002_tenant_probe',
         'public.notifications','DELETE,TRUNCATE')
  THEN RAISE EXCEPTION 'FIELD002_TENANT_CAPABILITY_REJECTED'; END IF;

  IF NOT has_function_privilege('fawri_field002_auth_probe',
         'public.fawri_authentication_runtime()','EXECUTE')
     OR NOT has_function_privilege('fawri_field002_auth_probe',
         'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
     OR NOT has_table_privilege('fawri_field002_auth_probe',
         'public.account_sessions','SELECT,INSERT,UPDATE')
     OR has_table_privilege('fawri_field002_auth_probe',
         'public.account_sessions','DELETE,TRUNCATE')
     OR has_table_privilege('fawri_field002_auth_probe',
         'public.notifications','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'FIELD002_AUTH_CAPABILITY_REJECTED'; END IF;

  IF NOT has_function_privilege('fawri_field002_operator_probe',
         'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE')
     OR NOT has_function_privilege('fawri_field002_operator_probe',
         'public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('fawri_field002_operator_probe',
         'public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('fawri_field002_operator_probe',
         'public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)','EXECUTE')
     OR has_function_privilege('fawri_field002_operator_probe',
         'public.fawri_authentication_runtime()','EXECUTE')
     OR has_function_privilege('fawri_field002_operator_probe',
         'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
  THEN RAISE EXCEPTION 'FIELD002_OPERATOR_CAPABILITY_REJECTED'; END IF;
END
$field002_verify$;

COMMIT;

-- Expected exactly 3 rows, all can_login=false, no elevated attributes.
SELECT r.rolname AS role_name, r.rolcanlogin AS can_login,
  r.rolbypassrls AS bypass_rls, r.rolcreaterole AS can_create_roles,
  has_function_privilege(r.oid,
    'public.fawri_authentication_runtime()','EXECUTE') AS auth_marker,
  has_function_privilege(r.oid,
    'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE')
    AS operator_issuer,
  has_function_privilege(r.oid,
    'fawri_security.allows_merchant(text)','EXECUTE') AS tenant_scope
FROM pg_roles r WHERE r.rolname IN (
  'fawri_field002_tenant_probe','fawri_field002_auth_probe',
  'fawri_field002_operator_probe')
ORDER BY r.rolname;
