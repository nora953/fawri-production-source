-- FT-01: dedicated new first-commercial Neon project ROLE PROVISIONING
-- READ-ONLY preflight. No CREATE/ALTER ROLE, DDL, grants, passwords or data.
-- Only for owner-selected Neon project crimson-cherry-65705041,
-- branch ID br-holy-waterfall-b993zglb, database fawri, PostgreSQL 18.
-- SQL itself cannot identify a Neon project/branch; pair with the UI.
-- Never run against old round-fire-18493605 or default/staging in that project.
-- It is NOT an approval to provision roles, migrate, or deploy anything.
WITH candidate_roles AS (
  SELECT unnest(ARRAY[
    'fawri_restricted_runtime',
    'fawri_auth_issuer',
    'fawri_operator_issuer'
  ]::text[]) AS role_name
), authenticated_owner AS (
  SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole,
         rolcreatedb, rolinherit, rolreplication
  FROM pg_catalog.pg_roles
  WHERE rolname = session_user
), candidate_inventory AS (
  SELECT c.role_name, (r.oid IS NOT NULL) AS already_exists,
         COALESCE(r.rolcanlogin, false) AS can_login,
         COALESCE(r.rolbypassrls, false) AS bypass_rls,
         COALESCE(r.rolcreaterole, false) AS can_create_roles
  FROM candidate_roles c
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = c.role_name
), summary AS (
  SELECT count(*) FILTER (WHERE already_exists)::int AS existing_candidate_roles,
         count(*) FILTER (WHERE bypass_rls OR can_create_roles)::int
           AS elevated_candidate_roles
  FROM candidate_inventory
), user_schema_state AS (
  SELECT count(*)::int AS user_relations
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
     AND n.nspname NOT LIKE 'pg_toast%'
     AND n.nspname NOT LIKE 'pg_temp_%'
     AND n.nspname NOT LIKE 'pg_toast_temp_%'
     AND c.relkind IN ('r','p','v','m','f','S')
)
SELECT current_database() AS database_name,
       current_setting('server_version_num')::int / 10000 AS postgres_major,
       session_user AS session_role_name,
       current_user AS current_role_name,
       o.rolcanlogin AS owner_can_login,
       o.rolcreaterole AS owner_can_create_roles,
       o.rolsuper AS owner_superuser,
       o.rolbypassrls AS owner_bypass_rls,
       o.rolcreatedb AS owner_can_create_databases,
       o.rolreplication AS owner_replication,
       (SELECT count(*)::int
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p','m','f'))
         AS public_data_relations,
       (to_regclass('drizzle.__drizzle_migrations') IS NOT NULL)
         AS drizzle_ledger_exists,
       u.user_relations,
       s.existing_candidate_roles,
       s.elevated_candidate_roles,
       CASE
         WHEN current_database() <> 'fawri'
           OR current_setting('server_version_num')::int / 10000 <> 18
           OR session_user <> 'fawri_owner'
           OR current_user <> session_user
         THEN 'WRONG_DATABASE_OR_ROLE_REFUSE'
         WHEN u.user_relations <> 0
         THEN 'SCHEMA_CHANGED_REQUIRES_NEW_EMPTY_PREFLIGHT'
         WHEN o.rolcreaterole IS DISTINCT FROM true
         THEN 'ROLE_CREATION_NOT_CONFIRMED_USE_APPROVED_PROVIDER_ADMIN_PATH'
         WHEN s.existing_candidate_roles <> 0
         THEN 'EXISTING_APPLICATION_ROLES_REQUIRE_MANUAL_REVIEW'
         WHEN to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
         THEN 'MIGRATION_STATE_CHANGED_REVIEW'
         ELSE 'READONLY_ROLE_CREATION_FEASIBILITY_CANDIDATE'
       END AS readonly_role_provisioning_decision
FROM authenticated_owner o CROSS JOIN summary s CROSS JOIN user_schema_state u;
-- The result reports role-creation feasibility, not actual capability to
-- provision safe grants, owner ACLs, schema migration or authenticating users.
-- The absence of o rows is NOT acceptance; return exactly one explicit row.
