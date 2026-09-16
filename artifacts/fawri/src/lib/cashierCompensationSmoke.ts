import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import {
  CashierCompensationError,
  IndexedDbCashierCompensationAuthority,
} from './cashierCompensationAuthority';
import type { CashierCatalogLookup } from './cashierLocalContracts';

export type CashierCompensationSmokeReport = {
  ok: true;
  partial_return_refund_used_original_price: true;
  partial_return_stock_restored: true;
  return_replay_was_idempotent: true;
  full_return_completed: true;
  over_return_rolled_back: true;
  void_after_return_blocked: true;
  void_restored_stock: true;
  void_replay_was_idempotent: true;
  second_void_blocked: true;
  return_on_void_blocked: true;
  service_return_without_inventory_movement: true;
  compensation_restart_recovery_passed: true;
};

function uniqueDatabaseName(): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `fawri-cashier-compensation-smoke-${suffix}`;
}

function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('IndexedDB cleanup failed'));
    request.onblocked = () => reject(new Error('IndexedDB cleanup was blocked'));
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Cashier compensation smoke failed: ${message}`);
}

export async function runCashierCompensationSmoke(): Promise<CashierCompensationSmokeReport> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Cashier compensation smoke requires IndexedDB');
  }

  const databaseName = uniqueDatabaseName();
  let clock = new Date('2026-08-23T15:00:00.000Z');
  const config: IndexedDbCashierConfig = {
    localMerchantId: 'comp-smoke-merchant',
    deviceId: 'comp-smoke-device',
    databaseName,
    now: () => new Date(clock.getTime()),
  };

  const product: CashierCatalogLookup = {
    product_id: 'product-1',
    variant_id: 'variant-1',
    item_type: 'product',
    name: 'Returnable Product',
    variant_name: 'Default',
    sku: 'RETURN-SKU-1',
    barcode: '991000000001',
    track_inventory: true,
    stock_quantity: 5,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 10_000,
    catalog_version: 1,
  };
  const service: CashierCatalogLookup = {
    product_id: 'service-1',
    item_type: 'service',
    name: 'Returnable Service',
    track_inventory: false,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 20_000,
    catalog_version: 1,
  };

  let authority: IndexedDbCashierAuthority | null = null;
  let compensation: IndexedDbCashierCompensationAuthority | null = null;
  try {
    authority = new IndexedDbCashierAuthority(config);
    compensation = new IndexedDbCashierCompensationAuthority(config);
    await authority.upsertCatalogSnapshot([product, service], {
      preserveLocalInventory: false,
    });

    const sale1 = await authority.commitSale({
      operation_id: 'sale-returnable-1',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'product-1', variant_id: 'variant-1', quantity: 3 }],
    });
    assert(sale1.sale.total_minor === 30_000, 'initial sale total is incorrect');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 2, 'initial sale stock is incorrect');

    clock = new Date('2026-08-23T15:05:00.000Z');
    await authority.upsertCatalogSnapshot([
      {
        ...product,
        base_unit_price_minor: 50_000,
        stock_quantity: 999,
        catalog_version: 2,
      },
    ]);
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 2, 'repricing must preserve local stock');

    const firstReturn = await compensation.returnSale({
      operation_id: 'return-1',
      sale_id: sale1.sale.sale_id,
      lines: [{ original_line_id: sale1.sale.lines[0].line_id, quantity: 1 }],
    });
    assert(firstReturn.return_snapshot.refund_total_minor === 10_000, 'return used current catalog price instead of original sale price');
    assert(firstReturn.return_snapshot.lines[0].effective_unit_price_minor === 10_000, 'return line did not preserve original paid unit price');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 3, 'partial return did not restore stock');

    const replayReturn = await compensation.returnSale({
      operation_id: 'return-1',
      sale_id: sale1.sale.sale_id,
      lines: [{ original_line_id: sale1.sale.lines[0].line_id, quantity: 1 }],
    });
    assert(replayReturn.return_snapshot.return_id === firstReturn.return_snapshot.return_id, 'return replay created a different return');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 3, 'return replay restored stock twice');

    const secondReturn = await compensation.returnSale({
      operation_id: 'return-2',
      sale_id: sale1.sale.sale_id,
      lines: [{ original_line_id: sale1.sale.lines[0].line_id, quantity: 2 }],
    });
    assert(secondReturn.return_snapshot.refund_total_minor === 20_000, 'remaining return refund is incorrect');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 5, 'full return did not restore original stock');

    let overReturnFailed = false;
    try {
      await compensation.returnSale({
        operation_id: 'return-over',
        sale_id: sale1.sale.sale_id,
        lines: [{ original_line_id: sale1.sale.lines[0].line_id, quantity: 1 }],
      });
    } catch (error) {
      overReturnFailed =
        error instanceof CashierCompensationError &&
        error.code === 'CASHIER_RETURN_QUANTITY_EXCEEDS_SOLD';
    }
    assert(overReturnFailed, 'over-return did not fail closed');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 5, 'failed over-return changed stock');

    let voidAfterReturnFailed = false;
    try {
      await compensation.voidSale({
        operation_id: 'void-after-return',
        sale_id: sale1.sale.sale_id,
      });
    } catch (error) {
      voidAfterReturnFailed =
        error instanceof CashierCompensationError &&
        error.code === 'CASHIER_VOID_AFTER_RETURN_NOT_ALLOWED';
    }
    assert(voidAfterReturnFailed, 'void after return did not fail closed');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 5, 'failed void-after-return changed stock');

    clock = new Date('2026-08-23T15:10:00.000Z');
    const sale2 = await authority.commitSale({
      operation_id: 'sale-voidable-2',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'product-1', variant_id: 'variant-1', quantity: 2 }],
    });
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 3, 'second sale stock is incorrect');

    const voided = await compensation.voidSale({
      operation_id: 'void-2',
      sale_id: sale2.sale.sale_id,
    });
    assert(voided.sale.status === 'voided', 'void did not transition sale status');
    assert(voided.void_snapshot.refund_total_minor === sale2.sale.total_minor, 'void refund total does not match original sale total');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 5, 'void did not restore stock');

    const voidReplay = await compensation.voidSale({
      operation_id: 'void-2',
      sale_id: sale2.sale.sale_id,
    });
    assert(voidReplay.void_snapshot.operation_id === 'void-2', 'void replay returned wrong snapshot');
    assert((await authority.getCatalogItem('product-1', 'variant-1'))?.stock_quantity === 5, 'void replay restored stock twice');

    let secondVoidFailed = false;
    try {
      await compensation.voidSale({
        operation_id: 'void-2-again',
        sale_id: sale2.sale.sale_id,
      });
    } catch (error) {
      secondVoidFailed =
        error instanceof CashierCompensationError &&
        error.code === 'CASHIER_SALE_ALREADY_VOIDED';
    }
    assert(secondVoidFailed, 'second distinct void did not fail closed');

    let returnOnVoidFailed = false;
    try {
      await compensation.returnSale({
        operation_id: 'return-on-void',
        sale_id: sale2.sale.sale_id,
        lines: [{ original_line_id: sale2.sale.lines[0].line_id, quantity: 1 }],
      });
    } catch (error) {
      returnOnVoidFailed =
        error instanceof CashierCompensationError &&
        error.code === 'CASHIER_RETURN_SALE_NOT_RETURNABLE';
    }
    assert(returnOnVoidFailed, 'return on voided sale did not fail closed');

    const serviceSale = await authority.commitSale({
      operation_id: 'service-sale-1',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'service-1', quantity: 1 }],
    });
    const serviceReturn = await compensation.returnSale({
      operation_id: 'service-return-1',
      sale_id: serviceSale.sale.sale_id,
      lines: [{ original_line_id: serviceSale.sale.lines[0].line_id, quantity: 1 }],
    });
    assert(serviceReturn.return_snapshot.refund_total_minor === 20_000, 'service return refund is incorrect');
    assert(serviceReturn.inventory_movements.length === 0, 'untracked service return created inventory movement');

    await compensation.close();
    compensation = null;
    await authority.close();
    authority = null;

    authority = new IndexedDbCashierAuthority(config);
    compensation = new IndexedDbCashierCompensationAuthority(config);
    const recoveredReturnSale = await authority.getSale(sale1.sale.sale_id);
    const recoveredVoidSale = await authority.getSale(sale2.sale.sale_id);
    assert((recoveredReturnSale?.returns || []).length === 2, 'return snapshots did not survive database reopen');
    assert(recoveredVoidSale?.status === 'voided' && recoveredVoidSale.void?.operation_id === 'void-2', 'void snapshot did not survive database reopen');

    return {
      ok: true,
      partial_return_refund_used_original_price: true,
      partial_return_stock_restored: true,
      return_replay_was_idempotent: true,
      full_return_completed: true,
      over_return_rolled_back: true,
      void_after_return_blocked: true,
      void_restored_stock: true,
      void_replay_was_idempotent: true,
      second_void_blocked: true,
      return_on_void_blocked: true,
      service_return_without_inventory_movement: true,
      compensation_restart_recovery_passed: true,
    };
  } finally {
    if (compensation) await compensation.close().catch(() => undefined);
    if (authority) await authority.close().catch(() => undefined);
    await deleteDatabase(databaseName).catch(() => undefined);
  }
}
