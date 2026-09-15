import {
  CASHIER_LOCAL_SCHEMA_VERSION,
  type CashierSaleSnapshot,
  isNonNegativeSafeInteger,
  isValidCashierMoneyContext,
} from './cashierLocalContracts';
import type { IndexedDbCashierConfig } from './cashierIndexedDbAuthority';
import {
  buildCashierLocalHistory,
  summarizeCashierLocalHistory,
} from './cashierLocalHistory';

const INDEXEDDB_SCHEMA_VERSION = 2;
const BACKUP_FORMAT = 'fawri.cashier.local-backup' as const;
const BACKUP_VERSION = 1 as const;
const STORE_NAMES = [
  'meta',
  'catalog',
  'promotions',
  'sales',
  'inventory_movements',
  'outbox',
] as const;

type StoreName = (typeof STORE_NAMES)[number];
type RawRecord = Record<string, unknown>;

type BackupStores = Record<StoreName, RawRecord[]>;
type RecordCounts = Record<StoreName, number>;

export type CashierLocalBackupV1 = {
  format: typeof BACKUP_FORMAT;
  backup_version: typeof BACKUP_VERSION;
  cashier_schema_version: typeof CASHIER_LOCAL_SCHEMA_VERSION;
  indexeddb_schema_version: typeof INDEXEDDB_SCHEMA_VERSION;
  local_merchant_id: string;
  exported_at: string;
  record_counts: RecordCounts;
  stores: BackupStores;
  integrity: {
    algorithm: 'SHA-256';
    digest_hex: string;
  };
};

export type CashierBackupValidationReport = {
  ok: true;
  local_merchant_id: string;
  record_counts: RecordCounts;
  history_event_count: number;
  currency_summary_count: number;
};

export type CashierRestoreResult = CashierBackupValidationReport & {
  restored_at: string;
};

export class CashierBackupError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierBackupError';
    this.code = code;
  }
}

function requiredId(value: unknown, label: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 250) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_IDENTIFIER_INVALID',
      `${label} is invalid`,
    );
  }
  return normalized;
}

function validInstant(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  const time = new Date(text).getTime();
  if (!text || !Number.isFinite(time)) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_TIME_INVALID',
      `${label} is invalid`,
    );
  }
  return new Date(time).toISOString();
}

function plainObject(value: unknown, label: string): RawRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_RECORD_INVALID',
      `${label} must be an object`,
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_RECORD_INVALID',
      `${label} must be a plain object`,
    );
  }
  return value as RawRecord;
}

function safeInteger(value: unknown, label: string, allowNegative = false): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    (!allowNegative && parsed < 0)
  ) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_INTEGER_INVALID',
      `${label} must be a safe integer`,
    );
  }
  return parsed;
}

function canonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_NON_JSON_VALUE',
        'backup contains a non-finite number',
      );
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const record = plainObject(value, 'backup value');
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child === undefined) {
        throw new CashierBackupError(
          'CASHIER_BACKUP_NON_JSON_VALUE',
          'backup contains undefined data',
        );
      }
      output[key] = canonicalValue(child);
    }
    return output;
  }
  throw new CashierBackupError(
    'CASHIER_BACKUP_NON_JSON_VALUE',
    'backup contains a non-JSON value',
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

async function sha256Hex(value: unknown): Promise<string> {
  if (
    typeof crypto === 'undefined' ||
    !crypto.subtle ||
    typeof TextEncoder === 'undefined'
  ) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_CRYPTO_UNAVAILABLE',
      'SHA-256 is unavailable in this runtime',
    );
  }
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
          new CashierBackupError(
            'CASHIER_BACKUP_STORAGE_REQUEST_FAILED',
            'IndexedDB request failed',
          ),
      );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ||
          new CashierBackupError(
            'CASHIER_BACKUP_TRANSACTION_FAILED',
            'IndexedDB transaction failed',
          ),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ||
          new CashierBackupError(
            'CASHIER_BACKUP_TRANSACTION_ABORTED',
            'IndexedDB transaction was aborted',
          ),
      );
  });
}

async function abortAndDrain(
  transaction: IDBTransaction,
  completion: Promise<void>,
): Promise<void> {
  try {
    transaction.abort();
  } catch {
    // Already committed or aborted.
  }
  await completion.catch(() => undefined);
}

function createSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains('meta')) {
    database.createObjectStore('meta', { keyPath: 'key' });
  }
  if (!database.objectStoreNames.contains('catalog')) {
    const store = database.createObjectStore('catalog', { keyPath: 'key' });
    store.createIndex('barcode', 'barcode', { unique: false });
    store.createIndex('sku', 'sku', { unique: false });
    store.createIndex('product_id', 'product_id', { unique: false });
  }
  if (!database.objectStoreNames.contains('promotions')) {
    const store = database.createObjectStore('promotions', { keyPath: 'id' });
    store.createIndex('merchant_id', 'merchant_id', { unique: false });
    store.createIndex('product_id', 'product_id', { unique: false });
  }
  if (!database.objectStoreNames.contains('sales')) {
    const store = database.createObjectStore('sales', { keyPath: 'sale_id' });
    store.createIndex('operation_id', 'operation_id', { unique: true });
    store.createIndex('occurred_at', 'occurred_at', { unique: false });
  }
  if (!database.objectStoreNames.contains('inventory_movements')) {
    const store = database.createObjectStore('inventory_movements', {
      keyPath: 'movement_id',
    });
    store.createIndex('operation_id', 'operation_id', { unique: false });
    store.createIndex('occurred_at', 'occurred_at', { unique: false });
  }
  if (!database.objectStoreNames.contains('outbox')) {
    const store = database.createObjectStore('outbox', { keyPath: 'outbox_id' });
    store.createIndex('operation_id', 'operation_id', { unique: false });
    store.createIndex('device_sequence', 'device_sequence', { unique: false });
  }
}

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierBackupError(
      'CASHIER_BACKUP_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable',
    );
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, INDEXEDDB_SCHEMA_VERSION);
    request.onupgradeneeded = () => createSchema(request.result);
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () =>
      reject(
        request.error ||
          new CashierBackupError(
            'CASHIER_BACKUP_DATABASE_OPEN_FAILED',
            'could not open local cashier database',
          ),
      );
    request.onblocked = () =>
      reject(
        new CashierBackupError(
          'CASHIER_BACKUP_DATABASE_BLOCKED',
          'local cashier database is blocked by another tab',
        ),
      );
  });
}

function defaultDatabaseName(localMerchantId: string): string {
  return `fawri-cashier-${localMerchantId}-v1`;
}

function primaryKey(store: StoreName, record: RawRecord): string {
  const field: Record<StoreName, string> = {
    meta: 'key',
    catalog: 'key',
    promotions: 'id',
    sales: 'sale_id',
    inventory_movements: 'movement_id',
    outbox: 'outbox_id',
  };
  return requiredId(record[field[store]], `${store} primary key`);
}

function sortStoreRecords(store: StoreName, records: RawRecord[]): RawRecord[] {
  return [...records].sort((left, right) =>
    primaryKey(store, left).localeCompare(primaryKey(store, right)),
  );
}

function counts(stores: BackupStores): RecordCounts {
  return Object.fromEntries(
    STORE_NAMES.map(name => [name, stores[name].length]),
  ) as RecordCounts;
}

function backupPayload(backup: Omit<CashierLocalBackupV1, 'integrity'>): unknown {
  return backup;
}

function validateUniqueKeys(store: StoreName, records: RawRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    const key = primaryKey(store, record);
    if (seen.has(key)) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_DUPLICATE_KEY',
        `${store} contains a duplicate primary key`,
      );
    }
    seen.add(key);
  }
}

