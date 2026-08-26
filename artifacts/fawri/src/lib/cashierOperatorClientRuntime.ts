import type { CatalogProduct } from './catalogUiApi';
import type {
  CatalogCommerceContext,
  CatalogPromotion,
} from './catalogPromotionUiApi';
import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import type {
  CashierCatalogLookup,
  CashierSyncEnvelope,
} from './cashierLocalContracts';
import {
  cashierPromotionLifecycleAt,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const OPERATOR_STORAGE_KEY = 'fawri.cashier.operator-session.v1';
const OPERATOR_LOCAL_DATABASE = 'fawri-cashier-operator-local-v1';
const OPERATOR_LOCAL_VERSION = 1;
const COST_EVIDENCE_STORE = 'cost_evidence';
const OPERATION_BINDING_STORE = 'operation_bindings';
const CATALOG_STORE = 'catalog';
const PROMOTION_STORE = 'promotions';
const SALES_STORE = 'sales';
const MAX_PENDING_ENVELOPES = 1000;

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

type CashierDeviceIdentity = {
  id: 'default';
  local_merchant_id: string;
  device_id: string;
  created_at: string;
  cloud_merchant_id?: string;
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

type CostEvidenceRecord = {
  key: string;
  merchant_id: string;
  product_id: string;
  variant_id: string;
  catalog_version: number;
  token: string;
  expires_at?: string;
  stored_at: string;
};

export type CashierOperationBinding = {
  operation_id: string;
  operation_kind: 'sale' | 'return' | 'void';
  merchant_id: string;
  station_id: string;
  staff_id: string;
  shift_id: string;
  device_id: string;
  bound_at: string;
};

type OperatorCatalogVariant = CatalogProduct['variants'][number] & {
  cost_evidence?: string;
};

type OperatorCatalogProduct = Omit<CatalogProduct, 'variants'> & {
  cost_evidence?: string;
  variants: OperatorCatalogVariant[];
};

type OperatorCatalogSnapshot = {
  ok?: boolean;
  merchant_id?: unknown;
  station_id?: unknown;
  staff_id?: unknown;
  shift_id?: unknown;
  permissions?: unknown;
  context?: unknown;
  products?: unknown;
  promotions?: unknown;
  code?: unknown;
  error?: unknown;
};

export type CashierOperatorCatalogSyncResult = {
  merchant_id: string;
  currency_code: string;
  product_count: number;
  local_item_count: number;
  promotion_count: number;
  preserve_local_inventory: boolean;
  synced_at: string;
};

export type CashierOperatorOutboxSyncResult = {
  pending_before: number;
  uploaded_operations: number;
  replayed_operations: number;
  skipped_operations: number;
  acknowledged_operations: number;
  pending_after: number;
};

export class CashierOperatorClientError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierOperatorClientError';
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
    throw new CashierOperatorClientError(
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

async function getOrCreateIdentity(): Promise<CashierDeviceIdentity> {
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

async function writeIdentity(identity: CashierDeviceIdentity): Promise<void> {
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

function openOperatorLocalDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierOperatorClientError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OPERATOR_LOCAL_DATABASE, OPERATOR_LOCAL_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(COST_EVIDENCE_STORE)) {
        database.createObjectStore(COST_EVIDENCE_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(OPERATION_BINDING_STORE)) {
        database.createObjectStore(OPERATION_BINDING_STORE, { keyPath: 'operation_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier operator local database'));
  });
}

function stationBinding(identity: CashierDeviceIdentity): CashierStationBinding | null {
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
  return stationBinding(await getOrCreateIdentity());
}

function parseOperatorSession(value: string | null): CashierOperatorSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CashierOperatorSession;
    if (!parsed?.operator_token || !parsed.context?.operator_session_id) return null;
    if (!Array.isArray(parsed.context.permissions)) return null;
    const expiresAt = new Date(parsed.context.operator_expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getCashierOperatorSession(): Promise<CashierOperatorSession | null> {
  if (typeof sessionStorage === 'undefined') return null;
  const session = parseOperatorSession(sessionStorage.getItem(OPERATOR_STORAGE_KEY));
  if (!session) {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
    return null;
  }
  const binding = await getCashierStationBinding();
  if (
    !binding ||
    session.context.station_id !== binding.station_id ||
    session.context.device_id !== binding.device_id ||
    session.context.merchant_id !== binding.merchant_id
  ) {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
    return null;
  }
  return session;
}

function stationHeaders(binding: CashierStationBinding): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Fawri-Cashier-Station-Token': binding.station_token,
    'X-Fawri-Cashier-Device-Id': binding.device_id,
  };
}

function operatorHeaders(session: CashierOperatorSession): Record<string, string> {
  return {
    ...stationHeaders(session.context),
    'X-Fawri-Cashier-Operator-Token': session.operator_token,
  };
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
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
): CashierOperatorClientError {
  return new CashierOperatorClientError(
    String(payload.code || fallbackCode),
    String(payload.error || fallbackMessage),
    response.status,
  );
}

async function openExistingCashierDatabase(databaseName: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    let created = false;
    request.onupgradeneeded = () => {
      created = request.oldVersion === 0;
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        void indexedDB.deleteDatabase(databaseName);
        resolve(null);
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Could not open cashier database'));
  });
}

async function scrubLegacyLocalCosts(identity: CashierDeviceIdentity): Promise<void> {
  const databaseName = `fawri-cashier-${identity.local_merchant_id}-v1`;
  const database = await openExistingCashierDatabase(databaseName);
  if (!database) return;
  try {
    const stores = [CATALOG_STORE, SALES_STORE].filter(name =>
      database.objectStoreNames.contains(name),
    );
    if (stores.length === 0) return;
    const transaction = database.transaction(stores, 'readwrite');
    const completion = transactionDone(transaction);
    if (stores.includes(CATALOG_STORE)) {
      const catalog = transaction.objectStore(CATALOG_STORE);
      const records = (await requestResult(catalog.getAll())) as Array<Record<string, unknown>>;
      for (const record of records) {
        if (Object.prototype.hasOwnProperty.call(record, 'unit_cost_minor')) {
          delete record.unit_cost_minor;
          catalog.put(record);
        }
      }
    }
    if (stores.includes(SALES_STORE)) {
      const sales = transaction.objectStore(SALES_STORE);
      const records = (await requestResult(sales.getAll())) as Array<Record<string, unknown>>;
      for (const sale of records) {
        const lines = Array.isArray(sale.lines)
          ? sale.lines.map(value => {
              const line = value && typeof value === 'object' && !Array.isArray(value)
                ? { ...(value as Record<string, unknown>) }
                : {};
              delete line.unit_cost_minor;
              return line;
            })
          : [];
        sale.lines = lines;
        sales.put(sale);
      }
    }
    await completion;
  } finally {
    database.close();
  }
}

async function localAuthority(identity: CashierDeviceIdentity): Promise<IndexedDbCashierAuthority> {
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    ...(identity.cloud_merchant_id ? { cloudMerchantId: identity.cloud_merchant_id } : {}),
    deviceId: identity.device_id,
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
  };
  const authority = new IndexedDbCashierAuthority(config);
  await authority.getCatalogItem('__fawri_operator_schema_probe__');
  return authority;
}

