import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { merchantChannels } from "./channels";
import { channelPlatformEnum } from "./enums";
import { backgroundJobs } from "./jobs";
import { merchants } from "./merchants";
import {
  replyLedger,
  subscriptionReplyBatches,
  subscriptions,
} from "./subscriptions";

export const replyReservationStatusEnum = pgEnum("reply_reservation_status", [
  "reserved",
  "consumed",
  "refunded",
]);

export const replyRefundStateEnum = pgEnum("reply_refund_state", [
  "pending",
  "refunded",
  "conflict",
]);

export const outboundDeliveryOutcomeEnum = pgEnum("outbound_delivery_outcome", [
  "pending",
  "sent",
  "confirmed_failed",
  "uncertain",
]);

/**
 * Provider dedupe and durable-enqueue marker live in the same row. The
 * transaction helper inserts this row and its background job atomically.
 */
export const channelInboundEvents = pgTable(
  "channel_inbound_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    provider: channelPlatformEnum("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    enqueueJobId: text("enqueue_job_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enqueueCommittedAt: timestamp("enqueue_committed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("channel_inbound_events_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    providerExternalUnique: uniqueIndex(
      "channel_inbound_events_provider_external_unique",
    ).on(table.provider, table.externalEventId),
    channelTenantForeignKey: foreignKey({
      name: "channel_inbound_events_channel_merchant_fk",
      columns: [table.channelId, table.merchantId],
      foreignColumns: [merchantChannels.id, merchantChannels.merchantId],
    }).onDelete("cascade"),
    jobTenantForeignKey: foreignKey({
      name: "channel_inbound_events_job_merchant_fk",
      columns: [table.enqueueJobId, table.merchantId],
      foreignColumns: [backgroundJobs.id, backgroundJobs.merchantId],
    }).onDelete("restrict"),
    merchantReceivedIndex: index("channel_inbound_events_merchant_received_idx").on(
      table.merchantId,
      table.receivedAt,
    ),
    payloadHashCheck: check(
      "channel_inbound_events_payload_hash_check",
      sql`char_length(${table.payloadHash}) BETWEEN 32 AND 128`,
    ),
    enqueueTimeCheck: check(
      "channel_inbound_events_enqueue_time_check",
      sql`${table.enqueueCommittedAt} >= ${table.receivedAt}`,
    ),
  }),
);

