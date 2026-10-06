const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const ENTITLEMENT_RECORD_ID = 'cashier-entitlement-authority-v1';
const CLOCK_ROLLBACK_TOLERANCE_MS = 2 * 60 * 1000;

export type CashierCachedEntitlementState = 'active' | 'grace';

export type CashierCachedEntitlementAuthority = {
  id: typeof ENTITLEMENT_RECORD_ID;
  merchant_id: string;
  station_id: string;
  subscription_id: string;
  state: CashierCachedEntitlementState;
  licensed_seats: number;
  version: number;
  billing_period_end: string;
  grace_until: string;
  server_time: string;
  observed_local_time_ms: number;
  last_local_time_ms: number;
  last_estimated_server_time_ms: number;
};

export type CashierServerEntitlementSnapshot = {
  subscription_id: string;
  merchant_id: string;
  state: string;
  licensed_seats: number;
  billing_period_end?: string;
  grace_until?: string;
  version: number;
  server_time: string;
};

export class CashierOfflineEntitlementError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierOfflineEntitlementError';
    this.code = code;
  }
}

let runtimeAnchor:
  | {
      cachedAtPerformanceMs: number;
      serverTimeMs: number;
      localTimeMs: number;
      merchantId: string;
      stationId: string;
      version: number;
    }
  | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function openBootstrapDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new CashierOfflineEntitlementError(
        'CASHIER_ENTITLEMENT_STORAGE_UNAVAILABLE',
        'Cashier entitlement storage is unavailable',
      ),
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
    request.onerror = () =>
      reject(request.error || new Error('Could not open cashier bootstrap database'));
  });
}

function requiredText(value: unknown): string {
  return String(value || '').normalize('NFKC').trim();
}

function instantMs(value: unknown): number {
  const result = new Date(String(value || '')).getTime();
  return Number.isFinite(result) ? result : Number.NaN;
}

function positiveSafeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validAuthority(value: unknown): CashierCachedEntitlementAuthority | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<CashierCachedEntitlementAuthority>;
  if (row.id !== ENTITLEMENT_RECORD_ID) return null;
  if (
    !requiredText(row.merchant_id) ||
    !requiredText(row.station_id) ||
    !requiredText(row.subscription_id) ||
    (row.state !== 'active' && row.state !== 'grace') ||
    !positiveSafeInteger(row.licensed_seats) ||
    !positiveSafeInteger(row.version)
  ) {
    return null;
  }
  const billingEnd = instantMs(row.billing_period_end);
  const graceUntil = instantMs(row.grace_until);
  const serverTime = instantMs(row.server_time);
  if (
    !Number.isFinite(billingEnd) ||
    !Number.isFinite(graceUntil) ||
    !Number.isFinite(serverTime) ||
    graceUntil <= billingEnd
  ) {
    return null;
  }
  for (const value of [
    row.observed_local_time_ms,
    row.last_local_time_ms,
    row.last_estimated_server_time_ms,
  ]) {
    if (!Number.isFinite(value) || Number(value) < 0) return null;
  }
  return row as CashierCachedEntitlementAuthority;
}

async function readAuthority(): Promise<CashierCachedEntitlementAuthority | null> {
  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readonly');
    const value = await requestResult(
      transaction.objectStore(BOOTSTRAP_STORE).get(ENTITLEMENT_RECORD_ID),
    );
    return validAuthority(value);
  } finally {
    database.close();
  }
}

export async function clearCashierEntitlementAuthority(): Promise<void> {
  runtimeAnchor = undefined;
  const database = await openBootstrapDatabase().catch(() => null);
  if (!database) return;
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    transaction.objectStore(BOOTSTRAP_STORE).delete(ENTITLEMENT_RECORD_ID);
    await completion;
  } finally {
    database.close();
  }
}

