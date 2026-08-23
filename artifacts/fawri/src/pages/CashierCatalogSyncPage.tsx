import { useState } from 'react';
import {
  CashierCloudCatalogSyncError,
  syncCashierCatalogFromCloud,
  type CashierCloudCatalogSyncResult,
} from '@/lib/cashierCloudCatalogSync';

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

export default function CashierCatalogSyncPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CashierCloudCatalogSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-xs font-bold text-orange-600">فوري</p>
              <h1 className="text-xl font-bold">تهيئة كتالوج الكاشير</h1>
              <p className="mt-1 text-sm text-slate-500">نسخة محلية للمنتجات والمخزون والعروض حتى يستمر البيع عند انقطاع الشبكة.</p>
            </div>
          </div>
          <a href="/cashier.html" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            العودة للكاشير
          </a>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-blue-900">
            <strong>كيف تعمل المزامنة؟</strong>
            <p className="mt-1">
              تحتاج الإنترنت وجلسة التاجر فقط أثناء التهيئة أو التحديث. بعد نجاحها، البيع وقراءة الكتالوج المحلي لا يعتمدان على الاشتراك أو الاتصال بالشبكة.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">حماية المتجر</p>
              <p className="mt-1 font-semibold">الجهاز لا يقبل مزامنة متجر ثانٍ فوق بيانات متجره الحالي.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">حماية مخزون Offline</p>
              <p className="mt-1 font-semibold">إذا توجد عمليات معلقة للرفع، يبقى المخزون المحلي محفوظًا أثناء التحديث.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <strong>تم تحديث الكتالوج المحلي بنجاح.</strong>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <span>منتجات السحابة: {result.product_count}</span>
                <span>عناصر البيع المحلية: {result.local_item_count}</span>
                <span>العروض: {result.promotion_count}</span>
                <span>العملة: {result.currency_code}</span>
              </div>
              {result.preserve_local_inventory ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  توجد عمليات Offline معلقة، لذلك تم الحفاظ على المخزون المحلي الحالي حتى لا تضيع حركات بيع لم تُرفع بعد.
                </p>
              ) : null}
              <a href="/cashier.html" className="mt-4 inline-flex rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700">
                فتح الكاشير
              </a>
            </div>
          ) : null}

          <button
            type="button"
            disabled={running}
            onClick={() => void runSync()}
            className="mt-5 h-12 w-full rounded-xl bg-orange-600 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? 'جارٍ التحقق وتحديث النسخة المحلية...' : 'تهيئة / تحديث الكتالوج من فوري'}
          </button>

          <p className="mt-3 text-center text-xs leading-6 text-slate-500">
            لا يتم حذف سجل المبيعات المحلي. المنتجات غير المتاحة في السحابة لا تبقى قابلة للبيع بعد مزامنة ناجحة.
          </p>
        </section>
      </div>
    </main>
  );
}
