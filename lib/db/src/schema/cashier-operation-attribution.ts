import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { merchantLocations } from "./locations";
import { merchants } from "./merchants";
import { cashierShifts } from "./cashier-staff";

export const cashierOperationAttribution = pgTable(
  "cashier_operation_attribution",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    saleId: text("sale_id"),
    operationKind: text("operation_kind").notNull(),
    stationId: text("station_id").notNull(),
    locationId: text("location_id").notNull(),
    staffId: text("staff_id").notNull(),
    shiftId: text("shift_id").notNull(),
    deviceId: text("device_id").notNull(),
    stationCredentialId: text("station_credential_id").notNull(),
    operatorSessionId: text("operator_session_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantOperationUnique: unique(
      "cashier_operation_attribution_merchant_operation_unique",
    ).on(table.merchantId, table.operationId),
    locationTenantForeignKey: foreignKey({
      name: "cashier_operation_attribution_location_merchant_fk",
      columns: [table.locationId, table.merchantId],
      foreignColumns: [merchantLocations.id, merchantLocations.merchantId],
    }).onDelete("restrict"),
    shiftIdentityForeignKey: foreignKey({
      name: "cashier_operation_attribution_shift_identity_fk",
      columns: [
        table.shiftId,
        table.merchantId,
        table.stationId,
        table.staffId,
      ],
      foreignColumns: [
        cashierShifts.id,
        cashierShifts.merchantId,
        cashierShifts.stationId,
        cashierShifts.staffId,
      ],
    }).onDelete("restrict"),
    staffOccurredIndex: index(
      "cashier_operation_attribution_staff_occurred_idx",
    ).on(table.merchantId, table.staffId, table.occurredAt),
    stationOccurredIndex: index(
      "cashier_operation_attribution_station_occurred_idx",
    ).on(table.merchantId, table.stationId, table.occurredAt),
    locationOccurredIndex: index(
      "cashier_operation_attribution_location_occurred_idx",
    ).on(table.merchantId, table.locationId, table.occurredAt),
    saleIndex: index("cashier_operation_attribution_sale_idx").on(
      table.merchantId,
      table.saleId,
      table.occurredAt,
    ),
    kindCheck: check(
      "cashier_operation_attribution_kind_check",
      sql`(${table.operationKind} IN ('sale', 'return', 'void') AND ${table.saleId} IS NOT NULL) OR (${table.operationKind} = 'inventory_adjustment' AND ${table.saleId} IS NULL)`,
    ),
    identityCheck: check(
      "cashier_operation_attribution_identity_check",
      sql`char_length(${table.operationId}) BETWEEN 1 AND 200 AND (${table.saleId} IS NULL OR char_length(${table.saleId}) BETWEEN 1 AND 200) AND char_length(${table.deviceId}) BETWEEN 1 AND 200 AND char_length(${table.stationCredentialId}) BETWEEN 1 AND 200 AND char_length(${table.operatorSessionId}) BETWEEN 1 AND 200`,
    ),
  }),
);

export type CashierOperationAttribution =
  typeof cashierOperationAttribution.$inferSelect;
export type NewCashierOperationAttribution =
  typeof cashierOperationAttribution.$inferInsert;
