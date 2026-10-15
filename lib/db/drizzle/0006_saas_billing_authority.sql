CREATE TABLE "saas_billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saas_billing_events_payload_hash_check" CHECK (char_length("saas_billing_events"."payload_hash") BETWEEN 32 AND 128),
	CONSTRAINT "saas_billing_events_status_check" CHECK ("saas_billing_events"."status" IN ('received', 'applied', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "saas_billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saas_billing_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"operation" text NOT NULL,
	"requested_plan" "subscription_plan" NOT NULL,
	"amount_iqd" integer NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"catalog_version" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_checkout_ref" text,
	"provider_payment_ref" text,
	"request_expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saas_billing_orders_id_merchant_unique" UNIQUE("id","merchant_id"),
	CONSTRAINT "saas_billing_orders_operation_check" CHECK ("saas_billing_orders"."operation" IN ('activate', 'renew', 'change')),
	CONSTRAINT "saas_billing_orders_paid_plan_check" CHECK ("saas_billing_orders"."requested_plan" <> 'trial'),
	CONSTRAINT "saas_billing_orders_amount_check" CHECK ("saas_billing_orders"."amount_iqd" > 0),
	CONSTRAINT "saas_billing_orders_currency_check" CHECK ("saas_billing_orders"."currency" = 'IQD'),
	CONSTRAINT "saas_billing_orders_status_check" CHECK ("saas_billing_orders"."status" IN ('pending', 'paid', 'paid_reconciliation_required', 'failed', 'cancelled', 'expired', 'refunded')),
	CONSTRAINT "saas_billing_orders_request_time_check" CHECK ("saas_billing_orders"."request_expires_at" > "saas_billing_orders"."created_at" AND "saas_billing_orders"."updated_at" >= "saas_billing_orders"."created_at")
);
--> statement-breakpoint
ALTER TABLE "saas_billing_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saas_billing_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_refund_ref" text NOT NULL,
	"amount_iqd" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "saas_billing_refunds_amount_check" CHECK ("saas_billing_refunds"."amount_iqd" > 0),
	CONSTRAINT "saas_billing_refunds_status_check" CHECK ("saas_billing_refunds"."status" IN ('pending', 'settled', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "saas_billing_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saas_entitlement_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"operation" text NOT NULL,
	"applied_plan" "subscription_plan" NOT NULL,
	"amount_iqd" integer NOT NULL,
	"catalog_version" text NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_ref" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saas_entitlement_applications_operation_check" CHECK ("saas_entitlement_applications"."operation" IN ('activate', 'renew', 'change')),
	CONSTRAINT "saas_entitlement_applications_paid_plan_check" CHECK ("saas_entitlement_applications"."applied_plan" <> 'trial'),
	CONSTRAINT "saas_entitlement_applications_amount_check" CHECK ("saas_entitlement_applications"."amount_iqd" > 0)
);
--> statement-breakpoint
ALTER TABLE "saas_entitlement_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saas_billing_events" ADD CONSTRAINT "saas_billing_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_billing_events" ADD CONSTRAINT "saas_billing_events_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."saas_billing_orders"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_billing_orders" ADD CONSTRAINT "saas_billing_orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_billing_refunds" ADD CONSTRAINT "saas_billing_refunds_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_billing_refunds" ADD CONSTRAINT "saas_billing_refunds_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."saas_billing_orders"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_entitlement_applications" ADD CONSTRAINT "saas_entitlement_applications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_entitlement_applications" ADD CONSTRAINT "saas_entitlement_applications_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."saas_billing_orders"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_entitlement_applications" ADD CONSTRAINT "saas_entitlement_applications_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."subscriptions"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saas_billing_events_provider_event_unique" ON "saas_billing_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "saas_billing_events_merchant_created_idx" ON "saas_billing_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_billing_orders_merchant_idempotency_unique" ON "saas_billing_orders" USING btree ("merchant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_billing_orders_provider_payment_unique" ON "saas_billing_orders" USING btree ("provider","provider_payment_ref") WHERE "saas_billing_orders"."provider_payment_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "saas_billing_orders_merchant_pending_unique" ON "saas_billing_orders" USING btree ("merchant_id") WHERE "saas_billing_orders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "saas_billing_orders_merchant_created_idx" ON "saas_billing_orders" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "saas_billing_orders_status_updated_idx" ON "saas_billing_orders" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_billing_refunds_provider_refund_unique" ON "saas_billing_refunds" USING btree ("provider","provider_refund_ref");--> statement-breakpoint
CREATE INDEX "saas_billing_refunds_merchant_created_idx" ON "saas_billing_refunds" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_entitlement_applications_order_unique" ON "saas_entitlement_applications" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_entitlement_applications_provider_payment_unique" ON "saas_entitlement_applications" USING btree ("provider","provider_payment_ref");--> statement-breakpoint
CREATE INDEX "saas_entitlement_applications_merchant_applied_idx" ON "saas_entitlement_applications" USING btree ("merchant_id","applied_at");--> statement-breakpoint
CREATE POLICY "saas_billing_events_tenant_boundary" ON "saas_billing_events" AS PERMISSIVE FOR ALL TO public USING ((
    "saas_billing_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_billing_events"."merchant_id")
    )
  )) WITH CHECK ((
    "saas_billing_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_billing_events"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "saas_billing_orders_tenant_boundary" ON "saas_billing_orders" AS PERMISSIVE FOR ALL TO public USING ((
    "saas_billing_orders"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_billing_orders"."merchant_id")
    )
  )) WITH CHECK ((
    "saas_billing_orders"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_billing_orders"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "saas_billing_refunds_tenant_boundary" ON "saas_billing_refunds" AS PERMISSIVE FOR ALL TO public USING ((
    "saas_billing_refunds"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_billing_refunds"."merchant_id")
    )
  )) WITH CHECK ((
    "saas_billing_refunds"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_billing_refunds"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "saas_entitlement_applications_tenant_boundary" ON "saas_entitlement_applications" AS PERMISSIVE FOR ALL TO public USING ((
    "saas_entitlement_applications"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_entitlement_applications"."merchant_id")
    )
  )) WITH CHECK ((
    "saas_entitlement_applications"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saas_entitlement_applications"."merchant_id")
    )
  ));