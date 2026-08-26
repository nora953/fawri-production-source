import type { CatalogProduct } from './catalogUiApi';
import type {
  CatalogCommerceContext,
  CatalogPromotion,
} from './catalogPromotionUiApi';
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
  cashierCostEvidenceKey,
  getCashierCostEvidence,
  getCashierOperationBinding,
  getCashierPendingEnvelopeCountForIdentity,
  replaceCashierCostEvidence,
  type CashierCostEvidenceRecord,
  type CashierOperationBinding,
} from './cashierOperatorLocalSecurity';
import {
  cashierOperatorHeaders,
  getCashierOperatorSession,
  getOrCreateCashierDeviceIdentity,
  writeCashierDeviceIdentity,
  type CashierDeviceIdentity,
  type CashierOperatorSession,
} from './cashierOperatorSessionClient';

const CATALOG_STORE = 'catalog';
const PROMOTION_STORE = 'promotions';
const MAX_PENDING_ENVELOPES = 1000;

type OperatorCatalogVariant = CatalogProduct['variants'][number] & {
  cost_evidence?: string;
};

type OperatorCatalogProduct = Omit<CatalogProduct, 'variants'> & {
  cost_evidence?: string;
  variants: OperatorCatalogVariant[];
};

export type CashierOperatorCatalogSyncResult = {
  merchant_id: string;
  currency_code: string;
  product_count: number;
  local_item_count: number;
  promotion_count: number;
  preserve_local_inventory: false;
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

async function responsePayload(
  response: Response,
): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function apiError(
  response: Response,
  payload: Record<string, unknown>,
  fallbackCode: string,
  fallbackMessage: string,
): CashierOperatorCloudSyncError {
  return new CashierOperatorCloudSyncError(
    String(payload.code || fallbackCode),
    String(payload.error || fallbackMessage),
    response.status,
  );
}

function assertSafeMinor(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CATALOG_INVALID',
      `${label} must be a non-negative safe integer`,
      409,
    );
  }
  return parsed;
}

function catalogKey(item: { product_id: string; variant_id?: string }): string {
  return `${item.product_id}\u0000${item.variant_id || ''}`;
}

