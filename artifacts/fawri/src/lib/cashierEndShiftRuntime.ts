import {
  CashierOperatorSessionClientError,
  cashierOperatorHeaders,
  getCashierOperatorSession,
  getCashierPendingEnvelopeCount,
} from './cashierOperatorSessionRuntime';

const OPERATOR_STORAGE_KEY = 'fawri.cashier.operator-session.v1';

async function responsePayload(
  response: Response,
): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

export async function endCashierOperatorShiftWithPin(pinValue: string): Promise<void> {
  const pin = String(pinValue || '').trim();
  if (!/^\d{4,8}$/.test(pin)) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_PIN_INVALID',
      'Cashier PIN must contain 4 to 8 digits',
      400,
    );
  }

  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }

  const pending = await getCashierPendingEnvelopeCount();
  if (pending > 0) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_PENDING_SYNC',
      'Pending cashier operations must synchronize before closing this shift',
      409,
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorSessionClientError(
      'CASHIER_OPERATOR_LOGOUT_OFFLINE',
      'Internet connection is required to close the cashier shift',
      0,
    );
  }

  const response = await fetch('/api/cashier/operator/logout', {
    method: 'POST',
    headers: cashierOperatorHeaders(session),
    body: JSON.stringify({ pin }),
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    throw new CashierOperatorSessionClientError(
      String(payload.code || 'CASHIER_OPERATOR_LOGOUT_FAILED'),
      String(payload.error || 'Could not close cashier shift'),
      response.status,
    );
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(OPERATOR_STORAGE_KEY);
  }
}
