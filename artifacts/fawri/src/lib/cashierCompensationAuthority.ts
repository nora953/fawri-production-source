import {
  CASHIER_LOCAL_SCHEMA_VERSION,
  type CashierInventoryMovement,
  type CashierReturnSaleInput,
  type CashierReturnSaleResult,
  type CashierReturnSnapshot,
  type CashierSaleCompensationAuthority,
  type CashierSaleLineSnapshot,
  type CashierSaleSnapshot,
  type CashierSyncEnvelope,
  type CashierVoidSaleInput,
  type CashierVoidSaleResult,
  type CashierSaleVoidSnapshot,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
} from './cashierLocalContracts';
import type { IndexedDbCashierConfig } from './cashierIndexedDbAuthority';
import {
  CASHIER_REFUND_PRICING_VERSION,
  cashierNetReturnRefundMinor,
} from './cashierRefundPricing';

const DATABASE_VERSION = 2;
const STORE_META = 'meta';
const STORE_CATALOG = 'catalog';
const STORE_PROMOTIONS = 'promotions';
const STORE_SALES = 'sales';
const STORE_MOVEMENTS = 'inventory_movements';
const STORE_OUTBOX = 'outbox';
const META_DEVICE_SEQUENCE = 'device_sequence';
const META_COMPENSATION_PREFIX = 'compensation_operation:';

type MetaRecord = { key: string; value: number | string };
type CatalogRecord = {
  key: string;
  product_id: string;
  variant_id?: string;
  track_inventory: boolean;
  stock_quantity?: number;
  local_updated_at: string;
  [key: string]: unknown;
};
type OutboxRecord = CashierSyncEnvelope & { outbox_id: string };
type CompensationOperationRecord = {
  kind: 'return' | 'void';
  sale_id: string;
  entity_id: string;
};

export class CashierCompensationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierCompensationError';
    this.code = code;
  }
}

function requiredIdentifier(value: unknown, label: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200) {
    throw new CashierCompensationError(
      'CASHIER_COMPENSATION_IDENTIFIER_INVALID',
      `${label} is required`,
    );
  }
  return normalized;
}

function optionalNote(value: unknown): string | undefined {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized) return undefined;
  if (normalized.length > 2_000) {
    throw new CashierCompensationError(
      'CASHIER_COMPENSATION_NOTE_INVALID',
      'compensation note is too long',
    );
  }
  return normalized;
}

function catalogKey(productId: string, variantId?: string): string {
  return `${requiredIdentifier(productId, 'product id')}\u0000${String(variantId || '').trim()}`;
}

function movementId(operationId: string, index: number): string {
  return `movement:${operationId}:${index + 1}`;
}

function returnId(operationId: string): string {
  return `return:${operationId}`;
}

function outboxId(
  operationId: string,
  entityType: CashierSyncEnvelope['entity_type'],
  entityId: string,
): string {
  return `outbox:${operationId}:${entityType}:${entityId}`;
}

