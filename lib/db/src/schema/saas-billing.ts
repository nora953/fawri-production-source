import { sql } from "drizzle-orm";
import {
  boolean,
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
import { merchants } from "./merchants";
import { subscriptionPlanEnum } from "./enums";
import { subscriptions } from "./subscriptions";

export const saasBillingOrders = pgTable(
  "saas_billing_orders",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    requestedPlan: subscriptionPlanEnum("requested_plan").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    currency: text("currency").notNull().default("IQD"),
    catalogVersion: text("catalog_version").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerCheckoutRef: text("provider_checkout_ref"),
    providerPaymentRef: text("provider_payment_ref"),
    requestExpiresAt: timestamp("request_expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
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
    idMerchantUnique: unique("saas_billing_orders_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantIdempotencyUnique: uniqueIndex(
      "saas_billing_orders_merchant_idempotency_unique",
    ).on(table.merchantId, table.idempotencyKey),
    providerPaymentUnique: uniqueIndex(
      "saas_billing_orders_provider_payment_unique",
    )
      .on(table.provider, table.providerPaymentRef)
      .where(sql`${table.providerPaymentRef} is not null`),
    merchantCreatedIndex: index("saas_billing_orders_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    statusUpdatedIndex: index("saas_billing_orders_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    operationCheck: check(
      "saas_billing_orders_operation_check",
      sql`${table.operation} IN ('activate', 'renew', 'change')`,
    ),
    planCheck: check(
      "saas_billing_orders_paid_plan_check",
      sql`${table.requestedPlan} <> 'trial'`,
    ),
    amountCheck: check(
      "saas_billing_orders_amount_check",
      sql`${table.amountIqd} > 0`,
    ),
    currencyCheck: check(
      "saas_billing_orders_currency_check",
      sql`${table.currency} = 'IQD'`,
    ),
    statusCheck: check(
      "saas_billing_orders_status_check",
      sql`${table.status} IN ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')`,
    ),
    requestTimeCheck: check(
      "saas_billing_orders_request_time_check",
      sql`${table.requestExpiresAt} > ${table.createdAt} AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const saasBillingEvents = pgTable(
  "saas_billing_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("received"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderTenantForeignKey: foreignKey({
      name: "saas_billing_events_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [saasBillingOrders.id, saasBillingOrders.merchantId],
    }).onDelete("cascade"),
    providerEventUnique: uniqueIndex("saas_billing_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    merchantCreatedIndex: index("saas_billing_events_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    payloadHashCheck: check(
      "saas_billing_events_payload_hash_check",
      sql`char_length(${table.payloadHash}) BETWEEN 32 AND 128`,
    ),
    statusCheck: check(
      "saas_billing_events_status_check",
      sql`${table.status} IN ('received', 'applied', 'rejected')`,
    ),
  }),
);

export const saasEntitlementApplications = pgTable(
  "saas_entitlement_applications",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    operation: text("operation").notNull(),
    appliedPlan: subscriptionPlanEnum("applied_plan").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    provider: text("provider").notNull(),
    providerPaymentRef: text("provider_payment_ref").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderTenantForeignKey: foreignKey({
      name: "saas_entitlement_applications_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [saasBillingOrders.id, saasBillingOrders.merchantId],
    }).onDelete("restrict"),
    subscriptionTenantForeignKey: foreignKey({
      name: "saas_entitlement_applications_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [subscriptions.id, subscriptions.merchantId],
    }).onDelete("restrict"),
    orderUnique: uniqueIndex("saas_entitlement_applications_order_unique").on(
      table.orderId,
    ),
    providerPaymentUnique: uniqueIndex(
      "saas_entitlement_applications_provider_payment_unique",
    ).on(table.provider, table.providerPaymentRef),
    merchantAppliedIndex: index(
      "saas_entitlement_applications_merchant_applied_idx",
    ).on(table.merchantId, table.appliedAt),
    operationCheck: check(
      "saas_entitlement_applications_operation_check",
      sql`${table.operation} IN ('activate', 'renew', 'change')`,
    ),
    planCheck: check(
      "saas_entitlement_applications_paid_plan_check",
      sql`${table.appliedPlan} <> 'trial'`,
    ),
    amountCheck: check(
      "saas_entitlement_applications_amount_check",
      sql`${table.amountIqd} > 0`,
    ),
  }),
);

export const saasBillingRefunds = pgTable(
  "saas_billing_refunds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerRefundRef: text("provider_refund_ref").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    status: text("status").notNull().default("pending"),
    reasonCode: text("reason_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => ({
    orderTenantForeignKey: foreignKey({
      name: "saas_billing_refunds_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [saasBillingOrders.id, saasBillingOrders.merchantId],
    }).onDelete("restrict"),
    providerRefundUnique: uniqueIndex("saas_billing_refunds_provider_refund_unique").on(
      table.provider,
      table.providerRefundRef,
    ),
    merchantCreatedIndex: index("saas_billing_refunds_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    amountCheck: check(
      "saas_billing_refunds_amount_check",
      sql`${table.amountIqd} > 0`,
    ),
    statusCheck: check(
      "saas_billing_refunds_status_check",
      sql`${table.status} IN ('pending', 'settled', 'failed', 'cancelled')`,
    ),
  }),
);

export type SaasBillingOrder = typeof saasBillingOrders.$inferSelect;
export type SaasBillingEvent = typeof saasBillingEvents.$inferSelect;
export type SaasEntitlementApplication = typeof saasEntitlementApplications.$inferSelect;
export type SaasBillingRefund = typeof saasBillingRefunds.$inferSelect;
