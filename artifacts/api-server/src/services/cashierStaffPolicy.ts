export const CASHIER_STAFF_ROLES = ['cashier', 'manager'] as const;
export type CashierStaffRole = (typeof CASHIER_STAFF_ROLES)[number];

export const CASHIER_STAFF_PERMISSIONS = [
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
  'stations.manage',
] as const;

export type CashierStaffPermission =
  (typeof CASHIER_STAFF_PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(CASHIER_STAFF_PERMISSIONS);

/**
 * Presets include only permissions that the current staff cashier UI/API can
 * actually exercise. Manual discount authority is intentionally never granted
 * by role preset: the merchant must enable it explicitly per employee.
 */
const RECOMMENDED_ROLE_PERMISSIONS: Record<
  CashierStaffRole,
  readonly CashierStaffPermission[]
> = {
  cashier: ['sale.create', 'sale.view_own'],
  manager: [
    'sale.create',
    'sale.view_own',
    'sale.view_all',
    'sale.return',
    'sale.void',
    'reports.sales',
  ],
};

export const CASHIER_SENSITIVE_PERMISSIONS = [
  'sale.discount_override',
  'reports.profit',
  'catalog.cost',
  'staff.manage',
  'stations.manage',
] as const satisfies readonly CashierStaffPermission[];

export class CashierStaffPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierStaffPolicyError';
    this.code = code;
  }
}

export function isCashierStaffRole(value: unknown): value is CashierStaffRole {
  return CASHIER_STAFF_ROLES.includes(value as CashierStaffRole);
}

export function isCashierStaffPermission(
  value: unknown,
): value is CashierStaffPermission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

export function recommendedCashierStaffPermissions(
  role: CashierStaffRole,
): CashierStaffPermission[] {
  return [...RECOMMENDED_ROLE_PERMISSIONS[role]];
}

/**
 * Permission rows are the authority. Roles are only safe presets used when the
 * merchant creates a staff member; changing a role never silently grants a
 * sensitive permission.
 */
export function normalizeCashierStaffPermissions(
  values: readonly unknown[],
): CashierStaffPermission[] {
  const normalized = new Set<CashierStaffPermission>();
  for (const value of values) {
    if (!isCashierStaffPermission(value)) {
      throw new CashierStaffPolicyError(
        'CASHIER_STAFF_PERMISSION_INVALID',
        'cashier staff permission is invalid',
      );
    }
    normalized.add(value);
  }
  return CASHIER_STAFF_PERMISSIONS.filter((permission) =>
    normalized.has(permission),
  );
}

export function cashierStaffCan(
  permissions: readonly CashierStaffPermission[],
  required: CashierStaffPermission,
): boolean {
  return permissions.includes(required);
}

export function cashierStaffMayDiscount(
  permissions: readonly CashierStaffPermission[],
): boolean {
  return cashierStaffCan(permissions, 'sale.discount');
}

export function cashierStaffMayApproveDiscountOverride(
  permissions: readonly CashierStaffPermission[],
): boolean {
  return cashierStaffCan(permissions, 'sale.discount_override');
}

export function cashierStaffMayViewProfit(
  permissions: readonly CashierStaffPermission[],
): boolean {
  return cashierStaffCan(permissions, 'reports.profit');
}

/** Raw catalog cost must never be projected to a station without this grant. */
export function cashierStaffMayReceiveCatalogCost(
  permissions: readonly CashierStaffPermission[],
): boolean {
  return cashierStaffCan(permissions, 'catalog.cost');
}
