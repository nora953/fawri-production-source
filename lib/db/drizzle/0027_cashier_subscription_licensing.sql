CREATE TABLE "merchant_cashier_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "status" text DEFAULT 'inactive' NOT NULL,
  "licensed_seats" integer DEFAULT 0 NOT NULL,
  "price_per_seat_iqd" integer DEFAULT 3900 NOT NULL,
  "billing_period_start" timestamp with time zone,
  "billing_period_end" timestamp with time zone,
  "grace_duration_seconds" integer DEFAULT 604800 NOT NULL,
  "scheduled_licensed_seats" integer,
  "scheduled_change_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_subscriptions_id_merchant_unique" UNIQUE("id","merchant_id"),
  CONSTRAINT "merchant_cashier_subscriptions_merchant_unique" UNIQUE("merchant_id"),
  CONSTRAINT "merchant_cashier_subscriptions_status_check" CHECK ("status" IN ('inactive','active','suspended','cancelled')),
  CONSTRAINT "merchant_cashier_subscriptions_counters_check" CHECK ("licensed_seats" >= 0 AND "price_per_seat_iqd" > 0 AND "grace_duration_seconds" > 0 AND "version" > 0),
  CONSTRAINT "merchant_cashier_subscriptions_lifecycle_check" CHECK (("status" = 'inactive' AND "licensed_seats" = 0 AND "billing_period_start" IS NULL AND "billing_period_end" IS NULL) OR ("status" <> 'inactive' AND "licensed_seats" > 0 AND "billing_period_start" IS NOT NULL AND "billing_period_end" IS NOT NULL AND "billing_period_end" > "billing_period_start")),
  CONSTRAINT "merchant_cashier_subscriptions_scheduled_change_check" CHECK (("scheduled_licensed_seats" IS NULL AND "scheduled_change_at" IS NULL) OR ("scheduled_licensed_seats" IS NOT NULL AND "scheduled_licensed_seats" > 0 AND "scheduled_licensed_seats" < "licensed_seats" AND "scheduled_change_at" IS NOT NULL AND "billing_period_end" IS NOT NULL AND "scheduled_change_at" = "billing_period_end")),
  CONSTRAINT "merchant_cashier_subscriptions_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_subscriptions" ADD CONSTRAINT "merchant_cashier_subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_subscriptions_status_period_idx" ON "merchant_cashier_subscriptions" USING btree ("status","billing_period_end");
--> statement-breakpoint

CREATE TABLE "cashier_station_seat_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "subscription_id" text NOT NULL,
  "station_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "release_effective_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_station_seat_assignments_station_unique" UNIQUE("merchant_id","station_id"),
  CONSTRAINT "cashier_station_seat_assignments_status_check" CHECK ("status" IN ('active','release_scheduled','released')),
  CONSTRAINT "cashier_station_seat_assignments_lifecycle_check" CHECK (("status" = 'active' AND "release_effective_at" IS NULL AND "released_at" IS NULL) OR ("status" = 'release_scheduled' AND "release_effective_at" IS NOT NULL AND "released_at" IS NULL) OR ("status" = 'released' AND "released_at" IS NOT NULL)),
  CONSTRAINT "cashier_station_seat_assignments_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "cashier_station_seat_assignments" ADD CONSTRAINT "cashier_station_seat_assignments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_station_seat_assignments" ADD CONSTRAINT "cashier_station_seat_assignments_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."merchant_cashier_subscriptions"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_station_seat_assignments" ADD CONSTRAINT "cashier_station_seat_assignments_station_merchant_fk" FOREIGN KEY ("station_id","merchant_id") REFERENCES "public"."merchant_cashier_stations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cashier_station_seat_assignments_subscription_status_idx" ON "cashier_station_seat_assignments" USING btree ("merchant_id","subscription_id","status");
--> statement-breakpoint

CREATE TABLE "cashier_billing_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "subscription_id" text,
  "operation" text NOT NULL,
  "current_seats" integer NOT NULL,
  "requested_seats" integer NOT NULL,
  "resulting_seats" integer NOT NULL,
  "unit_price_iqd" integer NOT NULL,
  "amount_iqd" integer NOT NULL,
  "currency" text DEFAULT 'IQD' NOT NULL,
  "billing_period_start" timestamp with time zone NOT NULL,
  "billing_period_end" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "idempotency_key" text NOT NULL,
  "provider" text NOT NULL,
  "provider_checkout_ref" text,
  "provider_payment_ref" text,
  "request_expires_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_billing_orders_id_merchant_unique" UNIQUE("id","merchant_id"),
  CONSTRAINT "cashier_billing_orders_merchant_idempotency_unique" UNIQUE("merchant_id","idempotency_key"),
  CONSTRAINT "cashier_billing_orders_operation_check" CHECK ("operation" IN ('activate','renew','add_seats')),
  CONSTRAINT "cashier_billing_orders_status_check" CHECK ("status" IN ('pending','paid','applied','failed','cancelled','expired','paid_reconciliation_required')),
  CONSTRAINT "cashier_billing_orders_monetary_check" CHECK ("unit_price_iqd" > 0 AND "amount_iqd" > 0 AND "currency" = 'IQD'),
  CONSTRAINT "cashier_billing_orders_seats_check" CHECK ("current_seats" >= 0 AND "requested_seats" > 0 AND "resulting_seats" > 0),
  CONSTRAINT "cashier_billing_orders_period_check" CHECK ("billing_period_end" > "billing_period_start" AND "request_expires_at" > "created_at" AND "updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "cashier_billing_orders" ADD CONSTRAINT "cashier_billing_orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_billing_orders" ADD CONSTRAINT "cashier_billing_orders_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."merchant_cashier_subscriptions"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_billing_orders_provider_payment_unique" ON "cashier_billing_orders" USING btree ("provider","provider_payment_ref") WHERE "provider_payment_ref" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "cashier_billing_orders_merchant_status_idx" ON "cashier_billing_orders" USING btree ("merchant_id","status","created_at");
--> statement-breakpoint

CREATE TABLE "cashier_billing_events" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "order_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_billing_events_provider_event_unique" UNIQUE("provider","provider_event_id"),
  CONSTRAINT "cashier_billing_events_event_check" CHECK ("event_type" IN ('payment_succeeded','payment_failed','payment_cancelled')),
  CONSTRAINT "cashier_billing_events_status_check" CHECK ("status" IN ('received','applied','rejected')),
  CONSTRAINT "cashier_billing_events_payload_hash_check" CHECK (char_length("payload_hash") BETWEEN 32 AND 128)
);
--> statement-breakpoint
ALTER TABLE "cashier_billing_events" ADD CONSTRAINT "cashier_billing_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_billing_events" ADD CONSTRAINT "cashier_billing_events_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."cashier_billing_orders"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cashier_billing_events_merchant_created_idx" ON "cashier_billing_events" USING btree ("merchant_id","created_at");
--> statement-breakpoint