function localItemsFromProduct(
  product: OperatorCatalogProduct,
  context: CatalogCommerceContext,
): { items: CashierCatalogLookup[]; evidence: CashierCostEvidenceRecord[] } {
  if (product.status !== 'available' && product.status !== 'low_stock') {
    return { items: [], evidence: [] };
  }
  if (!Number.isSafeInteger(product.version) || product.version <= 0) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CATALOG_INVALID',
      'Catalog product version is invalid',
      409,
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
  const storedAt = new Date().toISOString();

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const items: CashierCatalogLookup[] = [];
    const evidence: CashierCostEvidenceRecord[] = [];
    for (const variant of product.variants) {
      const token = String(variant.cost_evidence || '').trim();
      if (!token) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_COST_EVIDENCE_MISSING',
          'Catalog variant is missing protected cost evidence',
          409,
        );
      }
      items.push({
        ...base,
        variant_id: variant.id,
        variant_name: variant.name || undefined,
        sku: variant.sku || product.sku || undefined,
        barcode: variant.barcode || undefined,
        stock_quantity: product.track_inventory
          ? assertSafeMinor(variant.stock_quantity, 'variant stock')
          : undefined,
        base_unit_price_minor: assertSafeMinor(
          variant.price_iqd ?? product.price_iqd,
          'variant price',
        ),
      });
      evidence.push({
        key: cashierCostEvidenceKey({
          merchantId: product.merchant_id,
          productId: product.id,
          variantId: variant.id,
          catalogVersion: product.version,
        }),
        merchant_id: product.merchant_id,
        product_id: product.id,
        variant_id: variant.id,
        catalog_version: product.version,
        token,
        stored_at: storedAt,
      });
    }
    return { items, evidence };
  }

  const token = String(product.cost_evidence || '').trim();
  if (!token) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_COST_EVIDENCE_MISSING',
      'Catalog product is missing protected cost evidence',
      409,
    );
  }
  return {
    items: [
      {
        ...base,
        sku: product.sku || undefined,
        barcode: product.barcode || undefined,
        stock_quantity: product.track_inventory
          ? assertSafeMinor(product.stock_quantity, 'product stock')
          : undefined,
        base_unit_price_minor: assertSafeMinor(product.price_iqd, 'product price'),
      },
    ],
    evidence: [
      {
        key: cashierCostEvidenceKey({
          merchantId: product.merchant_id,
          productId: product.id,
          catalogVersion: product.version,
        }),
        merchant_id: product.merchant_id,
        product_id: product.id,
        variant_id: '',
        catalog_version: product.version,
        token,
        stored_at: storedAt,
      },
    ],
  };
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
        throw new CashierOperatorCloudSyncError(
          field === 'sku'
            ? 'CASHIER_OPERATOR_SKU_AMBIGUOUS'
            : 'CASHIER_OPERATOR_BARCODE_AMBIGUOUS',
          `Cloud catalog contains duplicate ${field}`,
          409,
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
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_PROMOTION_CURRENCY_MISMATCH',
      'Promotion currency does not match merchant commerce context',
      409,
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
    ...(promotion.amount_minor !== undefined
      ? { amount_minor: promotion.amount_minor }
      : {}),
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

function openExistingCashierDatabase(databaseName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    let created = false;
    request.onupgradeneeded = () => {
      created = true;
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        void indexedDB.deleteDatabase(databaseName);
        reject(
          new CashierOperatorCloudSyncError(
            'CASHIER_LOCAL_SCHEMA_MISSING',
            'Local cashier schema is not initialized',
            409,
          ),
        );
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Could not open cashier database'));
  });
}

async function createLocalAuthority(
  identity: CashierDeviceIdentity,
): Promise<IndexedDbCashierAuthority> {
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    ...(identity.cloud_merchant_id
      ? { cloudMerchantId: identity.cloud_merchant_id }
      : {}),
    deviceId: identity.device_id,
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
  };
  const authority = new IndexedDbCashierAuthority(config);
  await authority.getCatalogItem('__fawri_operator_cloud_schema_probe__');
  return authority;
}

