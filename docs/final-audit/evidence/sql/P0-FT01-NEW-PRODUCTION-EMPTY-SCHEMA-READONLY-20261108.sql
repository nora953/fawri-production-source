-- FT-01: FIRST COMMERCIAL PRODUCTION PREP — NEW PROJECT / READ ONLY.
-- Intended only for independently confirmed Neon project
--   crimson-cherry-65705041
-- branch name "production", ID br-holy-waterfall-b993zglb
-- database "fawri", PostgreSQL 18, Frankfurt.
-- This SQL cannot identify a Neon project or branch ID. CONFIRM BOTH IN
-- NEON CONSOLE (or independent provider metadata) BEFORE running the query.
-- Do NOT run on old round-fire-18493605, on old original staging, or on
-- any other production database. No table contents, passwords or secrets.
-- SELECT-only, no transactions/locks, DDL, GRANT, INSERT, migrations or upload.
--
-- Before any schema migrations the fresh independent target should have
-- zero application relations (including hidden schemas). Unexpected installed
-- extension/provider relations may cause NOT_ACCEPTED and demand review.
WITH user_relations AS (
  SELECT n.nspname AS schema_name,
         c.relname AS relation_name,
         c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND n.nspname NOT LIKE 'pg_toast_temp_%'
    AND c.relkind IN ('r','p','v','m','f','S')
), counts AS (
  SELECT COUNT(*)::integer AS user_relations,
         COUNT(*) FILTER (WHERE relkind IN ('r','p','m','f'))::integer AS
           user_data_relations,
         COUNT(*) FILTER (WHERE schema_name = 'public')::integer AS
           public_relations
  FROM user_relations
)
SELECT current_database() AS database_name,
       current_setting('server_version_num')::integer / 10000
         AS postgres_major,
       session_user AS session_role_name,
       c.user_relations,
       c.user_data_relations,
       c.public_relations,
       (to_regclass('drizzle.__drizzle_migrations') IS NOT NULL)
         AS drizzle_ledger_exists,
       CASE WHEN current_database() = 'fawri'
                  AND current_setting('server_version_num')::integer
                      BETWEEN 180000 AND 189999
                  AND c.user_relations = 0
                  AND to_regclass('drizzle.__drizzle_migrations') IS NULL
            THEN 'EMPTY_SCHEMA_PRE_MIGRATION_CANDIDATE'
            ELSE 'NOT_ACCEPTED'
        END AS pre_migration_readonly_decision
FROM counts c;
