import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import type {
  CashierCatalogLookup,
  CashierSyncEnvelope,
} from './cashierLocalContracts';
import {
  cashierPromotionLifecycleAt,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';
import {
  bindCashierOperation,
  cashierCostEvidenceKey,
  getCashierCostEvidence,
  getCashierOperationBinding,
  upsertCashierCostEvidence,
  type CashierCostEvidenceRecord,
} from './cashierOperatorLocalSecurity';
import {
  cashierOperatorCan,
  cashierOperatorHeaders,
  getCashierOperatorSession,
  getOrCreateCashierDeviceIdentity,
  writeCashierDeviceIdentity,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';

const CATALOG_STORE = 'catalog';
const PROMOTION_STORE = 'promotions';
const MAX_PENDING_ENVELOPES = 1000;

export type CashierOperatorCatalogSyncResult = {
  merchant_id: string;
  currency_code: string;
  product_count: number;
  local_item_count: number;
  promotion_count: number;
  preserve_local_inventory: boolean;
  synced_at: string;
};

export type CashierOperatorOutboxSyncResult = {
  pending_before: number;
  uploaded_operations: number;
  replayed_operations: number;
  skipped_operations: number;
  acknowledged_operations: number;
  pending_after: number;
};

export class CashierOperatorCloudSyncError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierOperatorCloudSyncError';
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeNonNegative(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CATALOG_INVALID',
      `${field} must be a non-negative safe integer`,
    );
  }
  return parsed;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CATALOG_INVALID',
      `${field} must be a positive integer`,
    );
  }
  return parsed;
}

function text(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim();
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

function catalogKey(item: { product_id: string; variant_id?: string }): string {
  return `${item.product_id}\u0000${item.variant_id || ''}`;
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
        reject(
          new CashierOperatorCloudSyncError(
            'CASHIER_LOCAL_SCHEMA_MISSING',
            'Local cashier schema is not initialized',
          ),
        );
        return;
      }
      resolve(database);
    };
    request.onerror = () =>
      reject(request.error || new Error('Could not open local cashier database'));
  });
}

function localPromotion(
  rawValue: unknown,
  localMerchantId: string,
  currencyCode: string,
): CashierPromotionRule {
  const raw = record(rawValue);
  const promotionCurrency = text(raw.currency_code).toUpperCase();
  if (promotionCurrency !== currencyCode) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_PROMOTION_CURRENCY_MISMATCH',
      'Promotion currency does not match merchant commerce context',
    );
  }
  const rawScope = text(raw.scope);
  if (rawScope !== 'catalog_item' && rawScope !== 'delivery') {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_PROMOTION_SCOPE_INVALID',
      'Operator promotion scope is invalid',
    );
  }
  const scope: CashierPromotionRule['scope'] = rawScope;
  const effect = text(raw.effect) as CashierPromotionRule['effect'];
  const rule: CashierPromotionRule = {
    id: text(raw.id),
    merchant_id: localMerchantId,
    name: text(raw.name),
    scope,
    effect,
    ...(raw.product_id ? { product_id: text(raw.product_id) } : {}),
    ...(raw.variant_id ? { variant_id: text(raw.variant_id) } : {}),
    ...(raw.percentage_bps !== undefined
      ? { percentage_bps: Number(raw.percentage_bps) }
      : {}),
    ...(raw.amount_minor !== undefined
      ? { amount_minor: Number(raw.amount_minor) }
      : {}),
    currency_code: promotionCurrency,
    ...(raw.minimum_subtotal_minor !== undefined
      ? { minimum_subtotal_minor: Number(raw.minimum_subtotal_minor) }
      : {}),
    starts_at: text(raw.starts_at),
    ends_at: text(raw.ends_at),
    schedule_timezone: text(raw.schedule_timezone),
    priority: Number(raw.priority || 0),
    enabled: raw.enabled === true,
    version: positiveInteger(raw.version, 'promotion version'),
  };
  cashierPromotionLifecycleAt(rule, new Date());
  return rule;
}

