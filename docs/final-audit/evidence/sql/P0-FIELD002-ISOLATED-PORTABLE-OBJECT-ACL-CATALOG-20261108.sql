-- FIELD002: SELECT-only normalized object owner + explicit ACL/policy digest.
-- Deliberately EXCLUDES PostgreSQL global role flags, memberships and secrets.
-- Omits ACL grantor identity (restore executor can differ) but retains grantee
-- and privilege letters; compare all five category digests exact before/after.
WITH rec AS (
SELECT 'relations' grp, n.nspname||'.'||c.relname||'|owner='||c.relowner::regrole::text||'|rls='||c.relrowsecurity||'|force='||c.relforcerowsecurity||'|acl='||coalesce((SELECT string_agg(split_part(e::text,'/',1),',' ORDER BY split_part(e::text,'/',1)) FROM unnest(c.relacl) e),'(null)') AS val
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','drizzle','fawri_security') AND c.relkind IN ('r','p','S','v','m')
UNION ALL SELECT 'routines',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|owner='||p.proowner::regrole::text||'|definer='||p.prosecdef||'|strict='||p.proisstrict||'|body='||md5(p.prosrc)||'|config='||coalesce(array_to_string(p.proconfig,','),'(null)')||'|acl='||coalesce((SELECT string_agg(split_part(e::text,'/',1),',' ORDER BY split_part(e::text,'/',1)) FROM unnest(p.proacl) e),'(null)')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','drizzle','fawri_security') AND p.prokind IN('f','p')
UNION ALL SELECT 'schemas',n.nspname||'|owner='||n.nspowner::regrole::text||'|acl='||coalesce((SELECT string_agg(split_part(e::text,'/',1),',' ORDER BY split_part(e::text,'/',1)) FROM unnest(n.nspacl) e),'(null)')
FROM pg_namespace n WHERE n.nspname IN('public','drizzle','fawri_security')
UNION ALL SELECT 'default_acl',d.defaclrole::regrole::text||'|'||coalesce(n.nspname,'GLOBAL')||'|'||d.defaclobjtype::text||'|'||coalesce((SELECT string_agg(split_part(e::text,'/',1),',' ORDER BY split_part(e::text,'/',1)) FROM unnest(d.defaclacl) e),'(null)')
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN('public','drizzle','fawri_security') OR d.defaclnamespace=0 AND d.defaclrole IN(SELECT oid FROM pg_roles WHERE rolname LIKE 'fawri_%' OR rolname='neondb_owner')
UNION ALL SELECT 'policies',to_jsonb(pol)::text FROM (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN('public','drizzle','fawri_security')) pol
)
SELECT grp,count(*)::int n,md5(string_agg(val,E'\n' ORDER BY val)) digest FROM rec GROUP BY grp ORDER BY grp;
