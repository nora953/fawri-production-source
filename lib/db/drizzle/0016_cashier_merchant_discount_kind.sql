CREATE TABLE "merchant_cashier_discount_settings" (
  "merchant_id" text PRIMARY KEY NOT NULL,
  "discount_kind" text DEFAULT 'amount' NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_merchant_discount_kind_check" CHECK ("discount_kind" IN ('amount','percentage')),
  CONSTRAINT "cashier_merchant_discount_settings_version_positive" CHECK ("version" > 0),
  CONSTRAINT "cashier_merchant_discount_settings_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_discount_settings" ADD CONSTRAINT "cashier_merchant_discount_settings_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "merchant_cashier_discount_settings" ("merchant_id", "discount_kind")
SELECT "id", 'amount' FROM "merchants"
ON CONFLICT ("merchant_id") DO NOTHING;
