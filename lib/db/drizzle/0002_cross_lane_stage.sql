CREATE TYPE "public"."auth_otp_purpose" AS ENUM('signup', 'password_reset', 'admin_recovery');--> statement-breakpoint
CREATE TYPE "public"."catalog_identifier_kind" AS ENUM('sku', 'barcode');--> statement-breakpoint
CREATE TYPE "public"."catalog_identifier_owner" AS ENUM('product', 'variant');--> statement-breakpoint
CREATE TYPE "public"."inventory_mutation_type" AS ENUM('set', 'adjust', 'variant_reconcile');--> statement-breakpoint
CREATE TYPE "public"."outbound_delivery_outcome" AS ENUM('pending', 'sent', 'confirmed_failed', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."reply_refund_state" AS ENUM('pending', 'refunded', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."reply_reservation_status" AS ENUM('reserved', 'consumed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_decision_actor" AS ENUM('merchant', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."payment_decision_channel" AS ENUM('electronic', 'cash_on_delivery');--> statement-breakpoint
CREATE TYPE "public"."payment_decision_operation" AS ENUM('confirm', 'reject', 'legacy_import');--> statement-breakpoint
CREATE TYPE "public"."payment_decision_outcome" AS ENUM('paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_approval_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."knowledge_embedding_kind" AS ENUM('saved_answer', 'learned_answer');--> statement-breakpoint
CREATE TYPE "public"."knowledge_suggested_reply_source" AS ENUM('merchant_draft', 'openai_generated');--> statement-breakpoint
CREATE TABLE "auth_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_account_id" text,
	"actor_kind" "account_kind",
	"subject_hash" text,
	"reason_code" text,
	"decision_code" text,
	"request_id_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_audit_events_subject_hash_check" CHECK ("auth_audit_events"."subject_hash" IS NULL OR char_length("auth_audit_events"."subject_hash") BETWEEN 32 AND 128),
	CONSTRAINT "auth_audit_events_request_hash_check" CHECK ("auth_audit_events"."request_id_hash" IS NULL OR char_length("auth_audit_events"."request_id_hash") BETWEEN 32 AND 128)
);
--> statement-breakpoint
CREATE TABLE "auth_otp_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"target_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"purpose" "auth_otp_purpose" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_after" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"superseded_by_challenge_id" text,
	CONSTRAINT "auth_otp_challenges_attempts_check" CHECK ("auth_otp_challenges"."attempts" >= 0 AND "auth_otp_challenges"."max_attempts" > 0 AND "auth_otp_challenges"."attempts" <= "auth_otp_challenges"."max_attempts"),
	CONSTRAINT "auth_otp_challenges_time_check" CHECK ("auth_otp_challenges"."expires_at" > "auth_otp_challenges"."created_at" AND "auth_otp_challenges"."resend_after" >= "auth_otp_challenges"."created_at" AND "auth_otp_challenges"."resend_after" < "auth_otp_challenges"."expires_at"),
	CONSTRAINT "auth_otp_challenges_terminal_state_check" CHECK (NOT ("auth_otp_challenges"."used_at" IS NOT NULL AND "auth_otp_challenges"."revoked_at" IS NOT NULL) AND ("auth_otp_challenges"."used_at" IS NULL OR ("auth_otp_challenges"."used_at" >= "auth_otp_challenges"."created_at" AND "auth_otp_challenges"."used_at" <= "auth_otp_challenges"."expires_at")) AND ("auth_otp_challenges"."revoked_at" IS NULL OR "auth_otp_challenges"."revoked_at" >= "auth_otp_challenges"."created_at") AND ("auth_otp_challenges"."superseded_by_challenge_id" IS NULL OR "auth_otp_challenges"."revoked_at" IS NOT NULL)),
	CONSTRAINT "auth_otp_challenges_target_hash_check" CHECK (char_length("auth_otp_challenges"."target_hash") BETWEEN 32 AND 128),
	CONSTRAINT "auth_otp_challenges_code_hash_check" CHECK (char_length("auth_otp_challenges"."code_hash") BETWEEN 32 AND 256),
	CONSTRAINT "auth_otp_challenges_ip_hash_check" CHECK (char_length("auth_otp_challenges"."ip_hash") BETWEEN 32 AND 128)
);
--> statement-breakpoint
CREATE TABLE "catalog_idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"operation" text NOT NULL,
	"key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"result_product_id" text,
	"result_version" integer,
	"result_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_idempotency_hash_check" CHECK (char_length("catalog_idempotency_keys"."key_hash") BETWEEN 32 AND 128 AND char_length("catalog_idempotency_keys"."request_hash") BETWEEN 32 AND 128),
	CONSTRAINT "catalog_idempotency_retention_check" CHECK ("catalog_idempotency_keys"."expires_at" > "catalog_idempotency_keys"."created_at" AND "catalog_idempotency_keys"."expires_at" <= "catalog_idempotency_keys"."created_at" + interval '30 days'),
	CONSTRAINT "catalog_idempotency_result_version_check" CHECK ("catalog_idempotency_keys"."result_version" IS NULL OR "catalog_idempotency_keys"."result_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_identifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"kind" "catalog_identifier_kind" NOT NULL,
	"normalized_value" text NOT NULL,
	"display_value" text NOT NULL,
	"owner_type" "catalog_identifier_owner" NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_identifiers_owner_check" CHECK (("catalog_identifiers"."owner_type" = 'product' AND "catalog_identifiers"."variant_id" IS NULL) OR ("catalog_identifiers"."owner_type" = 'variant' AND "catalog_identifiers"."variant_id" IS NOT NULL)),
	CONSTRAINT "catalog_identifiers_value_check" CHECK (char_length("catalog_identifiers"."normalized_value") > 0 AND char_length("catalog_identifiers"."display_value") > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_identifiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_image_references" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"url" text,
	"storage_key" text,
	"alt_text" text,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_image_refs_reference_check" CHECK ("catalog_image_references"."url" IS NOT NULL OR "catalog_image_references"."storage_key" IS NOT NULL),
	CONSTRAINT "catalog_image_refs_url_check" CHECK ("catalog_image_references"."url" IS NULL OR ("catalog_image_references"."url" ~ '^https?://' AND "catalog_image_references"."url" !~ '^data:' AND "catalog_image_references"."url" !~ '^blob:')),
	CONSTRAINT "catalog_image_refs_storage_key_check" CHECK ("catalog_image_references"."storage_key" IS NULL OR ("catalog_image_references"."storage_key" !~ '(^|/)..(/|$)' AND char_length("catalog_image_references"."storage_key") <= 1024)),
	CONSTRAINT "catalog_image_refs_ordinal_check" CHECK ("catalog_image_references"."ordinal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_image_references" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_variant_options" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"option_name" text NOT NULL,
	"normalized_option_name" text NOT NULL,
	"option_value" text NOT NULL,
	"normalized_option_value" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "catalog_variant_options_ordinal_check" CHECK ("catalog_variant_options"."ordinal" >= 0),
	CONSTRAINT "catalog_variant_options_normalized_check" CHECK (char_length("catalog_variant_options"."normalized_option_name") > 0 AND char_length("catalog_variant_options"."normalized_option_value") > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_variant_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory_mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"mutation_type" "inventory_mutation_type" NOT NULL,
	"before_quantity" integer NOT NULL,
	"after_quantity" integer NOT NULL,
	"expected_version" integer NOT NULL,
	"resulting_version" integer NOT NULL,
	"actor_type" text NOT NULL,
	"actor_account_id" text,
	"reason_code" text NOT NULL,
	"idempotency_key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_mutations_quantity_check" CHECK ("inventory_mutations"."before_quantity" >= 0 AND "inventory_mutations"."after_quantity" >= 0),
	CONSTRAINT "inventory_mutations_version_check" CHECK ("inventory_mutations"."expected_version" > 0 AND "inventory_mutations"."resulting_version" = "inventory_mutations"."expected_version" + 1),
	CONSTRAINT "inventory_mutations_hash_check" CHECK (char_length("inventory_mutations"."idempotency_key_hash") BETWEEN 32 AND 128 AND char_length("inventory_mutations"."request_hash") BETWEEN 32 AND 128)
);
--> statement-breakpoint
ALTER TABLE "inventory_mutations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "channel_inbound_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"provider" "channel_platform" NOT NULL,
	"external_event_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"enqueue_job_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueue_committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_inbound_events_id_merchant_unique" UNIQUE("id","merchant_id"),
	CONSTRAINT "channel_inbound_events_payload_hash_check" CHECK (char_length("channel_inbound_events"."payload_hash") BETWEEN 32 AND 128),
	CONSTRAINT "channel_inbound_events_enqueue_time_check" CHECK ("channel_inbound_events"."enqueue_committed_at" >= "channel_inbound_events"."received_at")
);
--> statement-breakpoint
ALTER TABLE "channel_inbound_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbound_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"inbound_event_id" text NOT NULL,
	"reservation_id" text,
	"reply_intent_id" text NOT NULL,
	"outcome" "outbound_delivery_outcome" DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"failure_code" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "outbound_deliveries_id_merchant_unique" UNIQUE("id","merchant_id"),
	CONSTRAINT "outbound_deliveries_outcome_check" CHECK (("outbound_deliveries"."outcome" = 'pending' AND "outbound_deliveries"."finalized_at" IS NULL AND "outbound_deliveries"."failure_code" IS NULL) OR ("outbound_deliveries"."outcome" = 'sent' AND "outbound_deliveries"."finalized_at" IS NOT NULL AND "outbound_deliveries"."failure_code" IS NULL) OR ("outbound_deliveries"."outcome" = 'confirmed_failed' AND "outbound_deliveries"."finalized_at" IS NOT NULL AND "outbound_deliveries"."failure_code" IS NOT NULL) OR ("outbound_deliveries"."outcome" = 'uncertain' AND "outbound_deliveries"."finalized_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reply_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"confirmed_failure_code" text NOT NULL,
	"state" "reply_refund_state" DEFAULT 'pending' NOT NULL,
	"credit_ledger_id" text,
	"balance_after_refund" integer,
	"conflict_code" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone,
	"conflict_at" timestamp with time zone,
	CONSTRAINT "reply_refunds_state_check" CHECK (("reply_refunds"."state" = 'pending' AND "reply_refunds"."credit_ledger_id" IS NULL AND "reply_refunds"."refunded_at" IS NULL AND "reply_refunds"."conflict_at" IS NULL) OR ("reply_refunds"."state" = 'refunded' AND "reply_refunds"."credit_ledger_id" IS NOT NULL AND "reply_refunds"."balance_after_refund" IS NOT NULL AND "reply_refunds"."refunded_at" IS NOT NULL AND "reply_refunds"."conflict_at" IS NULL) OR ("reply_refunds"."state" = 'conflict' AND "reply_refunds"."credit_ledger_id" IS NULL AND "reply_refunds"."refunded_at" IS NULL AND "reply_refunds"."conflict_at" IS NOT NULL AND "reply_refunds"."conflict_code" IS NOT NULL)),
	CONSTRAINT "reply_refunds_balance_check" CHECK ("reply_refunds"."balance_after_refund" IS NULL OR "reply_refunds"."balance_after_refund" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reply_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reply_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"inbound_event_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"reply_batch_id" text,
	"debit_ledger_id" text NOT NULL,
	"debit_source" text NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL,
	"balance_before_debit" integer NOT NULL,
	"balance_after_debit" integer NOT NULL,
	"status" "reply_reservation_status" DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	CONSTRAINT "reply_reservations_id_merchant_unique" UNIQUE("id","merchant_id"),
	CONSTRAINT "reply_reservations_balance_check" CHECK ("reply_reservations"."amount" > 0 AND "reply_reservations"."balance_before_debit" >= "reply_reservations"."amount" AND "reply_reservations"."balance_after_debit" = "reply_reservations"."balance_before_debit" - "reply_reservations"."amount"),
	CONSTRAINT "reply_reservations_source_check" CHECK (("reply_reservations"."debit_source" = 'base' AND "reply_reservations"."reply_batch_id" IS NULL) OR ("reply_reservations"."debit_source" IN ('purchase', 'emergency') AND "reply_reservations"."reply_batch_id" IS NOT NULL)),
	CONSTRAINT "reply_reservations_state_check" CHECK (("reply_reservations"."status" = 'reserved' AND "reply_reservations"."consumed_at" IS NULL AND "reply_reservations"."refunded_at" IS NULL) OR ("reply_reservations"."status" = 'consumed' AND "reply_reservations"."consumed_at" IS NOT NULL AND "reply_reservations"."refunded_at" IS NULL) OR ("reply_reservations"."status" = 'refunded' AND "reply_reservations"."refunded_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "reply_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_payment_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"order_id" text NOT NULL,
	"operation" "payment_decision_operation" NOT NULL,
	"payment_channel" "payment_decision_channel" NOT NULL,
	"outcome" "payment_decision_outcome" NOT NULL,
	"previous_order_status" "order_status" NOT NULL,
	"resulting_order_status" "order_status" NOT NULL,
	"previous_payment_status" "payment_status" NOT NULL,
	"resulting_payment_status" "payment_status" NOT NULL,
	"actor_type" "payment_decision_actor" NOT NULL,
	"actor_account_id" text,
	"actor_session_fingerprint" text,
	"request_id" text,
	"reason" text,
	"expected_version" integer NOT NULL,
	"resulting_version" integer NOT NULL,
	"source_file" text,
	"source_sha256" text,
	"migration_batch_id" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payment_decisions_id_merchant_unique" UNIQUE("id","merchant_id"),
	CONSTRAINT "order_payment_decisions_id_order_merchant_unique" UNIQUE("id","order_id","merchant_id"),
	CONSTRAINT "order_payment_decisions_version_check" CHECK ("order_payment_decisions"."expected_version" > 0 AND "order_payment_decisions"."resulting_version" = "order_payment_decisions"."expected_version" + 1),
	CONSTRAINT "order_payment_decisions_outcome_check" CHECK (("order_payment_decisions"."outcome" = 'paid' AND "order_payment_decisions"."resulting_payment_status" = 'paid') OR ("order_payment_decisions"."outcome" = 'failed' AND "order_payment_decisions"."resulting_payment_status" = 'failed')),
	CONSTRAINT "order_payment_decisions_actor_check" CHECK (("order_payment_decisions"."actor_type" IN ('merchant', 'admin') AND "order_payment_decisions"."actor_account_id" IS NOT NULL AND "order_payment_decisions"."operation" <> 'legacy_import') OR ("order_payment_decisions"."actor_type" = 'system' AND "order_payment_decisions"."actor_account_id" IS NULL AND "order_payment_decisions"."operation" = 'legacy_import')),
	CONSTRAINT "order_payment_decisions_actor_fingerprint_check" CHECK ("order_payment_decisions"."actor_session_fingerprint" IS NULL OR char_length("order_payment_decisions"."actor_session_fingerprint") BETWEEN 32 AND 128),
	CONSTRAINT "order_payment_decisions_reason_check" CHECK ("order_payment_decisions"."reason" IS NULL OR char_length("order_payment_decisions"."reason") <= 500),
	CONSTRAINT "order_payment_decisions_legacy_provenance_check" CHECK (("order_payment_decisions"."operation" <> 'legacy_import' AND "order_payment_decisions"."source_file" IS NULL AND "order_payment_decisions"."source_sha256" IS NULL AND "order_payment_decisions"."migration_batch_id" IS NULL) OR ("order_payment_decisions"."operation" = 'legacy_import' AND "order_payment_decisions"."source_file" IS NOT NULL AND "order_payment_decisions"."source_sha256" IS NOT NULL AND "order_payment_decisions"."migration_batch_id" IS NOT NULL AND char_length("order_payment_decisions"."source_sha256") BETWEEN 32 AND 128))
);
--> statement-breakpoint
ALTER TABLE "order_payment_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_terminal_decision_links" (
	"merchant_id" text NOT NULL,
	"order_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_terminal_decision_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"actor_account_id" text,
	"customer_text_hash" text,
	"customer_text_length" integer,
	"signal_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision_code" text,
	"outcome_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"knowledge_kind" "knowledge_embedding_kind" NOT NULL,
	"knowledge_id" text NOT NULL,
	"saved_answer_id" text,
	"learned_answer_id" text,
	"language" "interface_language" NOT NULL,
	"embedding_model" text NOT NULL,
	"content_hash" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding" real[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "background_job_payloads" (
	"job_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"ciphertext" text NOT NULL,
	"key_id" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_job_payloads_hash_check" CHECK (char_length("background_job_payloads"."payload_sha256") BETWEEN 32 AND 128)
);
--> statement-breakpoint
ALTER TABLE "background_job_payloads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "database_admin_access_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_account_id" text NOT NULL,
	"merchant_id" text,
	"reason_code" text NOT NULL,
	"request_hash" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "database_admin_access_request_hash_check" CHECK (char_length("database_admin_access_audits"."request_hash") BETWEEN 32 AND 128),
	CONSTRAINT "database_admin_access_duration_check" CHECK ("database_admin_access_audits"."expires_at" > "database_admin_access_audits"."started_at" AND "database_admin_access_audits"."expires_at" <= "database_admin_access_audits"."started_at" + interval '30 minutes')
);
--> statement-breakpoint
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchant_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reply_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learned_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "background_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_quantity_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_price_check";--> statement-breakpoint
ALTER TABLE "merchant_channels" DROP CONSTRAINT "merchant_channels_token_pair_check";--> statement-breakpoint
ALTER TABLE "merchant_channels" DROP CONSTRAINT "merchant_channels_disconnected_timestamp_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_metadata_check";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP CONSTRAINT "background_jobs_processing_has_lock";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP CONSTRAINT "background_jobs_nonprocessing_has_no_lock";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP CONSTRAINT "background_jobs_completed_has_timestamp";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP CONSTRAINT "background_jobs_dead_letter_has_timestamp";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP CONSTRAINT "background_jobs_attempts_nonnegative";--> statement-breakpoint
ALTER TABLE "job_attempts" DROP CONSTRAINT "job_attempts_valid_time_range";--> statement-breakpoint
ALTER TABLE "job_attempts" DROP CONSTRAINT "job_attempts_finished_status_has_timestamp";--> statement-breakpoint
ALTER TABLE "job_attempts" DROP CONSTRAINT "job_attempts_attempt_positive";--> statement-breakpoint
ALTER TABLE "merchant_settings" DROP CONSTRAINT "merchant_settings_free_delivery_threshold_check";--> statement-breakpoint
ALTER TABLE "merchant_settings" DROP CONSTRAINT "merchant_settings_delivery_days_check";--> statement-breakpoint
ALTER TABLE "merchant_settings" DROP CONSTRAINT "merchant_settings_payment_availability_check";--> statement-breakpoint
ALTER TABLE "learned_answers" DROP CONSTRAINT "learned_answers_training_request_id_training_requests_id_fk";
--> statement-breakpoint
DROP INDEX "product_variants_merchant_sku_unique";--> statement-breakpoint
DROP INDEX "products_merchant_sku_unique";--> statement-breakpoint
DROP INDEX "products_merchant_barcode_unique";--> statement-breakpoint
DROP INDEX "merchant_channels_merchant_platform_unique";--> statement-breakpoint
DROP INDEX "merchant_channels_token_expiry_idx";--> statement-breakpoint
DROP INDEX "account_sessions_expires_at_idx";--> statement-breakpoint
DROP INDEX "login_attempts_phone_created_idx";--> statement-breakpoint
DROP INDEX "login_attempts_account_created_idx";--> statement-breakpoint
DROP INDEX "learned_answers_merchant_intent_idx";--> statement-breakpoint
DROP INDEX "saved_answers_merchant_language_idx";--> statement-breakpoint
DROP INDEX "training_requests_merchant_normalized_idx";--> statement-breakpoint
DROP INDEX "background_jobs_merchant_status_idx";--> statement-breakpoint
DROP INDEX "product_variants_product_idx";--> statement-breakpoint
DROP INDEX "merchant_channels_page_unique";--> statement-breakpoint
DROP INDEX "learned_answers_training_request_unique";--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "device_label" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "device_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "session_version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "last_activity_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "last_activity_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "reason_code" SET DEFAULT 'legacy';--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "reason_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_devices" ALTER COLUMN "device_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_devices" ALTER COLUMN "label" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "trusted_devices" ALTER COLUMN "label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "background_jobs" ALTER COLUMN "result" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "background_jobs" ALTER COLUMN "result" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_dead_letters" ALTER COLUMN "reason_message" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_dead_letters" ALTER COLUMN "payload_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "password_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "security_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "normalized_external_ref" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "price_override_iqd" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "option_signature" text NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "normalized_external_ref" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "compare_at_price_iqd" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variant_stock_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "credential_ciphertext" text;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "credential_nonce" text;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "credential_auth_tag" text;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "credential_key_id" text;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "credential_algorithm" text;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD COLUMN "credential_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD COLUMN "profile_kind" "account_kind" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "profile_kind" "account_kind" DEFAULT 'merchant' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "device_fingerprint_hash" text;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "tenant_id" text DEFAULT 'legacy-unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "security_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "role_snapshot" text;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "permission_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "idle_expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "absolute_expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "rotate_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "replaced_by_session_id" text;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD COLUMN "target_hash" text DEFAULT 'legacy-unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD COLUMN "ip_hash" text DEFAULT 'legacy-unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD COLUMN "kind" "session_kind" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD COLUMN "device_fingerprint_hash" text DEFAULT 'legacy-unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD COLUMN "trust_slot" integer;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD COLUMN "revoked_by_account_id" text;--> statement-breakpoint
ALTER TABLE "learned_answers" ADD COLUMN "answer_text" text DEFAULT 'legacy-unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "learned_answers" ADD COLUMN "approval_status" "knowledge_approval_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "learned_answers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_answers" ADD COLUMN "normalized_question" text DEFAULT 'legacy-unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_answers" ADD COLUMN "source" "learned_answer_source" DEFAULT 'merchant_approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_answers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "customer_text_preview" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "customer_text_hash" text DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "customer_text_length" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "reason" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "suggested_reply_source" "knowledge_suggested_reply_source";--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "training_requests" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD COLUMN "payload_hash" text;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD COLUMN "requeue_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD COLUMN "settings_version" integer;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD COLUMN "lease_generation" integer;--> statement-breakpoint
ALTER TABLE "job_attempts" ADD COLUMN "lease_generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_dead_letters" ADD COLUMN "payload_sha256" text;--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" ADD CONSTRAINT "auth_otp_challenges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" ADD CONSTRAINT "auth_otp_challenges_supersession_fk" FOREIGN KEY ("superseded_by_challenge_id") REFERENCES "public"."auth_otp_challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_idempotency_keys" ADD CONSTRAINT "catalog_idempotency_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_idempotency_keys" ADD CONSTRAINT "catalog_idempotency_product_tenant_fk" FOREIGN KEY ("result_product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_identifiers" ADD CONSTRAINT "catalog_identifiers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_identifiers" ADD CONSTRAINT "catalog_identifiers_product_tenant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_identifiers" ADD CONSTRAINT "catalog_identifiers_variant_tenant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_image_references" ADD CONSTRAINT "catalog_image_references_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_image_references" ADD CONSTRAINT "catalog_image_refs_product_tenant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_image_references" ADD CONSTRAINT "catalog_image_refs_variant_tenant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variant_options" ADD CONSTRAINT "catalog_variant_options_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variant_options" ADD CONSTRAINT "catalog_variant_options_variant_tenant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD CONSTRAINT "inventory_mutations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD CONSTRAINT "inventory_mutations_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD CONSTRAINT "inventory_mutations_product_tenant_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD CONSTRAINT "inventory_mutations_variant_tenant_fk" FOREIGN KEY ("variant_id","product_id","merchant_id") REFERENCES "public"."product_variants"("id","product_id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inbound_events" ADD CONSTRAINT "channel_inbound_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inbound_events" ADD CONSTRAINT "channel_inbound_events_channel_merchant_fk" FOREIGN KEY ("channel_id","merchant_id") REFERENCES "public"."merchant_channels"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inbound_events" ADD CONSTRAINT "channel_inbound_events_job_merchant_fk" FOREIGN KEY ("enqueue_job_id","merchant_id") REFERENCES "public"."background_jobs"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_inbound_merchant_fk" FOREIGN KEY ("inbound_event_id","merchant_id") REFERENCES "public"."channel_inbound_events"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_reservation_merchant_fk" FOREIGN KEY ("reservation_id","merchant_id") REFERENCES "public"."reply_reservations"("id","merchant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_refunds" ADD CONSTRAINT "reply_refunds_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_refunds" ADD CONSTRAINT "reply_refunds_reservation_merchant_fk" FOREIGN KEY ("reservation_id","merchant_id") REFERENCES "public"."reply_reservations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_refunds" ADD CONSTRAINT "reply_refunds_ledger_merchant_fk" FOREIGN KEY ("credit_ledger_id","merchant_id") REFERENCES "public"."reply_ledger"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_reservations" ADD CONSTRAINT "reply_reservations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_reservations" ADD CONSTRAINT "reply_reservations_inbound_merchant_fk" FOREIGN KEY ("inbound_event_id","merchant_id") REFERENCES "public"."channel_inbound_events"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_reservations" ADD CONSTRAINT "reply_reservations_subscription_merchant_fk" FOREIGN KEY ("subscription_id","merchant_id") REFERENCES "public"."subscriptions"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_reservations" ADD CONSTRAINT "reply_reservations_batch_merchant_fk" FOREIGN KEY ("reply_batch_id","merchant_id") REFERENCES "public"."subscription_reply_batches"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_reservations" ADD CONSTRAINT "reply_reservations_ledger_merchant_fk" FOREIGN KEY ("debit_ledger_id","merchant_id") REFERENCES "public"."reply_ledger"("id","merchant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payment_decisions" ADD CONSTRAINT "order_payment_decisions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payment_decisions" ADD CONSTRAINT "order_payment_decisions_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payment_decisions" ADD CONSTRAINT "order_payment_decisions_order_merchant_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."orders"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_terminal_decision_links" ADD CONSTRAINT "order_terminal_decision_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_terminal_decision_links" ADD CONSTRAINT "order_terminal_decision_links_order_fk" FOREIGN KEY ("order_id","merchant_id") REFERENCES "public"."orders"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_terminal_decision_links" ADD CONSTRAINT "order_terminal_decision_links_decision_order_fk" FOREIGN KEY ("decision_id","order_id","merchant_id") REFERENCES "public"."order_payment_decisions"("id","order_id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_saved_answer_merchant_fk" FOREIGN KEY ("saved_answer_id","merchant_id") REFERENCES "public"."saved_answers"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_learned_answer_merchant_fk" FOREIGN KEY ("learned_answer_id","merchant_id") REFERENCES "public"."learned_answers"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_job_payloads" ADD CONSTRAINT "background_job_payloads_job_merchant_fk" FOREIGN KEY ("job_id","merchant_id") REFERENCES "public"."background_jobs"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_admin_access_audits" ADD CONSTRAINT "database_admin_access_audits_admin_account_id_admin_profiles_id_fk" FOREIGN KEY ("admin_account_id") REFERENCES "public"."admin_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_audit_events_event_created_idx" ON "auth_audit_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "auth_audit_events_actor_created_idx" ON "auth_audit_events" USING btree ("actor_account_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_audit_events_subject_created_idx" ON "auth_audit_events" USING btree ("subject_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_otp_challenges_live_target_purpose_unique" ON "auth_otp_challenges" USING btree ("target_hash","purpose") WHERE "auth_otp_challenges"."used_at" IS NULL AND "auth_otp_challenges"."revoked_at" IS NULL AND "auth_otp_challenges"."superseded_by_challenge_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_otp_challenges_superseded_by_unique" ON "auth_otp_challenges" USING btree ("superseded_by_challenge_id") WHERE "auth_otp_challenges"."superseded_by_challenge_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_otp_challenges_target_created_idx" ON "auth_otp_challenges" USING btree ("target_hash","purpose","created_at");--> statement-breakpoint
CREATE INDEX "auth_otp_challenges_ip_created_idx" ON "auth_otp_challenges" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_idempotency_merchant_operation_key_unique" ON "catalog_idempotency_keys" USING btree ("merchant_id","operation","key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_identifiers_merchant_kind_value_unique" ON "catalog_identifiers" USING btree ("merchant_id","kind","normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variant_options_variant_name_unique" ON "catalog_variant_options" USING btree ("merchant_id","variant_id","normalized_option_name");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_mutations_merchant_idempotency_unique" ON "inventory_mutations" USING btree ("merchant_id","idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "inventory_mutations_product_created_idx" ON "inventory_mutations" USING btree ("merchant_id","product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_inbound_events_provider_external_unique" ON "channel_inbound_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX "channel_inbound_events_merchant_received_idx" ON "channel_inbound_events" USING btree ("merchant_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_deliveries_reply_intent_unique" ON "outbound_deliveries" USING btree ("merchant_id","inbound_event_id","reply_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_refunds_reservation_unique" ON "reply_refunds" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_reservations_inbound_unique" ON "reply_reservations" USING btree ("inbound_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_reservations_merchant_external_unique" ON "reply_reservations" USING btree ("merchant_id","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payment_decisions_order_version_unique" ON "order_payment_decisions" USING btree ("merchant_id","order_id","resulting_version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payment_decisions_request_unique" ON "order_payment_decisions" USING btree ("merchant_id","request_id") WHERE "order_payment_decisions"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_payment_decisions_merchant_decided_idx" ON "order_payment_decisions" USING btree ("merchant_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_terminal_decision_links_order_unique" ON "order_terminal_decision_links" USING btree ("merchant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_terminal_decision_links_decision_unique" ON "order_terminal_decision_links" USING btree ("merchant_id","decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_identity_unique" ON "knowledge_embeddings" USING btree ("merchant_id","knowledge_kind","knowledge_id","embedding_model","content_hash");--> statement-breakpoint
CREATE INDEX "database_admin_access_admin_started_idx" ON "database_admin_access_audits" USING btree ("admin_account_id","started_at");--> statement-breakpoint
CREATE INDEX "database_admin_access_merchant_started_idx" ON "database_admin_access_audits" USING btree ("merchant_id","started_at");--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_account_kind_fk" FOREIGN KEY ("account_id","profile_kind") REFERENCES "public"."accounts"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_account_kind_fk" FOREIGN KEY ("account_id","profile_kind") REFERENCES "public"."accounts"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_replacement_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "public"."account_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_training_merchant_fk" FOREIGN KEY ("training_request_id","merchant_id") REFERENCES "public"."training_requests"("id","merchant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_signature_unique" ON "product_variants" USING btree ("merchant_id","product_id","option_signature");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_merchant_external_ref_unique" ON "product_variants" USING btree ("merchant_id","normalized_external_ref") WHERE "product_variants"."normalized_external_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_external_ref_unique" ON "products" USING btree ("merchant_id","normalized_external_ref") WHERE "products"."normalized_external_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_channels_merchant_platform_external_unique" ON "merchant_channels" USING btree ("merchant_id","platform","external_account_id") WHERE "merchant_channels"."external_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "merchant_channels_credential_expiry_idx" ON "merchant_channels" USING btree ("credential_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_sessions_replacement_unique" ON "account_sessions" USING btree ("replaced_by_session_id") WHERE "account_sessions"."replaced_by_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "account_sessions_active_expiry_idx" ON "account_sessions" USING btree ("status","idle_expires_at","absolute_expires_at");--> statement-breakpoint
CREATE INDEX "account_sessions_device_idx" ON "account_sessions" USING btree ("account_id","device_fingerprint_hash","status");--> statement-breakpoint
CREATE INDEX "login_attempts_target_created_idx" ON "login_attempts" USING btree ("target_hash","kind","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_created_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_expiry_idx" ON "login_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_account_fingerprint_unique" ON "trusted_devices" USING btree ("account_id","device_fingerprint_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_account_slot_unique" ON "trusted_devices" USING btree ("account_id","trust_slot") WHERE "trusted_devices"."trust_slot" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_answers_merchant_language_question_unique" ON "saved_answers" USING btree ("merchant_id","language","normalized_question");--> statement-breakpoint
CREATE INDEX "background_jobs_merchant_claim_idx" ON "background_jobs" USING btree ("merchant_id","type","status","available_at");--> statement-breakpoint
CREATE INDEX "background_jobs_lease_expiry_idx" ON "background_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("merchant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_channels_page_unique" ON "merchant_channels" USING btree ("page_id") WHERE "merchant_channels"."page_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "learned_answers_training_request_unique" ON "learned_answers" USING btree ("merchant_id","training_request_id") WHERE "learned_answers"."training_request_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_kind_unique" UNIQUE("id","kind");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_id_product_merchant_unique" UNIQUE("id","product_id","merchant_id");--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_password_version_check" CHECK ("accounts"."password_version" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_security_version_check" CHECK ("accounts"."security_version" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_session_version_check" CHECK ("accounts"."session_version" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_phone_shape_check" CHECK ("accounts"."phone" ~ '^07[0-9]{9}$');--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_timestamp_order_check" CHECK ("accounts"."updated_at" >= "accounts"."created_at");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_check" CHECK ("product_variants"."price_override_iqd" IS NULL OR "product_variants"."price_override_iqd" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_version_check" CHECK ("product_variants"."version" > 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_signature_check" CHECK (char_length("product_variants"."option_signature") BETWEEN 16 AND 256);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_external_ref_pair_check" CHECK (("product_variants"."external_ref" IS NULL) = ("product_variants"."normalized_external_ref" IS NULL));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_check" CHECK ("products"."quantity" >= 0 AND "products"."low_stock_threshold" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_version_check" CHECK ("products"."version" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_external_ref_pair_check" CHECK (("products"."external_ref" IS NULL) = ("products"."normalized_external_ref" IS NULL));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_check" CHECK ("products"."original_price_iqd" >= 0 AND "products"."current_price_iqd" >= 0 AND ("products"."compare_at_price_iqd" IS NULL OR "products"."compare_at_price_iqd" >= "products"."current_price_iqd"));--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_version_check" CHECK ("merchant_channels"."version" > 0);--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_credential_envelope_check" CHECK (("merchant_channels"."credential_ciphertext" IS NULL AND "merchant_channels"."credential_nonce" IS NULL AND "merchant_channels"."credential_auth_tag" IS NULL AND "merchant_channels"."credential_key_id" IS NULL AND "merchant_channels"."credential_algorithm" IS NULL) OR ("merchant_channels"."credential_ciphertext" IS NOT NULL AND "merchant_channels"."credential_nonce" IS NOT NULL AND "merchant_channels"."credential_auth_tag" IS NOT NULL AND "merchant_channels"."credential_key_id" IS NOT NULL AND "merchant_channels"."credential_algorithm" = 'aes-256-gcm'));--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_profile_kind_check" CHECK ("admin_profiles"."profile_kind" = 'admin' AND "admin_profiles"."id" = "admin_profiles"."account_id");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_profile_kind_check" CHECK ("merchants"."profile_kind" = 'merchant' AND "merchants"."id" = "merchants"."account_id");--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_versions_check" CHECK ("account_sessions"."session_version" > 0 AND "account_sessions"."security_version" > 0);--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_device_fingerprint_check" CHECK ("account_sessions"."device_fingerprint_hash" IS NULL OR char_length("account_sessions"."device_fingerprint_hash") BETWEEN 32 AND 128);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_metadata_check" CHECK (("orders"."payment_status" = 'paid' AND "orders"."payment_verified_at" IS NOT NULL AND "orders"."payment_rejection_reason" IS NULL) OR ("orders"."payment_status" = 'failed' AND "orders"."payment_verified_at" IS NULL AND "orders"."payment_verified_by_account_id" IS NULL AND "orders"."payment_rejection_reason" IS NOT NULL) OR ("orders"."payment_status" NOT IN ('paid', 'failed') AND "orders"."payment_verified_at" IS NULL AND "orders"."payment_verified_by_account_id" IS NULL AND "orders"."payment_rejection_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_version_check" CHECK ("learned_answers"."version" > 0);--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_safe_approval_check" CHECK (NOT "learned_answers"."safe_to_auto_reply" OR ("learned_answers"."source" = 'merchant_approved' AND "learned_answers"."approval_status" = 'approved'));--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_openai_cannot_approve_check" CHECK ("learned_answers"."source" <> 'openai_generated' OR ("learned_answers"."approval_status" <> 'approved' AND NOT "learned_answers"."safe_to_auto_reply"));--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_source_check" CHECK ("saved_answers"."source" = 'merchant_approved');--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_version_check" CHECK ("saved_answers"."version" > 0);--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_version_check" CHECK ("training_requests"."version" > 0);--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_settings_version_check" CHECK ("background_jobs"."settings_version" IS NULL OR "background_jobs"."settings_version" > 0);--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_attempts_nonnegative" CHECK ("background_jobs"."attempts" >= 0 AND "background_jobs"."requeue_count" >= 0);--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_attempt_positive" CHECK ("job_attempts"."attempt_number" > 0 AND "job_attempts"."lease_generation" > 0);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_delivery_areas_check" CHECK (jsonb_typeof("merchant_settings"."delivery_areas") = 'array' AND jsonb_array_length("merchant_settings"."delivery_areas") <= 100);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_delivery_notes_check" CHECK (char_length("merchant_settings"."delivery_notes") <= 1000);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_payment_methods_shape_check" CHECK (jsonb_typeof("merchant_settings"."payment_methods") = 'array' AND jsonb_array_length("merchant_settings"."payment_methods") BETWEEN 1 AND 5 AND "merchant_settings"."payment_methods" <@ '["cash_on_delivery","superqi","fastpay","zaincash","other"]'::jsonb);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_payment_method_consistency_check" CHECK ("merchant_settings"."cash_on_delivery_enabled" = ("merchant_settings"."payment_methods" @> '["cash_on_delivery"]'::jsonb) AND "merchant_settings"."electronic_payment_enabled" = (("merchant_settings"."payment_methods" @> '["superqi"]'::jsonb) OR ("merchant_settings"."payment_methods" @> '["fastpay"]'::jsonb) OR ("merchant_settings"."payment_methods" @> '["zaincash"]'::jsonb) OR ("merchant_settings"."payment_methods" @> '["other"]'::jsonb)));--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_payment_instructions_check" CHECK (char_length("merchant_settings"."payment_instructions") <= 2000);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_free_delivery_threshold_check" CHECK ("merchant_settings"."free_delivery_threshold_iqd" IS NULL OR "merchant_settings"."free_delivery_threshold_iqd" >= 0);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_delivery_days_check" CHECK ("merchant_settings"."delivery_estimated_days_min" > 0 AND "merchant_settings"."delivery_estimated_days_max" >= "merchant_settings"."delivery_estimated_days_min" AND "merchant_settings"."delivery_estimated_days_max" <= 30);--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_payment_availability_check" CHECK ("merchant_settings"."cash_on_delivery_enabled" OR "merchant_settings"."electronic_payment_enabled");--> statement-breakpoint
CREATE POLICY "product_variants_tenant_boundary" ON "product_variants" AS RESTRICTIVE FOR ALL TO public USING ((
    "product_variants"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "product_variants"."merchant_id")
    )
  )) WITH CHECK ((
    "product_variants"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "product_variants"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "products_tenant_boundary" ON "products" AS RESTRICTIVE FOR ALL TO public USING ((
    "products"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "products"."merchant_id")
    )
  )) WITH CHECK ((
    "products"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "products"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "merchant_channels_tenant_boundary" ON "merchant_channels" AS RESTRICTIVE FOR ALL TO public USING ((
    "merchant_channels"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_channels"."merchant_id")
    )
  )) WITH CHECK ((
    "merchant_channels"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_channels"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "conversations_tenant_boundary" ON "conversations" AS RESTRICTIVE FOR ALL TO public USING ((
    "conversations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "conversations"."merchant_id")
    )
  )) WITH CHECK ((
    "conversations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "conversations"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "messages_tenant_boundary" ON "messages" AS RESTRICTIVE FOR ALL TO public USING ((
    "messages"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "messages"."merchant_id")
    )
  )) WITH CHECK ((
    "messages"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "messages"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "reply_ledger_tenant_boundary" ON "reply_ledger" AS RESTRICTIVE FOR ALL TO public USING ((
    "reply_ledger"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "reply_ledger"."merchant_id")
    )
  )) WITH CHECK ((
    "reply_ledger"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "reply_ledger"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "subscription_reply_batches_tenant_boundary" ON "subscription_reply_batches" AS RESTRICTIVE FOR ALL TO public USING ((
    "subscription_reply_batches"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "subscription_reply_batches"."merchant_id")
    )
  )) WITH CHECK ((
    "subscription_reply_batches"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "subscription_reply_batches"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_boundary" ON "subscriptions" AS RESTRICTIVE FOR ALL TO public USING ((
    "subscriptions"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "subscriptions"."merchant_id")
    )
  )) WITH CHECK ((
    "subscriptions"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "subscriptions"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "orders_tenant_boundary" ON "orders" AS RESTRICTIVE FOR ALL TO public USING ((
    "orders"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "orders"."merchant_id")
    )
  )) WITH CHECK ((
    "orders"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "orders"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "learned_answers_tenant_boundary" ON "learned_answers" AS RESTRICTIVE FOR ALL TO public USING ((
    "learned_answers"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "learned_answers"."merchant_id")
    )
  )) WITH CHECK ((
    "learned_answers"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "learned_answers"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "saved_answers_tenant_boundary" ON "saved_answers" AS RESTRICTIVE FOR ALL TO public USING ((
    "saved_answers"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saved_answers"."merchant_id")
    )
  )) WITH CHECK ((
    "saved_answers"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "saved_answers"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "training_requests_tenant_boundary" ON "training_requests" AS RESTRICTIVE FOR ALL TO public USING ((
    "training_requests"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "training_requests"."merchant_id")
    )
  )) WITH CHECK ((
    "training_requests"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "training_requests"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "background_jobs_tenant_boundary" ON "background_jobs" AS RESTRICTIVE FOR ALL TO public USING ((
    "background_jobs"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "background_jobs"."merchant_id")
    )
  )) WITH CHECK ((
    "background_jobs"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "background_jobs"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "merchant_settings_tenant_boundary" ON "merchant_settings" AS RESTRICTIVE FOR ALL TO public USING ((
    "merchant_settings"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_settings"."merchant_id")
    )
  )) WITH CHECK ((
    "merchant_settings"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_settings"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "catalog_idempotency_keys_tenant_boundary" ON "catalog_idempotency_keys" AS RESTRICTIVE FOR ALL TO public USING ((
    "catalog_idempotency_keys"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_idempotency_keys"."merchant_id")
    )
  )) WITH CHECK ((
    "catalog_idempotency_keys"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_idempotency_keys"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "catalog_identifiers_tenant_boundary" ON "catalog_identifiers" AS RESTRICTIVE FOR ALL TO public USING ((
    "catalog_identifiers"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_identifiers"."merchant_id")
    )
  )) WITH CHECK ((
    "catalog_identifiers"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_identifiers"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "catalog_image_references_tenant_boundary" ON "catalog_image_references" AS RESTRICTIVE FOR ALL TO public USING ((
    "catalog_image_references"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_image_references"."merchant_id")
    )
  )) WITH CHECK ((
    "catalog_image_references"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_image_references"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "catalog_variant_options_tenant_boundary" ON "catalog_variant_options" AS RESTRICTIVE FOR ALL TO public USING ((
    "catalog_variant_options"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_variant_options"."merchant_id")
    )
  )) WITH CHECK ((
    "catalog_variant_options"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "catalog_variant_options"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "inventory_mutations_tenant_boundary" ON "inventory_mutations" AS RESTRICTIVE FOR ALL TO public USING ((
    "inventory_mutations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "inventory_mutations"."merchant_id")
    )
  )) WITH CHECK ((
    "inventory_mutations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "inventory_mutations"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "channel_inbound_events_tenant_boundary" ON "channel_inbound_events" AS RESTRICTIVE FOR ALL TO public USING ((
    "channel_inbound_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "channel_inbound_events"."merchant_id")
    )
  )) WITH CHECK ((
    "channel_inbound_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "channel_inbound_events"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "outbound_deliveries_tenant_boundary" ON "outbound_deliveries" AS RESTRICTIVE FOR ALL TO public USING ((
    "outbound_deliveries"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "outbound_deliveries"."merchant_id")
    )
  )) WITH CHECK ((
    "outbound_deliveries"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "outbound_deliveries"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "reply_refunds_tenant_boundary" ON "reply_refunds" AS RESTRICTIVE FOR ALL TO public USING ((
    "reply_refunds"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "reply_refunds"."merchant_id")
    )
  )) WITH CHECK ((
    "reply_refunds"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "reply_refunds"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "reply_reservations_tenant_boundary" ON "reply_reservations" AS RESTRICTIVE FOR ALL TO public USING ((
    "reply_reservations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "reply_reservations"."merchant_id")
    )
  )) WITH CHECK ((
    "reply_reservations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "reply_reservations"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "order_payment_decisions_tenant_boundary" ON "order_payment_decisions" AS RESTRICTIVE FOR ALL TO public USING ((
    "order_payment_decisions"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "order_payment_decisions"."merchant_id")
    )
  )) WITH CHECK ((
    "order_payment_decisions"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "order_payment_decisions"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "order_terminal_decision_links_tenant_boundary" ON "order_terminal_decision_links" AS RESTRICTIVE FOR ALL TO public USING ((
    "order_terminal_decision_links"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "order_terminal_decision_links"."merchant_id")
    )
  )) WITH CHECK ((
    "order_terminal_decision_links"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "order_terminal_decision_links"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "knowledge_audit_events_tenant_boundary" ON "knowledge_audit_events" AS RESTRICTIVE FOR ALL TO public USING ((
    "knowledge_audit_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "knowledge_audit_events"."merchant_id")
    )
  )) WITH CHECK ((
    "knowledge_audit_events"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "knowledge_audit_events"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "knowledge_embeddings_tenant_boundary" ON "knowledge_embeddings" AS RESTRICTIVE FOR ALL TO public USING ((
    "knowledge_embeddings"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "knowledge_embeddings"."merchant_id")
    )
  )) WITH CHECK ((
    "knowledge_embeddings"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "knowledge_embeddings"."merchant_id")
    )
  ));--> statement-breakpoint
CREATE POLICY "background_job_payloads_tenant_boundary" ON "background_job_payloads" AS RESTRICTIVE FOR ALL TO public USING ((
    "background_job_payloads"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "background_job_payloads"."merchant_id")
    )
  )) WITH CHECK ((
    "background_job_payloads"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "background_job_payloads"."merchant_id")
    )
  ));