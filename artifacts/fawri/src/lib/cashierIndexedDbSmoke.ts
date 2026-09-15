import {
  CashierIndexedDbError,
  IndexedDbCashierAuthority,
  probeIndexedDbCashierDurability,
  type IndexedDbCashierDurabilityProbe,
} from './cashierIndexedDbAuthority';
import type { CashierCatalogLookup } from './cashierLocalContracts';
import {
  CashierPromotionError,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';

export type CashierIndexedDbSmokeReport = {
  ok: true;
  durability: IndexedDbCashierDurabilityProbe;
  sale_id: string;
  stock_after_sale: number;
  pending_before_ack: number;
  pending_after_ack: number;
  replay_was_idempotent: true;
  restart_recovery_passed: true;
  insufficient_stock_rolled_back: true;
  stale_catalog_projection_ignored: true;
  sale_time_promotion_applied: true;
  promotion_conflict_rolled_back: true;
};

function uniqueDatabaseName(): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `fawri-cashier-smoke-${suffix}`;
}

function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error || new Error('IndexedDB cleanup failed'));
    request.onblocked = () => reject(new Error('IndexedDB cleanup was blocked'));
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Cashier IndexedDB smoke failed: ${message}`);
}

function promotion(
  overrides: Partial<CashierPromotionRule> & Pick<CashierPromotionRule, 'id'>,
): CashierPromotionRule {
  return {
    id: overrides.id,
    merchant_id: 'smoke-merchant',
    name: overrides.name || overrides.id,
    scope: 'catalog_item',
    effect: overrides.effect || 'fixed_price',
    product_id: 'product-1',
    variant_id: 'variant-1',
    ...(overrides.percentage_bps !== undefined
      ? { percentage_bps: overrides.percentage_bps }
      : {}),
    ...(overrides.amount_minor !== undefined
      ? { amount_minor: overrides.amount_minor }
      : { amount_minor: 8_000 }),
    currency_code: 'IQD',
    ...(overrides.minimum_subtotal_minor !== undefined
      ? { minimum_subtotal_minor: overrides.minimum_subtotal_minor }
      : {}),
    starts_at: overrides.starts_at || '2026-08-23T00:00:00.000Z',
    ends_at: overrides.ends_at || '2026-08-24T00:00:00.000Z',
    schedule_timezone: 'Asia/Baghdad',
    priority: overrides.priority ?? 10,
    enabled: overrides.enabled ?? true,
    version: overrides.version ?? 1,
  };
}

/**
 * Browser-only P1B/P1C smoke harness. It uses a disposable database and does
 * not touch merchant data. This is intentionally not auto-run by the app.
 */
export async function runCashierIndexedDbSmoke(): Promise<CashierIndexedDbSmokeReport> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Cashier IndexedDB smoke requires a browser with IndexedDB');
  }

  const databaseName = uniqueDatabaseName();
  const operationId = 'smoke-sale-1';
  const failedOperationId = 'smoke-sale-out-of-stock';
  const conflictOperationId = 'smoke-sale-promotion-conflict';
  const config = {
    localMerchantId: 'smoke-merchant',
    deviceId: 'smoke-device-0001',
    databaseName,
    now: () => new Date('2026-08-23T12:00:00.000Z'),
  };
  const catalogItem: CashierCatalogLookup = {
    product_id: 'product-1',
    variant_id: 'variant-1',
    item_type: 'product',
    name: 'Smoke Product',
    variant_name: 'Default',
    sku: 'SMOKE-SKU-1',
    barcode: '990000000001',
    track_inventory: true,
    stock_quantity: 3,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 10_000,
    // Deliberately stale P1B projection. P1C storage must discard these fields
    // and commitSale must calculate from the independent promotion snapshot.
    effective_unit_price_minor: 1_000,
    promotion: {
      promotion_id: 'stale-promotion',
      promotion_name: 'Stale Projection',
      effect: 'fixed_price',
      promotion_version: 99,
      amount_minor: 1_000,
    },
    catalog_version: 1,
  };

  let authority: IndexedDbCashierAuthority | null = null;
  try {
    const durability = await probeIndexedDbCashierDurability({
      requestPersistence: false,
    });
    authority = new IndexedDbCashierAuthority(config);
    await authority.upsertCatalogSnapshot([catalogItem], {
      preserveLocalInventory: false,
    });
    await authority.replacePromotionSnapshot([
      promotion({ id: 'promotion-live', amount_minor: 8_000 }),
    ]);

    const byBarcode = await authority.lookupByBarcode('990000000001');
    const bySku = await authority.lookupBySku('SMOKE-SKU-1');
    assert(byBarcode?.product_id === 'product-1', 'barcode lookup did not resolve product');
    assert(bySku?.variant_id === 'variant-1', 'SKU lookup did not resolve variant');
    assert(
      byBarcode?.effective_unit_price_minor === undefined && !byBarcode?.promotion,
      'legacy effective-price projection was not discarded from base catalog storage',
    );

    const first = await authority.commitSale({
      operation_id: operationId,
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'product-1', variant_id: 'variant-1', quantity: 2 }],
    });
    assert(first.sale.total_minor === 16_000, 'sale-time promotion total is incorrect');
    assert(first.sale.discount_minor === 4_000, 'sale-time promotion discount is incorrect');
    assert(
      first.sale.lines[0]?.promotion?.promotion_id === 'promotion-live' &&
        first.sale.lines[0]?.effective_unit_price_minor === 8_000,
      'committed sale did not snapshot the promotion resolved at sale time',
    );
    assert(first.inventory_movements.length === 1, 'sale did not create inventory movement');

    const replay = await authority.commitSale({
      operation_id: operationId,
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'product-1', variant_id: 'variant-1', quantity: 2 }],
    });
    assert(replay.sale.sale_id === first.sale.sale_id, 'idempotent replay created another sale');

    const afterSale = await authority.getCatalogItem('product-1', 'variant-1');
    assert(afterSale?.stock_quantity === 1, 'idempotent replay decremented stock twice');

    let outOfStockFailed = false;
    try {
      await authority.commitSale({
        operation_id: failedOperationId,
        payment_method: 'cash',
        payment_status: 'paid',
        lines: [{ product_id: 'product-1', variant_id: 'variant-1', quantity: 2 }],
      });
    } catch (error) {
      outOfStockFailed =
        error instanceof CashierIndexedDbError && error.code === 'CASHIER_OUT_OF_STOCK';
    }
    assert(outOfStockFailed, 'insufficient stock did not fail closed');
    const afterFailure = await authority.getCatalogItem('product-1', 'variant-1');
    assert(afterFailure?.stock_quantity === 1, 'failed sale partially changed stock');
    assert(
      (await authority.getSale(`sale:${failedOperationId}`)) === null,
      'failed sale was persisted',
    );

    await authority.replacePromotionSnapshot([
      promotion({ id: 'conflict-a', amount_minor: 8_000, priority: 20 }),
      promotion({ id: 'conflict-b', amount_minor: 7_000, priority: 20 }),
    ]);
    let conflictFailedClosed = false;
    try {
      await authority.commitSale({
        operation_id: conflictOperationId,
        payment_method: 'cash',
        payment_status: 'paid',
        lines: [{ product_id: 'product-1', variant_id: 'variant-1', quantity: 1 }],
      });
    } catch (error) {
      conflictFailedClosed =
        error instanceof CashierPromotionError &&
        error.code === 'CASHIER_PROMOTION_CONFLICT';
    }
    assert(conflictFailedClosed, 'promotion conflict did not fail closed');
    const afterConflict = await authority.getCatalogItem('product-1', 'variant-1');
    assert(afterConflict?.stock_quantity === 1, 'promotion conflict partially changed stock');
    assert(
      (await authority.getSale(`sale:${conflictOperationId}`)) === null,
      'promotion conflict persisted a sale',
    );

    const pendingBeforeAck = await authority.listPendingSync();
    assert(pendingBeforeAck.length === 2, 'sale should queue sale + inventory movement');

    await authority.close();
    authority = new IndexedDbCashierAuthority(config);
    const recoveredSale = await authority.getSale(first.sale.sale_id);
    const recoveredCatalog = await authority.getCatalogItem('product-1', 'variant-1');
    assert(recoveredSale?.sale_id === first.sale.sale_id, 'sale did not survive database reopen');
    assert(recoveredCatalog?.stock_quantity === 1, 'stock did not survive database reopen');

    await authority.acknowledgeSynced([operationId]);
    const pendingAfterAck = await authority.listPendingSync();
    assert(pendingAfterAck.length === 0, 'sync acknowledgement left matching outbox entries');

    return {
      ok: true,
      durability,
      sale_id: first.sale.sale_id,
      stock_after_sale: 1,
      pending_before_ack: pendingBeforeAck.length,
      pending_after_ack: pendingAfterAck.length,
      replay_was_idempotent: true,
      restart_recovery_passed: true,
      insufficient_stock_rolled_back: true,
      stale_catalog_projection_ignored: true,
      sale_time_promotion_applied: true,
      promotion_conflict_rolled_back: true,
    };
  } finally {
    if (authority) await authority.close().catch(() => undefined);
    await deleteDatabase(databaseName).catch(() => undefined);
  }
}
