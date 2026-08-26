import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type StaffPermission =
  | 'sale.create'
  | 'sale.view_own'
  | 'sale.view_all'
  | 'sale.return'
  | 'sale.void'
  | 'reports.sales'
  | 'reports.profit';

type StaffView = {
  id: string;
  display_name: string;
  role: 'cashier' | 'manager';
  status: 'active' | 'disabled' | 'revoked';
  permissions: string[];
  version: number;
  locked_until?: string;
};

type StationView = {
  id: string;
  name: string;
  branch_key: string;
  branch_label?: string;
  status: 'active' | 'disabled' | 'revoked';
  paired: boolean;
  paired_device_id?: string;
  offline_inventory_authority: boolean;
  credential_version: number;
};

type PairingState = {
  stationId: string;
  stationName: string;
  code: string;
  expiresAt: string;
};

const COPY: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'الكاشيرات والموظفون',
    subtitle: 'إدارة أجهزة الكاشير، الموظفين، الصلاحيات والربط الآمن.',
    staff: 'الموظفون',
    stations: 'محطات الكاشير',
    addStaff: 'إضافة موظف',
    name: 'اسم الموظف',
    role: 'الدور',
    cashier: 'كاشير',
    manager: 'مدير',
    pin: 'PIN من 4 إلى 8 أرقام',
    saveStaff: 'إضافة الموظف',
    permissions: 'الصلاحيات',
    allSales: 'رؤية مبيعات الموظفين الآخرين',
    returns: 'تنفيذ المرتجعات',
    voids: 'إلغاء عملية بيع كاملة',
    salesReports: 'عرض تقارير المبيعات',
    profitReports: 'عرض الأرباح',
    profitWarning: 'صلاحية الأرباح حساسة. لا تمنحها إلا لموظف موثوق.',
    active: 'نشط',
    disabled: 'معطل',
    revoked: 'ملغى نهائيًا',
    disable: 'تعطيل',
    enable: 'تفعيل',
    addStation: 'إضافة محطة كاشير',
    stationName: 'اسم المحطة',
    branchKey: 'رمز الفرع',
    branchLabel: 'اسم الفرع (اختياري)',
    offlineAuthority: 'السماح لهذه المحطة ببيع المخزون المتابع أثناء انقطاع الإنترنت',
    offlineHint: 'يمكن تعيين محطة واحدة فقط لكل فرع كسلطة مخزون Offline.',
    saveStation: 'إضافة المحطة',
    paired: 'مربوطة',
    notPaired: 'غير مربوطة',
    pair: 'إنشاء رمز ربط',
    pairingTitle: 'رمز ربط الجهاز',
    pairingHint: 'افتح الكاشير على الجهاز الجديد وأدخل هذا الرمز. صالح لمدة 10 دقائق ويستخدم مرة واحدة.',
    expires: 'ينتهي',
    close: 'إغلاق',
    loading: 'جارٍ تحميل بيانات الكاشير...',
    failed: 'تعذر تنفيذ العملية.',
    emptyStaff: 'لا يوجد موظفون حتى الآن.',
    emptyStations: 'لا توجد محطات كاشير حتى الآن.',
    saving: 'جارٍ الحفظ...',
  },
  ku: {
    title: 'کاشێر و کارمەندان',
    subtitle: 'بەڕێوەبردنی ئامێرەکان، کارمەندان، دەسەڵات و بەستنەوەی پارێزراو.',
    staff: 'کارمەندان',
    stations: 'وێستگەکانی کاشێر',
    addStaff: 'زیادکردنی کارمەند',
    name: 'ناوی کارمەند',
    role: 'ڕۆڵ',
    cashier: 'کاشێر',
    manager: 'بەڕێوەبەر',
    pin: 'PIN لە 4 تا 8 ژمارە',
    saveStaff: 'زیادکردنی کارمەند',
    permissions: 'دەسەڵاتەکان',
    allSales: 'بینینی فرۆشتنی کارمەندانی تر',
    returns: 'گەڕاندنەوە',
    voids: 'هەڵوەشاندنەوەی فرۆشتن',
    salesReports: 'بینینی ڕاپۆرتی فرۆشتن',
    profitReports: 'بینینی قازانج',
    profitWarning: 'دەسەڵاتی قازانج هەستیارە. تەنها بە کارمەندی متمانەپێکراو بدرێت.',
    active: 'چالاک',
    disabled: 'ناچالاک',
    revoked: 'هەڵوەشاوە',
    disable: 'ناچالاککردن',
    enable: 'چالاککردن',
    addStation: 'زیادکردنی وێستگەی کاشێر',
    stationName: 'ناوی وێستگە',
    branchKey: 'کۆدی لق',
    branchLabel: 'ناوی لق (ئارەزوومەندانە)',
    offlineAuthority: 'ڕێگەدان بە فرۆشتنی کۆگای بەدواداچووکراو لە کاتی نەبوونی ئینتەرنێت',
    offlineHint: 'تەنها یەک وێستگە لە هەر لقێک دەتوانێت دەسەڵاتی Offline هەبێت.',
    saveStation: 'زیادکردنی وێستگە',
    paired: 'بەستراوە',
    notPaired: 'نەبەستراوە',
    pair: 'دروستکردنی کۆدی بەستنەوە',
    pairingTitle: 'کۆدی بەستنی ئامێر',
    pairingHint: 'کاشێر لە ئامێری نوێ بکەرەوە و ئەم کۆدە بنووسە. 10 خولەک بەردەوامە و جارێک بەکاردێت.',
    expires: 'کۆتایی',
    close: 'داخستن',
    loading: 'زانیاری کاشێر بار دەکرێت...',
    failed: 'کردارەکە سەرکەوتوو نەبوو.',
    emptyStaff: 'هێشتا هیچ کارمەندێک نییە.',
    emptyStations: 'هێشتا هیچ وێستگەیەکی کاشێر نییە.',
    saving: 'پاشەکەوت دەکرێت...',
  },
  en: {
    title: 'Cashiers & Staff',
    subtitle: 'Manage cashier devices, staff permissions and secure pairing.',
    staff: 'Staff',
    stations: 'Cashier stations',
    addStaff: 'Add staff member',
    name: 'Employee name',
    role: 'Role',
    cashier: 'Cashier',
    manager: 'Manager',
    pin: '4–8 digit PIN',
    saveStaff: 'Add employee',
    permissions: 'Permissions',
    allSales: 'View other employees’ sales',
    returns: 'Process returns',
    voids: 'Void complete sales',
    salesReports: 'View sales reports',
    profitReports: 'View profit',
    profitWarning: 'Profit access is sensitive. Grant it only to trusted staff.',
    active: 'Active',
    disabled: 'Disabled',
    revoked: 'Revoked',
    disable: 'Disable',
    enable: 'Enable',
    addStation: 'Add cashier station',
    stationName: 'Station name',
    branchKey: 'Branch key',
    branchLabel: 'Branch name (optional)',
    offlineAuthority: 'Allow this station to sell tracked inventory while offline',
    offlineHint: 'Only one station per branch can be the offline inventory authority.',
    saveStation: 'Add station',
    paired: 'Paired',
    notPaired: 'Not paired',
    pair: 'Create pairing code',
    pairingTitle: 'Device pairing code',
    pairingHint: 'Open Cashier on the new device and enter this code. It expires in 10 minutes and can be used once.',
    expires: 'Expires',
    close: 'Close',
    loading: 'Loading cashier data...',
    failed: 'The operation could not be completed.',
    emptyStaff: 'No staff members yet.',
    emptyStations: 'No cashier stations yet.',
    saving: 'Saving...',
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw new Error(String(payload.error || payload.code || 'Cashier management failed'));
  }
  return payload;
}

