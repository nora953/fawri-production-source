import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "./authPasswordService";
import { evaluateMerchantOperationalAccess } from "./merchantOperationalAccess";
import { resolveCashierLocationForBranch } from "./cashierLocationBindingAuthority";
import {
  isCashierStaffRole,
  normalizeCashierStaffPermissions,
  recommendedCashierStaffPermissions,
  type CashierStaffPermission,
  type CashierStaffRole,
} from "./cashierStaffPolicy";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

const PAIRING_TTL_MS = 10 * 60 * 1000;
const STATION_CREDENTIAL_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const OPERATOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PIN_FAILURE_LIMIT = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

type DbInstant = Date | string;

type StaffRow = {
  id: string;
  merchant_id: string;
  display_name: string;
  role: string;
  status: string;
  pin_hash: string;
  pin_version: number;
  failed_pin_attempts: number;
  pin_locked_until: DbInstant | null;
  version: number;
  revoked_at: DbInstant | null;
  created_at: DbInstant;
  updated_at: DbInstant;
};

type PermissionRow = { staff_id: string; permission: string };

type StationRow = {
  id: string;
  merchant_id: string;
  name: string;
  location_id: string;
  branch_key: string;
  branch_label: string | null;
  status: string;
  paired_device_id: string | null;
  offline_inventory_authority: boolean;
  credential_version: number;
  paired_at: DbInstant | null;
  last_seen_at: DbInstant | null;
  revoked_at: DbInstant | null;
  created_at: DbInstant;
  updated_at: DbInstant;
};

type PairingRow = {
  id: string;
  merchant_id: string;
  station_id: string;
  status: string;
  expires_at: DbInstant;
};

type StationCredentialRow = {
  credential_id: string;
  merchant_id: string;
  station_id: string;
  station_name: string;
  location_id: string;
  branch_key: string;
  branch_label: string | null;
  offline_inventory_authority: boolean;
  credential_version: number;
  expires_at: DbInstant;
};

type OperatorAuthRow = {
  session_id: string;
  merchant_id: string;
  station_id: string;
  staff_id: string;
  shift_id: string;
  role: string;
  permission_snapshot: unknown;
  session_expires_at: DbInstant;
};

type MerchantOperationalRow = {
  id: string;
  phone_verified: boolean;
  merchant_status: string;
  account_status: string;
};

export type CashierStaffView = {
  id: string;
  display_name: string;
  role: CashierStaffRole;
  status: "active" | "disabled" | "revoked";
  permissions: CashierStaffPermission[];
  version: number;
  pin_version: number;
  locked_until?: string;
  created_at: string;
  updated_at: string;
};

export type CashierStationView = {
  id: string;
  name: string;
  location_id: string;
  branch_key: string;
  branch_label?: string;
  status: "active" | "disabled" | "revoked";
  paired: boolean;
  paired_device_id?: string;
  offline_inventory_authority: boolean;
  credential_version: number;
  paired_at?: string;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
};

export type CashierStationContext = {
  credential_id: string;
  merchant_id: string;
  station_id: string;
  station_name: string;
  location_id: string;
  branch_key: string;
  branch_label?: string;
  offline_inventory_authority: boolean;
  credential_version: number;
  credential_expires_at: string;
  device_id: string;
};

export type CashierOperatorContext = CashierStationContext & {
  operator_session_id: string;
  staff_id: string;
  shift_id: string;
  role: CashierStaffRole;
  permissions: CashierStaffPermission[];
  operator_expires_at: string;
};

export class CashierStaffAuthorityError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CashierStaffAuthorityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function assertMerchantOperationalAccessForCashier(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<void> {
  const rows = await operationalQueryRows<MerchantOperationalRow>(
    target,
    `SELECT a.id,
            a.phone_verified,
            m.status::text AS merchant_status,
            m.account_status::text AS account_status
       FROM accounts AS a
       JOIN merchants AS m ON m.id = a.id AND m.account_id = a.id
      WHERE a.id = $1 AND a.kind = 'merchant'
      LIMIT 1${lock ? " FOR UPDATE OF a, m" : ""}`,
    [merchantId],
  );
  const row = rows[0];
  const decision = evaluateMerchantOperationalAccess(
    row
      ? {
          id: row.id,
          is_admin: false,
          otp_verified: row.phone_verified,
          status: row.merchant_status,
          account_status: row.account_status,
        }
      : undefined,
  );
  if (!decision.allowed) {
    throw new CashierStaffAuthorityError(
      decision.code,
      decision.error,
      decision.statusCode,
    );
  }
}

export function getCashierPinValidationError(pinValue: unknown): {
  code: string;
  message: string;
} | null {
  const pin = String(pinValue ?? "").trim();
  if (!pin) return { code: "CASHIER_PIN_REQUIRED", message: "cashier PIN is required" };
  if (!/^\d{4,8}$/.test(pin)) {
    return {
      code: "CASHIER_PIN_INVALID",
      message: "cashier PIN must contain 4 to 8 digits",
    };
  }
  return null;
}

function assertPostgresAuthority(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_POSTGRES_REQUIRED",
      "cashier staff authority requires PostgreSQL operational authority",
      503,
    );
  }
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function optionalLabel(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return identifier(value, field, maxLength);
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return parsed;
}

function cashierRole(value: unknown): CashierStaffRole {
  if (!isCashierStaffRole(value)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_ROLE_INVALID",
      "cashier staff role is invalid",
      400,
    );
  }
  return value;
}

function cashierPermissions(value: unknown): CashierStaffPermission[] {
  if (!Array.isArray(value)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_PERMISSIONS_INVALID",
      "cashier staff permissions must be an array",
      400,
    );
  }
  try {
    return normalizeCashierStaffPermissions(value);
  } catch {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_PERMISSION_INVALID",
      "cashier staff permission is invalid",
      400,
    );
  }
}

