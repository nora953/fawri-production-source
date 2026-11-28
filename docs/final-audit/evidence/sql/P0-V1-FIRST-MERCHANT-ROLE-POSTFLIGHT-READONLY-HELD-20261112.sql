-- P0-ACCESS-HOSTED-IDENTITY. V1 role capabilities POST-MIGRATION evidence ONLY.
-- HELD: NOT authorized for hosted execution on selected Neon target.
-- New target: project crimson-cherry-65705041,
-- branch br-holy-waterfall-b993zglb, database fawri, PostgreSQL 18.
-- SQL alone CANNOT prove Neon project/branch or pool/direct endpoint identity.
-- Owner permission 2026-11-12 covered ONE earlier roles-absence SELECT only.
-- This new SELECT must NOT be run on Neon without separate owner authorization.
-- No SQL writes, customer row access, role mutations, grants or passwords.
-- Assumes reviewed migration source and API security functions were first
-- deployed under separate authorization; missing functions FAIL CLOSED.
-- PROVISIONAL PROFILE only; NOT full app grants, real LOGIN, RLS, E2E or GO.
WITH expected (role_name, profile) AS (
  VALUES
    ('fawri_restricted_runtime'::name, 'tenant'::text),
    ('fawri_auth_issuer'::name, 'auth'::text),
    ('fawri_operator_issuer'::name, 'operator'::text)
),
observed AS (
  SELECT
    e.role_name::text AS role_name,
    e.profile,
    (r.oid IS NOT NULL) AS role_exists,
    COALESCE(r.rolcanlogin, false) AS can_login,
    COALESCE(r.rolinherit, false) AS inherits_roles,
    COALESCE(r.rolsuper, false) AS is_superuser,
    COALESCE(r.rolbypassrls, false) AS bypasses_rls,
    COALESCE(r.rolcreaterole, false) AS can_create_roles,
    COALESCE(r.rolcreatedb, false) AS can_create_databases,
    COALESCE(r.rolreplication, false) AS can_replicate,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members m
      WHERE m.member = r.oid
    ) AS has_granted_role_membership,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relowner = r.oid AND n.nspname NOT IN
        ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp_%'
    ) AS owns_application_relations,
    COALESCE(has_schema_privilege(r.oid, 'public', 'CREATE'), false)
      AS can_create_in_public,
    COALESCE(has_schema_privilege(r.oid, 'fawri_security', 'CREATE'), false)
      AS can_create_in_security,
    COALESCE(has_schema_privilege(r.oid, 'fawri_security', 'USAGE'), false)
      AS security_schema_usage,
    COALESCE(has_function_privilege(r.oid,
      to_regprocedure('fawri_security.allows_merchant(text)'), 'EXECUTE'),
      false) AS tenant_scope_execute,
    COALESCE(has_function_privilege(r.oid,
      to_regprocedure('public.fawri_authentication_runtime()'), 'EXECUTE'),
      false) AS auth_marker_execute,
    COALESCE(has_function_privilege(r.oid,
      to_regprocedure('fawri_security.issue_scope(name,integer,bigint,text)'),
      'EXECUTE'), false) AS auth_scope_issuer_execute,
    COALESCE(has_function_privilege(r.oid,
      to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)'),
      'EXECUTE'), false) AS operator_directory_execute,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
        AND c.relname IN (
          'notifications', 'order_drafts', 'merchant_admin_notes',
          'merchant_deletion_requests', 'support_inspection_requests'
        )
        AND (
          has_table_privilege(r.oid, c.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          OR has_any_column_privilege(r.oid, c.oid,
            'SELECT,INSERT,UPDATE,REFERENCES')
        )
    ) AS can_directly_reach_tenant_sensitive_rows
  FROM expected e
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = e.role_name
),
admission AS (
  SELECT o.*,
    (
      o.role_exists
      AND o.can_login
      AND NOT (
        o.inherits_roles OR o.is_superuser OR o.bypasses_rls
        OR o.can_create_roles OR o.can_create_databases OR o.can_replicate
        OR o.has_granted_role_membership OR o.owns_application_relations
        OR o.can_create_in_public OR o.can_create_in_security
      )
      AND CASE o.profile
        WHEN 'tenant' THEN
          o.security_schema_usage AND o.tenant_scope_execute
          AND NOT (
            o.auth_marker_execute OR o.auth_scope_issuer_execute
            OR o.operator_directory_execute
          )
        WHEN 'auth' THEN
          o.security_schema_usage AND o.auth_marker_execute
          AND o.auth_scope_issuer_execute
          AND NOT (
            o.operator_directory_execute
            OR o.can_directly_reach_tenant_sensitive_rows
          )
        WHEN 'operator' THEN
          o.operator_directory_execute
          AND NOT (
            o.security_schema_usage OR o.tenant_scope_execute
            OR o.auth_marker_execute OR o.auth_scope_issuer_execute
            OR o.can_directly_reach_tenant_sensitive_rows
          )
        ELSE false
      END
    ) AS preliminary_role_profile_pass
  FROM observed o
)
SELECT
  current_database() AS observed_database_name,
  current_setting('server_version_num')::integer / 10000
    AS observed_postgres_major,
  role_name, profile, role_exists, can_login, inherits_roles,
  is_superuser, bypasses_rls, can_create_roles, can_create_databases,
  can_replicate, has_granted_role_membership,
  owns_application_relations, can_create_in_public, can_create_in_security,
  security_schema_usage, tenant_scope_execute, auth_marker_execute,
  auth_scope_issuer_execute, operator_directory_execute,
  can_directly_reach_tenant_sensitive_rows,
  preliminary_role_profile_pass
FROM admission
ORDER BY role_name;
