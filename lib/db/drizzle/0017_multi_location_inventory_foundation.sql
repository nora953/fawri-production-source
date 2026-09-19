CREATE TABLE "merchant_locations" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "name" text NOT NULL,
  "legacy_branch_key" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "operational_status" text DEFAULT 'open' NOT NULL,
  "online_fulfillment_enabled" boolean DEFAULT false NOT NULL,
  "accept_online_orders_while_closed" boolean DEFAULT false NOT NULL,
  "merchant_priority" integer DEFAULT 0 NOT NULL,
  "city" text,
  "area" text,
  "address" text,
  "latitude" double precision,
  "longitude" double precision,
  "inventory_fresh_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_locations_id_merchant_unique" UNIQUE("id","merchant_id"),
  CONSTRAINT "merchant_locations_name_check" CHECK (char_length("name") BETWEEN 1 AND 120),
  CONSTRAINT "merchant_locations_legacy_branch_key_check" CHECK ("legacy_branch_key" IS NULL OR char_length("legacy_branch_key") BETWEEN 1 AND 120),
  CONSTRAINT "merchant_locations_operational_status_check" CHECK ("operational_status" IN ('open','temporarily_unavailable','closed')),
  CONSTRAINT "merchant_locations_priority_check" CHECK ("merchant_priority" BETWEEN -1000000 AND 1000000),
  CONSTRAINT "merchant_locations_address_check" CHECK (("city" IS NULL OR char_length("city") <= 120) AND ("area" IS NULL OR char_length("area") <= 160) AND ("address" IS NULL OR char_length("address") <= 500)),
  CONSTRAINT "merchant_locations_coordinates_check" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)),
  CONSTRAINT "merchant_locations_timestamp_check" CHECK ("updated_at" >= "created_at" AND ("inventory_fresh_at" IS NULL OR "inventory_fresh_at" >= "created_at"))
);
--> statement-breakpoint
ALTER TABLE "merchant_locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD CONSTRAINT "merchant_locations_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_locations_merchant_legacy_branch_unique" ON "merchant_locations" USING btree ("merchant_id","legacy_branch_key") WHERE "legacy_branch_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_locations_merchant_default_unique" ON "merchant_locations" USING btree ("merchant_id") WHERE "is_default" = TRUE;
--> statement-breakpoint
CREATE INDEX "merchant_locations_merchant_status_idx" ON "merchant_locations" USING btree ("merchant_id","operational_status");
--> statement-breakpoint
CREATE INDEX "merchant_locations_routing_idx" ON "merchant_locations" USING btree ("merchant_id","online_fulfillment_enabled","operational_status","merchant_priority");
--> statement-breakpoint
CREATE TABLE "location_inventory_levels" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "location_id" text NOT NULL,
  "product_id" text NOT NULL,
  "variant_id" text,
  "quantity" integer DEFAULT 0 NOT NULL,
  "low_stock_threshold" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "location_inventory_levels_quantity_check" CHECK ("quantity" >= 0 AND "low_stock_threshold" >= 0),
  CONSTRAINT "location_inventory_levels_version_check" CHECK ("version" > 0),
  CONSTRAINT "location_inventory_levels_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_location_merchant_fk" FOREIGN KEY ("location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_product_merchant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_variant_tenant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "location_inventory_levels_product_level_unique" ON "location_inventory_levels" USING btree ("merchant_id","location_id","product_id") WHERE "variant_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "location_inventory_levels_variant_level_unique" ON "location_inventory_levels" USING btree ("merchant_id","location_id","product_id","variant_id") WHERE "variant_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "location_inventory_levels_location_product_idx" ON "location_inventory_levels" USING btree ("merchant_id","location_id","product_id");
--> statement-breakpoint
ALTER TABLE "merchant_cashier_stations" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_location_id" text;
--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "cashier_operation_attribution" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_stations" ADD CONSTRAINT "merchant_cashier_stations_location_merchant_fk" FOREIGN KEY ("location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_location_merchant_fk" FOREIGN KEY ("fulfillment_location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD CONSTRAINT "inventory_mutations_location_merchant_fk" FOREIGN KEY ("location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_operation_attribution" ADD CONSTRAINT "cashier_operation_attribution_location_merchant_fk" FOREIGN KEY ("location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_stations_merchant_location_idx" ON "merchant_cashier_stations" USING btree ("merchant_id","location_id","status");
--> statement-breakpoint
CREATE INDEX "orders_fulfillment_location_idx" ON "orders" USING btree ("merchant_id","fulfillment_location_id","created_at");
--> statement-breakpoint
CREATE INDEX "inventory_mutations_location_product_created_idx" ON "inventory_mutations" USING btree ("merchant_id","location_id","product_id","created_at");
--> statement-breakpoint
CREATE INDEX "cashier_operation_attribution_location_occurred_idx" ON "cashier_operation_attribution" USING btree ("merchant_id","location_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cashier_stations_offline_location_unique" ON "merchant_cashier_stations" USING btree ("merchant_id","location_id") WHERE "location_id" IS NOT NULL AND "offline_inventory_authority" = TRUE AND "status" = 'active';
--> statement-breakpoint
CREATE POLICY "merchant_locations_tenant_boundary" ON "merchant_locations" AS RESTRICTIVE FOR ALL TO public USING ((
  "merchant_locations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_locations"."merchant_id")
  )
)) WITH CHECK ((
  "merchant_locations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_locations"."merchant_id")
  )
));
--> statement-breakpoint
CREATE POLICY "location_inventory_levels_tenant_boundary" ON "location_inventory_levels" AS RESTRICTIVE FOR ALL TO public USING ((
  "location_inventory_levels"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "location_inventory_levels"."merchant_id")
  )
)) WITH CHECK ((
  "location_inventory_levels"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "location_inventory_levels"."merchant_id")
  )
));
--> statement-breakpoint
-- Preserve existing branch identities without assigning or splitting stock.
INSERT INTO "merchant_locations" (
  "id","merchant_id","name","legacy_branch_key","is_default",
  "operational_status","online_fulfillment_enabled",
  "accept_online_orders_while_closed","merchant_priority"
)
SELECT
  'location_' || md5(s."merchant_id" || '|branch|' || s."branch_key"),
  s."merchant_id",
  COALESCE(max(NULLIF(btrim(s."branch_label"), '')), NULLIF(btrim(s."branch_key"), ''), 'Main Location'),
  s."branch_key", FALSE, 'open', FALSE, FALSE, 0
