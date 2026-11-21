import {
  isCashierStaffRole,
  normalizeCashierStaffPermissions,
  type CashierStaffPermission,
  type CashierStaffRole,
} from "./cashierStaffPolicy";

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

export function identifier(value: unknown, field: string, maxLength = 200): string {
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

export function optionalLabel(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return identifier(value, field, maxLength);
}

export function positiveInteger(value: unknown, field: string): number {
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

export function cashierRole(value: unknown): CashierStaffRole {
  if (!isCashierStaffRole(value)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_ROLE_INVALID",
      "cashier staff role is invalid",
      400,
    );
  }
  return value;
}

export function cashierPermissions(value: unknown): CashierStaffPermission[] {
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

export function staffStatus(value: unknown): "active" | "disabled" | "revoked" {
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

export function offlineAuthorityFlag(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      "offline_inventory_authority must be a boolean",
      400,
      { field: "offline_inventory_authority" },
    );
  }
  return value;
}

export function stationStatus(value: unknown): "active" | "disabled" | "revoked" {
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