export async function getCashierPendingEnvelopeCount(): Promise<number> {
  const identity = await getOrCreateIdentity();
  const authority = await localAuthority(identity);
  try {
    return (await authority.listPendingSync(MAX_PENDING_ENVELOPES)).length;
  } finally {
    await authority.close().catch(() => undefined);
  }
}

export async function pairCashierStation(pairingCode: string): Promise<CashierStationBinding> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorClientError(
      'CASHIER_PAIRING_OFFLINE',
      'Internet connection is required to pair this cashier station',
      0,
    );
  }
  const identity = await getOrCreateIdentity();
  const pending = await getCashierPendingEnvelopeCount();
  if (pending > 0) {
    throw new CashierOperatorClientError(
      'CASHIER_PAIRING_PENDING_OPERATIONS',
      'Pending cashier operations must be synchronized before station pairing',
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
    throw apiError(response, payload, 'CASHIER_PAIRING_FAILED', 'Cashier station pairing failed');
  }
  const merchantId = String(payload.merchant_id || '').trim();
  const stationId = String(payload.station_id || '').trim();
  const stationName = String(payload.station_name || '').trim();
  const branchKey = String(payload.branch_key || '').trim();
  const stationToken = String(payload.station_token || '').trim();
  const expiresAt = String(payload.credential_expires_at || '').trim();
  if (!merchantId || !stationId || !stationName || !branchKey || !stationToken || !expiresAt) {
    throw new CashierOperatorClientError(
      'CASHIER_PAIRING_RESPONSE_INVALID',
      'Cashier station pairing response is invalid',
      502,
    );
  }
  if (identity.cloud_merchant_id && identity.cloud_merchant_id !== merchantId) {
    throw new CashierOperatorClientError(
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
    ...(payload.branch_label ? { branch_label: String(payload.branch_label) } : {}),
    offline_inventory_authority: payload.offline_inventory_authority === true,
    station_token: stationToken,
    station_credential_expires_at: expiresAt,
  };
  await writeIdentity(next);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
  }
  await scrubLegacyLocalCosts(next);
  const binding = stationBinding(next);
  if (!binding) {
    throw new CashierOperatorClientError(
      'CASHIER_PAIRING_RESPONSE_INVALID',
      'Cashier station credential is already invalid',
      502,
    );
  }
  return binding;
}

