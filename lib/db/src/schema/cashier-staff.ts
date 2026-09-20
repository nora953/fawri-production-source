import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { merchantLocations } from "./merchant-locations";
import { merchants } from "./merchants";

export const merchantCashierStaff = pgTable(
  "merchant_cashier_staff",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("cashier"),
    status: text("status").notNull().default("active"),
    pinHash: text("pin_hash").notNull(),
    pinVersion: integer("pin_version").notNull().default(1),
    failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    pinChangedAt: timestamp("pin_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("merchant_cashier_staff_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantStatusIndex: index("merchant_cashier_staff_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    roleCheck: check(
      "merchant_cashier_staff_role_check",
      sql`${table.role} IN ('cashier', 'manager')`,
    ),
    statusCheck: check(
      "merchant_cashier_staff_status_check",
      sql`${table.status} IN ('active', 'disabled', 'revoked')`,
    ),
    pinHashCheck: check(
      "merchant_cashier_staff_pin_hash_check",
      sql`char_length(${table.pinHash}) BETWEEN 32 AND 256`,
    ),
    countersCheck: check(
      "merchant_cashier_staff_counters_check",
      sql`${table.pinVersion} > 0 AND ${table.version} > 0 AND ${table.failedPinAttempts} >= 0 AND ${table.failedPinAttempts} <= 20`,
    ),
    revokedStateCheck: check(
      "merchant_cashier_staff_revoked_state_check",
      sql`(${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL) OR (${table.status} <> 'revoked' AND ${table.revokedAt} IS NULL)`,
    ),
    timestampCheck: check(
      "merchant_cashier_staff_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt} AND ${table.pinChangedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const merchantCashierStaffPermissions = pgTable(
  "merchant_cashier_staff_permissions",
  {
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    staffId: text("staff_id").notNull(),
    permission: text("permission").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.staffId, table.permission] }),
    staffTenantForeignKey: foreignKey({
      name: "merchant_cashier_staff_permissions_staff_merchant_fk",
      columns: [table.staffId, table.merchantId],
      foreignColumns: [merchantCashierStaff.id, merchantCashierStaff.merchantId],
    }).onDelete("cascade"),
    merchantIndex: index("merchant_cashier_staff_permissions_merchant_idx").on(
      table.merchantId,
      table.staffId,
    ),
    permissionCheck: check(
      "merchant_cashier_staff_permissions_permission_check",
      sql`${table.permission} IN (
        'sale.create',
        'sale.view_own',
        'sale.view_all',
        'sale.return',
        'sale.void',
        'sale.discount',
        'sale.discount_override',
        'inventory.adjust',
        'reports.sales',
        'reports.profit',
        'catalog.cost',
        'shifts.manage',
        'staff.manage',
        'stations.manage'
      )`,
    ),
  }),
);

export const merchantCashierStations = pgTable(
  "merchant_cashier_stations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    branchKey: text("branch_key").notNull().default("main"),
    branchLabel: text("branch_label"),
    locationId: text("location_id"),
    status: text("status").notNull().default("active"),
    pairedDeviceId: text("paired_device_id"),
    offlineInventoryAuthority: boolean("offline_inventory_authority")
      .notNull()
      .default(false),
    credentialVersion: integer("credential_version").notNull().default(1),
    pairedAt: timestamp("paired_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    locationTenantForeignKey: foreignKey({
      name: "merchant_cashier_stations_location_merchant_fk",
      columns: [table.locationId, table.merchantId],
      foreignColumns: [merchantLocations.id, merchantLocations.merchantId],
    }),
    idMerchantUnique: unique("merchant_cashier_stations_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantStatusIndex: index("merchant_cashier_stations_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    merchantLocationIndex: index(
      "merchant_cashier_stations_merchant_location_idx",
    ).on(table.merchantId, table.locationId, table.status),
    pairedDeviceUnique: uniqueIndex("merchant_cashier_stations_device_unique")
      .on(table.merchantId, table.pairedDeviceId)
      .where(sql`${table.pairedDeviceId} IS NOT NULL`),
    offlineBranchUnique: uniqueIndex(
      "merchant_cashier_stations_offline_branch_unique",
    )
      .on(table.merchantId, table.branchKey)
      .where(
        sql`${table.offlineInventoryAuthority} = TRUE AND ${table.status} = 'active'`,
      ),
    statusCheck: check(
      "merchant_cashier_stations_status_check",
      sql`${table.status} IN ('active', 'disabled', 'revoked')`,
    ),
    identityCheck: check(
      "merchant_cashier_stations_identity_check",
      sql`char_length(${table.name}) BETWEEN 1 AND 120 AND char_length(${table.branchKey}) BETWEEN 1 AND 120 AND (${table.pairedDeviceId} IS NULL OR char_length(${table.pairedDeviceId}) BETWEEN 1 AND 200)`,
    ),
    credentialVersionCheck: check(
      "merchant_cashier_stations_credential_version_check",
      sql`${table.credentialVersion} > 0`,
    ),
    pairingStateCheck: check(
      "merchant_cashier_stations_pairing_state_check",
      sql`(${table.pairedDeviceId} IS NULL AND ${table.pairedAt} IS NULL) OR (${table.pairedDeviceId} IS NOT NULL AND ${table.pairedAt} IS NOT NULL)`,
    ),
    revokedStateCheck: check(
      "merchant_cashier_stations_revoked_state_check",
      sql`(${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL) OR (${table.status} <> 'revoked' AND ${table.revokedAt} IS NULL)`,
    ),
    timestampCheck: check(
      "merchant_cashier_stations_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt} AND (${table.lastSeenAt} IS NULL OR ${table.lastSeenAt} >= ${table.createdAt})`,
    ),
  }),
);

