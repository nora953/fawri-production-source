const OPERATOR_LOCAL_DATABASE = 'fawri-cashier-operator-local-v1';
const OPERATOR_LOCAL_VERSION = 3;
const COST_EVIDENCE_STORE = 'cost_evidence';
const OPERATION_BINDING_STORE = 'operation_bindings';

export class CashierOperatorLocalDatabaseReadinessError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierOperatorLocalDatabaseReadinessError';
    this.code = code;
  }
}

function upgradeOperatorLocalSchema(request: IDBOpenDBRequest): void {
  const database = request.result;
  if (!database.objectStoreNames.contains(COST_EVIDENCE_STORE)) {
    database.createObjectStore(COST_EVIDENCE_STORE, { keyPath: 'key' });
  }

  let bindingStore: IDBObjectStore;
  if (!database.objectStoreNames.contains(OPERATION_BINDING_STORE)) {
    bindingStore = database.createObjectStore(OPERATION_BINDING_STORE, {
      keyPath: 'operation_id',
    });
  } else {
    const transaction = request.transaction;
    if (!transaction) {
      throw new CashierOperatorLocalDatabaseReadinessError(
        'CASHIER_OPERATOR_LOCAL_DATABASE_UPGRADE_INVALID',
        'Cashier local security database upgrade transaction is unavailable',
      );
    }
    bindingStore = transaction.objectStore(OPERATION_BINDING_STORE);
  }

  if (!bindingStore.indexNames.contains('staff_id')) {
    bindingStore.createIndex('staff_id', 'staff_id', { unique: false });
  }
  if (!bindingStore.indexNames.contains('shift_id')) {
    bindingStore.createIndex('shift_id', 'shift_id', { unique: false });
  }
}

/**
 * Fail fast instead of leaving a cashier sale promise pending forever when an
 * older Fawri tab keeps the operator-local IndexedDB schema open during an
 * upgrade. The canonical local-security helpers still own all reads/writes;
 * this function only proves that the required schema can be opened safely.
 */
export async function ensureCashierOperatorLocalDatabaseReady(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierOperatorLocalDatabaseReadinessError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OPERATOR_LOCAL_DATABASE, OPERATOR_LOCAL_VERSION);
    let blocked = false;

    request.onupgradeneeded = () => {
      try {
        upgradeOperatorLocalSchema(request);
      } catch (error) {
        reject(error);
      }
    };

    request.onblocked = () => {
      blocked = true;
      reject(
        new CashierOperatorLocalDatabaseReadinessError(
          'CASHIER_OPERATOR_LOCAL_DATABASE_BLOCKED',
          'Cashier local security storage is blocked by another Fawri tab',
        ),
      );
    };

    request.onerror = () => {
      reject(
        new CashierOperatorLocalDatabaseReadinessError(
          'CASHIER_OPERATOR_LOCAL_DATABASE_OPEN_FAILED',
          request.error?.message || 'Could not open cashier local security storage',
        ),
      );
    };

    request.onsuccess = () => {
      const opened = request.result;
      if (blocked) {
        opened.close();
        return;
      }
      opened.onversionchange = () => opened.close();
      resolve(opened);
    };
  });

  database.close();
}
