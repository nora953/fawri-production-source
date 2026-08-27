import {
  bindCashierOperation,
  getCashierPendingEnvelopeCountForIdentity,
  scrubCashierRawCostsForIdentity,
  type CashierLocalDeviceIdentity,
  type CashierOperationBinding,
} from './cashierOperatorLocalSecurity';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const OPERATOR_STORAGE_KEY = 'fawri.cashier.operator-session.v1';

export type CashierClientPermission =
  | 'sale.create'
  | 'sale.view_own'
  | 'sale.view_all'
  | 'sale.return'
  | 'sale.void'
  | 'inventory.adjust'
  | 'reports.sales'
  | 'reports.profit'
  | 'catalog.cost'
  | 'shifts.manage'
  | 'staff.manage'
  | 'stations.manage';

export type CashierDeviceIdentity = CashierLocalDeviceIdentity & {
  id: 'default';
  created_at: string;
  cloud_bound_at?: string;
  last_catalog_sync_at?: string;
  station_id?: string;
  station_name?: string;
  branch_key?: string;
  branch_label?: string;
  offline_inventory_authority?: boolean;
  station_token?: string;
  station_credential_expires_at?: string;
};

export type CashierStationBinding = {
  merchant_id: string;
  station_id: string;
  station_name: string;
  branch_key: string;
  branch_label?: string;
  offline_inventory_authority: boolean;
  station_token: string;
  credential_expires_at: string;
  device_id: string;
};

export type CashierOperatorContext = CashierStationBinding & {
  credential_id: string;
  credential_version: number;
  operator_session_id: string;
  staff_id: string;
  shift_id: string;
  role: 'cashier' | 'manager';
  permissions: CashierClientPermission[];
  operator_expires_at: string;
};

export type CashierOperatorSession = {
  operator_token: string;
  context: CashierOperatorContext;
};

export type CashierLoginStaff = {
  id: string;
  display_name: string;
  role: 'cashier' | 'manager';
};

export class CashierOperatorSessionClientError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierOperatorSessionClientError';
    this.code = code;
    this.status = status;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function randomId(prefix: string): string {
  const cryptoObject = globalThis.crypto;
  const value =
    cryptoObject && typeof cryptoObject.randomUUID === 'function'
      ? cryptoObject.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function openBootstrapDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierOperatorSessionClientError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BOOTSTRAP_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BOOTSTRAP_STORE)) {
        request.result.createObjectStore(BOOTSTRAP_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier bootstrap database'));
  });
}

export async function getOrCreateCashierDeviceIdentity(): Promise<CashierDeviceIdentity> {
  const database = await openBootstrapDatabase();
  try {
    const read = database.transaction(BOOTSTRAP_STORE, 'readonly');
    const existing = (await requestResult(
      read.objectStore(BOOTSTRAP_STORE).get('default'),
    )) as CashierDeviceIdentity | undefined;
    if (existing?.local_merchant_id && existing.device_id) return existing;

    const identity: CashierDeviceIdentity = {
      id: 'default',
      local_merchant_id: randomId('merchant'),
      device_id: randomId('device'),
      created_at: new Date().toISOString(),
    };
    const write = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(write);
    write.objectStore(BOOTSTRAP_STORE).put(identity);
    await completion;
    return identity;
  } finally {
    database.close();
  }
}

export async function writeCashierDeviceIdentity(
  identity: CashierDeviceIdentity,
): Promise<void> {
  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    transaction.objectStore(BOOTSTRAP_STORE).put(identity);
    await completion;
  } finally {
    database.close();
  }
}

function stationBinding(
  identity: CashierDeviceIdentity,
): CashierStationBinding | null {
  if (
    !identity.cloud_merchant_id ||
    !identity.station_id ||
    !identity.station_name ||
    !identity.branch_key ||
    !identity.station_token ||
    !identity.station_credential_expires_at
  ) {
    return null;
  }
  const expiresAt = new Date(identity.station_credential_expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    merchant_id: identity.cloud_merchant_id,
    station_id: identity.station_id,
    station_name: identity.station_name,
    branch_key: identity.branch_key,
    ...(identity.branch_label ? { branch_label: identity.branch_label } : {}),
    offline_inventory_authority: identity.offline_inventory_authority === true,
    station_token: identity.station_token,
    credential_expires_at: identity.station_credential_expires_at,
    device_id: identity.device_id,
  };
}

export async function getCashierStationBinding(): Promise<CashierStationBinding | null> {
  return stationBinding(await getOrCreateCashierDeviceIdentity());
}

