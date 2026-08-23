import { useState } from 'react';
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

function syncErrorMessage(error: unknown): string {
  if (error instanceof CashierCloudCatalogSyncError) {
    switch (error.code) {
      case 'CASHIER_CLOUD_SESSION_REQUIRED':
        return 'يجب تسجيل الدخول بحساب التاجر قبل مزامنة الكتالوج.';
      case 'CASHIER_CLOUD_OFFLINE':
      case 'CASHIER_CLOUD_NETWORK_FAILED':
        return 'الاتصال بالإنترنت مطلوب فقط أثناء التهيئة أو تحديث الكتالوج.';
      case 'CASHIER_DEVICE_MERCHANT_MISMATCH':
        return 'هذا الجهاز مرتبط مسبقًا بمتجر آخر. تم إيقاف المزامنة لمنع خلط بيانات متجرين.';
      case 'CASHIER_CLOUD_CURRENCY_NOT_CUT_OVER':
        return 'عملة هذا المتجر غير مدعومة بعد في مزامنة الكاشير. لم يتم تغيير البيانات المحلية.';
      case 'CASHIER_CLOUD_SKU_AMBIGUOUS':
        return 'يوجد SKU مكرر في الكتالوج. صححه أولًا حتى لا يختار الكاشير منتجًا خاطئًا.';
      case 'CASHIER_CLOUD_BARCODE_AMBIGUOUS':
        return 'يوجد باركود مكرر في الكتالوج. صححه أولًا حتى لا يختار الكاشير منتجًا خاطئًا.';
      case 'CASHIER_CLOUD_TENANT_MISMATCH':
        return 'تم رفض المزامنة بسبب عدم تطابق هوية التاجر.';
      default:
        return 'تعذر مزامنة الكتالوج بأمان. لم يتم اعتماد مزامنة جزئية.';
    }
  }
  return 'تعذر مزامنة الكتالوج بأمان.';
}

function outboxErrorMessage(error: unknown): string {
  if (error instanceof CashierCloudOutboxSyncError) {
    switch (error.code) {
      case 'CASHIER_OUTBOX_SESSION_REQUIRED':
        return 'يجب تسجيل الدخول بحساب التاجر قبل رفع المبيعات المعلقة.';
      case 'CASHIER_OUTBOX_OFFLINE':
      case 'CASHIER_OUTBOX_NETWORK_FAILED':
        return 'تعذر الوصول إلى فوري. بقيت العمليات المعلقة محفوظة محليًا لإعادة المحاولة.';
      case 'CASHIER_OUTBOX_DEVICE_NOT_BOUND':
      case 'CASHIER_OUTBOX_IDENTITY_MISSING':
        return 'يجب تهيئة هذا الكاشير من حساب التاجر قبل رفع المبيعات.';
      case 'CASHIER_OUTBOX_ACK_INVALID':
        return 'لم يصل تأكيد كامل وآمن من فوري. لم يتم حذف العملية المحلية.';
      default:
        return 'تعذر رفع المبيعات المعلقة بأمان. بقيت العمليات المحلية محفوظة لإعادة المحاولة.';
    }
  }
  return 'تعذر رفع المبيعات المعلقة بأمان.';
}

