import { IndexedDbCashierAuthority, type IndexedDbCashierConfig } from './cashierIndexedDbAuthority';
import { IndexedDbCashierCompensationAuthority } from './cashierCompensationAuthority';
import { syncCashierOutboxToCloud, type CashierCloudOutboxSyncResult } from './cashierCloudOutboxSync';
import type {
  CashierReturnSaleInput,
  CashierReturnSaleResult,
  CashierSaleSnapshot,
  CashierSyncEnvelope,
  CashierVoidSaleInput,
  CashierVoidSaleResult,
} from './cashierLocalContracts';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const MAX_HISTORY_SALES = 200;
const MAX_PENDING_ENVELOPES = 1000;

type CashierDeviceIdentity = {
  id: 'default';
  local_merchant_id: string;
  device_id: string;
  created_at: string;
  cloud_merchant_id?: string;
  cloud_bound_at?: string;
  last_catalog_sync_at?: string;
};

export type CashierHistorySnapshot = {
  sales: CashierSaleSnapshot[];
  pending_operation_ids: string[];
};

export type CashierHistoryRuntime = {
  localMerchantId: string;
  cloudMerchantId?: string;
  deviceId: string;
  snapshot(limit?: number): Promise<CashierHistorySnapshot>;
  returnSale(input: CashierReturnSaleInput): Promise<CashierReturnSaleResult>;
  voidSale(input: CashierVoidSaleInput): Promise<CashierVoidSaleResult>;
  syncPending(): Promise<CashierCloudOutboxSyncResult>;
  close(): Promise<void>;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function openBootstrapDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable');
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BOOTSTRAP_DATABASE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier bootstrap database'));
  });
}

async function readIdentity(): Promise<CashierDeviceIdentity> {
  const database = await openBootstrapDatabase();
  try {
    if (!database.objectStoreNames.contains(BOOTSTRAP_STORE)) {
      throw new Error('Cashier device is not initialized');
    }
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readonly');
    const identity = (await requestResult(
      transaction.objectStore(BOOTSTRAP_STORE).get('default'),
    )) as CashierDeviceIdentity | undefined;
    if (!identity?.local_merchant_id || !identity.device_id) {
      throw new Error('Cashier device identity is incomplete');
    }
    return identity;
  } finally {
    database.close();
  }
}

function pendingOperationIds(envelopes: CashierSyncEnvelope[]): string[] {
  return [...new Set(
    envelopes
      .map(item => String(item.operation_id || '').trim())
      .filter(Boolean),
  )].sort();
}

export async function createCashierHistoryRuntime(): Promise<CashierHistoryRuntime> {
  const identity = await readIdentity();
  const databaseName = `fawri-cashier-${identity.local_merchant_id}-v1`;
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    ...(identity.cloud_merchant_id ? { cloudMerchantId: identity.cloud_merchant_id } : {}),
    deviceId: identity.device_id,
    databaseName,
  };
  const localAuthority = new IndexedDbCashierAuthority(config);
  const compensationAuthority = new IndexedDbCashierCompensationAuthority(config);

  await localAuthority.getCatalogItem('__fawri_history_schema_probe__');

  return {
    localMerchantId: identity.local_merchant_id,
    cloudMerchantId: identity.cloud_merchant_id,
    deviceId: identity.device_id,
    async snapshot(limit = 80) {
      const safeLimit = Math.max(1, Math.min(MAX_HISTORY_SALES, Math.trunc(limit)));
      const [sales, pending] = await Promise.all([
        localAuthority.listSales(safeLimit),
        localAuthority.listPendingSync(MAX_PENDING_ENVELOPES),
      ]);
      return {
        sales,
        pending_operation_ids: pendingOperationIds(pending),
      };
    },
    returnSale(input) {
      return compensationAuthority.returnSale(input);
    },
    voidSale(input) {
      return compensationAuthority.voidSale(input);
    },
    syncPending() {
      return syncCashierOutboxToCloud();
    },
    async close() {
      await Promise.all([
        localAuthority.close().catch(() => undefined),
        compensationAuthority.close().catch(() => undefined),
      ]);
    },
  };
}