export async function listCashierLoginStaff(): Promise<CashierLoginStaff[]> {
  const binding = await getCashierStationBinding();
  if (!binding) {
    throw new CashierOperatorClientError(
      'CASHIER_STATION_PAIRING_REQUIRED',
      'Cashier station must be paired first',
      401,
    );
  }
  const response = await fetch('/api/cashier/station/staff', {
    headers: stationHeaders(binding),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(response, payload, 'CASHIER_STAFF_LIST_FAILED', 'Could not load cashier staff');
  }
  const staff = Array.isArray(payload.staff) ? payload.staff : [];
  return staff.flatMap(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const id = String(item.id || '').trim();
    const displayName = String(item.display_name || '').trim();
    const role = item.role === 'manager' ? 'manager' : 'cashier';
    return id && displayName ? [{ id, display_name: displayName, role }] : [];
  });
}

export async function loginCashierOperator(
  staffId: string,
  pin: string,
): Promise<CashierOperatorSession> {
  const binding = await getCashierStationBinding();
  if (!binding) {
    throw new CashierOperatorClientError(
      'CASHIER_STATION_PAIRING_REQUIRED',
      'Cashier station must be paired first',
      401,
    );
  }
  const response = await fetch('/api/cashier/operator/login', {
    method: 'POST',
    headers: stationHeaders(binding),
    body: JSON.stringify({ staff_id: staffId, pin }),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(response, payload, 'CASHIER_OPERATOR_LOGIN_FAILED', 'Cashier operator login failed');
  }
  const operatorToken = String(payload.operator_token || '').trim();
  const contextValue = payload.context;
  if (!operatorToken || !contextValue || typeof contextValue !== 'object' || Array.isArray(contextValue)) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_LOGIN_RESPONSE_INVALID',
      'Cashier operator login response is invalid',
      502,
    );
  }
  const context = contextValue as CashierOperatorContext;
  if (
    context.station_id !== binding.station_id ||
    context.device_id !== binding.device_id ||
    context.merchant_id !== binding.merchant_id ||
    !context.operator_session_id ||
    !context.staff_id ||
    !context.shift_id ||
    !Array.isArray(context.permissions)
  ) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_LOGIN_RESPONSE_INVALID',
      'Cashier operator context does not match paired station',
      502,
    );
  }
  const session: CashierOperatorSession = { operator_token: operatorToken, context };
  if (typeof sessionStorage === 'undefined') {
    throw new CashierOperatorClientError(
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return session;
  const response = await fetch('/api/cashier/operator/me', {
    headers: operatorHeaders(session),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    if (response.status === 401 && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
      return null;
    }
    throw apiError(response, payload, 'CASHIER_OPERATOR_VALIDATE_FAILED', 'Could not validate cashier operator session');
  }
  return session;
}

export function cashierOperatorCan(
  session: CashierOperatorSession | null,
  permission: CashierClientPermission,
): boolean {
  return Boolean(session?.context.permissions.includes(permission));
}

export async function logoutCashierOperator(): Promise<void> {
  const session = await getCashierOperatorSession();
  if (!session) return;
  const pending = await getCashierPendingEnvelopeCount();
  if (pending > 0) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_PENDING_SYNC',
      'Pending cashier operations must sync before closing this shift',
      409,
    );
  }
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const response = await fetch('/api/cashier/operator/logout', {
      method: 'POST',
      headers: operatorHeaders(session),
    });
    const payload = await responsePayload(response);
    if (!response.ok || payload.ok !== true) {
      throw apiError(response, payload, 'CASHIER_OPERATOR_LOGOUT_FAILED', 'Could not close cashier shift');
    }
  } else {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_LOGOUT_OFFLINE',
      'Internet connection is required to close the cashier shift',
      0,
    );
  }
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
}