function staffStatus(value: unknown): "active" | "disabled" | "revoked" {
  const status = String(value ?? "").trim();
  if (!(["active", "disabled", "revoked"] as const).includes(status as never)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_STATUS_INVALID",
      "cashier staff status is invalid",
      400,
    );
  }
  return status as "active" | "disabled" | "revoked";
}

function stationStatus(value: unknown): "active" | "disabled" | "revoked" {
  const status = String(value ?? "").trim();
  if (!(["active", "disabled", "revoked"] as const).includes(status as never)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STATION_STATUS_INVALID",
      "cashier station status is invalid",
      400,
    );
  }
  return status as "active" | "disabled" | "revoked";
}

function cashierPin(value: unknown): string {
  const error = getCashierPinValidationError(value);
  if (error) {
    throw new CashierStaffAuthorityError(error.code, error.message, 400);
  }
  return String(value).trim();
}

function secret(prefix: string, bytes: number): string {
  const value = `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("cashier secret generator produced non-ASCII characters");
  }
  return value;
}

function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toIso(value: DbInstant): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_STATE_INVALID",
      "cashier authority contains an invalid timestamp",
      500,
    );
  }
  return date.toISOString();
}

function nullableIso(value: DbInstant | null): string | undefined {
  return value ? toIso(value) : undefined;
}

function toMillis(value: DbInstant): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function safeRole(value: string): CashierStaffRole {
  if (!isCashierStaffRole(value)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_STATE_INVALID",
      "cashier staff role is corrupt",
      500,
    );
  }
  return value;
}

function safeStaffStatus(value: string): CashierStaffView["status"] {
  if (!(["active", "disabled", "revoked"] as const).includes(value as never)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_STATE_INVALID",
      "cashier staff status is corrupt",
      500,
    );
  }
  return value as CashierStaffView["status"];
}

function safeStationStatus(value: string): CashierStationView["status"] {
  if (!(["active", "disabled", "revoked"] as const).includes(value as never)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_STATE_INVALID",
      "cashier station status is corrupt",
      500,
    );
  }
  return value as CashierStationView["status"];
}

function normalizePermissionSnapshot(value: unknown): CashierStaffPermission[] {
  if (!Array.isArray(value)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SESSION_INVALID",
      "cashier operator authorization snapshot is invalid",
      401,
    );
  }
  try {
    return normalizeCashierStaffPermissions(value);
  } catch {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SESSION_INVALID",
      "cashier operator authorization snapshot is invalid",
      401,
    );
  }
}

async function loadPermissions(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId?: string,
): Promise<Map<string, CashierStaffPermission[]>> {
  const rows = await operationalQueryRows<PermissionRow>(
    target,
    `SELECT staff_id, permission
       FROM merchant_cashier_staff_permissions
      WHERE merchant_id = $1
        AND ($2::text IS NULL OR staff_id = $2)
      ORDER BY staff_id, permission`,
    [merchantId, staffId || null],
  );
  const grouped = new Map<string, CashierStaffPermission[]>();
  for (const row of rows) {
    const permission = cashierPermissions([row.permission])[0];
    const current = grouped.get(row.staff_id) || [];
    current.push(permission);
    grouped.set(row.staff_id, normalizeCashierStaffPermissions(current));
  }
  return grouped;
}

function staffView(row: StaffRow, permissions: CashierStaffPermission[]): CashierStaffView {
  return {
    id: row.id,
    display_name: row.display_name,
    role: safeRole(row.role),
    status: safeStaffStatus(row.status),
    permissions,
    version: Number(row.version),
    pin_version: Number(row.pin_version),
    ...(nullableIso(row.pin_locked_until) ? { locked_until: nullableIso(row.pin_locked_until) } : {}),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function stationView(row: StationRow): CashierStationView {
  return {
    id: row.id,
    name: row.name,
    location_id: row.location_id,
    branch_key: row.branch_key,
    ...(row.branch_label ? { branch_label: row.branch_label } : {}),
    status: safeStationStatus(row.status),
    paired: Boolean(row.paired_device_id),
    ...(row.paired_device_id ? { paired_device_id: row.paired_device_id } : {}),
    offline_inventory_authority: Boolean(row.offline_inventory_authority),
    credential_version: Number(row.credential_version),
    ...(nullableIso(row.paired_at) ? { paired_at: nullableIso(row.paired_at) } : {}),
    ...(nullableIso(row.last_seen_at) ? { last_seen_at: nullableIso(row.last_seen_at) } : {}),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

async function getStaffRow(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId: string,
  forUpdate = false,
): Promise<StaffRow | null> {
  const rows = await operationalQueryRows<StaffRow>(
    target,
    `SELECT id, merchant_id, display_name, role, status, pin_hash, pin_version,
            failed_pin_attempts, pin_locked_until, version, revoked_at,
            created_at, updated_at
       FROM merchant_cashier_staff
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [merchantId, staffId],
  );
  return rows[0] || null;
}

