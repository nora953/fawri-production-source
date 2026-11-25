-- HELD: G5 recovery metadata capture, PostgreSQL 18.
-- Requires separate owner authorization for one READ ONLY production catalog capture.
-- Run only with psql -X -qAt -v ON_ERROR_STOP=1 -v g5_capture_approved=1
-- on the explicitly verified direct commercial endpoint / fawri as fawri_owner.
-- Redirect stdout into a private mode-0600 file outside GitHub, then encrypt it.
-- Never log/upload the raw JSON to a public repo, CI or chat. No passwords, row data,
-- role verifiers, function bodies, policy expressions or connection URLs are selected.
-- This is a catalog inventory, NOT a role-creation/restore script or acceptance proof.
\set ON_ERROR_STOP on
\if :{?g5_capture_approved}
\else
  \set g5_capture_approved 0
\endif
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
-- Fail closed before the inventory if approval, login, database or known schema differs.
SELECT 1 / CASE WHEN :'g5_capture_approved' = '1'
  AND current_database() = 'fawri'
  AND current_user = 'fawri_owner' AND session_user = current_user
  AND current_setting('server_version_num')::int / 10000 = 18
  AND current_setting('transaction_read_only') = 'on'
  AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')) = 102
  AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relrowsecurity) = 84
  AND (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') = 83
  THEN 1 ELSE 0 END AS guard \gset
WITH app_ns AS (
  SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
), app_roles AS (
  SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
    rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil
  FROM pg_roles WHERE rolname ~ '^fawri_'
), rels AS (
  SELECT c.oid,n.nspname,c.relname,c.relkind,c.relowner,c.relacl,
    c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN app_ns n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','S','f','c','i','I')
)
SELECT jsonb_build_object(
  'format','fawri-g5-postg4-acl-catalog-v1',
  'database',current_database(),
  'captured_at',transaction_timestamp(),
  'server_major',18,
  'read_only',true,
  'roles',COALESCE((SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname) FROM app_roles r),'[]'::jsonb),
  'membership_edges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),
    'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,
    'inherit',m.inherit_option,'set',m.set_option) ORDER BY
    pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),pg_get_userbyid(m.grantor))
    FROM pg_auth_members m WHERE m.roleid IN (SELECT oid FROM app_roles)
       OR m.member IN (SELECT oid FROM app_roles)),'[]'::jsonb),
  'database_acl',(SELECT jsonb_build_object('owner',pg_get_userbyid(datdba),
    'acl',datacl::text) FROM pg_database WHERE datname=current_database()),
  'schemas',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',nspname,
    'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname)
    FROM app_ns),'[]'::jsonb),
  'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',nspname,
    'name',relname,'kind',relkind,'owner',pg_get_userbyid(relowner),
    'acl',relacl::text,'rls',relrowsecurity,'force_rls',relforcerowsecurity)
    ORDER BY nspname,relname) FROM rels),'[]'::jsonb),
  'column_acls',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,
    'relation',r.relname,'column',a.attname,'acl',a.attacl::text)
    ORDER BY r.nspname,r.relname,a.attnum) FROM rels r JOIN pg_attribute a
    ON a.attrelid=r.oid WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),'[]'::jsonb),
  'routines',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,
    'name',p.proname,'identity_args',pg_get_function_identity_arguments(p.oid),
    'owner',pg_get_userbyid(p.proowner),'kind',p.prokind,'acl',p.proacl::text,
    'security_definer',p.prosecdef) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN app_ns n ON n.oid=p.pronamespace),'[]'::jsonb),
  'types',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,
    'name',t.typname,'owner',pg_get_userbyid(t.typowner),'kind',t.typtype,
    'acl',t.typacl::text) ORDER BY n.nspname,t.typname)
    FROM pg_type t JOIN app_ns n ON n.oid=t.typnamespace),'[]'::jsonb),
  'default_acls',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'creator',pg_get_userbyid(d.defaclrole),'schema',n.nspname,
    'kind',d.defaclobjtype,'acl',d.defaclacl::text)
    ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype)
    FROM pg_default_acl d LEFT JOIN app_ns n ON n.oid=d.defaclnamespace
    WHERE d.defaclnamespace=0 OR n.oid IS NOT NULL),'[]'::jsonb),
  'policy_roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,
    'relation',r.relname,'policy',p.polname,'command',p.polcmd,
    'permissive',p.polpermissive,'roles',ARRAY(SELECT CASE WHEN x=0 THEN 'PUBLIC'
      ELSE pg_get_userbyid(x)::text END FROM unnest(p.polroles) x ORDER BY x))
    ORDER BY r.nspname,r.relname,p.polname)
    FROM pg_policy p JOIN rels r ON r.oid=p.polrelid),'[]'::jsonb),
  'extensions',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',e.extname,
    'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner))
    ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),'[]'::jsonb)
)::text;
ROLLBACK;
-- The actual archive must be paired by exact scope/time or proven unchanged ACL/catalog.
-- NULL ACL is not an empty ACL; preserve default semantics. Do not replay provider
-- internal role memberships/superuser grants. Recreate only reviewed Fawri roles
-- with fresh secrets on an isolated target, then compare ownership/ACL/RLS and
-- independently authenticate the tenant/auth/operator roles. Never restore to source.
