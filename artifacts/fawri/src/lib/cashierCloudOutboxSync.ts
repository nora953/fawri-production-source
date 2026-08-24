import {
  IndexedDbCashierAuthority,
  type IndexedDbCashierConfig,
} from './cashierIndexedDbAuthority';
import type { CashierSyncEnvelope } from './cashierLocalContracts';

const BOOTSTRAP_DATABASE = 'fawri-cashier-bootstrap-v1';
const BOOTSTRAP_STORE = 'identity';
const MAX_PENDING_ENVELOPES = 1000;

type CashierDeviceIdentity = {
  id: 'default';
  local_merchant_id: string;
  device_id: string;
  created_at: string;
  cloud_merchant_id?: string;
  cloud_bound_at?: string;
  last_catalog_sync_at?: string;
};

type CashierOperationKind = 'sale' | 'return' | 'void';

type CashierSyncResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  operation_id?: string;
  order_id?: string;
  device_sequence?: number;
  replayed?: boolean;
  compensation_kind?: 'return' | 'void';
  accepted_entity_ids?: string[];
};

export type CashierCloudOutboxSyncResult = {
  pending_before: number;
  uploaded_operations: number;
  replayed_operations: number;
  skipped_operations: number;
  acknowledged_operations: number;
  pending_after: number;
};

export class CashierCloudOutboxSyncError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierCloudOutboxSyncError';
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

function openBootstrapDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BOOTSTRAP_DATABASE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open cashier bootstrap database'));
  });
}

async function readBoundIdentity(): Promise<CashierDeviceIdentity> {
  if (typeof indexedDB === 'undefined') {
    throw new CashierCloudOutboxSyncError(
      'CASHIER_INDEXEDDB_UNAVAILABLE',
      'IndexedDB is unavailable on this device',
    );
  }
  const database = await openBootstrapDatabase();
  try {
    if (!database.objectStoreNames.contains(BOOTSTRAP_STORE)) {
      throw new CashierCloudOutboxSyncError(
        'CASHIER_OUTBOX_IDENTITY_MISSING',
        'Cashier device identity is not initialized',
      );
    }
    const transaction = database.transaction(BOOTSTRAP_STORE, 'readonly');
    const identity = (await requestResult(
      transaction.objectStore(BOOTSTRAP_STORE).get('default'),
    )) as CashierDeviceIdentity | undefined;
    if (!identity?.local_merchant_id || !identity.device_id) {
      throw new CashierCloudOutboxSyncError(
        'CASHIER_OUTBOX_IDENTITY_MISSING',
        'Cashier device identity is incomplete',
      );
    }
    if (!identity.cloud_merchant_id) {
      throw new CashierCloudOutboxSyncError(
        'CASHIER_OUTBOX_DEVICE_NOT_BOUND',
        'Cashier device must be provisioned from Fawri before uploading operations',
      );
    }
    return identity;
  } finally {
    database.close();
  }
}

function groupPending(
  envelopes: CashierSyncEnvelope[],
): Array<{ operationId: string; deviceSequence: number; envelopes: CashierSyncEnvelope[] }> {
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
      deviceSequence: Math.min(...items.map(item => Number(item.device_sequence))),
      envelopes: items.sort((left, right) => {
        if (left.entity_type === right.entity_type) {
          return left.entity_id.localeCompare(right.entity_id);
        }
        if (left.entity_type === 'sale') return -1;
        if (right.entity_type === 'sale') return 1;
        if (left.entity_type === 'return') return -1;
        if (right.entity_type === 'return') return 1;
        return left.entity_type.localeCompare(right.entity_type);
      }),
    }))
    .sort(
      (left, right) =>
        left.deviceSequence - right.deviceSequence ||
        left.operationId.localeCompare(right.operationId),
    );
}

function classifyOperation(
  envelopes: CashierSyncEnvelope[],
): CashierOperationKind | null {
  const saleEnvelopes = envelopes.filter(item => item.entity_type === 'sale');
  const returnEnvelopes = envelopes.filter(item => item.entity_type === 'return');
  const supported = envelopes.every(
    item =>
      item.entity_type === 'sale' ||
      item.entity_type === 'return' ||
      item.entity_type === 'inventory_movement',
  );
  if (!supported) return null;

  if (
    saleEnvelopes.length === 1 &&
    returnEnvelopes.length === 0 &&
    saleEnvelopes[0].operation === 'append'
  ) {
    return 'sale';
  }
  if (
    saleEnvelopes.length === 0 &&
    returnEnvelopes.length === 1 &&
    returnEnvelopes[0].operation === 'append'
  ) {
    return 'return';
  }
  if (
    saleEnvelopes.length === 1 &&
    returnEnvelopes.length === 0 &&
    saleEnvelopes[0].operation === 'void'
  ) {
    return 'void';
  }
  return null;
}