async function getStationRow(
  target: OperationalQueryTarget,
  merchantId: string,
  stationId: string,
  forUpdate = false,
): Promise<StationRow | null> {
  const rows = await operationalQueryRows<StationRow>(
    target,
    `SELECT id, merchant_id, name, location_id, branch_key, branch_label, status,
            paired_device_id, offline_inventory_authority, credential_version,
            paired_at, last_seen_at, revoked_at, created_at, updated_at
       FROM merchant_cashier_stations
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [merchantId, stationId],
  );
  return rows[0] || null;
}

async function revokeOperatorSessionsForStaff(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId: string,
): Promise<void> {
  await target.query(
    `UPDATE cashier_operator_sessions
        SET status = 'revoked', revoked_at = now()
      WHERE merchant_id = $1 AND staff_id = $2 AND status = 'active'`,
    [merchantId, staffId],
  );
}

async function closeOpenShiftsForStaff(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId: string,
  reason: string,
): Promise<void> {
  await target.query(
    `UPDATE cashier_shifts
        SET status = 'closed', ended_at = now(), close_reason = $3
      WHERE merchant_id = $1 AND staff_id = $2 AND status = 'open'`,
    [merchantId, staffId, reason],
  );
}

async function revokeStationRuntime(
  target: OperationalQueryTarget,
  merchantId: string,
  stationId: string,
  reason: string,
): Promise<void> {
  await target.query(
    `UPDATE cashier_station_credentials
        SET status = 'revoked', revoked_at = now()
      WHERE merchant_id = $1 AND station_id = $2 AND status = 'active'`,
    [merchantId, stationId],
  );
  await target.query(
    `UPDATE cashier_operator_sessions
        SET status = 'revoked', revoked_at = now()
      WHERE merchant_id = $1 AND station_id = $2 AND status = 'active'`,
    [merchantId, stationId],
  );
  await target.query(
    `UPDATE cashier_shifts
        SET status = 'closed', ended_at = now(), close_reason = $3
      WHERE merchant_id = $1 AND station_id = $2 AND status = 'open'`,
    [merchantId, stationId, reason],
  );
}

function translateDatabaseError(error: unknown): never {
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (String(candidate?.code || "") === "23505") {
    const constraint = String(candidate.constraint || "");
    if (constraint.includes("merchant_cashier_stations_offline_location_unique")) {
      throw new CashierStaffAuthorityError(
        "CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS",
        "another active cashier station already owns offline inventory authority for this branch",
        409,
      );
    }
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_CONFLICT",
      "cashier staff operation conflicts with existing state",
      409,
    );
  }
  throw error;
}

export async function listCashierStaffAuthoritative(
  merchantIdValue: unknown,
): Promise<CashierStaffView[]> {
  assertPostgresAuthority();
  const merchantId = identifier(merchantIdValue, "merchant_id");
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const rows = await operationalQueryRows<StaffRow>(
      client,
      `SELECT id, merchant_id, display_name, role, status, pin_hash, pin_version,
              failed_pin_attempts, pin_locked_until, version, revoked_at,
              created_at, updated_at
         FROM merchant_cashier_staff
        WHERE merchant_id = $1
        ORDER BY created_at, id`,
      [merchantId],
    );
    const permissions = await loadPermissions(client, merchantId);
    return rows.map((row) => staffView(row, permissions.get(row.id) || []));
  });
}

export async function createCashierStaffAuthoritative(input: {
  merchantId: unknown;
  displayName: unknown;
  role?: unknown;
  pin: unknown;
  permissions?: unknown;
}): Promise<CashierStaffView> {
  assertPostgresAuthority();
  const merchantId = identifier(input.merchantId, "merchant_id");
  const displayName = identifier(input.displayName, "display_name", 120);
  const role = input.role === undefined ? "cashier" : cashierRole(input.role);
  const pin = cashierPin(input.pin);
  const permissions =
    input.permissions === undefined
      ? recommendedCashierStaffPermissions(role)
      : cashierPermissions(input.permissions);
  const staffId = randomId("cashier_staff");
  const pinHash = hashPassword(pin);

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertMerchantOperationalAccessForCashier(client, merchantId, true);
    await client.query(
      `INSERT INTO merchant_cashier_staff (
         id, merchant_id, display_name, role, status, pin_hash,
         pin_version, failed_pin_attempts, pin_changed_at, version,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,'active',$5,1,0,now(),1,now(),now())`,
      [staffId, merchantId, displayName, role, pinHash],
    );
    for (const permission of permissions) {
      await client.query(
        `INSERT INTO merchant_cashier_staff_permissions
           (merchant_id, staff_id, permission, granted_at)
         VALUES ($1,$2,$3,now())`,
        [merchantId, staffId, permission],
      );
    }
    const row = await getStaffRow(client, merchantId, staffId);
    if (!row) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STAFF_CREATE_FAILED",
        "cashier staff record could not be read after creation",
        500,
      );
    }
    return staffView(row, permissions);
  }).catch(translateDatabaseError);
}

export async function updateCashierStaffAuthoritative(input: {
  merchantId: unknown;
  staffId: unknown;
  expectedVersion: unknown;
  displayName?: unknown;
  role?: unknown;
  status?: unknown;
  pin?: unknown;
  permissions?: unknown;
}): Promise<CashierStaffView> {
  assertPostgresAuthority();
  const merchantId = identifier(input.merchantId, "merchant_id");
  const staffId = identifier(input.staffId, "staff_id");
  const expectedVersion = positiveInteger(input.expectedVersion, "expected_version");
  const displayName =
    input.displayName === undefined
      ? undefined
      : identifier(input.displayName, "display_name", 120);
  const role = input.role === undefined ? undefined : cashierRole(input.role);
  const status = input.status === undefined ? undefined : staffStatus(input.status);
  const pin = input.pin === undefined ? undefined : cashierPin(input.pin);
  const permissions =
    input.permissions === undefined ? undefined : cashierPermissions(input.permissions);
  if (
    displayName === undefined &&
    role === undefined &&
    status === undefined &&
    pin === undefined &&
    permissions === undefined
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_PATCH_REQUIRED",
      "cashier staff update is empty",
      400,
    );
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertMerchantOperationalAccessForCashier(client, merchantId, true);
    const current = await getStaffRow(client, merchantId, staffId, true);
    if (!current) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STAFF_NOT_FOUND",
        "cashier staff member was not found",
        404,
      );
    }
    if (current.status === "revoked") {
      throw new CashierStaffAuthorityError(
        "CASHIER_STAFF_REVOKED",
        "revoked cashier staff cannot be restored",
        409,
      );
    }
    if (Number(current.version) !== expectedVersion) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STAFF_VERSION_CONFLICT",
        "cashier staff changed before this update",
        409,
        { current_version: Number(current.version) },
      );
    }

    const values: unknown[] = [merchantId, staffId, expectedVersion];
    const sets = ["version = version + 1", "updated_at = now()"];
    const add = (fragment: string, value: unknown) => {
      values.push(value);
      sets.push(`${fragment} = $${values.length}`);
    };
    if (displayName !== undefined) add("display_name", displayName);
    if (role !== undefined) add("role", role);
    if (status !== undefined) {
      add("status", status);
      sets.push(status === "revoked" ? "revoked_at = now()" : "revoked_at = NULL");
    }
    if (pin !== undefined) {
      add("pin_hash", hashPassword(pin));
      sets.push(
        "pin_version = pin_version + 1",
        "pin_changed_at = now()",
        "failed_pin_attempts = 0",
        "pin_locked_until = NULL",
      );
    }

    const updated = await operationalQueryRows<StaffRow>(
      client,
      `UPDATE merchant_cashier_staff
          SET ${sets.join(", ")}
        WHERE merchant_id = $1 AND id = $2 AND version = $3
        RETURNING id, merchant_id, display_name, role, status, pin_hash,
                  pin_version, failed_pin_attempts, pin_locked_until, version,
                  revoked_at, created_at, updated_at`,
      values,
    );
    if (updated.length !== 1) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STAFF_VERSION_CONFLICT",
        "cashier staff changed before this update",
        409,
      );
    }

    if (permissions !== undefined) {
      await client.query(
        `DELETE FROM merchant_cashier_staff_permissions
          WHERE merchant_id = $1 AND staff_id = $2`,
        [merchantId, staffId],
      );
      for (const permission of permissions) {
        await client.query(
          `INSERT INTO merchant_cashier_staff_permissions
             (merchant_id, staff_id, permission, granted_at)
           VALUES ($1,$2,$3,now())`,
          [merchantId, staffId, permission],
        );
      }
    }

    await revokeOperatorSessionsForStaff(client, merchantId, staffId);
    if (status === "disabled" || status === "revoked") {
      await closeOpenShiftsForStaff(
        client,
        merchantId,
        staffId,
        status === "revoked" ? "staff_revoked" : "staff_disabled",
      );
    }

    const permissionMap = await loadPermissions(client, merchantId, staffId);
    return staffView(updated[0], permissionMap.get(staffId) || []);
  }).catch(translateDatabaseError);
}

export async function listCashierStationsAuthoritative(
  merchantIdValue: unknown,
): Promise<CashierStationView[]> {
  assertPostgresAuthority();
  const merchantId = identifier(merchantIdValue, "merchant_id");
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const rows = await operationalQueryRows<StationRow>(
      client,
      `SELECT id, merchant_id, name, location_id, branch_key, branch_label, status,
              paired_device_id, offline_inventory_authority, credential_version,
              paired_at, last_seen_at, revoked_at, created_at, updated_at
         FROM merchant_cashier_stations
        WHERE merchant_id = $1
        ORDER BY created_at, id`,
      [merchantId],
    );
    return rows.map(stationView);
  });
}

export async function createCashierStationAuthoritative(input: {
  merchantId: unknown;
  name: unknown;
  branchKey?: unknown;
  branchLabel?: unknown;
  offlineInventoryAuthority?: unknown;
}): Promise<CashierStationView> {
  assertPostgresAuthority();
  const merchantId = identifier(input.merchantId, "merchant_id");
  const name = identifier(input.name, "name", 120);
  const branchKey =
    input.branchKey === undefined
      ? "main"
      : identifier(input.branchKey, "branch_key", 120);
  const branchLabel = optionalLabel(input.branchLabel, "branch_label", 120);
  const offlineInventoryAuthority = Boolean(input.offlineInventoryAuthority);
  const stationId = randomId("cashier_station");

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertMerchantOperationalAccessForCashier(client, merchantId, true);
    await client.query(
      `INSERT INTO merchant_cashier_stations (
         id, merchant_id, name, location_id, branch_key, branch_label, status,
         offline_inventory_authority, credential_version, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7,1,now(),now())`,
      [
        stationId,
        merchantId,
        name,
        (
          await resolveCashierLocationForBranch(client, {
            merchantId,
            branchKey,
            branchLabel,
          })
        ).id,
        branchKey,
        branchLabel,
        offlineInventoryAuthority,
      ],
    );
    const row = await getStationRow(client, merchantId, stationId);
    if (!row) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_CREATE_FAILED",
        "cashier station could not be read after creation",
        500,
      );
    }
    return stationView(row);
  }).catch(translateDatabaseError);
}

export async function updateCashierStationAuthoritative(input: {
  merchantId: unknown;
  stationId: unknown;
  name?: unknown;
  branchKey?: unknown;
  branchLabel?: unknown;
  status?: unknown;
  offlineInventoryAuthority?: unknown;
}): Promise<CashierStationView> {
  assertPostgresAuthority();
  const merchantId = identifier(input.merchantId, "merchant_id");
  const stationId = identifier(input.stationId, "station_id");
  const name =
    input.name === undefined ? undefined : identifier(input.name, "name", 120);
  const branchKey =
    input.branchKey === undefined
      ? undefined
      : identifier(input.branchKey, "branch_key", 120);
  const branchLabel =
    input.branchLabel === undefined
      ? undefined
      : optionalLabel(input.branchLabel, "branch_label", 120);
  const status = input.status === undefined ? undefined : stationStatus(input.status);
  const offlineInventoryAuthority =
    input.offlineInventoryAuthority === undefined
      ? undefined
      : Boolean(input.offlineInventoryAuthority);
  if (
    name === undefined &&
    branchKey === undefined &&
    branchLabel === undefined &&
    status === undefined &&
    offlineInventoryAuthority === undefined
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STATION_PATCH_REQUIRED",
      "cashier station update is empty",
      400,
    );
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertMerchantOperationalAccessForCashier(client, merchantId, true);
    const current = await getStationRow(client, merchantId, stationId, true);
    if (!current) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_NOT_FOUND",
        "cashier station was not found",
        404,
      );
    }
    if (current.status === "revoked") {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_REVOKED",
        "revoked cashier stations cannot be restored",
        409,
      );
    }

    const targetLocation =
      branchKey === undefined
        ? null
        : await resolveCashierLocationForBranch(client, {
            merchantId,
            branchKey,
            branchLabel:
              branchLabel === undefined ? current.branch_label : branchLabel,
          });

    const values: unknown[] = [merchantId, stationId];
    const sets = ["updated_at = now()"];
    const add = (fragment: string, value: unknown) => {
      values.push(value);
      sets.push(`${fragment} = $${values.length}`);
    };
    if (name !== undefined) add("name", name);
    if (branchKey !== undefined && targetLocation) {
      add("branch_key", branchKey);
      add("location_id", targetLocation.id);
    }
    if (branchLabel !== undefined) add("branch_label", branchLabel);
    if (offlineInventoryAuthority !== undefined) {
      add("offline_inventory_authority", offlineInventoryAuthority);
    }
    if (status !== undefined) {
      add("status", status);
      sets.push(status === "revoked" ? "revoked_at = now()" : "revoked_at = NULL");
      if (status !== "active") {
        sets.push(
          "offline_inventory_authority = FALSE",
          "paired_device_id = NULL",
          "paired_at = NULL",
          "credential_version = credential_version + 1",
        );
      }
    }

    const rows = await operationalQueryRows<StationRow>(
      client,
      `UPDATE merchant_cashier_stations
          SET ${sets.join(", ")}
        WHERE merchant_id = $1 AND id = $2
        RETURNING id, merchant_id, name, location_id, branch_key, branch_label, status,
                  paired_device_id, offline_inventory_authority, credential_version,
                  paired_at, last_seen_at, revoked_at, created_at, updated_at`,
      values,
    );
    if (rows.length !== 1) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_NOT_FOUND",
        "cashier station was not found",
        404,
      );
    }
    if (status === "disabled" || status === "revoked") {
      await revokeStationRuntime(
        client,
        merchantId,
        stationId,
        status === "revoked" ? "station_revoked" : "station_disabled",
      );
    }
    return stationView(rows[0]);
  }).catch(translateDatabaseError);
}

export async function beginCashierStationPairingAuthoritative(input: {
  merchantId: unknown;
  stationId: unknown;
}): Promise<{
  station_id: string;
  pairing_code: string;
  expires_at: string;
}> {
  assertPostgresAuthority();
  const merchantId = identifier(input.merchantId, "merchant_id");
  const stationId = identifier(input.stationId, "station_id");
  const pairingCode = secret("pair", 24);
  const codeHash = hashSecret(pairingCode);
  const challengeId = randomId("cashier_pairing");
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertMerchantOperationalAccessForCashier(client, merchantId, true);
    const station = await getStationRow(client, merchantId, stationId, true);
    if (!station) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_NOT_FOUND",
        "cashier station was not found",
        404,
      );
    }
    if (station.status !== "active") {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_INACTIVE",
        "cashier station must be active before pairing",
        409,
      );
    }
    await client.query(
      `UPDATE cashier_station_pairing_challenges
          SET status = 'revoked', revoked_at = now()
        WHERE merchant_id = $1 AND station_id = $2 AND status = 'active'`,
      [merchantId, stationId],
    );
    await client.query(
      `INSERT INTO cashier_station_pairing_challenges (
         id, merchant_id, station_id, code_hash, status, created_at, expires_at
       ) VALUES ($1,$2,$3,$4,'active',now(),$5)`,
      [challengeId, merchantId, stationId, codeHash, expiresAt],
    );
    return {
      station_id: stationId,
      pairing_code: pairingCode,
      expires_at: expiresAt.toISOString(),
    };
  }).catch(translateDatabaseError);
}

export async function redeemCashierStationPairingAuthoritative(input: {
  pairingCode: unknown;
  deviceId: unknown;
}): Promise<{
  merchant_id: string;
  station_id: string;
  station_name: string;
  location_id: string;
  branch_key: string;
  branch_label?: string;
  offline_inventory_authority: boolean;
  station_token: string;
  credential_expires_at: string;
}> {
  assertPostgresAuthority();
  const pairingCode = identifier(input.pairingCode, "pairing_code", 128);
  const deviceId = identifier(input.deviceId, "device_id", 200);
  const codeHash = hashSecret(pairingCode);
  const stationToken = secret("cst", 32);
  const tokenHash = hashSecret(stationToken);
  const credentialId = randomId("cashier_credential");
  const expiresAt = new Date(Date.now() + STATION_CREDENTIAL_TTL_MS);

  return withOperationalTransaction(async (client) => {
    const challenges = await operationalQueryRows<PairingRow>(
      client,
      `SELECT id, merchant_id, station_id, status, expires_at
         FROM cashier_station_pairing_challenges
        WHERE code_hash = $1
        LIMIT 1
        FOR UPDATE`,
      [codeHash],
    );
    const challenge = challenges[0];
    if (!challenge || challenge.status !== "active") {
      throw new CashierStaffAuthorityError(
        "CASHIER_PAIRING_INVALID",
        "cashier pairing code is invalid or already used",
        401,
      );
    }
    if (toMillis(challenge.expires_at) <= Date.now()) {
      throw new CashierStaffAuthorityError(
        "CASHIER_PAIRING_EXPIRED",
        "cashier pairing code has expired",
        410,
      );
    }
    const merchantId = identifier(challenge.merchant_id, "merchant_id");
    await client.query("SELECT set_config('fawri.tenant_id', $1, true)", [merchantId]);
    await assertMerchantOperationalAccessForCashier(client, merchantId, true);
    const station = await getStationRow(
      client,
      merchantId,
      challenge.station_id,
      true,
    );
    if (!station || station.status !== "active") {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_INACTIVE",
        "cashier station is not active",
        409,
      );
    }

    await revokeStationRuntime(
      client,
      merchantId,
      station.id,
      "station_repaired",
    );
    const nextCredentialVersion = Number(station.credential_version) + 1;
    await client.query(
      `UPDATE merchant_cashier_stations
          SET paired_device_id = $3,
              paired_at = now(),
              last_seen_at = now(),
              credential_version = $4,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, station.id, deviceId, nextCredentialVersion],
    );
    await client.query(
      `UPDATE cashier_station_pairing_challenges
          SET status = 'used', used_at = now(), used_by_device_id = $2
        WHERE id = $1 AND status = 'active'`,
      [challenge.id, deviceId],
    );
    await client.query(
      `INSERT INTO cashier_station_credentials (
         id, merchant_id, station_id, device_id, token_hash, version,
         status, issued_at, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'active',now(),$7)`,
      [
        credentialId,
        merchantId,
        station.id,
        deviceId,
        tokenHash,
        nextCredentialVersion,
        expiresAt,
      ],
    );

    return {
      merchant_id: merchantId,
      station_id: station.id,
      station_name: station.name,
      location_id: station.location_id,
      branch_key: station.branch_key,
      ...(station.branch_label ? { branch_label: station.branch_label } : {}),
      offline_inventory_authority: Boolean(station.offline_inventory_authority),
      station_token: stationToken,
      credential_expires_at: expiresAt.toISOString(),
    };
  }).catch(translateDatabaseError);
}