function compensationMetaKey(operationId: string): string {
  return `${META_COMPENSATION_PREFIX}${operationId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
          new CashierCompensationError(
            'CASHIER_COMPENSATION_STORAGE_REQUEST_FAILED',
            'IndexedDB request failed',
          ),
      );
  });
}

function writeTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ||
          new CashierCompensationError(
            'CASHIER_COMPENSATION_TRANSACTION_FAILED',
            'IndexedDB compensation transaction failed',
          ),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ||
          new CashierCompensationError(
            'CASHIER_COMPENSATION_TRANSACTION_ABORTED',
            'IndexedDB compensation transaction was aborted',
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
    const outbox = database.createObjectStore(STORE_OUTBOX, { keyPath: 'outbox_id' });
    outbox.createIndex('operation_id', 'operation_id', { unique: false });
    outbox.createIndex('device_sequence', 'device_sequence', { unique: false });
  }
}

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierCompensationError(
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
          new CashierCompensationError(
            'CASHIER_INDEXEDDB_OPEN_FAILED',
            'Could not open the local cashier database',
          ),
      );
    request.onblocked = () =>
      reject(
        new CashierCompensationError(
          'CASHIER_INDEXEDDB_BLOCKED',
          'The local cashier database is blocked by another app tab',
        ),
      );
  });
}

function validInstant(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new CashierCompensationError(
      'CASHIER_COMPENSATION_TIME_INVALID',
      'compensation time is invalid',
    );
  }
  return value.toISOString();
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierCompensationError(
      'CASHIER_COMPENSATION_AMOUNT_OVERFLOW',
      `${label} exceeds the safe integer range`,
    );
  }
  return result;
}

function safeMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierCompensationError(
      'CASHIER_COMPENSATION_AMOUNT_OVERFLOW',
      `${label} exceeds the safe integer range`,
    );
  }
  return result;
}

async function nextDeviceSequence(meta: IDBObjectStore): Promise<number> {
  const current = (await requestResult(meta.get(META_DEVICE_SEQUENCE))) as
    | MetaRecord
    | undefined;
  const previous = Number(current?.value || 0);
  if (!Number.isSafeInteger(previous) || previous < 0) {
    throw new CashierCompensationError(
      'CASHIER_DEVICE_SEQUENCE_CORRUPT',
      'Local device sequence is corrupt',
    );
  }
  const next = previous + 1;
  if (!Number.isSafeInteger(next)) {
    throw new CashierCompensationError(
      'CASHIER_DEVICE_SEQUENCE_EXHAUSTED',
      'Local device sequence cannot advance safely',
    );
  }
  meta.put({ key: META_DEVICE_SEQUENCE, value: next } satisfies MetaRecord);
  return next;
}

function parseCompensationOperation(value: unknown): CompensationOperationRecord | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as Partial<CompensationOperationRecord>;
    if (
      (parsed.kind === 'return' || parsed.kind === 'void') &&
      typeof parsed.sale_id === 'string' &&
      typeof parsed.entity_id === 'string'
    ) {
      return parsed as CompensationOperationRecord;
    }
  } catch {
    // handled below
  }
  throw new CashierCompensationError(
    'CASHIER_COMPENSATION_OPERATION_CORRUPT',
    'Stored compensation operation metadata is corrupt',
  );
}

function lineById(sale: CashierSaleSnapshot, lineId: string): {
  line: CashierSaleLineSnapshot;
  index: number;
} {
  const index = sale.lines.findIndex(line => line.line_id === lineId);
  if (index < 0) {
    throw new CashierCompensationError(
      'CASHIER_RETURN_LINE_NOT_FOUND',
      'Return line does not belong to the original sale',
    );
  }
  return { line: sale.lines[index], index };
}

function returnedQuantityForLine(sale: CashierSaleSnapshot, lineId: string): number {
  let total = 0;
  for (const returnSnapshot of sale.returns || []) {
    for (const line of returnSnapshot.lines || []) {
      if (line.original_line_id !== lineId) continue;
      total = safeAdd(total, line.quantity, 'returned quantity');
    }
  }
  return total;
}

function originalSaleMovementId(sale: CashierSaleSnapshot, lineIndex: number): string {
  return `movement:${sale.operation_id}:${lineIndex + 1}`;
}

function compensationOutbox(
  operationId: string,
  deviceId: string,
  deviceSequence: number,
  occurredAt: string,
  entityType: CashierSyncEnvelope['entity_type'],
  entityId: string,
  operation: CashierSyncEnvelope['operation'],
  payload: unknown,
): CashierSyncEnvelope {
  return {
    schema_version: CASHIER_LOCAL_SCHEMA_VERSION,
    operation_id: operationId,
    device_id: deviceId,
    device_sequence: deviceSequence,
    entity_type: entityType,
    entity_id: entityId,
    operation,
    occurred_at: occurredAt,
    payload,
  };
}

export class IndexedDbCashierCompensationAuthority
  implements CashierSaleCompensationAuthority
{
  private readonly localMerchantId: string;
  private readonly cloudMerchantId?: string;
  private readonly deviceId: string;
  private readonly now: () => Date;
  private readonly databasePromise: Promise<IDBDatabase>;

  constructor(config: IndexedDbCashierConfig) {
    this.localMerchantId = requiredIdentifier(config.localMerchantId, 'local merchant id');
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

  private async replayOperation(
    meta: IDBObjectStore,
    sales: IDBObjectStore,
    movements: IDBObjectStore,
    outbox: IDBObjectStore,
    operationId: string,
    expectedKind: 'return' | 'void',
    expectedSaleId: string,
  ): Promise<CashierReturnSaleResult | CashierVoidSaleResult | null> {
    const stored = (await requestResult(meta.get(compensationMetaKey(operationId)))) as
      | MetaRecord
      | undefined;
    if (!stored) return null;
    const operation = parseCompensationOperation(stored.value);
    if (!operation) return null;
    if (operation.kind !== expectedKind || operation.sale_id !== expectedSaleId) {
      throw new CashierCompensationError(
        'CASHIER_COMPENSATION_OPERATION_ID_CONFLICT',
        'operation id is already used by a different compensation',
      );
    }
    const sale = (await requestResult(sales.get(expectedSaleId))) as
      | CashierSaleSnapshot
      | undefined;
    if (!sale) {
      throw new CashierCompensationError(
        'CASHIER_COMPENSATION_REPLAY_CORRUPT',
        'compensation exists but original sale is missing',
      );
    }
    const existingMovements = (await requestResult(
      movements.index('operation_id').getAll(operationId),
    )) as CashierInventoryMovement[];
    const existingOutbox = (await requestResult(
      outbox.index('operation_id').getAll(operationId),
    )) as OutboxRecord[];
    const envelopes = existingOutbox.map(({ outbox_id: _id, ...envelope }) => envelope);

    if (expectedKind === 'return') {
      const snapshot = (sale.returns || []).find(item => item.operation_id === operationId);
      if (!snapshot) {
        throw new CashierCompensationError(
          'CASHIER_COMPENSATION_REPLAY_CORRUPT',
          'return operation metadata exists but return snapshot is missing',
        );
      }
      return {
        sale,
        return_snapshot: snapshot,
        inventory_movements: existingMovements,
        outbox: envelopes,
      };
    }

    if (!sale.void || sale.void.operation_id !== operationId) {
      throw new CashierCompensationError(
        'CASHIER_COMPENSATION_REPLAY_CORRUPT',
        'void operation metadata exists but void snapshot is missing',
      );
    }
    return {
      sale,
      void_snapshot: sale.void,
      inventory_movements: existingMovements,
      outbox: envelopes,
    };
  }

  async returnSale(input: CashierReturnSaleInput): Promise<CashierReturnSaleResult> {
    const operationId = requiredIdentifier(input.operation_id, 'operation id');
    const saleId = requiredIdentifier(input.sale_id, 'sale id');
    const note = optionalNote(input.note);
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new CashierCompensationError(
        'CASHIER_RETURN_LINES_REQUIRED',
        'At least one return line is required',
      );
    }

    const seenLines = new Set<string>();
    const normalizedLines = input.lines.map(line => {
      const originalLineId = requiredIdentifier(line.original_line_id, 'original line id');
      if (seenLines.has(originalLineId)) {
        throw new CashierCompensationError(
          'CASHIER_RETURN_LINE_DUPLICATE',
          'A return request cannot contain the same original line twice',
        );
      }
      seenLines.add(originalLineId);
      if (!isPositiveSafeInteger(line.quantity)) {
        throw new CashierCompensationError(
          'CASHIER_RETURN_QUANTITY_INVALID',
          'Return quantity must be a positive safe integer',
        );
      }
      return { original_line_id: originalLineId, quantity: line.quantity };
    });

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
      const saleOperationCollision = await requestResult(
        sales.index('operation_id').get(operationId),
      );
      if (saleOperationCollision) {
        throw new CashierCompensationError(
          'CASHIER_COMPENSATION_OPERATION_ID_CONFLICT',
          'operation id is already used by a sale',
        );
      }

      const replay = await this.replayOperation(
        meta,
        sales,
        movements,
        outbox,
        operationId,
        'return',
        saleId,
      );
      if (replay) {
        await completion;
        return replay as CashierReturnSaleResult;
      }

      const sale = (await requestResult(sales.get(saleId))) as
        | CashierSaleSnapshot
        | undefined;
      if (!sale) {
        throw new CashierCompensationError(
          'CASHIER_SALE_NOT_FOUND',
          'Original sale was not found',
        );
      }
      if (sale.status !== 'completed' || sale.void) {
        throw new CashierCompensationError(
          'CASHIER_RETURN_SALE_NOT_RETURNABLE',
          'Voided sale cannot be returned',
        );
      }
      if (sale.payment_status !== 'paid') {
        throw new CashierCompensationError(
          'CASHIER_RETURN_PAYMENT_NOT_PAID',
          'Only a paid sale can be returned; pending sales must be voided',
        );
      }

      const originalMovements = (await requestResult(
        movements.index('operation_id').getAll(sale.operation_id),
      )) as CashierInventoryMovement[];
      const deviceSequence = await nextDeviceSequence(meta);
      const occurredAt = validInstant(this.now());
      const returnLines: CashierReturnSnapshot['lines'] = [];
      const compensationMovements: CashierInventoryMovement[] = [];
      let refundTotalMinor = 0;

      for (const [returnIndex, requestLine] of normalizedLines.entries()) {
        const { line, index: saleLineIndex } = lineById(sale, requestLine.original_line_id);
        const alreadyReturned = returnedQuantityForLine(sale, line.line_id);
        const remaining = line.quantity - alreadyReturned;
        if (!Number.isSafeInteger(remaining) || remaining < requestLine.quantity) {
          throw new CashierCompensationError(
            'CASHIER_RETURN_QUANTITY_EXCEEDS_SOLD',
            'Return quantity exceeds the remaining returnable quantity',
          );
        }

        const refundMinor = cashierNetReturnRefundMinor(
          sale,
          line.line_id,
          alreadyReturned,
          requestLine.quantity,
        );
        refundTotalMinor = safeAdd(refundTotalMinor, refundMinor, 'return refund total');
        returnLines.push({
          original_line_id: line.line_id,
          product_id: line.product_id,
          ...(line.variant_id ? { variant_id: line.variant_id } : {}),
          quantity: requestLine.quantity,
          effective_unit_price_minor: line.effective_unit_price_minor,
          refund_minor: refundMinor,
        });

        const originalMovement = originalMovements.find(
          movement =>
            movement.movement_id === originalSaleMovementId(sale, saleLineIndex) &&
            movement.reason === 'sale',
        );
        if (!originalMovement) continue;
        if (originalMovement.delta >= 0 || -originalMovement.delta < line.quantity) {
          throw new CashierCompensationError(
            'CASHIER_ORIGINAL_INVENTORY_MOVEMENT_CORRUPT',
            'Original sale inventory movement is corrupt',
          );
        }

        const key = catalogKey(line.product_id, line.variant_id);
        const record = (await requestResult(catalog.get(key))) as CatalogRecord | undefined;
        if (!record) {
          throw new CashierCompensationError(
            'CASHIER_RETURN_CATALOG_ITEM_MISSING',
            'Inventory-tracked return item is missing from the local catalog',
          );
        }
        const currentStock = Number(record.stock_quantity);
        const nextStock = currentStock + requestLine.quantity;
        if (!isNonNegativeSafeInteger(currentStock) || !isNonNegativeSafeInteger(nextStock)) {
          throw new CashierCompensationError(
            'CASHIER_RETURN_STOCK_INVALID',
            'Return would produce an invalid local stock projection',
          );
        }
        record.stock_quantity = nextStock;
        record.local_updated_at = occurredAt;
        catalog.put(record);

        const movement: CashierInventoryMovement = {
          movement_id: movementId(operationId, returnIndex),
          operation_id: operationId,
          local_merchant_id: this.localMerchantId,
          ...(this.cloudMerchantId ? { cloud_merchant_id: this.cloudMerchantId } : {}),
          device_id: this.deviceId,
          device_sequence: deviceSequence,
          product_id: line.product_id,
          ...(line.variant_id ? { variant_id: line.variant_id } : {}),
          delta: requestLine.quantity,
          reason: 'return',
          related_sale_id: sale.sale_id,
          ...(note ? { note } : {}),
          occurred_at: occurredAt,
        };
        movements.put(movement);
        compensationMovements.push(movement);
      }

      const snapshot: CashierReturnSnapshot = {
        refund_pricing_version: CASHIER_REFUND_PRICING_VERSION,
        return_id: returnId(operationId),
        operation_id: operationId,
        sale_id: sale.sale_id,
        local_merchant_id: this.localMerchantId,
        ...(this.cloudMerchantId ? { cloud_merchant_id: this.cloudMerchantId } : {}),
        device_id: this.deviceId,
        device_sequence: deviceSequence,
        lines: returnLines,
        refund_total_minor: refundTotalMinor,
        currency_code: sale.currency_code,
        currency_fraction_digits: sale.currency_fraction_digits,
        ...(note ? { note } : {}),
        occurred_at: occurredAt,
      };
      const updatedSale: CashierSaleSnapshot = {
        ...sale,
        returns: [...(sale.returns || []), snapshot],
      };
      sales.put(updatedSale);
      meta.put({
        key: compensationMetaKey(operationId),
        value: JSON.stringify({
          kind: 'return',
          sale_id: sale.sale_id,
          entity_id: snapshot.return_id,
        } satisfies CompensationOperationRecord),
      } satisfies MetaRecord);

      const envelopes: CashierSyncEnvelope[] = [];
      const returnEnvelope = compensationOutbox(
        operationId,
        this.deviceId,
        deviceSequence,
        occurredAt,
        'return',
        snapshot.return_id,
        'append',
        snapshot,
      );
      outbox.put({
        ...returnEnvelope,
        outbox_id: outboxId(operationId, 'return', snapshot.return_id),
      } satisfies OutboxRecord);
      envelopes.push(returnEnvelope);

      for (const movement of compensationMovements) {
        const envelope = compensationOutbox(
          operationId,
          this.deviceId,
          deviceSequence,
          occurredAt,
          'inventory_movement',
          movement.movement_id,
          'append',
          movement,
        );
        outbox.put({
          ...envelope,
          outbox_id: outboxId(operationId, 'inventory_movement', movement.movement_id),
        } satisfies OutboxRecord);
        envelopes.push(envelope);
      }

      await completion;
      return {
        sale: updatedSale,
        return_snapshot: snapshot,
        inventory_movements: compensationMovements,
        outbox: envelopes,
      };
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }

  async voidSale(input: CashierVoidSaleInput): Promise<CashierVoidSaleResult> {
    const operationId = requiredIdentifier(input.operation_id, 'operation id');
    const saleId = requiredIdentifier(input.sale_id, 'sale id');
    const note = optionalNote(input.note);

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
      const saleOperationCollision = await requestResult(
        sales.index('operation_id').get(operationId),
      );
      if (saleOperationCollision) {
        throw new CashierCompensationError(
          'CASHIER_COMPENSATION_OPERATION_ID_CONFLICT',
          'operation id is already used by a sale',
        );
      }

      const replay = await this.replayOperation(
        meta,
        sales,
        movements,
        outbox,
        operationId,
        'void',
        saleId,
      );
      if (replay) {
        await completion;
        return replay as CashierVoidSaleResult;
      }

      const sale = (await requestResult(sales.get(saleId))) as
        | CashierSaleSnapshot
        | undefined;
      if (!sale) {
        throw new CashierCompensationError(
          'CASHIER_SALE_NOT_FOUND',
          'Original sale was not found',
        );
      }
      if (sale.status === 'voided' || sale.void) {
        throw new CashierCompensationError(
          'CASHIER_SALE_ALREADY_VOIDED',
          'Sale has already been voided',
        );
      }
      if ((sale.returns || []).length > 0) {
        throw new CashierCompensationError(
          'CASHIER_VOID_AFTER_RETURN_NOT_ALLOWED',
          'A sale with returns cannot be voided; compensate remaining items with returns',
        );
      }

      const originalMovements = (await requestResult(
        movements.index('operation_id').getAll(sale.operation_id),
      )) as CashierInventoryMovement[];
      const deviceSequence = await nextDeviceSequence(meta);
      const occurredAt = validInstant(this.now());
      const compensationMovements: CashierInventoryMovement[] = [];

      for (const [lineIndex, line] of sale.lines.entries()) {
        const originalMovement = originalMovements.find(
          movement =>
            movement.movement_id === originalSaleMovementId(sale, lineIndex) &&
            movement.reason === 'sale',
        );
        if (!originalMovement) continue;
        const restoreQuantity = -originalMovement.delta;
        if (!isPositiveSafeInteger(restoreQuantity) || restoreQuantity < line.quantity) {
          throw new CashierCompensationError(
            'CASHIER_ORIGINAL_INVENTORY_MOVEMENT_CORRUPT',
            'Original sale inventory movement is corrupt',
          );
        }

        const key = catalogKey(line.product_id, line.variant_id);
        const record = (await requestResult(catalog.get(key))) as CatalogRecord | undefined;
        if (!record) {
          throw new CashierCompensationError(
            'CASHIER_VOID_CATALOG_ITEM_MISSING',
            'Inventory-tracked void item is missing from the local catalog',
          );
        }
        const currentStock = Number(record.stock_quantity);
        const nextStock = currentStock + restoreQuantity;
        if (!isNonNegativeSafeInteger(currentStock) || !isNonNegativeSafeInteger(nextStock)) {
          throw new CashierCompensationError(
            'CASHIER_VOID_STOCK_INVALID',
            'Void would produce an invalid local stock projection',
          );
        }
        record.stock_quantity = nextStock;
        record.local_updated_at = occurredAt;
        catalog.put(record);

        const movement: CashierInventoryMovement = {
          movement_id: movementId(operationId, lineIndex),
          operation_id: operationId,
          local_merchant_id: this.localMerchantId,
          ...(this.cloudMerchantId ? { cloud_merchant_id: this.cloudMerchantId } : {}),
          device_id: this.deviceId,
          device_sequence: deviceSequence,
          product_id: line.product_id,
          ...(line.variant_id ? { variant_id: line.variant_id } : {}),
          delta: restoreQuantity,
          reason: 'sale_void',
          related_sale_id: sale.sale_id,
          ...(note ? { note } : {}),
          occurred_at: occurredAt,
        };
        movements.put(movement);
        compensationMovements.push(movement);
      }

      const voidSnapshot: CashierSaleVoidSnapshot = {
        operation_id: operationId,
        sale_id: sale.sale_id,
        device_id: this.deviceId,
        device_sequence: deviceSequence,
        refund_total_minor: sale.total_minor,
        currency_code: sale.currency_code,
        currency_fraction_digits: sale.currency_fraction_digits,
        ...(note ? { note } : {}),
        occurred_at: occurredAt,
      };
      const updatedSale: CashierSaleSnapshot = {
        ...sale,
        status: 'voided',
        void: voidSnapshot,
      };
      sales.put(updatedSale);
      meta.put({
        key: compensationMetaKey(operationId),
        value: JSON.stringify({
          kind: 'void',
          sale_id: sale.sale_id,
          entity_id: sale.sale_id,
        } satisfies CompensationOperationRecord),
      } satisfies MetaRecord);

      const envelopes: CashierSyncEnvelope[] = [];
      const saleEnvelope = compensationOutbox(
        operationId,
        this.deviceId,
        deviceSequence,
        occurredAt,
        'sale',
        sale.sale_id,
        'void',
        updatedSale,
      );
      outbox.put({
        ...saleEnvelope,
        outbox_id: outboxId(operationId, 'sale', sale.sale_id),
      } satisfies OutboxRecord);
      envelopes.push(saleEnvelope);

      for (const movement of compensationMovements) {
        const envelope = compensationOutbox(
          operationId,
          this.deviceId,
          deviceSequence,
          occurredAt,
          'inventory_movement',
          movement.movement_id,
          'append',
          movement,
        );
        outbox.put({
          ...envelope,
          outbox_id: outboxId(operationId, 'inventory_movement', movement.movement_id),
        } satisfies OutboxRecord);
        envelopes.push(envelope);
      }

      await completion;
      return {
        sale: updatedSale,
        void_snapshot: voidSnapshot,
        inventory_movements: compensationMovements,
        outbox: envelopes,
      };
    } catch (error) {
      await abortAndDrain(transaction, completion);
      throw error;
    }
  }
}
