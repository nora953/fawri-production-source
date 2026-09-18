ALTER TABLE "merchant_locations" ADD COLUMN "legacy_branch_key" text;
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
  'location_default_' || md5(merchant."id"),
  merchant."id",
  LEFT(COALESCE(NULLIF(btrim(merchant."store_name"), ''), 'Main Location'), 120),
  'active',
  TRUE,
  'open',
  TRUE,
  TRUE,
  1,
  now(),
  now()
FROM "merchants" AS merchant
WHERE NOT EXISTS (
  SELECT 1
  FROM "merchant_locations" AS existing
  WHERE existing."merchant_id" = merchant."id"
    AND existing."is_default" = TRUE
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "merchant_locations"
SET "legacy_branch_key" = 'main',
    "updated_at" = now()
WHERE "is_default" = TRUE
  AND "legacy_branch_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "merchant_locations"
ADD CONSTRAINT "merchant_locations_legacy_branch_key_check"
CHECK ("legacy_branch_key" IS NULL OR char_length(btrim("legacy_branch_key")) BETWEEN 1 AND 120);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_locations_legacy_branch_unique"
ON "merchant_locations" USING btree ("merchant_id","legacy_branch_key")
WHERE "legacy_branch_key" IS NOT NULL;
--> statement-breakpoint
WITH branch_locations AS (
  SELECT
    "merchant_id",
    "branch_key",
    LEFT(
      COALESCE(
        MIN(NULLIF(btrim("branch_label"), '')),
        MIN(NULLIF(btrim("name"), '')),
        "branch_key"
      ),
      120
    ) AS "location_name"
  FROM "merchant_cashier_stations"
  WHERE "branch_key" <> 'main'
  GROUP BY "merchant_id", "branch_key"
)
INSERT INTO "merchant_locations" (
  "id",
  "merchant_id",
  "name",
  "legacy_branch_key",
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
  'location_branch_' || md5("merchant_id" || ':' || "branch_key"),
  "merchant_id",
  "location_name",
  "branch_key",
  'active',
  FALSE,
  'open',
  FALSE,
  TRUE,
  1,
  now(),
  now()
FROM branch_locations
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_stations" ADD COLUMN "location_id" text;
--> statement-breakpoint
UPDATE "merchant_cashier_stations" AS station
SET "location_id" = location."id",
    "updated_at" = now()
FROM "merchant_locations" AS location
WHERE location."merchant_id" = station."merchant_id"
  AND location."legacy_branch_key" = station."branch_key"
  AND station."location_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_stations"
ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_stations"
ADD CONSTRAINT "merchant_cashier_stations_location_merchant_fk"
FOREIGN KEY ("location_id","merchant_id")
REFERENCES "public"."merchant_locations"("id","merchant_id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_stations_location_idx"
ON "merchant_cashier_stations" USING btree ("merchant_id","location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cashier_stations_offline_location_unique"
ON "merchant_cashier_stations" USING btree ("merchant_id","location_id")
WHERE "offline_inventory_authority" = TRUE AND "status" = 'active';
--> statement-breakpoint
DROP INDEX "merchant_cashier_stations_offline_branch_unique";
--> statement-breakpoint
ALTER TABLE "merchant_locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_locations_tenant_boundary" ON "merchant_locations" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "location_inventory_levels_tenant_boundary" ON "location_inventory_levels" AS PERMISSIVE FOR ALL TO public USING ((
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
