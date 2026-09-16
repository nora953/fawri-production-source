import { listCatalogProducts, type CatalogProduct } from './catalogUiApi';
import {
  getCatalogCommerceContext,
  type CatalogCommerceContext,
  type CatalogPromotion,
} from './catalogPromotionUiApi';
import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import type { CashierCatalogLookup } from './cashierLocalContracts';
import {
  cashierPromotionLifecycleAt,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const CATALOG_STORE = 'catalog';
const PROMOTION_STORE = 'promotions';

type CashierDeviceIdentity = {
  id: 'default';
  local_merchant_id: string;
  device_id: string;
  created_at: string;
  cloud_merchant_id?: string;
  cloud_bound_at?: string;
  last_catalog_sync_at?: string;
};

type StoredCatalogRecord = CashierCatalogLookup & {
  key: string;
  local_updated_at: string;
};

type StoredPromotionRecord = CashierPromotionRule & {
  local_updated_at: string;
};

type PromotionEnvelope = {
  merchant_id: string;
  promotions: CatalogPromotion[];
};

export type CashierCloudCatalogSyncResult = {
  merchant_id: string;
  currency_code: string;
  product_count: number;
  local_item_count: number;
  promotion_count: number;
  preserve_local_inventory: boolean;
  synced_at: string;
};

export class CashierCloudCatalogSyncError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierCloudCatalogSyncError';
    this.code = code;
    this.status = status;
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

function randomId(prefix: string): string {
  const value =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function catalogKey(item: { product_id: string; variant_id?: string }): string {
  return `${item.product_id}\u0000${item.variant_id || ''}`;
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

async function bindIdentityToMerchant(
  identity: CashierDeviceIdentity,
  merchantId: string,
  syncedAt: string,
): Promise<void> {
  if (identity.cloud_merchant_id && identity.cloud_merchant_id !== merchantId) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_DEVICE_MERCHANT_MISMATCH',
      'This cashier device is already bound to a different merchant',
    );
  }
  const database = await openBootstrapDatabase();
  try {
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readwrite');
    const completion = transactionDone(transaction);
    transaction.objectStore(BOOTSTRAP_STORE).put({
      ...identity,
      cloud_merchant_id: merchantId,
      cloud_bound_at: identity.cloud_bound_at || syncedAt,
      last_catalog_sync_at: syncedAt,
    } satisfies CashierDeviceIdentity);
    await completion;
  } finally {
    database.close();
  }
}

function assertSafeMinor(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_CATALOG_INVALID',
      `${label} must be a non-negative safe integer`,
    );
  }
  return value;
}

function optionalSafeMinor(value: number | undefined, label: string): number | undefined {
  return value === undefined ? undefined : assertSafeMinor(Number(value), label);
}

function localItemsFromProduct(
  product: CatalogProduct,
  context: CatalogCommerceContext,
): CashierCatalogLookup[] {
  if (product.status !== 'available' && product.status !== 'low_stock') return [];
  if (!Number.isInteger(product.version) || product.version <= 0) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_CATALOG_INVALID',
      'Catalog product version is invalid',
    );
  }

  const base = {
    product_id: product.id,
    item_type: product.item_type,
    name: product.name,
    track_inventory: product.track_inventory,
    currency_code: context.currency_code,
    currency_fraction_digits: context.currency_fraction_digits,
    catalog_version: product.version,
  } as const;

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.map(variant => {
      const cost = optionalSafeMinor(
        variant.cost_iqd ?? product.cost_iqd,
        'variant reporting cost',
      );
      return {
        ...base,
        variant_id: variant.id,
        variant_name: variant.name || undefined,
        sku: variant.sku || product.sku || undefined,
        barcode: variant.barcode || undefined,
        stock_quantity: product.track_inventory
          ? assertSafeMinor(Number(variant.stock_quantity), 'variant stock')
          : undefined,
        base_unit_price_minor: assertSafeMinor(
          Number(variant.price_iqd ?? product.price_iqd),
          'variant price',
        ),
        ...(cost !== undefined ? { unit_cost_minor: cost } : {}),
      };
    });
  }

  const cost = optionalSafeMinor(product.cost_iqd, 'product reporting cost');
  return [
    {
      ...base,
      sku: product.sku || undefined,
      barcode: product.barcode || undefined,
      stock_quantity: product.track_inventory
        ? assertSafeMinor(Number(product.stock_quantity), 'product stock')
        : undefined,
      base_unit_price_minor: assertSafeMinor(Number(product.price_iqd), 'product price'),
      ...(cost !== undefined ? { unit_cost_minor: cost } : {}),
    },
  ];
}

