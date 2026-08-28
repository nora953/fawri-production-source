import {
  cashierOperatorHeaders,
  getCashierOperatorSession,
  getOrCreateCashierDeviceIdentity,
  invalidateCashierOperatorSession,
  writeCashierDeviceIdentity,
  type CashierClientPermission,
  type CashierDeviceIdentity,
  type CashierOperatorContext,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';

const OPERATOR_STORAGE_KEY = 'fawri.cashier.operator-session.v1';

const ALLOWED_PERMISSIONS = new Set<CashierClientPermission>([
  'sale.create',
  'sale.view_own',
  'sale.view_all',
  'sale.return',
  'sale.void',
  'inventory.adjust',
  'reports.sales',
  'reports.profit',
  'catalog.cost',
  'shifts.manage',
  'staff.manage',
  'stations.manage',
]);

export class CashierOperatorPolicyRefreshError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierOperatorPolicyRefreshError';
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim();
}

function permissions(value: unknown): CashierClientPermission[] {
  if (!Array.isArray(value)) {
    throw new CashierOperatorPolicyRefreshError(
      'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',
      'Cashier operator permission snapshot is invalid',
      502,
    );
  }
  const result: CashierClientPermission[] = [];
  for (const raw of value) {
    const permission = text(raw) as CashierClientPermission;
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      throw new CashierOperatorPolicyRefreshError(
        'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',
        'Cashier operator permission snapshot is invalid',
        502,
      );
    }
    if (!result.includes(permission)) result.push(permission);
  }
  return result;
}

function validInstant(value: string): boolean {
  return Boolean(value) && Number.isFinite(new Date(value).getTime());
}

function refreshedContext(
  session: CashierOperatorSession,
  value: unknown,
): CashierOperatorContext {
  const operator = record(value);
  const credentialVersion = Number(operator.credential_version);
  const context: CashierOperatorContext = {
    merchant_id: text(operator.merchant_id),
    station_id: text(operator.station_id),
    station_name: text(operator.station_name),
    branch_key: text(operator.branch_key),
    ...(text(operator.branch_label)
      ? { branch_label: text(operator.branch_label) }
      : {}),
    offline_inventory_authority:
      operator.offline_inventory_authority === true,
    station_token: session.context.station_token,
    credential_expires_at: text(operator.credential_expires_at),
    device_id: text(operator.device_id),
    credential_id: text(operator.credential_id),
    credential_version: credentialVersion,
    operator_session_id: text(operator.operator_session_id),
    staff_id: text(operator.staff_id),
    shift_id: text(operator.shift_id),
    role: operator.role === 'manager' ? 'manager' : 'cashier',
    permissions: permissions(operator.permissions),
    operator_expires_at: text(operator.operator_expires_at),
  };

  const sameImmutableContext =
    context.merchant_id === session.context.merchant_id &&
    context.station_id === session.context.station_id &&
    context.device_id === session.context.device_id &&
    context.credential_id === session.context.credential_id &&
    context.credential_version === session.context.credential_version &&
    context.operator_session_id === session.context.operator_session_id &&
    context.staff_id === session.context.staff_id &&
    context.shift_id === session.context.shift_id;

  if (
    !sameImmutableContext ||
    !context.station_name ||
    !context.branch_key ||
    !Number.isSafeInteger(context.credential_version) ||
    context.credential_version <= 0 ||
    !validInstant(context.credential_expires_at) ||
    !validInstant(context.operator_expires_at)
  ) {
    throw new CashierOperatorPolicyRefreshError(
      'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',
      'Cashier operator validation context does not match the active shift',
      502,
    );
  }
  return context;
}

async function updateLocalStationPolicy(
  context: CashierOperatorContext,
): Promise<void> {
  const identity = await getOrCreateCashierDeviceIdentity();
  if (
    identity.cloud_merchant_id !== context.merchant_id ||
    identity.device_id !== context.device_id ||
    identity.station_id !== context.station_id
  ) {
    throw new CashierOperatorPolicyRefreshError(
      'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',
      'Cashier local identity does not match the validated station',
      409,
    );
  }

  const nextIdentity: CashierDeviceIdentity = {
    ...identity,
    station_name: context.station_name,
    branch_key: context.branch_key,
    offline_inventory_authority: context.offline_inventory_authority,
    station_credential_expires_at: context.credential_expires_at,
  };
  if (context.branch_label) nextIdentity.branch_label = context.branch_label;
  else delete nextIdentity.branch_label;
  await writeCashierDeviceIdentity(nextIdentity);
}

export async function refreshCashierOperatorPolicyFromCloud(): Promise<CashierOperatorSession | null> {
  const session = await getCashierOperatorSession();
  if (!session) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return session;
  }

  const response = await fetch('/api/cashier/operator/me', {
    headers: cashierOperatorHeaders(session),
    credentials: 'omit',
    cache: 'no-store',
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    if (response.status === 401) {
      invalidateCashierOperatorSession();
      return null;
    }
    throw new CashierOperatorPolicyRefreshError(
      text(payload.code) || 'CASHIER_OPERATOR_VALIDATE_FAILED',
      text(payload.error) || 'Could not refresh cashier operator policy',
      response.status,
    );
  }

  const context = refreshedContext(session, payload.operator);
  await updateLocalStationPolicy(context);

  const refreshedSession: CashierOperatorSession = {
    operator_token: session.operator_token,
    context,
  };
  if (typeof sessionStorage === 'undefined') {
    throw new CashierOperatorPolicyRefreshError(
      'CASHIER_OPERATOR_STORAGE_UNAVAILABLE',
      'Session storage is required for cashier operator validation',
      503,
    );
  }
  sessionStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(refreshedSession));
  return refreshedSession;
}