export async function authenticateCashierStationAuthoritative(input: {
  stationToken: unknown;
  deviceId: unknown;
}): Promise<CashierStationContext> {
  assertPostgresAuthority();
  const stationToken = identifier(input.stationToken, "station_token", 200);
  const deviceId = identifier(input.deviceId, "device_id", 200);
  const tokenHash = hashSecret(stationToken);
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<StationCredentialRow>(
    pool,
    `SELECT c.id AS credential_id, c.merchant_id, c.station_id,
            s.name AS station_name, s.location_id, s.branch_key, s.branch_label,
            s.offline_inventory_authority, c.version AS credential_version,
            c.expires_at
       FROM cashier_station_credentials c
       JOIN merchant_cashier_stations s
         ON s.id = c.station_id AND s.merchant_id = c.merchant_id
      WHERE c.token_hash = $1
        AND c.device_id = $2
        AND c.status = 'active'
        AND c.expires_at > now()
        AND s.status = 'active'
        AND s.paired_device_id = $2
        AND s.credential_version = c.version
      LIMIT 1`,
    [tokenHash, deviceId],
  );
  const row = rows[0];
  if (!row) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STATION_CREDENTIAL_INVALID",
      "cashier station credential is invalid or expired",
      401,
    );
  }
  await assertMerchantOperationalAccessForCashier(pool, row.merchant_id);
  await pool.query(
    `UPDATE cashier_station_credentials
        SET last_used_at = now()
      WHERE id = $1 AND status = 'active'`,
    [row.credential_id],
  );
  await pool.query(
    `UPDATE merchant_cashier_stations
        SET last_seen_at = now(), updated_at = now()
      WHERE merchant_id = $1 AND id = $2 AND status = 'active'`,
    [row.merchant_id, row.station_id],
  );
  return {
    credential_id: row.credential_id,
    merchant_id: row.merchant_id,
    station_id: row.station_id,
    station_name: row.station_name,
    location_id: row.location_id,
    branch_key: row.branch_key,
    ...(row.branch_label ? { branch_label: row.branch_label } : {}),
    offline_inventory_authority: Boolean(row.offline_inventory_authority),
    credential_version: Number(row.credential_version),
    credential_expires_at: toIso(row.expires_at),
    device_id: deviceId,
  };
}