CREATE TABLE "cashier_entitlement_applications" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "subscription_id" text NOT NULL,
  "order_id" text NOT NULL,
  "operation" text NOT NULL,
  "previous_seats" integer NOT NULL,
  "resulting_seats" integer NOT NULL,
  "previous_version" integer NOT NULL,
  "resulting_version" integer NOT NULL,
  "amount_iqd" integer NOT NULL,
  "provider" text NOT NULL,
  "provider_payment_ref" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_entitlement_applications_order_unique" UNIQUE("order_id"),
  CONSTRAINT "cashier_entitlement_applications_provider_payment_unique" UNIQUE("provider","provider_payment_ref"),
  CONSTRAINT "cashier_entitlement_applications_operation_check" CHECK ("operation" IN ('activate','renew','add_seats')),
  CONSTRAINT "cashier_entitlement_applications_counters_check" CHECK ("previous_seats" >= 0 AND "resulting_seats" > 0 AND "previous_version" >= 0 AND "resulting_version" > "previous_version" AND "amount_iqd" > 0)
);
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_applications" ADD CONSTRAINT "cashier_entitlement_applications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_applications" ADD CONSTRAINT "cashier_entitlement_applications_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."merchant_cashier_subscriptions"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_applications" ADD CONSTRAINT "cashier_entitlement_applications_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."cashier_billing_orders"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cashier_entitlement_applications_merchant_applied_idx" ON "cashier_entitlement_applications" USING btree ("merchant_id","applied_at");
--> statement-breakpoint

CREATE TABLE "cashier_entitlement_audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "subscription_id" text NOT NULL,
  "action" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_ref" text,
  "from_seats" integer,
  "to_seats" integer,
  "from_version" integer,
  "to_version" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_entitlement_audit_events_action_check" CHECK ("action" IN ('activate','renew','add_seats','schedule_downgrade','apply_downgrade','suspend','resume','cancel','seat_assign','seat_release')),
  CONSTRAINT "cashier_entitlement_audit_events_actor_check" CHECK ("actor_type" IN ('merchant','admin','system','payment_webhook'))
);
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_audit_events" ADD CONSTRAINT "cashier_entitlement_audit_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_audit_events" ADD CONSTRAINT "cashier_entitlement_audit_events_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."merchant_cashier_subscriptions"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cashier_entitlement_audit_events_merchant_created_idx" ON "cashier_entitlement_audit_events" USING btree ("merchant_id","created_at");
--> statement-breakpoint

ALTER TABLE "merchant_cashier_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cashier_station_seat_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cashier_billing_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cashier_billing_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_applications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cashier_entitlement_audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "merchant_cashier_subscriptions_tenant_boundary" ON "merchant_cashier_subscriptions"
  TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_subscriptions"."merchant_id"))
  WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_subscriptions"."merchant_id"));
--> statement-breakpoint
CREATE POLICY "cashier_station_seat_assignments_tenant_boundary" ON "cashier_station_seat_assignments"
  TO public USING (public.fawri_tenant_or_audited_admin("cashier_station_seat_assignments"."merchant_id"))
  WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_station_seat_assignments"."merchant_id"));
--> statement-breakpoint
CREATE POLICY "cashier_billing_orders_tenant_boundary" ON "cashier_billing_orders"
  TO public USING (public.fawri_tenant_or_audited_admin("cashier_billing_orders"."merchant_id"))
  WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_billing_orders"."merchant_id"));
--> statement-breakpoint
CREATE POLICY "cashier_billing_events_tenant_boundary" ON "cashier_billing_events"
  TO public USING (public.fawri_tenant_or_audited_admin("cashier_billing_events"."merchant_id"))
  WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_billing_events"."merchant_id"));
--> statement-breakpoint
CREATE POLICY "cashier_entitlement_applications_tenant_boundary" ON "cashier_entitlement_applications"
  TO public USING (public.fawri_tenant_or_audited_admin("cashier_entitlement_applications"."merchant_id"))
  WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_entitlement_applications"."merchant_id"));
--> statement-breakpoint
CREATE POLICY "cashier_entitlement_audit_events_tenant_boundary" ON "cashier_entitlement_audit_events"
  TO public USING (public.fawri_tenant_or_audited_admin("cashier_entitlement_audit_events"."merchant_id"))
  WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_entitlement_audit_events"."merchant_id"));
