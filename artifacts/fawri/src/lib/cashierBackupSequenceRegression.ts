import { IndexedDbCashierAuthority } from './cashierIndexedDbAuthority';
import { CashierBackupError, IndexedDbCashierBackupAuthority } from './cashierBackupAuthority';

/**
 * P0 regression diagnostic. Run manually in a browser with IndexedDB.
 * This intentionally fails on an unsafe restore; it is not an acceptance pass.
 * It does not touch production data or call the server.
 */
export async function runCashierBackupSequenceRegression(): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is required');
  const databaseName = 'fawri-p0-sequence-regression-' +
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const config = {
    localMerchantId: 'p0-sequence-regression-merchant',
    deviceId: 'p0-sequence-regression-device',
    databaseName,
    now: () => new Date('2026-10-24T00:00:00.000Z'),
  };
  const cashier = new IndexedDbCashierAuthority(config);
  const backupAuthority = new IndexedDbCashierBackupAuthority(config);
  try {
    await cashier.upsertCatalogSnapshot([{
      product_id: 'p0-product',
      item_type: 'product',
      name: 'Sequence regression product',
      track_inventory: true,
      stock_quantity: 5,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      base_unit_price_minor: 1000,
      catalog_version: 1,
    }], { preserveLocalInventory: false });

    await cashier.commitSale({
      operation_id: 'p0-seq-before-backup',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'p0-product', quantity: 1 }],
    });
    const olderBackup = await backupAuthority.exportBackup();
    const newerSale = await cashier.commitSale({
      operation_id: 'p0-seq-after-backup',
      payment_method: 'cash',
      payment_status: 'paid',
      lines: [{ product_id: 'p0-product', quantity: 1 }],
    });
    // An independent stock adjustment must also survive a rejected stale restore.
    await cashier.adjustInventory({
      operation_id: 'p0-seq-after-backup-adjustment',
      product_id: 'p0-product',
      delta: 1,
      reason: 'manual_adjustment',
    });
    // The adjustment is a separate non-sale operation and must occupy its own
    // sequence without a missing local outbox envelope.
    const timeline = await cashier.listPendingSync();
    const sequenceByOperation = new Map<string, number>();
    for (const envelope of timeline) {
      const previous = sequenceByOperation.get(envelope.operation_id);
      if (previous !== undefined && previous !== envelope.device_sequence) {
        throw new Error('P0 FAIL: one operation has inconsistent device sequences');
      }
      sequenceByOperation.set(envelope.operation_id, envelope.device_sequence);
    }
    const orderedSequences = [
      sequenceByOperation.get('p0-seq-before-backup'),
      sequenceByOperation.get('p0-seq-after-backup'),
      sequenceByOperation.get('p0-seq-after-backup-adjustment'),
    ];
    if (orderedSequences.some(value => value === undefined) ||
        orderedSequences[1] !== orderedSequences[0]! + 1 ||
        orderedSequences[2] !== orderedSequences[1]! + 1) {
      throw new Error('P0 FAIL: sale and non-sale adjustment did not produce a contiguous operation timeline');
    }
    if (!timeline.some(item => item.operation_id === 'p0-seq-after-backup-adjustment' &&
        item.entity_type === 'inventory_movement')) {
      throw new Error('P0 FAIL: non-sale adjustment has no inventory movement outbox envelope');
    }
    // ACK is per operation: removing the middle non-sale operation must not
    // remove either sale or reassign their durable device sequences.
    await cashier.acknowledgeSynced(['p0-seq-after-backup-adjustment']);
    const afterAck = await cashier.listPendingSync();
    if (afterAck.some(item => item.operation_id === 'p0-seq-after-backup-adjustment')) {
      throw new Error('P0 FAIL: acknowledged adjustment remains in the outbox');
    }
    for (const operationId of ['p0-seq-before-backup', 'p0-seq-after-backup']) {
      const expected = sequenceByOperation.get(operationId);
      if (!afterAck.some(item => item.operation_id === operationId && item.device_sequence === expected)) {
        throw new Error('P0 FAIL: acknowledging adjustment altered an unrelated sale sequence');
      }
    }
    // Repeated acknowledgements and unknown IDs must not alter pending sales.
    await cashier.acknowledgeSynced([
      'p0-seq-after-backup-adjustment',
      'p0-seq-after-backup-adjustment',
      'p0-seq-never-created',
    ]);
    const afterRepeat = await cashier.listPendingSync();
    const remaining = afterAck.map(item => JSON.stringify(item)).sort();
    if (JSON.stringify(remaining) !== JSON.stringify(afterRepeat.map(item => JSON.stringify(item)).sort())) {
      throw new Error('P0 FAIL: repeated acknowledgement changed pending sales');
    }
    const before = await cashier.listPendingSync();
    const maximumBefore = Math.max(...timeline.map(item => item.device_sequence));
    if (maximumBefore < 3) throw new Error('Regression setup did not advance sequence for both sales and adjustment');

    // Restore must not silently roll back an active device. A safe implementation
    // may reject this operation or preserve/reconcile its authoritative timeline.
    let rejected = false;
    try {
      await backupAuthority.restoreBackup(olderBackup);
    } catch (error) {
      // An unrelated I/O or validation failure is not proof of rollback protection.
      if (!(error instanceof CashierBackupError)) throw error;
      if (!['CASHIER_BACKUP_SEQUENCE_ROLLBACK', 'CASHIER_BACKUP_STALE_RESTORE'].includes(error.code)) {
        throw new Error('P0 FAIL: restore rejected for an unrelated reason: ' + error.code);
      }
      rejected = true;
    }
    if (rejected) {
      const pendingAfterRejection = await cashier.listPendingSync();
      const beforeIds = before.map(item => `${item.operation_id}:${item.entity_type}:${item.entity_id}`).sort();
      const afterIds = pendingAfterRejection.map(item => `${item.operation_id}:${item.entity_type}:${item.entity_id}`).sort();
      if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
        throw new Error('P0 FAIL: rejected restore modified pending operations');
      }
      const itemAfterRejection = await cashier.getCatalogItem('p0-product');
      if (itemAfterRejection?.stock_quantity !== 4) {
        throw new Error('P0 FAIL: rejected restore changed adjusted stock');
      }
      if (!(await cashier.getSale(newerSale.sale.sale_id))) {
        throw new Error('P0 FAIL: rejected restore did not preserve the newer sale');
      }
      return;
    }

    const after = await cashier.listPendingSync();
    const maximumAfter = Math.max(...after.map(item => item.device_sequence));
    if (maximumAfter < Math.max(...before.map(item => item.device_sequence))) {
      throw new Error('P0 FAIL: stale backup rewound the pending outbox sequence');
    }
    if (!(await cashier.getSale(newerSale.sale.sale_id))) {
      throw new Error('P0 FAIL: stale backup silently removed a newer local sale');
    }
    const itemAfterRestore = await cashier.getCatalogItem('p0-product');
    if (itemAfterRestore?.stock_quantity !== 4) {
      throw new Error('P0 FAIL: stale backup silently rewound adjusted inventory');
    }
  } finally {
    await cashier.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Cleanup failed'));
      request.onblocked = () => reject(new Error('Cleanup blocked'));
    });
  }
}