type PinDecision =
  | { ok: true; staff: StaffRow }
  | { ok: false; error: CashierStaffAuthorityError };

async function verifyOperatorPinInTransaction(
  client: OperationalQueryTarget,
  station: CashierStationContext,
  staffId: string,
  pin: string,
): Promise<PinDecision> {
  await assertMerchantOperationalAccessForCashier(
    client,
    station.merchant_id,
    true,
  );
  const credentialRows = await operationalQueryRows<{ id: string }>(
    client,
    `SELECT c.id
       FROM cashier_station_credentials c
       JOIN merchant_cashier_stations s
         ON s.id = c.station_id AND s.merchant_id = c.merchant_id
      WHERE c.id = $1
        AND c.merchant_id = $2
        AND c.station_id = $3
        AND c.device_id = $4
        AND c.status = 'active'
        AND c.expires_at > now()
        AND c.version = $5
        AND s.status = 'active'
        AND s.paired_device_id = $4
        AND s.credential_version = c.version
      LIMIT 1
      FOR UPDATE`,
    [
      station.credential_id,
      station.merchant_id,
      station.station_id,
      station.device_id,
      station.credential_version,
    ],
  );
  if (!credentialRows[0]) {
    return {
      ok: false,
      error: new CashierStaffAuthorityError(
        "CASHIER_STATION_CREDENTIAL_INVALID",
        "cashier station credential is invalid or expired",
        401,
      ),
    };
  }

  const staff = await getStaffRow(
    client,
    station.merchant_id,
    staffId,
    true,
  );
  if (!staff || staff.status !== "active") {
    return {
      ok: false,
      error: new CashierStaffAuthorityError(
        "CASHIER_OPERATOR_INVALID",
        "cashier operator credentials are invalid",
        401,
      ),
    };
  }
  const lockedUntil = staff.pin_locked_until ? toMillis(staff.pin_locked_until) : 0;
  if (lockedUntil > Date.now()) {
    return {
      ok: false,
      error: new CashierStaffAuthorityError(
        "CASHIER_PIN_LOCKED",
        "cashier PIN is temporarily locked",
        429,
        { retry_after_seconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)) },
      ),
    };
  }
  if (!verifyPassword(pin, staff.pin_hash)) {
    const failed = Number(staff.failed_pin_attempts) + 1;
    const locksNow = failed >= PIN_FAILURE_LIMIT;
    const lockUntil = locksNow ? new Date(Date.now() + PIN_LOCK_MS) : null;
    await client.query(
      `UPDATE merchant_cashier_staff
          SET failed_pin_attempts = $3,
              pin_locked_until = $4,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [station.merchant_id, staffId, locksNow ? 0 : failed, lockUntil],
    );
    return {
      ok: false,
      error: new CashierStaffAuthorityError(
        locksNow ? "CASHIER_PIN_LOCKED" : "CASHIER_OPERATOR_INVALID",
        locksNow
          ? "cashier PIN is temporarily locked"
          : "cashier operator credentials are invalid",
        locksNow ? 429 : 401,
        locksNow ? { retry_after_seconds: Math.ceil(PIN_LOCK_MS / 1000) } : undefined,
      ),
    };
  }
  await client.query(
    `UPDATE merchant_cashier_staff
        SET failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [station.merchant_id, staffId],
  );
  return { ok: true, staff };
}

