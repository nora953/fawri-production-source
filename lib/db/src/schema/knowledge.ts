import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, real, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { merchants } from "./merchants";
import { interfaceLanguageEnum, learnedAnswerSourceEnum, savedAnswerCategoryEnum, trainingStatusEnum } from "./enums";

export const knowledgeApprovalStatusEnum = pgEnum("knowledge_approval_status", ["pending_review", "approved", "rejected"]);
export const knowledgeSuggestedReplySourceEnum = pgEnum("knowledge_suggested_reply_source", ["merchant_draft", "openai_generated"]);
export const knowledgeEmbeddingKindEnum = pgEnum("knowledge_embedding_kind", ["saved_answer", "learned_answer"]);

export const savedAnswers = pgTable("saved_answers", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  category: savedAnswerCategoryEnum("category").notNull(),
  questionPattern: text("question_pattern").notNull(),
  normalizedQuestion: text("normalized_question").notNull(),
  answerText: text("answer_text").notNull(),
  language: interfaceLanguageEnum("language").notNull(),
  source: learnedAnswerSourceEnum("source").notNull().default("merchant_approved"),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idMerchantUnique: unique("saved_answers_id_merchant_unique").on(table.id, table.merchantId),
  merchantLanguageQuestionUnique: uniqueIndex("saved_answers_merchant_language_question_unique").on(table.merchantId, table.language, table.normalizedQuestion),
  merchantActiveIndex: index("saved_answers_merchant_active_idx").on(table.merchantId, table.language, table.active),
  sourceCheck: check("saved_answers_source_check", sql`${table.source} = 'merchant_approved'`),
  versionCheck: check("saved_answers_version_check", sql`${table.version} > 0`),
  boundsCheck: check("saved_answers_bounds_check", sql`char_length(${table.questionPattern}) BETWEEN 1 AND 500 AND char_length(${table.normalizedQuestion}) BETWEEN 1 AND 500 AND char_length(${table.answerText}) BETWEEN 1 AND 2000`),
  timestampCheck: check("saved_answers_timestamp_check", sql`${table.updatedAt} >= ${table.createdAt}`),
}));

export const trainingRequests = pgTable("training_requests", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  customerTextPreview: text("customer_text_preview").notNull(),
  customerTextHash: text("customer_text_hash").notNull(),
  customerTextLength: integer("customer_text_length").notNull(),
  detectedIntent: text("detected_intent").notNull(),
  detectedLanguage: interfaceLanguageEnum("detected_language").notNull(),
  reason: text("reason").notNull(),
  suggestedReply: text("suggested_reply"),
  suggestedReplySource: knowledgeSuggestedReplySourceEnum("suggested_reply_source"),
  status: trainingStatusEnum("status").notNull().default("pending_merchant_reply"),
  rejectionReason: text("rejection_reason"),
  reviewedByAccountId: text("reviewed_by_account_id").references(() => accounts.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idMerchantUnique: unique("training_requests_id_merchant_unique").on(table.id, table.merchantId),
  merchantStatusIndex: index("training_requests_merchant_status_idx").on(table.merchantId, table.status, table.createdAt),
  digestIndex: index("training_requests_merchant_digest_idx").on(table.merchantId, table.customerTextHash),
  versionCheck: check("training_requests_version_check", sql`${table.version} > 0`),
  privacyBoundsCheck: check("training_requests_privacy_bounds_check", sql`char_length(${table.customerTextPreview}) <= 500 AND ${table.customerTextLength} >= char_length(${table.customerTextPreview}) AND ${table.customerTextLength} <= 10000 AND ${table.customerTextHash} ~ '^[0-9a-f]{64}$'`),
  suggestionProvenanceCheck: check("training_requests_suggestion_provenance_check", sql`(${table.suggestedReply} IS NULL AND ${table.suggestedReplySource} IS NULL) OR (${table.suggestedReply} IS NOT NULL AND ${table.suggestedReplySource} IS NOT NULL)`),
  rejectionCheck: check("training_requests_rejection_check", sql`(${table.status} = 'rejected' AND ${table.rejectionReason} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL) OR (${table.status} <> 'rejected' AND ${table.rejectionReason} IS NULL)`),
  boundsCheck: check("training_requests_bounds_check", sql`char_length(${table.detectedIntent}) BETWEEN 1 AND 100 AND char_length(${table.reason}) BETWEEN 1 AND 300 AND (${table.suggestedReply} IS NULL OR char_length(${table.suggestedReply}) <= 2000) AND (${table.rejectionReason} IS NULL OR char_length(${table.rejectionReason}) <= 500)`),
  timestampCheck: check("training_requests_timestamp_check", sql`${table.updatedAt} >= ${table.createdAt}`),
}));