function mapOperatorProduct(input: {
  productValue: unknown;
  merchantId: string;
  currencyCode: string;
  fractionDigits: number;
  syncedAt: string;
}): {
  items: CashierCatalogLookup[];
  evidence: CashierCostEvidenceRecord[];
} {
  const product = record(input.productValue);
  const productId = text(product.id);
  const productMerchantId = text(product.merchant_id);
  if (!productId || productMerchantId !== input.merchantId) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CATALOG_TENANT_MISMATCH',
      'Catalog product belongs to another merchant',
    );
  }
  const status = text(product.status);
  if (status !== 'available' && status !== 'low_stock') {
    return { items: [], evidence: [] };
  }
  const version = positiveInteger(product.version, 'catalog version');
  const itemType = product.item_type === 'service' ? 'service' : 'product';
  const trackInventory = itemType === 'product' && product.track_inventory !== false;
  const base = {
    product_id: productId,
    item_type: itemType,
    name: text(product.name),
    track_inventory: trackInventory,
    currency_code: input.currencyCode,
    currency_fraction_digits: input.fractionDigits,
    catalog_version: version,
  } as const;
  const productEvidence = text(product.cost_evidence);
  if (!productEvidence) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_COST_EVIDENCE_MISSING',
      'Operator catalog is missing opaque cost evidence',
    );
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0) {
    const items: CashierCatalogLookup[] = [];
    const evidence: CashierCostEvidenceRecord[] = [];
    for (const value of variants) {
      const variant = record(value);
      const variantId = text(variant.id);
      const token = text(variant.cost_evidence);
      if (!variantId || !token) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_OPERATOR_COST_EVIDENCE_MISSING',
          'Operator variant catalog is missing opaque cost evidence',
        );
      }
      items.push({
        ...base,
        variant_id: variantId,
        variant_name: text(variant.name) || undefined,
        sku: text(variant.sku || product.sku) || undefined,
        barcode: text(variant.barcode) || undefined,
        ...(trackInventory
          ? {
              stock_quantity: safeNonNegative(
                variant.stock_quantity,
                'variant stock',
              ),
            }
          : {}),
        base_unit_price_minor: safeNonNegative(
          variant.price_iqd ?? product.price_iqd,
          'variant price',
        ),
      });
      evidence.push({
        key: cashierCostEvidenceKey({
          merchantId: input.merchantId,
          productId,
          variantId,
          catalogVersion: version,
        }),
        merchant_id: input.merchantId,
        product_id: productId,
        variant_id: variantId,
        catalog_version: version,
        token,
        stored_at: input.syncedAt,
      });
    }
    return { items, evidence };
  }

  return {
    items: [
      {
        ...base,
        sku: text(product.sku) || undefined,
        barcode: text(product.barcode) || undefined,
        ...(trackInventory
          ? {
              stock_quantity: safeNonNegative(
                product.stock_quantity,
                'product stock',
              ),
            }
          : {}),
        base_unit_price_minor: safeNonNegative(product.price_iqd, 'product price'),
      },
    ],
    evidence: [
      {
        key: cashierCostEvidenceKey({
          merchantId: input.merchantId,
          productId,
          catalogVersion: version,
        }),
        merchant_id: input.merchantId,
        product_id: productId,
        variant_id: '',
        catalog_version: version,
        token: productEvidence,
        stored_at: input.syncedAt,
      },
    ],
  };
}

function assertUniqueLookupValues(items: CashierCatalogLookup[]): void {
  for (const field of ['sku', 'barcode'] as const) {
    const seen = new Map<string, string>();
    for (const item of items) {
      const value = text(item[field]);
      if (!value) continue;
      const key = catalogKey(item);
      const prior = seen.get(value);
      if (prior && prior !== key) {
        throw new CashierOperatorCloudSyncError(
          field === 'sku'
            ? 'CASHIER_OPERATOR_SKU_AMBIGUOUS'
            : 'CASHIER_OPERATOR_BARCODE_AMBIGUOUS',
          `Operator catalog contains duplicate ${field}`,
        );
      }
      seen.set(value, key);
    }
  }
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
    const existing = (await requestResult(catalog.getAll())) as Array<
      CashierCatalogLookup & { key: string; local_updated_at: string }
    >;
    const existingByKey = new Map(existing.map((item) => [item.key, item]));
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
      });
    }
    for (const promotion of input.promotions) {
      promotions.put({ ...promotion, local_updated_at: input.syncedAt });
    }
    await completion;
  } finally {
    database.close();
  }
}

function operatorSessionRequired(
  session: CashierOperatorSession | null,
): CashierOperatorSession {
  if (!session) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  return session;
}