function parseOperatorSession(value: string | null): CashierOperatorSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CashierOperatorSession;
    if (!parsed?.operator_token || !parsed.context?.operator_session_id) return null;
    if (!parsed.context.station_token || !Array.isArray(parsed.context.permissions)) {
      return null;
    }
    const expiresAt = new Date(parsed.context.operator_expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getCashierOperatorSession(): Promise<CashierOperatorSession | null> {
  if (typeof sessionStorage === 'undefined') return null;
  const session = parseOperatorSession(
    sessionStorage.getItem(OPERATOR_STORAGE_KEY),
  );
  if (!session) {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
    return null;
  }
  const binding = await getCashierStationBinding();
  if (
    !binding ||
    session.context.station_id !== binding.station_id ||
    session.context.device_id !== binding.device_id ||
    session.context.merchant_id !== binding.merchant_id ||
    session.context.station_token !== binding.station_token
  ) {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
    return null;
  }
  return session;
}

export function cashierStationHeaders(
  binding: CashierStationBinding,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Fawri-Cashier-Station-Token': binding.station_token,
    'X-Fawri-Cashier-Device-Id': binding.device_id,
  };
}

export function cashierOperatorHeaders(
  session: CashierOperatorSession,
): Record<string, string> {
  return {
    ...cashierStationHeaders(session.context),
    'X-Fawri-Cashier-Operator-Token': session.operator_token,
  };
}

async function responsePayload(
  response: Response,
): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function apiError(
  response: Response,
  payload: Record<string, unknown>,
  fallbackCode: string,
  fallbackMessage: string,
): CashierOperatorSessionClientError {
  return new CashierOperatorSessionClientError(
    String(payload.code || fallbackCode),
    String(payload.error || fallbackMessage),
    response.status,
  );
}

export async function getCashierPendingEnvelopeCount(): Promise<number> {
  const identity = await getOrCreateCashierDeviceIdentity();
  return getCashierPendingEnvelopeCountForIdentity(identity);
}

export async function pairCashierStation(
  pairingCode: string,
): Promise<CashierStationBinding> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_PAIRING_OFFLINE',
      'Internet connection is required to pair this cashier station',
      0,
    );
  }
  const identity = await getOrCreateCashierDeviceIdentity();
  const pending = await getCashierPendingEnvelopeCountForIdentity(identity);
  if (pending > 0) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_PAIRING_PENDING_OPERATIONS',
      'Pending cashier operations must synchronize before station pairing',
      409,
    );
  }

  const response = await fetch('/api/cashier/station/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairing_code: String(pairingCode || '').trim(),
      device_id: identity.device_id,
    }),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_PAIRING_FAILED',
      'Cashier station pairing failed',
    );
  }

  const merchantId = String(payload.merchant_id || '').trim();
  const stationId = String(payload.station_id || '').trim();
  const stationName = String(payload.station_name || '').trim();
  const branchKey = String(payload.branch_key || '').trim();
  const stationToken = String(payload.station_token || '').trim();
  const credentialExpiresAt = String(payload.credential_expires_at || '').trim();
  if (
    !merchantId ||
    !stationId ||
    !stationName ||
    !branchKey ||
    !stationToken ||
    !credentialExpiresAt
  ) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_PAIRING_RESPONSE_INVALID',
      'Cashier station pairing response is invalid',
      502,
    );
  }
  if (identity.cloud_merchant_id && identity.cloud_merchant_id !== merchantId) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_DEVICE_MERCHANT_MISMATCH',
      'This cashier device is already bound to another merchant',
      409,
    );
  }

  const next: CashierDeviceIdentity = {
    ...identity,
    cloud_merchant_id: merchantId,
    cloud_bound_at: identity.cloud_bound_at || new Date().toISOString(),
    station_id: stationId,
    station_name: stationName,
    branch_key: branchKey,
    ...(payload.branch_label
      ? { branch_label: String(payload.branch_label) }
      : {}),
    offline_inventory_authority:
      payload.offline_inventory_authority === true,
    station_token: stationToken,
    station_credential_expires_at: credentialExpiresAt,
  };
  await writeCashierDeviceIdentity(next);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
  }
  await scrubCashierRawCostsForIdentity(next);

  const binding = stationBinding(next);
  if (!binding) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_PAIRING_RESPONSE_INVALID',
      'Cashier station credential is invalid',
      502,
    );
  }
  return binding;
}

export async function listCashierLoginStaff(): Promise<CashierLoginStaff[]> {
  const binding = await getCashierStationBinding();
  if (!binding) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_STATION_PAIRING_REQUIRED',
      'Cashier station must be paired first',
      401,
    );
  }
  const response = await fetch('/api/cashier/station/staff', {
    headers: cashierStationHeaders(binding),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_STAFF_LIST_FAILED',
      'Could not load cashier staff',
    );
  }
  const values = Array.isArray(payload.staff) ? payload.staff : [];
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const id = String(item.id || '').trim();
    const displayName = String(item.display_name || '').trim();
    const role = item.role === 'manager' ? 'manager' : 'cashier';
    return id && displayName
      ? [{ id, display_name: displayName, role }]
      : [];
  });
}

