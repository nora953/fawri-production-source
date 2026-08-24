export type CashierSyncUiStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'needs_attention';

export type CashierSyncUiState = {
  status: CashierSyncUiStatus;
  message?: string;
  code?: string;
  pending?: number;
};

const STATUS_EVENT = 'fawri:cashier-sync-status';
const REQUEST_EVENT = 'fawri:cashier-sync-request';

let currentState: CashierSyncUiState = { status: 'idle' };

export function getCashierSyncUiState(): CashierSyncUiState {
  return currentState;
}

export function publishCashierSyncUiState(next: CashierSyncUiState): void {
  currentState = next;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CashierSyncUiState>(STATUS_EVENT, { detail: next }),
  );
}

export function subscribeCashierSyncUiState(
  listener: (state: CashierSyncUiState) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CashierSyncUiState>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(STATUS_EVENT, handler);
  return () => window.removeEventListener(STATUS_EVENT, handler);
}

export function requestCashierSync(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT));
}

export function subscribeCashierSyncRequests(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(REQUEST_EVENT, handler);
  return () => window.removeEventListener(REQUEST_EVENT, handler);
}