export async function syncCashierOperatorCatalogFromCloud(): Promise<CashierOperatorCatalogSyncResult> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CLOUD_OFFLINE',
      'Internet connection is required for catalog synchronization',
      0,
    );
  }
  const session = operatorSessionRequired(await getCashierOperatorSession());
  if (!cashierOperatorCan(session, 'sale.create')) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_PERMISSION_REQUIRED',
      'Sale permission is required to synchronize the cashier catalog',
      403,
    );
  }
  const response = await fetch('/api/cashier/operator/catalog-snapshot', {
    headers: cashierOperatorHeaders(session),
    credentials: 'omit',
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw new CashierOperatorCloudSyncError(
      text(payload.code) || 'CASHIER_OPERATOR_CATALOG_FAILED',
      text(payload.error) || 'Could not load cashier operator catalog',
      response.status,
    );
  }
  if (
    text(payload.merchant_id) !== session.context.merchant_id ||
    text(payload.station_id) !== session.context.station_id ||
    text(payload.location_id) !== session.context.location_id ||
    text(payload.staff_id) !== session.context.staff_id ||
    text(payload.shift_id) !== session.context.shift_id
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CONTEXT_MISMATCH',
      'Operator catalog response does not match the active shift',
      409,
    );
  }
  const commerceContext = record(payload.context);
  const currencyCode = text(commerceContext.currency_code).toUpperCase();
  const fractionDigits = Number(commerceContext.currency_fraction_digits);
  if (
    !/^[A-Z]{3}$/.test(currencyCode) ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_MONEY_CONTEXT_INVALID',
      'Cashier money context is invalid',
    );
  }

  const identity = await getOrCreateCashierDeviceIdentity();
  if (
    identity.cloud_merchant_id !== session.context.merchant_id ||
    identity.device_id !== session.context.device_id
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_DEVICE_MISMATCH',
      'Cashier local identity does not match the paired operator station',
      409,
    );
  }
  const authority = new IndexedDbCashierAuthority({
    localMerchantId: identity.local_merchant_id,
    cloudMerchantId: identity.cloud_merchant_id,
    deviceId: identity.device_id,
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
  } satisfies IndexedDbCashierConfig);
  await authority.getCatalogItem('__fawri_operator_catalog_schema_probe__');
  const pending = await authority.listPendingSync(1);
  await authority.close();
  const preserveLocalInventory = pending.length > 0;

  const syncedAt = new Date().toISOString();
  const items: CashierCatalogLookup[] = [];
  const evidence: CashierCostEvidenceRecord[] = [];
  const productValues = Array.isArray(payload.products) ? payload.products : [];
  for (const productValue of productValues) {
    const mapped = mapOperatorProduct({
      productValue,
      merchantId: session.context.merchant_id,
      currencyCode,
      fractionDigits,
      syncedAt,
    });
    items.push(...mapped.items);
    evidence.push(...mapped.evidence);
  }
  assertUniqueLookupValues(items);
  const promotionValues = Array.isArray(payload.promotions) ? payload.promotions : [];
  const localPromotions = promotionValues.map((promotion) =>
    localPromotion(promotion, identity.local_merchant_id, currencyCode),
  );
  await upsertCashierCostEvidence(evidence);
  await replaceLocalCommerceSnapshot({
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
    items,
    promotions: localPromotions,
    preserveLocalInventory,
    syncedAt,
  });
  await writeCashierDeviceIdentity({
    ...identity,
    last_catalog_sync_at: syncedAt,
  });

  return {
    merchant_id: session.context.merchant_id,
    currency_code: currencyCode,
    product_count: productValues.length,
    local_item_count: items.length,
    promotion_count: localPromotions.length,
    preserve_local_inventory: preserveLocalInventory,
    synced_at: syncedAt,
  };
}

function groupByOperation(
  envelopes: CashierSyncEnvelope[],
): Map<string, CashierSyncEnvelope[]> {
  const groups = new Map<string, CashierSyncEnvelope[]>();
  for (const envelope of envelopes) {
    const list = groups.get(envelope.operation_id) || [];
    list.push(envelope);
    groups.set(envelope.operation_id, list);
  }
  return groups;
}

/**
 * listPendingSync is envelope-count limited. When it returns a full window we
 * cannot know whether the final operation continues just beyond that window.
 * Never upload that final operation partially: process only operations that end
 * before the boundary and leave the boundary operation intact for the next sync.
 */
function completeOperationWindow(
  pending: CashierSyncEnvelope[],
): CashierSyncEnvelope[] {
  if (pending.length < MAX_PENDING_ENVELOPES) return pending;
  const boundaryOperationId = String(
    pending[pending.length - 1]?.operation_id || '',
  ).trim();
  if (!boundaryOperationId) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_OUTBOX_CORRUPT',
      'Pending cashier operation identity is missing',
      409,
    );
  }
  const firstBoundaryIndex = pending.findIndex(
    (envelope) => envelope.operation_id === boundaryOperationId,
  );
  if (firstBoundaryIndex <= 0) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_OPERATION_TOO_LARGE',
      'A single pending cashier operation exceeds the safe synchronization window',
      409,
    );
  }
  return pending.slice(0, firstBoundaryIndex);
}