export async function loginCashierOperatorAuthoritative(input: {
  station: CashierStationContext;
  staffId: unknown;
  pin: unknown;
}): Promise<{
  operator_token: string;
  context: CashierOperatorContext;
}> {
  assertPostgresAuthority();
  const staffId = identifier(input.staffId, "staff_id");
  const pin = cashierPin(input.pin);
  const operatorToken = secret("cop", 32);
  const tokenHash = hashSecret(operatorToken);
  const sessionId = randomId("cashier_operator_session");
  const station = input.station;

  const decision = await withMerchantOperationalTransaction(
    station.merchant_id,
    async (client) => {
      const pinDecision = await verifyOperatorPinInTransaction(
        client,
        station,
        staffId,
        pin,
      );
      if (!pinDecision.ok) return pinDecision;
      const staff = pinDecision.staff;
      const permissionMap = await loadPermissions(client, station.merchant_id, staffId);
      const permissions = permissionMap.get(staffId) || [];

      await client.query(
        `UPDATE cashier_operator_sessions
            SET status = 'expired'
          WHERE merchant_id = $1 AND station_id = $2
            AND status = 'active' AND expires_at <= now()`,
        [station.merchant_id, station.station_id],
      );

      const activeSessions = await operationalQueryRows<{
        id: string;
        staff_id: string;
      }>(
        client,
        `SELECT id, staff_id
           FROM cashier_operator_sessions
          WHERE merchant_id = $1 AND station_id = $2
            AND status = 'active' AND expires_at > now()
          LIMIT 1
          FOR UPDATE`,
        [station.merchant_id, station.station_id],
      );
      if (activeSessions[0] && activeSessions[0].staff_id !== staffId) {
        throw new CashierStaffAuthorityError(
          "CASHIER_STATION_IN_USE",
          "cashier station already has an active operator",
          409,
        );
      }

      const stationShifts = await operationalQueryRows<{
        id: string;
        staff_id: string;
      }>(
        client,
        `SELECT id, staff_id
           FROM cashier_shifts
          WHERE merchant_id = $1 AND station_id = $2 AND status = 'open'
          LIMIT 1
          FOR UPDATE`,
        [station.merchant_id, station.station_id],
      );
      if (stationShifts[0] && stationShifts[0].staff_id !== staffId) {
        throw new CashierStaffAuthorityError(
          "CASHIER_STATION_SHIFT_OCCUPIED",
          "cashier station has an open shift for another operator",
          409,
        );
      }
      const staffShifts = await operationalQueryRows<{
        id: string;
        station_id: string;
      }>(
        client,
        `SELECT id, station_id
           FROM cashier_shifts
          WHERE merchant_id = $1 AND staff_id = $2 AND status = 'open'
          LIMIT 1
          FOR UPDATE`,
        [station.merchant_id, staffId],
      );
      if (staffShifts[0] && staffShifts[0].station_id !== station.station_id) {
        throw new CashierStaffAuthorityError(
          "CASHIER_OPERATOR_SHIFT_OCCUPIED",
          "cashier operator already has an open shift on another station",
          409,
        );
      }

      const shiftId =
        stationShifts[0]?.id || staffShifts[0]?.id || randomId("cashier_shift");
      if (!stationShifts[0] && !staffShifts[0]) {
        await client.query(
          `INSERT INTO cashier_shifts (
             id, merchant_id, station_id, staff_id, status, started_at
           ) VALUES ($1,$2,$3,$4,'open',now())`,
          [shiftId, station.merchant_id, station.station_id, staffId],
        );
      }
      if (activeSessions[0]) {
        await client.query(
          `UPDATE cashier_operator_sessions
              SET status = 'revoked', revoked_at = now()
            WHERE id = $1 AND status = 'active'`,
          [activeSessions[0].id],
        );
      }

      const expiresAt = new Date(Date.now() + OPERATOR_SESSION_TTL_MS);
      await client.query(
        `INSERT INTO cashier_operator_sessions (
           id, merchant_id, station_id, staff_id, shift_id, token_hash,
           staff_version, permission_snapshot, status, issued_at,
           last_seen_at, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'active',now(),now(),$9)`,
        [
          sessionId,
          station.merchant_id,
          station.station_id,
          staffId,
          shiftId,
          tokenHash,
          Number(staff.version),
          JSON.stringify(permissions),
          expiresAt,
        ],
      );
      return {
        ok: true as const,
        operator_token: operatorToken,
        context: {
          ...station,
          operator_session_id: sessionId,
          staff_id: staffId,
          shift_id: shiftId,
          role: safeRole(staff.role),
          permissions,
          operator_expires_at: expiresAt.toISOString(),
        } satisfies CashierOperatorContext,
      };
    },
  );

  if (!decision.ok) throw decision.error;
  return {
    operator_token: decision.operator_token,
    context: decision.context,
  };
}

