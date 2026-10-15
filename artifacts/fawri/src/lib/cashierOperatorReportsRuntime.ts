import type { CashierSaleSnapshot } from './cashierLocalContracts';
import {
  buildCashierSalesReport,
  type CashierSalesReport,
  type CashierSalesReportOptions,
} from './cashierSalesReportRuntime';
import { getCashierSaleOperationBindingsForReport } from './cashierOperatorLocalSecurity';
import {
  cashierOperatorCan,
  cashierOperatorHeaders,
  getCashierOperatorSession,
  getOrCreateCashierDeviceIdentity,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';

const SALES_STORE = 'sales';
const MAX_REPORT_SALES = 50_000;
const OPERATOR_REPORT_TOP_PRODUCTS = 10;

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

type NormalizedReportRange = {
  from?: string;
  to?: string;
};

function normalizedRange(options: CashierSalesReportOptions): NormalizedReportRange {
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

function timestampInReportRange(
  value: unknown,
  range: NormalizedReportRange,
  field: string,
): boolean {
  const parsed = new Date(String(value || ''));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_LOCAL_EVIDENCE_INVALID',
      `Local cashier ${field} timestamp is invalid`,
    );
  }
  const instant = parsed.toISOString();
  return (!range.from || instant >= range.from) && (!range.to || instant < range.to);
}

export function cashierSaleTouchesReportRange(
  sale: CashierSaleSnapshot,
  range: NormalizedReportRange,
): boolean {
  if (!range.from && !range.to) return true;
  if (timestampInReportRange(sale.occurred_at, range, 'sale')) return true;
  for (const snapshot of sale.returns || []) {
    if (timestampInReportRange(snapshot.occurred_at, range, 'return')) return true;
  }
  return Boolean(
    sale.void &&
      timestampInReportRange(sale.void.occurred_at, range, 'void'),
  );
}

async function readSalesByOperationIds(
  database: IDBDatabase,
  operationIds: readonly string[],
): Promise<Array<CashierSaleSnapshot | undefined>> {
  if (operationIds.length === 0) return [];
  const transaction = database.transaction(SALES_STORE, 'readonly');
  const index = transaction.objectStore(SALES_STORE).index('operation_id');
  return Promise.all(
    operationIds.map(
      (operationId) =>
        requestResult(index.get(operationId)) as Promise<
          CashierSaleSnapshot | undefined
        >,
    ),
  );
}

async function readScopedSalesForRange(input: {
  database: IDBDatabase;
  operationIds: readonly string[];
  range: NormalizedReportRange;
}): Promise<CashierSaleSnapshot[]> {
  if (!input.database.objectStoreNames.contains(SALES_STORE)) {
    throw new CashierOperatorReportsError(
      'CASHIER_REPORT_SALES_STORE_MISSING',
      'Cashier sales store is unavailable',
    );
  }

  const sales: CashierSaleSnapshot[] = [];
  const batchSize = 500;
  for (let offset = 0; offset < input.operationIds.length; offset += batchSize) {
    const batch = await readSalesByOperationIds(
      input.database,
      input.operationIds.slice(offset, offset + batchSize),
    );
    for (const sale of batch) {
      if (!sale || !cashierSaleTouchesReportRange(sale, input.range)) continue;
      sales.push(sale);
      if (sales.length > MAX_REPORT_SALES) {
        throw new CashierOperatorReportsError(
          'CASHIER_REPORT_LOCAL_LIMIT_EXCEEDED',
          'Local cashier report range contains too many affected sales; choose a smaller period',
        );
      }
    }
  }
  return sales;
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

      const range = normalizedRange(options);
      const canViewAll = cashierOperatorCan(currentSession, 'sale.view_all');
      const saleBindings = await getCashierSaleOperationBindingsForReport({
        merchantId: currentSession.context.merchant_id,
        stationId: currentSession.context.station_id,
        deviceId: currentSession.context.device_id,
        ...(!canViewAll ? { staffId: currentSession.context.staff_id } : {}),
      });
      const visibleSales = await readScopedSalesForRange({
        database,
        operationIds: saleBindings.map((binding) => binding.operation_id),
        range,
      });
      const report = buildCashierSalesReport(visibleSales, {
        ...options,
        topProductsLimit: OPERATOR_REPORT_TOP_PRODUCTS,
      });
      return {
        report: canViewProfit ? report : redactProfit(report),
        source: 'local_cashier',
        scope: canViewAll ? 'station' : 'own_staff',
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
