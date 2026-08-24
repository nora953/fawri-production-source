const CASHIER_DASHBOARD_REFRESH_KEY = 'fawri.cashier.dashboardRefresh';
const CASHIER_DASHBOARD_REFRESH_CHANNEL = 'fawri.cashier.dashboardRefresh';

function nextRefreshToken(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${Date.now()}:${random}`;
}

export function readCashierDashboardRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CASHIER_DASHBOARD_REFRESH_KEY);
  } catch {
    return null;
  }
}

export function publishCashierDashboardRefresh(): void {
  if (typeof window === 'undefined') return;
  const token = nextRefreshToken();

  try {
    window.localStorage.setItem(CASHIER_DASHBOARD_REFRESH_KEY, token);
  } catch {
    // Cross-tab refresh is a UI convenience only. Server state remains authoritative.
  }

  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(CASHIER_DASHBOARD_REFRESH_CHANNEL);
    channel.postMessage(token);
    channel.close();
  } catch {
    // localStorage/visibility fallback still covers supported browser sessions.
  }
}

export function subscribeCashierDashboardRefresh(
  listener: (token: string) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === CASHIER_DASHBOARD_REFRESH_KEY && event.newValue) {
      listener(event.newValue);
    }
  };
  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CASHIER_DASHBOARD_REFRESH_CHANNEL);
      channel.onmessage = event => {
        if (typeof event.data === 'string' && event.data) listener(event.data);
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) channel.close();
  };
}
