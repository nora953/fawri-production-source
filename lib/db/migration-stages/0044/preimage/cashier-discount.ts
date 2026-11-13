import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { merchantCashierStaff, merchantCashierStations } from "./cashier-staff";
import { merchants } from "./merchants";

export const merchantCashierDiscountSettings = pgTable(
  "merchant_cashier_discount_settings",
  {
    merchantId: text("merchant_id").primaryKey(),
    discountKind: text("discount_kind").notNull().default("amount"),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantForeignKey: foreignKey({
      name: "cashier_merchant_discount_settings_merchant_fk",
      columns: [table.merchantId],
      foreignColumns: [merchants.id],
    }).onDelete("cascade"),
    kindCheck: check(
      "cashier_merchant_discount_kind_check",
      sql`${table.discountKind} IN ('amount','percentage')`,
    ),
    versionPositiveCheck: check(
      "cashier_merchant_discount_settings_version_positive",
      sql`${table.version} > 0`,
    ),
    timestampCheck: check(
      "cashier_merchant_discount_settings_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const merchantCashierStaffDiscountPolicies = pgTable(
  "merchant_cashier_staff_discount_policies",
  {
    merchantId: text("merchant_id").notNull(),
    staffId: text("staff_id").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    maxPercentageBps: integer("max_percentage_bps").notNull().default(0),
    maxAmountMinor: bigint("max_amount_minor", { mode: "number" }),
    canApproveOverride: boolean("can_approve_override").notNull().default(false),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.merchantId, table.staffId] }),
    merchantForeignKey: foreignKey({
      name: "cashier_discount_policy_merchant_fk",
      columns: [table.merchantId],
      foreignColumns: [merchants.id],
    }).onDelete("cascade"),
    staffTenantForeignKey: foreignKey({
      name: "cashier_discount_policy_staff_merchant_fk",
      columns: [table.staffId, table.merchantId],
      foreignColumns: [merchantCashierStaff.id, merchantCashierStaff.merchantId],
    }).onDelete("cascade"),
    merchantIndex: index("merchant_cashier_staff_discount_policies_merchant_idx").on(
      table.merchantId,
      table.staffId,
    ),
    percentageRangeCheck: check(
      "cashier_discount_percentage_range",
      sql`${table.maxPercentageBps} >= 0 AND ${table.maxPercentageBps} <= 10000`,
    ),
    amountNonnegativeCheck: check(
      "cashier_discount_amount_nonnegative",
      sql`${table.maxAmountMinor} IS NULL OR ${table.maxAmountMinor} >= 0`,
    ),
    versionPositiveCheck: check(
      "cashier_discount_policy_version_positive",
      sql`${table.version} > 0`,
    ),
    timestampCheck: check(
      "cashier_discount_policy_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const merchantCashierDiscountOverrideApprovals = pgTable(
  "merchant_cashier_discount_override_approvals",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    stationId: text("station_id").notNull(),
    operatorStaffId: text("operator_staff_id").notNull(),
    approverStaffId: text("approver_staff_id").notNull(),
    operationId: text("operation_id").notNull(),
    manualDiscountMinor: bigint("manual_discount_minor", { mode: "number" }).notNull(),
    manualDiscountReason: text("manual_discount_reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantOperationUnique: unique(
      "merchant_cashier_discount_override_merchant_operation_unique",
    ).on(table.merchantId, table.operationId),
    merchantForeignKey: foreignKey({
      name: "cashier_discount_override_merchant_fk",
      columns: [table.merchantId],
      foreignColumns: [merchants.id],
    }).onDelete("cascade"),
    stationTenantForeignKey: foreignKey({
      name: "cashier_discount_override_station_merchant_fk",
      columns: [table.stationId, table.merchantId],
      foreignColumns: [merchantCashierStations.id, merchantCashierStations.merchantId],
    }).onDelete("restrict"),
    operatorTenantForeignKey: foreignKey({
      name: "cashier_discount_override_operator_merchant_fk",
      columns: [table.operatorStaffId, table.merchantId],
      foreignColumns: [merchantCashierStaff.id, merchantCashierStaff.merchantId],
    }).onDelete("restrict"),
    approverTenantForeignKey: foreignKey({
      name: "cashier_discount_override_approver_merchant_fk",
      columns: [table.approverStaffId, table.merchantId],
      foreignColumns: [merchantCashierStaff.id, merchantCashierStaff.merchantId],
    }).onDelete("restrict"),
    lookupIndex: index("merchant_cashier_discount_override_approvals_lookup_idx").on(
      table.merchantId,
      table.operationId,
      table.id,
    ),
    approverIndex: index("merchant_cashier_discount_override_approvals_approver_idx").on(
      table.merchantId,
      table.approverStaffId,
      table.createdAt.desc(),
    ),
    expiryIndex: index("merchant_cashier_discount_override_approvals_expiry_idx")
      .on(table.merchantId, table.expiresAt)
      .where(sql`${table.consumedAt} IS NULL`),
    amountPositiveCheck: check(
      "cashier_discount_override_amount_positive",
      sql`${table.manualDiscountMinor} > 0`,
    ),
    reasonNonemptyCheck: check(
      "cashier_discount_override_reason_nonempty",
      sql`char_length(btrim(${table.manualDiscountReason})) BETWEEN 1 AND 200`,
    ),
    notSelfApprovedCheck: check(
      "cashier_discount_override_not_self_approved",
      sql`${table.operatorStaffId} <> ${table.approverStaffId}`,
    ),
    expiryCheck: check(
      "cashier_discount_override_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    consumedTimeCheck: check(
      "cashier_discount_override_consumed_time_check",
      sql`${table.consumedAt} IS NULL OR ${table.consumedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type MerchantCashierDiscountSetting =
  typeof merchantCashierDiscountSettings.$inferSelect;
export type NewMerchantCashierDiscountSetting =
  typeof merchantCashierDiscountSettings.$inferInsert;
export type MerchantCashierStaffDiscountPolicy =
  typeof merchantCashierStaffDiscountPolicies.$inferSelect;
export type NewMerchantCashierStaffDiscountPolicy =
  typeof merchantCashierStaffDiscountPolicies.$inferInsert;
export type MerchantCashierDiscountOverrideApproval =
  typeof merchantCashierDiscountOverrideApprovals.$inferSelect;
export type NewMerchantCashierDiscountOverrideApproval =
  typeof merchantCashierDiscountOverrideApprovals.$inferInsert;
