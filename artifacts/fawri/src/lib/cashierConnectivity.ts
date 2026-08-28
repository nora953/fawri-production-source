export type CashierConnectivitySource =
  | 'browser'
  | 'network_response'
  | 'network_failure';

export type CashierConnectivityState = {
  online: boolean;
  source: CashierConnectivitySource;
};

const CONNECTIVITY_EVENT = 'fawri:cashier-connectivity';

let currentState: CashierConnectivityState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  source: 'browser',
};

function publishCashierConnectivity(next: CashierConnectivityState): void {
  if (
    currentState.online === next.online &&
    currentState.source === next.source
  ) {
    return;
  }
  currentState = next;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CashierConnectivityState>(CONNECTIVITY_EVENT, {
      detail: next,
    }),
  );
}

function browserOnline(): void {
  publishCashierConnectivity({ online: true, source: 'browser' });
}

function browserOffline(): void {
  publishCashierConnectivity({ online: false, source: 'browser' });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', browserOnline);
  window.addEventListener('offline', browserOffline);
}

export function getCashierConnectivityState(): CashierConnectivityState {
  return currentState;
}

export function cashierConnectivityIsOnline(): boolean {
  return currentState.online;
}

export function cashierNetworkAttemptAllowed(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function markCashierOffline(): void {
  publishCashierConnectivity({ online: false, source: 'browser' });
}

export function markCashierNetworkFailure(): void {
  publishCashierConnectivity({ online: false, source: 'network_failure' });
}

export function markCashierNetworkResponse(): void {
  publishCashierConnectivity({ online: true, source: 'network_response' });
}

export function subscribeCashierConnectivity(
  listener: (state: CashierConnectivityState) => void,
): () => void {
  listener(currentState);
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CashierConnectivityState>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(CONNECTIVITY_EVENT, handler);
  return () => window.removeEventListener(CONNECTIVITY_EVENT, handler);
}
