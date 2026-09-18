import {
  CASHIER_LOCAL_SCHEMA_VERSION,
  type CashierCatalogLookup,
  type CashierCommitSaleInput,
  type CashierCommitSaleResult,
  type CashierInventoryAdjustmentInput,
  type CashierInventoryMovement,
  type CashierLocalAuthority,
  type CashierSaleLineSnapshot,
  type CashierSaleSnapshot,
  type CashierSyncEnvelope,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isValidCashierMoneyContext,
} from './cashierLocalContracts';
import {
  cashierPromotionLifecycleAt,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';
import {
  bindCashierOperationToCurrentOperator,
  cashierOperatorCan,
  getCashierOperatorSession,
} from './cashierOperatorSessionRuntime';
import {
  resolveCashierSalePricing,
  type CashierSalePricingCatalogItem,
} from './cashierSalePricingRuntime';

const DATABASE_VERSION = 2;
const STORE_META = 'meta';
const STORE_CATALOG = 'catalog';
const STORE_PROMOTIONS = 'promotions';
const STORE_SALES = 'sales';
const STORE_MOVEMENTS = 'inventory_movements';
const STORE_OUTBOX = 'outbox';
const META_DEVICE_SEQUENCE = 'device_sequence';

type MetaRecord = { key: string; value: number | string };
type CatalogRecord = CashierCatalogLookup & {
  key: string;
  local_updated_at: string;
};
type PromotionRecord = CashierPromotionRule & { local_updated_at: string };
type OutboxRecord = CashierSyncEnvelope & { outbox_id: string };

export type IndexedDbCashierConfig = {
  localMerchantId: string;
  cloudMerchantId?: string;
  deviceId: string;
  databaseName?: string;
  now?: () => Date;
};

export type IndexedDbCatalogSeedOptions = {
  preserveLocalInventory?: boolean;
};

export type IndexedDbCashierDurabilityProbe = {
  provider: 'indexeddb';
  available: boolean;
  persisted: boolean;
  persistence_requested: boolean;
  quota_bytes?: number;
  usage_bytes?: number;
  durability: 'persistent' | 'best_effort' | 'unavailable';
  production_certified: false;
  reason: string;
};

export class CashierIndexedDbError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierIndexedDbError';
    this.code = code;
  }
}

function requiredIdentifier(value: string, label: string): string {
  const normalized = String(value || '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200) {
    throw new CashierIndexedDbError(
      'CASHIER_LOCAL_IDENTIFIER_INVALID',
      `${label} is required`,
    );
  }
  return normalized;
}

function validInstant(value: Date, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new CashierIndexedDbError(
      'CASHIER_LOCAL_TIME_INVALID',
      `${label} is invalid`,
    );
  }
  return value.toISOString();
}

function catalogKey(productId: string, variantId?: string): string {
  return `${requiredIdentifier(productId, 'product id')}\u0000${String(variantId || '').trim()}`;
}

function saleId(operationId: string): string {
  return `sale:${operationId}`;
}

function lineId(operationId: string, index: number): string {
  return `line:${operationId}:${index + 1}`;
}

function movementId(operationId: string, index: number): string {
  return `movement:${operationId}:${index + 1}`;
}

