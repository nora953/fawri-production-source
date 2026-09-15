export function cashierOperatorSessionErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

export function isCashierOperatorSessionEnded(error: unknown): boolean {
  const code = cashierOperatorSessionErrorCode(error);
  return (
    code === 'CASHIER_OPERATOR_LOGIN_REQUIRED' ||
    code === 'CASHIER_OPERATOR_SESSION_INVALID'
  );
}

export function publishCashierOperatorSessionInvalidated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('fawri:cashier-operator-session-invalidated'),
  );
}
