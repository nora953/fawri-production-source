import { useEffect, useState } from 'react';
import {
  CashierOperatorCloudSyncError,
  syncCashierOperatorCatalogFromCloud,
  syncCashierOperatorOutboxToCloud,
  type CashierOperatorCatalogSyncResult,
  type CashierOperatorOutboxSyncResult,
} from '@/lib/cashierOperatorCloudSync';
import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';
import { CASHIER_UI_COPY, cashierLocale } from '@/lib/cashierUiCopy';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type MerchantSyncSummary = {
  syncedOperations: number;
  products: number;
  promotions: number;
  completedAt: Date;
};

type SyncLabels = (typeof CASHIER_UI_COPY)[Lang]['sync'];

function catalogErrorMessage(error: unknown, labels: SyncLabels): string {
  if (error instanceof CashierOperatorCloudSyncError) {
    switch (error.code) {
      case 'CASHIER_OPERATOR_LOGIN_REQUIRED':
      case 'CASHIER_OPERATOR_SESSION_INVALID':
        return labels.sessionRequired;
      case 'CASHIER_OPERATOR_CLOUD_OFFLINE':
        return labels.offlineCatalog;
      case 'CASHIER_OPERATOR_DEVICE_MISMATCH':
        return labels.merchantMismatch;
      case 'CASHIER_OPERATOR_SKU_AMBIGUOUS':
        return labels.skuAmbiguous;
      case 'CASHIER_OPERATOR_BARCODE_AMBIGUOUS':
        return labels.barcodeAmbiguous;
      case 'CASHIER_OPERATOR_CATALOG_TENANT_MISMATCH':
      case 'CASHIER_OPERATOR_CONTEXT_MISMATCH':
        return labels.tenantMismatch;
      default:
        return labels.catalogFailed;
    }
  }
  return labels.catalogFailed;
}

function outboxErrorMessage(error: unknown, labels: SyncLabels): string {
  if (error instanceof CashierOperatorCloudSyncError) {
    switch (error.code) {
      case 'CASHIER_OPERATOR_LOGIN_REQUIRED':
      case 'CASHIER_OPERATOR_SESSION_INVALID':
        return labels.sessionRequired;
      case 'CASHIER_OPERATOR_OUTBOX_OFFLINE':
        return labels.offlineOutbox;
      case 'CASHIER_OPERATOR_DEVICE_MISMATCH':
        return labels.deviceBindingRequired;
      case 'CASHIER_OPERATOR_ACK_INVALID':
        return labels.ackInvalid;
      default:
        return labels.outboxFailed;
    }
  }
  return labels.outboxFailed;
}

function formatLastSync(date: Date, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(cashierLocale(lang), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString(cashierLocale(lang));
  }
}

export default function CashierCatalogSyncPage() {
  const { lang, dir } = useI18n();
  const labels = CASHIER_UI_COPY[lang].sync;
  const [running, setRunning] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [summary, setSummary] = useState<MerchantSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  const runMerchantSync = async () => {
    setRunning(true);
    setError(null);
    setSummary(null);

    let outboxResult: CashierOperatorOutboxSyncResult;
    let catalogResult: CashierOperatorCatalogSyncResult;

    try {
      try {
        outboxResult = await syncCashierOperatorOutboxToCloud();
      } catch (cause) {
        setError(outboxErrorMessage(cause, labels));
        return;
      }

      if (outboxResult.pending_after > 0) {
        setError(labels.pendingOperations);
        return;
      }

      try {
        catalogResult = await syncCashierOperatorCatalogFromCloud();
      } catch (catalogCause) {
        setError(catalogErrorMessage(catalogCause, labels));
        return;
      }

      const completedAt = new Date();
      publishCashierDashboardRefresh();
      setSummary({
        syncedOperations:
          outboxResult.uploaded_operations + outboxResult.replayed_operations,
        products: catalogResult.product_count,
        promotions: catalogResult.promotion_count,
        completedAt,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:h-screen sm:overflow-hidden" dir={dir}>
      <div className="mx-auto max-w-2xl sm:flex sm:h-full sm:flex-col sm:justify-center">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold sm:text-xl">{labels.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{labels.subtitle}</p>
            </div>
          </div>
          <a href="/cashier.html" className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{labels.back}</a>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className={`rounded-xl border px-4 py-3 ${online ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">{running ? labels.syncing : online ? summary ? labels.syncSuccess : labels.ready : labels.offline}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{online ? running ? labels.wait : summary ? labels.updated : labels.readyHint : labels.offlineHint}</p>
              </div>
              <span className={`rounded-full bg-white px-3 py-1 text-xs font-bold ${online ? 'text-emerald-700' : 'text-amber-800'}`}>{online ? labels.onlineBadge : labels.offlineBadge}</span>
            </div>
          </div>

          {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{error}</div> : null}

          {summary ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-slate-500">{labels.syncedOperations}</p><p className="mt-0.5 font-bold">{summary.syncedOperations}</p></div>
                <div><p className="text-xs text-slate-500">{labels.products}</p><p className="mt-0.5 font-bold">{summary.products}</p></div>
                <div><p className="text-xs text-slate-500">{labels.promotions}</p><p className="mt-0.5 font-bold">{summary.promotions}</p></div>
              </div>
              <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">{labels.lastSync} {formatLastSync(summary.completedAt, lang)}</p>
            </div>
          ) : null}

          <button type="button" disabled={running || !online} onClick={() => void runMerchantSync()} className="mt-4 h-12 w-full rounded-xl bg-orange-600 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">{running ? labels.syncing : labels.syncNow}</button>
        </section>
      </div>
    </main>
  );
}