export const cashierStationPairingChallenges = pgTable(
  "cashier_station_pairing_challenges",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    stationId: text("station_id").notNull(),
    codeHash: text("code_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByDeviceId: text("used_by_device_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    stationTenantForeignKey: foreignKey({
      name: "cashier_station_pairing_challenges_station_merchant_fk",
      columns: [table.stationId, table.merchantId],
      foreignColumns: [merchantCashierStations.id, merchantCashierStations.merchantId],
    }).onDelete("cascade"),
    liveStationUnique: uniqueIndex("cashier_station_pairing_challenges_live_station_unique")
      .on(table.merchantId, table.stationId)
      .where(sql`${table.status} = 'active'`),
    codeHashUnique: uniqueIndex("cashier_station_pairing_challenges_code_hash_unique").on(
      table.codeHash,
    ),
    expiryIndex: index("cashier_station_pairing_challenges_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
    statusCheck: check(
      "cashier_station_pairing_challenges_status_check",
      sql`${table.status} IN ('active', 'used', 'revoked', 'expired')`,
    ),
    codeHashCheck: check(
      "cashier_station_pairing_challenges_code_hash_check",
      sql`char_length(${table.codeHash}) = 64`,
    ),
    timeCheck: check(
      "cashier_station_pairing_challenges_time_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    terminalStateCheck: check(
      "cashier_station_pairing_challenges_terminal_state_check",
      sql`(${table.status} = 'active' AND ${table.usedAt} IS NULL AND ${table.usedByDeviceId} IS NULL AND ${table.revokedAt} IS NULL) OR (${table.status} = 'used' AND ${table.usedAt} IS NOT NULL AND ${table.usedByDeviceId} IS NOT NULL AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.usedAt} IS NULL AND ${table.usedByDeviceId} IS NULL AND ${table.revokedAt} IS NOT NULL) OR (${table.status} = 'expired' AND ${table.usedAt} IS NULL AND ${table.usedByDeviceId} IS NULL AND ${table.revokedAt} IS NULL)`,
    ),
  }),
);

