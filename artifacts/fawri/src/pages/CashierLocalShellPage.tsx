import { useEffect, useState } from 'react';
import { probeIndexedDbCashierDurability } from '@/lib/cashierIndexedDbAuthority';
import {
  getCashierOfflineShellDiagnostics,
  type CashierOfflineShellDiagnostics,
} from '@/lib/cashierOfflineAppShell';
import { CASHIER_LOCAL_SHELL_COPY as copy } from '@/lib/translations/features/pages/CashierLocalShellPage';

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
    <main className="bg-slate-50 px-4 py-4 text-slate-900 sm:min-h-screen sm:overflow-visible lg:h-[100dvh] lg:overflow-hidden lg:py-3" dir="rtl">
      <section className="mx-auto max-w-3xl space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:max-h-[calc(100dvh-1.5rem)] lg:p-6">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-sm font-semibold text-orange-600">{copy.brand}</p>
            <h1 className="mt-1 text-2xl font-bold">{copy.title}</h1>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {copy.description}
            </p>
          </div>
          <img src="/fawri-logo.svg" alt="Fawri" className="h-11 w-11 object-contain" />
        </header>

        <div className={`rounded-2xl border p-4 ${coldReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="font-bold">
            {coldReady ? copy.ready : copy.preparing}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {copy.readinessNote}
          </p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <StatusCard label={copy.internetLabel} value={online ? copy.online : copy.offline} ok={online} neutral={!online} />
          <StatusCard label={copy.indexedDbLabel} value={storage?.available ? copy.available : copy.unavailable} ok={Boolean(storage?.available)} />
          <StatusCard label={copy.persistentStorageLabel} value={storage?.persisted ? copy.granted : copy.notConfirmed} ok={Boolean(storage?.persisted)} />
          <StatusCard label={copy.serviceWorkerLabel} value={shell?.registration_active ? copy.active : copy.activating} ok={Boolean(shell?.registration_active)} />
          <StatusCard label={copy.cachedPageLabel} value={shell?.cashier_shell_cached ? copy.yes : copy.notYet} ok={Boolean(shell?.cashier_shell_cached)} />
          <StatusCard label={copy.cachedAssetsLabel} value={String(shell?.loaded_assets_cached ?? 0)} ok={Boolean(shell && shell.loaded_assets_cached > 0)} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-5 text-slate-600">
          <strong className="text-slate-800">{copy.limitsTitle}</strong> {copy.limitsBody}
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
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
  );
}
