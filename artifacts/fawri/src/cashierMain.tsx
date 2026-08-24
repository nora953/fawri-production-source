import { createRoot } from 'react-dom/client';
import CashierCatalogSyncPage from '@/pages/CashierCatalogSyncPage';
import CashierHistoryPage from '@/pages/CashierHistoryPage';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import CashierPosPage from '@/pages/CashierPosPage';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import '@/styles/cashierPos.css';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';
import { installAuthClientCutover } from '@/lib/authClientCutover';
import { syncCashierOutboxToCloud } from '@/lib/cashierCloudOutboxSync';
import { syncCashierCatalogFromCloud } from '@/lib/cashierCloudCatalogSync';
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
        message: 'جارٍ مزامنة عمليات الكاشير.',
      });
    }

    try {
      const result = await syncCashierOutboxToCloud();
      const changedCloudState =
        result.uploaded_operations > 0 || result.replayed_operations > 0;

      if (changedCloudState) {
        // Orders and inventory are already canonical on the server after ACK.
        // Tell any open merchant dashboard tabs to refetch their server state.
        publishCashierDashboardRefresh();
      }

      if (reconcileCatalog && result.pending_after === 0) {
        // After reconnecting or an explicit merchant sync, refresh the local
        // catalog only after every pending operation has been accepted/replayed.
        await syncCashierCatalogFromCloud();
        publishCashierDashboardRefresh();
      }

      nextAttemptAt = 0;

      if (result.pending_after > 0) {
        publishCashierSyncUiState({
          status: 'needs_attention',
          pending: result.pending_after,
          message: 'بعض عمليات الكاشير ما زالت بانتظار المزامنة. اضغط للمحاولة مرة أخرى.',
        });
      } else {
        const shouldAnnounceSuccess =
          visible || getCashierSyncUiState().status === 'needs_attention';
        if (shouldAnnounceSuccess) {
          publishCashierSyncUiState({
            status: 'synced',
            pending: 0,
            message: 'تمت المزامنة بنجاح.',
          });
          window.setTimeout(() => {
            if (getCashierSyncUiState().status === 'synced') {
              publishCashierSyncUiState({ status: 'idle', pending: 0 });
            }
          }, 2_500);
        } else if (getCashierSyncUiState().status !== 'idle') {
          publishCashierSyncUiState({ status: 'idle', pending: 0 });
        }
      }
    } catch (cause) {
      const code = syncErrorCode(cause);
      if (!cashierIsOnline()) {
        publishCashierSyncUiState({
          status: 'offline',
          code,
          message: 'سيتم رفع العمليات تلقائيًا عند عودة الاتصال.',
        });
      } else {
        publishCashierSyncUiState({
          status: 'needs_attention',
          code,
          message:
            code === 'CASHIER_OUTBOX_SESSION_REQUIRED'
              ? 'انتهت جلسة التاجر. سجّل الدخول ثم اضغط المزامنة.'
              : 'تعذر إكمال المزامنة التلقائية. اضغط للمحاولة مرة أخرى.',
        });
      }
      nextAttemptAt = Date.now() + AUTO_SYNC_RETRY_BACKOFF_MS;
    } finally {
      running = false;
    }
  };

  const handleOnline = () => {
    nextAttemptAt = 0;
    void attempt(true, true, true);
  };
  const handleOffline = () => {
    publishCashierSyncUiState({
      status: 'offline',
      message: 'سيتم رفع العمليات تلقائيًا عند عودة الاتصال.',
    });
  };
  const handleFocus = () => {
    void attempt(false, false, false);
  };
  const unsubscribeManualRequest = subscribeCashierSyncRequests(() => {
    nextAttemptAt = 0;
    void attempt(true, true, true);
  });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleFocus);
  const interval = window.setInterval(() => {
    void attempt(false, false, false);
  }, AUTO_SYNC_INTERVAL_MS);

  // Pick up an operation that may already be pending when the cashier is opened.
  window.setTimeout(() => {
    void attempt(false, false, false);
  }, 0);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    unsubscribeManualRequest();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleFocus);
  };
}

document.documentElement.dataset.cashierView = diagnostics
  ? 'diagnostics'
  : sync
    ? 'sync'
    : history
      ? 'history'
      : 'pos';

createRoot(document.getElementById('cashier-root')!).render(
  diagnostics ? (
    <CashierLocalShellPage />
  ) : sync ? (
    <CashierCatalogSyncPage />
  ) : history ? (
    <CashierHistoryPage />
  ) : (
    <CashierPosPage />
  ),
);

// Demo fixtures intentionally never upload. Real cashier operational views keep
// a small serialized best-effort sync loop so online operations reach the cloud
// without a merchant click, while offline operations remain durable until
// connectivity or an authenticated merchant session returns.
if (!diagnostics && !sync && !demoRequested) {
  startCashierPosAutoSync();
}

void registerCashierOfflineAppShell();