export const replyReservations = pgTable(
  "reply_reservations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    inboundEventId: text("inbound_event_id").notNull(),
    externalEventId: text("external_event_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    replyBatchId: text("reply_batch_id"),
    debitLedgerId: text("debit_ledger_id").notNull(),
    debitSource: text("debit_source").notNull(),
    amount: integer("amount").notNull().default(1),
    balanceBeforeDebit: integer("balance_before_debit").notNull(),
    balanceAfterDebit: integer("balance_after_debit").notNull(),
    status: replyReservationStatusEnum("status").notNull().default("reserved"),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => ({
    idMerchantUnique: unique("reply_reservations_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    inboundUnique: uniqueIndex("reply_reservations_inbound_unique").on(
      table.inboundEventId,
    ),
    merchantExternalUnique: uniqueIndex(
      "reply_reservations_merchant_external_unique",
    ).on(table.merchantId, table.externalEventId),
    inboundTenantForeignKey: foreignKey({
      name: "reply_reservations_inbound_merchant_fk",
      columns: [table.inboundEventId, table.merchantId],
      foreignColumns: [channelInboundEvents.id, channelInboundEvents.merchantId],
    }).onDelete("cascade"),
    subscriptionTenantForeignKey: foreignKey({
      name: "reply_reservations_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [subscriptions.id, subscriptions.merchantId],
    }).onDelete("restrict"),
    batchTenantForeignKey: foreignKey({
      name: "reply_reservations_batch_merchant_fk",
      columns: [table.replyBatchId, table.merchantId],
      foreignColumns: [subscriptionReplyBatches.id, subscriptionReplyBatches.merchantId],
    }).onDelete("restrict"),
    ledgerTenantForeignKey: foreignKey({
      name: "reply_reservations_ledger_merchant_fk",
      columns: [table.debitLedgerId, table.merchantId],
      foreignColumns: [replyLedger.id, replyLedger.merchantId],
    }).onDelete("restrict"),
    balanceCheck: check(
      "reply_reservations_balance_check",
      sql`${table.amount} > 0 AND ${table.balanceBeforeDebit} >= ${table.amount} AND ${table.balanceAfterDebit} = ${table.balanceBeforeDebit} - ${table.amount}`,
    ),
    sourceCheck: check(
      "reply_reservations_source_check",
      sql`(${table.debitSource} = 'base' AND ${table.replyBatchId} IS NULL) OR (${table.debitSource} IN ('purchase', 'emergency') AND ${table.replyBatchId} IS NOT NULL)`,
    ),
    stateCheck: check(
      "reply_reservations_state_check",
      sql`(${table.status} = 'reserved' AND ${table.consumedAt} IS NULL AND ${table.refundedAt} IS NULL) OR (${table.status} = 'consumed' AND ${table.consumedAt} IS NOT NULL AND ${table.refundedAt} IS NULL) OR (${table.status} = 'refunded' AND ${table.refundedAt} IS NOT NULL)`,
    ),
  }),
);

export const replyRefunds = pgTable(
  "reply_refunds",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id").notNull(),
    confirmedFailureCode: text("confirmed_failure_code").notNull(),
    state: replyRefundStateEnum("state").notNull().default("pending"),
    creditLedgerId: text("credit_ledger_id"),
    balanceAfterRefund: integer("balance_after_refund"),
    conflictCode: text("conflict_code"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    conflictAt: timestamp("conflict_at", { withTimezone: true }),
  },
  (table) => ({
    reservationUnique: uniqueIndex("reply_refunds_reservation_unique").on(
      table.reservationId,
    ),
    reservationTenantForeignKey: foreignKey({
      name: "reply_refunds_reservation_merchant_fk",
      columns: [table.reservationId, table.merchantId],
      foreignColumns: [replyReservations.id, replyReservations.merchantId],
    }).onDelete("cascade"),
    ledgerTenantForeignKey: foreignKey({
      name: "reply_refunds_ledger_merchant_fk",
      columns: [table.creditLedgerId, table.merchantId],
      foreignColumns: [replyLedger.id, replyLedger.merchantId],
    }).onDelete("restrict"),
    stateCheck: check(
      "reply_refunds_state_check",
      sql`(${table.state} = 'pending' AND ${table.creditLedgerId} IS NULL AND ${table.refundedAt} IS NULL AND ${table.conflictAt} IS NULL) OR (${table.state} = 'refunded' AND ${table.creditLedgerId} IS NOT NULL AND ${table.balanceAfterRefund} IS NOT NULL AND ${table.refundedAt} IS NOT NULL AND ${table.conflictAt} IS NULL) OR (${table.state} = 'conflict' AND ${table.creditLedgerId} IS NULL AND ${table.refundedAt} IS NULL AND ${table.conflictAt} IS NOT NULL AND ${table.conflictCode} IS NOT NULL)`,
    ),
    balanceCheck: check(
      "reply_refunds_balance_check",
      sql`${table.balanceAfterRefund} IS NULL OR ${table.balanceAfterRefund} >= 0`,
    ),
  }),
);

export const outboundDeliveries = pgTable(
  "outbound_deliveries",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    inboundEventId: text("inbound_event_id").notNull(),
    reservationId: text("reservation_id"),
    replyIntentId: text("reply_intent_id").notNull(),
    outcome: outboundDeliveryOutcomeEnum("outcome").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    failureCode: text("failure_code"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => ({
    idMerchantUnique: unique("outbound_deliveries_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    replyIntentUnique: uniqueIndex("outbound_deliveries_reply_intent_unique").on(
      table.merchantId,
      table.inboundEventId,
      table.replyIntentId,
    ),
    inboundTenantForeignKey: foreignKey({
      name: "outbound_deliveries_inbound_merchant_fk",
      columns: [table.inboundEventId, table.merchantId],
      foreignColumns: [channelInboundEvents.id, channelInboundEvents.merchantId],
    }).onDelete("cascade"),
    reservationTenantForeignKey: foreignKey({
      name: "outbound_deliveries_reservation_merchant_fk",
      columns: [table.reservationId, table.merchantId],
      foreignColumns: [replyReservations.id, replyReservations.merchantId],
    }).onDelete("set null"),
    outcomeCheck: check(
      "outbound_deliveries_outcome_check",
      sql`(${table.outcome} = 'pending' AND ${table.finalizedAt} IS NULL AND ${table.failureCode} IS NULL) OR (${table.outcome} = 'sent' AND ${table.finalizedAt} IS NOT NULL AND ${table.failureCode} IS NULL) OR (${table.outcome} = 'confirmed_failed' AND ${table.finalizedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL) OR (${table.outcome} = 'uncertain' AND ${table.finalizedAt} IS NOT NULL)`,
    ),
  }),
);

export type ChannelInboundEvent = typeof channelInboundEvents.$inferSelect;
export type ReplyReservation = typeof replyReservations.$inferSelect;
export type ReplyRefund = typeof replyRefunds.$inferSelect;
export type OutboundDelivery = typeof outboundDeliveries.$inferSelect;
