import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import type {
  CashierCatalogLookup,
  CashierCommitSaleInput,
  CashierCommitSaleResult,
  CashierSaleLineInput,
  CashierSaleSnapshot,
} from './cashierLocalContracts';
import type { CashierPromotionRule } from './cashierPromotionRuntime';
import {
  resolveCashierSalePricing,
  type CashierResolvedSalePricing,
  type CashierSalePricingCatalogItem,
} from './cashierSalePricingRuntime';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const CATALOG_STORE = 'catalog';
const PROMOTION_STORE = 'promotions';

type CashierDeviceIdentity = {
  id: 'default';
  local_merchant_id: string;
  device_id: string;
  created_at: string;
};

type StoredCatalogRecord = CashierCatalogLookup & {
  key: string;
  local_updated_at: string;
};

type StoredPromotionRecord = CashierPromotionRule & {
  local_updated_at: string;
};

export type CashierPosRuntime = {
  localMerchantId: string;
  deviceId: string;
  demoMode: boolean;
  searchCatalog(query?: string, limit?: number): Promise<CashierCatalogLookup[]>;
  lookupExact(value: string): Promise<CashierCatalogLookup | null>;
  quote(lines: CashierSaleLineInput[]): Promise<CashierResolvedSalePricing>;
  commitSale(input: CashierCommitSaleInput): Promise<CashierCommitSaleResult>;
  listSales(limit?: number): Promise<CashierSaleSnapshot[]>;
  close(): Promise<void>;
};

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
  const value =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function openBootstrapDatabase(): Promise<IDBDatabase> {
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
    if (existing?.local_merchant_id && existing?.device_id) return existing;

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

function openCashierDatabase(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier database'));
  });
}

function withoutMetadata(record: StoredCatalogRecord): CashierCatalogLookup {
  const { key: _key, local_updated_at: _updatedAt, ...item } = record;
  return item;
}

function normalizedSearch(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ar');
}

function catalogMatches(record: StoredCatalogRecord, query: string): boolean {
  if (!query) return true;
  return [record.name, record.variant_name, record.sku, record.barcode]
    .map(normalizedSearch)
    .some(value => value.includes(query));
}

function pricingCatalogItem(record: StoredCatalogRecord): CashierSalePricingCatalogItem {
  return {
    product_id: record.product_id,
    ...(record.variant_id ? { variant_id: record.variant_id } : {}),
    product_name: record.name,
    ...(record.variant_name ? { variant_name: record.variant_name } : {}),
    ...(record.sku ? { sku: record.sku } : {}),
    ...(record.barcode ? { barcode: record.barcode } : {}),
    currency_code: record.currency_code,
    currency_fraction_digits: record.currency_fraction_digits,
    base_unit_price_minor: record.base_unit_price_minor,
    catalog_version: record.catalog_version,
  };
}

async function readCatalog(databaseName: string): Promise<StoredCatalogRecord[]> {
  const database = await openCashierDatabase(databaseName);
  try {
    if (!database.objectStoreNames.contains(CATALOG_STORE)) return [];
    const transaction = database.transaction(CATALOG_STORE, 'readonly');
    return (await requestResult(
      transaction.objectStore(CATALOG_STORE).getAll(),
    )) as StoredCatalogRecord[];
  } finally {
    database.close();
  }
}

async function quoteFromDatabase(input: {
  databaseName: string;
  merchantId: string;
  lines: CashierSaleLineInput[];
}): Promise<CashierResolvedSalePricing> {
  const database = await openCashierDatabase(input.databaseName);
  try {
    const transaction = database.transaction([CATALOG_STORE, PROMOTION_STORE], 'readonly');
    const catalog = transaction.objectStore(CATALOG_STORE);
    const promotions = transaction.objectStore(PROMOTION_STORE);
    const records: StoredCatalogRecord[] = [];
    for (const line of input.lines) {
      const key = `${line.product_id}\u0000${line.variant_id || ''}`;
      const record = (await requestResult(catalog.get(key))) as StoredCatalogRecord | undefined;
      if (!record) throw new Error('CASHIER_SALE_PRICING_ITEM_NOT_FOUND');
      records.push(record);
    }
    const promotionRecords = (await requestResult(promotions.getAll())) as StoredPromotionRecord[];
    const rules: CashierPromotionRule[] = promotionRecords.map(
      ({ local_updated_at: _updatedAt, ...rule }) => rule,
    );
    return resolveCashierSalePricing({
      merchantId: input.merchantId,
      catalog: records.map(pricingCatalogItem),
      promotions: rules,
      lines: input.lines,
      at: new Date(),
    });
  } finally {
    database.close();
  }
}

