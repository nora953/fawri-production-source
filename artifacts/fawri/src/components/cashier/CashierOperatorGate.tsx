import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { normalizeCashierPairingCode } from '@/lib/cashierPairingCode';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import CashierEndShiftButton from '@/components/cashier/CashierEndShiftButton';
import {
  cashierOperatorCan,
  getCashierOperatorSession,
  getCashierStationBinding,
  listCashierLoginStaff,
  loginCashierOperator,
  pairCashierStation,
  validateCashierOperatorSession,
  type CashierLoginStaff,
  type CashierOperatorSession,
  type CashierStationBinding,
} from '@/lib/cashierOperatorSessionRuntime';
import {
  clearInvalidCashierStationBinding,
  isCashierStationBindingInvalidError,
} from '@/lib/cashierStationBindingRecovery';
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
  historyPreparing: string;
  reportsPreparing: string;
  paired: string;
  roleCashier: string;
  roleManager: string;
  invalidPin: string;
  pinLocked: string;
  stationBusy: string;
  sessionEnded: string;
  pairingInvalid: string;
  pairingExpired: string;
  pendingSync: string;
  logoutOffline: string;
  failed: string;
}> = {
  ar: {
    pairTitle: 'ربط جهاز الكاشير',
    pairHint: 'أدخل رمز الربط الذي أنشأه صاحب المتجر لهذا الجهاز. الرمز يستخدم مرة واحدة فقط.',
    pairCode: 'رمز الربط',
    pair: 'ربط الجهاز',
    pairing: 'جارٍ الربط...',
    loginTitle: 'بدء مناوبة الكاشير',
    loginHint: 'اختر الموظف ثم أدخل رمز PIN الخاص به.',
    employee: 'الموظف',
    pin: 'PIN',
    login: 'بدء المناوبة',
    loggingIn: 'جارٍ تسجيل الدخول...',
    noStaff: 'لا يوجد موظفون نشطون لهذا المتجر. أضف موظفًا من لوحة التاجر أولًا.',
    retry: 'إعادة المحاولة',
    accessDenied: 'لا توجد صلاحية لهذه الصفحة',
    accessHint: 'صلاحيات الموظف الحالية لا تسمح باستخدام هذه الوظيفة.',
    back: 'العودة للكاشير',
    shift: 'المناوبة',
    station: 'المحطة',
    logout: 'إنهاء المناوبة',
    loggingOut: 'جارٍ إنهاء المناوبة...',
    syncPreparing: 'جارٍ تجهيز كتالوج الكاشير...',
    historyPreparing: 'جارٍ فتح سجل المبيعات...',
    reportsPreparing: 'جارٍ فتح تقارير المبيعات...',
    paired: 'تم ربط الجهاز. اختر الموظف لبدء المناوبة.',
    roleCashier: 'كاشير',
    roleManager: 'مدير',
    invalidPin: 'اسم الموظف أو رمز PIN غير صحيح.',
    pinLocked: 'تم إيقاف محاولات PIN مؤقتًا بسبب تكرار الإدخال الخاطئ.',
    stationBusy: 'هذه المحطة لديها مناوبة نشطة لموظف آخر.',
    sessionEnded: 'انتهت مناوبة الموظف أو لم تعد صالحة. اختر موظفًا لبدء مناوبة جديدة.',
    pairingInvalid: 'رمز الربط غير صحيح أو تم استخدامه سابقًا.',
    pairingExpired: 'انتهت صلاحية رمز الربط. أنشئ رمزًا جديدًا من لوحة التاجر.',
    pendingSync: 'يجب مزامنة العمليات المعلقة قبل إنهاء المناوبة.',
    logoutOffline: 'يجب الاتصال بالإنترنت لإنهاء المناوبة بأمان.',
    failed: 'تعذر تنفيذ العملية. حاول مرة أخرى.',
  },
  ku: {
    pairTitle: 'بەستنی ئامێری کاشێر',
    pairHint: 'کۆدی بەستنەوەی خاوەن دوکان بۆ ئەم ئامێرە دروستی کردووە بنووسە. کۆدەکە تەنها جارێک بەکاردێت.',
    pairCode: 'کۆدی بەستنەوە',
    pair: 'بەستنی ئامێر',
    pairing: 'بەستنەوە...',
    loginTitle: 'دەستپێکردنی شەفتی کاشێر',
    loginHint: 'کارمەندێک هەڵبژێرە و کۆدی PINەکەی بنووسە.',
    employee: 'کارمەند',
    pin: 'کۆدی PIN',
    login: 'دەستپێکردنی شەفت',
    loggingIn: 'چوونەژوورەوە...',
    noStaff: 'هیچ کارمەندێکی چالاک نییە. سەرەتا لە داشبۆردی بازرگان کارمەند زیاد بکە.',
    retry: 'هەوڵدانەوە',
    accessDenied: 'دەسەڵاتی ئەم پەڕەیەت نییە',
    accessHint: 'دەسەڵاتەکانی ئێستای کارمەند ڕێگە بەو کارە نادەن.',
    back: 'گەڕانەوە بۆ کاشێر',
    shift: 'شەفت',
    station: 'وێستگە',
    logout: 'کۆتایی شەفت',
    loggingOut: 'شەفت کۆتایی پێدێت...',
    syncPreparing: 'کاتالۆگی کاشێر ئامادە دەکرێت...',
    historyPreparing: 'تۆماری فرۆشتن دەکرێتەوە...',
    reportsPreparing: 'ڕاپۆرتەکانی فرۆشتن دەکرێنەوە...',
    paired: 'ئامێرەکە بەسترا. کارمەند هەڵبژێرە بۆ دەستپێکردنی شەفت.',
    roleCashier: 'کاشێر',
    roleManager: 'بەڕێوەبەر',
    invalidPin: 'کارمەند یان PIN دروست نییە.',
    pinLocked: 'هەوڵدانی PIN بۆ ماوەیەک ڕاگیرا.',
    stationBusy: 'ئەم وێستگەیە شەفتێکی چالاکی کارمەندێکی تری هەیە.',
    sessionEnded: 'شەفتی کارمەند کۆتایی هاتووە یان چیتر دروست نییە. شەفتێکی نوێ دەست پێ بکە.',
    pairingInvalid: 'کۆدی بەستنەوە دروست نییە یان پێشتر بەکارهاتووە.',
    pairingExpired: 'کاتی کۆدی بەستنەوە بەسەرچووە.',
    pendingSync: 'پێش کۆتایی شەفت پێویستە کردارە چاوەڕوانەکان هاوکات بکرێن.',
    logoutOffline: 'بۆ کۆتایی شەفت پێویستە ئینتەرنێت هەبێت.',
    failed: 'کردارەکە سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.',
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
    historyPreparing: 'Opening sales history...',
    reportsPreparing: 'Opening sales reports...',
    paired: 'Device paired. Choose an employee to start a shift.',
    roleCashier: 'Cashier',
    roleManager: 'Manager',
    invalidPin: 'The employee or PIN is incorrect.',
    pinLocked: 'PIN attempts are temporarily locked after repeated failures.',
    stationBusy: 'This station already has an active shift for another employee.',
    sessionEnded: 'The employee shift has ended or is no longer valid. Start a new shift.',
    pairingInvalid: 'The pairing code is invalid or has already been used.',
    pairingExpired: 'The pairing code has expired. Create a new one from the merchant dashboard.',
    pendingSync: 'Pending operations must synchronize before ending the shift.',
    logoutOffline: 'Internet access is required to end the shift safely.',
    failed: 'The operation could not be completed. Please try again.',
  },
};

