export type CashierConnectivitySource =
  | 'browser'
  | 'network_response'
  | 'network_failure';

export type CashierConnectivityState = {
  online: boolean;
  source: CashierConnectivitySource;
};

const CONNECTIVITY_EVENT = 'fawri:cashier-connectivity';
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);
const CASHIER_REACHABILITY_PATH = '/healthz';
const CASHIER_REACHABILITY_TIMEOUT_MS = 2_500;
const CASHIER_OFFLINE_REPROBE_MS = 10_000;

function nativeNavigatorOnlineReader(): () => boolean {
  if (typeof navigator === 'undefined') return () => true;
  let prototype: object | null = Object.getPrototypeOf(navigator);
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'onLine');
    if (descriptor?.get) {
      return () => {
        try {
          return descriptor.get!.call(navigator) !== false;
        } catch {
          return true;
        }
      };
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  const initial = navigator.onLine !== false;
  return () => initial;
}

const readNativeNavigatorOnline = nativeNavigatorOnlineReader();

let currentState: CashierConnectivityState = {
  online: readNativeNavigatorOnline(),
  source: 'browser',
};
let installed = false;
let broadcastingCompatibilityEvent = false;
let reachabilityProbe: Promise<boolean> | null = null;

function publishCashierConnectivity(next: CashierConnectivityState): void {
  const onlineChanged = currentState.online !== next.online;
  const stateChanged =
    onlineChanged || currentState.source !== next.source;
  if (!stateChanged) return;

  currentState = next;
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<CashierConnectivityState>(CONNECTIVITY_EVENT, {
      detail: next,
    }),
  );

  if (onlineChanged && next.source !== 'browser') {
    broadcastingCompatibilityEvent = true;
    try {
      window.dispatchEvent(new Event(next.online ? 'online' : 'offline'));
    } finally {
      broadcastingCompatibilityEvent = false;
    }
  }
}

function browserOnline(): void {
  if (broadcastingCompatibilityEvent) return;
  publishCashierConnectivity({ online: true, source: 'browser' });
  void probeCashierConnectivity();
}

function browserOffline(): void {
  if (broadcastingCompatibilityEvent) return;
  // Browser/OS connectivity flags are advisory only. Some desktop browsers can
  // report offline while the same-origin Fawri service is still reachable.
  // Verify the actual service before locking online-only cashier capabilities.
  void probeCashierConnectivity();
}

function probeOnFocus(): void {
  if (!currentState.online) void probeCashierConnectivity();
}

function requestUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return '';
}

function isCashierApiRequest(input: unknown): boolean {
  if (typeof window === 'undefined') return false;
  const value = requestUrl(input);
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith('/api/cashier/')
    );
  } catch {
    return false;
  }
}

function isTransientCashierGatewayResponse(
  cashierRequest: boolean,
  response: Response,
): boolean {
  return cashierRequest && TRANSIENT_GATEWAY_STATUSES.has(response.status);
}

export function getCashierConnectivityState(): CashierConnectivityState {
  return currentState;
}

export function cashierConnectivityIsOnline(): boolean {
  return currentState.online;
}

export function cashierNetworkAttemptAllowed(): boolean {
  return currentState.online || readNativeNavigatorOnline();
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

export function probeCashierConnectivity(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true);
  if (reachabilityProbe) return reachabilityProbe;

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    CASHIER_REACHABILITY_TIMEOUT_MS,
  );

  reachabilityProbe = window.fetch(CASHIER_REACHABILITY_PATH, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        markCashierNetworkFailure();
        return false;
      }
      markCashierNetworkResponse();
      return true;
    })
    .catch(() => {
      markCashierNetworkFailure();
      return false;
    })
    .finally(() => {
      window.clearTimeout(timeout);
      reachabilityProbe = null;
    });

  return reachabilityProbe;
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

export function installCashierConnectivityAuthority(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  currentState = {
    online: readNativeNavigatorOnline(),
    source: 'browser',
  };

  if (typeof navigator !== 'undefined') {
    try {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        enumerable: true,
        get: () => currentState.online,
      });
    } catch {
      installed = false;
      throw new Error('CASHIER_CONNECTIVITY_BRIDGE_UNAVAILABLE');
    }
  }

  window.addEventListener('online', browserOnline);
  window.addEventListener('offline', browserOffline);
  window.addEventListener('focus', probeOnFocus);

  const originalFetch = window.fetch.bind(window);
  const wrappedFetch: typeof window.fetch = async (...args) => {
    const cashierRequest = isCashierApiRequest(args[0]);
    try {
      const response = await originalFetch(...args);
      if (isTransientCashierGatewayResponse(cashierRequest, response)) {
        markCashierNetworkFailure();
        throw new TypeError(
          `Cashier service temporarily unavailable (${response.status})`,
        );
      }
      if (cashierRequest) markCashierNetworkResponse();
      return response;
    } catch (cause) {
      if (cashierRequest && cause instanceof TypeError) {
        markCashierNetworkFailure();
      }
      throw cause;
    }
  };
  window.fetch = wrappedFetch;

  // Establish transport truth immediately, even when navigator.onLine starts
  // with a false negative. Genuine offline states are periodically re-probed so
  // recovery does not depend on the browser emitting a reliable online event.
  void probeCashierConnectivity();
  window.setInterval(() => {
    if (!currentState.online) void probeCashierConnectivity();
  }, CASHIER_OFFLINE_REPROBE_MS);
}