function assertUniqueLookupValues(items: CashierCatalogLookup[]): void {
  for (const field of ['sku', 'barcode'] as const) {
    const seen = new Map<string, string>();
    for (const item of items) {
      const value = String(item[field] || '').trim();
      if (!value) continue;
      const prior = seen.get(value);
      const key = catalogKey(item);
      if (prior && prior !== key) {
        throw new CashierCloudCatalogSyncError(
          field === 'sku' ? 'CASHIER_CLOUD_SKU_AMBIGUOUS' : 'CASHIER_CLOUD_BARCODE_AMBIGUOUS',
          `Cloud catalog contains duplicate ${field}`,
        );
      }
      seen.set(value, key);
    }
  }
}

function localPromotion(
  promotion: CatalogPromotion,
  localMerchantId: string,
  currencyCode: string,
): CashierPromotionRule {
  if (promotion.currency_code !== currencyCode) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_PROMOTION_CURRENCY_MISMATCH',
      'Promotion currency does not match merchant commerce context',
    );
  }
  const rule: CashierPromotionRule = {
    id: promotion.id,
    merchant_id: localMerchantId,
    name: promotion.name,
    scope: promotion.scope,
    effect: promotion.effect,
    ...(promotion.product_id ? { product_id: promotion.product_id } : {}),
    ...(promotion.variant_id ? { variant_id: promotion.variant_id } : {}),
    ...(promotion.percentage_bps !== undefined
      ? { percentage_bps: promotion.percentage_bps }
      : {}),
    ...(promotion.amount_minor !== undefined ? { amount_minor: promotion.amount_minor } : {}),
    currency_code: promotion.currency_code,
    ...(promotion.minimum_subtotal_minor !== undefined
      ? { minimum_subtotal_minor: promotion.minimum_subtotal_minor }
      : {}),
    starts_at: promotion.starts_at,
    ends_at: promotion.ends_at,
    schedule_timezone: promotion.schedule_timezone,
    priority: promotion.priority,
    enabled: promotion.enabled,
    version: promotion.version,
  };
  cashierPromotionLifecycleAt(rule, new Date());
  return rule;
}

async function fetchPromotionEnvelope(): Promise<PromotionEnvelope> {
  let response: Response;
  try {
    response = await fetch('/api/catalog/promotions', { credentials: 'include' });
  } catch {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_NETWORK_FAILED',
      'Could not reach Fawri catalog service',
      0,
    );
  }
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; merchant_id?: unknown; promotions?: unknown; code?: unknown }
    | null;
  if (!response.ok || payload?.ok !== true) {
    throw new CashierCloudCatalogSyncError(
      response.status === 401 ? 'CASHIER_CLOUD_SESSION_REQUIRED' : String(payload?.code || 'CASHIER_CLOUD_PROMOTIONS_FAILED'),
      response.status === 401
        ? 'A signed-in merchant session is required to sync the cashier'
        : 'Could not load cloud promotions',
      response.status,
    );
  }
  const merchantId = String(payload.merchant_id || '').trim();
  if (!merchantId) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_MERCHANT_ID_MISSING',
      'Cloud merchant identity is missing',
    );
  }
  return {
    merchant_id: merchantId,
    promotions: Array.isArray(payload.promotions)
      ? (payload.promotions as CatalogPromotion[])
      : [],
  };
}

function cloudReadFailure(error: unknown, code: string): CashierCloudCatalogSyncError {
  if (error instanceof CashierCloudCatalogSyncError) return error;
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  if (status === 401) {
    return new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_SESSION_REQUIRED',
      'A signed-in merchant session is required to sync the cashier',
      401,
    );
  }
  if (status === 0) {
    return new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_NETWORK_FAILED',
      'Could not reach Fawri catalog service',
      0,
    );
  }
  return new CashierCloudCatalogSyncError(
    code,
    'Could not load the authoritative cloud catalog projection',
    Number.isFinite(status) ? status : undefined,
  );
}

function openExistingCashierDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      const database = request.result;
      if (
        !database.objectStoreNames.contains(CATALOG_STORE) ||
        !database.objectStoreNames.contains(PROMOTION_STORE)
      ) {
        database.close();
        reject(new CashierCloudCatalogSyncError(
          'CASHIER_LOCAL_SCHEMA_MISSING',
          'Local cashier schema is not initialized',
        ));
        return;
      }
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Could not open local cashier database'));
  });
}

