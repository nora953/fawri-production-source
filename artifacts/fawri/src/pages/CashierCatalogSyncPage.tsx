import { useEffect, useState } from 'react';
import {
  CashierCloudCatalogSyncError,
  syncCashierCatalogFromCloud,
  type CashierCloudCatalogSyncResult,
} from '@/lib/cashierCloudCatalogSync';
import {
  CashierCloudOutboxSyncError,
  syncCashierOutboxToCloud,
  type CashierCloudOutboxSyncResult,
} from '@/lib/cashierCloudOutboxSync';
import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';

type MerchantSyncSummary = {
  syncedOperations: number;
  products: number;
  promotions: number;
  completedAt: Date;
};

function catalogErrorMessage(error: unknown): string {
  if (error instanceof CashierCloudCatalogSyncError) {
    switch (error.code) {
      case 'CASHIER_CLOUD_SESSION_REQUIRED':
        return 'يجب تسجيل الدخول إلى حساب التاجر لإكمال المزامنة.';
      case 'CASHIER_CLOUD_OFFLINE':
      case 'CASHIER_CLOUD_NETWORK_FAILED':
        return 'لا يوجد اتصال بالإنترنت. يمكنك متابعة البيع ثم المحاولة بعد عودة الاتصال.';
      case 'CASHIER_DEVICE_MERCHANT_MISMATCH':
        return 'هذا الكاشير مرتبط بمتجر آخر. تواصل مع الدعم إذا كنت تحتاج إلى تغيير المتجر.';
      case 'CASHIER_CLOUD_CURRENCY_NOT_CUT_OVER':
        return 'عملة هذا المتجر غير مدعومة في الكاشير حاليًا.';
      case 'CASHIER_CLOUD_SKU_AMBIGUOUS':
        return 'يوجد SKU مكرر في المنتجات. صححه من صفحة المنتجات ثم أعد المزامنة.';
      case 'CASHIER_CLOUD_BARCODE_AMBIGUOUS':
        return 'يوجد باركود مكرر في المنتجات. صححه من صفحة المنتجات ثم أعد المزامنة.';
      case 'CASHIER_CLOUD_TENANT_MISMATCH':
        return 'تعذر التحقق من المتجر المرتبط بهذا الكاشير. أعد تسجيل الدخول ثم حاول مرة أخرى.';
      default:
        return 'تعذر تحديث بيانات الكاشير. حاول المزامنة مرة أخرى.';
    }
  }
  return 'تعذر تحديث بيانات الكاشير. حاول المزامنة مرة أخرى.';
}

function outboxErrorMessage(error: unknown): string {
  if (error instanceof CashierCloudOutboxSyncError) {
    switch (error.code) {
      case 'CASHIER_OUTBOX_SESSION_REQUIRED':
        return 'يجب تسجيل الدخول إلى حساب التاجر لإكمال المزامنة.';
      case 'CASHIER_OUTBOX_OFFLINE':
      case 'CASHIER_OUTBOX_NETWORK_FAILED':
        return 'لا يوجد اتصال بالإنترنت. عمليات الكاشير محفوظة ويمكنك المحاولة بعد عودة الاتصال.';
      case 'CASHIER_OUTBOX_DEVICE_NOT_BOUND':
      case 'CASHIER_OUTBOX_IDENTITY_MISSING':
        return 'يجب ربط هذا الكاشير بحساب التاجر قبل المزامنة.';
      case 'CASHIER_OUTBOX_ACK_INVALID':
        return 'تعذر تأكيد مزامنة بعض عمليات الكاشير. بقيت محفوظة ولم يتم حذفها.';
      default:
        return 'تعذر مزامنة بعض عمليات الكاشير. بقيت محفوظة ويمكنك إعادة المحاولة.';
    }
  }
  return 'تعذر مزامنة بعض عمليات الكاشير. بقيت محفوظة ويمكنك إعادة المحاولة.';
}

function needsInitialBinding(error: unknown): boolean {
  return (
    error instanceof CashierCloudOutboxSyncError &&
    (error.code === 'CASHIER_OUTBOX_DEVICE_NOT_BOUND' ||
      error.code === 'CASHIER_OUTBOX_IDENTITY_MISSING')
  );
}

function formatLastSync(date: Date): string {
  try {
    return new Intl.DateTimeFormat('ar-IQ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString('ar-IQ');
  }
}

export default function CashierCatalogSyncPage() {
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

    let outboxResult: CashierCloudOutboxSyncResult;
    let catalogResult: CashierCloudCatalogSyncResult;

    try {
      try {
        outboxResult = await syncCashierOutboxToCloud();
      } catch (cause) {
        if (!needsInitialBinding(cause)) throw cause;

        // A new cashier has no cloud binding yet. Provision it once, then run the
        // same safe operations-first reconciliation and refresh the catalog again
        // so the merchant ends on the authoritative post-operation inventory state.
        try {
          await syncCashierCatalogFromCloud();
        } catch (catalogCause) {
          setError(catalogErrorMessage(catalogCause));
          return;
        }
        outboxResult = await syncCashierOutboxToCloud();
      }

      if (outboxResult.pending_after > 0) {
        setError(
          'ما زالت بعض عمليات الكاشير بانتظار المزامنة. بقيت محفوظة، ولم يتم تحديث المخزون بعد. حاول مرة أخرى.',
        );
        return;
      }

      try {
        catalogResult = await syncCashierCatalogFromCloud();
      } catch (catalogCause) {
        setError(catalogErrorMessage(catalogCause));
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
    } catch (cause) {
      setError(outboxErrorMessage(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:h-screen sm:overflow-hidden" dir="rtl">
      <div className="mx-auto max-w-2xl sm:flex sm:h-full sm:flex-col sm:justify-center">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold sm:text-xl">مزامنة الكاشير</h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                حدّث عمليات الكاشير والمنتجات والمخزون بين الكاشير وحسابك في فوري.
              </p>
            </div>
          </div>
          <a
            href="/cashier.html"
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            العودة للكاشير
          </a>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div
            className={`rounded-xl border px-4 py-3 ${
              online
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {running
                    ? 'جارٍ المزامنة...'
                    : online
                      ? summary
                        ? 'تمت المزامنة بنجاح'
                        : 'جاهز للمزامنة'
                      : 'لا يوجد اتصال بالإنترنت'}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {online
                    ? running
                      ? 'يرجى الانتظار حتى تكتمل العملية.'
                      : summary
                        ? 'الكاشير محدث ويمكنك العودة للبيع.'
                        : 'اضغط مزامنة الآن للحصول على أحدث البيانات.'
                    : 'يمكنك متابعة البيع، ثم المزامنة عند عودة الاتصال.'}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  online
                    ? 'bg-white text-emerald-700'
                    : 'bg-white text-amber-800'
                }`}
              >
                {online ? 'متصل' : 'غير متصل'}
              </span>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
              {error}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">عمليات الكاشير التي تمت مزامنتها</p>
                  <p className="mt-0.5 font-bold">{summary.syncedOperations}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">المنتجات</p>
                  <p className="mt-0.5 font-bold">{summary.products}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">العروض</p>
                  <p className="mt-0.5 font-bold">{summary.promotions}</p>
                </div>
              </div>
              <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                آخر مزامنة: {formatLastSync(summary.completedAt)}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={running || !online}
            onClick={() => void runMerchantSync()}
            className="mt-4 h-12 w-full rounded-xl bg-orange-600 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? 'جارٍ المزامنة...' : 'مزامنة الآن'}
          </button>
        </section>
      </div>
    </main>
  );
}