function recommended(role: 'cashier' | 'manager'): Set<StaffPermission> {
  return new Set<StaffPermission>(
    role === 'manager'
      ? ['sale.create', 'sale.view_own', 'sale.view_all', 'sale.return', 'sale.void', 'reports.sales']
      : ['sale.create', 'sale.view_own'],
  );
}

export default function CashierManagementPage() {
  const { lang, dir } = useI18n();
  const l = COPY[lang] || COPY.en;
  const [staff, setStaff] = useState<StaffView[]>([]);
  const [stations, setStations] = useState<StationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pairing, setPairing] = useState<PairingState | null>(null);

  const [staffName, setStaffName] = useState('');
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier');
  const [pin, setPin] = useState('');
  const [permissions, setPermissions] = useState<Set<StaffPermission>>(() => recommended('cashier'));

  const [stationName, setStationName] = useState('');
  const [branchKey, setBranchKey] = useState('main');
  const [branchLabel, setBranchLabel] = useState('');
  const [offlineAuthority, setOfflineAuthority] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [staffPayload, stationPayload] = await Promise.all([
        api('/api/cashier/management/staff'),
        api('/api/cashier/management/stations'),
      ]);
      setStaff(Array.isArray(staffPayload.staff) ? staffPayload.staff as StaffView[] : []);
      setStations(Array.isArray(stationPayload.stations) ? stationPayload.stations as StationView[] : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l.failed);
    } finally {
      setLoading(false);
    }
  }, [l.failed]);

  useEffect(() => { void load(); }, [load]);

  const setRoleWithDefaults = (next: 'cashier' | 'manager') => {
    setRole(next);
    setPermissions(recommended(next));
  };

  const togglePermission = (permission: StaffPermission) => {
    setPermissions(current => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      if (permission === 'reports.profit' && next.has('reports.profit')) {
        next.add('reports.sales');
      }
      if (permission === 'reports.sales' && !next.has('reports.sales')) {
        next.delete('reports.profit');
      }
      return next;
    });
  };

  const permissionOptions = useMemo(() => [
    ['sale.view_all', l.allSales],
    ['sale.return', l.returns],
    ['sale.void', l.voids],
    ['reports.sales', l.salesReports],
    ['reports.profit', l.profitReports],
  ] as Array<[StaffPermission, string]>, [l]);

  const addStaff = async () => {
    if (!staffName.trim() || !/^\d{4,8}$/.test(pin)) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/cashier/management/staff', {
        method: 'POST',
        body: JSON.stringify({
          display_name: staffName.trim(),
          role,
          pin,
          permissions: [...permissions],
        }),
      });
      setStaffName('');
      setPin('');
      setRoleWithDefaults('cashier');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l.failed);
    } finally {
      setBusy(false);
    }
  };

  const toggleStaffStatus = async (member: StaffView) => {
    if (member.status === 'revoked') return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/cashier/management/staff/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_version: member.version,
          status: member.status === 'active' ? 'disabled' : 'active',
        }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l.failed);
    } finally {
      setBusy(false);
    }
  };

  const addStation = async () => {
    if (!stationName.trim() || !branchKey.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/cashier/management/stations', {
        method: 'POST',
        body: JSON.stringify({
          name: stationName.trim(),
          branch_key: branchKey.trim(),
          branch_label: branchLabel.trim() || undefined,
          offline_inventory_authority: offlineAuthority,
        }),
      });
      setStationName('');
      setBranchLabel('');
      setOfflineAuthority(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l.failed);
    } finally {
      setBusy(false);
    }
  };

  const createPairing = async (station: StationView) => {
    setBusy(true);
    setError('');
    try {
      const payload = await api(`/api/cashier/management/stations/${encodeURIComponent(station.id)}/pairing`, { method: 'POST', body: '{}' });
      setPairing({
        stationId: station.id,
        stationName: station.name,
        code: String(payload.pairing_code || ''),
        expiresAt: String(payload.expires_at || ''),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l.failed);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (value: StaffView['status'] | StationView['status']) =>
    value === 'active' ? l.active : value === 'disabled' ? l.disabled : l.revoked;

  return (
    <div className="space-y-6 pb-8" dir={dir}>
      <div>
        <h1 className="text-2xl font-bold text-foreground">{l.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{l.subtitle}</p>
      </div>

      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive">{error}</div> : null}
      {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{l.loading}</div> : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{l.staff}</h2><span className="text-sm text-muted-foreground">{staff.length}</span></div>
            <div className="rounded-xl border bg-background p-4">
              <h3 className="font-bold">{l.addStaff}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">{l.name}<input value={staffName} onChange={event => setStaffName(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
                <label className="text-sm font-semibold">{l.role}<select value={role} onChange={event => setRoleWithDefaults(event.target.value as 'cashier' | 'manager')} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"><option value="cashier">{l.cashier}</option><option value="manager">{l.manager}</option></select></label>
                <label className="text-sm font-semibold sm:col-span-2">{l.pin}<input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary" dir="ltr" /></label>
              </div>
              <p className="mt-4 text-sm font-bold">{l.permissions}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {permissionOptions.map(([permission, label]) => (
                  <label key={permission} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${permission === 'reports.profit' ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/10' : ''}`}>
                    <input type="checkbox" checked={permissions.has(permission)} onChange={() => togglePermission(permission)} className="mt-0.5 h-4 w-4" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {permissions.has('reports.profit') ? <p className="mt-2 text-xs font-semibold text-amber-700">{l.profitWarning}</p> : null}
              <button type="button" disabled={busy || !staffName.trim() || !/^\d{4,8}$/.test(pin)} onClick={() => void addStaff()} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy ? l.saving : l.saveStaff}</button>
            </div>

            <div className="space-y-2">
              {staff.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{l.emptyStaff}</p> : staff.map(member => (
                <div key={member.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-bold">{member.display_name}</p><p className="text-xs text-muted-foreground">{member.role === 'manager' ? l.manager : l.cashier} · {statusLabel(member.status)}</p></div>
                    {member.status !== 'revoked' ? <button type="button" disabled={busy} onClick={() => void toggleStaffStatus(member)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-accent">{member.status === 'active' ? l.disable : l.enable}</button> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{member.permissions.map(permission => <span key={permission} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${permission === 'reports.profit' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>{permission}</span>)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{l.stations}</h2><span className="text-sm text-muted-foreground">{stations.length}</span></div>
            <div className="rounded-xl border bg-background p-4">
              <h3 className="font-bold">{l.addStation}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">{l.stationName}<input value={stationName} onChange={event => setStationName(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
                <label className="text-sm font-semibold">{l.branchKey}<input value={branchKey} onChange={event => setBranchKey(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" dir="ltr" /></label>
                <label className="text-sm font-semibold sm:col-span-2">{l.branchLabel}<input value={branchLabel} onChange={event => setBranchLabel(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
              </div>
              <label className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-3 text-sm"><input type="checkbox" checked={offlineAuthority} onChange={event => setOfflineAuthority(event.target.checked)} className="mt-0.5 h-4 w-4" /><span><b className="block">{l.offlineAuthority}</b><span className="mt-1 block text-xs text-muted-foreground">{l.offlineHint}</span></span></label>
              <button type="button" disabled={busy || !stationName.trim() || !branchKey.trim()} onClick={() => void addStation()} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy ? l.saving : l.saveStation}</button>
            </div>

            <div className="space-y-2">
              {stations.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{l.emptyStations}</p> : stations.map(station => (
                <div key={station.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="font-bold">{station.name}</p><p className="text-xs text-muted-foreground">{station.branch_label || station.branch_key} · {statusLabel(station.status)} · {station.paired ? l.paired : l.notPaired}</p></div>
                    {station.status === 'active' ? <button type="button" disabled={busy} onClick={() => void createPairing(station)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{l.pair}</button> : null}
                  </div>
                  {station.offline_inventory_authority ? <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">Offline inventory authority</span> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {pairing ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setPairing(null); }}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl">
            <h2 className="text-lg font-bold">{l.pairingTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{pairing.stationName}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{l.pairingHint}</p>
            <div className="mt-4 rounded-xl border bg-background p-4 text-center font-mono text-xl font-bold tracking-wider" dir="ltr">{pairing.code}</div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{l.expires}: <span dir="ltr">{new Date(pairing.expiresAt).toLocaleString()}</span></p>
            <button type="button" onClick={() => setPairing(null)} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground">{l.close}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
