CREATE TYPE "public"."account_kind" AS ENUM('merchant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."account_state" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."merchant_account_status" AS ENUM('pending_review', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."admin_permission" AS ENUM('view_merchants', 'manage_merchant_status', 'manage_subscriptions', 'manage_channels', 'view_logs', 'inspect_merchant_sessions', 'manage_support');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner_admin', 'assistant_admin');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_kind" AS ENUM('account', 'system', 'external');--> statement-breakpoint
CREATE TYPE "public"."channel_platform" AS ENUM('messenger', 'instagram', 'whatsapp', 'telegram', 'tiktok', 'web_chat');--> statement-breakpoint
CREATE TYPE "public"."channel_status" AS ENUM('connected', 'disconnected', 'pending', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."consent_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('auto_replying', 'needs_reply', 'manual', 'closed');--> statement-breakpoint
CREATE TYPE "public"."device_trust_status" AS ENUM('pending', 'trusted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."emergency_access_status" AS ENUM('pending', 'active', 'rejected', 'expired', 'ended');--> statement-breakpoint
CREATE TYPE "public"."emergency_activation_mode" AS ENUM('owner_approval', 'critical_self_activation', 'owner_direct_activation');--> statement-breakpoint
CREATE TYPE "public"."emergency_severity" AS ENUM('high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."inspection_mode" AS ENUM('live_observation', 'independent_read_only');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."interface_language" AS ENUM('ar', 'ku', 'en');--> statement-breakpoint
CREATE TYPE "public"."learned_answer_source" AS ENUM('merchant_approved', 'openai_generated');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('pending_activation', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('customer', 'fawri', 'merchant', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('received', 'queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('merchant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('pending_review', 'awaiting_channel', 'channel_connected', 'activation_expired');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'pending_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'out_of_stock', 'waiting_customer_approval');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash_on_delivery', 'superqi', 'fastpay', 'zaincash', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('cash_on_delivery', 'electronic_pending', 'manual_review', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."preview_session_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."reply_batch_source" AS ENUM('purchase', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."reply_type" AS ENUM('ai', 'database', 'fallback', 'manual', 'system');--> statement-breakpoint
CREATE TYPE "public"."saved_answer_category" AS ENUM('delivery', 'payment', 'return_exchange', 'product', 'warranty', 'custom');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('merchant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."signup_source" AS ENUM('landing_trial', 'landing_plan', 'login', 'direct');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('silver', 'gold', 'diamond', 'trial');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending_activation', 'active', 'expired', 'replies_exhausted', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."support_sender_type" AS ENUM('merchant', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_waiting_on" AS ENUM('admin', 'merchant');--> statement-breakpoint
CREATE TYPE "public"."training_status" AS ENUM('pending_merchant_reply', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."trial_status" AS ENUM('eligible', 'not_started', 'active', 'expired', 'already_used', 'ineligible');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "account_kind" NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"state" "account_state" DEFAULT 'active' NOT NULL,
	"language" "interface_language" DEFAULT 'ar' NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"session_version" integer DEFAULT 1 NOT NULL,
	"suspended_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_permissions" (
	"admin_id" text NOT NULL,
	"permission" "admin_permission" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_admin_id" text,
	CONSTRAINT "admin_permissions_admin_id_permission_pk" PRIMARY KEY("admin_id","permission")
);
--> statement-breakpoint
CREATE TABLE "admin_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"owner_name" text NOT NULL,
	"store_name" text NOT NULL,
	"activity_type" text NOT NULL,
	"status" "merchant_status" DEFAULT 'pending_activation' NOT NULL,
	"account_status" "merchant_account_status" DEFAULT 'pending_review' NOT NULL,
	"onboarding_status" "onboarding_status" DEFAULT 'pending_review' NOT NULL,
	"trial_status" "trial_status" DEFAULT 'eligible' NOT NULL,
	"signup_source" "signup_source" DEFAULT 'direct' NOT NULL,
	"requested_plan" "subscription_plan",
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"first_channel_connected_at" timestamp with time zone,
	"channel_activation_deadline" timestamp with time zone,
	"trial_started_at" timestamp with time zone,
	"trial_expires_at" timestamp with time zone,
	"last_subscription_ended_at" timestamp with time zone,
	"retention_status" text,
	"warning_stage" integer DEFAULT 0 NOT NULL,
	"products_read_only" boolean DEFAULT false NOT NULL,
	"retention_suspended_at" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"eligible_for_deletion_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" "session_kind" NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"token_hash" text NOT NULL,
	"device_id" text,
	"device_label" text,
	"user_agent" text,
	"ip_address" text,
	"session_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" text,
	"revoke_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"phone" text,
	"kind" "session_kind" NOT NULL,
	"success" boolean NOT NULL,
	"reason_code" text,
	"device_id" text,
	"device_label" text,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"device_id" text NOT NULL,
	"label" text,
	"user_agent" text,
	"status" "device_trust_status" DEFAULT 'pending' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trusted_at" timestamp with time zone,
	"trusted_by_account_id" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reply_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"subscription_id" text,
	"reply_batch_id" text,
	"direction" text NOT NULL,
	"amount" integer NOT NULL,
	"reason_code" text NOT NULL,
	"external_event_id" text,
	"message_id" text,
	"balance_after" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_reply_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"source" "reply_batch_source" NOT NULL,
	"amount" integer NOT NULL,
	"remaining" integer NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"expiry_reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"plan_name" "subscription_plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'pending_activation' NOT NULL,
	"price_iqd" integer DEFAULT 0 NOT NULL,
	"billing_anchor_day" integer NOT NULL,
	"base_reply_limit" integer DEFAULT 0 NOT NULL,
	"base_replies_used" integer DEFAULT 0 NOT NULL,
	"base_replies_remaining" integer DEFAULT 0 NOT NULL,
	"addon_replies_remaining" integer DEFAULT 0 NOT NULL,
	"emergency_credit_amount" integer DEFAULT 0 NOT NULL,
	"emergency_credit_activated" boolean DEFAULT false NOT NULL,
	"emergency_debt" integer DEFAULT 0 NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"expiry_reminder_sent_at" timestamp with time zone,
	"expired_notification_sent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"color" text,
	"size" text,
	"sku" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"price_adjustment_iqd" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"sku" text,
	"barcode" text,
	"category" text,
	"description" text,
	"original_price_iqd" integer DEFAULT 0 NOT NULL,
	"current_price_iqd" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"allow_fawri_reply" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merchant_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"status" "channel_status" DEFAULT 'pending' NOT NULL,
	"external_account_id" text,
	"external_account_name" text,
	"page_id" text,
	"page_name" text,
	"instagram_account_id" text,
	"instagram_username" text,
	"token_ciphertext" text,
	"token_key_version" text,
	"token_expires_at" timestamp with time zone,
	"webhook_subscribed_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"external_conversation_id" text,
	"customer_external_id" text NOT NULL,
	"customer_name" text,
	"customer_handle" text,
	"status" "conversation_status" DEFAULT 'auto_replying' NOT NULL,
	"assigned_to_human" boolean DEFAULT false NOT NULL,
	"assigned_account_id" text,
	"needs_training" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"external_message_id" text,
	"external_event_id" text,
	"sender" "message_sender" NOT NULL,
	"text" text NOT NULL,
	"status" "message_status" NOT NULL,
	"reply_type" "reply_type",
	"counted_as_auto_reply" boolean DEFAULT false NOT NULL,
	"failure_code" text,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_channel_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"processing_status" text NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"customer_external_id" text NOT NULL,
	"awaiting_field" text NOT NULL,
	"draft_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"product_id" text,
	"product_variant_id" text,
	"product_name_snapshot" text NOT NULL,
	"variant_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_iqd" integer NOT NULL,
	"line_total_iqd" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"conversation_id" text,
	"customer_external_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_address" text,
	"customer_area" text,
	"status" "order_status" DEFAULT 'pending_confirmation' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash_on_delivery' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'cash_on_delivery' NOT NULL,
	"subtotal_iqd" integer DEFAULT 0 NOT NULL,
	"delivery_fee_iqd" integer DEFAULT 0 NOT NULL,
	"total_iqd" integer DEFAULT 0 NOT NULL,
	"source_channel" text NOT NULL,
	"notes" text,
	"payment_verified_at" timestamp with time zone,
	"payment_verified_by_account_id" text,
	"payment_rejection_reason" text,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learned_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"training_request_id" text,
	"intent" text NOT NULL,
	"language" text NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply" text NOT NULL,
	"source" "learned_answer_source" NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0' NOT NULL,
	"safe_to_auto_reply" boolean DEFAULT false NOT NULL,
	"requires_human_approval" boolean DEFAULT true NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"category" "saved_answer_category" NOT NULL,
	"question_pattern" text NOT NULL,
	"normalized_question_pattern" text NOT NULL,
	"answer_text" text NOT NULL,
	"product_id" text,
	"language" "interface_language" NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"conversation_id" text,
	"customer_external_id" text,
	"customer_message" text NOT NULL,
	"normalized_message" text NOT NULL,
	"detected_intent" text NOT NULL,
	"detected_language" text NOT NULL,
	"reason_code" text NOT NULL,
	"suggested_reply" text,
	"merchant_reply" text,
	"status" "training_status" DEFAULT 'pending_merchant_reply' NOT NULL,
	"reviewed_by_account_id" text,
	"reviewed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_inspection_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"admin_account_id" text NOT NULL,
	"mode" "inspection_mode" NOT NULL,
	"reason" text NOT NULL,
	"status" "inspection_status" DEFAULT 'pending' NOT NULL,
	"consent_decision" "consent_decision",
	"read_only" boolean DEFAULT true NOT NULL,
	"session_duration_minutes" integer DEFAULT 30 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"sender_type" "support_sender_type" NOT NULL,
	"sender_account_id" text,
	"sender_name_snapshot" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_preview_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"admin_account_id" text NOT NULL,
	"admin_session_id" text,
	"status" "preview_session_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"viewed_sections" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"assigned_admin_account_id" text,
	"waiting_on" "support_waiting_on",
	"waiting_since" timestamp with time zone,
	"merchant_reminder_sent_at" timestamp with time zone,
	"assistant_reminder_sent_at" timestamp with time zone,
	"owner_escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"merchant_id" text,
	"account_id" text,
	"type" text NOT NULL,
	"title_key" text NOT NULL,
	"body_key" text NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_entity_type" text,
	"source_entity_id" text,
	"read_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_kind" "audit_actor_kind" NOT NULL,
	"actor_account_id" text,
	"merchant_id" text,
	"action_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"reason_code" text,
	"details" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"previous_hash" text,
	"event_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"requested_by_admin_account_id" text NOT NULL,
	"incident_reference" text NOT NULL,
	"severity" "emergency_severity" NOT NULL,
	"reason" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"status" "emergency_access_status" DEFAULT 'pending' NOT NULL,
	"activation_mode" "emergency_activation_mode" NOT NULL,
	"reviewed_by_owner_account_id" text,
	"admin_session_id" text,
	"request_expires_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"first_viewed_at" timestamp with time zone,
	"viewed_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_authorizations" (
	"admin_account_id" text PRIMARY KEY NOT NULL,
	"can_request" boolean DEFAULT false NOT NULL,
	"can_critical_self_activate" boolean DEFAULT false NOT NULL,
	"granted_by_owner_account_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emergency_merchant_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"accessed_by_admin_account_id" text,
	"incident_reference" text NOT NULL,
	"activation_mode" "emergency_activation_mode" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_owner_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"type" text NOT NULL,
	"title_key" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_admin_id_admin_profiles_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_granted_by_admin_id_admin_profiles_id_fk" FOREIGN KEY ("granted_by_admin_id") REFERENCES "public"."admin_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_trusted_by_account_id_accounts_id_fk" FOREIGN KEY ("trusted_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_ledger" ADD CONSTRAINT "reply_ledger_reply_batch_id_subscription_reply_batches_id_fk" FOREIGN KEY ("reply_batch_id") REFERENCES "public"."subscription_reply_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ADD CONSTRAINT "subscription_reply_batches_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_reply_batches" ADD CONSTRAINT "subscription_reply_batches_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_merchant_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."merchant_channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_account_id_accounts_id_fk" FOREIGN KEY ("assigned_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_channel_events" ADD CONSTRAINT "processed_channel_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_channel_events" ADD CONSTRAINT "processed_channel_events_channel_id_merchant_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."merchant_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_verified_by_account_id_accounts_id_fk" FOREIGN KEY ("payment_verified_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_training_request_id_training_requests_id_fk" FOREIGN KEY ("training_request_id") REFERENCES "public"."training_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_reviewed_by_account_id_accounts_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_id_support_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_inspection_requests" ADD CONSTRAINT "support_inspection_requests_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_inspection_requests" ADD CONSTRAINT "support_inspection_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_inspection_requests" ADD CONSTRAINT "support_inspection_requests_admin_account_id_accounts_id_fk" FOREIGN KEY ("admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_account_id_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_preview_sessions" ADD CONSTRAINT "support_preview_sessions_request_id_support_inspection_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."support_inspection_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_preview_sessions" ADD CONSTRAINT "support_preview_sessions_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_preview_sessions" ADD CONSTRAINT "support_preview_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_preview_sessions" ADD CONSTRAINT "support_preview_sessions_admin_account_id_accounts_id_fk" FOREIGN KEY ("admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_preview_sessions" ADD CONSTRAINT "support_preview_sessions_admin_session_id_account_sessions_id_fk" FOREIGN KEY ("admin_session_id") REFERENCES "public"."account_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_account_id_accounts_id_fk" FOREIGN KEY ("assigned_admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_requests" ADD CONSTRAINT "emergency_access_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_requests" ADD CONSTRAINT "emergency_access_requests_requested_by_admin_account_id_accounts_id_fk" FOREIGN KEY ("requested_by_admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_requests" ADD CONSTRAINT "emergency_access_requests_reviewed_by_owner_account_id_accounts_id_fk" FOREIGN KEY ("reviewed_by_owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_requests" ADD CONSTRAINT "emergency_access_requests_admin_session_id_account_sessions_id_fk" FOREIGN KEY ("admin_session_id") REFERENCES "public"."account_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_authorizations" ADD CONSTRAINT "emergency_authorizations_admin_account_id_accounts_id_fk" FOREIGN KEY ("admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_authorizations" ADD CONSTRAINT "emergency_authorizations_granted_by_owner_account_id_accounts_id_fk" FOREIGN KEY ("granted_by_owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_merchant_notices" ADD CONSTRAINT "emergency_merchant_notices_request_id_emergency_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."emergency_access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_merchant_notices" ADD CONSTRAINT "emergency_merchant_notices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_merchant_notices" ADD CONSTRAINT "emergency_merchant_notices_accessed_by_admin_account_id_accounts_id_fk" FOREIGN KEY ("accessed_by_admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_owner_alerts" ADD CONSTRAINT "emergency_owner_alerts_request_id_emergency_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."emergency_access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_phone_unique" ON "accounts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "accounts_kind_state_idx" ON "accounts" USING btree ("kind","state");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_profiles_account_unique" ON "admin_profiles" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "admin_profiles_role_idx" ON "admin_profiles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_account_unique" ON "merchants" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "merchants_status_idx" ON "merchants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merchants_retention_status_idx" ON "merchants" USING btree ("retention_status");--> statement-breakpoint
CREATE UNIQUE INDEX "account_sessions_token_hash_unique" ON "account_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_sessions_account_status_idx" ON "account_sessions" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "account_sessions_expires_at_idx" ON "account_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_attempts_phone_created_idx" ON "login_attempts" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_account_created_idx" ON "login_attempts" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_account_device_unique" ON "trusted_devices" USING btree ("account_id","device_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_status_idx" ON "trusted_devices" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_ledger_external_event_unique" ON "reply_ledger" USING btree ("external_event_id") WHERE "reply_ledger"."external_event_id" is not null;--> statement-breakpoint
CREATE INDEX "reply_ledger_merchant_created_idx" ON "reply_ledger" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "reply_batches_consumption_idx" ON "subscription_reply_batches" USING btree ("subscription_id","expires_at","purchased_at");--> statement-breakpoint
CREATE INDEX "reply_batches_merchant_expiry_idx" ON "subscription_reply_batches" USING btree ("merchant_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_merchant_unique" ON "subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_expiry_idx" ON "subscriptions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_merchant_sku_unique" ON "product_variants" USING btree ("merchant_id","sku");--> statement-breakpoint
CREATE INDEX "products_merchant_name_idx" ON "products" USING btree ("merchant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_sku_unique" ON "products" USING btree ("merchant_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_barcode_unique" ON "products" USING btree ("merchant_id","barcode");--> statement-breakpoint
CREATE INDEX "products_merchant_status_idx" ON "products" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_channels_merchant_platform_unique" ON "merchant_channels" USING btree ("merchant_id","platform","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_channels_page_unique" ON "merchant_channels" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "merchant_channels_merchant_status_idx" ON "merchant_channels" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "merchant_channels_token_expiry_idx" ON "merchant_channels" USING btree ("token_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_merchant_channel_customer_unique" ON "conversations" USING btree ("merchant_id","channel_id","customer_external_id");--> statement-breakpoint
CREATE INDEX "conversations_merchant_updated_idx" ON "conversations" USING btree ("merchant_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_merchant_status_idx" ON "conversations" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_merchant_external_message_unique" ON "messages" USING btree ("merchant_id","external_message_id") WHERE "messages"."external_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_merchant_external_event_unique" ON "messages" USING btree ("merchant_id","external_event_id") WHERE "messages"."external_event_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_merchant_created_idx" ON "messages" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_channel_events_channel_external_unique" ON "processed_channel_events" USING btree ("channel_id","external_event_id");--> statement-breakpoint
CREATE INDEX "processed_channel_events_status_received_idx" ON "processed_channel_events" USING btree ("processing_status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_drafts_conversation_unique" ON "order_drafts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "order_drafts_expiry_idx" ON "order_drafts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_merchant_product_idx" ON "order_items" USING btree ("merchant_id","product_id");--> statement-breakpoint
CREATE INDEX "orders_merchant_created_idx" ON "orders" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_merchant_status_idx" ON "orders" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "orders_conversation_idx" ON "orders" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learned_answers_training_request_unique" ON "learned_answers" USING btree ("training_request_id");--> statement-breakpoint
CREATE INDEX "learned_answers_merchant_intent_idx" ON "learned_answers" USING btree ("merchant_id","intent","language","safe_to_auto_reply");--> statement-breakpoint
CREATE INDEX "saved_answers_merchant_language_idx" ON "saved_answers" USING btree ("merchant_id","language","active");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_answers_merchant_language_pattern_unique" ON "saved_answers" USING btree ("merchant_id","language","normalized_question_pattern");--> statement-breakpoint
CREATE INDEX "training_requests_merchant_status_idx" ON "training_requests" USING btree ("merchant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "training_requests_merchant_normalized_idx" ON "training_requests" USING btree ("merchant_id","normalized_message");--> statement-breakpoint
CREATE UNIQUE INDEX "support_attachments_storage_key_unique" ON "support_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "support_attachments_ticket_idx" ON "support_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "inspection_requests_ticket_status_idx" ON "support_inspection_requests" USING btree ("ticket_id","status");--> statement-breakpoint
CREATE INDEX "inspection_requests_merchant_created_idx" ON "support_inspection_requests" USING btree ("merchant_id","requested_at");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_created_idx" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_messages_merchant_created_idx" ON "support_messages" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_preview_sessions_request_unique" ON "support_preview_sessions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "support_preview_sessions_status_expiry_idx" ON "support_preview_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "support_preview_sessions_admin_status_idx" ON "support_preview_sessions" USING btree ("admin_account_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_merchant_status_idx" ON "support_tickets" USING btree ("merchant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_status_idx" ON "support_tickets" USING btree ("assigned_admin_account_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "notifications_merchant_unread_idx" ON "notifications" USING btree ("merchant_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_account_unread_idx" ON "notifications" USING btree ("account_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_source_idx" ON "notifications" USING btree ("source_entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_account_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_merchant_created_idx" ON "audit_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_created_idx" ON "audit_events" USING btree ("action_type","created_at");--> statement-breakpoint
CREATE INDEX "emergency_requests_merchant_status_idx" ON "emergency_access_requests" USING btree ("merchant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "emergency_requests_admin_status_idx" ON "emergency_access_requests" USING btree ("requested_by_admin_account_id","status","created_at");--> statement-breakpoint
CREATE INDEX "emergency_authorizations_active_idx" ON "emergency_authorizations" USING btree ("can_request","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_merchant_notice_request_unique" ON "emergency_merchant_notices" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "emergency_merchant_notices_unread_idx" ON "emergency_merchant_notices" USING btree ("merchant_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_owner_alert_request_type_unique" ON "emergency_owner_alerts" USING btree ("request_id","type");--> statement-breakpoint
CREATE INDEX "emergency_owner_alerts_unread_idx" ON "emergency_owner_alerts" USING btree ("read_at","created_at");