function evidenceKey(input: {
  merchantId: string;
  productId: string;
  variantId?: string;
  catalogVersion: number;
}): string {
  return `${input.merchantId}\u0000${input.productId}\u0000${input.variantId || ''}\u0000${input.catalogVersion}`;
}

async function replaceCostEvidence(records: CostEvidenceRecord[]): Promise<void> {
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(COST_EVIDENCE_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(COST_EVIDENCE_STORE);
    store.clear();
    for (const record of records) store.put(record);
    await completion;
  } finally {
    database.close();
  }
}

async function getCostEvidence(input: {
  merchantId: string;
  productId: string;
  variantId?: string;
  catalogVersion: number;
}): Promise<string | null> {
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(COST_EVIDENCE_STORE, 'readonly');
    const record = (await requestResult(
      transaction.objectStore(COST_EVIDENCE_STORE).get(evidenceKey(input)),
    )) as CostEvidenceRecord | undefined;
    return record?.token || null;
  } finally {
    database.close();
  }
}

export async function bindCashierOperationToCurrentOperator(
  operationId: string,
  operationKind: CashierOperationBinding['operation_kind'],
): Promise<CashierOperationBinding> {
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  const normalizedOperationId = String(operationId || '').trim();
  if (!normalizedOperationId) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATION_ID_REQUIRED',
      'Cashier operation id is required',
      400,
    );
  }
  const binding: CashierOperationBinding = {
    operation_id: normalizedOperationId,
    operation_kind: operationKind,
    merchant_id: session.context.merchant_id,
    station_id: session.context.station_id,
    staff_id: session.context.staff_id,
    shift_id: session.context.shift_id,
    device_id: session.context.device_id,
    bound_at: new Date().toISOString(),
  };
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(OPERATION_BINDING_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(OPERATION_BINDING_STORE);
    const existing = (await requestResult(store.get(normalizedOperationId))) as
      | CashierOperationBinding
      | undefined;
    if (existing) {
      const same =
        existing.operation_kind === binding.operation_kind &&
        existing.merchant_id === binding.merchant_id &&
        existing.station_id === binding.station_id &&
        existing.staff_id === binding.staff_id &&
        existing.shift_id === binding.shift_id &&
        existing.device_id === binding.device_id;
      if (!same) {
        throw new CashierOperatorClientError(
          'CASHIER_OPERATION_BINDING_CONFLICT',
          'Cashier operation is already bound to another operator context',
          409,
        );
      }
      await completion;
      return existing;
    }
    store.put(binding);
    await completion;
    return binding;
  } finally {
    database.close();
  }
}

export async function getCashierOperationBinding(
  operationId: string,
): Promise<CashierOperationBinding | null> {
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(OPERATION_BINDING_STORE, 'readonly');
    return ((await requestResult(
      transaction.objectStore(OPERATION_BINDING_STORE).get(String(operationId || '').trim()),
    )) as CashierOperationBinding | undefined) || null;
  } finally {
    database.close();
  }
}

function assertOperationBinding(
  session: CashierOperatorSession,
  binding: CashierOperationBinding | null,
  kind: CashierOperationBinding['operation_kind'],
): void {
  if (
    !binding ||
    binding.operation_kind !== kind ||
    binding.merchant_id !== session.context.merchant_id ||
    binding.station_id !== session.context.station_id ||
    binding.staff_id !== session.context.staff_id ||
    binding.shift_id !== session.context.shift_id ||
    binding.device_id !== session.context.device_id
  ) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATION_BINDING_REQUIRED',
      'Pending cashier operation belongs to a different or unavailable operator shift',
      409,
    );
  }
}

function catalogKey(item: { product_id: string; variant_id?: string }): string {
  return `${item.product_id}\u0000${item.variant_id || ''}`;
}

function assertSafeMinor(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_CATALOG_INVALID',
      `${label} must be a non-negative safe integer`,
      409,
    );
  }
  return parsed;
}