export async function persistCashierEntitlementAuthority(input: {
  snapshot: CashierServerEntitlementSnapshot;
  stationId: string;
}): Promise<CashierCachedEntitlementAuthority> {
  const snapshot = input.snapshot;
  const merchantId = requiredText(snapshot.merchant_id);
  const stationId = requiredText(input.stationId);
  const subscriptionId = requiredText(snapshot.subscription_id);
  const seats = positiveSafeInteger(snapshot.licensed_seats);
  const version = positiveSafeInteger(snapshot.version);
  const serverTimeMs = instantMs(snapshot.server_time);
  const billingEndMs = instantMs(snapshot.billing_period_end);
  const graceUntilMs = instantMs(snapshot.grace_until);
  if (
    !merchantId ||
    !stationId ||
    !subscriptionId ||
    (snapshot.state !== 'active' && snapshot.state !== 'grace') ||
    !seats ||
    !version ||
    !Number.isFinite(serverTimeMs) ||
    !Number.isFinite(billingEndMs) ||
    !Number.isFinite(graceUntilMs) ||
    graceUntilMs <= billingEndMs ||
    serverTimeMs >= graceUntilMs
  ) {
    throw new CashierOfflineEntitlementError(
      'CASHIER_ENTITLEMENT_SNAPSHOT_INVALID',
      'Cashier subscription authority is invalid or no longer permits sales',
    );
  }

  const nowLocal = Date.now();
  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(BOOTSTRAP_STORE);
    const existing = validAuthority(await requestResult(store.get(ENTITLEMENT_RECORD_ID)));
    if (
      existing &&
      existing.merchant_id === merchantId &&
      existing.station_id === stationId &&
      (existing.version > version ||
        (existing.version === version &&
          instantMs(existing.server_time) > serverTimeMs))
    ) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new CashierOfflineEntitlementError(
        'CASHIER_ENTITLEMENT_STALE_SNAPSHOT',
        'A stale cashier subscription authority cannot replace a newer one',
      );
    }

    const authority: CashierCachedEntitlementAuthority = {
      id: ENTITLEMENT_RECORD_ID,
      merchant_id: merchantId,
      station_id: stationId,
      subscription_id: subscriptionId,
      state: snapshot.state,
      licensed_seats: seats,
      version,
      billing_period_end: new Date(billingEndMs).toISOString(),
      grace_until: new Date(graceUntilMs).toISOString(),
      server_time: new Date(serverTimeMs).toISOString(),
      observed_local_time_ms: nowLocal,
      last_local_time_ms: nowLocal,
      last_estimated_server_time_ms: serverTimeMs,
    };
    store.put(authority);
    await completion;
    runtimeAnchor =
      typeof performance !== 'undefined'
        ? {
            cachedAtPerformanceMs: performance.now(),
            serverTimeMs,
            localTimeMs: nowLocal,
            merchantId,
            stationId,
            version,
          }
        : undefined;
    return authority;
  } finally {
    database.close();
  }
}

function estimatedServerNow(authority: CashierCachedEntitlementAuthority): number {
  const nowLocal = Date.now();
  if (nowLocal + CLOCK_ROLLBACK_TOLERANCE_MS < authority.last_local_time_ms) {
    throw new CashierOfflineEntitlementError(
      'CASHIER_DEVICE_CLOCK_ROLLBACK',
      'Cashier device clock moved backwards; reconnect to refresh subscription authority',
    );
  }

  const wallElapsed = Math.max(0, nowLocal - authority.observed_local_time_ms);
  let runtimeElapsed = 0;
  if (
    runtimeAnchor &&
    runtimeAnchor.merchantId === authority.merchant_id &&
    runtimeAnchor.stationId === authority.station_id &&
    runtimeAnchor.version === authority.version &&
    typeof performance !== 'undefined'
  ) {
    runtimeElapsed = Math.max(0, performance.now() - runtimeAnchor.cachedAtPerformanceMs);
  }
  return Math.max(
    instantMs(authority.server_time) + wallElapsed,
    runtimeAnchor ? runtimeAnchor.serverTimeMs + runtimeElapsed : 0,
    authority.last_estimated_server_time_ms,
  );
}

export async function assertCashierSaleEntitlementFromCache(input: {
  merchantId: string;
  stationId: string;
}): Promise<CashierCachedEntitlementAuthority> {
  const merchantId = requiredText(input.merchantId);
  const stationId = requiredText(input.stationId);
  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(BOOTSTRAP_STORE);
    const authority = validAuthority(
      await requestResult(store.get(ENTITLEMENT_RECORD_ID)),
    );
    if (
      !authority ||
      authority.merchant_id !== merchantId ||
      authority.station_id !== stationId
    ) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new CashierOfflineEntitlementError(
        'CASHIER_ENTITLEMENT_REFRESH_REQUIRED',
        'Cashier subscription authority must be refreshed online before sales can continue',
      );
    }

    const estimatedNow = estimatedServerNow(authority);
    const graceUntilMs = instantMs(authority.grace_until);
    if (!Number.isFinite(graceUntilMs) || estimatedNow >= graceUntilMs) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new CashierOfflineEntitlementError(
        'CASHIER_SUBSCRIPTION_RESTRICTED',
        'Cashier subscription grace period has ended; renewal is required',
      );
    }

    const updated: CashierCachedEntitlementAuthority = {
      ...authority,
      state:
        estimatedNow >= instantMs(authority.billing_period_end) ? 'grace' : 'active',
      last_local_time_ms: Date.now(),
      last_estimated_server_time_ms: estimatedNow,
    };
    store.put(updated);
    await completion;
    return updated;
  } finally {
    database.close();
  }
}
