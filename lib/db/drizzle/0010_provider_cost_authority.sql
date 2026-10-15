CREATE TABLE "provider_cost_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_account_id" text,
	"action" text NOT NULL,
	"meter_key" text,
	"rate_id" text,
	"previous_value" jsonb,
	"next_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_cost_audit_events_action_check" CHECK ("provider_cost_audit_events"."action" IN ('rate_created', 'rate_updated', 'budget_updated'))
);
--> statement-breakpoint
CREATE TABLE "provider_cost_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_key" text NOT NULL,
	"meter_key" text,
	"amount_usd" numeric(20, 10) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source_type" text NOT NULL,
	"source_reference" text,
	"dimension_key" text DEFAULT 'global' NOT NULL,
	"dimension_value" text DEFAULT 'global' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_cost_observations_currency_check" CHECK ("provider_cost_observations"."currency" = 'USD'),
	CONSTRAINT "provider_cost_observations_source_check" CHECK ("provider_cost_observations"."source_type" IN ('provider_api', 'provider_invoice', 'owner_adjustment')),
	CONSTRAINT "provider_cost_observations_provider_key_check" CHECK ("provider_cost_observations"."provider_key" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
	CONSTRAINT "provider_cost_observations_period_check" CHECK ("provider_cost_observations"."period_end" > "provider_cost_observations"."period_start")
);
--> statement-breakpoint
CREATE TABLE "provider_cost_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"meter_key" text NOT NULL,
	"provider_key" text NOT NULL,
	"unit_code" text NOT NULL,
	"dimension_key" text DEFAULT 'global' NOT NULL,
	"dimension_value" text DEFAULT 'global' NOT NULL,
	"rate_usd" numeric(20, 10) NOT NULL,
	"source_type" text DEFAULT 'owner_configured' NOT NULL,
	"source_reference" text,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_cost_rates_rate_check" CHECK ("provider_cost_rates"."rate_usd"::numeric >= 0),
	CONSTRAINT "provider_cost_rates_source_check" CHECK ("provider_cost_rates"."source_type" IN ('provider_api', 'provider_rate_card', 'owner_configured')),
	CONSTRAINT "provider_cost_rates_provider_key_check" CHECK ("provider_cost_rates"."provider_key" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
	CONSTRAINT "provider_cost_rates_meter_key_check" CHECK ("provider_cost_rates"."meter_key" ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
	CONSTRAINT "provider_cost_rates_dimension_check" CHECK (char_length("provider_cost_rates"."dimension_key") BETWEEN 1 AND 80 AND char_length("provider_cost_rates"."dimension_value") BETWEEN 1 AND 160),
	CONSTRAINT "provider_cost_rates_effective_range_check" CHECK ("provider_cost_rates"."effective_to" IS NULL OR "provider_cost_rates"."effective_to" > "provider_cost_rates"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "provider_cost_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"monthly_budget_usd" numeric(20, 6),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_account_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_cost_settings_singleton_check" CHECK ("provider_cost_settings"."id" = 'global'),
	CONSTRAINT "provider_cost_settings_budget_check" CHECK ("provider_cost_settings"."monthly_budget_usd" IS NULL OR "provider_cost_settings"."monthly_budget_usd"::numeric >= 0)
);
--> statement-breakpoint
ALTER TABLE "provider_cost_rates" ADD CONSTRAINT "provider_cost_rates_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cost_settings" ADD CONSTRAINT "provider_cost_settings_updated_by_account_id_accounts_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_cost_audit_events_created_idx" ON "provider_cost_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "provider_cost_audit_events_meter_created_idx" ON "provider_cost_audit_events" USING btree ("meter_key","created_at");--> statement-breakpoint
CREATE INDEX "provider_cost_observations_provider_period_idx" ON "provider_cost_observations" USING btree ("provider_key","period_start","period_end");--> statement-breakpoint
CREATE INDEX "provider_cost_observations_meter_period_idx" ON "provider_cost_observations" USING btree ("meter_key","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_cost_observations_provider_reference_unique" ON "provider_cost_observations" USING btree ("provider_key","source_reference") WHERE "provider_cost_observations"."source_reference" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_cost_rates_meter_dimension_effective_unique" ON "provider_cost_rates" USING btree ("meter_key","dimension_key","dimension_value","effective_from");--> statement-breakpoint
CREATE INDEX "provider_cost_rates_meter_effective_idx" ON "provider_cost_rates" USING btree ("meter_key","effective_from");--> statement-breakpoint
CREATE INDEX "provider_cost_rates_provider_effective_idx" ON "provider_cost_rates" USING btree ("provider_key","effective_from");