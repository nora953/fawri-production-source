import type {
  IndexedDbCashierAuthority,
  IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';

const OPERATOR_LOCAL_DATABASE = 'fawri-cashier-operator-local-v1';
const OPERATOR_LOCAL_VERSION = 3;
const COST_EVIDENCE_STORE = 'cost_evidence';
const OPERATION_BINDING_STORE = 'operation_bindings';
const CATALOG_STORE = 'catalog';
const SALES_STORE = 'sales';
const MAX_PENDING_ENVELOPES = 1000;

export type CashierLocalDeviceIdentity = {
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
};

export type CashierOperationBinding = {
  operation_id: string;
  operation_kind: 'sale' | 'return' | 'void' | 'inventory_adjustment';
  merchant_id: string;
  station_id: string;
  location_id: string;
  staff_id: string;
  shift_id: string;
  device_id: string;
  bound_at: string;
};

export type CashierCostEvidenceRecord = {
  key: string;
  merchant_id: string;
  product_id: string;
  variant_id: string;
  catalog_version: number;
  token: string;
  stored_at: string;
};

export class CashierOperatorLocalSecurityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierOperatorLocalSecurityError';
    this.code = code;
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

function openOperatorLocalDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierOperatorLocalSecurityError(
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
      let bindingStore: IDBObjectStore;
      if (!database.objectStoreNames.contains(OPERATION_BINDING_STORE)) {
        bindingStore = database.createObjectStore(OPERATION_BINDING_STORE, {
          keyPath: 'operation_id',
        });
      } else {
        bindingStore = request.transaction!.objectStore(OPERATION_BINDING_STORE);
      }
      if (!bindingStore.indexNames.contains('staff_id')) {
        bindingStore.createIndex('staff_id', 'staff_id', { unique: false });
      }
      if (!bindingStore.indexNames.contains('shift_id')) {
        bindingStore.createIndex('shift_id', 'shift_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier operator local database'));
  });
}

function openExistingCashierDatabase(
  databaseName: string,
): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    let created = false;
    request.onupgradeneeded = () => {
      created = true;
    };
    request.onsuccess = () => {
      if (!created) {
        resolve(request.result);
        return;
      }
      request.result.close();
      const deletion = indexedDB.deleteDatabase(databaseName);
      deletion.onsuccess = () => resolve(null);
      deletion.onerror = () => resolve(null);
      deletion.onblocked = () => resolve(null);
    };
    request.onerror = () => reject(request.error || new Error('Could not open cashier database'));
  });
}

async function localAuthority(
  identity: CashierLocalDeviceIdentity,
): Promise<IndexedDbCashierAuthority> {
  const { IndexedDbCashierAuthority } = await import('./cashierIndexedDbAuthority');
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    ...(identity.cloud_merchant_id
      ? { cloudMerchantId: identity.cloud_merchant_id }
      : {}),
    deviceId: identity.device_id,
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
  };
  const authority = new IndexedDbCashierAuthority(config);
  await authority.getCatalogItem('__fawri_operator_schema_probe__');
  return authority;
}

export async function getCashierPendingEnvelopeCountForIdentity(
  identity: CashierLocalDeviceIdentity,
): Promise<number> {
  const authority = await localAuthority(identity);
  try {
    return (await authority.listPendingSync(MAX_PENDING_ENVELOPES)).length;
  } finally {
    await authority.close().catch(() => undefined);
  }
}

/**
 * Remove raw merchant cost left by the pre-staff cashier implementation.
 * Pairing is blocked while the outbox is non-empty, so this cannot erase cost
 * evidence required by an unsynchronized operation.
 */
export async function scrubCashierRawCostsForIdentity(
  identity: CashierLocalDeviceIdentity,
): Promise<void> {
  const databaseName = `fawri-cashier-${identity.local_merchant_id}-v1`;
  const database = await openExistingCashierDatabase(databaseName);
  if (!database) return;
  try {
    const stores = [CATALOG_STORE, SALES_STORE].filter((name) =>
      database.objectStoreNames.contains(name),
    );
    if (stores.length === 0) return;
    const transaction = database.transaction(stores, 'readwrite');
    const completion = transactionDone(transaction);

    if (stores.includes(CATALOG_STORE)) {
      const catalog = transaction.objectStore(CATALOG_STORE);
      const records = (await requestResult(catalog.getAll())) as Array<
        Record<string, unknown>
      >;
      for (const record of records) {
        if (!Object.prototype.hasOwnProperty.call(record, 'unit_cost_minor')) continue;
        delete record.unit_cost_minor;
        catalog.put(record);
      }
    }

    if (stores.includes(SALES_STORE)) {
      const sales = transaction.objectStore(SALES_STORE);
      const records = (await requestResult(sales.getAll())) as Array<
        Record<string, unknown>
      >;
      for (const sale of records) {
        if (!Array.isArray(sale.lines)) continue;
        let changed = false;
        sale.lines = sale.lines.map((value) => {
          const line =
            value && typeof value === 'object' && !Array.isArray(value)
              ? { ...(value as Record<string, unknown>) }
              : {};
          if (Object.prototype.hasOwnProperty.call(line, 'unit_cost_minor')) {
            delete line.unit_cost_minor;
            changed = true;
          }
          return line;
        });
        if (changed) sales.put(sale);
      }
    }

    await completion;
  } finally {
    database.close();
  }
}

