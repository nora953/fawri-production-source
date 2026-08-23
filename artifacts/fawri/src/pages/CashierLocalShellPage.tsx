import { useEffect, useState } from 'react';
import { probeIndexedDbCashierDurability } from '@/lib/cashierIndexedDbAuthority';
import {
  getCashierOfflineShellDiagnostics,
  type CashierOfflineShellDiagnostics,
} from '@/lib/cashierOfflineAppShell';

type LocalStorageState = Awaited<ReturnType<typeof probeIndexedDbCashierDurability>>;

export default function CashierLocalShellPage() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [storage, setStorage] = useState<LocalStorageState | null>(null);
  const [shell, setShell] = useState<CashierOfflineShellDiagnostics | null>(null);

  useEffect(() => {
    const refreshConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', refreshConnectivity);
    window.addEventListener('offline', refreshConnectivity);
    return () => {
      window.removeEventListener('online', refreshConnectivity);
      window.removeEventListener('offline', refreshConnectivity);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    void probeIndexedDbCashierDurability({ requestPersistence: true }).then(result => {
      if (!stopped) setStorage(result);
    });
    const refresh = async () => {
      const result = await getCashierOfflineShellDiagnostics();
      if (!stopped) setShell(result);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const coldReady = Boolean(shell?.ready_for_cold_start && storage?.persisted);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900" dir="rtl">
      <section className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-sm font-semibold text-orange-600">فوري</p>
            <h1 className="mt-1 text-2xl font-bold">الكاشير المحلي</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              هذه الواجهة مستقلة عن خدمات السحابة، ومصممة لتبقى قابلة للفتح والعمل محليًا عند انقطاع الشبكة.
            </p>
          </div>
          <img src="/fawri-logo.svg" alt="Fawri" className="h-12 w-12 object-contain" />
        </header>

        <div className={`rounded-2xl border p-4 ${coldReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="font-bold">
            {coldReady ? 'جاهز للإقلاع المحلي بعد انقطاع الشبكة' : 'جارٍ تجهيز التخزين المحلي ونسخة التطبيق'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            لا تعتبر هذه الشاشة اعتمادًا إنتاجيًا نهائيًا قبل اجتياز اختبار الإقلاع البارد والمتصفحات المدعومة.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard label="اتصال الجهاز بالإنترنت" value={online ? 'متصل' : 'غير متصل'} ok={online} neutral={!online} />
          <StatusCard label="IndexedDB" value={storage?.available ? 'متاح' : 'غير متاح'} ok={Boolean(storage?.available)} />
          <StatusCard label="التخزين الدائم" value={storage?.persisted ? 'ممنوح' : 'غير مؤكد'} ok={Boolean(storage?.persisted)} />
          <StatusCard label="Service Worker" value={shell?.registration_active ? 'نشط' : 'جارٍ التفعيل'} ok={Boolean(shell?.registration_active)} />
          <StatusCard label="الصفحة مخزنة محليًا" value={shell?.cashier_shell_cached ? 'نعم' : 'ليس بعد'} ok={Boolean(shell?.cashier_shell_cached)} />
          <StatusCard label="ملفات التطبيق المخزنة" value={String(shell?.loaded_assets_cached ?? 0)} ok={Boolean(shell && shell.loaded_assets_cached > 0)} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <strong className="text-slate-800">حدود هذه المرحلة:</strong> لا توجد هنا بعد واجهة بيع نهائية أو ربط طابعة أو مزامنة سحابية. هذه صفحة اعتماد للبنية المحلية فقط، وتتعمد عدم استدعاء API أو التحقق من الاشتراك حتى لا يصبح تشغيل الكاشير رهين السيرفر.
        </div>
      </section>
    </main>
  );
}

function StatusCard({
  label,
  value,
  ok,
  neutral = false,
}: {
  label: string;
  value: string;
  ok: boolean;
  neutral?: boolean;
}) {
  const tone = neutral
    ? 'border-slate-200 bg-slate-50'
    : ok
      ? 'border-emerald-200 bg-emerald-50'
      : 'border-amber-200 bg-amber-50';
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
  );
}