export default function CashierCatalogSyncPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CashierCloudCatalogSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outboxRunning, setOutboxRunning] = useState(false);
  const [outboxResult, setOutboxResult] = useState<CashierCloudOutboxSyncResult | null>(null);
  const [outboxError, setOutboxError] = useState<string | null>(null);

  const runSync = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const synced = await syncCashierCatalogFromCloud();
      setResult(synced);
    } catch (cause) {
      setError(syncErrorMessage(cause));
    } finally {
      setRunning(false);
    }
  };

  const runOutboxSync = async () => {
    setOutboxRunning(true);
    setOutboxError(null);
    setOutboxResult(null);
    try {
      const synced = await syncCashierOutboxToCloud();
      setOutboxResult(synced);
    } catch (cause) {
      setOutboxError(outboxErrorMessage(cause));
    } finally {
      setOutboxRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:h-screen sm:overflow-hidden" dir="rtl">
      <div className="mx-auto max-w-3xl sm:flex sm:h-full sm:flex-col sm:justify-center">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-orange-600">فوري</p>
              <h1 className="text-lg font-bold sm:text-xl">مزامنة الكاشير</h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">رفع المبيعات المعلقة وتحديث نسخة المنتجات والمخزون والعروض.</p>
            </div>
          </div>
          <a href="/cashier.html" className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            العودة للكاشير
          </a>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
            <strong>كيف تعمل المزامنة؟</strong>
            <p className="mt-0.5">
              البيع يبقى محليًا عند انقطاع الشبكة. عند رجوع الاتصال، ارفع المبيعات المعلقة أولًا ثم حدّث الكتالوج للحصول على الحالة السحابية الأحدث.
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">حماية المتجر</p>
              <p className="mt-0.5 text-sm font-semibold leading-6">الجهاز لا يقبل مزامنة متجر ثانٍ فوق بيانات متجره الحالي.</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">حماية عمليات Offline</p>
              <p className="mt-0.5 text-sm font-semibold leading-6">لا تُحذف عملية محلية إلا بعد قبول فوري للعملية كاملة أو تأكيد أنها قُبلت سابقًا.</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">المبيعات المعلقة</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">ارفع عمليات البيع المحفوظة محليًا قبل تحديث المخزون من السحابة.</p>
              </div>
              <button
                type="button"
                disabled={outboxRunning || running}
                onClick={() => void runOutboxSync()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {outboxRunning ? 'جارٍ رفع المبيعات...' : 'مزامنة المبيعات المعلقة'}
              </button>
            </div>

            {outboxError ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                {outboxError}
              </div>
            ) : null}

            {outboxResult ? (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
                <strong>تمت معالجة المزامنة بأمان.</strong>
                <div className="mt-1 grid gap-x-3 sm:grid-cols-4">
                  <span>معلقات قبل الرفع: {outboxResult.pending_before}</span>
                  <span>عمليات جديدة: {outboxResult.uploaded_operations}</span>
                  <span>إعادات آمنة: {outboxResult.replayed_operations}</span>
                  <span>معلقات بعد الرفع: {outboxResult.pending_after}</span>
                </div>
                {outboxResult.skipped_operations > 0 ? (
                  <p className="mt-1 text-amber-900">بقيت {outboxResult.skipped_operations} عملية غير مدعومة محفوظة محليًا ولم تُحذف.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>تم تحديث الكتالوج المحلي بنجاح.</strong>
                <a href="/cashier.html" className="inline-flex rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700">
                  فتح الكاشير
                </a>
              </div>
              <div className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-4 sm:text-sm">
                <span>منتجات السحابة: {result.product_count}</span>
                <span>عناصر البيع المحلية: {result.local_item_count}</span>
                <span>العروض: {result.promotion_count}</span>
                <span>العملة: {result.currency_code}</span>
              </div>
              {result.preserve_local_inventory ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs leading-5 text-amber-900">
                  توجد عمليات Offline معلقة، لذلك تم الحفاظ على المخزون المحلي الحالي حتى لا تضيع حركات بيع لم تُرفع بعد.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            disabled={running || outboxRunning}
            onClick={() => void runSync()}
            className="mt-3 h-11 w-full rounded-xl bg-orange-600 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? 'جارٍ التحقق وتحديث النسخة المحلية...' : 'تهيئة / تحديث الكتالوج من فوري'}
          </button>

          <p className="mt-2 text-center text-xs leading-5 text-slate-500">
            لا يتم حذف سجل المبيعات المحلي. المنتجات غير المتاحة في السحابة لا تبقى قابلة للبيع بعد مزامنة ناجحة.
          </p>
        </section>
      </div>
    </main>
  );
}