const DEMO_CATALOG: CashierCatalogLookup[] = [
  {
    product_id: 'demo-coffee',
    item_type: 'product',
    name: 'قهوة عراقية فاخرة',
    sku: 'DEMO-COFFEE-1',
    barcode: '990000000101',
    track_inventory: true,
    stock_quantity: 12,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 5000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-headphones',
    item_type: 'product',
    name: 'سماعات لاسلكية',
    sku: 'DEMO-AUDIO-1',
    barcode: '990000000102',
    track_inventory: true,
    stock_quantity: 5,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 45000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-service',
    item_type: 'service',
    name: 'خدمة إعداد متجر إلكتروني',
    sku: 'DEMO-SERVICE-1',
    track_inventory: false,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 75000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-charger',
    item_type: 'product',
    name: 'شاحن سريع',
    sku: 'DEMO-CHARGER-1',
    barcode: '990000000103',
    track_inventory: true,
    stock_quantity: 20,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 18000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-cable',
    item_type: 'product',
    name: 'كابل USB-C',
    sku: 'DEMO-CABLE-1',
    barcode: '990000000104',
    track_inventory: true,
    stock_quantity: 25,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 9000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-mouse',
    item_type: 'product',
    name: 'ماوس لاسلكي',
    sku: 'DEMO-MOUSE-1',
    barcode: '990000000105',
    track_inventory: true,
    stock_quantity: 15,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 22000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-keyboard',
    item_type: 'product',
    name: 'لوحة مفاتيح',
    sku: 'DEMO-KEYBOARD-1',
    barcode: '990000000106',
    track_inventory: true,
    stock_quantity: 10,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 32000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-phone-stand',
    item_type: 'product',
    name: 'حامل هاتف',
    sku: 'DEMO-STAND-1',
    barcode: '990000000107',
    track_inventory: true,
    stock_quantity: 18,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 12000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-powerbank',
    item_type: 'product',
    name: 'باور بانك',
    sku: 'DEMO-POWER-1',
    barcode: '990000000108',
    track_inventory: true,
    stock_quantity: 14,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 38000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-lamp',
    item_type: 'product',
    name: 'مصباح مكتبي',
    sku: 'DEMO-LAMP-1',
    barcode: '990000000109',
    track_inventory: true,
    stock_quantity: 9,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 27000,
    catalog_version: 1,
  },
  {
    product_id: 'demo-notebook',
    item_type: 'product',
    name: 'دفتر ملاحظات',
    sku: 'DEMO-NOTEBOOK-1',
    barcode: '990000000110',
    track_inventory: true,
    stock_quantity: 30,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 7000,
    catalog_version: 1,
  },
];

const DEMO_PROMOTIONS: CashierPromotionRule[] = [
  {
    id: 'demo-audio-10pct',
    merchant_id: 'demo-merchant',
    name: 'خصم 10% على السماعات',
    scope: 'catalog_item',
    effect: 'percentage_off',
    product_id: 'demo-headphones',
    percentage_bps: 1000,
    currency_code: 'IQD',
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: '2030-01-01T00:00:00.000Z',
    schedule_timezone: 'Asia/Baghdad',
    priority: 10,
    enabled: true,
    version: 1,
  },
];

async function ensureDemoData(
  authority: IndexedDbCashierAuthority,
): Promise<void> {
  // Demo-only: always upsert the full fixture so newly added validation items
  // become available without resetting inventory already exercised in this browser.
  await authority.upsertCatalogSnapshot(DEMO_CATALOG, { preserveLocalInventory: true });
  await authority.replacePromotionSnapshot(DEMO_PROMOTIONS);
}

export async function createCashierPosRuntime(options?: {
  demoMode?: boolean;
}): Promise<CashierPosRuntime> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');

  const demoMode = options?.demoMode === true;
  const identity = demoMode
    ? {
        id: 'default' as const,
        local_merchant_id: 'demo-merchant',
        device_id: 'demo-device',
        created_at: new Date().toISOString(),
      }
    : await getOrCreateIdentity();
  const databaseName = demoMode
    ? 'fawri-cashier-ui-demo-v1'
    : `fawri-cashier-${identity.local_merchant_id}-v1`;
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    deviceId: identity.device_id,
    databaseName,
  };
  const authority = new IndexedDbCashierAuthority(config);

  // Force the authority schema open/upgrade to finish before the browse adapter
  // opens the same database without a version. This avoids a first-run race.
  await authority.getCatalogItem('__fawri_pos_schema_probe__');

  if (demoMode) await ensureDemoData(authority);

  return {
    localMerchantId: identity.local_merchant_id,
    deviceId: identity.device_id,
    demoMode,
    async searchCatalog(query = '', limit = 40) {
      const normalized = normalizedSearch(query);
      const records = await readCatalog(databaseName);
      return records
        .filter(record => catalogMatches(record, normalized))
        .sort((left, right) => left.name.localeCompare(right.name, 'ar'))
        .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
        .map(withoutMetadata);
    },
    async lookupExact(value: string) {
      const normalized = String(value || '').trim();
      if (!normalized) return null;
      return (
        (await authority.lookupByBarcode(normalized)) ||
        (await authority.lookupBySku(normalized))
      );
    },
    quote(lines) {
      return quoteFromDatabase({
        databaseName,
        merchantId: identity.local_merchant_id,
        lines,
      });
    },
    commitSale(input) {
      return authority.commitSale(input);
    },
    listSales(limit) {
      return authority.listSales(limit);
    },
    close() {
      return authority.close();
    },
  };
}
