import type { CashierSaleSnapshot } from './cashierLocalContracts';
import {
  buildCashierSalesReport,
  type CashierSalesReport,
  type CashierSalesReportOptions,
} from './cashierSalesReportRuntime';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const SALES_STORE = 'sales';
const MAX_REPORT_SALES = 50_000;

type CashierDeviceIdentity = {
  id: 'default';
  local_merchant_id: string;
  device_id: string;
};

export type CashierReportRuntimeResult = {
  report: CashierSalesReport;
  source: 'local_cashier';
  sales_scanned: number;
  generated_at: string;
};

export type CashierReportsRuntime = {
  localMerchantId: string;
  buildReport(options?: CashierSalesReportOptions): Promise<CashierReportRuntimeResult>;
  close(): Promise<void>;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier database'));
  });
}

async function readIdentity(): Promise<CashierDeviceIdentity> {
  if (typeof indexedDB === 'undefined') throw new Error('CASHIER_REPORT_INDEXEDDB_UNAVAILABLE');
  const database = await openDatabase(BOOTSTRAP_DATABASE);
  try {
    if (!database.objectStoreNames.contains(BOOTSTRAP_STORE)) {
      throw new Error('CASHIER_REPORT_IDENTITY_MISSING');
    }
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readonly');
    const identity = (await requestResult(
      transaction.objectStore(BOOTSTRAP_STORE).get('default'),
    )) as CashierDeviceIdentity | undefined;
    if (!identity?.local_merchant_id || !identity.device_id) {
      throw new Error('CASHIER_REPORT_IDENTITY_MISSING');
    }
    return identity;
  } finally {
    database.close();
  }
}

function instant(value: string | Date | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('CASHIER_REPORT_INVALID_RANGE');
  return date.toISOString();
}

export async function readCashierReportSales(
  database: IDBDatabase,
  options: CashierSalesReportOptions,
): Promise<CashierSaleSnapshot[]> {
  if (!database.objectStoreNames.contains(SALES_STORE)) {
    throw new Error('CASHIER_REPORT_SALES_STORE_MISSING');
  }
  const transaction = database.transaction(SALES_STORE, 'readonly');
  const store = transaction.objectStore(SALES_STORE);
  const index = store.index('occurred_at');
  const lower = instant(options.from, '0000-01-01T00:00:00.000Z');
  const upper = instant(options.to, '9999-12-31T23:59:59.999Z');
  if (lower >= upper) throw new Error('CASHIER_REPORT_INVALID_RANGE');
  const range = IDBKeyRange.bound(lower, upper, false, true);

  return new Promise<CashierSaleSnapshot[]>((resolve, reject) => {
    const sales: CashierSaleSnapshot[] = [];
    const request = index.openCursor(range, 'prev');
    request.onerror = () => reject(request.error || new Error('CASHIER_REPORT_READ_FAILED'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(sales);
        return;
      }
      if (sales.length >= MAX_REPORT_SALES) {
        reject(new Error('CASHIER_REPORT_LOCAL_LIMIT_EXCEEDED'));
        return;
      }
      sales.push(cursor.value as CashierSaleSnapshot);
      cursor.continue();
    };
  });
}

export async function createCashierReportsRuntime(): Promise<CashierReportsRuntime> {
  const identity = await readIdentity();
  const databaseName = `fawri-cashier-${identity.local_merchant_id}-v1`;
  const database = await openDatabase(databaseName);
  if (!database.objectStoreNames.contains(SALES_STORE)) {
    database.close();
    throw new Error('CASHIER_REPORT_SALES_STORE_MISSING');
  }

  return {
    localMerchantId: identity.local_merchant_id,
    async buildReport(options = {}) {
      const sales = await readCashierReportSales(database, options);
      return {
        report: buildCashierSalesReport(sales, options),
        source: 'local_cashier',
        sales_scanned: sales.length,
        generated_at: new Date().toISOString(),
      };
    },
    async close() {
      database.close();
    },
  };
}