export async function loginCashierOperator(
  staffId: string,
  pin: string,
): Promise<CashierOperatorSession> {
  const binding = await getCashierStationBinding();
  if (!binding) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_STATION_PAIRING_REQUIRED',
      'Cashier station must be paired first',
      401,
    );
  }
  const response = await fetch('/api/cashier/operator/login', {
    method: 'POST',
    headers: cashierStationHeaders(binding),
    body: JSON.stringify({ staff_id: staffId, pin }),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_OPERATOR_LOGIN_FAILED',
      'Cashier operator login failed',
    );
  }
  const operatorToken = String(payload.operator_token || '').trim();
  if (
    !operatorToken ||
    !payload.context ||
    typeof payload.context !== 'object' ||
    Array.isArray(payload.context)
  ) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_LOGIN_RESPONSE_INVALID',
      'Cashier operator login response is invalid',
      502,
    );
  }
  const serverContext = payload.context as Record<string, unknown>;
  const permissions = Array.isArray(serverContext.permissions)
    ? serverContext.permissions.map((value) => String(value))
    : [];
  const role = serverContext.role === 'manager' ? 'manager' : 'cashier';
  const context: CashierOperatorContext = {
    merchant_id: String(serverContext.merchant_id || ''),
    station_id: String(serverContext.station_id || ''),
    station_name: String(serverContext.station_name || binding.station_name),
    branch_key: String(serverContext.branch_key || binding.branch_key),
    ...(serverContext.branch_label
      ? { branch_label: String(serverContext.branch_label) }
      : binding.branch_label
        ? { branch_label: binding.branch_label }
        : {}),
    offline_inventory_authority:
      serverContext.offline_inventory_authority === true,
    station_token: binding.station_token,
    credential_expires_at: String(
      serverContext.credential_expires_at || binding.credential_expires_at,
    ),
    device_id: String(serverContext.device_id || ''),
    credential_id: String(serverContext.credential_id || ''),
    credential_version: Number(serverContext.credential_version),
    operator_session_id: String(serverContext.operator_session_id || ''),
    staff_id: String(serverContext.staff_id || ''),
    shift_id: String(serverContext.shift_id || ''),
    role,
    permissions: permissions as CashierClientPermission[],
    operator_expires_at: String(serverContext.operator_expires_at || ''),
  };
  if (
    context.station_id !== binding.station_id ||
    context.device_id !== binding.device_id ||
    context.merchant_id !== binding.merchant_id ||
    !context.credential_id ||
    !Number.isSafeInteger(context.credential_version) ||
    context.credential_version <= 0 ||
    !context.operator_session_id ||
    !context.staff_id ||
    !context.shift_id ||
    !context.operator_expires_at
  ) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_LOGIN_RESPONSE_INVALID',
      'Cashier operator context does not match paired station',
      502,
    );
  }
  const session: CashierOperatorSession = {
    operator_token: operatorToken,
    context,
  };
  if (typeof sessionStorage === 'undefined') {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_STORAGE_UNAVAILABLE',
      'Session storage is required for cashier operator login',
      503,
    );
  }
  sessionStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function validateCashierOperatorSession(): Promise<CashierOperatorSession | null> {
  const session = await getCashierOperatorSession();
  if (!session) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return session;
  }
  const response = await fetch('/api/cashier/operator/me', {
    headers: cashierOperatorHeaders(session),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    if (response.status === 401 && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
      return null;
    }
    throw apiError(
      response,
      payload,
      'CASHIER_OPERATOR_VALIDATE_FAILED',
      'Could not validate cashier operator session',
    );
  }
  return session;
}

export function cashierOperatorCan(
  session: CashierOperatorSession | null,
  permission: CashierClientPermission,
): boolean {
  return Boolean(session?.context.permissions.includes(permission));
}

export async function bindCashierOperationToCurrentOperator(
  operationId: string,
  operationKind: CashierOperationBinding['operation_kind'],
): Promise<CashierOperationBinding> {
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  return bindCashierOperation({
    operation_id: String(operationId || '').trim(),
    operation_kind: operationKind,
    merchant_id: session.context.merchant_id,
    station_id: session.context.station_id,
    staff_id: session.context.staff_id,
    shift_id: session.context.shift_id,
    device_id: session.context.device_id,
    bound_at: new Date().toISOString(),
  });
}

export async function logoutCashierOperator(): Promise<void> {
  const session = await getCashierOperatorSession();
  if (!session) return;
  const identity = await getOrCreateCashierDeviceIdentity();
  const pending = await getCashierPendingEnvelopeCountForIdentity(identity);
  if (pending > 0) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_PENDING_SYNC',
      'Pending cashier operations must synchronize before closing this shift',
      409,
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_LOGOUT_OFFLINE',
      'Internet connection is required to close the cashier shift',
      0,
    );
  }
  const response = await fetch('/api/cashier/operator/logout', {
    method: 'POST',
    headers: cashierOperatorHeaders(session),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_OPERATOR_LOGOUT_FAILED',
      'Could not close cashier shift',
    );
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
  }
}