async function uploadOperation(input: {
  kind: CashierOperationKind;
  identity: CashierDeviceIdentity;
  operationId: string;
  deviceSequence: number;
  envelopes: CashierSyncEnvelope[];
}): Promise<{ replayed: boolean }> {
  const endpoint =
    input.kind === 'sale'
      ? '/api/cashier/sync/sale'
      : '/api/cashier/sync/compensation';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloud_merchant_id: input.identity.cloud_merchant_id,
        local_merchant_id: input.identity.local_merchant_id,
        device_id: input.identity.device_id,
        device_sequence: input.deviceSequence,
        operation_id: input.operationId,
        envelopes: input.envelopes,
      }),
    });
  } catch {
    throw new CashierCloudOutboxSyncError(
      'CASHIER_OUTBOX_NETWORK_FAILED',
      'Could not reach Fawri cashier sync service',
      0,
    );
  }
  const payload = (await response.json().catch(() => null)) as
    | CashierSyncResponse
    | null;
  if (!response.ok || payload?.ok !== true) {
    const code =
      response.status === 401
        ? 'CASHIER_OUTBOX_SESSION_REQUIRED'
        : String(payload?.code || 'CASHIER_OUTBOX_UPLOAD_FAILED');
    throw new CashierCloudOutboxSyncError(
      code,
      response.status === 401
        ? 'A signed-in merchant session is required to upload cashier operations'
        : String(payload?.error || 'Cashier operation upload failed'),
      response.status,
    );
  }
  if (
    payload.operation_id !== input.operationId ||
    Number(payload.device_sequence) !== input.deviceSequence ||
    !payload.order_id ||
    (input.kind !== 'sale' && payload.compensation_kind !== input.kind)
  ) {
    throw new CashierCloudOutboxSyncError(
      'CASHIER_OUTBOX_ACK_INVALID',
      'Fawri returned an invalid cashier sync acknowledgement',
      response.status,
    );
  }
  const expectedEntityIds = new Set(input.envelopes.map(item => item.entity_id));
  const acceptedEntityIds = new Set(
    Array.isArray(payload.accepted_entity_ids) ? payload.accepted_entity_ids : [],
  );
  if (
    acceptedEntityIds.size !== expectedEntityIds.size ||
    [...expectedEntityIds].some(id => !acceptedEntityIds.has(id))
  ) {
    throw new CashierCloudOutboxSyncError(
      'CASHIER_OUTBOX_ACK_INVALID',
      'Fawri did not acknowledge the complete cashier operation',
      response.status,
    );
  }
  return { replayed: payload.replayed === true };
}

export async function syncCashierOutboxToCloud(): Promise<CashierCloudOutboxSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierCloudOutboxSyncError(
      'CASHIER_OUTBOX_OFFLINE',
      'Internet connection is required to upload pending cashier operations',
      0,
    );
  }
  const identity = await readBoundIdentity();
  const databaseName = `fawri-cashier-${identity.local_merchant_id}-v1`;
  const config: IndexedDbCashierConfig = {
    localMerchantId: identity.local_merchant_id,
    cloudMerchantId: identity.cloud_merchant_id,
    deviceId: identity.device_id,
    databaseName,
  };
  const authority = new IndexedDbCashierAuthority(config);
  try {
    await authority.getCatalogItem('__fawri_outbox_schema_probe__');
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
      const result = await uploadOperation({
        kind,
        identity,
        operationId: operation.operationId,
        deviceSequence: operation.deviceSequence,
        envelopes: operation.envelopes,
      });
      if (result.replayed) replayedOperations += 1;
      else uploadedOperations += 1;

      // Acknowledge only after the server has accepted or idempotently replayed
      // the complete operation. Network ambiguity before this point leaves every
      // local envelope intact for safe retry.
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
