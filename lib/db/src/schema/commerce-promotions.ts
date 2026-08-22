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
} from "drizzle-orm/pg-core";
import { products, productVariants } from "./catalog";
import { merchants } from "./merchants";

export const commercePromotionScopeEnum = pgEnum("commerce_promotion_scope", [
  "catalog_item",
  "delivery",
]);

export const commercePromotionEffectEnum = pgEnum("commerce_promotion_effect", [
  "percentage_off",
  "fixed_amount_off",
  "fixed_price",
  "free_delivery",
]);

export const commercePromotions = pgTable(
  "commerce_promotions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scope: commercePromotionScopeEnum("scope").notNull(),
    effect: commercePromotionEffectEnum("effect").notNull(),
    productId: text("product_id"),
    variantId: text("variant_id"),
    percentageBps: integer("percentage_bps"),
    amountMinor: integer("amount_minor"),
    currencyCode: text("currency_code").notNull().default("IQD"),
    minimumSubtotalMinor: integer("minimum_subtotal_minor"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    scheduleTimezone: text("schedule_timezone").notNull(),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
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
    productTenantForeignKey: foreignKey({
      name: "commerce_promotions_product_tenant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("cascade"),
    variantTenantForeignKey: foreignKey({
      name: "commerce_promotions_variant_tenant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    merchantWindowIndex: index("commerce_promotions_merchant_window_idx").on(
      table.merchantId,
      table.enabled,
      table.startsAt,
      table.endsAt,
    ),
    catalogTargetIndex: index("commerce_promotions_catalog_target_idx").on(
      table.merchantId,
      table.productId,
      table.variantId,
      table.enabled,
    ),
    scopeTargetCheck: check(
      "commerce_promotions_scope_target_check",
      sql`(
        ${table.scope} = 'catalog_item'
        AND ${table.productId} IS NOT NULL
        AND ${table.effect} <> 'free_delivery'
      ) OR (
        ${table.scope} = 'delivery'
        AND ${table.productId} IS NULL
        AND ${table.variantId} IS NULL
        AND ${table.effect} = 'free_delivery'
      )`,
    ),
    variantTargetCheck: check(
      "commerce_promotions_variant_target_check",
      sql`${table.variantId} IS NULL OR ${table.productId} IS NOT NULL`,
    ),
    effectValueCheck: check(
      "commerce_promotions_effect_value_check",
      sql`(
        ${table.effect} = 'percentage_off'
        AND ${table.percentageBps} BETWEEN 1 AND 10000
        AND ${table.amountMinor} IS NULL
      ) OR (
        ${table.effect} = 'fixed_amount_off'
        AND ${table.percentageBps} IS NULL
        AND ${table.amountMinor} > 0
      ) OR (
        ${table.effect} = 'fixed_price'
        AND ${table.percentageBps} IS NULL
        AND ${table.amountMinor} >= 0
      ) OR (
        ${table.effect} = 'free_delivery'
        AND ${table.percentageBps} IS NULL
        AND ${table.amountMinor} IS NULL
      )`,
    ),
    currencyCheck: check(
      "commerce_promotions_currency_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    minimumSubtotalCheck: check(
      "commerce_promotions_minimum_subtotal_check",
      sql`${table.minimumSubtotalMinor} IS NULL OR ${table.minimumSubtotalMinor} >= 0`,
    ),
    scheduleCheck: check(
      "commerce_promotions_schedule_check",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    timezoneCheck: check(
      "commerce_promotions_timezone_check",
      sql`char_length(${table.scheduleTimezone}) BETWEEN 1 AND 100`,
    ),
    priorityCheck: check(
      "commerce_promotions_priority_check",
      sql`${table.priority} BETWEEN 0 AND 1000`,
    ),
    versionCheck: check(
      "commerce_promotions_version_check",
      sql`${table.version} > 0`,
    ),
    timestampOrderCheck: check(
      "commerce_promotions_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type CommercePromotion = typeof commercePromotions.$inferSelect;
export type NewCommercePromotion = typeof commercePromotions.$inferInsert;
