import type { CashierSaleSnapshot } from './cashierLocalContracts';
import {
  buildCashierSalesReport,
  type CashierSalesReport,
  type CashierSalesReportOptions,
} from './cashierSalesReportRuntime';
import {
  getCashierOperationBindings,
  type CashierOperationBinding,
} from './cashierOperatorLocalSecurity';
import {
  cashierOperatorCan,
  getCashierOperatorSession,
  getOrCreateCashierDeviceIdentity,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';

const SALES_STORE = 'sales';
const MAX_REPORT_SALES = 50_000;

export type CashierOperatorReportRuntimeResult = {
  report: CashierSalesReport;
  source: 'local_cashier';
  sales_scanned: number;
  generated_at: string;
  can_view_profit: boolean;
};

export type CashierOperatorReportsRuntime = {
  localMerchantId: string;
  buildReport(
    options?: CashierSalesReportOptions,
  ): Promise<CashierOperatorReportRuntimeResult>;
  close(): Promise<void>;
};

export class CashierOperatorReportsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierOperatorReportsError';
    this.code = code;
  }
}

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

function instant(value: string | Date | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_INVALID_RANGE',
      'Cashier report range is invalid',
    );
  }
  return date.toISOString();
}

async function readSales(
  database: IDBDatabase,
  options: CashierSalesReportOptions,
): Promise<CashierSaleSnapshot[]> {
  if (!database.objectStoreNames.contains(SALES_STORE)) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_SALES_STORE_MISSING',
      'Cashier sales store is unavailable',
    );
  }
  const lower = instant(options.from, '0000-01-01T00:00:00.000Z');
  const upper = instant(options.to, '9999-12-31T23:59:59.999Z');
  if (lower >= upper) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_INVALID_RANGE',
      'Cashier report range is invalid',
    );
  }
  const transaction = database.transaction(SALES_STORE, 'readonly');
  const index = transaction.objectStore(SALES_STORE).index('occurred_at');
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

function bindingVisible(
  session: CashierOperatorSession,
  binding: CashierOperationBinding | undefined,
): boolean {
  if (!binding) return false;
  if (
    binding.merchant_id !== session.context.merchant_id ||
    binding.station_id !== session.context.station_id ||
    binding.device_id !== session.context.device_id
  ) {
    return false;
  }
  if (cashierOperatorCan(session, 'sale.view_all')) return true;
  return (
    cashierOperatorCan(session, 'sale.view_own') &&
    binding.staff_id === session.context.staff_id &&
    binding.shift_id === session.context.shift_id
  );
}

function redactProfit(report: CashierSalesReport): CashierSalesReport {
  return {
    ...report,
    by_currency: report.by_currency.map((currency) => ({
      ...currency,
      profit_status: 'unavailable' as const,
      gross_profit_minor: undefined,
      cost_known_net_units: 0,
      cost_unknown_net_units: currency.net_units,
    })),
  };
}

export async function createCashierOperatorReportsRuntime(): Promise<CashierOperatorReportsRuntime> {
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
    );
  }
  if (!cashierOperatorCan(session, 'reports.sales')) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_PERMISSION_REQUIRED',
      'Sales report permission is required',
    );
  }
  if (
    !cashierOperatorCan(session, 'sale.view_own') &&
    !cashierOperatorCan(session, 'sale.view_all')
  ) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_PERMISSION_REQUIRED',
      'Sale visibility permission is required for reports',
    );
  }

  const identity = await getOrCreateCashierDeviceIdentity();
  if (
    identity.cloud_merchant_id !== session.context.merchant_id ||
    identity.device_id !== session.context.device_id
  ) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_DEVICE_MISMATCH',
      'Cashier report device does not match active station',
    );
  }
  const database = await openDatabase(
    `fawri-cashier-${identity.local_merchant_id}-v1`,
  );
  if (!database.objectStoreNames.contains(SALES_STORE)) {
    database.close();
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_SALES_STORE_MISSING',
      'Cashier sales store is unavailable',
    );
  }
  const canViewProfit = cashierOperatorCan(session, 'reports.profit');

  return {
    localMerchantId: identity.local_merchant_id,
    async buildReport(options = {}) {
      const allSales = await readSales(database, options);
      const bindings = await getCashierOperationBindings(
        allSales.map((sale) => sale.operation_id),
      );
      const visibleSales = allSales.filter((sale) =>
        bindingVisible(session, bindings.get(sale.operation_id)),
      );
      const report = buildCashierSalesReport(visibleSales, options);
      return {
        report: canViewProfit ? report : redactProfit(report),
        source: 'local_cashier',
        sales_scanned: visibleSales.length,
        generated_at: new Date().toISOString(),
        can_view_profit: canViewProfit,
      };
    },
    async close() {
      database.close();
    },
  };
}
