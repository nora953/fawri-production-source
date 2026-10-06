CREATE TABLE "merchant_cashier_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "status" text DEFAULT 'inactive' NOT NULL,
  "licensed_stations" integer DEFAULT 0 NOT NULL,
  "price_per_station_iqd" integer DEFAULT 3900 NOT NULL,
  "starts_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "grace_until" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_subscriptions_merchant_unique" UNIQUE("merchant_id"),
  CONSTRAINT "merchant_cashier_subscriptions_status_check" CHECK ("status" IN ('inactive','active','grace','suspended','expired')),
  CONSTRAINT "merchant_cashier_subscriptions_counters_check" CHECK ("licensed_stations" >= 0 AND "price_per_station_iqd" >= 0 AND "version" > 0),
  CONSTRAINT "merchant_cashier_subscriptions_lifecycle_check" CHECK (("status" = 'inactive' AND "licensed_stations" = 0) OR ("status" IN ('active','grace','suspended','expired') AND "licensed_stations" > 0 AND "starts_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "grace_until" IS NOT NULL AND "expires_at" > "starts_at" AND "grace_until" = "expires_at" + interval '7 days')),
  CONSTRAINT "merchant_cashier_subscriptions_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_subscriptions" ADD CONSTRAINT "merchant_cashier_subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_subscriptions_status_idx" ON "merchant_cashier_subscriptions" USING btree ("status","expires_at");
