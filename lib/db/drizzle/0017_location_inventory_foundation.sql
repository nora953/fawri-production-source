CREATE TABLE "merchant_locations" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "operational_status" text DEFAULT 'open' NOT NULL,
  "city" text,
  "area" text,
  "address" text,
  "service_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "online_fulfillment_enabled" boolean DEFAULT true NOT NULL,
  "accept_online_orders_when_closed" boolean DEFAULT true NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_locations_id_merchant_unique" UNIQUE("id","merchant_id"),
  CONSTRAINT "merchant_locations_identity_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "merchant_locations_status_check" CHECK ("status" IN ('active','disabled')),
  CONSTRAINT "merchant_locations_operational_status_check" CHECK ("operational_status" IN ('open','temporarily_unavailable','closed')),
  CONSTRAINT "merchant_locations_service_areas_check" CHECK (jsonb_typeof("service_areas") = 'array' AND jsonb_array_length("service_areas") <= 100),
  CONSTRAINT "merchant_locations_coordinate_pair_check" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)),
  CONSTRAINT "merchant_locations_version_check" CHECK ("version" > 0),
  CONSTRAINT "merchant_locations_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD CONSTRAINT "merchant_locations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_locations_default_unique" ON "merchant_locations" USING btree ("merchant_id") WHERE "is_default" = TRUE;
--> statement-breakpoint
CREATE INDEX "merchant_locations_merchant_status_idx" ON "merchant_locations" USING btree ("merchant_id","status","operational_status");
--> statement-breakpoint
CREATE TABLE "location_inventory_levels" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "location_id" text NOT NULL,
  "product_id" text NOT NULL,
  "variant_id" text,
  "on_hand_quantity" integer DEFAULT 0 NOT NULL,
  "reserved_quantity" integer DEFAULT 0 NOT NULL,
  "low_stock_threshold" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "inventory_fresh_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "location_inventory_levels_quantity_check" CHECK ("on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "on_hand_quantity" AND "low_stock_threshold" >= 0),
  CONSTRAINT "location_inventory_levels_version_check" CHECK ("version" > 0),
  CONSTRAINT "location_inventory_levels_timestamp_check" CHECK ("updated_at" >= "created_at" AND "inventory_fresh_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_location_merchant_fk" FOREIGN KEY ("location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_product_merchant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ADD CONSTRAINT "location_inventory_levels_variant_product_merchant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "location_inventory_levels_product_unique" ON "location_inventory_levels" USING btree ("merchant_id","location_id","product_id") WHERE "variant_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "location_inventory_levels_variant_unique" ON "location_inventory_levels" USING btree ("merchant_id","location_id","product_id","variant_id") WHERE "variant_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "location_inventory_levels_location_product_idx" ON "location_inventory_levels" USING btree ("merchant_id","location_id","product_id");
--> statement-breakpoint
INSERT INTO "merchant_locations" (
  "id",
  "merchant_id",
  "name",
  "status",
  "is_default",
  "operational_status",
  "online_fulfillment_enabled",
  "accept_online_orders_when_closed",
  "version",
  "created_at",
  "updated_at"
)
SELECT
  'location_default_' || md5("id"),
  "id",
  COALESCE(NULLIF(btrim("store_name"), ''), 'Main Location'),
  'active',
  TRUE,
  'open',
  TRUE,
  TRUE,
  1,
  now(),
  now()
FROM "merchants"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "location_inventory_levels" (
  "id",
  "merchant_id",
  "location_id",
  "product_id",
  "variant_id",
  "on_hand_quantity",
  "reserved_quantity",
  "low_stock_threshold",
  "version",
  "inventory_fresh_at",
  "created_at",
  "updated_at"
)
SELECT
  'inventory_product_' || md5(p."merchant_id" || ':' || p."id"),
  p."merchant_id",
  l."id",
  p."id",
  NULL,
  p."quantity",
  0,
  p."low_stock_threshold",
  1,
  now(),
  now(),
  now()
FROM "products" p
JOIN "merchant_locations" l
  ON l."merchant_id" = p."merchant_id"
 AND l."is_default" = TRUE
WHERE COALESCE(p."metadata"->'fawri_catalog_v2'->>'item_type', 'product') = 'product'
  AND (
    jsonb_typeof(p."metadata"->'fawri_catalog_v2'->'track_inventory') IS DISTINCT FROM 'boolean'
    OR (p."metadata"->'fawri_catalog_v2'->>'track_inventory')::boolean = TRUE
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "location_inventory_levels" (
  "id",
  "merchant_id",
  "location_id",
  "product_id",
  "variant_id",
  "on_hand_quantity",
  "reserved_quantity",
  "low_stock_threshold",
  "version",
  "inventory_fresh_at",
  "created_at",
  "updated_at"
)
SELECT
  'inventory_variant_' || md5(v."merchant_id" || ':' || v."product_id" || ':' || v."id"),
  v."merchant_id",
  l."id",
  v."product_id",
  v."id",
  v."quantity",
  0,
  p."low_stock_threshold",
  1,
  now(),
  now(),
  now()
FROM "product_variants" v
JOIN "products" p
  ON p."id" = v."product_id"
 AND p."merchant_id" = v."merchant_id"
JOIN "merchant_locations" l
  ON l."merchant_id" = v."merchant_id"
 AND l."is_default" = TRUE
WHERE COALESCE(p."metadata"->'fawri_catalog_v2'->>'item_type', 'product') = 'product'
  AND (
    jsonb_typeof(p."metadata"->'fawri_catalog_v2'->'track_inventory') IS DISTINCT FROM 'boolean'
    OR (p."metadata"->'fawri_catalog_v2'->>'track_inventory')::boolean = TRUE
  )
ON CONFLICT DO NOTHING;
