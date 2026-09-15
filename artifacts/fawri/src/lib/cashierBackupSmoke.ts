import {
  CashierBackupError,
  IndexedDbCashierBackupAuthority,
} from './cashierBackupAuthority';
import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import {
  IndexedDbCashierCompensationAuthority,
} from './cashierCompensationAuthority';
import {
  buildCashierLocalHistory,
  summarizeCashierLocalHistory,
} from './cashierLocalHistory';
import type { CashierCatalogLookup } from './cashierLocalContracts';

export type CashierBackupSmokeReport = {
  ok: true;
  history_projection_passed: true;
  backup_integrity_sha256_passed: true;
  tampered_backup_failed_closed: true;
  failed_restore_preserved_existing_data: true;
  merchant_mismatch_failed_closed: true;
  valid_restore_replaced_destination_atomically: true;
  sale_return_void_evidence_restored: true;
  inventory_projection_restored: true;
  outbox_restored: true;
  backup_round_trip_records_match: true;
  restore_restart_recovery_passed: true;
};

function uniqueName(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
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
  if (!condition) throw new Error(`Cashier backup smoke failed: ${message}`);
}

export async function runCashierBackupSmoke(): Promise<CashierBackupSmokeReport> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Cashier backup smoke requires IndexedDB');
  }

  const localMerchantId = 'backup-smoke-merchant';
  const sourceDatabase = uniqueName('fawri-cashier-backup-source');
  const destinationDatabase = uniqueName('fawri-cashier-backup-destination');
  const mismatchDatabase = uniqueName('fawri-cashier-backup-mismatch');
  let clock = new Date('2026-08-23T16:00:00.000Z');
  const now = () => new Date(clock);

  const sourceConfig: IndexedDbCashierConfig = {
    localMerchantId,
    deviceId: 'backup-source-device',
    databaseName: sourceDatabase,
    now,
  };
  const destinationConfig: IndexedDbCashierConfig = {
    localMerchantId,
    deviceId: 'backup-destination-device',
    databaseName: destinationDatabase,
    now,
  };
  const mismatchConfig: IndexedDbCashierConfig = {
    localMerchantId: 'another-local-merchant',
    deviceId: 'backup-mismatch-device',
    databaseName: mismatchDatabase,
    now,
  };

  const product: CashierCatalogLookup = {
    product_id: 'backup-product-1',
    variant_id: 'backup-variant-1',
    item_type: 'product',
    name: 'Backup Product',
    variant_name: 'Default',
    sku: 'BACKUP-SKU-1',
    barcode: '992000000001',
    track_inventory: true,
    stock_quantity: 4,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 10_000,
    catalog_version: 1,
  };
  const service: CashierCatalogLookup = {
    product_id: 'backup-service-1',
    item_type: 'service',
    name: 'Backup Service',
    track_inventory: false,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 20_000,
    catalog_version: 1,
  };
  const sentinel: CashierCatalogLookup = {
    product_id: 'destination-sentinel',
    item_type: 'product',
    name: 'Destination Sentinel',
    track_inventory: true,
    stock_quantity: 9,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 1_000,
    catalog_version: 1,
  };

  let source: IndexedDbCashierAuthority | null = null;
  let sourceCompensation: IndexedDbCashierCompensationAuthority | null = null;
  let destination: IndexedDbCashierAuthority | null = null;

  try {
    source = new IndexedDbCashierAuthority(sourceConfig);
    sourceCompensation = new IndexedDbCashierCompensationAuthority(sourceConfig);
    await source.upsertCatalogSnapshot([product, service], {
      preserveLocalInventory: false,
    });

    const productSale = await source.commitSale({
      operation_id: 'backup-product-sale',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [
        {
          product_id: product.product_id,
          variant_id: product.variant_id,
          quantity: 2,
        },
      ],
    });
    clock = new Date('2026-08-23T16:05:00.000Z');
    await sourceCompensation.returnSale({
      operation_id: 'backup-product-return',
      sale_id: productSale.sale.sale_id,
      lines: [
        {
          original_line_id: productSale.sale.lines[0].line_id,
          quantity: 1,
        },
      ],
    });

    clock = new Date('2026-08-23T16:10:00.000Z');
    const serviceSale = await source.commitSale({
      operation_id: 'backup-service-sale',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: service.product_id, quantity: 1 }],
    });
    clock = new Date('2026-08-23T16:12:00.000Z');
    await sourceCompensation.voidSale({
      operation_id: 'backup-service-void',
      sale_id: serviceSale.sale.sale_id,
    });

    const sourceSales = await source.listSales();
    const sourceHistory = buildCashierLocalHistory(sourceSales);
    const sourceSummary = summarizeCashierLocalHistory(sourceHistory);
    assert(sourceHistory.length === 4, 'history should contain two sales, one return, and one void');
    assert(sourceSummary.length === 1, 'history should keep one IQD currency summary');
    assert(sourceSummary[0].gross_sales_minor === 40_000, 'history gross total is incorrect');
    assert(sourceSummary[0].returned_minor === 10_000, 'history returned total is incorrect');
    assert(sourceSummary[0].voided_minor === 20_000, 'history voided total is incorrect');
    assert(sourceSummary[0].net_sales_minor === 10_000, 'history net total is incorrect');

    const sourceBackupAuthority = new IndexedDbCashierBackupAuthority(sourceConfig);
    const backup = await sourceBackupAuthority.exportBackup();
    assert(/^[a-f0-9]{64}$/.test(backup.integrity.digest_hex), 'backup SHA-256 digest is invalid');
    assert(backup.record_counts.sales === 2, 'backup sale count is incorrect');
    assert(backup.record_counts.catalog === 2, 'backup catalog count is incorrect');

    destination = new IndexedDbCashierAuthority(destinationConfig);
    await destination.upsertCatalogSnapshot([sentinel], {
      preserveLocalInventory: false,
    });
    const destinationBackupAuthority = new IndexedDbCashierBackupAuthority(destinationConfig);

    const tampered = JSON.parse(JSON.stringify(backup)) as typeof backup;
    tampered.stores.catalog[0].base_unit_price_minor = 99_999;
    let tamperedFailed = false;
    try {
      await destinationBackupAuthority.restoreBackup(tampered);
    } catch (error) {
      tamperedFailed =
        error instanceof CashierBackupError &&
        error.code === 'CASHIER_BACKUP_INTEGRITY_MISMATCH';
    }
    assert(tamperedFailed, 'tampered backup did not fail integrity validation');
    assert(
      (await destination.getCatalogItem(sentinel.product_id))?.stock_quantity === 9,
      'failed restore changed existing destination data',
    );

    const mismatchBackupAuthority = new IndexedDbCashierBackupAuthority(mismatchConfig);
    let merchantMismatchFailed = false;
    try {
      await mismatchBackupAuthority.restoreBackup(backup);
    } catch (error) {
      merchantMismatchFailed =
        error instanceof CashierBackupError &&
        error.code === 'CASHIER_BACKUP_MERCHANT_MISMATCH';
    }
    assert(merchantMismatchFailed, 'cross-merchant restore did not fail closed');

    const restore = await destinationBackupAuthority.restoreBackup(backup);
    assert(restore.ok, 'valid backup restore did not complete');
    assert((await destination.getCatalogItem(sentinel.product_id)) === null, 'restore did not replace destination atomically');
    const restoredProduct = await destination.getCatalogItem(
      product.product_id,
      product.variant_id,
    );
    assert(restoredProduct?.stock_quantity === 3, 'restored stock projection is incorrect');

    const restoredProductSale = await destination.getSale(productSale.sale.sale_id);
    assert((restoredProductSale?.returns || []).length === 1, 'return evidence was not restored');
    assert(restoredProductSale?.returns?.[0].refund_total_minor === 10_000, 'restored return refund is incorrect');
    const restoredServiceSale = await destination.getSale(serviceSale.sale.sale_id);
    assert(restoredServiceSale?.status === 'voided', 'voided sale status was not restored');
    assert(restoredServiceSale?.void?.refund_total_minor === 20_000, 'void evidence was not restored');

    const restoredPending = await destination.listPendingSync();
    assert(
      restoredPending.length === backup.record_counts.outbox,
      'pending outbox was not restored exactly',
    );

    const roundTrip = await destinationBackupAuthority.exportBackup();
    assert(
      JSON.stringify(roundTrip.stores) === JSON.stringify(backup.stores),
      'backup round-trip store records differ',
    );

    const destinationHistory = buildCashierLocalHistory(await destination.listSales());
    assert(
      JSON.stringify(destinationHistory) === JSON.stringify(sourceHistory),
      'restored local history differs from source history',
    );

    await destination.close();
    destination = null;
    destination = new IndexedDbCashierAuthority(destinationConfig);
    const reopenedProductSale = await destination.getSale(productSale.sale.sale_id);
    const reopenedServiceSale = await destination.getSale(serviceSale.sale.sale_id);
    const reopenedProduct = await destination.getCatalogItem(
      product.product_id,
      product.variant_id,
    );
    assert((reopenedProductSale?.returns || []).length === 1, 'restored return evidence did not survive reopen');
    assert(reopenedServiceSale?.status === 'voided' && reopenedServiceSale.void?.operation_id === 'backup-service-void', 'restored void evidence did not survive reopen');
    assert(reopenedProduct?.stock_quantity === 3, 'restored stock did not survive reopen');

    return {
      ok: true,
      history_projection_passed: true,
      backup_integrity_sha256_passed: true,
      tampered_backup_failed_closed: true,
      failed_restore_preserved_existing_data: true,
      merchant_mismatch_failed_closed: true,
      valid_restore_replaced_destination_atomically: true,
      sale_return_void_evidence_restored: true,
      inventory_projection_restored: true,
      outbox_restored: true,
      backup_round_trip_records_match: true,
      restore_restart_recovery_passed: true,
    };
  } finally {
    if (sourceCompensation) await sourceCompensation.close().catch(() => undefined);
    if (source) await source.close().catch(() => undefined);
    if (destination) await destination.close().catch(() => undefined);
    await deleteDatabase(sourceDatabase).catch(() => undefined);
    await deleteDatabase(destinationDatabase).catch(() => undefined);
    await deleteDatabase(mismatchDatabase).catch(() => undefined);
  }
}
