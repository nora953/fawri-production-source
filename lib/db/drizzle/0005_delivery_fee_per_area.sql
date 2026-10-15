CREATE TYPE "public"."delivery_pricing_mode" AS ENUM('flat', 'per_area');--> statement-breakpoint
CREATE TABLE "merchant_delivery_area_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"area_name" text NOT NULL,
	"normalized_area_name" text NOT NULL,
	"fee_iqd" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_delivery_area_rates_fee_check" CHECK ("merchant_delivery_area_rates"."fee_iqd" >= 0 AND "merchant_delivery_area_rates"."fee_iqd" <= 100000000),
	CONSTRAINT "merchant_delivery_area_rates_area_name_check" CHECK (char_length("merchant_delivery_area_rates"."area_name") BETWEEN 1 AND 100 AND char_length("merchant_delivery_area_rates"."normalized_area_name") BETWEEN 1 AND 100),
	CONSTRAINT "merchant_delivery_area_rates_timestamp_order_check" CHECK ("merchant_delivery_area_rates"."updated_at" >= "merchant_delivery_area_rates"."created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_delivery_area_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD COLUMN "delivery_pricing_mode" "delivery_pricing_mode" DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_delivery_area_rates" ADD CONSTRAINT "merchant_delivery_area_rates_merchant_id_merchant_settings_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant_settings"("merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_delivery_area_rates_merchant_area_unique" ON "merchant_delivery_area_rates" USING btree ("merchant_id","normalized_area_name");--> statement-breakpoint
CREATE INDEX "merchant_delivery_area_rates_merchant_enabled_idx" ON "merchant_delivery_area_rates" USING btree ("merchant_id","enabled");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_dimensions_mm_all_or_none_check" CHECK (("product_variants"."length_mm" IS NULL AND "product_variants"."width_mm" IS NULL AND "product_variants"."height_mm" IS NULL) OR ("product_variants"."length_mm" IS NOT NULL AND "product_variants"."width_mm" IS NOT NULL AND "product_variants"."height_mm" IS NOT NULL AND "product_variants"."length_mm" BETWEEN 1 AND 100000 AND "product_variants"."width_mm" BETWEEN 1 AND 100000 AND "product_variants"."height_mm" BETWEEN 1 AND 100000));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_dimensions_mm_all_or_none_check" CHECK (("products"."length_mm" IS NULL AND "products"."width_mm" IS NULL AND "products"."height_mm" IS NULL) OR ("products"."length_mm" IS NOT NULL AND "products"."width_mm" IS NOT NULL AND "products"."height_mm" IS NOT NULL AND "products"."length_mm" BETWEEN 1 AND 100000 AND "products"."width_mm" BETWEEN 1 AND 100000 AND "products"."height_mm" BETWEEN 1 AND 100000));--> statement-breakpoint
CREATE POLICY "merchant_delivery_area_rates_tenant_boundary" ON "merchant_delivery_area_rates" AS PERMISSIVE FOR ALL TO public USING ((
    "merchant_delivery_area_rates"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_delivery_area_rates"."merchant_id")
    )
  )) WITH CHECK ((
    "merchant_delivery_area_rates"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_delivery_area_rates"."merchant_id")
    )
  ));