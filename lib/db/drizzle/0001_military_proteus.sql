CREATE TYPE "public"."background_job_status" AS ENUM('queued', 'processing', 'retry', 'completed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."job_attempt_status" AS ENUM('processing', 'succeeded', 'failed', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."migration_mode" AS ENUM('dry_run', 'rollback_test', 'commit_test', 'write');--> statement-breakpoint
CREATE TYPE "public"."migration_reconciliation_status" AS ENUM('matched', 'mismatch', 'warning', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."migration_record_disposition" AS ENUM('planned', 'inserted', 'reconciled', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."migration_run_status" AS ENUM('planned', 'running', 'reconciling', 'committed', 'rolled_back', 'cleaned_up', 'failed');--> statement-breakpoint
CREATE TYPE "public"."migration_source_file_status" AS ENUM('missing', 'parsed', 'invalid', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."manual_reply_request_status" AS ENUM('pending', 'sent', 'failed', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."merchant_reply_language" AS ENUM('auto', 'ar', 'ku', 'en');--> statement-breakpoint
CREATE TABLE "manual_reply_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"text_sha256" text NOT NULL,
	"status" "manual_reply_request_status" DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"external_message_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_reply_requests_idempotency_key_format_check" CHECK (char_length("manual_reply_requests"."idempotency_key") between 16 and 128),
	CONSTRAINT "manual_reply_requests_text_hash_format_check" CHECK ("manual_reply_requests"."text_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "manual_reply_requests_timestamp_order_check" CHECK ("manual_reply_requests"."updated_at" >= "manual_reply_requests"."created_at"),
	CONSTRAINT "manual_reply_requests_sent_message_check" CHECK ("manual_reply_requests"."status" <> 'sent' or "manual_reply_requests"."message_id" is not null),
	CONSTRAINT "manual_reply_requests_failure_code_check" CHECK ("manual_reply_requests"."status" not in ('failed', 'uncertain') or "manual_reply_requests"."error_code" is not null)
);
--> statement-breakpoint
CREATE TABLE "migration_reconciliation_results" (
	"id" text PRIMARY KEY NOT NULL,
	"migration_run_id" text NOT NULL,
	"source_file_id" text,
	"check_type" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_name" text NOT NULL,
	"expected_count" integer,
	"actual_count" integer,
	"status" "migration_reconciliation_status" NOT NULL,
	"error_code" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_reconciliation_expected_nonnegative" CHECK ("migration_reconciliation_results"."expected_count" IS NULL OR "migration_reconciliation_results"."expected_count" >= 0),
	CONSTRAINT "migration_reconciliation_actual_nonnegative" CHECK ("migration_reconciliation_results"."actual_count" IS NULL OR "migration_reconciliation_results"."actual_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "migration_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "migration_mode" NOT NULL,
	"status" "migration_run_status" DEFAULT 'planned' NOT NULL,
	"source_environment" text NOT NULL,
	"source_root" text,
	"target_database" text,
	"schema_snapshot" text NOT NULL,
	"schema_snapshot_sha256" text NOT NULL,
	"source_manifest_sha256" text,
	"tool_version" text NOT NULL,
	"git_commit_sha" text,
	"planned_row_count" integer DEFAULT 0 NOT NULL,
	"inserted_row_count" integer DEFAULT 0 NOT NULL,
	"reconciled_row_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"initiated_by_account_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "migration_runs_planned_rows_nonnegative" CHECK ("migration_runs"."planned_row_count" >= 0),
	CONSTRAINT "migration_runs_inserted_rows_nonnegative" CHECK ("migration_runs"."inserted_row_count" >= 0),
	CONSTRAINT "migration_runs_reconciled_rows_nonnegative" CHECK ("migration_runs"."reconciled_row_count" >= 0),
	CONSTRAINT "migration_runs_warnings_nonnegative" CHECK ("migration_runs"."warning_count" >= 0),
	CONSTRAINT "migration_runs_errors_nonnegative" CHECK ("migration_runs"."error_count" >= 0),
	CONSTRAINT "migration_runs_valid_time_range" CHECK ("migration_runs"."finished_at" IS NULL OR "migration_runs"."started_at" IS NULL OR "migration_runs"."finished_at" >= "migration_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "migration_source_files" (
	"id" text PRIMARY KEY NOT NULL,
	"migration_run_id" text NOT NULL,
	"logical_name" text NOT NULL,
	"relative_path" text NOT NULL,
	"exists" boolean DEFAULT true NOT NULL,
	"status" "migration_source_file_status" NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"sha256" text,
	"error_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_source_files_size_nonnegative" CHECK ("migration_source_files"."size_bytes" >= 0),
	CONSTRAINT "migration_source_files_records_nonnegative" CHECK ("migration_source_files"."record_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "migration_source_records" (
	"id" text PRIMARY KEY NOT NULL,
	"migration_run_id" text NOT NULL,
	"source_file_id" text,
	"source_collection" text NOT NULL,
	"source_record_id" text NOT NULL,
	"source_record_sha256" text NOT NULL,
	"target_table" text NOT NULL,
	"target_record_id" text NOT NULL,
	"disposition" "migration_record_disposition" DEFAULT 'planned' NOT NULL,
	"error_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"merchant_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "background_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error_code" text,
	"last_error_message" text,
	"result" jsonb,
	"completed_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_jobs_attempts_nonnegative" CHECK ("background_jobs"."attempts" >= 0),
	CONSTRAINT "background_jobs_max_attempts_positive" CHECK ("background_jobs"."max_attempts" > 0),
	CONSTRAINT "background_jobs_attempts_within_limit" CHECK ("background_jobs"."attempts" <= "background_jobs"."max_attempts"),
	CONSTRAINT "background_jobs_processing_has_lock" CHECK (("background_jobs"."status" <> 'processing') OR ("background_jobs"."locked_at" IS NOT NULL AND "background_jobs"."locked_by" IS NOT NULL)),
	CONSTRAINT "background_jobs_nonprocessing_has_no_lock" CHECK (("background_jobs"."status" = 'processing') OR ("background_jobs"."locked_at" IS NULL AND "background_jobs"."locked_by" IS NULL)),
	CONSTRAINT "background_jobs_completed_has_timestamp" CHECK (("background_jobs"."status" <> 'completed') OR "background_jobs"."completed_at" IS NOT NULL),
	CONSTRAINT "background_jobs_dead_letter_has_timestamp" CHECK (("background_jobs"."status" <> 'dead_letter') OR "background_jobs"."dead_lettered_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "job_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"worker_id" text NOT NULL,
	"status" "job_attempt_status" NOT NULL,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_attempts_attempt_positive" CHECK ("job_attempts"."attempt_number" > 0),
	CONSTRAINT "job_attempts_valid_time_range" CHECK ("job_attempts"."finished_at" IS NULL OR "job_attempts"."finished_at" >= "job_attempts"."started_at"),
	CONSTRAINT "job_attempts_finished_status_has_timestamp" CHECK (("job_attempts"."status" = 'processing') OR "job_attempts"."finished_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "job_dead_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"occurrence" integer DEFAULT 1 NOT NULL,
	"reason_code" text NOT NULL,
	"reason_message" text NOT NULL,
	"attempts" integer NOT NULL,
	"payload_snapshot" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requeued_at" timestamp with time zone,
	"requeued_by_account_id" text,
	CONSTRAINT "job_dead_letters_attempts_positive" CHECK ("job_dead_letters"."attempts" > 0),
	CONSTRAINT "job_dead_letters_occurrence_positive" CHECK ("job_dead_letters"."occurrence" > 0)
);
--> statement-breakpoint
CREATE TABLE "merchant_settings" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"auto_reply_enabled" boolean DEFAULT true NOT NULL,
	"reply_language" "merchant_reply_language" DEFAULT 'auto' NOT NULL,
	"delivery_enabled" boolean DEFAULT true NOT NULL,
	"delivery_fee_iqd" integer DEFAULT 0 NOT NULL,
	"free_delivery_threshold_iqd" integer,
	"delivery_estimated_days_min" integer DEFAULT 1 NOT NULL,
	"delivery_estimated_days_max" integer DEFAULT 3 NOT NULL,
	"delivery_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivery_notes" text DEFAULT '' NOT NULL,
	"cash_on_delivery_enabled" boolean DEFAULT true NOT NULL,
	"electronic_payment_enabled" boolean DEFAULT false NOT NULL,
	"payment_methods" jsonb DEFAULT '["cash_on_delivery"]'::jsonb NOT NULL,
	"payment_instructions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_settings_version_check" CHECK ("merchant_settings"."version" > 0),
	CONSTRAINT "merchant_settings_delivery_fee_check" CHECK ("merchant_settings"."delivery_fee_iqd" >= 0),
	CONSTRAINT "merchant_settings_free_delivery_threshold_check" CHECK ("merchant_settings"."free_delivery_threshold_iqd" is null or "merchant_settings"."free_delivery_threshold_iqd" >= 0),
	CONSTRAINT "merchant_settings_delivery_days_check" CHECK ("merchant_settings"."delivery_estimated_days_min" > 0 and "merchant_settings"."delivery_estimated_days_max" >= "merchant_settings"."delivery_estimated_days_min"),
	CONSTRAINT "merchant_settings_payment_availability_check" CHECK ("merchant_settings"."cash_on_delivery_enabled" or "merchant_settings"."electronic_payment_enabled"),
	CONSTRAINT "merchant_settings_timestamp_order_check" CHECK ("merchant_settings"."updated_at" >= "merchant_settings"."created_at")
);
--> statement-breakpoint
ALTER TABLE "reply_ledger" DROP CONSTRAINT "reply_ledger_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "reply_ledger" DROP CONSTRAINT "reply_ledger_reply_batch_id_subscription_reply_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" DROP CONSTRAINT "subscription_reply_batches_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_channel_id_merchant_channels_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "processed_channel_events" DROP CONSTRAINT "processed_channel_events_channel_id_merchant_channels_id_fk";
--> statement-breakpoint
ALTER TABLE "order_drafts" DROP CONSTRAINT "order_drafts_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_variant_id_product_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_reply_requests" ADD CONSTRAINT "manual_reply_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_reply_requests" ADD CONSTRAINT "manual_reply_requests_conversation_merchant_fk" FOREIGN KEY ("conversation_id","merchant_id") REFERENCES "public"."conversations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_reply_requests" ADD CONSTRAINT "manual_reply_requests_message_conversation_merchant_fk" FOREIGN KEY ("message_id","conversation_id","merchant_id") REFERENCES "public"."messages"("id","conversation_id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_reconciliation_results" ADD CONSTRAINT "migration_reconciliation_results_migration_run_id_migration_runs_id_fk" FOREIGN KEY ("migration_run_id") REFERENCES "public"."migration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_reconciliation_results" ADD CONSTRAINT "migration_reconciliation_results_source_file_id_migration_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."migration_source_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_runs" ADD CONSTRAINT "migration_runs_initiated_by_account_id_accounts_id_fk" FOREIGN KEY ("initiated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_files" ADD CONSTRAINT "migration_source_files_migration_run_id_migration_runs_id_fk" FOREIGN KEY ("migration_run_id") REFERENCES "public"."migration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_records" ADD CONSTRAINT "migration_source_records_migration_run_id_migration_runs_id_fk" FOREIGN KEY ("migration_run_id") REFERENCES "public"."migration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_records" ADD CONSTRAINT "migration_source_records_source_file_id_migration_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."migration_source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_background_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."background_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_dead_letters" ADD CONSTRAINT "job_dead_letters_job_id_background_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."background_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_reply_requests_merchant_idempotency_unique" ON "manual_reply_requests" USING btree ("merchant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "manual_reply_requests_conversation_created_idx" ON "manual_reply_requests" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "manual_reply_requests_status_updated_idx" ON "manual_reply_requests" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "migration_reconciliation_run_status_idx" ON "migration_reconciliation_results" USING btree ("migration_run_id","status");--> statement-breakpoint
CREATE INDEX "migration_reconciliation_scope_idx" ON "migration_reconciliation_results" USING btree ("scope_type","scope_name");--> statement-breakpoint
CREATE INDEX "migration_runs_status_created_idx" ON "migration_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "migration_runs_mode_created_idx" ON "migration_runs" USING btree ("mode","created_at");--> statement-breakpoint
CREATE INDEX "migration_runs_source_environment_idx" ON "migration_runs" USING btree ("source_environment");--> statement-breakpoint
CREATE UNIQUE INDEX "migration_source_files_run_logical_name_unique" ON "migration_source_files" USING btree ("migration_run_id","logical_name");--> statement-breakpoint
CREATE INDEX "migration_source_files_run_status_idx" ON "migration_source_files" USING btree ("migration_run_id","status");--> statement-breakpoint
CREATE INDEX "migration_source_files_sha256_idx" ON "migration_source_files" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "migration_source_records_source_target_unique" ON "migration_source_records" USING btree ("migration_run_id","source_collection","source_record_id","target_table","target_record_id");--> statement-breakpoint
CREATE INDEX "migration_source_records_target_idx" ON "migration_source_records" USING btree ("target_table","target_record_id");--> statement-breakpoint
CREATE INDEX "migration_source_records_run_disposition_idx" ON "migration_source_records" USING btree ("migration_run_id","disposition");--> statement-breakpoint
CREATE INDEX "migration_source_records_hash_idx" ON "migration_source_records" USING btree ("source_record_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_type_dedupe_unique" ON "background_jobs" USING btree ("type","dedupe_key");--> statement-breakpoint
CREATE INDEX "background_jobs_claim_idx" ON "background_jobs" USING btree ("status","available_at","priority","created_at");--> statement-breakpoint
CREATE INDEX "background_jobs_merchant_status_idx" ON "background_jobs" USING btree ("merchant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_attempts_job_number_unique" ON "job_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "job_attempts_job_started_idx" ON "job_attempts" USING btree ("job_id","started_at");--> statement-breakpoint
CREATE INDEX "job_attempts_status_started_idx" ON "job_attempts" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_dead_letters_job_occurrence_unique" ON "job_dead_letters" USING btree ("job_id","occurrence");--> statement-breakpoint
CREATE INDEX "job_dead_letters_created_idx" ON "job_dead_letters" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."subscriptions"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_batch_merchant_fk" FOREIGN KEY ("reply_batch_id","merchant_id") REFERENCES "public"."subscription_reply_batches"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ADD CONSTRAINT "reply_batches_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."subscriptions"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_merchant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_merchant_fk" FOREIGN KEY ("channel_id","merchant_id") REFERENCES "public"."merchant_channels"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_merchant_fk" FOREIGN KEY ("conversation_id","merchant_id") REFERENCES "public"."conversations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_channel_events" ADD CONSTRAINT "processed_channel_events_channel_merchant_fk" FOREIGN KEY ("channel_id","merchant_id") REFERENCES "public"."merchant_channels"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_conversation_merchant_fk" FOREIGN KEY ("conversation_id","merchant_id") REFERENCES "public"."conversations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."orders"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_merchant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_merchant_fk" FOREIGN KEY ("product_variant_id","merchant_id") REFERENCES "public"."product_variants"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_merchant_fk" FOREIGN KEY ("conversation_id","merchant_id") REFERENCES "public"."conversations"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ADD CONSTRAINT "reply_batches_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_conversation_merchant_unique" UNIQUE("id","conversation_id","merchant_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_amount_check" CHECK ("reply_ledger"."amount" > 0);--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_direction_check" CHECK ("reply_ledger"."direction" IN ('debit', 'credit'));--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_balance_check" CHECK ("reply_ledger"."balance_after" IS NULL OR "reply_ledger"."balance_after" >= 0);--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ADD CONSTRAINT "reply_batches_amount_check" CHECK ("subscription_reply_batches"."amount" > 0 AND "subscription_reply_batches"."remaining" >= 0 AND "subscription_reply_batches"."remaining" <= "subscription_reply_batches"."amount");--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ADD CONSTRAINT "reply_batches_expiry_check" CHECK ("subscription_reply_batches"."expires_at" > "subscription_reply_batches"."purchased_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_anchor_check" CHECK ("subscriptions"."billing_anchor_day" BETWEEN 1 AND 31);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_counters_check" CHECK ("subscriptions"."price_iqd" >= 0 AND "subscriptions"."base_reply_limit" >= 0 AND "subscriptions"."base_replies_used" >= 0 AND "subscriptions"."base_replies_remaining" >= 0 AND "subscriptions"."addon_replies_remaining" >= 0 AND "subscriptions"."emergency_credit_amount" >= 0 AND "subscriptions"."emergency_debt" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_base_usage_check" CHECK ("subscriptions"."base_replies_used" + "subscriptions"."base_replies_remaining" <= "subscriptions"."base_reply_limit");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_time_range_check" CHECK ("subscriptions"."expires_at" > "subscriptions"."starts_at" AND "subscriptions"."updated_at" >= "subscriptions"."created_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_version_check" CHECK ("subscriptions"."version" > 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_quantity_check" CHECK ("product_variants"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_timestamp_order_check" CHECK ("product_variants"."updated_at" >= "product_variants"."created_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_check" CHECK ("products"."original_price_iqd" >= 0 AND "products"."current_price_iqd" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_quantity_check" CHECK ("products"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_timestamp_order_check" CHECK ("products"."updated_at" >= "products"."created_at");--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_token_pair_check" CHECK (("merchant_channels"."token_ciphertext" IS NULL) = ("merchant_channels"."token_key_version" IS NULL));--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_timestamp_order_check" CHECK ("merchant_channels"."updated_at" >= "merchant_channels"."created_at");--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_disconnected_timestamp_check" CHECK ("merchant_channels"."disconnected_at" IS NULL OR "merchant_channels"."connected_at" IS NULL OR "merchant_channels"."disconnected_at" >= "merchant_channels"."connected_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_manual_assignment_check" CHECK (("conversations"."status" = 'manual') = "conversations"."assigned_to_human");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_timestamp_check" CHECK (("conversations"."status" <> 'closed') OR "conversations"."closed_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_timestamp_order_check" CHECK ("conversations"."updated_at" >= "conversations"."created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_timestamp_check" CHECK ("messages"."status" <> 'failed' OR ("messages"."failed_at" IS NOT NULL AND "messages"."failure_code" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "processed_channel_events" ADD CONSTRAINT "processed_channel_events_completed_time_check" CHECK ("processed_channel_events"."completed_at" IS NULL OR "processed_channel_events"."completed_at" >= "processed_channel_events"."received_at");--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_time_check" CHECK ("order_drafts"."updated_at" >= "order_drafts"."created_at" AND "order_drafts"."expires_at" > "order_drafts"."created_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_price_check" CHECK ("order_items"."quantity" > 0 AND "order_items"."unit_price_iqd" >= 0 AND "order_items"."line_total_iqd" = "order_items"."quantity" * "order_items"."unit_price_iqd");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_version_check" CHECK ("orders"."version" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_totals_check" CHECK ("orders"."subtotal_iqd" >= 0 AND "orders"."delivery_fee_iqd" >= 0 AND "orders"."total_iqd" = "orders"."subtotal_iqd" + "orders"."delivery_fee_iqd");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_status_check" CHECK (("orders"."payment_method" = 'cash_on_delivery' AND "orders"."payment_status" IN ('cash_on_delivery', 'paid')) OR ("orders"."payment_method" <> 'cash_on_delivery' AND "orders"."payment_status" <> 'cash_on_delivery'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_metadata_check" CHECK (("orders"."payment_status" = 'paid' AND "orders"."payment_verified_at" IS NOT NULL AND "orders"."payment_verified_by_account_id" IS NOT NULL AND "orders"."payment_rejection_reason" IS NULL) OR ("orders"."payment_status" = 'failed' AND "orders"."payment_verified_at" IS NULL AND "orders"."payment_verified_by_account_id" IS NULL AND "orders"."payment_rejection_reason" IS NOT NULL) OR ("orders"."payment_status" NOT IN ('paid', 'failed') AND "orders"."payment_verified_at" IS NULL AND "orders"."payment_verified_by_account_id" IS NULL AND "orders"."payment_rejection_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_lifecycle_timestamp_check" CHECK ("orders"."updated_at" >= "orders"."created_at");