export const learnedAnswers = pgTable("learned_answers", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  trainingRequestId: text("training_request_id"),
  intent: text("intent").notNull(),
  language: interfaceLanguageEnum("language").notNull(),
  examples: jsonb("examples").$type<string[]>().notNull().default([]),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  answerText: text("answer_text").notNull(),
  source: learnedAnswerSourceEnum("source").notNull(),
  approvalStatus: knowledgeApprovalStatusEnum("approval_status").notNull().default("pending_review"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
  safeToAutoReply: boolean("safe_to_auto_reply").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idMerchantUnique: unique("learned_answers_id_merchant_unique").on(table.id, table.merchantId),
  trainingTenantForeignKey: foreignKey({ name: "learned_answers_training_merchant_fk", columns: [table.trainingRequestId, table.merchantId], foreignColumns: [trainingRequests.id, trainingRequests.merchantId] }).onDelete("set null"),
  trainingRequestUnique: uniqueIndex("learned_answers_training_request_unique").on(table.merchantId, table.trainingRequestId).where(sql`${table.trainingRequestId} IS NOT NULL`),
  merchantRetrievalIndex: index("learned_answers_merchant_retrieval_idx").on(table.merchantId, table.language, table.approvalStatus, table.safeToAutoReply),
  versionCheck: check("learned_answers_version_check", sql`${table.version} > 0`),
  confidenceCheck: check("learned_answers_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
  collectionsCheck: check("learned_answers_collections_check", sql`jsonb_typeof(${table.examples}) = 'array' AND jsonb_typeof(${table.keywords}) = 'array' AND jsonb_array_length(${table.examples}) <= 20 AND jsonb_array_length(${table.keywords}) <= 24`),
  safeApprovalCheck: check("learned_answers_safe_approval_check", sql`NOT ${table.safeToAutoReply} OR (${table.source} = 'merchant_approved' AND ${table.approvalStatus} = 'approved')`),
  openAiCannotApproveCheck: check("learned_answers_openai_cannot_approve_check", sql`${table.source} <> 'openai_generated' OR (${table.approvalStatus} <> 'approved' AND NOT ${table.safeToAutoReply})`),
  boundsCheck: check("learned_answers_bounds_check", sql`char_length(${table.intent}) BETWEEN 1 AND 100 AND char_length(${table.answerText}) BETWEEN 1 AND 2000`),
  timestampCheck: check("learned_answers_timestamp_check", sql`${table.updatedAt} >= ${table.createdAt}`),
}));

export const knowledgeAuditEvents = pgTable("knowledge_audit_events", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  actorAccountId: text("actor_account_id").references(() => accounts.id, { onDelete: "set null" }),
  customerTextHash: text("customer_text_hash"),
  customerTextLength: integer("customer_text_length"),
  signalCodes: jsonb("signal_codes").$type<string[]>().notNull().default([]),
  decisionCode: text("decision_code"),
  outcomeCode: text("outcome_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  merchantCreatedIndex: index("knowledge_audit_events_merchant_created_idx").on(table.merchantId, table.createdAt),
  digestCheck: check("knowledge_audit_events_digest_check", sql`(${table.customerTextHash} IS NULL AND ${table.customerTextLength} IS NULL) OR (${table.customerTextHash} ~ '^[0-9a-f]{64}$' AND ${table.customerTextLength} BETWEEN 0 AND 10000)`),
  signalCheck: check("knowledge_audit_events_signal_check", sql`jsonb_typeof(${table.signalCodes}) = 'array' AND jsonb_array_length(${table.signalCodes}) <= 32`),
}));

/** PostgreSQL-native real[] vector equivalent. Customer queries are ephemeral parameters only. */
export const knowledgeEmbeddings = pgTable("knowledge_embeddings", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  knowledgeKind: knowledgeEmbeddingKindEnum("knowledge_kind").notNull(),
  knowledgeId: text("knowledge_id").notNull(),
  savedAnswerId: text("saved_answer_id"),
  learnedAnswerId: text("learned_answer_id"),
  language: interfaceLanguageEnum("language").notNull(),
  embeddingModel: text("embedding_model").notNull(),
  contentHash: text("content_hash").notNull(),
  dimensions: integer("dimensions").notNull(),
  embedding: real("embedding").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  savedAnswerTenantForeignKey: foreignKey({ name: "knowledge_embeddings_saved_answer_merchant_fk", columns: [table.savedAnswerId, table.merchantId], foreignColumns: [savedAnswers.id, savedAnswers.merchantId] }).onDelete("cascade"),
  learnedAnswerTenantForeignKey: foreignKey({ name: "knowledge_embeddings_learned_answer_merchant_fk", columns: [table.learnedAnswerId, table.merchantId], foreignColumns: [learnedAnswers.id, learnedAnswers.merchantId] }).onDelete("cascade"),
  identityUnique: uniqueIndex("knowledge_embeddings_identity_unique").on(table.merchantId, table.knowledgeKind, table.knowledgeId, table.embeddingModel, table.contentHash),
  tenantModelIndex: index("knowledge_embeddings_tenant_model_idx").on(table.merchantId, table.embeddingModel, table.language),
  targetCheck: check("knowledge_embeddings_target_check", sql`(${table.knowledgeKind} = 'saved_answer' AND ${table.savedAnswerId} = ${table.knowledgeId} AND ${table.learnedAnswerId} IS NULL) OR (${table.knowledgeKind} = 'learned_answer' AND ${table.learnedAnswerId} = ${table.knowledgeId} AND ${table.savedAnswerId} IS NULL)`),
  hashCheck: check("knowledge_embeddings_hash_check", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  dimensionsCheck: check("knowledge_embeddings_dimensions_check", sql`${table.dimensions} BETWEEN 1 AND 4096 AND cardinality(${table.embedding}) = ${table.dimensions}`),
  timestampCheck: check("knowledge_embeddings_timestamp_check", sql`${table.updatedAt} >= ${table.createdAt}`),
}));

export type SavedAnswer = typeof savedAnswers.$inferSelect;
export type TrainingRequest = typeof trainingRequests.$inferSelect;
export type LearnedAnswer = typeof learnedAnswers.$inferSelect;
export type KnowledgeAuditEvent = typeof knowledgeAuditEvents.$inferSelect;
export type KnowledgeEmbedding = typeof knowledgeEmbeddings.$inferSelect;
