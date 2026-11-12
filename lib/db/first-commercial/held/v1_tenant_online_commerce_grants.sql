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
-- postgresOrderOperationsAuthority (orders and items)
-- postgresOnlineOrderFulfillmentCommit (stock reconciliation)
-- postgresMerchantSettingsAuthority (delivery and settings)
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
      ('catalog_idempotency_keys'),('merchant_locations'),
      ('location_inventory_levels'),('inventory_mutations'),
      ('orders'),('order_items'),('merchant_settings'),
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
GRANT SELECT, INSERT ON public.inventory_mutations
  TO fawri_restricted_runtime;

-- First-merchant online order acceptance and permitted order lifecycle.
-- Financial decision/provider event/receipt tables intentionally excluded.
GRANT SELECT, INSERT, UPDATE ON public.orders, public.order_items
  TO fawri_restricted_runtime;

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
        ('merchant_delivery_area_rates','SELECT,INSERT,UPDATE,DELETE'),
        ('merchant_location_delivery_areas','SELECT,INSERT,UPDATE,DELETE'),
        ('inventory_mutations','SELECT,INSERT'),
        ('orders','SELECT,INSERT,UPDATE'),
        ('order_items','SELECT,INSERT,UPDATE')
    ) AS required(table_name, rights)
    WHERE NOT has_table_privilege(r,
       ('public.' || quote_ident(required.table_name))::text,
       required.rights)
  ) THEN RAISE EXCEPTION 'V1_ONLINE_TENANT_REQUIRED_DML_MISSING'; END IF;
  SELECT name INTO bad_table FROM (
    VALUES ('products'),('product_variants'),('catalog_variant_options'),
      ('catalog_identifiers'),('catalog_image_references'),
      ('catalog_idempotency_keys'),('merchant_locations'),
      ('location_inventory_levels'),('inventory_mutations'),
      ('orders'),('order_items'),('merchant_settings'),
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
