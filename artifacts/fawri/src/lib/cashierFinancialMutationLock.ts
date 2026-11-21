/**
 * Shared, same-origin browser coordination for financial IndexedDB writes and
 * cashier station re-pair admission. This is NOT a distributed/hosted lock.
 *
 * A station must NEVER be re-paired without a genuine cross-tab Web Lock:
 * otherwise a sale could commit between its last outbox check and the
 * bootstrap DB station-token CAS. Local sale/stock writes are allowed on
 * runtimes without Web Locks, since re-pairing then fails closed.
 */
export class CashierFinancialMutationLockError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierFinancialMutationLockError';
    this.code = code;
  }
}

export function cashierFinancialMutationLockName(
  localMerchantId: string,
  deviceId: string,
): string {
  // A canonical tuple encoding cannot collide if an identifier contains ':'.
  return 'fawri-cashier-local-financial:' +
    JSON.stringify([localMerchantId, deviceId]);
}

export function cashierCrossTabLockAvailable(): boolean {
  return typeof navigator !== 'undefined' &&
    typeof navigator.locks?.request === 'function';
}

export async function withCashierFinancialMutationLock<T>(
  localMerchantId: string,
  deviceId: string,
  mutation: () => Promise<T>,
  options: { requireCrossTab?: boolean } = {},
): Promise<T> {
  if (!cashierCrossTabLockAvailable()) {
    if (options.requireCrossTab) {
      throw new CashierFinancialMutationLockError(
        'CASHIER_PAIRING_CROSS_TAB_LOCK_UNAVAILABLE',
        'Browser cross-tab lock is required before changing cashier station',
      );
    }
    // Non-browser/unit-test/unsupported-browser financial commits retain
    // their original local transaction semantics. Re-pair is not permitted.
    return mutation();
  }
  return navigator.locks.request(
    cashierFinancialMutationLockName(localMerchantId, deviceId),
    { mode: 'exclusive' },
    async (lock) => {
      if (!lock) {
        throw new CashierFinancialMutationLockError(
          'CASHIER_FINANCIAL_LOCK_UNAVAILABLE',
          'Unable to coordinate cashier device writes',
        );
      }
      return mutation();
    },
  );
}
