ALTER TABLE "saved_answers" DROP CONSTRAINT "saved_answers_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "training_requests" DROP CONSTRAINT "training_requests_conversation_id_conversations_id_fk";
--> statement-breakpoint
DROP INDEX "trusted_devices_account_device_unique";--> statement-breakpoint
DROP INDEX "reply_ledger_external_event_unique";--> statement-breakpoint
DROP INDEX "saved_answers_merchant_language_pattern_unique";--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "security_version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "idle_expires_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "absolute_expires_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account_sessions" ALTER COLUMN "rotate_after" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "target_hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "ip_hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "reason_code" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "login_attempts" ALTER COLUMN "expires_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "trusted_devices" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "trusted_devices" ALTER COLUMN "device_fingerprint_hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "learned_answers" ALTER COLUMN "language" SET DATA TYPE "public"."interface_language" USING "language"::"public"."interface_language";--> statement-breakpoint
ALTER TABLE "learned_answers" ALTER COLUMN "answer_text" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "saved_answers" ALTER COLUMN "normalized_question" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "training_requests" ALTER COLUMN "customer_text_preview" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "training_requests" ALTER COLUMN "customer_text_hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "training_requests" ALTER COLUMN "customer_text_length" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "training_requests" ALTER COLUMN "detected_language" SET DATA TYPE "public"."interface_language" USING "detected_language"::"public"."interface_language";--> statement-breakpoint
ALTER TABLE "training_requests" ALTER COLUMN "reason" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "job_attempts" ALTER COLUMN "lease_generation" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_ledger_external_event_direction_unique" ON "reply_ledger" USING btree ("external_event_id","direction") WHERE "reply_ledger"."external_event_id" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_audit_events_merchant_created_idx" ON "knowledge_audit_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_tenant_model_idx" ON "knowledge_embeddings" USING btree ("merchant_id","embedding_model","language");--> statement-breakpoint
CREATE INDEX "learned_answers_merchant_retrieval_idx" ON "learned_answers" USING btree ("merchant_id","language","approval_status","safe_to_auto_reply");--> statement-breakpoint
CREATE INDEX "saved_answers_merchant_active_idx" ON "saved_answers" USING btree ("merchant_id","language","active");--> statement-breakpoint
CREATE INDEX "training_requests_merchant_digest_idx" ON "training_requests" USING btree ("merchant_id","customer_text_hash");--> statement-breakpoint
ALTER TABLE "merchant_channels" DROP COLUMN "token_ciphertext";--> statement-breakpoint
ALTER TABLE "merchant_channels" DROP COLUMN "token_key_version";--> statement-breakpoint
ALTER TABLE "merchant_channels" DROP COLUMN "token_expires_at";--> statement-breakpoint
ALTER TABLE "account_sessions" DROP COLUMN "device_id";--> statement-breakpoint
ALTER TABLE "account_sessions" DROP COLUMN "user_agent";--> statement-breakpoint
ALTER TABLE "account_sessions" DROP COLUMN "ip_address";--> statement-breakpoint
ALTER TABLE "account_sessions" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "login_attempts" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "login_attempts" DROP COLUMN "device_id";--> statement-breakpoint
ALTER TABLE "login_attempts" DROP COLUMN "device_label";--> statement-breakpoint
ALTER TABLE "login_attempts" DROP COLUMN "user_agent";--> statement-breakpoint
ALTER TABLE "login_attempts" DROP COLUMN "ip_address";--> statement-breakpoint
ALTER TABLE "trusted_devices" DROP COLUMN "device_id";--> statement-breakpoint
ALTER TABLE "trusted_devices" DROP COLUMN "user_agent";--> statement-breakpoint
ALTER TABLE "learned_answers" DROP COLUMN "reply";--> statement-breakpoint
ALTER TABLE "learned_answers" DROP COLUMN "requires_human_approval";--> statement-breakpoint
ALTER TABLE "learned_answers" DROP COLUMN "conditions";--> statement-breakpoint
ALTER TABLE "learned_answers" DROP COLUMN "usage_count";--> statement-breakpoint
ALTER TABLE "learned_answers" DROP COLUMN "last_used_at";--> statement-breakpoint
ALTER TABLE "saved_answers" DROP COLUMN "normalized_question_pattern";--> statement-breakpoint
ALTER TABLE "saved_answers" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "saved_answers" DROP COLUMN "approved";--> statement-breakpoint
ALTER TABLE "saved_answers" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "saved_answers" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "conversation_id";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "customer_external_id";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "customer_message";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "normalized_message";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "reason_code";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "merchant_reply";--> statement-breakpoint
ALTER TABLE "training_requests" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP COLUMN "payload";--> statement-breakpoint
ALTER TABLE "background_jobs" DROP COLUMN "last_error_message";--> statement-breakpoint
ALTER TABLE "job_attempts" DROP COLUMN "error_message";--> statement-breakpoint
ALTER TABLE "job_dead_letters" DROP COLUMN "reason_message";--> statement-breakpoint
ALTER TABLE "job_dead_letters" DROP COLUMN "payload_snapshot";--> statement-breakpoint
ALTER TABLE "merchant_channels" ADD CONSTRAINT "merchant_channels_disconnected_timestamp_check" CHECK ("merchant_channels"."disconnected_at" IS NULL OR "merchant_channels"."connected_at" IS NULL OR "merchant_channels"."disconnected_at" >= "merchant_channels"."connected_at");--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_expiry_check" CHECK ("account_sessions"."last_seen_at" >= "account_sessions"."created_at" AND "account_sessions"."last_activity_at" >= "account_sessions"."created_at" AND "account_sessions"."idle_expires_at" > "account_sessions"."created_at" AND "account_sessions"."absolute_expires_at" > "account_sessions"."created_at" AND "account_sessions"."idle_expires_at" <= "account_sessions"."absolute_expires_at" AND "account_sessions"."rotate_after" > "account_sessions"."created_at" AND "account_sessions"."rotate_after" <= "account_sessions"."absolute_expires_at");--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_revocation_check" CHECK (("account_sessions"."status" = 'active' AND "account_sessions"."revoked_at" IS NULL AND "account_sessions"."revoke_reason" IS NULL) OR ("account_sessions"."status" = 'revoked' AND "account_sessions"."revoked_at" IS NOT NULL AND "account_sessions"."revoke_reason" IS NOT NULL) OR ("account_sessions"."status" = 'expired' AND "account_sessions"."revoked_at" IS NULL));--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_rotation_check" CHECK ("account_sessions"."replaced_by_session_id" IS NULL OR ("account_sessions"."status" = 'revoked' AND "account_sessions"."revoke_reason" = 'rotated' AND "account_sessions"."revoked_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_authorization_snapshot_check" CHECK (jsonb_typeof("account_sessions"."permission_snapshot") = 'array' AND (("account_sessions"."kind" = 'admin' AND "account_sessions"."role_snapshot" IS NOT NULL) OR ("account_sessions"."kind" = 'merchant' AND "account_sessions"."role_snapshot" IS NULL AND jsonb_array_length("account_sessions"."permission_snapshot") = 0)));--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_hash_check" CHECK (char_length("login_attempts"."target_hash") BETWEEN 32 AND 128 AND char_length("login_attempts"."ip_hash") BETWEEN 32 AND 128);--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_retention_check" CHECK ("login_attempts"."expires_at" > "login_attempts"."created_at" AND "login_attempts"."expires_at" <= "login_attempts"."created_at" + interval '30 days');--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_fingerprint_check" CHECK (char_length("trusted_devices"."device_fingerprint_hash") BETWEEN 32 AND 128);--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_trust_state_check" CHECK (("trusted_devices"."status" = 'trusted' AND "trusted_devices"."trust_slot" BETWEEN 1 AND 2 AND "trusted_devices"."trusted_at" IS NOT NULL AND "trusted_devices"."trusted_by_account_id" IS NOT NULL AND "trusted_devices"."revoked_at" IS NULL) OR ("trusted_devices"."status" = 'pending' AND "trusted_devices"."trust_slot" IS NULL AND "trusted_devices"."trusted_at" IS NULL AND "trusted_devices"."revoked_at" IS NULL) OR ("trusted_devices"."status" = 'revoked' AND "trusted_devices"."trust_slot" IS NULL AND "trusted_devices"."revoked_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_time_check" CHECK ("trusted_devices"."last_seen_at" >= "trusted_devices"."first_seen_at");--> statement-breakpoint
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_digest_check" CHECK (("knowledge_audit_events"."customer_text_hash" IS NULL AND "knowledge_audit_events"."customer_text_length" IS NULL) OR ("knowledge_audit_events"."customer_text_hash" ~ '^[0-9a-f]{64}$' AND "knowledge_audit_events"."customer_text_length" BETWEEN 0 AND 10000));--> statement-breakpoint
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_signal_check" CHECK (jsonb_typeof("knowledge_audit_events"."signal_codes") = 'array' AND jsonb_array_length("knowledge_audit_events"."signal_codes") <= 32);--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_target_check" CHECK (("knowledge_embeddings"."knowledge_kind" = 'saved_answer' AND "knowledge_embeddings"."saved_answer_id" = "knowledge_embeddings"."knowledge_id" AND "knowledge_embeddings"."learned_answer_id" IS NULL) OR ("knowledge_embeddings"."knowledge_kind" = 'learned_answer' AND "knowledge_embeddings"."learned_answer_id" = "knowledge_embeddings"."knowledge_id" AND "knowledge_embeddings"."saved_answer_id" IS NULL));--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_hash_check" CHECK ("knowledge_embeddings"."content_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_dimensions_check" CHECK ("knowledge_embeddings"."dimensions" BETWEEN 1 AND 4096 AND cardinality("knowledge_embeddings"."embedding") = "knowledge_embeddings"."dimensions");--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_timestamp_check" CHECK ("knowledge_embeddings"."updated_at" >= "knowledge_embeddings"."created_at");--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_confidence_check" CHECK ("learned_answers"."confidence" >= 0 AND "learned_answers"."confidence" <= 1);--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_collections_check" CHECK (jsonb_typeof("learned_answers"."examples") = 'array' AND jsonb_typeof("learned_answers"."keywords") = 'array' AND jsonb_array_length("learned_answers"."examples") <= 20 AND jsonb_array_length("learned_answers"."keywords") <= 24);--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_bounds_check" CHECK (char_length("learned_answers"."intent") BETWEEN 1 AND 100 AND char_length("learned_answers"."answer_text") BETWEEN 1 AND 2000);--> statement-breakpoint
ALTER TABLE "learned_answers" ADD CONSTRAINT "learned_answers_timestamp_check" CHECK ("learned_answers"."updated_at" >= "learned_answers"."created_at");--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_bounds_check" CHECK (char_length("saved_answers"."question_pattern") BETWEEN 1 AND 500 AND char_length("saved_answers"."normalized_question") BETWEEN 1 AND 500 AND char_length("saved_answers"."answer_text") BETWEEN 1 AND 2000);--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_timestamp_check" CHECK ("saved_answers"."updated_at" >= "saved_answers"."created_at");--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_privacy_bounds_check" CHECK (char_length("training_requests"."customer_text_preview") <= 500 AND "training_requests"."customer_text_length" >= char_length("training_requests"."customer_text_preview") AND "training_requests"."customer_text_length" <= 10000 AND "training_requests"."customer_text_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_suggestion_provenance_check" CHECK (("training_requests"."suggested_reply" IS NULL AND "training_requests"."suggested_reply_source" IS NULL) OR ("training_requests"."suggested_reply" IS NOT NULL AND "training_requests"."suggested_reply_source" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_rejection_check" CHECK (("training_requests"."status" = 'rejected' AND "training_requests"."rejection_reason" IS NOT NULL AND "training_requests"."reviewed_at" IS NOT NULL) OR ("training_requests"."status" <> 'rejected' AND "training_requests"."rejection_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_bounds_check" CHECK (char_length("training_requests"."detected_intent") BETWEEN 1 AND 100 AND char_length("training_requests"."reason") BETWEEN 1 AND 300 AND ("training_requests"."suggested_reply" IS NULL OR char_length("training_requests"."suggested_reply") <= 2000) AND ("training_requests"."rejection_reason" IS NULL OR char_length("training_requests"."rejection_reason") <= 500));--> statement-breakpoint
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_timestamp_check" CHECK ("training_requests"."updated_at" >= "training_requests"."created_at");--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_payload_hash_check" CHECK ("background_jobs"."payload_hash" IS NULL OR char_length("background_jobs"."payload_hash") BETWEEN 32 AND 128);--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_processing_has_lease" CHECK (("background_jobs"."status" <> 'processing') OR ("background_jobs"."locked_at" IS NOT NULL AND "background_jobs"."locked_by" IS NOT NULL AND "background_jobs"."lease_expires_at" IS NOT NULL AND "background_jobs"."lease_generation" IS NOT NULL AND "background_jobs"."lease_generation" > 0));--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_nonprocessing_has_no_lease" CHECK (("background_jobs"."status" = 'processing') OR ("background_jobs"."locked_at" IS NULL AND "background_jobs"."locked_by" IS NULL AND "background_jobs"."lease_expires_at" IS NULL AND "background_jobs"."lease_generation" IS NULL));--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_lease_time_check" CHECK ("background_jobs"."lease_expires_at" IS NULL OR ("background_jobs"."locked_at" IS NOT NULL AND "background_jobs"."lease_expires_at" > "background_jobs"."locked_at"));--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_completed_has_timestamp" CHECK (("background_jobs"."status" <> 'completed') OR "background_jobs"."completed_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_dead_letter_has_timestamp" CHECK (("background_jobs"."status" <> 'dead_letter') OR "background_jobs"."dead_lettered_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_valid_time_range" CHECK ("job_attempts"."finished_at" IS NULL OR "job_attempts"."finished_at" >= "job_attempts"."started_at");--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_finished_status_has_timestamp" CHECK (("job_attempts"."status" = 'processing') OR "job_attempts"."finished_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "job_dead_letters" ADD CONSTRAINT "job_dead_letters_payload_hash_check" CHECK ("job_dead_letters"."payload_sha256" IS NULL OR char_length("job_dead_letters"."payload_sha256") BETWEEN 32 AND 128);--> statement-breakpoint
DROP POLICY "catalog_idempotency_keys_tenant_boundary" ON "catalog_idempotency_keys" CASCADE;--> statement-breakpoint
DROP POLICY "catalog_identifiers_tenant_boundary" ON "catalog_identifiers" CASCADE;--> statement-breakpoint
DROP POLICY "catalog_image_references_tenant_boundary" ON "catalog_image_references" CASCADE;--> statement-breakpoint
DROP POLICY "catalog_variant_options_tenant_boundary" ON "catalog_variant_options" CASCADE;--> statement-breakpoint
DROP POLICY "inventory_mutations_tenant_boundary" ON "inventory_mutations" CASCADE;--> statement-breakpoint
DROP POLICY "product_variants_tenant_boundary" ON "product_variants" CASCADE;--> statement-breakpoint
DROP POLICY "products_tenant_boundary" ON "products" CASCADE;--> statement-breakpoint
DROP POLICY "channel_inbound_events_tenant_boundary" ON "channel_inbound_events" CASCADE;--> statement-breakpoint
DROP POLICY "outbound_deliveries_tenant_boundary" ON "outbound_deliveries" CASCADE;--> statement-breakpoint
DROP POLICY "reply_refunds_tenant_boundary" ON "reply_refunds" CASCADE;--> statement-breakpoint
DROP POLICY "reply_reservations_tenant_boundary" ON "reply_reservations" CASCADE;--> statement-breakpoint
DROP POLICY "merchant_channels_tenant_boundary" ON "merchant_channels" CASCADE;--> statement-breakpoint
DROP POLICY "conversations_tenant_boundary" ON "conversations" CASCADE;--> statement-breakpoint
DROP POLICY "messages_tenant_boundary" ON "messages" CASCADE;--> statement-breakpoint
DROP POLICY "reply_ledger_tenant_boundary" ON "reply_ledger" CASCADE;--> statement-breakpoint
DROP POLICY "subscription_reply_batches_tenant_boundary" ON "subscription_reply_batches" CASCADE;--> statement-breakpoint
DROP POLICY "subscriptions_tenant_boundary" ON "subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "order_payment_decisions_tenant_boundary" ON "order_payment_decisions" CASCADE;--> statement-breakpoint
DROP POLICY "order_terminal_decision_links_tenant_boundary" ON "order_terminal_decision_links" CASCADE;--> statement-breakpoint
DROP POLICY "orders_tenant_boundary" ON "orders" CASCADE;--> statement-breakpoint
DROP POLICY "knowledge_audit_events_tenant_boundary" ON "knowledge_audit_events" CASCADE;--> statement-breakpoint
DROP POLICY "knowledge_embeddings_tenant_boundary" ON "knowledge_embeddings" CASCADE;--> statement-breakpoint
DROP POLICY "learned_answers_tenant_boundary" ON "learned_answers" CASCADE;--> statement-breakpoint
DROP POLICY "saved_answers_tenant_boundary" ON "saved_answers" CASCADE;--> statement-breakpoint
DROP POLICY "training_requests_tenant_boundary" ON "training_requests" CASCADE;--> statement-breakpoint
DROP POLICY "background_job_payloads_tenant_boundary" ON "background_job_payloads" CASCADE;--> statement-breakpoint
DROP POLICY "background_jobs_tenant_boundary" ON "background_jobs" CASCADE;--> statement-breakpoint
DROP POLICY "merchant_settings_tenant_boundary" ON "merchant_settings" CASCADE;--> statement-breakpoint
CREATE POLICY "catalog_idempotency_keys_tenant_boundary" ON "catalog_idempotency_keys" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "catalog_identifiers_tenant_boundary" ON "catalog_identifiers" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "catalog_image_references_tenant_boundary" ON "catalog_image_references" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "catalog_variant_options_tenant_boundary" ON "catalog_variant_options" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "inventory_mutations_tenant_boundary" ON "inventory_mutations" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "product_variants_tenant_boundary" ON "product_variants" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "products_tenant_boundary" ON "products" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "channel_inbound_events_tenant_boundary" ON "channel_inbound_events" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "outbound_deliveries_tenant_boundary" ON "outbound_deliveries" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "reply_refunds_tenant_boundary" ON "reply_refunds" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "reply_reservations_tenant_boundary" ON "reply_reservations" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "merchant_channels_tenant_boundary" ON "merchant_channels" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "conversations_tenant_boundary" ON "conversations" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "messages_tenant_boundary" ON "messages" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "reply_ledger_tenant_boundary" ON "reply_ledger" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "subscription_reply_batches_tenant_boundary" ON "subscription_reply_batches" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "subscriptions_tenant_boundary" ON "subscriptions" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "order_payment_decisions_tenant_boundary" ON "order_payment_decisions" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "order_terminal_decision_links_tenant_boundary" ON "order_terminal_decision_links" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "orders_tenant_boundary" ON "orders" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "knowledge_audit_events_tenant_boundary" ON "knowledge_audit_events" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "knowledge_embeddings_tenant_boundary" ON "knowledge_embeddings" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "learned_answers_tenant_boundary" ON "learned_answers" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "saved_answers_tenant_boundary" ON "saved_answers" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "training_requests_tenant_boundary" ON "training_requests" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "background_job_payloads_tenant_boundary" ON "background_job_payloads" AS PERMISSIVE FOR ALL TO public USING ((
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
  ));--> statement-breakpoint
CREATE POLICY "background_jobs_tenant_boundary" ON "background_jobs" AS PERMISSIVE FOR ALL TO public USING ((
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
CREATE POLICY "merchant_settings_tenant_boundary" ON "merchant_settings" AS PERMISSIVE FOR ALL TO public USING ((
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
  ));