async function replaceLocalCommerceSnapshot(input: {
  databaseName: string;
  items: CashierCatalogLookup[];
  promotions: CashierPromotionRule[];
  preserveLocalInventory: boolean;
  syncedAt: string;
}): Promise<void> {
  const database = await openExistingCashierDatabase(input.databaseName);
  try {
    const transaction = database.transaction(
      [CATALOG_STORE, PROMOTION_STORE],
      'readwrite',
    );
    const completion = transactionDone(transaction);
    const catalog = transaction.objectStore(CATALOG_STORE);
    const promotions = transaction.objectStore(PROMOTION_STORE);
    try {
      const existing = (await requestResult(catalog.getAll())) as StoredCatalogRecord[];
      const existingByKey = new Map(existing.map(record => [record.key, record]));
      catalog.clear();
      promotions.clear();

      for (const item of input.items) {
        const key = catalogKey(item);
        const prior = existingByKey.get(key);
        catalog.put({
          ...item,
          ...(input.preserveLocalInventory && prior?.track_inventory && item.track_inventory
            ? { stock_quantity: prior.stock_quantity }
            : {}),
          key,
          local_updated_at: input.syncedAt,
        } satisfies StoredCatalogRecord);
      }
      for (const rule of input.promotions) {
        promotions.put({
          ...rule,
          local_updated_at: input.syncedAt,
        } satisfies StoredPromotionRecord);
      }
      await completion;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Already completed/aborted.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

export async function syncCashierCatalogFromCloud(): Promise<CashierCloudCatalogSyncResult> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_OFFLINE',
      'Internet connection is required only for catalog synchronization',
      0,
    );
  }

  const identity = await getOrCreateIdentity();

  // Authenticated catalog reads are intentionally sequential. The auth layer may
  // rotate the merchant session token on a successful request; issuing multiple
  // protected reads concurrently can make a sibling request validate the stale
  // token and clear the freshly rotated cookie. Awaiting each response lets the
  // browser apply Set-Cookie before the next protected request begins.
  const promotionEnvelope = await fetchPromotionEnvelope();
  let context: CatalogCommerceContext;
  try {
    context = await getCatalogCommerceContext();
  } catch (error) {
    throw cloudReadFailure(error, 'CASHIER_CLOUD_CONTEXT_FAILED');
  }
  let products: CatalogProduct[];
  try {
    products = await listCatalogProducts();
  } catch (error) {
    throw cloudReadFailure(error, 'CASHIER_CLOUD_PRODUCTS_FAILED');
  }

  const merchantId = promotionEnvelope.merchant_id;

  if (identity.cloud_merchant_id && identity.cloud_merchant_id !== merchantId) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_DEVICE_MERCHANT_MISMATCH',
      'This cashier device is already bound to a different merchant',
    );
  }
  for (const product of products) {
    if (product.merchant_id !== merchantId) {
      throw new CashierCloudCatalogSyncError(
        'CASHIER_CLOUD_TENANT_MISMATCH',
        'Cloud catalog contains data for a different merchant',
      );
    }
  }
  for (const promotion of promotionEnvelope.promotions) {
    if (promotion.merchant_id !== merchantId) {
      throw new CashierCloudCatalogSyncError(
        'CASHIER_CLOUD_TENANT_MISMATCH',
        'Cloud promotions contain data for a different merchant',
      );
    }
  }

  // CatalogProduct still exposes legacy `price_iqd`. Until that canonical API is
  // migrated to generic minor-unit money, non-IQD sync must fail closed.
  if (context.currency_code !== 'IQD' || context.currency_fraction_digits !== 0) {
    throw new CashierCloudCatalogSyncError(
      'CASHIER_CLOUD_CURRENCY_NOT_CUT_OVER',
      'Cashier cloud sync currently supports IQD catalog prices only',
    );
  }

  const localItems = products.flatMap(product => localItemsFromProduct(product, context));
  assertUniqueLookupValues(localItems);
  const localPromotions = promotionEnvelope.promotions.map(promotion =>
    localPromotion(promotion, identity.local_merchant_id, context.currency_code),
  );

  const databaseName = `fawri-cashier-${identity.local_merchant_id}-v1`;
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    deviceId: identity.device_id,
    databaseName,
  };
  const authority = new IndexedDbCashierAuthority(config);
  await authority.getCatalogItem('__fawri_sync_schema_probe__');
  const pending = await authority.listPendingSync(1);
  const preserveLocalInventory = pending.length > 0;
  await authority.close();

  const syncedAt = new Date().toISOString();
  await bindIdentityToMerchant(identity, merchantId, syncedAt);
  await replaceLocalCommerceSnapshot({
    databaseName,
    items: localItems,
    promotions: localPromotions,
    preserveLocalInventory,
    syncedAt,
  });

  return {
    merchant_id: merchantId,
    currency_code: context.currency_code,
    product_count: products.length,
    local_item_count: localItems.length,
    promotion_count: localPromotions.length,
    preserve_local_inventory: preserveLocalInventory,
    synced_at: syncedAt,
  };
}
