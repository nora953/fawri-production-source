import {
  getCashierStationBinding,
  type CashierOperatorSession,
  type CashierStationBinding,
} from './cashierOperatorSessionRuntime';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const OFFLINE_OPERATOR_RECORD_ID = 'offline-operator-session';
const OPERATOR_STORAGE_KEY = 'fawri.cashier.operator-session.v1';

type OfflineOperatorRecord = {
  id: typeof OFFLINE_OPERATOR_RECORD_ID;
  saved_at: string;
  session: CashierOperatorSession;
};

let installed = false;

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

function openBootstrapDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('CASHIER_INDEXEDDB_UNAVAILABLE'));
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

function validSession(value: unknown): CashierOperatorSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const session = value as CashierOperatorSession;
  if (!session.operator_token || !session.context?.operator_session_id) return null;
  if (
    !session.context.merchant_id ||
    !session.context.station_id ||
    !session.context.device_id ||
    !session.context.station_token ||
    !session.context.staff_id ||
    !session.context.shift_id ||
    !Array.isArray(session.context.permissions)
  ) {
    return null;
  }
  const expiresAt = new Date(session.context.operator_expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return session;
}

function sessionMatchesBinding(
  session: CashierOperatorSession,
  binding: CashierStationBinding,
): boolean {
  return (
    session.context.merchant_id === binding.merchant_id &&
    session.context.station_id === binding.station_id &&
    session.context.device_id === binding.device_id &&
    session.context.station_token === binding.station_token
  );
}

function currentSessionStorageValue(): CashierOperatorSession | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(OPERATOR_STORAGE_KEY);
  if (!raw) return null;
  try {
    return validSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readOfflineRecord(): Promise<OfflineOperatorRecord | null> {
  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readonly');
    const value = await requestResult(
      transaction.objectStore(BOOTSTRAP_STORE).get(OFFLINE_OPERATOR_RECORD_ID),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as OfflineOperatorRecord;
    const session = validSession(record.session);
    return record.id === OFFLINE_OPERATOR_RECORD_ID && session
      ? { ...record, session }
      : null;
  } finally {
    database.close();
  }
}

export async function clearCashierOfflineOperatorResume(): Promise<void> {
  const database = await openBootstrapDatabase().catch(() => null);
  if (!database) return;
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    transaction.objectStore(BOOTSTRAP_STORE).delete(OFFLINE_OPERATOR_RECORD_ID);
    await completion;
  } finally {
    database.close();
  }
}

export async function persistCurrentCashierOperatorForOfflineResume(): Promise<void> {
  const session = currentSessionStorageValue();
  if (!session) {
    await clearCashierOfflineOperatorResume();
    return;
  }
  const binding = await getCashierStationBinding().catch(() => null);
  if (!binding || !sessionMatchesBinding(session, binding)) {
    await clearCashierOfflineOperatorResume();
    return;
  }

  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    const record: OfflineOperatorRecord = {
      id: OFFLINE_OPERATOR_RECORD_ID,
      saved_at: new Date().toISOString(),
      session,
    };
    transaction.objectStore(BOOTSTRAP_STORE).put(record);
    await completion;
  } finally {
    database.close();
  }
}

export async function restoreCashierOfflineOperatorSession(): Promise<CashierOperatorSession | null> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return null;
  if (typeof sessionStorage === 'undefined') return null;

  const current = currentSessionStorageValue();
  if (current) return current;

  const record = await readOfflineRecord().catch(() => null);
  if (!record) {
    await clearCashierOfflineOperatorResume();
    return null;
  }
  const binding = await getCashierStationBinding().catch(() => null);
  if (!binding || !sessionMatchesBinding(record.session, binding)) {
    await clearCashierOfflineOperatorResume();
    return null;
  }

  sessionStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(record.session));
  return record.session;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === 'undefined') return null;
  const raw = typeof input === 'string' || input instanceof URL
    ? String(input)
    : input.url;
  try {
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

export function installCashierOfflineOperatorResume(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const persist = () => {
    void persistCurrentCashierOperatorForOfflineResume();
  };
  const clear = () => {
    void clearCashierOfflineOperatorResume();
  };

  window.addEventListener('fawri:cashier-operator-session-changed', persist);
  window.addEventListener('fawri:cashier-operator-session-invalidated', clear);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = requestUrl(args[0]);
    if (
      url?.origin === window.location.origin &&
      url.pathname.startsWith('/api/cashier/') &&
      (response.status === 401 || response.status === 403)
    ) {
      clear();
    }
    return response;
  };
}
