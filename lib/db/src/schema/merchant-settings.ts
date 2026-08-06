import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

export const merchantReplyLanguageEnum = pgEnum("merchant_reply_language", [
  "auto",
  "ar",
  "ku",
  "en",
]);

export const merchantSettings = pgTable(
  "merchant_settings",
  {
    merchantId: text("merchant_id")
      .primaryKey()
      .references(() => merchants.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(true),
    replyLanguage: merchantReplyLanguageEnum("reply_language")
      .notNull()
      .default("auto"),
    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    deliveryFeeIqd: integer("delivery_fee_iqd").notNull().default(0),
    freeDeliveryThresholdIqd: integer("free_delivery_threshold_iqd"),
    deliveryEstimatedDaysMin: integer("delivery_estimated_days_min")
      .notNull()
      .default(1),
    deliveryEstimatedDaysMax: integer("delivery_estimated_days_max")
      .notNull()
      .default(3),
    deliveryAreas: jsonb("delivery_areas")
      .$type<string[]>()
      .notNull()
      .default([]),
    deliveryNotes: text("delivery_notes").notNull().default(""),
    cashOnDeliveryEnabled: boolean("cash_on_delivery_enabled")
      .notNull()
      .default(true),
    electronicPaymentEnabled: boolean("electronic_payment_enabled")
      .notNull()
      .default(false),
    paymentMethods: jsonb("payment_methods")
      .$type<string[]>()
      .notNull()
      .default(["cash_on_delivery"]),
    paymentInstructions: text("payment_instructions").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    versionCheck: check(
      "merchant_settings_version_check",
      sql`${table.version} > 0`,
    ),
    deliveryFeeCheck: check(
      "merchant_settings_delivery_fee_check",
      sql`${table.deliveryFeeIqd} >= 0`,
    ),
    freeDeliveryThresholdCheck: check(
      "merchant_settings_free_delivery_threshold_check",
      sql`${table.freeDeliveryThresholdIqd} is null or ${table.freeDeliveryThresholdIqd} >= 0`,
    ),
    deliveryDaysCheck: check(
      "merchant_settings_delivery_days_check",
      sql`${table.deliveryEstimatedDaysMin} > 0 and ${table.deliveryEstimatedDaysMax} >= ${table.deliveryEstimatedDaysMin}`,
    ),
    paymentAvailabilityCheck: check(
      "merchant_settings_payment_availability_check",
      sql`${table.cashOnDeliveryEnabled} or ${table.electronicPaymentEnabled}`,
    ),
    timestampOrderCheck: check(
      "merchant_settings_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type MerchantSettings = typeof merchantSettings.$inferSelect;
export type NewMerchantSettings = typeof merchantSettings.$inferInsert;