function operationKind(
  envelopes: CashierSyncEnvelope[],
): 'sale' | 'return' | 'void' | 'inventory_adjustment' | 'skip' {
  if (
    envelopes.some(
      (item) => item.entity_type === 'return' && item.operation === 'append',
    )
  ) {
    return 'return';
  }
  if (
    envelopes.some(
      (item) => item.entity_type === 'sale' && item.operation === 'void',
    )
  ) {
    return 'void';
  }
  if (
    envelopes.some(
      (item) => item.entity_type === 'sale' && item.operation === 'append',
    )
  ) {
    return 'sale';
  }
  if (
    envelopes.length === 1 &&
    envelopes[0]?.entity_type === 'inventory_movement' &&
    envelopes[0]?.operation === 'append'
  ) {
    const movement = record(envelopes[0].payload);
    const reason = text(movement.reason);
    if (reason === 'restock' || reason === 'manual_adjustment') {
      return 'inventory_adjustment';
    }
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_ADJUSTMENT_REASON_INVALID',
      'Standalone inventory movement has an unsupported adjustment reason',
      409,
    );
  }
  return 'skip';
}

function commonBody(
  session: CashierOperatorSession,
  localMerchantId: string,
  envelopes: CashierSyncEnvelope[],
): Record<string, unknown> {
  const first = envelopes[0];
  const normalizedLocalMerchantId = text(localMerchantId);
  if (!normalizedLocalMerchantId) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_LOCAL_IDENTITY_INVALID',
      'Cashier local merchant identity is missing',
      409,
    );
  }
  return {
    schema_version: first.schema_version,
    cloud_merchant_id: session.context.merchant_id,
    local_merchant_id: normalizedLocalMerchantId,
    device_id: session.context.device_id,
    operation_id: first.operation_id,
    device_sequence: first.device_sequence,
    envelopes,
  };
}

async function saleEnvelopesWithEvidence(
  session: CashierOperatorSession,
  envelopes: CashierSyncEnvelope[],
): Promise<CashierSyncEnvelope[]> {
  const result: CashierSyncEnvelope[] = [];
  for (const envelope of envelopes) {
    if (envelope.entity_type !== 'sale' || envelope.operation !== 'append') {
      result.push(envelope);
      continue;
    }
    const payload = record(envelope.payload);
    if (!Array.isArray(payload.lines)) {
      throw new CashierOperatorCloudSyncError(
        'CASHIER_OPERATOR_SALE_EVIDENCE_INVALID',
        'Cashier sale lines are missing',
      );
    }
    const lines: Array<Record<string, unknown>> = [];
    for (const value of payload.lines) {
      const line = { ...record(value) } as Record<string, unknown>;
      const productId = text(line.product_id);
      const variantId = text(line.variant_id) || undefined;
      const catalogVersion = positiveInteger(
        line.catalog_version,
        'sale catalog version',
      );
      const token = await getCashierCostEvidence({
        merchantId: session.context.merchant_id,
        productId,
        ...(variantId ? { variantId } : {}),
        catalogVersion,
      });
      if (!token) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_OPERATOR_COST_EVIDENCE_MISSING',
          'Opaque cost evidence for this sale version is missing',
          409,
        );
      }
      delete line.unit_cost_minor;
      line.cost_evidence = token;
      lines.push(line);
    }
    result.push({
      ...envelope,
      payload: { ...payload, lines },
    });
  }
  return result;
}

