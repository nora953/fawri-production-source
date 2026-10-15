import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const providerCostRates = pgTable(
  "provider_cost_rates",
  {
    id: text("id").primaryKey(),
    meterKey: text("meter_key").notNull(),
    providerKey: text("provider_key").notNull(),
    unitCode: text("unit_code").notNull(),
    dimensionKey: text("dimension_key").notNull().default("global"),
    dimensionValue: text("dimension_value").notNull().default("global"),
    rateUsd: numeric("rate_usd", { precision: 20, scale: 10 }).notNull(),
    sourceType: text("source_type").notNull().default("owner_configured"),
    sourceReference: text("source_reference"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdByAccountId: text("created_by_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    meterDimensionEffectiveUnique: uniqueIndex(
      "provider_cost_rates_meter_dimension_effective_unique",
    ).on(
      table.meterKey,
      table.dimensionKey,
      table.dimensionValue,
      table.effectiveFrom,
    ),
    meterEffectiveIndex: index("provider_cost_rates_meter_effective_idx").on(
      table.meterKey,
      table.effectiveFrom,
    ),
    providerEffectiveIndex: index("provider_cost_rates_provider_effective_idx").on(
      table.providerKey,
      table.effectiveFrom,
    ),
    rateCheck: check(
      "provider_cost_rates_rate_check",
      sql`${table.rateUsd}::numeric >= 0`,
    ),
    sourceCheck: check(
      "provider_cost_rates_source_check",
      sql`${table.sourceType} IN ('provider_api', 'provider_rate_card', 'owner_configured')`,
    ),
    providerKeyCheck: check(
      "provider_cost_rates_provider_key_check",
      sql`${table.providerKey} ~ '^[a-z0-9][a-z0-9._-]{0,79}$'`,
    ),
    meterKeyCheck: check(
      "provider_cost_rates_meter_key_check",
      sql`${table.meterKey} ~ '^[a-z0-9][a-z0-9._-]{0,79}$'`,
    ),
    dimensionCheck: check(
      "provider_cost_rates_dimension_check",
      sql`char_length(${table.dimensionKey}) BETWEEN 1 AND 80 AND char_length(${table.dimensionValue}) BETWEEN 1 AND 160`,
    ),
    effectiveRangeCheck: check(
      "provider_cost_rates_effective_range_check",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
  }),
);

export const providerCostObservations = pgTable(
  "provider_cost_observations",
  {
    id: text("id").primaryKey(),
    providerKey: text("provider_key").notNull(),
    meterKey: text("meter_key"),
    amountUsd: numeric("amount_usd", { precision: 20, scale: 10 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    sourceType: text("source_type").notNull(),
    sourceReference: text("source_reference"),
    dimensionKey: text("dimension_key").notNull().default("global"),
    dimensionValue: text("dimension_value").notNull().default("global"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerPeriodIndex: index("provider_cost_observations_provider_period_idx").on(
      table.providerKey,
      table.periodStart,
      table.periodEnd,
    ),
    meterPeriodIndex: index("provider_cost_observations_meter_period_idx").on(
      table.meterKey,
      table.periodStart,
    ),
    providerReferenceUnique: uniqueIndex(
      "provider_cost_observations_provider_reference_unique",
    )
      .on(table.providerKey, table.sourceReference)
      .where(sql`${table.sourceReference} is not null`),
    currencyCheck: check(
      "provider_cost_observations_currency_check",
      sql`${table.currency} = 'USD'`,
    ),
    sourceCheck: check(
      "provider_cost_observations_source_check",
      sql`${table.sourceType} IN ('provider_api', 'provider_invoice', 'owner_adjustment')`,
    ),
    providerKeyCheck: check(
      "provider_cost_observations_provider_key_check",
      sql`${table.providerKey} ~ '^[a-z0-9][a-z0-9._-]{0,79}$'`,
    ),
    periodCheck: check(
      "provider_cost_observations_period_check",
      sql`${table.periodEnd} > ${table.periodStart}`,
    ),
  }),
);

export const providerCostSettings = pgTable(
  "provider_cost_settings",
  {
    id: text("id").primaryKey().default("global"),
    monthlyBudgetUsd: numeric("monthly_budget_usd", { precision: 20, scale: 6 }),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    updatedByAccountId: text("updated_by_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    singletonCheck: check(
      "provider_cost_settings_singleton_check",
      sql`${table.id} = 'global'`,
    ),
    budgetCheck: check(
      "provider_cost_settings_budget_check",
      sql`${table.monthlyBudgetUsd} IS NULL OR ${table.monthlyBudgetUsd}::numeric >= 0`,
    ),
  }),
);

export const providerCostAuditEvents = pgTable(
  "provider_cost_audit_events",
  {
    id: text("id").primaryKey(),
    actorAccountId: text("actor_account_id"),
    action: text("action").notNull(),
    meterKey: text("meter_key"),
    rateId: text("rate_id"),
    previousValue: jsonb("previous_value").$type<Record<string, unknown>>(),
    nextValue: jsonb("next_value").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    createdIndex: index("provider_cost_audit_events_created_idx").on(table.createdAt),
    meterCreatedIndex: index("provider_cost_audit_events_meter_created_idx").on(
      table.meterKey,
      table.createdAt,
    ),
    actionCheck: check(
      "provider_cost_audit_events_action_check",
      sql`${table.action} IN ('rate_created', 'rate_updated', 'budget_updated')`,
    ),
  }),
);

export type ProviderCostRate = typeof providerCostRates.$inferSelect;
export type ProviderCostObservation = typeof providerCostObservations.$inferSelect;
export type ProviderCostSetting = typeof providerCostSettings.$inferSelect;
export type ProviderCostAuditEvent = typeof providerCostAuditEvents.$inferSelect;
