import { createRoot } from 'react-dom/client';
import CashierCatalogSyncPage from '@/pages/CashierCatalogSyncPage';
import CashierHistoryPage from '@/pages/CashierHistoryPage';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import CashierPosPage from '@/pages/CashierPosPage';
import CashierReportsPage from '@/pages/CashierReportsPage';
import CashierOperatorGate from '@/components/cashier/CashierOperatorGate';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import '@/styles/fawriLanguageAuthority.css';
import '@/styles/cashierPos.css';
import '@/styles/merchantCommerceUxFixes.css';
import { I18nProvider } from '@/lib/i18n';
import { storedCashierCopy } from '@/lib/cashierUiCopy';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';
import {
  syncCashierOperatorCatalogFromCloud,
  syncCashierOperatorOutboxToCloud,
} from '@/lib/cashierOperatorCloudSync';
import {
  getCashierOperatorSession,
  invalidateCashierOperatorSession,
} from '@/lib/cashierOperatorSessionRuntime';
import { refreshCashierOperatorPolicyFromCloud } from '@/lib/cashierOperatorPolicyRefresh';
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
const reports = params.get('reports') === '1';
const demoRequested = params.get('demo') === '1';

const AUTO_SYNC_INTERVAL_MS = 3_000;
const AUTO_SYNC_RETRY_BACKOFF_MS = 30_000;

function syncErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

function isOperatorSessionRequired(code: string): boolean {
  return (
    code === 'CASHIER_OPERATOR_LOGIN_REQUIRED' ||
    code === 'CASHIER_OPERATOR_SESSION_INVALID' ||
    code === 'CASHIER_STATION_PAIRING_REQUIRED' ||
    code === 'CASHIER_STATION_CREDENTIAL_INVALID'
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
    const activeSession = await getCashierOperatorSession().catch(() => null);
    if (!activeSession) return;
    const labels = storedCashierCopy().runtime;

    if (!cashierIsOnline()) {
      publishCashierSyncUiState({
        status: 'offline',
        message: labels.offlineUpload,
      });
      return;
    }

    if (!force && Date.now() < nextAttemptAt) return;

    running = true;
    if (visible) {
      publishCashierSyncUiState({
        status: 'syncing',
        message: labels.syncingOperations,
      });
    }

    try {
      if (reconcileCatalog || force) {
        await refreshCashierOperatorPolicyFromCloud();
      }
      const result = await syncCashierOperatorOutboxToCloud();
      const changedCloudState =
        result.uploaded_operations > 0 || result.replayed_operations > 0;

      if (changedCloudState) {
        publishCashierDashboardRefresh();
      }

      if (reconcileCatalog && result.pending_after === 0) {
        await syncCashierOperatorCatalogFromCloud();
        publishCashierCatalogRefresh();
        publishCashierDashboardRefresh();
      }

      nextAttemptAt = 0;

      if (result.pending_after > 0) {
        publishCashierSyncUiState({
          status: 'needs_attention',
          pending: result.pending_after,
          message: labels.pendingOperations,
        });
      } else {
        const shouldAnnounceSuccess =
          visible || getCashierSyncUiState().status === 'needs_attention';
        if (shouldAnnounceSuccess) {
          publishCashierSyncUiState({
            status: 'synced',
            pending: 0,
            message: labels.synced,
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
      const rawCode = syncErrorCode(cause);
      const sessionRequired = isOperatorSessionRequired(rawCode);
      const uiCode = sessionRequired
        ? 'CASHIER_OPERATOR_LOGIN_REQUIRED'
        : rawCode;
      const latestLabels = storedCashierCopy().runtime;

      if (sessionRequired) {
        invalidateCashierOperatorSession();
        window.dispatchEvent(
          new CustomEvent('fawri:cashier-operator-session-invalidated'),
        );
      }

      if (!cashierIsOnline()) {
        publishCashierSyncUiState({
          status: 'offline',
          code: uiCode,
          message: latestLabels.offlineUpload,
        });
      } else {
        publishCashierSyncUiState({
          status: 'needs_attention',
          code: uiCode,
          message: sessionRequired
            ? latestLabels.sessionExpired
            : latestLabels.autoSyncFailed,
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
      message: storedCashierCopy().runtime.offlineUpload,
    });
  };
  const handleFocus = () => {
    nextAttemptAt = 0;
    void attempt(true, true, false);
  };
  const handleSessionChange = () => {
    nextAttemptAt = 0;
    void attempt(true, true, false);
  };
  const unsubscribeManualRequest = subscribeCashierSyncRequests(() => {
    nextAttemptAt = 0;
    void attempt(true, true, true);
  });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('fawri:cashier-operator-session-changed', handleSessionChange);
  const interval = window.setInterval(() => {
    void attempt(false, false, false);
  }, AUTO_SYNC_INTERVAL_MS);

  window.setTimeout(() => {
    void attempt(true, false, false);
  }, 0);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    unsubscribeManualRequest();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('fawri:cashier-operator-session-changed', handleSessionChange);
  };
}

document.documentElement.dataset.cashierView = diagnostics
  ? 'diagnostics'
  : sync
    ? 'sync'
    : reports
      ? 'reports'
      : history
        ? 'history'
        : 'pos';

const operationalPage = sync ? (
  <CashierCatalogSyncPage />
) : reports ? (
  <CashierReportsPage />
) : history ? (
  <CashierHistoryPage />
) : (
  <CashierPosPage />
);

createRoot(document.getElementById('cashier-root')!).render(
  diagnostics ? (
    <CashierLocalShellPage />
  ) : (
    <I18nProvider>
      <CashierOperatorGate bypass={demoRequested}>
        {operationalPage}
      </CashierOperatorGate>
    </I18nProvider>
  ),
);

if (!diagnostics && !sync && !demoRequested) {
  startCashierPosAutoSync();
}

void registerCashierOfflineAppShell();