async function postOperation(
  session: CashierOperatorSession,
  localMerchantId: string,
  kind: 'sale' | 'return' | 'void' | 'inventory_adjustment',
  envelopes: CashierSyncEnvelope[],
): Promise<{ replayed: boolean; operation_id: string }> {
  const prepared =
    kind === 'sale'
      ? await saleEnvelopesWithEvidence(session, envelopes)
      : envelopes;

  const expectedOperationId = text(envelopes[0]?.operation_id);
  const expectedDeviceSequence = Number(envelopes[0]?.device_sequence);
  const expectedEntityIds = envelopes
    .map((item) => text(item.entity_id))
    .sort();

  const response = await fetch(`/api/cashier/operator/sync/${kind}`, {
    method: 'POST',
    headers: cashierOperatorHeaders(session),
    credentials: 'omit',
    body: JSON.stringify(commonBody(session, localMerchantId, prepared)),
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw new CashierOperatorCloudSyncError(
      text(payload.code) || 'CASHIER_OPERATOR_OUTBOX_UPLOAD_FAILED',
      text(payload.error) || 'Cashier operation could not be synchronized',
      response.status,
    );
  }

  const operationId = text(payload.operation_id);
  const deviceSequence = Number(payload.device_sequence);
  const orderId = text(payload.order_id);
  const acceptedEntityIds = Array.isArray(payload.accepted_entity_ids)
    ? payload.accepted_entity_ids.map((value) => text(value)).sort()
    : [];
  const compensationKind = text(payload.compensation_kind);

  const acknowledgementInvalid =
    !expectedOperationId ||
    operationId !== expectedOperationId ||
    !Number.isSafeInteger(expectedDeviceSequence) ||
    !Number.isSafeInteger(deviceSequence) ||
    deviceSequence !== expectedDeviceSequence ||
    (kind !== 'inventory_adjustment' && !orderId) ||
    acceptedEntityIds.length !== expectedEntityIds.length ||
    acceptedEntityIds.some(
      (entityId, index) =>
        !entityId || entityId !== expectedEntityIds[index],
    ) ||
    ((kind === 'return' || kind === 'void') &&
      compensationKind !== kind);

  if (acknowledgementInvalid) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_ACK_INVALID',
      'Cashier sync acknowledgement does not completely match the pending operation',
      409,
    );
  }

  return {
    replayed: payload.replayed === true,
    operation_id: operationId,
  };
}

export async function syncCashierOperatorOutboxToCloud(): Promise<CashierOperatorOutboxSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_OUTBOX_OFFLINE',
      'Internet connection is required to synchronize pending cashier operations',
      0,
    );
  }
  const session = operatorSessionRequired(await getCashierOperatorSession());
  const identity = await getOrCreateCashierDeviceIdentity();
  if (
    identity.cloud_merchant_id !== session.context.merchant_id ||
    identity.device_id !== session.context.device_id
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_DEVICE_MISMATCH',
      'Cashier local identity does not match the active operator session',
      409,
    );
  }
  const authority = new IndexedDbCashierAuthority({
    localMerchantId: identity.local_merchant_id,
    cloudMerchantId: identity.cloud_merchant_id,
    deviceId: identity.device_id,
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
  });
  try {
    const pending = await authority.listPendingSync(MAX_PENDING_ENVELOPES);
    const uploadable = completeOperationWindow(pending);
    const groups = groupByOperation(uploadable);
    let uploaded = 0;
    let replayed = 0;
    let skipped = 0;
    let acknowledged = 0;

    for (const [operationId, envelopes] of groups) {
      const kind = operationKind(envelopes);
      if (kind === 'skip') {
        skipped += 1;
        continue;
      }
      let binding = await getCashierOperationBinding(operationId);
      if (!binding) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_OPERATOR_OPERATION_BINDING_MISSING',
          'Pending cashier operation has no operator binding',
          409,
        );
      }
      if (!binding.location_id) {
        binding = await bindCashierOperation({
          ...binding,
          location_id: session.context.location_id,
        });
      }
      const bindingMatches =
        binding.operation_kind === kind &&
        binding.merchant_id === session.context.merchant_id &&
        binding.station_id === session.context.station_id &&
        binding.location_id === session.context.location_id &&
        binding.staff_id === session.context.staff_id &&
        binding.shift_id === session.context.shift_id &&
        binding.device_id === session.context.device_id;
      if (!bindingMatches) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT',
          'Pending cashier operation belongs to another operator or shift',
          409,
        );
      }
      const uploadedResult = await postOperation(
        session,
        identity.local_merchant_id,
        kind,
        envelopes,
      );
      if (!uploadedResult.operation_id || uploadedResult.operation_id !== operationId) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_OPERATOR_ACK_INVALID',
          'Cashier sync acknowledgement does not match the pending operation',
          409,
        );
      }
      await authority.acknowledgeSynced([operationId]);
      acknowledged += 1;
      if (uploadedResult.replayed) replayed += 1;
      else uploaded += 1;
    }

    const pendingAfter = (
      await authority.listPendingSync(MAX_PENDING_ENVELOPES)
    ).length;
    return {
      pending_before: pending.length,
      uploaded_operations: uploaded,
      replayed_operations: replayed,
      skipped_operations: skipped,
      acknowledged_operations: acknowledged,
      pending_after: pendingAfter,
    };
  } finally {
    await authority.close().catch(() => undefined);
  }
}