function localItemsFromProduct(
  product: OperatorCatalogProduct,
  context: CatalogCommerceContext,
): { items: CashierCatalogLookup[]; evidence: CostEvidenceRecord[] } {
  if (product.status !== 'available' && product.status !== 'low_stock') {
    return { items: [], evidence: [] };
  }
  if (!Number.isSafeInteger(product.version) || product.version <= 0) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_CATALOG_INVALID',
      'Catalog product version is invalid',
      409,
    );
  }
  const base = {
    product_id: product.id,
    item_type: product.item_type,
    name: product.name,
    track_inventory: product.track_inventory,
    currency_code: context.currency_code,
    currency_fraction_digits: context.currency_fraction_digits,
    catalog_version: product.version,
  } as const;
  const storedAt = new Date().toISOString();

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const items: CashierCatalogLookup[] = [];
    const evidence: CostEvidenceRecord[] = [];
    for (const variant of product.variants) {
      const token = String(variant.cost_evidence || '').trim();
      if (!token) {
        throw new CashierOperatorClientError(
          'CASHIER_COST_EVIDENCE_MISSING',
          'Catalog variant is missing protected cost evidence',
          409,
        );
      }
      items.push({
        ...base,
        variant_id: variant.id,
        variant_name: variant.name || undefined,
        sku: variant.sku || product.sku || undefined,
        barcode: variant.barcode || undefined,
        stock_quantity: product.track_inventory
          ? assertSafeMinor(variant.stock_quantity, 'variant stock')
          : undefined,
        base_unit_price_minor: assertSafeMinor(
          variant.price_iqd ?? product.price_iqd,
          'variant price',
        ),
      });
      evidence.push({
        key: evidenceKey({
          merchantId: product.merchant_id,
          productId: product.id,
          variantId: variant.id,
          catalogVersion: product.version,
        }),
        merchant_id: product.merchant_id,
        product_id: product.id,
        variant_id: variant.id,
        catalog_version: product.version,
        token,
        stored_at: storedAt,
      });
    }
    return { items, evidence };
  }

  const token = String(product.cost_evidence || '').trim();
  if (!token) {
    throw new CashierOperatorClientError(
      'CASHIER_COST_EVIDENCE_MISSING',
      'Catalog product is missing protected cost evidence',
      409,
    );
  }
  return {
    items: [
      {
        ...base,
        sku: product.sku || undefined,
        barcode: product.barcode || undefined,
        stock_quantity: product.track_inventory
          ? assertSafeMinor(product.stock_quantity, 'product stock')
          : undefined,
        base_unit_price_minor: assertSafeMinor(product.price_iqd, 'product price'),
      },
    ],
    evidence: [
      {
        key: evidenceKey({
          merchantId: product.merchant_id,
          productId: product.id,
          catalogVersion: product.version,
        }),
        merchant_id: product.merchant_id,
        product_id: product.id,
        variant_id: '',
        catalog_version: product.version,
        token,
        stored_at: storedAt,
      },
    ],
  };
}

function assertUniqueLookupValues(items: CashierCatalogLookup[]): void {
  for (const field of ['sku', 'barcode'] as const) {
    const seen = new Map<string, string>();
    for (const item of items) {
      const value = String(item[field] || '').trim();
      if (!value) continue;
      const prior = seen.get(value);
      const key = catalogKey(item);
      if (prior && prior !== key) {
        throw new CashierOperatorClientError(
          field === 'sku'
            ? 'CASHIER_OPERATOR_SKU_AMBIGUOUS'
            : 'CASHIER_OPERATOR_BARCODE_AMBIGUOUS',
          `Cloud catalog contains duplicate ${field}`,
          409,
        );
      }
      seen.set(value, key);
    }
  }
}

function localPromotion(
  promotion: CatalogPromotion,
  localMerchantId: string,
  currencyCode: string,
): CashierPromotionRule {
  if (promotion.currency_code !== currencyCode) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_PROMOTION_CURRENCY_MISMATCH',
      'Promotion currency does not match merchant commerce context',
      409,
    );
  }
  const rule: CashierPromotionRule = {
    id: promotion.id,
    merchant_id: localMerchantId,
    name: promotion.name,
    scope: promotion.scope,
    effect: promotion.effect,
    ...(promotion.product_id ? { product_id: promotion.product_id } : {}),
    ...(promotion.variant_id ? { variant_id: promotion.variant_id } : {}),
    ...(promotion.percentage_bps !== undefined
      ? { percentage_bps: promotion.percentage_bps }
      : {}),
    ...(promotion.amount_minor !== undefined
      ? { amount_minor: promotion.amount_minor }
      : {}),
    currency_code: promotion.currency_code,
    ...(promotion.minimum_subtotal_minor !== undefined
      ? { minimum_subtotal_minor: promotion.minimum_subtotal_minor }
      : {}),
    starts_at: promotion.starts_at,
    ends_at: promotion.ends_at,
    schedule_timezone: promotion.schedule_timezone,
    priority: promotion.priority,
    enabled: promotion.enabled,
    version: promotion.version,
  };
  cashierPromotionLifecycleAt(rule, new Date());
  return rule;
}

