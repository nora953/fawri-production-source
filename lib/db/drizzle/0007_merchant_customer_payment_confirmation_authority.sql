CREATE TYPE "public"."payment_confirmation_source" AS ENUM('merchant_confirmed', 'provider_verified');--> statement-breakpoint
CREATE TYPE "public"."payment_reconciliation_status" AS ENUM('clear', 'reconciliation_required', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."provider_payment_outcome" AS ENUM('paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "order_payment_provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_transaction_ref" text,
	"outcome" "provider_payment_outcome" NOT NULL,
	"amount_iqd" integer NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"authenticity_verified" boolean NOT NULL,
	"payload_sha256" text NOT NULL,
	"sanitized_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resulting_action" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payment_provider_events_id_merchant_unique" UNIQUE("id","merchant_id"),
	CONSTRAINT "order_payment_provider_events_provider_check" CHECK (char_length("order_payment_provider_events"."provider") BETWEEN 2 AND 40),
	CONSTRAINT "order_payment_provider_events_event_check" CHECK (char_length("order_payment_provider_events"."provider_event_id") BETWEEN 6 AND 200),
	CONSTRAINT "order_payment_provider_events_transaction_check" CHECK ("order_payment_provider_events"."provider_transaction_ref" IS NULL OR char_length("order_payment_provider_events"."provider_transaction_ref") BETWEEN 1 AND 200),
	CONSTRAINT "order_payment_provider_events_amount_currency_check" CHECK ("order_payment_provider_events"."amount_iqd" >= 0 AND "order_payment_provider_events"."currency" = 'IQD'),
	CONSTRAINT "order_payment_provider_events_authenticity_check" CHECK ("order_payment_provider_events"."authenticity_verified" = TRUE),
	CONSTRAINT "order_payment_provider_events_payload_hash_check" CHECK (char_length("order_payment_provider_events"."payload_sha256") = 64),
	CONSTRAINT "order_payment_provider_events_action_check" CHECK ("order_payment_provider_events"."resulting_action" IN ('provider_paid_confirmed', 'provider_failure_recorded', 'payment_conflict', 'provider_evidence_recorded')),
	CONSTRAINT "order_payment_provider_events_time_check" CHECK ("order_payment_provider_events"."processed_at" >= "order_payment_provider_events"."received_at")
);
--> statement-breakpoint
ALTER TABLE "order_payment_provider_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_payment_decisions" ADD COLUMN "confirmation_source" "payment_confirmation_source";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_confirmation_source" "payment_confirmation_source";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider_transaction_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider_last_event_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reconciliation_status" "payment_reconciliation_status" DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_conflict_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_conflict_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_conflict_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_conflict_resolved_by_account_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_conflict_resolution_note" text;--> statement-breakpoint
ALTER TABLE "order_payment_provider_events" ADD CONSTRAINT "order_payment_provider_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payment_provider_events" ADD CONSTRAINT "order_payment_provider_events_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."orders"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_payment_provider_events_provider_event_unique" ON "order_payment_provider_events" USING btree ("merchant_id","provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "order_payment_provider_events_merchant_order_idx" ON "order_payment_provider_events" USING btree ("merchant_id","order_id","received_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_conflict_resolved_by_account_id_accounts_id_fk" FOREIGN KEY ("payment_conflict_resolved_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_confirmation_source_check" CHECK ("orders"."payment_status" <> 'paid' OR "orders"."payment_confirmation_source" IS NOT NULL OR "orders"."payment_verified_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_reconciliation_check" CHECK (("orders"."payment_reconciliation_status" = 'clear' AND "orders"."payment_conflict_code" IS NULL AND "orders"."payment_conflict_at" IS NULL AND "orders"."payment_conflict_resolved_at" IS NULL AND "orders"."payment_conflict_resolved_by_account_id" IS NULL AND "orders"."payment_conflict_resolution_note" IS NULL) OR ("orders"."payment_reconciliation_status" = 'reconciliation_required' AND "orders"."payment_conflict_code" IS NOT NULL AND "orders"."payment_conflict_at" IS NOT NULL AND "orders"."payment_conflict_resolved_at" IS NULL AND "orders"."payment_conflict_resolved_by_account_id" IS NULL AND "orders"."payment_conflict_resolution_note" IS NULL) OR ("orders"."payment_reconciliation_status" = 'resolved' AND "orders"."payment_conflict_code" IS NOT NULL AND "orders"."payment_conflict_at" IS NOT NULL AND "orders"."payment_conflict_resolved_at" IS NOT NULL AND "orders"."payment_conflict_resolved_by_account_id" IS NOT NULL AND "orders"."payment_conflict_resolution_note" IS NOT NULL));--> statement-breakpoint
CREATE POLICY "order_payment_provider_events_tenant_boundary" ON "order_payment_provider_events" AS PERMISSIVE FOR ALL TO public USING ((
    "order_payment_provider_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "order_payment_provider_events"."merchant_id")
    )
  )) WITH CHECK ((
    "order_payment_provider_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "order_payment_provider_events"."merchant_id")
    )
  ));