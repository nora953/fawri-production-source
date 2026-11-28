-- FIELD002 / original staging: reviewable *metadata-only* global role/catalog inventory.
-- SOURCE-ONLY; NOT EXECUTED. Always validate Neon project/branch and direct host
-- OUTSIDE SQL; database SQL cannot prove the Neon branch identity.
-- Exact intended source: project round-fire-18493605,
-- nondefault staging br-falling-dust-b1km4gix, database neondb,
-- session_user=neondb_owner. NEVER run on default production.
-- SELECT only. No pg_authid, pg_shadow, role password hashes, connection URLs,
-- merchant data, pg_dumpall, credentials, CREATE ROLE or GRANT.
-- Output is grouped counts and deterministic fingerprints, not full role
-- recreations. This cannot itself prove complete global-role backup/restore.
-- PostgreSQL 18: role membership options inherit_option and set_option exist.
WITH
roles AS (
  SELECT r.oid, r.rolname,
    concat_ws('|', r.rolname, r.rolcanlogin::text, r.rolsuper::text,
      r.rolinherit::text, r.rolcreaterole::text, r.rolcreatedb::text,
      r.rolbypassrls::text, r.rolreplication::text, r.rolconnlimit::text,
      COALESCE(r.rolvaliduntil::text, '(null)')) AS record
  FROM pg_roles r
  WHERE r.rolname IN (
    'neondb_owner', 'fawri_staging_runtime', 'fawri_staging_rls_runtime',
    'fawri_field002_tenant_probe', 'fawri_field002_auth_probe',
    'fawri_field002_operator_probe'
  ) OR left(r.rolname, 15) = 'fawri_field002_'
),
memberships AS (
  SELECT concat_ws('|',
    member.rolname, role.rolname, grantor.rolname,
    m.admin_option::text, m.inherit_option::text, m.set_option::text) AS record
  FROM pg_auth_members m
  JOIN pg_roles member ON member.oid = m.member
  JOIN pg_roles role ON role.oid = m.roleid
  JOIN pg_roles grantor ON grantor.oid = m.grantor
  WHERE member.rolname IN (SELECT rolname FROM roles)
     OR role.rolname IN (SELECT rolname FROM roles)
),
database_grants AS (
  SELECT concat_ws('|', d.datname, d.datdba::regrole::text,
      COALESCE((
        SELECT string_agg(
          split_part(grant_entry::text, '/', 1), ',' ORDER BY
            split_part(grant_entry::text, '/', 1))
        FROM unnest(COALESCE(d.datacl, acldefault('d', d.datdba)))
          AS grants(grant_entry)
      ), '(null)')) AS record
  FROM pg_database d WHERE d.datname = 'neondb'
),
records AS (
  SELECT 'role_flags'::text AS category, record FROM roles
  UNION ALL
  SELECT 'memberships', record FROM memberships
  UNION ALL
  SELECT 'database_grants', record FROM database_grants
),
groups AS (
  SELECT category, COUNT(*)::integer AS item_count,
    md5(COALESCE(string_agg(record, E'\n' ORDER BY record), '')) AS digest
  FROM records GROUP BY category
)
SELECT required.category, COALESCE(g.item_count, 0) AS item_count,
       COALESCE(g.digest, md5('')) AS digest
FROM (VALUES ('role_flags'), ('memberships'), ('database_grants'))
  AS required(category)
LEFT JOIN groups g USING(category)
WHERE current_database() = 'neondb'
  AND session_user = 'neondb_owner'
  AND (SELECT COUNT(*) FROM drizzle.__drizzle_migrations) = 28
ORDER BY required.category;
