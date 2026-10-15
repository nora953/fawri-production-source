CREATE TYPE "public"."commerce_promotion_effect" AS ENUM('percentage_off', 'fixed_amount_off', 'fixed_price', 'free_delivery');--> statement-breakpoint
CREATE TYPE "public"."commerce_promotion_scope" AS ENUM('catalog_item', 'delivery');--> statement-breakpoint
CREATE TABLE "commerce_promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" "commerce_promotion_scope" NOT NULL,
	"effect" "commerce_promotion_effect" NOT NULL,
	"product_id" text,
	"variant_id" text,
	"percentage_bps" integer,
	"amount_minor" bigint,
	"currency_code" text DEFAULT 'IQD' NOT NULL,
	"minimum_subtotal_minor" bigint,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"schedule_timezone" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_promotions_scope_target_check" CHECK ((
        "commerce_promotions"."scope" = 'catalog_item'
        AND "commerce_promotions"."product_id" IS NOT NULL
        AND "commerce_promotions"."effect" <> 'free_delivery'
      ) OR (
        "commerce_promotions"."scope" = 'delivery'
        AND "commerce_promotions"."product_id" IS NULL
        AND "commerce_promotions"."variant_id" IS NULL
        AND "commerce_promotions"."effect" = 'free_delivery'
      )),
	CONSTRAINT "commerce_promotions_variant_target_check" CHECK ("commerce_promotions"."variant_id" IS NULL OR "commerce_promotions"."product_id" IS NOT NULL),
	CONSTRAINT "commerce_promotions_effect_value_check" CHECK ((
        "commerce_promotions"."effect" = 'percentage_off'
        AND "commerce_promotions"."percentage_bps" BETWEEN 1 AND 10000
        AND "commerce_promotions"."amount_minor" IS NULL
      ) OR (
        "commerce_promotions"."effect" = 'fixed_amount_off'
        AND "commerce_promotions"."percentage_bps" IS NULL
        AND "commerce_promotions"."amount_minor" > 0
      ) OR (
        "commerce_promotions"."effect" = 'fixed_price'
        AND "commerce_promotions"."percentage_bps" IS NULL
        AND "commerce_promotions"."amount_minor" >= 0
      ) OR (
        "commerce_promotions"."effect" = 'free_delivery'
        AND "commerce_promotions"."percentage_bps" IS NULL
        AND "commerce_promotions"."amount_minor" IS NULL
      )),
	CONSTRAINT "commerce_promotions_currency_check" CHECK ("commerce_promotions"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "commerce_promotions_minimum_subtotal_check" CHECK ("commerce_promotions"."minimum_subtotal_minor" IS NULL OR "commerce_promotions"."minimum_subtotal_minor" >= 0),
	CONSTRAINT "commerce_promotions_schedule_check" CHECK ("commerce_promotions"."ends_at" > "commerce_promotions"."starts_at"),
	CONSTRAINT "commerce_promotions_timezone_check" CHECK (char_length("commerce_promotions"."schedule_timezone") BETWEEN 1 AND 100),
	CONSTRAINT "commerce_promotions_priority_check" CHECK ("commerce_promotions"."priority" BETWEEN 0 AND 1000),
	CONSTRAINT "commerce_promotions_version_check" CHECK ("commerce_promotions"."version" > 0),
	CONSTRAINT "commerce_promotions_timestamp_order_check" CHECK ("commerce_promotions"."updated_at" >= "commerce_promotions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "commerce_promotions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "country_code" text DEFAULT 'IQ' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "timezone" text DEFAULT 'Asia/Baghdad' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "currency_code" text DEFAULT 'IQD' NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_promotions" ADD CONSTRAINT "commerce_promotions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_promotions" ADD CONSTRAINT "commerce_promotions_product_tenant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_promotions" ADD CONSTRAINT "commerce_promotions_variant_tenant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commerce_promotions_merchant_window_idx" ON "commerce_promotions" USING btree ("merchant_id","enabled","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "commerce_promotions_catalog_target_idx" ON "commerce_promotions" USING btree ("merchant_id","product_id","variant_id","enabled");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_country_code_check" CHECK ("merchants"."country_code" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_timezone_check" CHECK (char_length("merchants"."timezone") BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_currency_code_check" CHECK ("merchants"."currency_code" ~ '^[A-Z]{3}$');--> statement-breakpoint
CREATE POLICY "commerce_promotions_tenant_boundary" ON "commerce_promotions" AS PERMISSIVE FOR ALL TO public USING ((
    "commerce_promotions"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "commerce_promotions"."merchant_id")
    )
  )) WITH CHECK ((
    "commerce_promotions"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "commerce_promotions"."merchant_id")
    )
  ));