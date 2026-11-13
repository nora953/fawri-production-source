-- FAWRI V1 — P0-ACCESS-HOSTED-IDENTITY / P0-ACCESS-HOSTED-ROLLOUT
-- HELD SOURCE ONLY. Restrained catalog/order/inventory GRANT fragment.
-- NOT approved for Neon, migrations, production role creation or deployment.
-- Requires exact new project crimson-cherry-65705041 /
-- branch br-holy-waterfall-b993zglb / DB fawri, separately verified;
-- SQL alone cannot authenticate Neon provider project/branch identity.
-- Owner permission in chat covers ONE earlier read-only pg_roles SELECT ONLY.
--
-- Narrow source map:
-- postgresCatalogAuthorityCore (product/variant/image/idempotency/stock)
-- postgresLocationInventoryAuthority (locations, stock, movement)
-- postgresOrderOperationsAuthority (orders and items, scoped payment audit projection)
-- postgresOnlineOrderFulfillmentCommit (stock reconciliation)
-- postgresMerchantSettingsAuthority (delivery and settings)
-- postgresCommercePromotionAuthority (tenant RLS-protected promotion CRUD)
-- V1 merchant-region reads use a scoped owner-owned SECURITY DEFINER projection
-- of four fields with issuer-bound scope and same-transaction row locking.
-- No SELECT/UPDATE on merchants is granted to the tenant LOGIN.
-- Currency mutations require the SQL monetary-history guard too.
--
-- This is one V1 ONLINE MERCHANT DML fragment, NOT complete tenant GRANTs:
-- channel jobs, conversations, subscriptions, receipts/payment,
-- background worker capabilities, merchant-sensitive admin routes remain
-- outside this file until source-pinned review. POS/cashier is EXCLUDED.
-- No role creation, passwords, secret storage, migrations or backup.
-- No SELECT on auth secret tables, no financial reconciliation authority.
--
-- Postmigration RLS fingerprint + actual SQL/HTTP own/foreign tests are
-- mandatory additional gates. This file does NOT grant RLS bypass or imply GO.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

DO $v1_online_preimage$
DECLARE r oid; missing_table text;
BEGIN
  IF current_database() <> 'fawri'
     OR current_setting('server_version_num')::integer / 10000 <> 18
     OR session_user <> 'fawri_owner' OR current_user <> session_user
     OR to_regclass('drizzle.__drizzle_migrations') IS NULL
     OR to_regprocedure('fawri_security.allows_merchant(text)') IS NULL
     OR to_regprocedure('fawri_security.issue_scope(name,integer,bigint,text)') IS NULL
     OR to_regprocedure('public.fawri_authentication_runtime()') IS NULL
     OR to_regclass('public.merchants') IS NULL
     OR to_regprocedure('public.fawri_v1_scoped_merchant_region(text,boolean)') IS NOT NULL
     OR to_regprocedure('public.fawri_v1_update_scoped_merchant_currency(text,text)') IS NOT NULL
     OR to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)') IS NULL
  THEN RAISE EXCEPTION 'V1_ONLINE_TENANT_PREIMAGE_REJECTED'; END IF;
  SELECT oid INTO r FROM pg_catalog.pg_roles
   WHERE rolname='fawri_restricted_runtime' AND rolcanlogin
     AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb
       OR rolreplication OR rolinherit);
  IF r IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
      WHERE member=r) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relowner=r AND n.nspname='public' AND c.relkind IN ('r','p')
    )
  THEN RAISE EXCEPTION 'V1_ONLINE_TENANT_LOGIN_UNSAFE'; END IF;
  SELECT expected.name INTO missing_table FROM (
    VALUES ('products'),('product_variants'),('catalog_variant_options'),
      ('catalog_identifiers'),('catalog_image_references'),
      ('catalog_idempotency_keys'),('commerce_promotions'),('merchant_locations'),
      ('location_inventory_levels'),('inventory_mutations'),
      ('orders'),('order_items'),('order_payment_decisions'),
      ('order_terminal_decision_links'),('merchant_settings'),
      ('merchant_delivery_area_rates'),('merchant_location_delivery_areas')
  ) AS expected(name)
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
    AND c.relname=expected.name AND c.relkind IN ('r','p')
  WHERE c.oid IS NULL OR NOT c.relrowsecurity
    OR c.relowner=r
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
  LIMIT 1;
  IF missing_table IS NOT NULL THEN
    RAISE EXCEPTION 'V1_ONLINE_TENANT_RLS_REQUIRED';
  END IF;
END;
$v1_online_preimage$;

-- Trusted scope is granted to the tenant session, never to PUBLIC.
REVOKE ALL ON FUNCTION fawri_security.allows_merchant(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA public, fawri_security TO fawri_restricted_runtime;
GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text)
  TO fawri_restricted_runtime;

