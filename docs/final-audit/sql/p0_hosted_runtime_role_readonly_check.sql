-- P0 hosted runtime role verification — READ ONLY, one SELECT statement.
-- Run using the application's actual DATABASE_URL in a controlled operator session.
-- Do not paste or log the connection string. Record only the returned role names/booleans.
-- Expected: application role is not superuser, cannot create roles/databases, and does not BYPASSRLS.
-- Membership output identifies inherited roles that may expand effective privileges.
WITH current_role AS (
  SELECT r.oid, r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
         r.rolbypassrls, r.rolinherit, r.rolcanlogin
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user
), memberships AS (
  SELECT parent.rolname AS granted_role,
         m.admin_option,
         pg_catalog.pg_has_role(current_user, parent.oid, 'MEMBER') AS is_member,
         pg_catalog.pg_has_role(current_user, parent.oid, 'USAGE') AS privileges_inherited
  FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = m.member
  WHERE member.rolname = current_user
)
SELECT jsonb_build_object(
  'current_user', current_role.rolname,
  'session_user', session_user,
  'is_superuser', current_role.rolsuper,
  'can_create_database', current_role.rolcreatedb,
  'can_create_roles', current_role.rolcreaterole,
  'bypasses_row_level_security', current_role.rolbypassrls,
  'inherits_privileges', current_role.rolinherit,
  'can_login', current_role.rolcanlogin,
  'role_memberships', COALESCE((SELECT jsonb_agg(to_jsonb(memberships) ORDER BY granted_role) FROM memberships),'[]'::jsonb)
) AS runtime_role_audit
FROM current_role;
