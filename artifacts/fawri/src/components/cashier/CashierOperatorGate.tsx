import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import {
  cashierOperatorCan,
  getCashierOperatorSession,
  getCashierStationBinding,
  listCashierLoginStaff,
  loginCashierOperator,
  logoutCashierOperator,
  pairCashierStation,
  validateCashierOperatorSession,
  type CashierLoginStaff,
  type CashierOperatorSession,
  type CashierStationBinding,
} from '@/lib/cashierOperatorSessionRuntime';
import { syncCashierOperatorCatalogFromCloud } from '@/lib/cashierOperatorCloudSync';
import { publishCashierCatalogRefresh } from '@/lib/cashierCatalogRefresh';

const COPY: Record<Lang, {
  pairTitle: string;
  pairHint: string;
  pairCode: string;
  pair: string;
  pairing: string;
  loginTitle: string;
  loginHint: string;
  employee: string;
  pin: string;
  login: string;
  loggingIn: string;
  noStaff: string;
  retry: string;
  accessDenied: string;
  accessHint: string;
  back: string;
  shift: string;
  station: string;
  logout: string;
  loggingOut: string;
  syncPreparing: string;
  paired: string;
  roleCashier: string;
  roleManager: string;
}> = {
  ar: {
    pairTitle: 'ربط جهاز الكاشير',
    pairHint: 'أدخل رمز الربط الذي أنشأه صاحب المتجر لهذا الجهاز. الرمز يستخدم مرة واحدة فقط.',
    pairCode: 'رمز الربط',
    pair: 'ربط الجهاز',
    pairing: 'جارٍ الربط...',
    loginTitle: 'بدء وردية الكاشير',
    loginHint: 'اختر الموظف ثم أدخل رمز PIN الخاص به.',
    employee: 'الموظف',
    pin: 'PIN',
    login: 'بدء الوردية',
    loggingIn: 'جارٍ تسجيل الدخول...',
    noStaff: 'لا يوجد موظفون نشطون لهذا المتجر. أضف موظفًا من لوحة التاجر أولًا.',
    retry: 'إعادة المحاولة',
    accessDenied: 'لا توجد صلاحية لهذه الصفحة',
    accessHint: 'صلاحيات الموظف الحالية لا تسمح باستخدام هذه الوظيفة.',
    back: 'العودة للكاشير',
    shift: 'الوردية',
    station: 'المحطة',
    logout: 'إنهاء الوردية',
    loggingOut: 'جارٍ الإنهاء...',
    syncPreparing: 'جارٍ تجهيز كتالوج الكاشير...',
    paired: 'تم ربط الجهاز. اختر الموظف لبدء الوردية.',
    roleCashier: 'كاشير',
    roleManager: 'مدير',
  },
  ku: {
    pairTitle: 'بەستنی ئامێری کاشێر',
    pairHint: 'کۆدی بەستنەوەی خاوەن دوکان بۆ ئەم ئامێرە دروستی کردووە بنووسە. کۆدەکە تەنها جارێک بەکاردێت.',
    pairCode: 'کۆدی بەستنەوە',
    pair: 'بەستنی ئامێر',
    pairing: 'بەستنەوە...',
    loginTitle: 'دەستپێکردنی شیفت',
    loginHint: 'کارمەند هەڵبژێرە و PIN ـەکەی بنووسە.',
    employee: 'کارمەند',
    pin: 'PIN',
    login: 'دەستپێکردنی شیفت',
    loggingIn: 'چوونەژوورەوە...',
    noStaff: 'هیچ کارمەندێکی چالاک نییە. سەرەتا لە داشبۆردی بازرگان کارمەند زیاد بکە.',
    retry: 'هەوڵدانەوە',
    accessDenied: 'دەسەڵاتی ئەم پەڕەیەت نییە',
    accessHint: 'دەسەڵاتەکانی ئێستای کارمەند ڕێگە بەو کارە نادەن.',
    back: 'گەڕانەوە بۆ کاشێر',
    shift: 'شیفت',
    station: 'وێستگە',
    logout: 'کۆتایی شیفت',
    loggingOut: 'کۆتایی پێهێنان...',
    syncPreparing: 'کاتالۆگی کاشێر ئامادە دەکرێت...',
    paired: 'ئامێرەکە بەسترا. کارمەند هەڵبژێرە بۆ دەستپێکردنی شیفت.',
    roleCashier: 'کاشێر',
    roleManager: 'بەڕێوەبەر',
  },
  en: {
    pairTitle: 'Pair cashier station',
    pairHint: 'Enter the one-time pairing code created by the store owner for this device.',
    pairCode: 'Pairing code',
    pair: 'Pair device',
    pairing: 'Pairing...',
    loginTitle: 'Start cashier shift',
    loginHint: 'Choose the employee and enter their PIN.',
    employee: 'Employee',
    pin: 'PIN',
    login: 'Start shift',
    loggingIn: 'Signing in...',
    noStaff: 'There are no active staff members. Add staff from the merchant dashboard first.',
    retry: 'Retry',
    accessDenied: 'You do not have access to this page',
    accessHint: 'The current employee permissions do not allow this cashier function.',
    back: 'Back to cashier',
    shift: 'Shift',
    station: 'Station',
    logout: 'End shift',
    loggingOut: 'Ending shift...',
    syncPreparing: 'Preparing cashier catalog...',
    paired: 'Device paired. Choose an employee to start a shift.',
    roleCashier: 'Cashier',
    roleManager: 'Manager',
  },
};

