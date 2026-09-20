ALTER TABLE "merchant_settings" ADD COLUMN "inventory_freshness_max_age_minutes" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD COLUMN "inventory_stale_policy" text DEFAULT 'reroute_then_pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_inventory_freshness_age_check" CHECK ("merchant_settings"."inventory_freshness_max_age_minutes" BETWEEN 1 AND 1440);
--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_inventory_stale_policy_check" CHECK ("merchant_settings"."inventory_stale_policy" IN ('reroute_then_pending','allow_stale','fresh_only'));
