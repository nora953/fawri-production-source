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
      sql`${table.freeDeliveryThresholdIqd} IS NULL OR ${table.freeDeliveryThresholdIqd} >= 0`,
    ),
    deliveryDaysCheck: check(
      "merchant_settings_delivery_days_check",
      sql`${table.deliveryEstimatedDaysMin} > 0 AND ${table.deliveryEstimatedDaysMax} >= ${table.deliveryEstimatedDaysMin} AND ${table.deliveryEstimatedDaysMax} <= 30`,
    ),
    deliveryAreasCheck: check(
      "merchant_settings_delivery_areas_check",
      sql`jsonb_typeof(${table.deliveryAreas}) = 'array' AND jsonb_array_length(${table.deliveryAreas}) <= 100`,
    ),
    deliveryNotesCheck: check(
      "merchant_settings_delivery_notes_check",
      sql`char_length(${table.deliveryNotes}) <= 1000`,
    ),
    paymentMethodsShapeCheck: check(
      "merchant_settings_payment_methods_shape_check",
      sql`jsonb_typeof(${table.paymentMethods}) = 'array' AND jsonb_array_length(${table.paymentMethods}) BETWEEN 1 AND 5 AND ${table.paymentMethods} <@ '["cash_on_delivery","superqi","fastpay","zaincash","other"]'::jsonb`,
    ),
    paymentAvailabilityCheck: check(
      "merchant_settings_payment_availability_check",
      sql`${table.cashOnDeliveryEnabled} OR ${table.electronicPaymentEnabled}`,
    ),
    paymentMethodConsistencyCheck: check(
      "merchant_settings_payment_method_consistency_check",
      sql`${table.cashOnDeliveryEnabled} = (${table.paymentMethods} @> '["cash_on_delivery"]'::jsonb) AND ${table.electronicPaymentEnabled} = ((${table.paymentMethods} @> '["superqi"]'::jsonb) OR (${table.paymentMethods} @> '["fastpay"]'::jsonb) OR (${table.paymentMethods} @> '["zaincash"]'::jsonb) OR (${table.paymentMethods} @> '["other"]'::jsonb))`,
    ),
    paymentInstructionsCheck: check(
      "merchant_settings_payment_instructions_check",
      sql`char_length(${table.paymentInstructions}) <= 2000`,
    ),
    timestampOrderCheck: check(
      "merchant_settings_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type MerchantSettings = typeof merchantSettings.$inferSelect;
export type NewMerchantSettings = typeof merchantSettings.$inferInsert;