type Labels = (typeof COPY)[Lang];

type GateState =
  | { kind: 'loading' }
  | { kind: 'pair'; binding: null }
  | { kind: 'login'; binding: CashierStationBinding; staff: CashierLoginStaff[] }
  | { kind: 'ready'; binding: CashierStationBinding; session: CashierOperatorSession }
  | { kind: 'error'; binding: CashierStationBinding | null; message: string };

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
}

function errorText(error: unknown, labels: Labels): string {
  const code = errorCode(error);
  if (code === 'CASHIER_OPERATOR_INVALID') return labels.invalidPin;
  if (code === 'CASHIER_PIN_LOCKED') return labels.pinLocked;
  if (code === 'CASHIER_STATION_IN_USE' || code === 'CASHIER_STATION_SHIFT_OCCUPIED' || code === 'CASHIER_OPERATOR_SHIFT_OCCUPIED') return labels.stationBusy;
  if (code === 'CASHIER_OPERATOR_SESSION_INVALID' || code === 'CASHIER_OPERATOR_LOGIN_REQUIRED') return labels.sessionEnded;
  if (code === 'CASHIER_PAIRING_INVALID') return labels.pairingInvalid;
  if (code === 'CASHIER_PAIRING_EXPIRED') return labels.pairingExpired;
  if (code === 'CASHIER_OPERATOR_PENDING_SYNC') return labels.pendingSync;
  if (code === 'CASHIER_OPERATOR_LOGOUT_OFFLINE') return labels.logoutOffline;
  return labels.failed;
}