function validateStoreRecords(
  stores: BackupStores,
  localMerchantId: string,
): void {
  for (const store of STORE_NAMES) {
    validateUniqueKeys(store, stores[store]);
  }

  for (const record of stores.meta) {
    const key = primaryKey('meta', record);
    if (key === 'device_sequence') {
      safeInteger(record.value, 'device sequence');
    }
  }

  for (const record of stores.catalog) {
    requiredId(record.product_id, 'catalog product id');
    const money = {
      currency_code: String(record.currency_code || ''),
      currency_fraction_digits: Number(record.currency_fraction_digits),
    };
    if (!isValidCashierMoneyContext(money)) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_CATALOG_MONEY_INVALID',
        'catalog money context is invalid',
      );
    }
    if (!isNonNegativeSafeInteger(Number(record.base_unit_price_minor))) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_CATALOG_PRICE_INVALID',
        'catalog base price is invalid',
      );
    }
    if (record.track_inventory === true) {
      safeInteger(record.stock_quantity, 'catalog stock');
    }
  }

  for (const record of stores.promotions) {
    requiredId(record.id, 'promotion id');
    requiredId(record.merchant_id, 'promotion merchant id');
  }

  const sales = stores.sales.map((record, index) => {
    const sale = record as unknown as CashierSaleSnapshot;
    requiredId(sale.sale_id, `sale ${index + 1} id`);
    requiredId(sale.operation_id, `sale ${index + 1} operation id`);
    if (sale.local_merchant_id !== localMerchantId) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_RECORD_MERCHANT_MISMATCH',
        'sale belongs to a different local merchant',
      );
    }
    if (!isValidCashierMoneyContext(sale)) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_SALE_MONEY_INVALID',
        'sale money context is invalid',
      );
    }
    const subtotal = safeInteger(sale.subtotal_minor, 'sale subtotal');
    const discount = safeInteger(sale.discount_minor, 'sale discount');
    const total = safeInteger(sale.total_minor, 'sale total');
    if (subtotal - discount !== total) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_SALE_TOTAL_INVALID',
        'sale totals are internally inconsistent',
      );
    }
    validInstant(sale.occurred_at, 'sale time');
    return sale;
  });
  buildCashierLocalHistory(sales);

  for (const record of stores.inventory_movements) {
    requiredId(record.movement_id, 'movement id');
    requiredId(record.operation_id, 'movement operation id');
    if (record.local_merchant_id !== localMerchantId) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_RECORD_MERCHANT_MISMATCH',
        'inventory movement belongs to a different local merchant',
      );
    }
    const delta = safeInteger(record.delta, 'inventory movement delta', true);
    if (delta === 0) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_MOVEMENT_INVALID',
        'inventory movement delta cannot be zero',
      );
    }
    validInstant(record.occurred_at, 'inventory movement time');
  }

  for (const record of stores.outbox) {
    requiredId(record.outbox_id, 'outbox id');
    requiredId(record.operation_id, 'outbox operation id');
    safeInteger(record.device_sequence, 'outbox device sequence');
    if (Number(record.schema_version) !== CASHIER_LOCAL_SCHEMA_VERSION) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_OUTBOX_SCHEMA_INVALID',
        'outbox schema version is unsupported',
      );
    }
  }
}

function normalizeBackupObject(value: unknown): CashierLocalBackupV1 {
  const record = plainObject(value, 'backup');
  if (record.format !== BACKUP_FORMAT || Number(record.backup_version) !== BACKUP_VERSION) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_FORMAT_UNSUPPORTED',
      'backup format/version is unsupported',
    );
  }
  if (
    Number(record.cashier_schema_version) !== CASHIER_LOCAL_SCHEMA_VERSION ||
    Number(record.indexeddb_schema_version) !== INDEXEDDB_SCHEMA_VERSION
  ) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_SCHEMA_UNSUPPORTED',
      'backup schema version is unsupported',
    );
  }
  const storesRecord = plainObject(record.stores, 'backup stores');
  const normalizedStores = {} as BackupStores;
  for (const store of STORE_NAMES) {
    const source = storesRecord[store];
    if (!Array.isArray(source)) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_STORE_INVALID',
        `${store} backup store must be an array`,
      );
    }
    normalizedStores[store] = source.map((item, index) =>
      plainObject(item, `${store} record ${index + 1}`),
    );
  }
  const countsRecord = plainObject(record.record_counts, 'record counts');
  const normalizedCounts = {} as RecordCounts;
  for (const store of STORE_NAMES) {
    normalizedCounts[store] = safeInteger(countsRecord[store], `${store} record count`);
  }
  const integrity = plainObject(record.integrity, 'backup integrity');
  if (integrity.algorithm !== 'SHA-256') {
    throw new CashierBackupError(
      'CASHIER_BACKUP_INTEGRITY_ALGORITHM_UNSUPPORTED',
      'backup integrity algorithm is unsupported',
    );
  }
  const digest = String(integrity.digest_hex || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_INTEGRITY_INVALID',
      'backup digest is invalid',
    );
  }
  return {
    format: BACKUP_FORMAT,
    backup_version: BACKUP_VERSION,
    cashier_schema_version: CASHIER_LOCAL_SCHEMA_VERSION,
    indexeddb_schema_version: INDEXEDDB_SCHEMA_VERSION,
    local_merchant_id: requiredId(record.local_merchant_id, 'backup local merchant id'),
    exported_at: validInstant(record.exported_at, 'backup export time'),
    record_counts: normalizedCounts,
    stores: normalizedStores,
    integrity: { algorithm: 'SHA-256', digest_hex: digest },
  };
}

export function parseCashierLocalBackupJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CashierBackupError(
      'CASHIER_BACKUP_JSON_INVALID',
      'backup JSON is invalid',
    );
  }
}

