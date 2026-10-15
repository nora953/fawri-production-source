import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, real, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { merchants } from "./merchants";
import { products } from "./catalog";
import { conversations } from "./conversations";
import { interfaceLanguageEnum, learnedAnswerSourceEnum, savedAnswerCategoryEnum, trainingStatusEnum } from "./enums";

export const knowledgeApprovalStatusEnum = pgEnum("knowledge_approval_status", ["pending_review", "approved", "rejected"]);
export const knowledgeSuggestedReplySourceEnum = pgEnum("knowledge_suggested_reply_source", ["merchant_draft", "openai_generated"]);
export const knowledgeEmbeddingKindEnum = pgEnum("knowledge_embedding_kind", ["saved_answer", "learned_answer"]);

/** Stage-1 retains legacy fields only so Drizzle produces an add-only migration. */
export const savedAnswers = pgTable("saved_answers", {
  id: text("id").primaryKey(), merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  category: savedAnswerCategoryEnum("category").notNull(), questionPattern: text("question_pattern").notNull(), normalizedQuestionPattern: text("normalized_question_pattern").notNull(),
  normalizedQuestion: text("normalized_question").notNull().default("legacy-unset"), answerText: text("answer_text").notNull(), productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  language: interfaceLanguageEnum("language").notNull(), source: learnedAnswerSourceEnum("source").notNull().default("merchant_approved"), approved: boolean("approved").notNull().default(true), active: boolean("active").notNull().default(true), priority: integer("priority").notNull().default(0), version: integer("version").notNull().default(1), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idMerchantUnique: unique("saved_answers_id_merchant_unique").on(table.id, table.merchantId),
  merchantLanguageQuestionUnique: uniqueIndex("saved_answers_merchant_language_question_unique").on(table.merchantId, table.language, table.normalizedQuestion),
  merchantPatternLegacyUnique: uniqueIndex("saved_answers_merchant_language_pattern_unique").on(table.merchantId, table.language, table.normalizedQuestionPattern),
  sourceCheck: check("saved_answers_source_check", sql`${table.source} = 'merchant_approved'`), versionCheck: check("saved_answers_version_check", sql`${table.version} > 0`),
}));

export const trainingRequests = pgTable("training_requests", {
  id: text("id").primaryKey(), merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }), customerExternalId: text("customer_external_id"), customerMessage: text("customer_message").notNull(), normalizedMessage: text("normalized_message").notNull(),
  customerTextPreview: text("customer_text_preview").notNull().default(""), customerTextHash: text("customer_text_hash").notNull().default("0000000000000000000000000000000000000000000000000000000000000000"), customerTextLength: integer("customer_text_length").notNull().default(0),
  detectedIntent: text("detected_intent").notNull(), detectedLanguage: text("detected_language").notNull(), reasonCode: text("reason_code").notNull(), reason: text("reason").notNull().default("legacy"), suggestedReply: text("suggested_reply"), suggestedReplySource: knowledgeSuggestedReplySourceEnum("suggested_reply_source"), merchantReply: text("merchant_reply"),
  status: trainingStatusEnum("status").notNull().default("pending_merchant_reply"), rejectionReason: text("rejection_reason"), reviewedByAccountId: text("reviewed_by_account_id").references(() => accounts.id, { onDelete: "set null" }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), version: integer("version").notNull().default(1), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ idMerchantUnique: unique("training_requests_id_merchant_unique").on(table.id, table.merchantId), merchantStatusIndex: index("training_requests_merchant_status_idx").on(table.merchantId, table.status, table.createdAt), versionCheck: check("training_requests_version_check", sql`${table.version} > 0`) }));

export const learnedAnswers = pgTable("learned_answers", {
  id: text("id").primaryKey(), merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }), trainingRequestId: text("training_request_id"), intent: text("intent").notNull(), language: text("language").notNull(), examples: jsonb("examples").$type<string[]>().notNull().default([]), keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  reply: text("reply").notNull(), answerText: text("answer_text").notNull().default("legacy-unset"), source: learnedAnswerSourceEnum("source").notNull(), approvalStatus: knowledgeApprovalStatusEnum("approval_status").notNull().default("pending_review"), confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"), safeToAutoReply: boolean("safe_to_auto_reply").notNull().default(false), requiresHumanApproval: boolean("requires_human_approval").notNull().default(true), version: integer("version").notNull().default(1), conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}), usageCount: integer("usage_count").notNull().default(0), lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idMerchantUnique: unique("learned_answers_id_merchant_unique").on(table.id, table.merchantId),
  trainingTenantForeignKey: foreignKey({ name: "learned_answers_training_merchant_fk", columns: [table.trainingRequestId, table.merchantId], foreignColumns: [trainingRequests.id, trainingRequests.merchantId] }).onDelete("set null"),
  trainingRequestUnique: uniqueIndex("learned_answers_training_request_unique").on(table.merchantId, table.trainingRequestId).where(sql`${table.trainingRequestId} IS NOT NULL`),
  versionCheck: check("learned_answers_version_check", sql`${table.version} > 0`), safeApprovalCheck: check("learned_answers_safe_approval_check", sql`NOT ${table.safeToAutoReply} OR (${table.source} = 'merchant_approved' AND ${table.approvalStatus} = 'approved')`), openAiCannotApproveCheck: check("learned_answers_openai_cannot_approve_check", sql`${table.source} <> 'openai_generated' OR (${table.approvalStatus} <> 'approved' AND NOT ${table.safeToAutoReply})`),
}));

export const knowledgeAuditEvents = pgTable("knowledge_audit_events", {
  id: text("id").primaryKey(), merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }), action: text("action").notNull(), entityType: text("entity_type"), entityId: text("entity_id"), actorAccountId: text("actor_account_id").references(() => accounts.id, { onDelete: "set null" }), customerTextHash: text("customer_text_hash"), customerTextLength: integer("customer_text_length"), signalCodes: jsonb("signal_codes").$type<string[]>().notNull().default([]), decisionCode: text("decision_code"), outcomeCode: text("outcome_code").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeEmbeddings = pgTable("knowledge_embeddings", {
  id: text("id").primaryKey(), merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }), knowledgeKind: knowledgeEmbeddingKindEnum("knowledge_kind").notNull(), knowledgeId: text("knowledge_id").notNull(), savedAnswerId: text("saved_answer_id"), learnedAnswerId: text("learned_answer_id"), language: interfaceLanguageEnum("language").notNull(), embeddingModel: text("embedding_model").notNull(), contentHash: text("content_hash").notNull(), dimensions: integer("dimensions").notNull(), embedding: real("embedding").array().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ savedAnswerTenantForeignKey: foreignKey({ name: "knowledge_embeddings_saved_answer_merchant_fk", columns: [table.savedAnswerId, table.merchantId], foreignColumns: [savedAnswers.id, savedAnswers.merchantId] }).onDelete("cascade"), learnedAnswerTenantForeignKey: foreignKey({ name: "knowledge_embeddings_learned_answer_merchant_fk", columns: [table.learnedAnswerId, table.merchantId], foreignColumns: [learnedAnswers.id, learnedAnswers.merchantId] }).onDelete("cascade"), identityUnique: uniqueIndex("knowledge_embeddings_identity_unique").on(table.merchantId, table.knowledgeKind, table.knowledgeId, table.embeddingModel, table.contentHash) }));

export type SavedAnswer = typeof savedAnswers.$inferSelect;
export type TrainingRequest = typeof trainingRequests.$inferSelect;
export type LearnedAnswer = typeof learnedAnswers.$inferSelect;