async function replaceLocalCommerceSnapshot(input: {
  databaseName: string;
  items: CashierCatalogLookup[];
  promotions: CashierPromotionRule[];
  preserveLocalInventory: boolean;
  syncedAt: string;
}): Promise<void> {
  const database = await openExistingCashierDatabase(input.databaseName);
  if (!database) {
    throw new CashierOperatorClientError(
      'CASHIER_LOCAL_SCHEMA_MISSING',
      'Local cashier schema is not initialized',
      409,
    );
  }
  try {
    if (
      !database.objectStoreNames.contains(CATALOG_STORE) ||
      !database.objectStoreNames.contains(PROMOTION_STORE)
    ) {
      throw new CashierOperatorClientError(
        'CASHIER_LOCAL_SCHEMA_MISSING',
        'Local cashier schema is not initialized',
        409,
      );
    }
    const transaction = database.transaction(
      [CATALOG_STORE, PROMOTION_STORE],
      'readwrite',
    );
    const completion = transactionDone(transaction);
    const catalog = transaction.objectStore(CATALOG_STORE);
    const promotions = transaction.objectStore(PROMOTION_STORE);
    const existing = (await requestResult(catalog.getAll())) as Array<
      CashierCatalogLookup & { key: string; local_updated_at: string }
    >;
    const existingByKey = new Map(existing.map(record => [record.key, record]));
    catalog.clear();
    promotions.clear();
    for (const item of input.items) {
      const key = catalogKey(item);
      const prior = existingByKey.get(key);
      catalog.put({
        ...item,
        ...(input.preserveLocalInventory && prior?.track_inventory && item.track_inventory
          ? { stock_quantity: prior.stock_quantity }
          : {}),
        key,
        local_updated_at: input.syncedAt,
      });
    }
    for (const promotion of input.promotions) {
      promotions.put({ ...promotion, local_updated_at: input.syncedAt });
    }
    await completion;
  } finally {
    database.close();
  }
}

export async function syncCashierCatalogAsOperator(): Promise<CashierOperatorCatalogSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_CATALOG_OFFLINE',
      'Internet connection is required to synchronize the cashier catalog',
      0,
    );
  }
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  const response = await fetch('/api/cashier/operator/catalog-snapshot', {
    headers: operatorHeaders(session),
  });
  const payload = (await responsePayload(response)) as OperatorCatalogSnapshot;
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload as Record<string, unknown>,
      'CASHIER_OPERATOR_CATALOG_FAILED',
      'Could not synchronize cashier catalog',
    );
  }
  const merchantId = String(payload.merchant_id || '').trim();
  if (merchantId !== session.context.merchant_id) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_TENANT_MISMATCH',
      'Cashier catalog belongs to a different merchant',
      403,
    );
  }
  const context = payload.context as CatalogCommerceContext;
  const products = Array.isArray(payload.products)
    ? (payload.products as OperatorCatalogProduct[])
    : [];
  const promotions = Array.isArray(payload.promotions)
    ? (payload.promotions as CatalogPromotion[])
    : [];
  if (!context?.currency_code || !Number.isInteger(context.currency_fraction_digits)) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_CONTEXT_INVALID',
      'Cashier commerce context is invalid',
      409,
    );
  }
  // Catalog still exposes the compatibility field `price_iqd`. Keep the same
  // fail-closed currency cutover rule until that canonical field is generic.
  if (context.currency_code !== 'IQD' || context.currency_fraction_digits !== 0) {
    throw new CashierOperatorClientError(
      'CASHIER_CLOUD_CURRENCY_NOT_CUT_OVER',
      'Cashier cloud sync currently supports IQD catalog prices only',
      409,
    );
  }
  const identity = await getOrCreateIdentity();
  if (identity.cloud_merchant_id && identity.cloud_merchant_id !== merchantId) {
    throw new CashierOperatorClientError(
      'CASHIER_DEVICE_MERCHANT_MISMATCH',
      'This cashier device is bound to another merchant',
      409,
    );
  }
  const projections = products.map(product => {
    if (product.merchant_id !== merchantId) {
      throw new CashierOperatorClientError(
        'CASHIER_OPERATOR_TENANT_MISMATCH',
        'Cashier catalog contains cross-merchant data',
        403,
      );
    }
    return localItemsFromProduct(product, context);
  });
  const items = projections.flatMap(item => item.items);
  const evidence = projections.flatMap(item => item.evidence);
  assertUniqueLookupValues(items);
  const localPromotions = promotions.map(promotion => {
    if (promotion.merchant_id !== merchantId) {
      throw new CashierOperatorClientError(
        'CASHIER_OPERATOR_TENANT_MISMATCH',
        'Cashier promotions contain cross-merchant data',
        403,
      );
    }
    return localPromotion(promotion, identity.local_merchant_id, context.currency_code);
  });
  const authority = await localAuthority(identity);
  let preserveLocalInventory = false;
  try {
    preserveLocalInventory = (await authority.listPendingSync(1)).length > 0;
  } finally {
    await authority.close().catch(() => undefined);
  }
  const syncedAt = new Date().toISOString();
  await replaceLocalCommerceSnapshot({
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
    items,
    promotions: localPromotions,
    preserveLocalInventory,
    syncedAt,
  });
  await replaceCostEvidence(evidence);
  await writeIdentity({
    ...identity,
    cloud_merchant_id: merchantId,
    cloud_bound_at: identity.cloud_bound_at || syncedAt,
    last_catalog_sync_at: syncedAt,
  });
  return {
    merchant_id: merchantId,
    currency_code: context.currency_code,
    product_count: products.length,
    local_item_count: items.length,
    promotion_count: localPromotions.length,
    preserve_local_inventory: preserveLocalInventory,
    synced_at: syncedAt,
  };
}

