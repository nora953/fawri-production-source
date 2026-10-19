-- P0 / migration 0034 hosted schema verification: READ ONLY, single SELECT.
-- Execute on an approved read-only connection; do not disclose connection credentials.
-- Expected AFTER migration 0034: both triggers enabled, function SECURITY DEFINER,
-- search_path=pg_catalog, row_security=off, and no PUBLIC EXECUTE grant.
-- BEFORE migration 0034 this query is diagnostic only; it must not activate anything.
WITH expected(table_name, trigger_name) AS (
  VALUES ('saas_billing_orders'::text,'fawri_saas_provider_identity_guard'::text),
         ('cashier_billing_orders'::text,'fawri_cashier_provider_identity_guard'::text)
), triggers AS (
  SELECT e.table_name, e.trigger_name,
         c.oid IS NOT NULL AS table_exists,
         t.oid IS NOT NULL AS trigger_exists,
         t.tgenabled AS trigger_enabled,
         pg_catalog.pg_get_triggerdef(t.oid) AS trigger_definition
  FROM expected e
  LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.'||e.table_name)
  LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid
    AND t.tgname=e.trigger_name AND NOT t.tgisinternal
), guard AS (
  SELECT p.oid, p.prosecdef, p.proconfig,
         pg_catalog.has_function_privilege('public',p.oid,'EXECUTE') AS public_can_execute
  FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure('public.fawri_guard_provider_order_identity()')
)
SELECT pg_catalog.jsonb_build_object(
  'database',current_database(),
  'connected_role',current_user,
  'triggers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.table_name) FROM triggers t),'[]'::jsonb),
  'guard_exists',EXISTS(SELECT 1 FROM guard),
  'guard_security_definer',(SELECT prosecdef FROM guard),
  'guard_settings',(SELECT proconfig FROM guard),
  'guard_public_execute',(SELECT public_can_execute FROM guard)
) AS p0_schema_evidence;