async function replaceLocalCommerceSnapshot(input: {
  databaseName: string;
  items: CashierCatalogLookup[];
  promotions: CashierPromotionRule[];
  syncedAt: string;
}): Promise<void> {
  const database = await openExistingCashierDatabase(input.databaseName);
  try {
    if (
      !database.objectStoreNames.contains(CATALOG_STORE) ||
      !database.objectStoreNames.contains(PROMOTION_STORE)
    ) {
      throw new CashierOperatorCloudSyncError(
        'CASHIER_LOCAL_SCHEMA_MISSING',
        'Local cashier schema is not initialized',
        409,
      );
    }
    const transaction = database.transaction(
      [CATALOG_STORE, PROMOTION_STORE],
      'readwrite',
    );
    const completion = transactionDone(transaction);
    const catalog = transaction.objectStore(CATALOG_STORE);
    const promotions = transaction.objectStore(PROMOTION_STORE);
    catalog.clear();
    promotions.clear();
    for (const item of input.items) {
      catalog.put({
        ...item,
        key: catalogKey(item),
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

export async function syncCashierCatalogAsOperator(): Promise<CashierOperatorCatalogSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CATALOG_OFFLINE',
      'Internet connection is required to synchronize the cashier catalog',
      0,
    );
  }
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  const identity = await getOrCreateCashierDeviceIdentity();
  const pending = await getCashierPendingEnvelopeCountForIdentity(identity);
  if (pending > 0) {
    // Never rotate protected cost evidence while an offline sale still depends
    // on the exact catalog version/evidence that existed at commit time.
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_PENDING_SYNC',
      'Pending cashier operations must synchronize before catalog refresh',
      409,
    );
  }

  const response = await fetch('/api/cashier/operator/catalog-snapshot', {
    headers: cashierOperatorHeaders(session),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_OPERATOR_CATALOG_FAILED',
      'Could not synchronize cashier catalog',
    );
  }
  const merchantId = String(payload.merchant_id || '').trim();
  if (merchantId !== session.context.merchant_id) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_TENANT_MISMATCH',
      'Cashier catalog belongs to another merchant',
      403,
    );
  }
  const context = payload.context as CatalogCommerceContext;
  const products = Array.isArray(payload.products)
    ? (payload.products as OperatorCatalogProduct[])
    : [];
  const promotions = Array.isArray(payload.promotions)
    ? (payload.promotions as CatalogPromotion[])
    : [];
  if (!context?.currency_code || !Number.isInteger(context.currency_fraction_digits)) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_CONTEXT_INVALID',
      'Cashier commerce context is invalid',
      409,
    );
  }
  if (context.currency_code !== 'IQD' || context.currency_fraction_digits !== 0) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_CLOUD_CURRENCY_NOT_CUT_OVER',
      'Cashier cloud sync currently supports IQD catalog prices only',
      409,
    );
  }
  if (identity.cloud_merchant_id && identity.cloud_merchant_id !== merchantId) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_DEVICE_MERCHANT_MISMATCH',
      'This cashier device is bound to another merchant',
      409,
    );
  }

  const projections = products.map((product) => {
    if (product.merchant_id !== merchantId) {
      throw new CashierOperatorCloudSyncError(
        'CASHIER_OPERATOR_TENANT_MISMATCH',
        'Cashier catalog contains cross-merchant data',
        403,
      );
    }
    return localItemsFromProduct(product, context);
  });
  const items = projections.flatMap((item) => item.items);
  const evidence = projections.flatMap((item) => item.evidence);
  assertUniqueLookupValues(items);
  const localPromotions = promotions.map((promotion) => {
    if (promotion.merchant_id !== merchantId) {
      throw new CashierOperatorCloudSyncError(
        'CASHIER_OPERATOR_TENANT_MISMATCH',
        'Cashier promotions contain cross-merchant data',
        403,
      );
    }
    return localPromotion(
      promotion,
      identity.local_merchant_id,
      context.currency_code,
    );
  });

  // Ensure the local cashier schema exists before opening it without a version.
  const authority = await createLocalAuthority(identity);
  await authority.close();

  const syncedAt = new Date().toISOString();
  await replaceLocalCommerceSnapshot({
    databaseName: `fawri-cashier-${identity.local_merchant_id}-v1`,
    items,
    promotions: localPromotions,
    syncedAt,
  });
  await replaceCashierCostEvidence(evidence);
  await writeCashierDeviceIdentity({
    ...identity,
    cloud_merchant_id: merchantId,
    cloud_bound_at: identity.cloud_bound_at || syncedAt,
    last_catalog_sync_at: syncedAt,
  });
  return {
    merchant_id: merchantId,
    currency_code: context.currency_code,
    product_count: products.length,
    local_item_count: items.length,
    promotion_count: localPromotions.length,
    preserve_local_inventory: false,
    synced_at: syncedAt,
  };
}

function groupPending(
  envelopes: CashierSyncEnvelope[],
): Array<{
  operationId: string;
  deviceSequence: number;
  envelopes: CashierSyncEnvelope[];
}> {
  const grouped = new Map<string, CashierSyncEnvelope[]>();
  for (const envelope of envelopes) {
    const operationId = String(envelope.operation_id || '').trim();
    if (!operationId) continue;
    const current = grouped.get(operationId) || [];
    current.push(envelope);
    grouped.set(operationId, current);
  }
  return [...grouped.entries()]
    .map(([operationId, items]) => ({
      operationId,
      deviceSequence: Math.min(
        ...items.map((item) => Number(item.device_sequence)),
      ),
      envelopes: items,
    }))
    .sort(
      (left, right) =>
        left.deviceSequence - right.deviceSequence ||
        left.operationId.localeCompare(right.operationId),
    );
}