function groupPending(
  envelopes: CashierSyncEnvelope[],
): Array<{ operationId: string; deviceSequence: number; envelopes: CashierSyncEnvelope[] }> {
  const grouped = new Map<string, CashierSyncEnvelope[]>();
  for (const envelope of envelopes) {
    const operationId = String(envelope.operation_id || '').trim();
    if (!operationId) continue;
    const list = grouped.get(operationId) || [];
    list.push(envelope);
    grouped.set(operationId, list);
  }
  return [...grouped.entries()]
    .map(([operationId, items]) => ({
      operationId,
      deviceSequence: Math.min(...items.map(item => Number(item.device_sequence))),
      envelopes: items,
    }))
    .sort(
      (left, right) =>
        left.deviceSequence - right.deviceSequence ||
        left.operationId.localeCompare(right.operationId),
    );
}

function classifyOperation(
  envelopes: CashierSyncEnvelope[],
): CashierOperationBinding['operation_kind'] | null {
  const sale = envelopes.filter(
    item => item.entity_type === 'sale' && item.operation === 'append',
  );
  const returns = envelopes.filter(
    item => item.entity_type === 'return' && item.operation === 'append',
  );
  const voids = envelopes.filter(
    item => item.entity_type === 'sale' && item.operation === 'void',
  );
  if (sale.length === 1 && returns.length === 0 && voids.length === 0) return 'sale';
  if (sale.length === 0 && returns.length === 1 && voids.length === 0) return 'return';
  if (sale.length === 0 && returns.length === 0 && voids.length === 1) return 'void';
  return null;
}

async function enrichSaleCostEvidence(input: {
  merchantId: string;
  envelopes: CashierSyncEnvelope[];
}): Promise<CashierSyncEnvelope[]> {
  return Promise.all(
    input.envelopes.map(async envelope => {
      if (envelope.entity_type !== 'sale' || envelope.operation !== 'append') {
        return envelope;
      }
      const payload =
        envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload)
          ? { ...(envelope.payload as Record<string, unknown>) }
          : {};
      if (!Array.isArray(payload.lines)) {
        throw new CashierOperatorClientError(
          'CASHIER_COST_EVIDENCE_MISSING',
          'Cashier sale lines are missing protected cost evidence identity',
          409,
        );
      }
      payload.lines = await Promise.all(
        payload.lines.map(async value => {
          const line =
            value && typeof value === 'object' && !Array.isArray(value)
              ? { ...(value as Record<string, unknown>) }
              : {};
          const productId = String(line.product_id || '').trim();
          const variantId = String(line.variant_id || '').trim() || undefined;
          const catalogVersion = Number(line.catalog_version);
          if (!productId || !Number.isSafeInteger(catalogVersion) || catalogVersion <= 0) {
            throw new CashierOperatorClientError(
              'CASHIER_COST_EVIDENCE_MISSING',
              'Cashier sale line catalog identity is incomplete',
              409,
            );
          }
          const token = await getCostEvidence({
            merchantId: input.merchantId,
            productId,
            ...(variantId ? { variantId } : {}),
            catalogVersion,
          });
          if (!token) {
            throw new CashierOperatorClientError(
              'CASHIER_COST_EVIDENCE_MISSING',
              'Protected cashier cost evidence is unavailable for this sale line',
              409,
            );
          }
          delete line.unit_cost_minor;
          line.cost_evidence = token;
          return line;
        }),
      );
      return { ...envelope, payload } as CashierSyncEnvelope;
    }),
  );
}