FROM "merchant_cashier_stations" s
GROUP BY s."merchant_id", s."branch_key"
ON CONFLICT ("merchant_id","legacy_branch_key") WHERE "legacy_branch_key" IS NOT NULL DO NOTHING;
--> statement-breakpoint
-- Merchants with no cashier stations receive one fail-closed default cloud location.
INSERT INTO "merchant_locations" (
  "id","merchant_id","name","legacy_branch_key","is_default",
  "operational_status","online_fulfillment_enabled",
  "accept_online_orders_while_closed","merchant_priority"
)
SELECT
  'location_' || md5(m."id" || '|branch|main'),
  m."id", 'Main Location', 'main', TRUE, 'open', FALSE, FALSE, 0
FROM "merchants" m
WHERE NOT EXISTS (SELECT 1 FROM "merchant_locations" ml WHERE ml."merchant_id" = m."id");
--> statement-breakpoint
-- Infer a default only when the merchant has exactly one location.
WITH single_location_merchants AS (
  SELECT "merchant_id", min("id") AS "location_id"
  FROM "merchant_locations"
  GROUP BY "merchant_id"
  HAVING count(*) = 1
)
UPDATE "merchant_locations" ml
SET "is_default" = TRUE, "updated_at" = now()
FROM single_location_merchants s
WHERE ml."merchant_id" = s."merchant_id"
  AND ml."id" = s."location_id"
  AND ml."is_default" = FALSE;
--> statement-breakpoint
-- Current station mapping is deterministic from the existing branch key.
UPDATE "merchant_cashier_stations" s
SET "location_id" = ml."id", "updated_at" = now()
FROM "merchant_locations" ml
WHERE ml."merchant_id" = s."merchant_id"
  AND ml."legacy_branch_key" = s."branch_key"
  AND s."location_id" IS NULL;
--> statement-breakpoint
-- Only single-location merchants are safe to seed from legacy global stock.
-- Multi-location merchants intentionally receive no location inventory rows.
WITH single_location_merchants AS (
  SELECT "merchant_id", min("id") AS "location_id"
  FROM "merchant_locations"
  GROUP BY "merchant_id"
  HAVING count(*) = 1
)
INSERT INTO "location_inventory_levels" (
  "id","merchant_id","location_id","product_id","variant_id",
  "quantity","low_stock_threshold","version"
)
SELECT
  'location_inventory_' || md5(p."merchant_id" || '|' || s."location_id" || '|' || p."id" || '|product'),
  p."merchant_id", s."location_id", p."id", NULL,
  p."quantity", p."low_stock_threshold", 1
FROM "products" p
JOIN single_location_merchants s ON s."merchant_id" = p."merchant_id"
WHERE p."deleted_at" IS NULL
  AND lower(COALESCE(p."metadata"->'fawri_catalog_v2'->>'item_type', 'product')) <> 'service'
  AND lower(COALESCE(p."metadata"->'fawri_catalog_v2'->>'track_inventory', 'true')) NOT IN ('false','0')
  AND NOT EXISTS (
    SELECT 1 FROM "product_variants" v
    WHERE v."merchant_id" = p."merchant_id" AND v."product_id" = p."id"
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH single_location_merchants AS (
  SELECT "merchant_id", min("id") AS "location_id"
  FROM "merchant_locations"
  GROUP BY "merchant_id"
  HAVING count(*) = 1
)
INSERT INTO "location_inventory_levels" (
  "id","merchant_id","location_id","product_id","variant_id",
  "quantity","low_stock_threshold","version"
)
SELECT
  'location_inventory_' || md5(p."merchant_id" || '|' || s."location_id" || '|' || p."id" || '|' || v."id"),
  p."merchant_id", s."location_id", p."id", v."id",
  v."quantity", p."low_stock_threshold", 1
FROM "products" p
JOIN single_location_merchants s ON s."merchant_id" = p."merchant_id"
JOIN "product_variants" v
  ON v."merchant_id" = p."merchant_id" AND v."product_id" = p."id"
WHERE p."deleted_at" IS NULL
  AND lower(COALESCE(p."metadata"->'fawri_catalog_v2'->>'item_type', 'product')) <> 'service'
  AND lower(COALESCE(p."metadata"->'fawri_catalog_v2'->>'track_inventory', 'true')) NOT IN ('false','0')
ON CONFLICT DO NOTHING;