type GateState =
  | { kind: 'loading' }
  | { kind: 'pair'; binding: null }
  | { kind: 'login'; binding: CashierStationBinding; staff: CashierLoginStaff[] }
  | { kind: 'ready'; binding: CashierStationBinding; session: CashierOperatorSession }
  | { kind: 'error'; binding: CashierStationBinding | null; message: string };

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Cashier operation failed');
}

function pageAllowed(session: CashierOperatorSession): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reports') === '1') {
    return cashierOperatorCan(session, 'reports.sales');
  }
  if (params.get('history') === '1') {
    return (
      cashierOperatorCan(session, 'sale.view_own') ||
      cashierOperatorCan(session, 'sale.view_all')
    );
  }
  if (params.get('sync') === '1') {
    return cashierOperatorCan(session, 'sale.create');
  }
  return cashierOperatorCan(session, 'sale.create');
}

export default function CashierOperatorGate({
  children,
  bypass = false,
}: {
  children: ReactNode;
  bypass?: boolean;
}) {
  const { lang, dir } = useI18n();
  const labels = COPY[lang] || COPY.en;
  const [state, setState] = useState<GateState>({ kind: 'loading' });
  const [pairingCode, setPairingCode] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (bypass) return;
    setState({ kind: 'loading' });
    try {
      const binding = await getCashierStationBinding();
      if (!binding) {
        setState({ kind: 'pair', binding: null });
        return;
      }
      const session = await validateCashierOperatorSession();
      if (session) {
        setState({ kind: 'ready', binding, session });
        return;
      }
      const staff = await listCashierLoginStaff();
      setSelectedStaffId(current => current || staff[0]?.id || '');
      setState({ kind: 'login', binding, staff });
    } catch (error) {
      const binding = await getCashierStationBinding().catch(() => null);
      setState({ kind: 'error', binding, message: errorText(error) });
    }
  };

  useEffect(() => {
    if (!bypass) void load();
  }, [bypass]);

  useEffect(() => {
    const session = state.kind === 'ready' ? state.session : null;
    document.documentElement.dataset.cashierOperatorReady = session ? '1' : '0';
    document.documentElement.dataset.cashierCanReports =
      session && cashierOperatorCan(session, 'reports.sales') ? '1' : '0';
    document.documentElement.dataset.cashierCanProfit =
      session && cashierOperatorCan(session, 'reports.profit') ? '1' : '0';
    document.documentElement.dataset.cashierCanReturn =
      session && cashierOperatorCan(session, 'sale.return') ? '1' : '0';
    document.documentElement.dataset.cashierCanVoid =
      session && cashierOperatorCan(session, 'sale.void') ? '1' : '0';
    return () => {
      delete document.documentElement.dataset.cashierOperatorReady;
      delete document.documentElement.dataset.cashierCanReports;
      delete document.documentElement.dataset.cashierCanProfit;
      delete document.documentElement.dataset.cashierCanReturn;
      delete document.documentElement.dataset.cashierCanVoid;
    };
  }, [state]);

  const roleLabel = useMemo(
    () => (staff: CashierLoginStaff) =>
      staff.role === 'manager' ? labels.roleManager : labels.roleCashier,
    [labels],
  );

  if (bypass) return <>{children}</>;

  const pair = async () => {
    if (!pairingCode.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      const binding = await pairCashierStation(pairingCode);
      const staff = await listCashierLoginStaff();
      setSelectedStaffId(staff[0]?.id || '');
      setPairingCode('');
      setNotice(labels.paired);
      setState({ kind: 'login', binding, staff });
    } catch (error) {
      setState({ kind: 'error', binding: null, message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    if (!selectedStaffId || !/^\d{4,8}$/.test(pin)) return;
    setBusy(true);
    setNotice(labels.syncPreparing);
    try {
      const session = await loginCashierOperator(selectedStaffId, pin);
      const binding = await getCashierStationBinding();
      if (!binding) throw new Error('Cashier station binding disappeared after login');
      await syncCashierOperatorCatalogFromCloud();
      publishCashierCatalogRefresh();
      setPin('');
      setNotice('');
      setState({ kind: 'ready', binding, session });
      window.dispatchEvent(new CustomEvent('fawri:cashier-operator-session-changed'));
    } catch (error) {
      setNotice('');
      setState(current => ({
        kind: 'error',
        binding: current.kind === 'login' ? current.binding : null,
        message: errorText(error),
      }));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await logoutCashierOperator();
      window.dispatchEvent(new CustomEvent('fawri:cashier-operator-session-changed'));
      setPin('');
      setNotice('');
      await load();
    } catch (error) {
      setState(current => ({
        kind: 'error',
        binding:
          current.kind === 'ready' || current.kind === 'login'
            ? current.binding
            : null,
        message: errorText(error),
      }));
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6" dir={dir}>
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 text-sm text-slate-600 shadow-sm">{labels.syncPreparing}</div>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir={dir}>
        <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <img src="/fawri-logo.svg" alt="Fawri" className="mb-4 h-11 w-11" />
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{state.message}</p>
          <button type="button" onClick={() => void load()} className="mt-4 h-11 w-full rounded-xl bg-slate-900 font-bold text-white">{labels.retry}</button>
        </section>
      </main>
    );
  }

  if (state.kind === 'pair') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir={dir}>
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <img src="/fawri-logo.svg" alt="Fawri" className="mb-4 h-12 w-12" />
          <h1 className="text-xl font-bold">{labels.pairTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{labels.pairHint}</p>
          <label className="mt-5 block text-sm font-semibold">
            {labels.pairCode}
            <input value={pairingCode} onChange={event => setPairingCode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void pair(); }} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-lg tracking-widest outline-none focus:border-orange-400" dir="ltr" />
          </label>
          <button type="button" disabled={busy || !pairingCode.trim()} onClick={() => void pair()} className="mt-4 h-12 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-50">{busy ? labels.pairing : labels.pair}</button>
        </section>
      </main>
    );
  }

  if (state.kind === 'login') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir={dir}>
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-12 w-12" />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{state.binding.station_name}</span>
          </div>
          <h1 className="mt-4 text-xl font-bold">{labels.loginTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{labels.loginHint}</p>
          {notice ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</p> : null}
          {state.staff.length === 0 ? (
            <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{labels.noStaff}</p>
          ) : (
            <>
              <label className="mt-5 block text-sm font-semibold">
                {labels.employee}
                <select value={selectedStaffId} onChange={event => setSelectedStaffId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-orange-400">
                  {state.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.display_name} — {roleLabel(staff)}</option>)}
                </select>
              </label>
              <label className="mt-4 block text-sm font-semibold">
                {labels.pin}
                <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={event => { if (event.key === 'Enter') void login(); }} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus:border-orange-400" dir="ltr" />
              </label>
              <button type="button" disabled={busy || !selectedStaffId || !/^\d{4,8}$/.test(pin)} onClick={() => void login()} className="mt-4 h-12 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-50">{busy ? labels.loggingIn : labels.login}</button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (!pageAllowed(state.session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir={dir}>
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold">{labels.accessDenied}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{labels.accessHint}</p>
          <a href="/cashier.html" className="mt-5 inline-flex h-11 items-center rounded-xl bg-slate-900 px-5 font-bold text-white">{labels.back}</a>
        </section>
      </main>
    );
  }

  return (
    <div className="relative">
      <div className="fixed bottom-3 end-3 z-[80] flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 text-xs shadow-lg backdrop-blur">
        <span className="max-w-40 truncate font-semibold text-slate-600">{state.binding.station_name} · {state.session.context.staff_id.slice(0, 8)}</span>
        <button type="button" disabled={busy} onClick={() => void logout()} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? labels.loggingOut : labels.logout}</button>
      </div>
      {children}
    </div>
  );
}