async function uploadOperatorOperation(input: {
  session: CashierOperatorSession;
  kind: CashierOperationBinding['operation_kind'];
  identity: CashierDeviceIdentity;
  operationId: string;
  deviceSequence: number;
  envelopes: CashierSyncEnvelope[];
}): Promise<{ replayed: boolean }> {
  const endpoint =
    input.kind === 'sale'
      ? '/api/cashier/operator/sync/sale'
      : input.kind === 'return'
        ? '/api/cashier/operator/sync/return'
        : '/api/cashier/operator/sync/void';
  const envelopes =
    input.kind === 'sale'
      ? await enrichSaleCostEvidence({
          merchantId: input.session.context.merchant_id,
          envelopes: input.envelopes,
        })
      : input.envelopes;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: operatorHeaders(input.session),
      body: JSON.stringify({
        cloud_merchant_id: input.session.context.merchant_id,
        local_merchant_id: input.identity.local_merchant_id,
        device_id: input.identity.device_id,
        device_sequence: input.deviceSequence,
        operation_id: input.operationId,
        envelopes,
      }),
    });
  } catch {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_SYNC_NETWORK_FAILED',
      'Could not reach Fawri cashier sync service',
      0,
    );
  }
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_OPERATOR_SYNC_FAILED',
      'Cashier operator sync failed',
    );
  }
  if (
    String(payload.operation_id || '') !== input.operationId ||
    Number(payload.device_sequence) !== input.deviceSequence ||
    !String(payload.order_id || '').trim()
  ) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_ACK_INVALID',
      'Fawri returned an invalid cashier sync acknowledgement',
      response.status,
    );
  }
  const expectedEntityIds = new Set(envelopes.map(item => item.entity_id));
  const accepted = new Set(
    Array.isArray(payload.accepted_entity_ids)
      ? payload.accepted_entity_ids.map(value => String(value))
      : [],
  );
  if (
    expectedEntityIds.size !== accepted.size ||
    [...expectedEntityIds].some(id => !accepted.has(id))
  ) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_ACK_INVALID',
      'Fawri did not acknowledge the complete cashier operation',
      response.status,
    );
  }
  return { replayed: payload.replayed === true };
}

export async function syncCashierOutboxAsOperator(): Promise<CashierOperatorOutboxSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_SYNC_OFFLINE',
      'Internet connection is required to upload pending cashier operations',
      0,
    );
  }
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  const identity = await getOrCreateIdentity();
  const authority = await localAuthority(identity);
  try {
    const pending = await authority.listPendingSync(MAX_PENDING_ENVELOPES);
    const operations = groupPending(pending);
    let uploadedOperations = 0;
    let replayedOperations = 0;
    let skippedOperations = 0;
    let acknowledgedOperations = 0;

    for (const operation of operations) {
      const kind = classifyOperation(operation.envelopes);
      if (!kind) {
        skippedOperations += 1;
        continue;
      }
      const binding = await getCashierOperationBinding(operation.operationId);
      assertOperationBinding(session, binding, kind);
      const result = await uploadOperatorOperation({
        session,
        kind,
        identity,
        operationId: operation.operationId,
        deviceSequence: operation.deviceSequence,
        envelopes: operation.envelopes,
      });
      if (result.replayed) replayedOperations += 1;
      else uploadedOperations += 1;
      await authority.acknowledgeSynced([operation.operationId]);
      acknowledgedOperations += 1;
    }
    const pendingAfter = await authority.listPendingSync(MAX_PENDING_ENVELOPES);
    return {
      pending_before: pending.length,
      uploaded_operations: uploadedOperations,
      replayed_operations: replayedOperations,
      skipped_operations: skippedOperations,
      acknowledged_operations: acknowledgedOperations,
      pending_after: pendingAfter.length,
    };
  } finally {
    await authority.close().catch(() => undefined);
  }
}