export async function authenticateCashierOperatorAuthoritative(input: {
  stationToken: unknown;
  operatorToken: unknown;
  deviceId: unknown;
  requiredPermission?: CashierStaffPermission;
}): Promise<CashierOperatorContext> {
  assertPostgresAuthority();
  const stationToken = identifier(input.stationToken, "station_token", 200);
  const operatorToken = identifier(input.operatorToken, "operator_token", 200);
  const deviceId = identifier(input.deviceId, "device_id", 200);
  const stationHash = hashSecret(stationToken);
  const operatorHash = hashSecret(operatorToken);
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<OperatorAuthRow & StationCredentialRow>(
    pool,
    `SELECT os.id AS session_id, os.merchant_id, os.station_id, os.staff_id,
            os.shift_id, s.role, os.permission_snapshot,
            os.expires_at AS session_expires_at,
            c.id AS credential_id, st.name AS station_name,
            st.branch_key, st.branch_label, st.offline_inventory_authority,
            c.version AS credential_version, c.expires_at
       FROM cashier_operator_sessions os
       JOIN merchant_cashier_staff s
         ON s.id = os.staff_id AND s.merchant_id = os.merchant_id
       JOIN cashier_shifts sh
         ON sh.id = os.shift_id AND sh.merchant_id = os.merchant_id
        AND sh.station_id = os.station_id AND sh.staff_id = os.staff_id
       JOIN merchant_cashier_stations st
         ON st.id = os.station_id AND st.merchant_id = os.merchant_id
       JOIN cashier_station_credentials c
         ON c.station_id = os.station_id AND c.merchant_id = os.merchant_id
      WHERE c.token_hash = $1
        AND os.token_hash = $2
        AND c.device_id = $3
        AND c.status = 'active'
        AND c.expires_at > now()
        AND c.version = st.credential_version
        AND st.status = 'active'
        AND st.paired_device_id = $3
        AND os.status = 'active'
        AND os.expires_at > now()
        AND os.staff_version = s.version
        AND s.status = 'active'
        AND sh.status = 'open'
      LIMIT 1`,
    [stationHash, operatorHash, deviceId],
  );
  const row = rows[0];
  if (!row) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SESSION_INVALID",
      "cashier operator session is invalid or expired",
      401,
    );
  }
  await assertMerchantOperationalAccessForCashier(pool, row.merchant_id);
  const permissions = normalizePermissionSnapshot(row.permission_snapshot);
  if (
    input.requiredPermission &&
    !permissions.includes(input.requiredPermission)
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_PERMISSION_REQUIRED",
      "cashier operator permission is required",
      403,
      { required_permission: input.requiredPermission },
    );
  }
  await pool.query(
    `UPDATE cashier_operator_sessions SET last_seen_at = now()
      WHERE id = $1 AND status = 'active'`,
    [row.session_id],
  );
  await pool.query(
    `UPDATE cashier_station_credentials SET last_used_at = now()
      WHERE id = $1 AND status = 'active'`,
    [row.credential_id],
  );
  await pool.query(
    `UPDATE merchant_cashier_stations
        SET last_seen_at = now(), updated_at = now()
      WHERE merchant_id = $1 AND id = $2 AND status = 'active'`,
    [row.merchant_id, row.station_id],
  );
  return {
    credential_id: row.credential_id,
    merchant_id: row.merchant_id,
    station_id: row.station_id,
    station_name: row.station_name,
    branch_key: row.branch_key,
    ...(row.branch_label ? { branch_label: row.branch_label } : {}),
    offline_inventory_authority: Boolean(row.offline_inventory_authority),
    credential_version: Number(row.credential_version),
    credential_expires_at: toIso(row.expires_at),
    device_id: deviceId,
    operator_session_id: row.session_id,
    staff_id: row.staff_id,
    shift_id: row.shift_id,
    role: safeRole(row.role),
    permissions,
    operator_expires_at: toIso(row.session_expires_at),
  };
}

export async function logoutCashierOperatorAuthoritative(
  context: CashierOperatorContext,
): Promise<void> {
  assertPostgresAuthority();
  await withMerchantOperationalTransaction(context.merchant_id, async (client) => {
    await client.query(
      `UPDATE cashier_operator_sessions
          SET status = 'revoked', revoked_at = now()
        WHERE id = $1 AND merchant_id = $2 AND station_id = $3
          AND staff_id = $4 AND status = 'active'`,
      [
        context.operator_session_id,
        context.merchant_id,
        context.station_id,
        context.staff_id,
      ],
    );
    await client.query(
      `UPDATE cashier_shifts
          SET status = 'closed', ended_at = now(), close_reason = 'operator_logout'
        WHERE id = $1 AND merchant_id = $2 AND station_id = $3
          AND staff_id = $4 AND status = 'open'`,
      [context.shift_id, context.merchant_id, context.station_id, context.staff_id],
    );
  });
}