function classifyOperation(
  envelopes: CashierSyncEnvelope[],
): CashierOperationBinding['operation_kind'] | null {
  const sale = envelopes.filter(
    (item) => item.entity_type === 'sale' && item.operation === 'append',
  );
  const returns = envelopes.filter(
    (item) => item.entity_type === 'return' && item.operation === 'append',
  );
  const voids = envelopes.filter(
    (item) => item.entity_type === 'sale' && item.operation === 'void',
  );
  if (sale.length === 1 && returns.length === 0 && voids.length === 0) {
    return 'sale';
  }
  if (sale.length === 0 && returns.length === 1 && voids.length === 0) {
    return 'return';
  }
  if (sale.length === 0 && returns.length === 0 && voids.length === 1) {
    return 'void';
  }
  return null;
}

function assertOperationBinding(
  session: CashierOperatorSession,
  binding: CashierOperationBinding | null,
  kind: CashierOperationBinding['operation_kind'],
): void {
  if (
    !binding ||
    binding.operation_kind !== kind ||
    binding.merchant_id !== session.context.merchant_id ||
    binding.station_id !== session.context.station_id ||
    binding.staff_id !== session.context.staff_id ||
    binding.shift_id !== session.context.shift_id ||
    binding.device_id !== session.context.device_id
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATION_BINDING_REQUIRED',
      'Pending cashier operation belongs to another or unavailable operator shift',
      409,
    );
  }
}

async function enrichSaleCostEvidence(input: {
  merchantId: string;
  envelopes: CashierSyncEnvelope[];
}): Promise<CashierSyncEnvelope[]> {
  return Promise.all(
    input.envelopes.map(async (envelope) => {
      if (envelope.entity_type !== 'sale' || envelope.operation !== 'append') {
        return envelope;
      }
      const payload =
        envelope.payload &&
        typeof envelope.payload === 'object' &&
        !Array.isArray(envelope.payload)
          ? { ...(envelope.payload as Record<string, unknown>) }
          : {};
      if (!Array.isArray(payload.lines)) {
        throw new CashierOperatorCloudSyncError(
          'CASHIER_COST_EVIDENCE_MISSING',
          'Cashier sale lines are missing protected cost evidence identity',
          409,
        );
      }
      payload.lines = await Promise.all(
        payload.lines.map(async (value) => {
          const line =
            value && typeof value === 'object' && !Array.isArray(value)
              ? { ...(value as Record<string, unknown>) }
              : {};
          const productId = String(line.product_id || '').trim();
          const variantId = String(line.variant_id || '').trim() || undefined;
          const catalogVersion = Number(line.catalog_version);
          if (
            !productId ||
            !Number.isSafeInteger(catalogVersion) ||
            catalogVersion <= 0
          ) {
            throw new CashierOperatorCloudSyncError(
              'CASHIER_COST_EVIDENCE_MISSING',
              'Cashier sale line catalog identity is incomplete',
              409,
            );
          }
          const token = await getCashierCostEvidence({
            merchantId: input.merchantId,
            productId,
            ...(variantId ? { variantId } : {}),
            catalogVersion,
          });
          if (!token) {
            throw new CashierOperatorCloudSyncError(
              'CASHIER_COST_EVIDENCE_MISSING',
              'Protected cashier cost evidence is unavailable for this sale line',
              409,
            );
          }
          delete line.unit_cost_minor;
          line.cost_evidence = token;
          return line;
        }),
      );
      return { ...envelope, payload } as CashierSyncEnvelope;
    }),
  );
}