-- Catalog and stock are tenant RLS-protected. Product deletions use
-- application soft delete, while variant/identifier/image replacement needs
-- bounded DELETE. No TRUNCATE / TRIGGER / REFERENCES rights.
GRANT SELECT, INSERT, UPDATE ON
  public.products, public.product_variants,
  public.merchant_locations, public.location_inventory_levels,
  public.merchant_settings
TO fawri_restricted_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.catalog_variant_options, public.catalog_identifiers,
  public.catalog_image_references, public.catalog_idempotency_keys,
  public.merchant_delivery_area_rates, public.merchant_location_delivery_areas
TO fawri_restricted_runtime;
GRANT SELECT, INSERT, DELETE ON public.product_variants
  TO fawri_restricted_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_promotions
  TO fawri_restricted_runtime;
GRANT SELECT, INSERT ON public.inventory_mutations
  TO fawri_restricted_runtime;


-- Scoped merchant region projection for first-commercial merchant sessions:
-- four non-secret columns only, no raw/global merchants SELECT, no cross-tenant
-- enumeration. A genuine separately issued scope is REQUIRED for each call.
-- Optional FOR UPDATE is executed in the caller's SAME merchant transaction,
-- preserving promotions-versus-currency row locks.
CREATE FUNCTION public.fawri_v1_scoped_merchant_region(
  p_merchant_id text, p_lock boolean
)
RETURNS TABLE(id text, country_code text, timezone text, currency_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off
AS $v1_scoped_region$
BEGIN
  IF p_merchant_id IS NULL OR length(p_merchant_id) NOT BETWEEN 1 AND 200
     OR p_lock IS NULL
     OR session_user <> 'fawri_restricted_runtime'
     OR current_setting('transaction_isolation') <> 'read committed'
     OR NOT fawri_security.allows_merchant(p_merchant_id)
  THEN RAISE EXCEPTION 'V1_MERCHANT_REGION_SCOPE_REQUIRED'
       USING ERRCODE='42501'; END IF;
  IF p_lock THEN
    RETURN QUERY SELECT m.id::text, m.country_code::text,
      m.timezone::text, m.currency_code::text
      FROM public.merchants AS m WHERE m.id=p_merchant_id LIMIT 2 FOR UPDATE;
  ELSE
    RETURN QUERY SELECT m.id::text, m.country_code::text,
      m.timezone::text, m.currency_code::text
      FROM public.merchants AS m WHERE m.id=p_merchant_id LIMIT 2;
  END IF;
END;
$v1_scoped_region$;
REVOKE ALL ON FUNCTION public.fawri_v1_scoped_merchant_region(text,boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fawri_v1_scoped_merchant_region(text,boolean)
  TO fawri_restricted_runtime;


-- V1 currency update is a scope-verified, same-transaction owner function.
-- NEVER give the merchant tenant direct merchants table UPDATE permission.
-- A direct SQL caller must also pass all monetary history preconditions.
CREATE FUNCTION public.fawri_v1_update_scoped_merchant_currency(
  p_merchant_id text, p_currency_code text
)
RETURNS TABLE(id text, country_code text, timezone text, currency_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off
AS $v1_currency$
BEGIN
  IF p_merchant_id IS NULL OR length(p_merchant_id) NOT BETWEEN 1 AND 200
     OR p_currency_code IS NULL OR p_currency_code !~ '^[A-Z]{3}$'
     OR session_user <> 'fawri_restricted_runtime'
     OR current_setting('transaction_isolation') <> 'read committed'
     OR NOT fawri_security.allows_merchant(p_merchant_id)
  THEN RAISE EXCEPTION 'V1_MERCHANT_CURRENCY_SCOPE_REQUIRED'
       USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.merchants m
    WHERE m.id=p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V1_MERCHANT_CURRENCY_SCOPE_REQUIRED'
      USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.products p WHERE p.merchant_id=p_merchant_id)
     OR EXISTS(SELECT 1 FROM public.orders o WHERE o.merchant_id=p_merchant_id)
     OR EXISTS(SELECT 1 FROM public.commerce_promotions cp
       WHERE cp.merchant_id=p_merchant_id)
     OR EXISTS(SELECT 1 FROM public.merchant_settings ms
       WHERE ms.merchant_id=p_merchant_id
         AND (ms.delivery_fee_iqd<>0
          OR ms.free_delivery_threshold_iqd IS NOT NULL))
     OR EXISTS(SELECT 1 FROM public.merchant_delivery_area_rates rate
       WHERE rate.merchant_id=p_merchant_id)
  THEN RAISE EXCEPTION 'V1_MERCHANT_CURRENCY_MONETARY_GUARD'
       USING ERRCODE='23514'; END IF;
  RETURN QUERY UPDATE public.merchants m SET
     currency_code=p_currency_code,updated_at=clock_timestamp()
     WHERE m.id=p_merchant_id
     RETURNING m.id::text,m.country_code::text,
       m.timezone::text,m.currency_code::text;
END;
$v1_currency$;
REVOKE ALL ON FUNCTION public.fawri_v1_update_scoped_merchant_currency(text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fawri_v1_update_scoped_merchant_currency(text,text)
  TO fawri_restricted_runtime;

-- First-merchant online order acceptance and permitted order lifecycle.
GRANT SELECT, INSERT, UPDATE ON public.orders, public.order_items
  TO fawri_restricted_runtime;

-- Order list/detail ALWAYS invokes latestDecision() on these two tables.
-- Permit ONLY its explicitly projected columns under existing merchant RLS.
-- No whole-table SELECT, decision write, provider event, receipt or refund
-- access. Payment confirmation/rejection writes remain a separate held gate.
GRANT SELECT (merchant_id,order_id,decision_id)
  ON public.order_terminal_decision_links TO fawri_restricted_runtime;
GRANT SELECT (
  id,merchant_id,order_id,operation,payment_channel,outcome,
  confirmation_source,previous_order_status,resulting_order_status,
  previous_payment_status,resulting_payment_status,actor_type,
  actor_account_id,request_id,reason,expected_version,resulting_version,
  decided_at
) ON public.order_payment_decisions TO fawri_restricted_runtime;

DO $v1_online_postimage$
DECLARE r oid; bad_table text;
BEGIN
  SELECT oid INTO r FROM pg_catalog.pg_roles
    WHERE rolname='fawri_restricted_runtime' AND rolcanlogin
      AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb
        OR rolreplication OR rolinherit);
  IF r IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
       WHERE member=r)
    OR NOT has_function_privilege(r,
       'fawri_security.allows_merchant(text)','EXECUTE')
    OR has_function_privilege(r,
       'public.fawri_authentication_runtime()','EXECUTE')
    OR has_function_privilege(r,
       'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE')
    OR has_function_privilege(r,
       'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
    OR has_schema_privilege(r,'public','CREATE')
    OR has_schema_privilege(r,'fawri_security','CREATE')
    OR has_table_privilege(r,'public.merchants','SELECT,UPDATE')
    OR NOT has_function_privilege(r,
       'public.fawri_v1_update_scoped_merchant_currency(text,text)','EXECUTE')
    OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid=to_regprocedure(
          'public.fawri_v1_update_scoped_merchant_currency(text,text)')
         AND p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles
           WHERE rolname=session_user)
         AND 'search_path=pg_catalog'=ANY(p.proconfig)
         AND 'row_security=off'=ANY(p.proconfig)
    )
    OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p,
         LATERAL aclexplode(COALESCE(p.proacl,
           acldefault('f',p.proowner))) acl
       WHERE p.oid=to_regprocedure(
          'public.fawri_v1_update_scoped_merchant_currency(text,text)')
         AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
    OR NOT has_function_privilege(r,
       'public.fawri_v1_scoped_merchant_region(text,boolean)','EXECUTE')
    OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid=to_regprocedure(
          'public.fawri_v1_scoped_merchant_region(text,boolean)')
         AND p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles
           WHERE rolname=session_user)
         AND 'search_path=pg_catalog'=ANY(p.proconfig)
         AND 'row_security=off'=ANY(p.proconfig)
    )
    OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p,
         LATERAL aclexplode(COALESCE(p.proacl,
           acldefault('f',p.proowner))) acl
       WHERE p.oid=to_regprocedure(
          'public.fawri_v1_scoped_merchant_region(text,boolean)')
         AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
    OR has_table_privilege(r,'public.accounts',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.auth_otp_challenges',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.account_sessions',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.cashier_device_streams',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.verified_provider_payment_receipts',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.products','DELETE')
    OR has_table_privilege(r,'public.order_payment_decisions',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.order_terminal_decision_links',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_column_privilege(r,'public.order_payment_decisions',
       'actor_session_fingerprint','SELECT')
    OR has_column_privilege(r,'public.order_payment_decisions',
       'source_file','SELECT')
    OR has_column_privilege(r,'public.order_payment_decisions',
       'source_sha256','SELECT')
    OR has_table_privilege(r,'public.order_payment_provider_events',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.orders','DELETE')
    OR has_table_privilege(r,'public.order_items','DELETE')
    OR has_table_privilege(r,'public.inventory_mutations','UPDATE,DELETE')
    OR has_table_privilege(r,'public.merchant_settings','DELETE')
    OR has_table_privilege(r,'public.merchant_locations','DELETE')
    OR has_table_privilege(r,'public.location_inventory_levels','DELETE')
    OR has_table_privilege(r,'public.saas_billing_refunds',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
  THEN RAISE EXCEPTION 'V1_ONLINE_TENANT_POSTIMAGE_UNSAFE'; END IF;
  -- Fail-closed on missing minimum DML; an inadvertently revoked grant is
  -- NOT accepted merely because forbidden privileges remain absent.
  IF EXISTS (
    SELECT 1 FROM (
      VALUES
        ('products','SELECT,INSERT,UPDATE'),
        ('product_variants','SELECT,INSERT,UPDATE,DELETE'),
        ('merchant_locations','SELECT,INSERT,UPDATE'),
        ('location_inventory_levels','SELECT,INSERT,UPDATE'),
        ('merchant_settings','SELECT,INSERT,UPDATE'),
        ('catalog_variant_options','SELECT,INSERT,UPDATE,DELETE'),
        ('catalog_identifiers','SELECT,INSERT,UPDATE,DELETE'),
        ('catalog_image_references','SELECT,INSERT,UPDATE,DELETE'),
        ('catalog_idempotency_keys','SELECT,INSERT,UPDATE,DELETE'),
        ('commerce_promotions','SELECT,INSERT,UPDATE,DELETE'),
        ('merchant_delivery_area_rates','SELECT,INSERT,UPDATE,DELETE'),
        ('merchant_location_delivery_areas','SELECT,INSERT,UPDATE,DELETE'),
        ('inventory_mutations','SELECT,INSERT'),
        ('orders','SELECT,INSERT,UPDATE'),
        ('order_items','SELECT,INSERT,UPDATE')
    ) AS required(table_name, rights)
    CROSS JOIN LATERAL regexp_split_to_table(
      required.rights, ',') AS privilege(privilege_name)
    WHERE NOT has_table_privilege(r,
       ('public.' || quote_ident(required.table_name))::text,
       privilege.privilege_name)
  ) THEN RAISE EXCEPTION 'V1_ONLINE_TENANT_REQUIRED_DML_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('order_terminal_decision_links','merchant_id'),
      ('order_terminal_decision_links','order_id'),
      ('order_terminal_decision_links','decision_id'),
      ('order_payment_decisions','id'),
      ('order_payment_decisions','merchant_id'),
      ('order_payment_decisions','order_id'),
      ('order_payment_decisions','operation'),
      ('order_payment_decisions','payment_channel'),
      ('order_payment_decisions','outcome'),
      ('order_payment_decisions','confirmation_source'),
      ('order_payment_decisions','previous_order_status'),
      ('order_payment_decisions','resulting_order_status'),
      ('order_payment_decisions','previous_payment_status'),
      ('order_payment_decisions','resulting_payment_status'),
      ('order_payment_decisions','actor_type'),
      ('order_payment_decisions','actor_account_id'),
      ('order_payment_decisions','request_id'),
      ('order_payment_decisions','reason'),
      ('order_payment_decisions','expected_version'),
      ('order_payment_decisions','resulting_version'),
      ('order_payment_decisions','decided_at')
    ) AS required(table_name,column_name)
    WHERE NOT has_column_privilege(r,
      ('public.' || quote_ident(required.table_name))::text,
      required.column_name,'SELECT')
  ) THEN RAISE EXCEPTION 'V1_ONLINE_ORDER_DECISION_PROJECTED_READ_MISSING'; END IF;
  SELECT name INTO bad_table FROM (
    VALUES ('products'),('product_variants'),('catalog_variant_options'),
      ('catalog_identifiers'),('catalog_image_references'),
      ('catalog_idempotency_keys'),('commerce_promotions'),('merchant_locations'),
      ('location_inventory_levels'),('inventory_mutations'),
      ('orders'),('order_items'),('order_payment_decisions'),
      ('order_terminal_decision_links'),('merchant_settings'),
      ('merchant_delivery_area_rates'),('merchant_location_delivery_areas')
  ) AS expected(name)
  JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
    AND c.relname=expected.name AND c.relkind IN ('r','p')
  WHERE NOT c.relrowsecurity OR c.relowner=r
    OR has_table_privilege(r,c.oid,'TRUNCATE,TRIGGER,REFERENCES')
  LIMIT 1;
  IF bad_table IS NOT NULL THEN
    RAISE EXCEPTION 'V1_ONLINE_TENANT_RLS_OR_NONROW_PRIVILEGE_UNSAFE';
  END IF;
END;
$v1_online_postimage$;
COMMIT;
