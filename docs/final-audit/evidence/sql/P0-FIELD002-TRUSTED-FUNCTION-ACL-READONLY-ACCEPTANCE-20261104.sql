-- P0 FIELD002. READ-ONLY introspection. Run separately against original
-- staging-runtime and the isolated Neon rehearsal; do not use a write pool.
-- Returns only role names, booleans and aggregate counts. Does not read
-- notification, customer, merchant, ticket, credential or message contents.
-- The presence of a function or table RLS policies does not prove HTTP
-- tenant isolation. Never use this SELECT as approval to activate LOGIN.
WITH expected(tag, signature) AS (
  VALUES
    ('0038_role_bound_admin_directory_issuer'::text,
     'public.fawri_issue_admin_directory_audit(text,text,text)'::text),
    ('0039_role_bound_authentication_runtime'::text,
     'public.fawri_authentication_runtime()'::text)
), functions AS (
  SELECT tag, signature,
         to_regprocedure(signature) AS function_oid
  FROM expected
), status AS (
 SELECT f.tag, f.signature,
        (f.function_oid IS NOT NULL) AS function_present,
        ARRAY(
          SELECT runtime_role.rolname::text
          FROM pg_roles runtime_role
          WHERE runtime_role.rolname IN
            ('fawri_staging_rls_runtime','fawri_staging_runtime')
            AND f.function_oid IS NOT NULL
            AND COALESCE(has_function_privilege(runtime_role.oid,
              f.function_oid, 'EXECUTE'), false)
          ORDER BY runtime_role.rolname
        ) AS legacy_runtime_execute,
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          CROSS JOIN LATERAL aclexplode(COALESCE(
            function_definition.proacl,
            acldefault('f', function_definition.proowner))) acl
          WHERE function_definition.oid = f.function_oid
            AND acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        ) AS public_execute
 FROM functions f
)
SELECT status.tag,
       status.function_present,
       status.legacy_runtime_execute,
       status.public_execute,
       (SELECT count(*)::int
          FROM pg_default_acl d
          CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
         WHERE d.defaclrole =
               (SELECT oid FROM pg_roles WHERE rolname = 'neondb_owner')
           AND d.defaclobjtype = 'f'
           AND (d.defaclnamespace=0 OR
                d.defaclnamespace='public'::regnamespace)
           AND acl.privilege_type='EXECUTE'
           AND acl.grantee<>d.defaclrole
       ) AS nonowner_default_function_execute_grants,
       status.function_present
       AND cardinality(status.legacy_runtime_execute)=0
       AND NOT status.public_execute
         AS post_migration_acl_pass
FROM status ORDER BY status.tag;
