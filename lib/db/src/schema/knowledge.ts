import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  interfaceLanguageEnum,
  learnedAnswerSourceEnum,
  savedAnswerCategoryEnum,
  trainingStatusEnum,
} from "./enums";
import { merchants } from "./merchants";
import { products } from "./catalog";
import { conversations } from "./conversations";

export const savedAnswers = pgTable(
  "saved_answers",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    category: savedAnswerCategoryEnum("category").notNull(),
    questionPattern: text("question_pattern").notNull(),
    normalizedQuestionPattern: text("normalized_question_pattern").notNull(),
    answerText: text("answer_text").notNull(),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    language: interfaceLanguageEnum("language").notNull(),
    approved: boolean("approved").notNull().default(true),
    active: boolean("active").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantLanguageIndex: index("saved_answers_merchant_language_idx").on(
      table.merchantId,
      table.language,
      table.active,
    ),
    merchantPatternUnique: uniqueIndex(
      "saved_answers_merchant_language_pattern_unique",
    ).on(table.merchantId, table.language, table.normalizedQuestionPattern),
  }),
);

export const trainingRequests = pgTable(
  "training_requests",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    customerExternalId: text("customer_external_id"),
    customerMessage: text("customer_message").notNull(),
    normalizedMessage: text("normalized_message").notNull(),
    detectedIntent: text("detected_intent").notNull(),
    detectedLanguage: text("detected_language").notNull(),
    reasonCode: text("reason_code").notNull(),
    suggestedReply: text("suggested_reply"),
    merchantReply: text("merchant_reply"),
    status: trainingStatusEnum("status")
      .notNull()
      .default("pending_merchant_reply"),
    reviewedByAccountId: text("reviewed_by_account_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantStatusIndex: index("training_requests_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.createdAt,
    ),
    merchantNormalizedIndex: index(
      "training_requests_merchant_normalized_idx",
    ).on(table.merchantId, table.normalizedMessage),
  }),
);

export const learnedAnswers = pgTable(
  "learned_answers",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    trainingRequestId: text("training_request_id").references(
      () => trainingRequests.id,
      { onDelete: "set null" },
    ),
    intent: text("intent").notNull(),
    language: text("language").notNull(),
    examples: jsonb("examples").$type<string[]>().notNull().default([]),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    reply: text("reply").notNull(),
    source: learnedAnswerSourceEnum("source").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    safeToAutoReply: boolean("safe_to_auto_reply").notNull().default(false),
    requiresHumanApproval: boolean("requires_human_approval")
      .notNull()
      .default(true),
    conditions: jsonb("conditions")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    trainingRequestUnique: uniqueIndex(
      "learned_answers_training_request_unique",
    ).on(table.trainingRequestId),
    merchantIntentIndex: index("learned_answers_merchant_intent_idx").on(
      table.merchantId,
      table.intent,
      table.language,
      table.safeToAutoReply,
    ),
  }),
);

export type SavedAnswer = typeof savedAnswers.$inferSelect;
export type TrainingRequest = typeof trainingRequests.$inferSelect;
export type LearnedAnswer = typeof learnedAnswers.$inferSelect;
