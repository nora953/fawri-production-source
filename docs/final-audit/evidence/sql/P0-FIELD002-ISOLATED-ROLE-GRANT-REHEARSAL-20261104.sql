-- FIELD002 clone-only, rollback-only role grant rehearsal.
-- Project round-fire-18493605; branch br-young-hill-b1x9vhlz ONLY.
-- Endpoint ep-soft-wildflower-b1i4j4xu.c-5.eu-central-1.aws.neon.tech.
-- Never execute on original staging/production. The endpoint must be verified by the caller.
-- Passwords are NULL: this tests transactional grant provisioning, NOT real LOGIN/SQL/HTTP acceptance.
-- Expected final exception proves all preceding assertions ran; entire transaction rolls back.
-- Connector: pass the statements between BEGIN/ROLLBACK as ONE run_sql_transaction array.
BEGIN;

DO $guard$ BEGIN
 IF current_database()<>'neondb' OR session_user<>'neondb_owner' OR current_user<>session_user
 OR (SELECT count(*) FROM drizzle.__drizzle_migrations)<>52
 OR (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1)<>'1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea'
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('field002_tenant_probe_20261104','field002_auth_probe_20261104'))
 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend')
 OR (SELECT count(*) FROM fawri_security.transaction_scopes)<>0
 THEN RAISE EXCEPTION 'FIELD002_ROLE_REHEARSAL_BASELINE_MISMATCH'; END IF;
END $guard$;

-- statement-breakpoint

CREATE ROLE field002_tenant_probe_20261104 LOGIN PASSWORD NULL NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 4;

-- statement-breakpoint

CREATE ROLE field002_auth_probe_20261104 LOGIN PASSWORD NULL NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 4;

-- statement-breakpoint

GRANT CONNECT ON DATABASE neondb TO field002_tenant_probe_20261104, field002_auth_probe_20261104;

-- statement-breakpoint

GRANT USAGE ON SCHEMA public,fawri_security TO field002_tenant_probe_20261104, field002_auth_probe_20261104;

-- statement-breakpoint

GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime(), fawri_security.issue_scope(name,integer,bigint,text) TO field002_auth_probe_20261104;

-- statement-breakpoint

GRANT SELECT ON public.notifications,public.subscriptions,public.subscription_reply_batches,public.support_inspection_requests TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT SELECT(id,account_id) ON public.merchants TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT INSERT ON public.notifications TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT UPDATE(read_at) ON public.notifications TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT UPDATE(expiry_reminder_sent_at,expired_notification_sent_at,updated_at) ON public.subscriptions TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT UPDATE(expiry_reminder_sent_at) ON public.subscription_reply_batches TO field002_tenant_probe_20261104;

-- statement-breakpoint

GRANT SELECT ON public.accounts,public.merchants TO field002_auth_probe_20261104;

-- statement-breakpoint

GRANT UPDATE(id) ON public.accounts TO field002_auth_probe_20261104;

-- statement-breakpoint

GRANT SELECT,INSERT,UPDATE ON public.account_sessions TO field002_auth_probe_20261104;

-- statement-breakpoint

DO $check$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM pg_roles WHERE rolname IN ('field002_tenant_probe_20261104','field002_auth_probe_20261104') LOOP
  IF NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit
   OR EXISTS(SELECT 1 FROM pg_roles p WHERE p.oid<>r.oid AND (pg_has_role(r.oid,p.oid,'SET') OR pg_has_role(r.oid,p.oid,'USAGE')))
   OR has_schema_privilege(r.oid,'public','CREATE') OR has_schema_privilege(r.oid,'fawri_security','CREATE')
   OR has_table_privilege(r.oid,'fawri_security.transaction_scopes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
   OR has_any_column_privilege(r.oid,'fawri_security.transaction_scopes','SELECT,INSERT,UPDATE,REFERENCES')
   OR has_table_privilege(r.oid,'public.database_admin_access_audits','SELECT,INSERT,UPDATE,DELETE')
   OR has_function_privilege(r.oid,'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'FIELD002_ROLE_REHEARSAL_UNSAFE_AUTHORITY'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('field002_tenant_probe_20261104','field002_auth_probe_20261104'))<>2
 OR has_function_privilege('field002_tenant_probe_20261104','public.fawri_authentication_runtime()','EXECUTE')
 OR has_function_privilege('field002_tenant_probe_20261104','fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
 OR NOT has_function_privilege('field002_tenant_probe_20261104','fawri_security.allows_merchant(text)','EXECUTE')
 OR NOT has_function_privilege('field002_auth_probe_20261104','public.fawri_authentication_runtime()','EXECUTE')
 OR NOT has_function_privilege('field002_auth_probe_20261104','fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
 OR has_table_privilege('field002_tenant_probe_20261104','public.accounts','INSERT,UPDATE,DELETE')
 OR has_column_privilege('field002_tenant_probe_20261104','public.accounts','password_hash','SELECT')
 OR has_column_privilege('field002_tenant_probe_20261104','public.accounts','metadata','SELECT')
 OR has_table_privilege('field002_tenant_probe_20261104','public.account_sessions','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('field002_tenant_probe_20261104','public.notifications','UPDATE,DELETE,TRUNCATE')
 OR NOT has_column_privilege('field002_tenant_probe_20261104','public.notifications','read_at','UPDATE')
 OR NOT has_table_privilege('field002_tenant_probe_20261104','public.notifications','SELECT')
 OR NOT has_table_privilege('field002_tenant_probe_20261104','public.notifications','INSERT')
 OR NOT has_table_privilege('field002_auth_probe_20261104','public.account_sessions','SELECT')
 OR NOT has_table_privilege('field002_auth_probe_20261104','public.account_sessions','INSERT')
 OR NOT has_table_privilege('field002_auth_probe_20261104','public.account_sessions','UPDATE')
 OR has_table_privilege('field002_auth_probe_20261104','public.account_sessions','DELETE')
 OR has_table_privilege('field002_auth_probe_20261104','public.notifications','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'FIELD002_ROLE_REHEARSAL_GRANT_MISMATCH'; END IF;
 RAISE EXCEPTION 'FIELD002_ROLE_REHEARSAL_ASSERTIONS_PASSED_EXPECTED_ROLLBACK';
END $check$;

ROLLBACK;