function outboxId(
  operationId: string,
  entityType: CashierSyncEnvelope['entity_type'],
  entityId: string,
): string {
  return `outbox:${operationId}:${entityType}:${entityId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
          new CashierIndexedDbError(
            'CASHIER_LOCAL_STORAGE_REQUEST_FAILED',
            'IndexedDB request failed',
          ),
      );
  });
}

/** Register this immediately after opening a write transaction. */
function writeTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ||
          new CashierIndexedDbError(
            'CASHIER_LOCAL_TRANSACTION_FAILED',
            'IndexedDB transaction failed',
          ),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ||
          new CashierIndexedDbError(
            'CASHIER_LOCAL_TRANSACTION_ABORTED',
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
    // Already committed/aborted.
  }
  await completion.catch(() => undefined);
}

function createSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_META)) {
    database.createObjectStore(STORE_META, { keyPath: 'key' });
  }

  if (!database.objectStoreNames.contains(STORE_CATALOG)) {
    const catalog = database.createObjectStore(STORE_CATALOG, { keyPath: 'key' });
    catalog.createIndex('barcode', 'barcode', { unique: false });
    catalog.createIndex('sku', 'sku', { unique: false });
    catalog.createIndex('product_id', 'product_id', { unique: false });
  }

  if (!database.objectStoreNames.contains(STORE_PROMOTIONS)) {
    const promotions = database.createObjectStore(STORE_PROMOTIONS, { keyPath: 'id' });
    promotions.createIndex('merchant_id', 'merchant_id', { unique: false });
    promotions.createIndex('product_id', 'product_id', { unique: false });
  }

  if (!database.objectStoreNames.contains(STORE_SALES)) {
    const sales = database.createObjectStore(STORE_SALES, { keyPath: 'sale_id' });
    sales.createIndex('operation_id', 'operation_id', { unique: true });
    sales.createIndex('occurred_at', 'occurred_at', { unique: false });
  }

  if (!database.objectStoreNames.contains(STORE_MOVEMENTS)) {
    const movements = database.createObjectStore(STORE_MOVEMENTS, {
      keyPath: 'movement_id',
    });
    movements.createIndex('operation_id', 'operation_id', { unique: false });
    movements.createIndex('occurred_at', 'occurred_at', { unique: false });
  }

  if (!database.objectStoreNames.contains(STORE_OUTBOX)) {
    const outbox = database.createObjectStore(STORE_OUTBOX, {
      keyPath: 'outbox_id',
    });
    outbox.createIndex('operation_id', 'operation_id', { unique: false });
    outbox.createIndex('device_sequence', 'device_sequence', { unique: false });
  }
}

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierIndexedDbError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is not available in this runtime',
    );
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => createSchema(request.result);
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () =>
      reject(
        request.error ||
          new CashierIndexedDbError(
            'CASHIER_INDEXEDDB_OPEN_FAILED',
            'Could not open the local cashier database',
          ),
      );
    request.onblocked = () =>
      reject(
        new CashierIndexedDbError(
          'CASHIER_INDEXEDDB_BLOCKED',
          'The local cashier database upgrade is blocked by another app tab',
        ),
      );
  });
}

function validateCatalogItem(item: CashierCatalogLookup): void {
  requiredIdentifier(item.product_id, 'product id');
  if (!isValidCashierMoneyContext(item)) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_MONEY_INVALID',
      'Catalog currency context is invalid',
    );
  }
  if (!isNonNegativeSafeInteger(item.base_unit_price_minor)) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_PRICE_INVALID',
      'Catalog base price must be a safe non-negative minor-unit integer',
    );
  }
  if (
    item.unit_cost_minor !== undefined &&
    !isNonNegativeSafeInteger(item.unit_cost_minor)
  ) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_COST_INVALID',
      'Catalog reporting cost must be a safe non-negative minor-unit integer',
    );
  }
  if (
    item.effective_unit_price_minor !== undefined &&
    (!isNonNegativeSafeInteger(item.effective_unit_price_minor) ||
      item.effective_unit_price_minor > item.base_unit_price_minor)
  ) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_PRICE_INVALID',
      'Legacy effective price projection is invalid',
    );
  }
  if (!Number.isInteger(item.catalog_version) || item.catalog_version <= 0) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_VERSION_INVALID',
      'Catalog version must be a positive integer',
    );
  }
  if (
    item.track_inventory &&
    !isNonNegativeSafeInteger(Number(item.stock_quantity))
  ) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_STOCK_INVALID',
      'Tracked inventory requires a non-negative stock quantity',
    );
  }
}

function withoutCatalogMetadata(record: CatalogRecord): CashierCatalogLookup {
  const { key: _key, local_updated_at: _localUpdatedAt, ...item } = record;
  return item;
}

function pricingCatalogItem(record: CatalogRecord): CashierSalePricingCatalogItem {
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

async function nextDeviceSequence(meta: IDBObjectStore): Promise<number> {
  const current = (await requestResult(meta.get(META_DEVICE_SEQUENCE))) as
    | MetaRecord
    | undefined;
  const previous = Number(current?.value || 0);
  if (!Number.isSafeInteger(previous) || previous < 0) {
    throw new CashierIndexedDbError(
      'CASHIER_DEVICE_SEQUENCE_CORRUPT',
      'Local device sequence is corrupt',
    );
  }
  const next = previous + 1;
  if (!Number.isSafeInteger(next)) {
    throw new CashierIndexedDbError(
      'CASHIER_DEVICE_SEQUENCE_EXHAUSTED',
      'Local device sequence cannot advance safely',
    );
  }
  meta.put({ key: META_DEVICE_SEQUENCE, value: next } satisfies MetaRecord);
  return next;
}

export async function probeIndexedDbCashierDurability(options?: {
  requestPersistence?: boolean;
}): Promise<IndexedDbCashierDurabilityProbe> {
  if (typeof indexedDB === 'undefined') {
    return {
      provider: 'indexeddb',
      available: false,
      persisted: false,
      persistence_requested: false,
      durability: 'unavailable',
      production_certified: false,
      reason: 'indexeddb_unavailable',
    };
  }

  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  let persisted = false;
  let persistenceRequested = false;
  let quota: number | undefined;
  let usage: number | undefined;

  try {
    persisted = Boolean(await storage?.persisted?.());
    if (!persisted && options?.requestPersistence && storage?.persist) {
      persistenceRequested = true;
      persisted = Boolean(await storage.persist());
    }
    const estimate = await storage?.estimate?.();
    if (typeof estimate?.quota === 'number' && Number.isFinite(estimate.quota)) {
      quota = estimate.quota;
    }
    if (typeof estimate?.usage === 'number' && Number.isFinite(estimate.usage)) {
      usage = estimate.usage;
    }
  } catch {
    // Persistence/quota support is advisory. Never promote a failed probe to
    // production-certified status.
  }

  return {
    provider: 'indexeddb',
    available: true,
    persisted,
    persistence_requested: persistenceRequested,
    ...(quota !== undefined ? { quota_bytes: quota } : {}),
    ...(usage !== undefined ? { usage_bytes: usage } : {}),
    durability: persisted ? 'persistent' : 'best_effort',
    production_certified: false,
    reason: persisted
      ? 'prototype_requires_restart_backup_and_browser_matrix_certification'
      : 'persistent_storage_not_confirmed',
  };
}

export class IndexedDbCashierAuthority implements CashierLocalAuthority {
  private readonly localMerchantId: string;
  private readonly cloudMerchantId?: string;
  private readonly deviceId: string;
  private readonly now: () => Date;
  private readonly databasePromise: Promise<IDBDatabase>;

  constructor(config: IndexedDbCashierConfig) {
    this.localMerchantId = requiredIdentifier(
      config.localMerchantId,
      'local merchant id',
    );
    this.cloudMerchantId = config.cloudMerchantId
      ? requiredIdentifier(config.cloudMerchantId, 'cloud merchant id')
      : undefined;
    this.deviceId = requiredIdentifier(config.deviceId, 'device id');
    this.now = config.now || (() => new Date());
    // Keep the original database name so schema v1 installations upgrade in place.
    this.databasePromise = openDatabase(
      config.databaseName || `fawri-cashier-${this.localMerchantId}-v1`,
    );
  }

  private get pricingMerchantId(): string {
    return this.cloudMerchantId || this.localMerchantId;
  }

  async close(): Promise<void> {
    (await this.databasePromise).close();
  }

  /**
   * Catalog ingress stores base commerce facts only. Legacy effective-price and
   * promotion projections are deliberately discarded so sale commit cannot use
   * stale scheduled/minimum-subtotal promotion results.
   */
  async upsertCatalogSnapshot(
    items: CashierCatalogLookup[],
    options: IndexedDbCatalogSeedOptions = {},
  ): Promise<void> {
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_CATALOG, 'readwrite');
    const completion = writeTransactionDone(transaction);
    const store = transaction.objectStore(STORE_CATALOG);
    const preserveInventory = options.preserveLocalInventory !== false;
    const timestamp = validInstant(this.now(), 'catalog snapshot time');

    try {
      for (const item of items) {
        validateCatalogItem(item);
        const key = catalogKey(item.product_id, item.variant_id);
        const existing = preserveInventory
          ? ((await requestResult(store.get(key))) as CatalogRecord | undefined)
          : undefined;
        const {
          effective_unit_price_minor: _legacyEffective,
          promotion: _legacyPromotion,
          ...baseItem
        } = item;
        store.put({
          ...baseItem,
          ...(existing?.track_inventory && item.track_inventory
            ? { stock_quantity: existing.stock_quantity }
            : {}),
          key,
          local_updated_at: timestamp,
        } satisfies CatalogRecord);
      }
      await completion;
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }

  /**
   * Replace the complete local promotion projection atomically. Removed cloud
   * promotions therefore cannot survive locally as stale pricing rules.
   */
  async replacePromotionSnapshot(rules: CashierPromotionRule[]): Promise<void> {
    const timestampDate = this.now();
    const timestamp = validInstant(timestampDate, 'promotion snapshot time');
    const seen = new Set<string>();
    for (const rule of rules) {
      const id = requiredIdentifier(rule.id, 'promotion id');
      if (seen.has(id)) {
        throw new CashierIndexedDbError(
          'CASHIER_PROMOTION_SNAPSHOT_DUPLICATE',
          'Promotion snapshot contains a duplicate promotion id',
        );
      }
      seen.add(id);
      cashierPromotionLifecycleAt(rule, timestampDate);
      if (rule.merchant_id !== this.pricingMerchantId) {
        throw new CashierIndexedDbError(
          'CASHIER_PROMOTION_MERCHANT_MISMATCH',
          'Promotion snapshot belongs to a different merchant',
        );
      }
    }

    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_PROMOTIONS, 'readwrite');
    const completion = writeTransactionDone(transaction);
    const store = transaction.objectStore(STORE_PROMOTIONS);
    try {
      store.clear();
      for (const rule of rules) {
        store.put({ ...rule, local_updated_at: timestamp } satisfies PromotionRecord);
      }
      await completion;
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }

  private async lookupByIndex(
    indexName: 'barcode' | 'sku',
    value: string,
  ): Promise<CashierCatalogLookup | null> {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_CATALOG, 'readonly');
    const records = (await requestResult(
      transaction.objectStore(STORE_CATALOG).index(indexName).getAll(normalized, 2),
    )) as CatalogRecord[];
    if (records.length > 1) {
      throw new CashierIndexedDbError(
        indexName === 'barcode'
          ? 'CASHIER_BARCODE_AMBIGUOUS'
          : 'CASHIER_SKU_AMBIGUOUS',
        `Local ${indexName} resolves to more than one catalog item`,
      );
    }
    return records[0] ? withoutCatalogMetadata(records[0]) : null;
  }

  lookupByBarcode(barcode: string): Promise<CashierCatalogLookup | null> {
    return this.lookupByIndex('barcode', barcode);
  }

  lookupBySku(sku: string): Promise<CashierCatalogLookup | null> {
    return this.lookupByIndex('sku', sku);
  }

  async getCatalogItem(
    productId: string,
    variantId?: string,
  ): Promise<CashierCatalogLookup | null> {
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_CATALOG, 'readonly');
    const record = (await requestResult(
      transaction.objectStore(STORE_CATALOG).get(catalogKey(productId, variantId)),
    )) as CatalogRecord | undefined;
    return record ? withoutCatalogMetadata(record) : null;
  }

  private async replayCommittedOperation(
    sales: IDBObjectStore,
    movements: IDBObjectStore,
    outbox: IDBObjectStore,
    operationId: string,
  ): Promise<CashierCommitSaleResult | null> {
    const existing = (await requestResult(
      sales.index('operation_id').get(operationId),
    )) as CashierSaleSnapshot | undefined;
    if (!existing) return null;
    const existingMovements = (await requestResult(
      movements.index('operation_id').getAll(operationId),
    )) as CashierInventoryMovement[];
    const existingOutbox = (await requestResult(
      outbox.index('operation_id').getAll(operationId),
    )) as OutboxRecord[];
    return {
      sale: existing,
      inventory_movements: existingMovements,
      outbox: existingOutbox.map(({ outbox_id: _id, ...envelope }) => envelope),
    };
  }

  async commitSale(input: CashierCommitSaleInput): Promise<CashierCommitSaleResult> {
    const operationId = requiredIdentifier(input.operation_id, 'operation id');
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new CashierIndexedDbError(
        'CASHIER_SALE_LINES_REQUIRED',
        'At least one sale line is required',
      );
    }
    if (input.payment_status === 'failed') {
      throw new CashierIndexedDbError(
        'CASHIER_FAILED_PAYMENT_NOT_SALE',
        'A failed payment must not be committed as a completed cashier sale',
      );
    }
    for (const line of input.lines) {
      if (!isPositiveSafeInteger(line.quantity)) {
        throw new CashierIndexedDbError(
          'CASHIER_SALE_QUANTITY_INVALID',
          'Sale quantity must be a positive safe integer',
        );
      }
    }

    const database = await this.databasePromise;
    const transaction = database.transaction(
      [
        STORE_META,
        STORE_CATALOG,
        STORE_PROMOTIONS,
        STORE_SALES,
        STORE_MOVEMENTS,
        STORE_OUTBOX,
      ],
      'readwrite',
    );
    const completion = writeTransactionDone(transaction);
    const meta = transaction.objectStore(STORE_META);
    const catalog = transaction.objectStore(STORE_CATALOG);
    const promotions = transaction.objectStore(STORE_PROMOTIONS);
    const sales = transaction.objectStore(STORE_SALES);
    const movements = transaction.objectStore(STORE_MOVEMENTS);
    const outbox = transaction.objectStore(STORE_OUTBOX);

    try {
      const replay = await this.replayCommittedOperation(
        sales,
        movements,
        outbox,
        operationId,
      );
      if (replay) {
        await completion;
        return replay;
      }

      const recordRequests = input.lines.map(line =>
        requestResult(catalog.get(catalogKey(line.product_id, line.variant_id))),
      );
      const rawRecords = (await Promise.all(recordRequests)) as Array<
        CatalogRecord | undefined
      >;
      const records = rawRecords.map((record, index) => {
        if (!record) {
          throw new CashierIndexedDbError(
            'CASHIER_CATALOG_ITEM_NOT_FOUND',
            'Sale item is not available in the local catalog',
          );
        }
        validateCatalogItem(record);
        if (record.track_inventory) {
          const currentStock = Number(record.stock_quantity);
          if (!isNonNegativeSafeInteger(currentStock)) {
            throw new CashierIndexedDbError(
              'CASHIER_LOCAL_STOCK_CORRUPT',
              'Local stock projection is corrupt',
            );
          }
          if (currentStock < input.lines[index].quantity) {
            throw new CashierIndexedDbError(
              'CASHIER_OUT_OF_STOCK',
              'Insufficient local stock for this sale',
            );
          }
        }
        return record;
      });

      const promotionRecords = (await requestResult(
        promotions.getAll(),
      )) as PromotionRecord[];
      const promotionRules: CashierPromotionRule[] = promotionRecords.map(
        ({ local_updated_at: _localUpdatedAt, ...rule }) => rule,
      );
      const occurredAtDate = this.now();
      validInstant(occurredAtDate, 'sale time');

      // Pricing is fully resolved before inventory/sale/outbox writes. Any stale,
      // corrupt, conflicting, mixed-currency, or time-invalid promotion state
      // throws here and the transaction is aborted without partial writes.
      const pricing = resolveCashierSalePricing({
        merchantId: this.pricingMerchantId,
        catalog: records.map(pricingCatalogItem),
        promotions: promotionRules,
        lines: input.lines,
        at: occurredAtDate,
      });

      const manualDiscountMinor = Number(input.manual_discount_minor || 0);
      if (
        !isNonNegativeSafeInteger(manualDiscountMinor) ||
        manualDiscountMinor > pricing.total_minor
      ) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_INVALID',
          'Manual discount must be a safe amount not exceeding the post-promotion total',
        );
      }
      const manualDiscountKind = input.manual_discount_kind;
      if (
        manualDiscountMinor > 0 &&
        manualDiscountKind !== 'amount' &&
        manualDiscountKind !== 'percentage'
      ) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_INVALID',
          'Manual discount type is required for a manual discount',
        );
      }
      if (manualDiscountMinor === 0 && manualDiscountKind !== undefined) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_INVALID',
          'Manual discount type cannot exist without a manual discount',
        );
      }
      const manualDiscountReason = String(input.manual_discount_reason || '')
        .normalize('NFKC')
        .trim();
      if (
        manualDiscountMinor > 0 &&
        (!manualDiscountReason || manualDiscountReason.length > 200 || /[\u0000-\u001f\u007f]/.test(manualDiscountReason))
      ) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
          'A valid reason is required for a manual discount',
        );
      }
      if (manualDiscountMinor === 0 && manualDiscountReason) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_INVALID',
          'A manual discount reason cannot exist without a manual discount',
        );
      }
      const manualDiscountOverrideApprovalId = input.manual_discount_override_approval_id
        ? requiredIdentifier(
            input.manual_discount_override_approval_id,
            'manual discount override approval id',
          )
        : undefined;
      if (manualDiscountMinor === 0 && manualDiscountOverrideApprovalId) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_INVALID',
          'Manager approval proof cannot exist without a manual discount',
        );
      }
      const finalTotalMinor = pricing.total_minor - manualDiscountMinor;
      const totalDiscountMinor = pricing.discount_minor + manualDiscountMinor;
      if (
        !isNonNegativeSafeInteger(finalTotalMinor) ||
        !isNonNegativeSafeInteger(totalDiscountMinor)
      ) {
        throw new CashierIndexedDbError(
          'CASHIER_MANUAL_DISCOUNT_INVALID',
          'Manual discount arithmetic is unsafe',
        );
      }

      let cashTenderedMinor: number | undefined;
      let changeDueMinor: number | undefined;
      const hasCashTenderMetadata =
        input.cash_tendered_minor !== undefined || input.change_due_minor !== undefined;
      if (input.payment_method === 'cash') {
        // Legacy queued cash sales created before P1 may omit tender metadata.
        // New P1 UI always sends both values; when present they are validated
        // against the authoritative final total after promotions/manual discount.
        if (hasCashTenderMetadata) {
          if (
            !isNonNegativeSafeInteger(Number(input.cash_tendered_minor)) ||
            !isNonNegativeSafeInteger(Number(input.change_due_minor))
          ) {
            throw new CashierIndexedDbError(
              'CASHIER_CASH_TENDER_INVALID',
              'Cash tender and change must be safe non-negative minor-unit integers',
            );
          }
          cashTenderedMinor = Number(input.cash_tendered_minor);
          changeDueMinor = Number(input.change_due_minor);
          if (cashTenderedMinor < finalTotalMinor) {
            throw new CashierIndexedDbError(
              'CASHIER_CASH_TENDER_INSUFFICIENT',
              'Cash received is less than the sale total',
            );
          }
          const expectedChange = cashTenderedMinor - finalTotalMinor;
          if (!Number.isSafeInteger(expectedChange) || changeDueMinor !== expectedChange) {
            throw new CashierIndexedDbError(
              'CASHIER_CASH_CHANGE_INVALID',
              'Cash change does not match the authoritative sale total',
            );
          }
        }
      } else if (hasCashTenderMetadata) {
        throw new CashierIndexedDbError(
          'CASHIER_CASH_TENDER_PAYMENT_METHOD_INVALID',
          'Cash tender metadata is allowed only for cash payments',
        );
      }

      const deviceSequence = await nextDeviceSequence(meta);
      const occurredAt = pricing.priced_at;
      const inventoryMovements: CashierInventoryMovement[] = [];

      for (const [index, record] of records.entries()) {
        const inputLine = input.lines[index];
        if (!record.track_inventory) continue;
        const currentStock = Number(record.stock_quantity);
        record.stock_quantity = currentStock - inputLine.quantity;
        record.local_updated_at = occurredAt;
        catalog.put(record);

        const movement: CashierInventoryMovement = {
          movement_id: movementId(operationId, index),
          operation_id: operationId,
          local_merchant_id: this.localMerchantId,
          ...(this.cloudMerchantId
            ? { cloud_merchant_id: this.cloudMerchantId }
            : {}),
          device_id: this.deviceId,
          device_sequence: deviceSequence,
          product_id: record.product_id,
          ...(record.variant_id ? { variant_id: record.variant_id } : {}),
          delta: -inputLine.quantity,
          reason: 'sale',
          related_sale_id: saleId(operationId),
          occurred_at: occurredAt,
        };
        movements.put(movement);
        inventoryMovements.push(movement);
      }

      const saleLines: CashierSaleLineSnapshot[] = pricing.lines.map(
        (line, index) => ({
          line_id: lineId(operationId, index),
          ...line,
          ...(records[index].unit_cost_minor !== undefined
            ? { unit_cost_minor: records[index].unit_cost_minor }
            : {}),
        }),
      );

      const sale: CashierSaleSnapshot = {
        sale_id: saleId(operationId),
        operation_id: operationId,
        local_merchant_id: this.localMerchantId,
        ...(this.cloudMerchantId
          ? { cloud_merchant_id: this.cloudMerchantId }
          : {}),
        device_id: this.deviceId,
        device_sequence: deviceSequence,
        source: 'cashier',
        status: 'completed',
        lines: saleLines,
        subtotal_minor: pricing.subtotal_minor,
        promotion_discount_minor: pricing.discount_minor,
        ...(manualDiscountMinor > 0
          ? {
              manual_discount_kind: manualDiscountKind,
              manual_discount_minor: manualDiscountMinor,
              manual_discount_reason: manualDiscountReason,
              ...(manualDiscountOverrideApprovalId
                ? {
                    manual_discount_override_approval_id:
                      manualDiscountOverrideApprovalId,
                  }
                : {}),
            }
          : {}),
        discount_minor: totalDiscountMinor,
        total_minor: finalTotalMinor,
        currency_code: pricing.currency_code,
        currency_fraction_digits: pricing.currency_fraction_digits,
        payment_method: input.payment_method,
        payment_status: input.payment_status,
        ...(cashTenderedMinor !== undefined
          ? { cash_tendered_minor: cashTenderedMinor }
          : {}),
        ...(changeDueMinor !== undefined
          ? { change_due_minor: changeDueMinor }
          : {}),
        ...(input.payment_provider
          ? { payment_provider: input.payment_provider.trim() }
          : {}),
        ...(input.payment_reference
          ? { payment_reference: input.payment_reference.trim() }
          : {}),
        ...(input.note ? { note: input.note.trim() } : {}),
        occurred_at: occurredAt,
      };
      sales.put(sale);

      const envelopes: CashierSyncEnvelope[] = [];
      const saleEnvelope: CashierSyncEnvelope<CashierSaleSnapshot> = {
        schema_version: CASHIER_LOCAL_SCHEMA_VERSION,
        operation_id: operationId,
        device_id: this.deviceId,
        device_sequence: deviceSequence,
        entity_type: 'sale',
        entity_id: sale.sale_id,
        operation: 'append',
        occurred_at: occurredAt,
        payload: sale,
      };
      outbox.put({
        ...saleEnvelope,
        outbox_id: outboxId(operationId, 'sale', sale.sale_id),
      } satisfies OutboxRecord);
      envelopes.push(saleEnvelope);

      for (const movement of inventoryMovements) {
        const envelope: CashierSyncEnvelope<CashierInventoryMovement> = {
          schema_version: CASHIER_LOCAL_SCHEMA_VERSION,
          operation_id: operationId,
          device_id: this.deviceId,
          device_sequence: deviceSequence,
          entity_type: 'inventory_movement',
          entity_id: movement.movement_id,
          operation: 'append',
          occurred_at: occurredAt,
          payload: movement,
        };
        outbox.put({
          ...envelope,
          outbox_id: outboxId(
            operationId,
            'inventory_movement',
            movement.movement_id,
          ),
        } satisfies OutboxRecord);
        envelopes.push(envelope);
      }

      await completion;
      return { sale, inventory_movements: inventoryMovements, outbox: envelopes };
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }

  async adjustInventory(
    input: CashierInventoryAdjustmentInput,
  ): Promise<CashierInventoryMovement> {
    const operationId = requiredIdentifier(input.operation_id, 'operation id');

    if (this.cloudMerchantId) {
      const session = await getCashierOperatorSession();
      if (!session) {
        throw new CashierIndexedDbError(
          'CASHIER_OPERATOR_LOGIN_REQUIRED',
          'Cashier operator login is required for inventory adjustment',
        );
      }
      if (
        session.context.merchant_id !== this.cloudMerchantId ||
        session.context.device_id !== this.deviceId
      ) {
        throw new CashierIndexedDbError(
          'CASHIER_OPERATOR_CONTEXT_MISMATCH',
          'Cashier inventory adjustment does not match the active operator context',
        );
      }
      if (!cashierOperatorCan(session, 'inventory.adjust')) {
        throw new CashierIndexedDbError(
          'CASHIER_OPERATOR_PERMISSION_REQUIRED',
          'Inventory adjustment permission is required',
        );
      }
      await bindCashierOperationToCurrentOperator(
        operationId,
        'inventory_adjustment',
      );
    }
    if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
      throw new CashierIndexedDbError(
        'CASHIER_INVENTORY_DELTA_INVALID',
        'Inventory adjustment must be a non-zero safe integer',
      );
    }

    const database = await this.databasePromise;
    const transaction = database.transaction(
      [STORE_META, STORE_CATALOG, STORE_MOVEMENTS, STORE_OUTBOX],
      'readwrite',
    );
    const completion = writeTransactionDone(transaction);
    const meta = transaction.objectStore(STORE_META);
    const catalog = transaction.objectStore(STORE_CATALOG);
    const movements = transaction.objectStore(STORE_MOVEMENTS);
    const outbox = transaction.objectStore(STORE_OUTBOX);

    try {
      const existing = (await requestResult(
        movements.index('operation_id').get(operationId),
      )) as CashierInventoryMovement | undefined;
      if (existing) {
        await completion;
        return existing;
      }

      const record = (await requestResult(
        catalog.get(catalogKey(input.product_id, input.variant_id)),
      )) as CatalogRecord | undefined;
      if (!record) {
        throw new CashierIndexedDbError(
          'CASHIER_CATALOG_ITEM_NOT_FOUND',
          'Inventory item is not available in the local catalog',
        );
      }
      if (!record.track_inventory) {
        throw new CashierIndexedDbError(
          'CASHIER_INVENTORY_NOT_TRACKED',
          'This catalog item does not track inventory',
        );
      }

      const currentStock = Number(record.stock_quantity);
      const nextStock = currentStock + input.delta;
      if (
        !isNonNegativeSafeInteger(currentStock) ||
        !isNonNegativeSafeInteger(nextStock)
      ) {
        throw new CashierIndexedDbError(
          'CASHIER_INVENTORY_RESULT_INVALID',
          'Inventory adjustment would produce an invalid stock quantity',
        );
      }

      const deviceSequence = await nextDeviceSequence(meta);
      const occurredAt = validInstant(this.now(), 'inventory adjustment time');
      record.stock_quantity = nextStock;
      record.local_updated_at = occurredAt;
      catalog.put(record);

      const movement: CashierInventoryMovement = {
        movement_id: movementId(operationId, 0),
        operation_id: operationId,
        local_merchant_id: this.localMerchantId,
        ...(this.cloudMerchantId
          ? { cloud_merchant_id: this.cloudMerchantId }
          : {}),
        device_id: this.deviceId,
        device_sequence: deviceSequence,
        product_id: record.product_id,
        ...(record.variant_id ? { variant_id: record.variant_id } : {}),
        delta: input.delta,
        reason: input.reason,
        ...(input.related_sale_id
          ? { related_sale_id: input.related_sale_id.trim() }
          : {}),
        ...(input.note ? { note: input.note.trim() } : {}),
        occurred_at: occurredAt,
      };
      movements.put(movement);

      const envelope: CashierSyncEnvelope<CashierInventoryMovement> = {
        schema_version: CASHIER_LOCAL_SCHEMA_VERSION,
        operation_id: operationId,
        device_id: this.deviceId,
        device_sequence: deviceSequence,
        entity_type: 'inventory_movement',
        entity_id: movement.movement_id,
        operation: 'append',
        occurred_at: occurredAt,
        payload: movement,
      };
      outbox.put({
        ...envelope,
        outbox_id: outboxId(
          operationId,
          'inventory_movement',
          movement.movement_id,
        ),
      } satisfies OutboxRecord);

      await completion;
      return movement;
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }

  async getSale(saleIdValue: string): Promise<CashierSaleSnapshot | null> {
    const normalized = requiredIdentifier(saleIdValue, 'sale id');
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_SALES, 'readonly');
    return (
      ((await requestResult(
        transaction.objectStore(STORE_SALES).get(normalized),
      )) as CashierSaleSnapshot | undefined) || null
    );
  }

  async listSales(limit = 100): Promise<CashierSaleSnapshot[]> {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit || 100)));
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_SALES, 'readonly');
    const sales = (await requestResult(
      transaction.objectStore(STORE_SALES).getAll(),
    )) as CashierSaleSnapshot[];
    return sales
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, safeLimit);
  }

  async listPendingSync(limit = 100): Promise<CashierSyncEnvelope[]> {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit || 100)));
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_OUTBOX, 'readonly');
    const records = (await requestResult(
      transaction.objectStore(STORE_OUTBOX).getAll(),
    )) as OutboxRecord[];
    return records
      .sort((left, right) => {
        const bySequence = left.device_sequence - right.device_sequence;
        return bySequence || left.outbox_id.localeCompare(right.outbox_id);
      })
      .slice(0, safeLimit)
      .map(({ outbox_id: _id, ...envelope }) => envelope);
  }

  async acknowledgeSynced(operationIds: string[]): Promise<void> {
    const ids = [...new Set(operationIds.map(value => String(value || '').trim()))]
      .filter(Boolean);
    if (ids.length === 0) return;

    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_OUTBOX, 'readwrite');
    const completion = writeTransactionDone(transaction);
    const outbox = transaction.objectStore(STORE_OUTBOX);
    const operationIndex = outbox.index('operation_id');

    try {
      for (const operationId of ids) {
        const keys = await requestResult(operationIndex.getAllKeys(operationId));
        for (const key of keys) outbox.delete(key);
      }
      await completion;
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }
}
