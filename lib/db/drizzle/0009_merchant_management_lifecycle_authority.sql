CREATE TABLE "merchant_admin_notes" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_admin_notes_length_check" CHECK (char_length("merchant_admin_notes"."note") <= 5000),
	CONSTRAINT "merchant_admin_notes_timestamp_order_check" CHECK ("merchant_admin_notes"."updated_at" >= "merchant_admin_notes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "merchant_channel_overrides" (
	"merchant_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"status" "channel_status" NOT NULL,
	"updated_by_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_channel_overrides_merchant_id_platform_pk" PRIMARY KEY("merchant_id","platform"),
	CONSTRAINT "merchant_channel_overrides_timestamp_order_check" CHECK ("merchant_channel_overrides"."updated_at" >= "merchant_channel_overrides"."created_at")
);
--> statement-breakpoint
CREATE TABLE "merchant_deletion_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"merchant_id_snapshot" text NOT NULL,
	"merchant_name_snapshot" text NOT NULL,
	"merchant_phone_snapshot" text NOT NULL,
	"requested_by_admin_id" text,
	"requested_by_admin_id_snapshot" text NOT NULL,
	"requested_by_admin_name_snapshot" text NOT NULL,
	"requested_by_admin_phone_snapshot" text NOT NULL,
	"reason" text NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_admin_id" text,
	"reviewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_deletion_requests_reason_check" CHECK ("merchant_deletion_requests"."reason" IN ('policy_violation', 'retention_expired')),
	CONSTRAINT "merchant_deletion_requests_status_check" CHECK ("merchant_deletion_requests"."status" IN ('pending', 'rejected', 'completed')),
	CONSTRAINT "merchant_deletion_requests_details_length_check" CHECK (char_length("merchant_deletion_requests"."details") BETWEEN 1 AND 1000),
	CONSTRAINT "merchant_deletion_requests_review_state_check" CHECK (("merchant_deletion_requests"."status" = 'pending' AND "merchant_deletion_requests"."reviewed_at" IS NULL AND "merchant_deletion_requests"."completed_at" IS NULL) OR ("merchant_deletion_requests"."status" = 'rejected' AND "merchant_deletion_requests"."reviewed_at" IS NOT NULL AND "merchant_deletion_requests"."completed_at" IS NULL) OR ("merchant_deletion_requests"."status" = 'completed' AND "merchant_deletion_requests"."reviewed_at" IS NOT NULL AND "merchant_deletion_requests"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_phone_shape_check";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_admin_notes" ADD CONSTRAINT "merchant_admin_notes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_admin_notes" ADD CONSTRAINT "merchant_admin_notes_updated_by_admin_id_admin_profiles_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_channel_overrides" ADD CONSTRAINT "merchant_channel_overrides_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_channel_overrides" ADD CONSTRAINT "merchant_channel_overrides_updated_by_admin_id_admin_profiles_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_deletion_requests" ADD CONSTRAINT "merchant_deletion_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_deletion_requests" ADD CONSTRAINT "merchant_deletion_requests_requested_by_admin_id_admin_profiles_id_fk" FOREIGN KEY ("requested_by_admin_id") REFERENCES "public"."admin_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_deletion_requests" ADD CONSTRAINT "merchant_deletion_requests_reviewed_by_admin_id_admin_profiles_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_channel_overrides_status_idx" ON "merchant_channel_overrides" USING btree ("platform","status");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_deletion_requests_pending_merchant_unique" ON "merchant_deletion_requests" USING btree ("merchant_id_snapshot") WHERE "merchant_deletion_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "merchant_deletion_requests_status_created_idx" ON "merchant_deletion_requests" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_active_phone_required_check" CHECK ("accounts"."state" = 'closed' OR "accounts"."phone" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_phone_shape_check" CHECK ("accounts"."phone" IS NULL OR "accounts"."phone" ~ '^07[0-9]{9}$');