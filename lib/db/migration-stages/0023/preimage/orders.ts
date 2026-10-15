import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { products, productVariants } from "./catalog";
import { conversations } from "./conversations";
import {
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from "./enums";
import { merchantLocations } from "./merchant-locations";
import { merchants } from "./merchants";

export const paymentDecisionOperationEnum = pgEnum("payment_decision_operation", [
  "confirm",
  "reject",
  "legacy_import",
]);
export const paymentDecisionChannelEnum = pgEnum("payment_decision_channel", [
  "electronic",
  "cash_on_delivery",
]);
export const paymentDecisionOutcomeEnum = pgEnum("payment_decision_outcome", [
  "paid",
  "failed",
]);
export const paymentDecisionActorEnum = pgEnum("payment_decision_actor", [
  "merchant",
  "admin",
  "system",
]);
export const paymentConfirmationSourceEnum = pgEnum(
  "payment_confirmation_source",
  ["merchant_confirmed", "provider_verified"],
);
export const paymentReconciliationStatusEnum = pgEnum(
  "payment_reconciliation_status",
  ["clear", "reconciliation_required", "resolved"],
);
export const providerPaymentOutcomeEnum = pgEnum(
  "provider_payment_outcome",
  ["paid", "failed", "cancelled"],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id"),
    customerExternalId: text("customer_external_id"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    customerArea: text("customer_area"),
    fulfillmentLocationId: text("fulfillment_location_id"),
    status: orderStatusEnum("status").notNull().default("pending_confirmation"),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash_on_delivery"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("cash_on_delivery"),
    subtotalIqd: integer("subtotal_iqd").notNull().default(0),
    deliveryFeeIqd: integer("delivery_fee_iqd").notNull().default(0),
    totalIqd: integer("total_iqd").notNull().default(0),
    sourceChannel: text("source_channel").notNull(),
    version: integer("version").notNull().default(1),
    notes: text("notes"),
    paymentVerifiedAt: timestamp("payment_verified_at", { withTimezone: true }),
    paymentVerifiedByAccountId: text("payment_verified_by_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    paymentRejectionReason: text("payment_rejection_reason"),
    paymentConfirmationSource: paymentConfirmationSourceEnum(
      "payment_confirmation_source",
    ),
    paymentProvider: text("payment_provider"),
    paymentProviderTransactionRef: text("payment_provider_transaction_ref"),
    paymentProviderLastEventId: text("payment_provider_last_event_id"),
    paymentReconciliationStatus: paymentReconciliationStatusEnum(
      "payment_reconciliation_status",
    )
      .notNull()
      .default("clear"),
    paymentConflictCode: text("payment_conflict_code"),
    paymentConflictAt: timestamp("payment_conflict_at", { withTimezone: true }),
    paymentConflictResolvedAt: timestamp("payment_conflict_resolved_at", {
      withTimezone: true,
    }),
    paymentConflictResolvedByAccountId: text(
      "payment_conflict_resolved_by_account_id",
    ).references(() => accounts.id, { onDelete: "set null" }),
    paymentConflictResolutionNote: text("payment_conflict_resolution_note"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fulfillmentLocationTenantForeignKey: foreignKey({
      name: "orders_fulfillment_location_merchant_fk",
      columns: [table.fulfillmentLocationId, table.merchantId],
      foreignColumns: [merchantLocations.id, merchantLocations.merchantId],
    }),
    conversationTenantForeignKey: foreignKey({
      name: "orders_conversation_merchant_fk",
      columns: [table.conversationId, table.merchantId],
      foreignColumns: [conversations.id, conversations.merchantId],
    }).onDelete("restrict"),
    idMerchantUnique: unique("orders_id_merchant_unique").on(table.id, table.merchantId),
    merchantCreatedIndex: index("orders_merchant_created_idx").on(table.merchantId, table.createdAt),
    merchantStatusIndex: index("orders_merchant_status_idx").on(table.merchantId, table.status),
    fulfillmentLocationIndex: index("orders_fulfillment_location_idx").on(
      table.merchantId,
      table.fulfillmentLocationId,
      table.createdAt,
    ),
    conversationIndex: index("orders_conversation_idx").on(table.conversationId),
    versionCheck: check("orders_version_check", sql`${table.version} > 0`),
    totalsCheck: check(
      "orders_totals_check",
      sql`${table.subtotalIqd} >= 0 AND ${table.deliveryFeeIqd} >= 0 AND ${table.totalIqd} = ${table.subtotalIqd} + ${table.deliveryFeeIqd}`,
    ),
    paymentMethodStatusCheck: check(
      "orders_payment_method_status_check",
      sql`(${table.paymentMethod} = 'cash_on_delivery' AND ${table.paymentStatus} IN ('cash_on_delivery', 'paid')) OR (${table.paymentMethod} <> 'cash_on_delivery' AND ${table.paymentStatus} <> 'cash_on_delivery')`,
    ),
    paymentMetadataCheck: check(
      "orders_payment_metadata_check",
      sql`(${table.paymentStatus} = 'paid' AND ${table.paymentVerifiedAt} IS NOT NULL AND ${table.paymentRejectionReason} IS NULL) OR (${table.paymentStatus} = 'failed' AND ${table.paymentVerifiedAt} IS NULL AND ${table.paymentVerifiedByAccountId} IS NULL AND ${table.paymentRejectionReason} IS NOT NULL) OR (${table.paymentStatus} NOT IN ('paid', 'failed') AND ${table.paymentVerifiedAt} IS NULL AND ${table.paymentVerifiedByAccountId} IS NULL AND ${table.paymentRejectionReason} IS NULL)`,
    ),
    paymentConfirmationSourceCheck: check(
      "orders_payment_confirmation_source_check",
      sql`${table.paymentStatus} <> 'paid' OR ${table.paymentConfirmationSource} IS NOT NULL OR ${table.paymentVerifiedAt} IS NOT NULL`,
    ),
    paymentReconciliationCheck: check(
      "orders_payment_reconciliation_check",
      sql`(${table.paymentReconciliationStatus} = 'clear' AND ${table.paymentConflictCode} IS NULL AND ${table.paymentConflictAt} IS NULL AND ${table.paymentConflictResolvedAt} IS NULL AND ${table.paymentConflictResolvedByAccountId} IS NULL AND ${table.paymentConflictResolutionNote} IS NULL) OR (${table.paymentReconciliationStatus} = 'reconciliation_required' AND ${table.paymentConflictCode} IS NOT NULL AND ${table.paymentConflictAt} IS NOT NULL AND ${table.paymentConflictResolvedAt} IS NULL AND ${table.paymentConflictResolvedByAccountId} IS NULL AND ${table.paymentConflictResolutionNote} IS NULL) OR (${table.paymentReconciliationStatus} = 'resolved' AND ${table.paymentConflictCode} IS NOT NULL AND ${table.paymentConflictAt} IS NOT NULL AND ${table.paymentConflictResolvedAt} IS NOT NULL AND ${table.paymentConflictResolvedByAccountId} IS NOT NULL AND ${table.paymentConflictResolutionNote} IS NOT NULL)`,
    ),
    lifecycleTimestampCheck: check("orders_lifecycle_timestamp_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  }),
);

export const orderPaymentDecisions = pgTable(
  "order_payment_decisions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    operation: paymentDecisionOperationEnum("operation").notNull(),
    paymentChannel: paymentDecisionChannelEnum("payment_channel").notNull(),
    outcome: paymentDecisionOutcomeEnum("outcome").notNull(),
    confirmationSource: paymentConfirmationSourceEnum("confirmation_source"),
    previousOrderStatus: orderStatusEnum("previous_order_status").notNull(),
    resultingOrderStatus: orderStatusEnum("resulting_order_status").notNull(),
    previousPaymentStatus: paymentStatusEnum("previous_payment_status").notNull(),
    resultingPaymentStatus: paymentStatusEnum("resulting_payment_status").notNull(),
    actorType: paymentDecisionActorEnum("actor_type").notNull(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    actorSessionFingerprint: text("actor_session_fingerprint"),
    requestId: text("request_id"),
    reason: text("reason"),
    expectedVersion: integer("expected_version").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    sourceFile: text("source_file"),
    sourceSha256: text("source_sha256"),
    migrationBatchId: text("migration_batch_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("order_payment_decisions_id_merchant_unique").on(table.id, table.merchantId),
    idOrderMerchantUnique: unique("order_payment_decisions_id_order_merchant_unique").on(table.id, table.orderId, table.merchantId),
    orderTenantForeignKey: foreignKey({
      name: "order_payment_decisions_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [orders.id, orders.merchantId],
    }).onDelete("cascade"),
    orderVersionUnique: uniqueIndex("order_payment_decisions_order_version_unique").on(table.merchantId, table.orderId, table.resultingVersion),
    requestUnique: uniqueIndex("order_payment_decisions_request_unique")
      .on(table.merchantId, table.requestId)
      .where(sql`${table.requestId} IS NOT NULL`),
    merchantDecidedIndex: index("order_payment_decisions_merchant_decided_idx").on(table.merchantId, table.decidedAt),
    versionCheck: check("order_payment_decisions_version_check", sql`${table.expectedVersion} > 0 AND ${table.resultingVersion} = ${table.expectedVersion} + 1`),
    outcomeCheck: check("order_payment_decisions_outcome_check", sql`(${table.outcome} = 'paid' AND ${table.resultingPaymentStatus} = 'paid') OR (${table.outcome} = 'failed' AND ${table.resultingPaymentStatus} = 'failed')`),
    actorCheck: check("order_payment_decisions_actor_check", sql`(${table.actorType} IN ('merchant', 'admin') AND ${table.actorAccountId} IS NOT NULL AND ${table.operation} <> 'legacy_import') OR (${table.actorType} = 'system' AND ${table.actorAccountId} IS NULL AND ${table.operation} = 'legacy_import')`),
    actorFingerprintCheck: check("order_payment_decisions_actor_fingerprint_check", sql`${table.actorSessionFingerprint} IS NULL OR char_length(${table.actorSessionFingerprint}) BETWEEN 32 AND 128`),
    reasonCheck: check("order_payment_decisions_reason_check", sql`${table.reason} IS NULL OR char_length(${table.reason}) <= 500`),
    legacyProvenanceCheck: check(
      "order_payment_decisions_legacy_provenance_check",
      sql`(${table.operation} <> 'legacy_import' AND ${table.sourceFile} IS NULL AND ${table.sourceSha256} IS NULL AND ${table.migrationBatchId} IS NULL) OR (${table.operation} = 'legacy_import' AND ${table.sourceFile} IS NOT NULL AND ${table.sourceSha256} IS NOT NULL AND ${table.migrationBatchId} IS NOT NULL AND char_length(${table.sourceSha256}) BETWEEN 32 AND 128)`,
    ),
  }),
);


export const orderPaymentProviderEvents = pgTable(
  "order_payment_provider_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerTransactionRef: text("provider_transaction_ref"),
    outcome: providerPaymentOutcomeEnum("outcome").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    currency: text("currency").notNull().default("IQD"),
    authenticityVerified: boolean("authenticity_verified").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    sanitizedMetadata: jsonb("sanitized_metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    resultingAction: text("resulting_action").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("order_payment_provider_events_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    orderTenantForeignKey: foreignKey({
      name: "order_payment_provider_events_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [orders.id, orders.merchantId],
    }).onDelete("cascade"),
    providerEventUnique: uniqueIndex(
      "order_payment_provider_events_provider_event_unique",
    ).on(table.merchantId, table.provider, table.providerEventId),
    merchantOrderIndex: index("order_payment_provider_events_merchant_order_idx").on(
      table.merchantId,
      table.orderId,
      table.receivedAt,
    ),
    providerCheck: check(
      "order_payment_provider_events_provider_check",
      sql`char_length(${table.provider}) BETWEEN 2 AND 40`,
    ),
    eventCheck: check(
      "order_payment_provider_events_event_check",
      sql`char_length(${table.providerEventId}) BETWEEN 6 AND 200`,
    ),
    transactionCheck: check(
      "order_payment_provider_events_transaction_check",
      sql`${table.providerTransactionRef} IS NULL OR char_length(${table.providerTransactionRef}) BETWEEN 1 AND 200`,
    ),
    amountCurrencyCheck: check(
      "order_payment_provider_events_amount_currency_check",
      sql`${table.amountIqd} >= 0 AND ${table.currency} = 'IQD'`,
    ),
    authenticityCheck: check(
      "order_payment_provider_events_authenticity_check",
      sql`${table.authenticityVerified} = TRUE`,
    ),
    payloadHashCheck: check(
      "order_payment_provider_events_payload_hash_check",
      sql`char_length(${table.payloadSha256}) = 64`,
    ),
    actionCheck: check(
      "order_payment_provider_events_action_check",
      sql`${table.resultingAction} IN ('provider_paid_confirmed', 'provider_failure_recorded', 'payment_conflict', 'provider_evidence_recorded')`,
    ),
    timeCheck: check(
      "order_payment_provider_events_time_check",
      sql`${table.processedAt} >= ${table.receivedAt}`,
    ),
  }),
);

/** One terminal decision per order; the composite FK proves the decision belongs to the same tenant/order. */
export const orderTerminalDecisionLinks = pgTable(
  "order_terminal_decision_links",
  {
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    decisionId: text("decision_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderUnique: uniqueIndex("order_terminal_decision_links_order_unique").on(table.merchantId, table.orderId),
    decisionUnique: uniqueIndex("order_terminal_decision_links_decision_unique").on(table.merchantId, table.decisionId),
    orderTenantForeignKey: foreignKey({
      name: "order_terminal_decision_links_order_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [orders.id, orders.merchantId],
    }).onDelete("cascade"),
    decisionOrderTenantForeignKey: foreignKey({
      name: "order_terminal_decision_links_decision_order_fk",
      columns: [table.decisionId, table.orderId, table.merchantId],
      foreignColumns: [orderPaymentDecisions.id, orderPaymentDecisions.orderId, orderPaymentDecisions.merchantId],
    }).onDelete("cascade"),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    productVariantId: text("product_variant_id"),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    variantSnapshot: jsonb("variant_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    quantity: integer("quantity").notNull(),
    unitPriceIqd: integer("unit_price_iqd").notNull(),
    lineTotalIqd: integer("line_total_iqd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderTenantForeignKey: foreignKey({ name: "order_items_order_merchant_fk", columns: [table.orderId, table.merchantId], foreignColumns: [orders.id, orders.merchantId] }).onDelete("cascade"),
    productTenantForeignKey: foreignKey({ name: "order_items_product_merchant_fk", columns: [table.productId, table.merchantId], foreignColumns: [products.id, products.merchantId] }).onDelete("restrict"),
    variantTenantForeignKey: foreignKey({ name: "order_items_variant_merchant_fk", columns: [table.productVariantId, table.merchantId], foreignColumns: [productVariants.id, productVariants.merchantId] }).onDelete("restrict"),
    orderIndex: index("order_items_order_idx").on(table.orderId),
    merchantProductIndex: index("order_items_merchant_product_idx").on(table.merchantId, table.productId),
    quantityPriceCheck: check("order_items_quantity_price_check", sql`${table.quantity} > 0 AND ${table.unitPriceIqd} >= 0 AND ${table.lineTotalIqd} = ${table.quantity} * ${table.unitPriceIqd}`),
  }),
);

export const orderDrafts = pgTable(
  "order_drafts",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    customerExternalId: text("customer_external_id").notNull(),
    awaitingField: text("awaiting_field").notNull(),
    draftData: jsonb("draft_data").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationTenantForeignKey: foreignKey({ name: "order_drafts_conversation_merchant_fk", columns: [table.conversationId, table.merchantId], foreignColumns: [conversations.id, conversations.merchantId] }).onDelete("cascade"),
    conversationUnique: uniqueIndex("order_drafts_conversation_unique").on(table.conversationId),
    expiryIndex: index("order_drafts_expiry_idx").on(table.expiresAt),
    timeCheck: check("order_drafts_time_check", sql`${table.updatedAt} >= ${table.createdAt} AND ${table.expiresAt} > ${table.createdAt}`),
  }),
);

export type Order = typeof orders.$inferSelect;
export type OrderPaymentDecision = typeof orderPaymentDecisions.$inferSelect;
export type OrderPaymentProviderEvent = typeof orderPaymentProviderEvents.$inferSelect;
export type OrderTerminalDecisionLink = typeof orderTerminalDecisionLinks.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderDraft = typeof orderDrafts.$inferSelect;