function pageAllowed(session: CashierOperatorSession): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reports') === '1') return cashierOperatorCan(session, 'reports.sales');
  if (params.get('history') === '1') {
    return cashierOperatorCan(session, 'sale.view_own') || cashierOperatorCan(session, 'sale.view_all');
  }
  if (params.get('sync') === '1') return cashierOperatorCan(session, 'sale.create');
  return cashierOperatorCan(session, 'sale.create');
}

function pageLoadingLabel(labels: Labels): string {
  const params = new URLSearchParams(window.location.search);
  if (params.get('history') === '1') return labels.historyPreparing;
  if (params.get('reports') === '1') return labels.reportsPreparing;
  return labels.syncPreparing;
}

export default function CashierOperatorGate({ children, bypass = false }: { children: ReactNode; bypass?: boolean }) {
  const { lang, dir } = useI18n();
  const labels = COPY[lang] || COPY.en;
  const [state, setState] = useState<GateState>({ kind: 'loading' });
  const [pairingCode, setPairingCode] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [operatorName, setOperatorName] = useState('');

  const roleLabel = useMemo(() => (role: 'cashier' | 'manager') => role === 'manager' ? labels.roleManager : labels.roleCashier, [labels]);

  const recoverStationBinding = async (error: unknown): Promise<boolean> => {
    if (!isCashierStationBindingInvalidError(error)) return false;
    await clearInvalidCashierStationBinding();
    await getCashierOperatorSession().catch(() => null);
    setOperatorName('');
    setSelectedStaffId('');
    setPin('');
    setNotice('');
    setState({ kind: 'pair', binding: null });
    return true;
  };

  const load = async () => {
    if (bypass) return;
    setState({ kind: 'loading' });
    try {
      const binding = await getCashierStationBinding();
      if (!binding) {
        setOperatorName('');
        setState({ kind: 'pair', binding: null });
        return;
      }
      const session = await validateCashierOperatorSession();
      if (session) {
        const staff = await listCashierLoginStaff().catch(() => [] as CashierLoginStaff[]);
        setOperatorName(staff.find(member => member.id === session.context.staff_id)?.display_name || '');
        setState({ kind: 'ready', binding, session });
        return;
      }
      const staff = await listCashierLoginStaff();
      setOperatorName('');
      setSelectedStaffId(current => staff.some(member => member.id === current) ? current : staff[0]?.id || '');
      setState({ kind: 'login', binding, staff });
    } catch (error) {
      if (await recoverStationBinding(error)) return;
      const binding = await getCashierStationBinding().catch(() => null);
      setState({ kind: 'error', binding, message: errorText(error, labels) });
    }
  };

  useEffect(() => { if (!bypass) void load(); }, [bypass]);

  useEffect(() => {
    if (bypass) return;
    const handleOperatorSessionInvalidated = () => {
      void load();
    };
    window.addEventListener(
      'fawri:cashier-operator-session-invalidated',
      handleOperatorSessionInvalidated,
    );
    return () => {
      window.removeEventListener(
        'fawri:cashier-operator-session-invalidated',
        handleOperatorSessionInvalidated,
      );
    };
  }, [bypass]);

  useEffect(() => {
    const session = state.kind === 'ready' ? state.session : null;
    document.documentElement.dataset.cashierOperatorReady = session ? '1' : '0';
    document.documentElement.dataset.cashierCanReports = session && cashierOperatorCan(session, 'reports.sales') ? '1' : '0';
    document.documentElement.dataset.cashierCanProfit = session && cashierOperatorCan(session, 'reports.profit') ? '1' : '0';
    document.documentElement.dataset.cashierCanReturn = session && cashierOperatorCan(session, 'sale.return') ? '1' : '0';
    document.documentElement.dataset.cashierCanVoid = session && cashierOperatorCan(session, 'sale.void') ? '1' : '0';
    return () => {
      delete document.documentElement.dataset.cashierOperatorReady;
      delete document.documentElement.dataset.cashierCanReports;
      delete document.documentElement.dataset.cashierCanProfit;
      delete document.documentElement.dataset.cashierCanReturn;
      delete document.documentElement.dataset.cashierCanVoid;
    };
  }, [state]);

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
      setState({ kind: 'error', binding: null, message: errorText(error, labels) });
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    if (!selectedStaffId || !/^\d{4,8}$/.test(pin) || state.kind !== 'login') return;
    setBusy(true);
    setNotice(labels.syncPreparing);
    const selectedStaff = state.staff.find(member => member.id === selectedStaffId);
    try {
      const session = await loginCashierOperator(selectedStaffId, pin);
      const binding = await getCashierStationBinding();
      if (!binding) throw new Error('station binding missing');
      await syncCashierOperatorCatalogFromCloud();
      publishCashierCatalogRefresh();
      setPin('');
      setNotice('');
      setOperatorName(selectedStaff?.display_name || '');
      setState({ kind: 'ready', binding, session });
      window.dispatchEvent(new CustomEvent('fawri:cashier-operator-session-changed'));
    } catch (error) {
      if (await recoverStationBinding(error)) return;
      setNotice('');
      setState({ kind: 'error', binding: state.binding, message: errorText(error, labels) });
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <main className="cashier-operator-gate-loading flex min-h-screen items-center justify-center bg-slate-50 p-6" dir={dir}>
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white px-6 py-4 text-center text-sm font-medium text-slate-600 shadow-sm">
          {pageLoadingLabel(labels)}
        </div>
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
          <label className="mt-5 block text-sm font-semibold">{labels.pairCode}<input value={pairingCode} onChange={event => setPairingCode(normalizeCashierPairingCode(event.target.value))} onKeyDown={event => { if (event.key === 'Enter') void pair(); }} autoComplete="off" autoCapitalize="none" spellCheck={false} inputMode="text" lang="en-US" className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-lg tracking-widest outline-none focus:border-orange-400" dir="ltr" style={{ fontFamily: '"Courier New", Consolas, monospace', fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"locl" 0, "lnum" 1', fontLanguageOverride: '"ENG"' }} /></label>
          <button type="button" disabled={busy || !pairingCode.trim()} onClick={() => void pair()} className="mt-4 h-12 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-50">{busy ? labels.pairing : labels.pair}</button>
        </section>
      </main>
    );
  }

  if (state.kind === 'login') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir={dir}>
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3"><img src="/fawri-logo.svg" alt="Fawri" className="h-12 w-12" /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{state.binding.station_name}</span></div>
          <h1 className="mt-4 text-xl font-bold">{labels.loginTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{labels.loginHint}</p>
          {notice ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</p> : null}
          {state.staff.length === 0 ? <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{labels.noStaff}</p> : (
            <>
              <label className="mt-5 block text-sm font-semibold">{labels.employee}</label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-slate-300 bg-white px-3 focus:ring-orange-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.staff.map(staff => <SelectItem key={staff.id} value={staff.id}>{staff.display_name} — {roleLabel(staff.role)}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="mt-4 block text-sm font-semibold">{labels.pin}<input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={event => { if (event.key === 'Enter') void login(); }} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus:border-orange-400" dir="ltr" /></label>
              <button type="button" disabled={busy || !selectedStaffId || !/^\d{4,8}$/.test(pin)} onClick={() => void login()} className="mt-4 h-12 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-50">{busy ? labels.loggingIn : labels.login}</button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (!pageAllowed(state.session)) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir={dir}><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold">{labels.accessDenied}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{labels.accessHint}</p><a href="/cashier.html" className="mt-5 inline-flex h-11 items-center rounded-xl bg-slate-900 px-5 font-bold text-white">{labels.back}</a></section></main>;
  }

  return (
    <div className="relative">
      <div className="fixed left-1/2 top-3 z-[80] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 text-xs shadow-lg backdrop-blur">
        <span className="max-w-[50vw] truncate font-semibold text-slate-600">{operatorName || roleLabel(state.session.context.role)} · {roleLabel(state.session.context.role)} · {state.binding.station_name}</span>
        <CashierEndShiftButton
          operatorName={operatorName || roleLabel(state.session.context.role)}
          onStationBindingInvalid={recoverStationBinding}
          onEnded={async () => {
            window.dispatchEvent(new CustomEvent('fawri:cashier-operator-session-changed'));
            setPin('');
            setNotice('');
            setOperatorName('');
            await load();
          }}
        />
      </div>
      {children}
    </div>
  );
}