export const cashierStationCredentials = pgTable(
  "cashier_station_credentials",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    stationId: text("station_id").notNull(),
    deviceId: text("device_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    stationTenantForeignKey: foreignKey({
      name: "cashier_station_credentials_station_merchant_fk",
      columns: [table.stationId, table.merchantId],
      foreignColumns: [merchantCashierStations.id, merchantCashierStations.merchantId],
    }).onDelete("cascade"),
    tokenHashUnique: uniqueIndex("cashier_station_credentials_token_hash_unique").on(
      table.tokenHash,
    ),
    liveStationUnique: uniqueIndex("cashier_station_credentials_live_station_unique")
      .on(table.merchantId, table.stationId)
      .where(sql`${table.status} = 'active'`),
    merchantDeviceIndex: index("cashier_station_credentials_device_idx").on(
      table.merchantId,
      table.deviceId,
      table.status,
    ),
    statusCheck: check(
      "cashier_station_credentials_status_check",
      sql`${table.status} IN ('active', 'revoked', 'expired')`,
    ),
    tokenHashCheck: check(
      "cashier_station_credentials_token_hash_check",
      sql`char_length(${table.tokenHash}) = 64`,
    ),
    identityCheck: check(
      "cashier_station_credentials_identity_check",
      sql`char_length(${table.deviceId}) BETWEEN 1 AND 200 AND ${table.version} > 0`,
    ),
    timeCheck: check(
      "cashier_station_credentials_time_check",
      sql`${table.expiresAt} > ${table.issuedAt} AND (${table.lastUsedAt} IS NULL OR ${table.lastUsedAt} >= ${table.issuedAt})`,
    ),
    terminalStateCheck: check(
      "cashier_station_credentials_terminal_state_check",
      sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL) OR (${table.status} = 'expired' AND ${table.revokedAt} IS NULL)`,
    ),
  }),
);

export const cashierShifts = pgTable(
  "cashier_shifts",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    stationId: text("station_id").notNull(),
    staffId: text("staff_id").notNull(),
    status: text("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    closeReason: text("close_reason"),
  },
  (table) => ({
    identityUnique: unique("cashier_shifts_identity_unique").on(
      table.id,
      table.merchantId,
      table.stationId,
      table.staffId,
    ),
    stationTenantForeignKey: foreignKey({
      name: "cashier_shifts_station_merchant_fk",
      columns: [table.stationId, table.merchantId],
      foreignColumns: [merchantCashierStations.id, merchantCashierStations.merchantId],
    }).onDelete("restrict"),
    staffTenantForeignKey: foreignKey({
      name: "cashier_shifts_staff_merchant_fk",
      columns: [table.staffId, table.merchantId],
      foreignColumns: [merchantCashierStaff.id, merchantCashierStaff.merchantId],
    }).onDelete("restrict"),
    openStationUnique: uniqueIndex("cashier_shifts_open_station_unique")
      .on(table.merchantId, table.stationId)
      .where(sql`${table.status} = 'open'`),
    openStaffUnique: uniqueIndex("cashier_shifts_open_staff_unique")
      .on(table.merchantId, table.staffId)
      .where(sql`${table.status} = 'open'`),
    staffStartedIndex: index("cashier_shifts_staff_started_idx").on(
      table.merchantId,
      table.staffId,
      table.startedAt,
    ),
    statusCheck: check(
      "cashier_shifts_status_check",
      sql`${table.status} IN ('open', 'closed')`,
    ),
    lifecycleCheck: check(
      "cashier_shifts_lifecycle_check",
      sql`(${table.status} = 'open' AND ${table.endedAt} IS NULL AND ${table.closeReason} IS NULL) OR (${table.status} = 'closed' AND ${table.endedAt} IS NOT NULL AND ${table.endedAt} >= ${table.startedAt} AND ${table.closeReason} IS NOT NULL)`,
    ),
  }),
);

export const cashierOperatorSessions = pgTable(
  "cashier_operator_sessions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    stationId: text("station_id").notNull(),
    staffId: text("staff_id").notNull(),
    shiftId: text("shift_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    staffVersion: integer("staff_version").notNull(),
    permissionSnapshot: jsonb("permission_snapshot")
      .$type<string[]>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("active"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    shiftTenantForeignKey: foreignKey({
      name: "cashier_operator_sessions_shift_identity_fk",
      columns: [table.shiftId, table.merchantId, table.stationId, table.staffId],
      foreignColumns: [
        cashierShifts.id,
        cashierShifts.merchantId,
        cashierShifts.stationId,
        cashierShifts.staffId,
      ],
    }).onDelete("cascade"),
    tokenHashUnique: uniqueIndex("cashier_operator_sessions_token_hash_unique").on(
      table.tokenHash,
    ),
    liveStationUnique: uniqueIndex("cashier_operator_sessions_live_station_unique")
      .on(table.merchantId, table.stationId)
      .where(sql`${table.status} = 'active'`),
    staffIndex: index("cashier_operator_sessions_staff_idx").on(
      table.merchantId,
      table.staffId,
      table.status,
    ),
    statusCheck: check(
      "cashier_operator_sessions_status_check",
      sql`${table.status} IN ('active', 'revoked', 'expired')`,
    ),
    tokenHashCheck: check(
      "cashier_operator_sessions_token_hash_check",
      sql`char_length(${table.tokenHash}) = 64`,
    ),
    authorizationCheck: check(
      "cashier_operator_sessions_authorization_check",
      sql`${table.staffVersion} > 0 AND jsonb_typeof(${table.permissionSnapshot}) = 'array'`,
    ),
    timeCheck: check(
      "cashier_operator_sessions_time_check",
      sql`${table.lastSeenAt} >= ${table.issuedAt} AND ${table.expiresAt} > ${table.issuedAt}`,
    ),
    terminalStateCheck: check(
      "cashier_operator_sessions_terminal_state_check",
      sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL) OR (${table.status} = 'expired' AND ${table.revokedAt} IS NULL)`,
    ),
  }),
);

export type MerchantCashierStaff = typeof merchantCashierStaff.$inferSelect;
export type NewMerchantCashierStaff = typeof merchantCashierStaff.$inferInsert;
export type MerchantCashierStation = typeof merchantCashierStations.$inferSelect;
export type NewMerchantCashierStation = typeof merchantCashierStations.$inferInsert;
export type CashierShift = typeof cashierShifts.$inferSelect;
export type CashierOperatorSession = typeof cashierOperatorSessions.$inferSelect;