export function cashierCostEvidenceKey(input: {
  merchantId: string;
  productId: string;
  variantId?: string;
  catalogVersion: number;
}): string {
  return `${input.merchantId}\u0000${input.productId}\u0000${input.variantId || ''}\u0000${input.catalogVersion}`;
}

/**
 * Evidence is append/upsert by catalog version, never wholesale-replaced. An
 * offline sale may therefore keep using the exact evidence issued for the
 * catalog version it sold even after later catalog refreshes arrive.
 */
export async function upsertCashierCostEvidence(
  records: CashierCostEvidenceRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(COST_EVIDENCE_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(COST_EVIDENCE_STORE);
    for (const record of records) store.put(record);
    await completion;
  } finally {
    database.close();
  }
}

export async function getCashierCostEvidence(input: {
  merchantId: string;
  productId: string;
  variantId?: string;
  catalogVersion: number;
}): Promise<string | null> {
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(COST_EVIDENCE_STORE, 'readonly');
    const record = (await requestResult(
      transaction
        .objectStore(COST_EVIDENCE_STORE)
        .get(cashierCostEvidenceKey(input)),
    )) as CashierCostEvidenceRecord | undefined;
    return record?.token || null;
  } finally {
    database.close();
  }
}

export async function bindCashierOperation(
  binding: CashierOperationBinding,
): Promise<CashierOperationBinding> {
  const operationId = String(binding.operation_id || '').trim();
  if (!operationId) {
    throw new CashierOperatorLocalSecurityError(
      'CASHIER_OPERATION_ID_REQUIRED',
      'Cashier operation id is required',
    );
  }
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(OPERATION_BINDING_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(OPERATION_BINDING_STORE);
    const existing = (await requestResult(store.get(operationId))) as
      | CashierOperationBinding
      | undefined;
    if (existing) {
      const same =
        existing.operation_kind === binding.operation_kind &&
        existing.merchant_id === binding.merchant_id &&
        existing.station_id === binding.station_id &&
        (!existing.location_id ||
          existing.location_id === binding.location_id) &&
        existing.staff_id === binding.staff_id &&
        existing.shift_id === binding.shift_id &&
        existing.device_id === binding.device_id;
      if (!same) {
        throw new CashierOperatorLocalSecurityError(
          'CASHIER_OPERATION_BINDING_CONFLICT',
          'Cashier operation is already bound to another operator context',
        );
      }
      if (!existing.location_id) {
        const upgraded: CashierOperationBinding = {
          ...existing,
          location_id: binding.location_id,
        };
        store.put(upgraded);
        await completion;
        return upgraded;
      }
      await completion;
      return existing;
    }
    const stored = { ...binding, operation_id: operationId };
    store.put(stored);
    await completion;
    return stored;
  } finally {
    database.close();
  }
}

export async function getCashierOperationBinding(
  operationId: string,
): Promise<CashierOperationBinding | null> {
  const normalized = String(operationId || '').trim();
  if (!normalized) return null;
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(OPERATION_BINDING_STORE, 'readonly');
    return (
      ((await requestResult(
        transaction.objectStore(OPERATION_BINDING_STORE).get(normalized),
      )) as CashierOperationBinding | undefined) || null
    );
  } finally {
    database.close();
  }
}

export async function getCashierOperationBindings(
  operationIds: readonly string[],
): Promise<Map<string, CashierOperationBinding>> {
  const normalized = [
    ...new Set(
      operationIds
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ];
  const result = new Map<string, CashierOperationBinding>();
  if (normalized.length === 0) return result;
  const database = await openOperatorLocalDatabase();
  try {
    const transaction = database.transaction(OPERATION_BINDING_STORE, 'readonly');
    const store = transaction.objectStore(OPERATION_BINDING_STORE);
    const records = await Promise.all(
      normalized.map(
        (operationId) =>
          requestResult(store.get(operationId)) as Promise<
            CashierOperationBinding | undefined
          >,
      ),
    );
    for (const record of records) {
      if (record) result.set(record.operation_id, record);
    }
    return result;
  } finally {
    database.close();
  }
}
