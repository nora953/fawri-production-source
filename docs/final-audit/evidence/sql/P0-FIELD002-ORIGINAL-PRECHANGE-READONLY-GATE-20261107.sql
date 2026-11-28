-- FIELD002 ORIGINAL PRECHANGE CHECK — ABSOLUTELY READ-ONLY
-- Pin Neon connector: project round-fire-18493605,
-- branch br-falling-dust-b1km4gix (staging-runtime), database neondb.
-- Independent rollback baseline: br-royal-fog-b1v7pdmr
-- THIS SQL CANNOT VERIFY THE NEON BRANCH ID FROM WITHIN POSTGRESQL.
-- Never run this on default Neon production br-shiny-lab-b1vxj4wn.
-- A matching query result is NOT approval for an original write, deploy or migration.
-- If original EXECUTE default grants differ from the pinned 2, diagnose ACL drift.
-- Even a measured 0 is NOT a write approval: investigate provenance and effective
-- function permissions, including PostgreSQL's implicit PUBLIC EXECUTE defaults.
-- Migration 0052 remains FORBIDDEN pending separate owner/bootstrap authorization.

WITH
migrations AS (
  SELECT count(*)::integer AS applied,
         (SELECT hash FROM drizzle.__drizzle_migrations
           ORDER BY id DESC LIMIT 1) AS latest_hash
  FROM drizzle.__drizzle_migrations
),
residuals AS (
  SELECT count(*)::integer AS present,
         count(*) FILTER (WHERE c.relrowsecurity)::integer AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname IN (
      'audit_events','manual_reply_requests','merchant_admin_notes',
      'merchant_channel_overrides','merchant_deletion_requests',
      'notifications','order_drafts','processed_channel_events')
),
residual_policies AS (
  SELECT count(*)::integer AS policy_count
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (
      'audit_events','manual_reply_requests','merchant_admin_notes',
      'merchant_channel_overrides','merchant_deletion_requests',
      'notifications','order_drafts','processed_channel_events')
),
legacy_defaults AS (
  SELECT count(*)::integer AS unsafe_function_exec_count
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole='neondb_owner'::regrole AND n.nspname='public'
    AND d.defaclobjtype='f' AND a.privilege_type='EXECUTE'
    AND a.grantee::regrole::text IN (
      'fawri_staging_runtime','fawri_staging_rls_runtime')
),
roles AS (
  SELECT count(*) FILTER (
    WHERE rolname='fawri_staging_runtime'
      AND rolcanlogin AND rolbypassrls AND rolcreaterole
      AND rolcreatedb AND rolinherit
  )::integer AS unsafe_legacy_login_count,
  count(*) FILTER (
    WHERE rolname='fawri_staging_rls_runtime'
      AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolinherit
  )::integer AS nonlogin_legacy_runtime_count,
  count(*) FILTER (WHERE rolname LIKE 'fawri_field002_%')::integer AS field002_test_roles
  FROM pg_roles
),
legacy_members AS (
  SELECT count(*)::integer AS direct_memberships
  FROM pg_auth_members
  WHERE member=(SELECT oid FROM pg_roles
                WHERE rolname='fawri_staging_runtime')
),
activity AS (
  SELECT count(*)::integer AS other_client_sessions
  FROM pg_stat_activity
  WHERE datname=current_database() AND pid<>pg_backend_pid()
    AND backend_type='client backend'
),
data_baseline AS (
  SELECT (SELECT count(*) FROM public.notifications)::integer AS notifications,
         (SELECT count(*) FROM public.audit_events)::integer AS audit_events,
         (SELECT count(*) FROM public.merchants)::integer AS merchants
),
truth AS (
  SELECT current_database()::text AS database_name,
         session_user::text AS authenticated_user,
         current_user::text AS effective_user,
         m.applied,m.latest_hash,
         residuals.present AS residual_tables,
         residuals.rls_enabled,
         residual_policies.policy_count,
         legacy_defaults.unsafe_function_exec_count,
         roles.unsafe_legacy_login_count,
         roles.nonlogin_legacy_runtime_count,
         roles.field002_test_roles,
         legacy_members.direct_memberships,
         activity.other_client_sessions,
         data_baseline.notifications,
         data_baseline.audit_events,
         data_baseline.merchants,
         (
           current_database()='neondb'
           AND session_user='neondb_owner' AND current_user='neondb_owner'
           AND m.applied=28
           AND m.latest_hash='87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f'
           AND residuals.present=8 AND residuals.rls_enabled=0
           AND residual_policies.policy_count=0
           AND legacy_defaults.unsafe_function_exec_count=2
           AND roles.unsafe_legacy_login_count=1
           AND roles.nonlogin_legacy_runtime_count=1
           AND roles.field002_test_roles=0
           AND legacy_members.direct_memberships=2
           AND activity.other_client_sessions=0
           AND data_baseline.notifications=0
           AND data_baseline.audit_events=283
           AND data_baseline.merchants=1
           AND to_regprocedure('public.fawri_authentication_runtime()') IS NULL
           AND to_regprocedure(
             'public.fawri_issue_admin_directory_audit(text,text,text)'
           ) IS NULL
         ) AS matches_exact_prechange_catalog
  FROM migrations m CROSS JOIN residuals
  CROSS JOIN residual_policies CROSS JOIN legacy_defaults
  CROSS JOIN roles CROSS JOIN legacy_members
  CROSS JOIN activity CROSS JOIN data_baseline
)
SELECT *,
       CASE WHEN matches_exact_prechange_catalog THEN
         'SOURCE_READONLY_BASELINE_MATCH_NOT_A_WRITE_APPROVAL'
       WHEN unsafe_function_exec_count<>2 THEN
         'FAIL_CLOSED_DEFAULT_FUNCTION_EXECUTE_ACL_DRIFT'
       ELSE
         'FAIL_CLOSED_SOURCE_OR_ISOLATION_DRIFT'
       END AS prechange_status,
       false AS authorized_to_write_original,
       'FIELD002_OPEN_NO_GO_0052_BLOCKED'::text AS commercial_gate
FROM truth;