export function stringifyCashierLocalBackup(backup: CashierLocalBackupV1): string {
  return JSON.stringify(backup, null, 2);
}

export async function validateCashierLocalBackup(
  input: unknown,
  expectedLocalMerchantId: string,
): Promise<CashierBackupValidationReport> {
  const backup = normalizeBackupObject(input);
  const expectedMerchant = requiredId(expectedLocalMerchantId, 'expected local merchant id');
  if (backup.local_merchant_id !== expectedMerchant) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_MERCHANT_MISMATCH',
      'backup belongs to a different local merchant',
    );
  }
  const { integrity: _integrity, ...unsigned } = backup;
  const calculatedDigest = await sha256Hex(backupPayload(unsigned));
  if (calculatedDigest !== backup.integrity.digest_hex) {
    throw new CashierBackupError(
      'CASHIER_BACKUP_INTEGRITY_MISMATCH',
      'backup integrity check failed',
    );
  }
  const actualCounts = counts(backup.stores);
  for (const store of STORE_NAMES) {
    if (actualCounts[store] !== backup.record_counts[store]) {
      throw new CashierBackupError(
        'CASHIER_BACKUP_RECORD_COUNT_MISMATCH',
        `${store} record count does not match backup metadata`,
      );
    }
  }
  validateStoreRecords(backup.stores, expectedMerchant);
  const history = buildCashierLocalHistory(
    backup.stores.sales as unknown as CashierSaleSnapshot[],
  );
  const summaries = summarizeCashierLocalHistory(history);
  return {
    ok: true,
    local_merchant_id: expectedMerchant,
    record_counts: actualCounts,
    history_event_count: history.length,
    currency_summary_count: summaries.length,
  };
}

export class IndexedDbCashierBackupAuthority {
  private readonly localMerchantId: string;
  private readonly databaseName: string;
  private readonly now: () => Date;

  constructor(config: IndexedDbCashierConfig) {
    this.localMerchantId = requiredId(config.localMerchantId, 'local merchant id');
    this.databaseName = config.databaseName || defaultDatabaseName(this.localMerchantId);
    this.now = config.now || (() => new Date());
  }

  private async readStores(): Promise<BackupStores> {
    const database = await openDatabase(this.databaseName);
    try {
      const transaction = database.transaction([...STORE_NAMES], 'readonly');
      const completion = transactionDone(transaction);
      const requests = STORE_NAMES.map(store =>
        requestResult(transaction.objectStore(store).getAll()),
      );
      const results = await Promise.all(requests);
      await completion;
      const stores = {} as BackupStores;
      STORE_NAMES.forEach((store, index) => {
        stores[store] = sortStoreRecords(
          store,
          (results[index] as unknown[]).map((value, recordIndex) =>
            plainObject(value, `${store} record ${recordIndex + 1}`),
          ),
        );
      });
      return stores;
    } finally {
      database.close();
    }
  }

  async exportBackup(): Promise<CashierLocalBackupV1> {
    const stores = await this.readStores();
    validateStoreRecords(stores, this.localMerchantId);
    const unsigned: Omit<CashierLocalBackupV1, 'integrity'> = {
      format: BACKUP_FORMAT,
      backup_version: BACKUP_VERSION,
      cashier_schema_version: CASHIER_LOCAL_SCHEMA_VERSION,
      indexeddb_schema_version: INDEXEDDB_SCHEMA_VERSION,
      local_merchant_id: this.localMerchantId,
      exported_at: validInstant(this.now(), 'backup export time'),
      record_counts: counts(stores),
      stores,
    };
    const digest = await sha256Hex(backupPayload(unsigned));
    return {
      ...unsigned,
      integrity: { algorithm: 'SHA-256', digest_hex: digest },
    };
  }

  async restoreBackup(input: unknown): Promise<CashierRestoreResult> {
    const backup = normalizeBackupObject(input);
    const validation = await validateCashierLocalBackup(
      backup,
      this.localMerchantId,
    );
    const database = await openDatabase(this.databaseName);
    const transaction = database.transaction([...STORE_NAMES], 'readwrite');
    const completion = transactionDone(transaction);
    try {
      for (const store of STORE_NAMES) {
        transaction.objectStore(store).clear();
      }
      for (const store of STORE_NAMES) {
        const objectStore = transaction.objectStore(store);
        for (const record of backup.stores[store]) objectStore.put(record);
      }
      await completion;
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    } finally {
      database.close();
    }
    return {
      ...validation,
      restored_at: validInstant(this.now(), 'backup restore time'),
    };
  }
}
