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

const DATABASE_VERSION = 1;
const STORE_META = 'meta';
const STORE_CATALOG = 'catalog';
const STORE_SALES = 'sales';
const STORE_MOVEMENTS = 'inventory_movements';
const STORE_OUTBOX = 'outbox';
const META_DEVICE_SEQUENCE = 'device_sequence';

type MetaRecord = { key: string; value: number | string };
type CatalogRecord = CashierCatalogLookup & {
  key: string;
  local_updated_at: string;
};
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
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 200) {
    throw new CashierIndexedDbError(
      'CASHIER_LOCAL_IDENTIFIER_INVALID',
      `${label} is required`,
    );
  }
  return normalized;
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
  if (
    !isNonNegativeSafeInteger(item.base_unit_price_minor) ||
    !isNonNegativeSafeInteger(item.effective_unit_price_minor) ||
    item.effective_unit_price_minor > item.base_unit_price_minor
  ) {
    throw new CashierIndexedDbError(
      'CASHIER_CATALOG_PRICE_INVALID',
      'Catalog prices must be safe non-negative minor units and effective price cannot exceed base price',
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
    this.databasePromise = openDatabase(
      config.databaseName || `fawri-cashier-${this.localMerchantId}-v1`,
    );
  }

  async close(): Promise<void> {
    (await this.databasePromise).close();
  }

  /**
   * Prototype catalog ingress. It deliberately preserves locally-adjusted stock
   * by default; cloud/local stock reconciliation is a later sync gate.
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
    const timestamp = this.now().toISOString();

    try {
      for (const item of items) {
        validateCatalogItem(item);
        const key = catalogKey(item.product_id, item.variant_id);
        const existing = preserveInventory
          ? ((await requestResult(store.get(key))) as CatalogRecord | undefined)
          : undefined;
        store.put({
          ...item,
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

    const database = await this.databasePromise;
    const transaction = database.transaction(
      [STORE_META, STORE_CATALOG, STORE_SALES, STORE_MOVEMENTS, STORE_OUTBOX],
      'readwrite',
    );
    const completion = writeTransactionDone(transaction);
    const meta = transaction.objectStore(STORE_META);
    const catalog = transaction.objectStore(STORE_CATALOG);
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

      const deviceSequence = await nextDeviceSequence(meta);
      const occurredAt = this.now().toISOString();
      const saleLines: CashierSaleLineSnapshot[] = [];
      const inventoryMovements: CashierInventoryMovement[] = [];
      let currencyCode: string | undefined;
      let fractionDigits: number | undefined;
      let subtotalMinor = 0;
      let discountMinor = 0;
      let totalMinor = 0;

      for (const [index, inputLine] of input.lines.entries()) {
        if (!isPositiveSafeInteger(inputLine.quantity)) {
          throw new CashierIndexedDbError(
            'CASHIER_SALE_QUANTITY_INVALID',
            'Sale quantity must be a positive safe integer',
          );
        }

        const record = (await requestResult(
          catalog.get(catalogKey(inputLine.product_id, inputLine.variant_id)),
        )) as CatalogRecord | undefined;
        if (!record) {
          throw new CashierIndexedDbError(
            'CASHIER_CATALOG_ITEM_NOT_FOUND',
            'Sale item is not available in the local catalog',
          );
        }
        validateCatalogItem(record);

        if (currencyCode === undefined) {
          currencyCode = record.currency_code;
          fractionDigits = record.currency_fraction_digits;
        } else if (
          currencyCode !== record.currency_code ||
          fractionDigits !== record.currency_fraction_digits
        ) {
          throw new CashierIndexedDbError(
            'CASHIER_SALE_CURRENCY_MISMATCH',
            'All sale lines must use the same currency context',
          );
        }

        if (record.track_inventory) {
          const currentStock = Number(record.stock_quantity);
          if (!isNonNegativeSafeInteger(currentStock)) {
            throw new CashierIndexedDbError(
              'CASHIER_LOCAL_STOCK_CORRUPT',
              'Local stock projection is corrupt',
            );
          }
          if (currentStock < inputLine.quantity) {
            throw new CashierIndexedDbError(
              'CASHIER_OUT_OF_STOCK',
              'Insufficient local stock for this sale',
            );
          }
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

        const baseLineTotal = record.base_unit_price_minor * inputLine.quantity;
        const effectiveLineTotal =
          record.effective_unit_price_minor * inputLine.quantity;
        if (
          !Number.isSafeInteger(baseLineTotal) ||
          !Number.isSafeInteger(effectiveLineTotal)
        ) {
          throw new CashierIndexedDbError(
            'CASHIER_SALE_TOTAL_OVERFLOW',
            'Sale total exceeds the safe integer range',
          );
        }
        const lineDiscount = baseLineTotal - effectiveLineTotal;

        saleLines.push({
          line_id: lineId(operationId, index),
          product_id: record.product_id,
          ...(record.variant_id ? { variant_id: record.variant_id } : {}),
          product_name_snapshot: record.name,
          ...(record.variant_name
            ? { variant_name_snapshot: record.variant_name }
            : {}),
          ...(record.sku ? { sku_snapshot: record.sku } : {}),
          ...(record.barcode ? { barcode_snapshot: record.barcode } : {}),
          quantity: inputLine.quantity,
          base_unit_price_minor: record.base_unit_price_minor,
          effective_unit_price_minor: record.effective_unit_price_minor,
          discount_minor: lineDiscount,
          line_total_minor: effectiveLineTotal,
          ...(record.promotion ? { promotion: record.promotion } : {}),
        });

        subtotalMinor += baseLineTotal;
        discountMinor += lineDiscount;
        totalMinor += effectiveLineTotal;
        if (
          !Number.isSafeInteger(subtotalMinor) ||
          !Number.isSafeInteger(discountMinor) ||
          !Number.isSafeInteger(totalMinor)
        ) {
          throw new CashierIndexedDbError(
            'CASHIER_SALE_TOTAL_OVERFLOW',
            'Sale total exceeds the safe integer range',
          );
        }
      }

      if (currencyCode === undefined || fractionDigits === undefined) {
        throw new CashierIndexedDbError(
          'CASHIER_SALE_CURRENCY_REQUIRED',
          'Sale currency context is unavailable',
        );
      }

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
        subtotal_minor: subtotalMinor,
        discount_minor: discountMinor,
        total_minor: totalMinor,
        currency_code: currencyCode,
        currency_fraction_digits: fractionDigits,
        payment_method: input.payment_method,
        payment_status: input.payment_status,
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
      const occurredAt = this.now().toISOString();
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
