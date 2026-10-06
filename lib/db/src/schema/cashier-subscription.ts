import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { merchantCashierStations } from "./cashier-staff";
import { merchants } from "./merchants";

export const merchantCashierSubscriptions = pgTable(
  "merchant_cashier_subscriptions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("inactive"),
    licensedSeats: integer("licensed_seats").notNull().default(0),
    pricePerSeatIqd: integer("price_per_seat_iqd").notNull().default(3900),
    billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }),
    billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }),
    graceDurationSeconds: integer("grace_duration_seconds").notNull().default(604800),
    scheduledLicensedSeats: integer("scheduled_licensed_seats"),
    scheduledChangeAt: timestamp("scheduled_change_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("merchant_cashier_subscriptions_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantUnique: uniqueIndex("merchant_cashier_subscriptions_merchant_unique").on(
      table.merchantId,
    ),
    statusPeriodIndex: index("merchant_cashier_subscriptions_status_period_idx").on(
      table.status,
      table.billingPeriodEnd,
    ),
    statusCheck: check(
      "merchant_cashier_subscriptions_status_check",
      sql`${table.status} IN ('inactive','active','suspended','cancelled')`,
    ),
    countersCheck: check(
      "merchant_cashier_subscriptions_counters_check",
      sql`${table.licensedSeats} >= 0 AND ${table.pricePerSeatIqd} > 0 AND ${table.graceDurationSeconds} > 0 AND ${table.version} > 0`,
    ),
    lifecycleCheck: check(
      "merchant_cashier_subscriptions_lifecycle_check",
      sql`(${table.status} = 'inactive' AND ${table.licensedSeats} = 0 AND ${table.billingPeriodStart} IS NULL AND ${table.billingPeriodEnd} IS NULL) OR (${table.status} <> 'inactive' AND ${table.licensedSeats} > 0 AND ${table.billingPeriodStart} IS NOT NULL AND ${table.billingPeriodEnd} IS NOT NULL AND ${table.billingPeriodEnd} > ${table.billingPeriodStart})`,
    ),
    scheduledChangeCheck: check(
      "merchant_cashier_subscriptions_scheduled_change_check",
      sql`(${table.scheduledLicensedSeats} IS NULL AND ${table.scheduledChangeAt} IS NULL) OR (${table.scheduledLicensedSeats} IS NOT NULL AND ${table.scheduledLicensedSeats} > 0 AND ${table.scheduledLicensedSeats} < ${table.licensedSeats} AND ${table.scheduledChangeAt} IS NOT NULL AND ${table.billingPeriodEnd} IS NOT NULL AND ${table.scheduledChangeAt} = ${table.billingPeriodEnd})`,
    ),
    timestampCheck: check(
      "merchant_cashier_subscriptions_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
).enableRLS();

export const cashierStationSeatAssignments = pgTable(
  "cashier_station_seat_assignments",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    stationId: text("station_id").notNull(),
    status: text("status").notNull().default("active"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    releaseEffectiveAt: timestamp("release_effective_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionTenantForeignKey: foreignKey({
      name: "cashier_station_seat_assignments_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [merchantCashierSubscriptions.id, merchantCashierSubscriptions.merchantId],
    }).onDelete("cascade"),
    stationTenantForeignKey: foreignKey({
      name: "cashier_station_seat_assignments_station_merchant_fk",
      columns: [table.stationId, table.merchantId],
      foreignColumns: [merchantCashierStations.id, merchantCashierStations.merchantId],
    }).onDelete("cascade"),
    stationUnique: uniqueIndex("cashier_station_seat_assignments_station_unique")
      .on(table.merchantId, table.stationId)
      .where(sql`${table.status} IN ('active','release_scheduled')`),
    subscriptionStatusIndex: index("cashier_station_seat_assignments_subscription_status_idx").on(
      table.merchantId,
      table.subscriptionId,
      table.status,
    ),
    statusCheck: check(
      "cashier_station_seat_assignments_status_check",
      sql`${table.status} IN ('active','release_scheduled','released')`,
    ),
    lifecycleCheck: check(
      "cashier_station_seat_assignments_lifecycle_check",
      sql`(${table.status} = 'active' AND ${table.releaseEffectiveAt} IS NULL AND ${table.releasedAt} IS NULL) OR (${table.status} = 'release_scheduled' AND ${table.releaseEffectiveAt} IS NOT NULL AND ${table.releasedAt} IS NULL) OR (${table.status} = 'released' AND ${table.releasedAt} IS NOT NULL)`,
    ),
    timestampCheck: check(
      "cashier_station_seat_assignments_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
).enableRLS();

export const cashierBillingOrders = pgTable(
  "cashier_billing_orders",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id"),
    operation: text("operation").notNull(),
    currentSeats: integer("current_seats").notNull(),
    requestedSeats: integer("requested_seats").notNull(),
    resultingSeats: integer("resulting_seats").notNull(),
    unitPriceIqd: integer("unit_price_iqd").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    currency: text("currency").notNull().default("IQD"),
    billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }).notNull(),
    billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }).notNull(),
    graceDurationSeconds: integer("grace_duration_seconds").notNull().default(604800),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text("provider").notNull(),
    providerCheckoutRef: text("provider_checkout_ref"),
    providerPaymentRef: text("provider_payment_ref"),
    requestExpiresAt: timestamp("request_expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("cashier_billing_orders_id_merchant_unique").on(table.id, table.merchantId),
    subscriptionTenantForeignKey: foreignKey({
      name: "cashier_billing_orders_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [merchantCashierSubscriptions.id, merchantCashierSubscriptions.merchantId],
    }).onDelete("restrict"),
    merchantIdempotencyUnique: uniqueIndex("cashier_billing_orders_merchant_idempotency_unique").on(
      table.merchantId,
      table.idempotencyKey,
    ),
    providerPaymentUnique: uniqueIndex("cashier_billing_orders_provider_payment_unique")
      .on(table.provider, table.providerPaymentRef)
      .where(sql`${table.providerPaymentRef} IS NOT NULL`),
    merchantPendingUnique: uniqueIndex("cashier_billing_orders_merchant_pending_unique")
      .on(table.merchantId)
      .where(sql`${table.status} = 'pending'`),
    merchantStatusIndex: index("cashier_billing_orders_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.createdAt,
    ),
    operationCheck: check(
      "cashier_billing_orders_operation_check",
      sql`${table.operation} IN ('activate','renew','add_seats')`,
    ),
    statusCheck: check(
      "cashier_billing_orders_status_check",
      sql`${table.status} IN ('pending','paid','applied','failed','cancelled','expired','paid_reconciliation_required')`,
    ),
    monetaryCheck: check(
      "cashier_billing_orders_monetary_check",
      sql`${table.unitPriceIqd} > 0 AND ${table.amountIqd} > 0 AND ${table.currency} = 'IQD'`,
    ),
    seatsCheck: check(
      "cashier_billing_orders_seats_check",
      sql`${table.currentSeats} >= 0 AND ${table.requestedSeats} > 0 AND ${table.resultingSeats} > 0`,
    ),
    periodCheck: check(
      "cashier_billing_orders_period_check",
      sql`${table.billingPeriodEnd} > ${table.billingPeriodStart} AND ${table.graceDurationSeconds} > 0 AND ${table.requestExpiresAt} > ${table.createdAt} AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
).enableRLS();

export const cashierBillingEvents = pgTable(
  "cashier_billing_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("received"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderTenantForeignKey: foreignKey({
      name: "cashier_billing_events_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [cashierBillingOrders.id, cashierBillingOrders.merchantId],
    }).onDelete("cascade"),
    providerEventUnique: uniqueIndex("cashier_billing_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    merchantCreatedIndex: index("cashier_billing_events_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    eventCheck: check(
      "cashier_billing_events_event_check",
      sql`${table.eventType} IN ('payment_succeeded','payment_failed','payment_cancelled')`,
    ),
    statusCheck: check(
      "cashier_billing_events_status_check",
      sql`${table.status} IN ('received','applied','rejected')`,
    ),
    payloadHashCheck: check(
      "cashier_billing_events_payload_hash_check",
      sql`char_length(${table.payloadHash}) BETWEEN 32 AND 128`,
    ),
  }),
).enableRLS();

export const cashierEntitlementApplications = pgTable(
  "cashier_entitlement_applications",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    orderId: text("order_id").notNull(),
    operation: text("operation").notNull(),
    previousSeats: integer("previous_seats").notNull(),
    resultingSeats: integer("resulting_seats").notNull(),
    previousVersion: integer("previous_version").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    provider: text("provider").notNull(),
    providerPaymentRef: text("provider_payment_ref").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionTenantForeignKey: foreignKey({
      name: "cashier_entitlement_applications_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [merchantCashierSubscriptions.id, merchantCashierSubscriptions.merchantId],
    }).onDelete("restrict"),
    orderTenantForeignKey: foreignKey({
      name: "cashier_entitlement_applications_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [cashierBillingOrders.id, cashierBillingOrders.merchantId],
    }).onDelete("restrict"),
    orderUnique: uniqueIndex("cashier_entitlement_applications_order_unique").on(table.orderId),
    providerPaymentUnique: uniqueIndex("cashier_entitlement_applications_provider_payment_unique").on(
      table.provider,
      table.providerPaymentRef,
    ),
    merchantAppliedIndex: index("cashier_entitlement_applications_merchant_applied_idx").on(
      table.merchantId,
      table.appliedAt,
    ),
    operationCheck: check(
      "cashier_entitlement_applications_operation_check",
      sql`${table.operation} IN ('activate','renew','add_seats')`,
    ),
    countersCheck: check(
      "cashier_entitlement_applications_counters_check",
      sql`${table.previousSeats} >= 0 AND ${table.resultingSeats} > 0 AND ${table.previousVersion} >= 0 AND ${table.resultingVersion} > ${table.previousVersion} AND ${table.amountIqd} > 0`,
    ),
  }),
).enableRLS();

export const cashierEntitlementAuditEvents = pgTable(
  "cashier_entitlement_audit_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorRef: text("actor_ref"),
    fromSeats: integer("from_seats"),
    toSeats: integer("to_seats"),
    fromVersion: integer("from_version"),
    toVersion: integer("to_version"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionTenantForeignKey: foreignKey({
      name: "cashier_entitlement_audit_events_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [merchantCashierSubscriptions.id, merchantCashierSubscriptions.merchantId],
    }).onDelete("restrict"),
    merchantCreatedIndex: index("cashier_entitlement_audit_events_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    actionCheck: check(
      "cashier_entitlement_audit_events_action_check",
      sql`${table.action} IN ('activate','renew','add_seats','schedule_downgrade','apply_downgrade','suspend','resume','cancel','seat_assign','seat_release')`,
    ),
    actorCheck: check(
      "cashier_entitlement_audit_events_actor_check",
      sql`${table.actorType} IN ('merchant','admin','system','payment_webhook')`,
    ),
  }),
).enableRLS();

export type MerchantCashierSubscription = typeof merchantCashierSubscriptions.$inferSelect;
export type CashierStationSeatAssignment = typeof cashierStationSeatAssignments.$inferSelect;
export type CashierBillingOrder = typeof cashierBillingOrders.$inferSelect;
export type CashierBillingEvent = typeof cashierBillingEvents.$inferSelect;
export type CashierEntitlementApplication = typeof cashierEntitlementApplications.$inferSelect;