async function uploadOperatorOperation(input: {
  session: CashierOperatorSession;
  kind: CashierOperationBinding['operation_kind'];
  identity: CashierDeviceIdentity;
  operationId: string;
  deviceSequence: number;
  envelopes: CashierSyncEnvelope[];
}): Promise<{ replayed: boolean }> {
  const endpoint =
    input.kind === 'sale'
      ? '/api/cashier/operator/sync/sale'
      : input.kind === 'return'
        ? '/api/cashier/operator/sync/return'
        : '/api/cashier/operator/sync/void';
  const envelopes =
    input.kind === 'sale'
      ? await enrichSaleCostEvidence({
          merchantId: input.session.context.merchant_id,
          envelopes: input.envelopes,
        })
      : input.envelopes;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: cashierOperatorHeaders(input.session),
      body: JSON.stringify({
        cloud_merchant_id: input.session.context.merchant_id,
        local_merchant_id: input.identity.local_merchant_id,
        device_id: input.identity.device_id,
        device_sequence: input.deviceSequence,
        operation_id: input.operationId,
        envelopes,
      }),
    });
  } catch {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_SYNC_NETWORK_FAILED',
      'Could not reach Fawri cashier sync service',
      0,
    );
  }
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw apiError(
      response,
      payload,
      'CASHIER_OPERATOR_SYNC_FAILED',
      'Cashier operator sync failed',
    );
  }
  if (
    String(payload.operation_id || '') !== input.operationId ||
    Number(payload.device_sequence) !== input.deviceSequence ||
    !String(payload.order_id || '').trim() ||
    (input.kind !== 'sale' && payload.compensation_kind !== input.kind)
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_ACK_INVALID',
      'Fawri returned an invalid cashier sync acknowledgement',
      response.status,
    );
  }
  const expectedEntityIds = new Set(envelopes.map((item) => item.entity_id));
  const accepted = new Set(
    Array.isArray(payload.accepted_entity_ids)
      ? payload.accepted_entity_ids.map((value) => String(value))
      : [],
  );
  if (
    expectedEntityIds.size !== accepted.size ||
    [...expectedEntityIds].some((id) => !accepted.has(id))
  ) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_ACK_INVALID',
      'Fawri did not acknowledge the complete cashier operation',
      response.status,
    );
  }
  return { replayed: payload.replayed === true };
}

export async function syncCashierOutboxAsOperator(): Promise<CashierOperatorOutboxSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_SYNC_OFFLINE',
      'Internet connection is required to upload pending cashier operations',
      0,
    );
  }
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorCloudSyncError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  const identity = await getOrCreateCashierDeviceIdentity();
  const authority = await createLocalAuthority(identity);
  try {
    const pending = await authority.listPendingSync(MAX_PENDING_ENVELOPES);
    const operations = groupPending(pending);
    let uploadedOperations = 0;
    let replayedOperations = 0;
    let skippedOperations = 0;
    let acknowledgedOperations = 0;

    for (const operation of operations) {
      const kind = classifyOperation(operation.envelopes);
      if (!kind) {
        skippedOperations += 1;
        continue;
      }
      const binding = await getCashierOperationBinding(operation.operationId);
      assertOperationBinding(session, binding, kind);
      const result = await uploadOperatorOperation({
        session,
        kind,
        identity,
        operationId: operation.operationId,
        deviceSequence: operation.deviceSequence,
        envelopes: operation.envelopes,
      });
      if (result.replayed) replayedOperations += 1;
      else uploadedOperations += 1;
      // Local outbox is acknowledged only after complete server acceptance or a
      // proven idempotent replay. Ambiguous network failures keep evidence local.
      await authority.acknowledgeSynced([operation.operationId]);
      acknowledgedOperations += 1;
    }

    const pendingAfter = await authority.listPendingSync(MAX_PENDING_ENVELOPES);
    return {
      pending_before: pending.length,
      uploaded_operations: uploadedOperations,
      replayed_operations: replayedOperations,
      skipped_operations: skippedOperations,
      acknowledged_operations: acknowledgedOperations,
      pending_after: pendingAfter.length,
    };
  } finally {
    await authority.close().catch(() => undefined);
  }
}
