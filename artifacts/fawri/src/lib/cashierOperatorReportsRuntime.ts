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
  cashierOperatorHeaders,
  getCashierOperatorSession,
  getOrCreateCashierDeviceIdentity,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';

const SALES_STORE = 'sales';
const MAX_REPORT_SALES = 50_000;

export type CashierOperatorReportRuntimeResult = {
  report: CashierSalesReport;
  source: 'local_cashier' | 'server_cashier';
  scope?: 'own_staff' | 'station';
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
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierOperatorReportsError';
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function instant(value: string | Date | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_INVALID_RANGE',
      `Cashier report ${field} is invalid`,
    );
  }
  return date.toISOString();
}

function normalizedRange(options: CashierSalesReportOptions): {
  from?: string;
  to?: string;
} {
  const from = instant(options.from, 'from');
  const to = instant(options.to, 'to');
  if (from && to && from >= to) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_INVALID_RANGE',
      'Cashier report range is invalid',
    );
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

async function readSales(database: IDBDatabase): Promise<CashierSaleSnapshot[]> {
  if (!database.objectStoreNames.contains(SALES_STORE)) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_SALES_STORE_MISSING',
      'Cashier sales store is unavailable',
    );
  }
  const transaction = database.transaction(SALES_STORE, 'readonly');
  const index = transaction.objectStore(SALES_STORE).index('occurred_at');
  return new Promise<CashierSaleSnapshot[]>((resolve, reject) => {
    const sales: CashierSaleSnapshot[] = [];
    const request = index.openCursor(null, 'prev');
    request.onerror = () => reject(request.error || new Error('CASHIER_REPORT_READ_FAILED'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(sales);
        return;
      }
      if (sales.length >= MAX_REPORT_SALES) {
        reject(
          new CashierOperatorReportsError(
            'CASHIER_REPORT_LOCAL_LIMIT_EXCEEDED',
            'Local cashier report contains too many sales',
          ),
        );
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
    binding.staff_id === session.context.staff_id
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
      cost_unknown_net_units: 0,
    })),
  };
}

function reportShape(value: unknown): CashierSalesReport {
  const raw = record(value);
  if (!Number.isSafeInteger(Number(raw.sale_count)) || !Array.isArray(raw.by_currency)) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_REPORT_INVALID',
      'Cashier server report response is invalid',
    );
  }
  return raw as unknown as CashierSalesReport;
}

async function serverReport(
  session: CashierOperatorSession,
  options: CashierSalesReportOptions,
): Promise<CashierOperatorReportRuntimeResult | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const range = normalizedRange(options);
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';

  let response: Response;
  try {
    response = await fetch(`/api/cashier/operator/report${suffix}`, {
      headers: cashierOperatorHeaders(session),
      cache: 'no-store',
    });
  } catch (cause) {
    // A transport failure may use the permission-scoped local projection. HTTP
    // authorization/evidence failures never downgrade to a local success.
    if (cause instanceof TypeError) return null;
    throw cause;
  }
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw new CashierOperatorReportsError(
      String(payload.code || 'CASHIER_OPERATOR_REPORT_FAILED'),
      String(payload.error || 'Could not load cashier server report'),
      response.status,
    );
  }
  if (
    payload.source !== 'server_cashier' ||
    typeof payload.can_view_profit !== 'boolean' ||
    !Number.isSafeInteger(Number(payload.sales_scanned)) ||
    !Number.isFinite(new Date(String(payload.generated_at || '')).getTime())
  ) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_REPORT_INVALID',
      'Cashier server report response is invalid',
    );
  }
  const scope = payload.scope;
  if (scope !== 'own_staff' && scope !== 'station') {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_REPORT_INVALID',
      'Cashier server report scope is invalid',
    );
  }
  return {
    report: reportShape(payload.report),
    source: 'server_cashier',
    scope,
    sales_scanned: Number(payload.sales_scanned),
    generated_at: String(payload.generated_at),
    can_view_profit: payload.can_view_profit,
  };
}

function assertReportPermissions(session: CashierOperatorSession): void {
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
}

export async function createCashierOperatorReportsRuntime(): Promise<CashierOperatorReportsRuntime> {
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorReportsError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
    );
  }
  assertReportPermissions(session);

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

  return {
    localMerchantId: identity.local_merchant_id,
    async buildReport(options = {}) {
      const currentSession = await getCashierOperatorSession();
      if (!currentSession) {
        throw new CashierOperatorReportsError(
          'CASHIER_OPERATOR_LOGIN_REQUIRED',
          'Cashier operator login is required',
        );
      }
      if (!cashierOperatorCan(currentSession, 'reports.sales')) {
        throw new CashierOperatorReportsError(
          'CASHIER_OPERATOR_PERMISSION_REQUIRED',
          'Sales report permission is required',
        );
      }
      if (
        !cashierOperatorCan(currentSession, 'sale.view_own') &&
        !cashierOperatorCan(currentSession, 'sale.view_all')
      ) {
        throw new CashierOperatorReportsError(
          'CASHIER_OPERATOR_PERMISSION_REQUIRED',
          'Sale visibility permission is required for reports',
        );
      }
      const canViewProfit = cashierOperatorCan(currentSession, 'reports.profit');
      const online = await serverReport(currentSession, options);
      if (online) return online;

      normalizedRange(options);
      const allSales = await readSales(database);
      const bindings = await getCashierOperationBindings(
        allSales.map((sale) => sale.operation_id),
      );
      const visibleSales = allSales.filter((sale) =>
        bindingVisible(currentSession, bindings.get(sale.operation_id)),
      );
      const report = buildCashierSalesReport(visibleSales, options);
      return {
        report: canViewProfit ? report : redactProfit(report),
        source: 'local_cashier',
        scope: cashierOperatorCan(currentSession, 'sale.view_all') ? 'station' : 'own_staff',
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
