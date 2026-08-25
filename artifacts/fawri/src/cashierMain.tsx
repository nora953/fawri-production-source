import { createRoot } from 'react-dom/client';
import CashierCatalogSyncPage from '@/pages/CashierCatalogSyncPage';
import CashierHistoryPage from '@/pages/CashierHistoryPage';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import CashierPosPage from '@/pages/CashierPosPage';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import '@/styles/fawriLanguageAuthority.css';
import '@/styles/cashierPos.css';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';
import { installAuthClientCutover } from '@/lib/authClientCutover';
import { syncCashierOutboxToCloud } from '@/lib/cashierCloudOutboxSync';
import { syncCashierCatalogFromCloud } from '@/lib/cashierCloudCatalogSync';
import { publishCashierCatalogRefresh } from '@/lib/cashierCatalogRefresh';
import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';
import {
  getCashierSyncUiState,
  publishCashierSyncUiState,
  subscribeCashierSyncRequests,
} from '@/lib/cashierSyncUiState';

const params = new URLSearchParams(window.location.search);
const diagnosticsRequested = params.get('diagnostics') === '1';
const diagnostics =
  diagnosticsRequested && import.meta.env.VITE_CASHIER_DIAGNOSTICS === '1';
const sync = params.get('sync') === '1';
const history = params.get('history') === '1';
const demoRequested = params.get('demo') === '1';

const AUTO_SYNC_INTERVAL_MS = 3_000;
const AUTO_SYNC_RETRY_BACKOFF_MS = 30_000;

// Installing the Auth v2 transport does not make local POS operation depend on
// the network. It only equips optional same-origin API calls with the stable
// device identifier and HttpOnly merchant session when a background/manual
// sync is attempted. Local browsing, pricing and sale commit remain IndexedDB-first.
if (!diagnostics) {
  installAuthClientCutover();
}

function syncErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

function isMerchantSessionRequired(code: string): boolean {
  return (
    code === 'CASHIER_OUTBOX_SESSION_REQUIRED' ||
    code === 'CASHIER_CLOUD_SESSION_REQUIRED'
  );
}

function cashierIsOnline(): boolean {
  return navigator.onLine !== false;
}

function startCashierPosAutoSync(): () => void {
  let stopped = false;
  let running = false;
  let nextAttemptAt = 0;

  const attempt = async (
    reconcileCatalog = false,
    force = false,
    visible = false,
  ) => {
    if (stopped || running) return;

    if (!cashierIsOnline()) {
      publishCashierSyncUiState({
        status: 'offline',
        message: 'سيتم رفع العمليات تلقائيًا عند عودة الاتصال.',
      });
      return;
    }

    if (!force && Date.now() < nextAttemptAt) return;

    running = true;
    if (visible) {
      publishCashierSyncUiState({
        status: 'syncing',
        message: 'جارٍ مزامنة العمليات المحلية مع السحابة...',
      });
    }

    try {
      const outboxResult = await syncCashierOutboxToCloud();
      if (stopped) return;

      if (
        outboxResult.status === 'blocked' ||
        outboxResult.status === 'paused'
      ) {
        nextAttemptAt = Date.now() + AUTO_SYNC_RETRY_BACKOFF_MS;
        publishCashierSyncUiState({
          status: 'error',
          message: 'تحتاج مزامنة الكاشير إلى مراجعة. يمكنك متابعة البيع محليًا.',
        });
        return;
      }

      if (reconcileCatalog) {
        await syncCashierCatalogFromCloud();
        if (!stopped) publishCashierCatalogRefresh();
      }

      if (!stopped) {
        nextAttemptAt = 0;
        publishCashierDashboardRefresh();
        publishCashierSyncUiState({ status: 'synced' });
      }
    } catch (error) {
      if (stopped) return;
      const code = syncErrorCode(error);
      nextAttemptAt = Date.now() + AUTO_SYNC_RETRY_BACKOFF_MS;
      publishCashierSyncUiState(
        isMerchantSessionRequired(code)
          ? {
              status: 'session_required',
              message: 'الكاشير المحلي يعمل. سجّل دخول التاجر لتفعيل مزامنة السحابة.',
            }
          : {
              status: 'error',
              message: 'تعذر إكمال المزامنة التلقائية. اضغط للمحاولة مرة أخرى.',
            },
      );
    } finally {
      running = false;
    }
  };

  const unsubscribe = subscribeCashierSyncRequests(() => {
    void attempt(true, true, true);
  });

  const onOnline = () => {
    void attempt(true, true, true);
  };
  window.addEventListener('online', onOnline);

  const interval = window.setInterval(() => {
    void attempt(false, false, false);
  }, AUTO_SYNC_INTERVAL_MS);

  void attempt(true, true, false);

  return () => {
    stopped = true;
    unsubscribe();
    window.removeEventListener('online', onOnline);
    window.clearInterval(interval);
  };
}

function render() {
  const root = createRoot(document.getElementById('cashier-root')!);

  if (demoRequested) {
    root.render(<CashierPosPage demoMode />);
    return;
  }

  if (diagnostics) {
    root.render(<CashierCatalogSyncPage />);
    return;
  }

  if (history) {
    root.render(<CashierHistoryPage />);
    return;
  }

  if (sync) {
    root.render(<CashierCatalogSyncPage />);
    return;
  }

  root.render(<CashierLocalShellPage />);
}

if (!diagnostics) {
  registerCashierOfflineAppShell();
  startCashierPosAutoSync();
}

render();
