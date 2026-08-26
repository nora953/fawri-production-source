import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

type Copy = Record<string, string>;

const COPY: Record<Lang, Copy> = {
  ar: {
    title: 'الكاشيرات والموظفون', subtitle: 'إدارة أجهزة الكاشير والموظفين والصلاحيات والربط الآمن.', staff: 'الموظفون', stations: 'محطات الكاشير',
    addStaff: 'إضافة موظف', name: 'اسم الموظف', role: 'الدور', cashier: 'كاشير', manager: 'مدير', pin: 'PIN من 4 إلى 8 أرقام', saveStaff: 'إضافة الموظف', permissions: 'الصلاحيات',
    createSales: 'إنشاء المبيعات', ownSales: 'عرض مبيعاته', allSales: 'رؤية مبيعات الموظفين الآخرين', returns: 'تنفيذ المرتجعات', voids: 'إلغاء عملية بيع كاملة', salesReports: 'عرض تقارير المبيعات', profitReports: 'عرض الأرباح',
    profitWarning: 'صلاحية الأرباح حساسة. لا تمنحها إلا لموظف موثوق.', active: 'نشط', disabled: 'معطل', revoked: 'ملغى نهائيًا', disable: 'تعطيل', enable: 'تفعيل', edit: 'تعديل', cancel: 'إلغاء', saveChanges: 'حفظ التعديلات', editStaff: 'تعديل الموظف', newPin: 'PIN جديد (اختياري)',
    addStation: 'إضافة محطة كاشير', stationName: 'اسم المحطة', branchKey: 'رمز الفرع', branchLabel: 'اسم الفرع (اختياري)', offlineAuthority: 'السماح لهذه المحطة ببيع المخزون المتابع أثناء انقطاع الإنترنت', offlineHint: 'يمكن تعيين محطة واحدة فقط لكل فرع كسلطة مخزون أثناء انقطاع الإنترنت.', offlineBadge: 'مخزون متاح دون اتصال', saveStation: 'إضافة المحطة', paired: 'مربوطة', notPaired: 'غير مربوطة', pair: 'إنشاء رمز ربط',
    pairingTitle: 'رمز ربط الجهاز', pairingHint: 'افتح الكاشير على الجهاز الجديد وأدخل هذا الرمز. صالح لمدة 10 دقائق ويستخدم مرة واحدة.', expires: 'ينتهي', copyCode: 'نسخ الرمز', copied: 'تم النسخ', close: 'إغلاق',
    loading: 'جارٍ تحميل بيانات الكاشير...', failed: 'تعذر تنفيذ العملية. حاول مرة أخرى.', emptyStaff: 'لا يوجد موظفون حتى الآن.', emptyStations: 'لا توجد محطات كاشير حتى الآن.', saving: 'جارٍ الحفظ...', sessionExpired: 'انتهت جلسة التاجر. سجّل الدخول من جديد ثم أعد المحاولة.', versionConflict: 'تم تعديل بيانات الموظف في مكان آخر. حدّث الصفحة ثم أعد المحاولة.', offlineConflict: 'هناك محطة أخرى في هذا الفرع تملك صلاحية بيع المخزون أثناء انقطاع الإنترنت.',
  },
  ku: {
    title: 'کاشێر و کارمەندان', subtitle: 'بەڕێوەبردنی ئامێرەکان و کارمەندان و دەسەڵات و بەستنەوەی پارێزراو.', staff: 'کارمەندان', stations: 'وێستگەکانی کاشێر',
    addStaff: 'زیادکردنی کارمەند', name: 'ناوی کارمەند', role: 'ڕۆڵ', cashier: 'کاشێر', manager: 'بەڕێوەبەر', pin: 'PIN لە 4 تا 8 ژمارە', saveStaff: 'زیادکردنی کارمەند', permissions: 'دەسەڵاتەکان',
    createSales: 'دروستکردنی فرۆشتن', ownSales: 'بینینی فرۆشتنی خۆی', allSales: 'بینینی فرۆشتنی کارمەندانی تر', returns: 'گەڕاندنەوە', voids: 'هەڵوەشاندنەوەی فرۆشتن', salesReports: 'بینینی ڕاپۆرتی فرۆشتن', profitReports: 'بینینی قازانج',
    profitWarning: 'دەسەڵاتی قازانج هەستیارە. تەنها بە کارمەندی متمانەپێکراو بدرێت.', active: 'چالاک', disabled: 'ناچالاک', revoked: 'هەڵوەشاوە', disable: 'ناچالاککردن', enable: 'چالاککردن', edit: 'دەستکاری', cancel: 'پاشگەزبوونەوە', saveChanges: 'پاشەکەوتکردن', editStaff: 'دەستکاری کارمەند', newPin: 'PIN نوێ (ئارەزوومەندانە)',
    addStation: 'زیادکردنی وێستگەی کاشێر', stationName: 'ناوی وێستگە', branchKey: 'کۆدی لق', branchLabel: 'ناوی لق (ئارەزوومەندانە)', offlineAuthority: 'ڕێگەدان بە فرۆشتنی کۆگای بەدواداچووکراو لە کاتی نەبوونی ئینتەرنێت', offlineHint: 'تەنها یەک وێستگە لە هەر لقێک دەتوانێت ئەم دەسەڵاتە هەبێت.', offlineBadge: 'فرۆشتنی کۆگا بەبێ ئینتەرنێت', saveStation: 'زیادکردنی وێستگە', paired: 'بەستراوە', notPaired: 'نەبەستراوە', pair: 'دروستکردنی کۆدی بەستنەوە',
    pairingTitle: 'کۆدی بەستنی ئامێر', pairingHint: 'کاشێر لە ئامێری نوێ بکەرەوە و ئەم کۆدە بنووسە. 10 خولەک بەردەوامە و جارێک بەکاردێت.', expires: 'کۆتایی', copyCode: 'کۆپی کۆد', copied: 'کۆپی کرا', close: 'داخستن',
    loading: 'زانیاری کاشێر بار دەکرێت...', failed: 'کردارەکە سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.', emptyStaff: 'هێشتا هیچ کارمەندێک نییە.', emptyStations: 'هێشتا هیچ وێستگەیەکی کاشێر نییە.', saving: 'پاشەکەوت دەکرێت...', sessionExpired: 'دانیشتنی بازرگان کۆتایی هاتووە. دووبارە بچۆ ژوورەوە.', versionConflict: 'زانیاری کارمەند لە شوێنێکی تر گۆڕدراوە. پەڕەکە نوێ بکەرەوە.', offlineConflict: 'وێستگەیەکی تر لەم لقە ئەم دەسەڵاتەی هەیە.',
  },
  en: {
    title: 'Cashiers & Staff', subtitle: 'Manage cashier devices, staff permissions and secure pairing.', staff: 'Staff', stations: 'Cashier stations',
    addStaff: 'Add staff member', name: 'Employee name', role: 'Role', cashier: 'Cashier', manager: 'Manager', pin: '4–8 digit PIN', saveStaff: 'Add employee', permissions: 'Permissions',
    createSales: 'Create sales', ownSales: 'View own sales', allSales: 'View other employees’ sales', returns: 'Process returns', voids: 'Void complete sales', salesReports: 'View sales reports', profitReports: 'View profit',
    profitWarning: 'Profit access is sensitive. Grant it only to trusted staff.', active: 'Active', disabled: 'Disabled', revoked: 'Revoked', disable: 'Disable', enable: 'Enable', edit: 'Edit', cancel: 'Cancel', saveChanges: 'Save changes', editStaff: 'Edit employee', newPin: 'New PIN (optional)',
    addStation: 'Add cashier station', stationName: 'Station name', branchKey: 'Branch key', branchLabel: 'Branch name (optional)', offlineAuthority: 'Allow this station to sell tracked inventory while offline', offlineHint: 'Only one station per branch can own offline inventory authority.', offlineBadge: 'Offline inventory enabled', saveStation: 'Add station', paired: 'Paired', notPaired: 'Not paired', pair: 'Create pairing code',
    pairingTitle: 'Device pairing code', pairingHint: 'Open Cashier on the new device and enter this code. It expires in 10 minutes and can be used once.', expires: 'Expires', copyCode: 'Copy code', copied: 'Copied', close: 'Close',
    loading: 'Loading cashier data...', failed: 'The operation could not be completed. Please try again.', emptyStaff: 'No staff members yet.', emptyStations: 'No cashier stations yet.', saving: 'Saving...', sessionExpired: 'The merchant session has expired. Sign in again and retry.', versionConflict: 'This employee changed elsewhere. Refresh the page and retry.', offlineConflict: 'Another station in this branch already owns offline inventory authority.',
  },
};

class ManagementApiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw new ManagementApiError(String(payload.code || 'CASHIER_MANAGEMENT_FAILED'), String(payload.error || 'Cashier management failed'));
  }
  return payload;
}

function recommended(role: 'cashier' | 'manager'): Set<StaffPermission> {
  return new Set<StaffPermission>(role === 'manager'
    ? ['sale.create', 'sale.view_own', 'sale.view_all', 'sale.return', 'sale.void', 'reports.sales']
    : ['sale.create', 'sale.view_own']);
}

function knownPermissions(values: string[]): Set<StaffPermission> {
  const allowed = new Set<StaffPermission>(['sale.create', 'sale.view_own', 'sale.view_all', 'sale.return', 'sale.void', 'reports.sales', 'reports.profit']);
  return new Set(values.filter((value): value is StaffPermission => allowed.has(value as StaffPermission)));
}

function withBasePermissions(current: Set<StaffPermission>): Set<StaffPermission> {
  const next = new Set(current);
  next.add('sale.create');
  next.add('sale.view_own');
  if (next.has('reports.profit')) next.add('reports.sales');
  return next;
}

function localizedError(cause: unknown, l: Copy): string {
  if (!(cause instanceof ManagementApiError)) return l.failed;
  const code = cause.code;
  const raw = cause.message.toLowerCase();
  if (code.includes('MERCHANT_SESSION') || raw.includes('merchant session')) return l.sessionExpired;
  if (code === 'CASHIER_STAFF_VERSION_CONFLICT') return l.versionConflict;
  if (code === 'CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS') return l.offlineConflict;
  return l.failed;
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
  const [copied, setCopied] = useState(false);

  const [staffName, setStaffName] = useState('');
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier');
  const [pin, setPin] = useState('');
  const [permissions, setPermissions] = useState<Set<StaffPermission>>(() => recommended('cashier'));

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'cashier' | 'manager'>('cashier');
  const [editPin, setEditPin] = useState('');
  const [editPermissions, setEditPermissions] = useState<Set<StaffPermission>>(() => recommended('cashier'));

  const [stationName, setStationName] = useState('');
  const [branchKey, setBranchKey] = useState('main');
  const [branchLabel, setBranchLabel] = useState('');
  const [offlineAuthority, setOfflineAuthority] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [staffPayload, stationPayload] = await Promise.all([api('/api/cashier/management/staff'), api('/api/cashier/management/stations')]);
      setStaff(Array.isArray(staffPayload.staff) ? staffPayload.staff as StaffView[] : []);
      setStations(Array.isArray(stationPayload.stations) ? stationPayload.stations as StationView[] : []);
    } catch (cause) { setError(localizedError(cause, l)); }
    finally { setLoading(false); }
  }, [l]);

  useEffect(() => { void load(); }, [load]);

  const setRoleWithDefaults = (next: 'cashier' | 'manager') => { setRole(next); setPermissions(recommended(next)); };
  const setEditRoleWithDefaults = (next: 'cashier' | 'manager') => { setEditRole(next); setEditPermissions(recommended(next)); };

  const togglePermission = (permission: StaffPermission) => {
    setPermissions(current => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission); else next.add(permission);
      if (permission === 'reports.profit' && next.has('reports.profit')) next.add('reports.sales');
      if (permission === 'reports.sales' && !next.has('reports.sales')) next.delete('reports.profit');
      return withBasePermissions(next);
    });
  };

  const toggleEditPermission = (permission: StaffPermission) => {
    setEditPermissions(current => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission); else next.add(permission);
      if (permission === 'reports.profit' && next.has('reports.profit')) next.add('reports.sales');
      if (permission === 'reports.sales' && !next.has('reports.sales')) next.delete('reports.profit');
      return withBasePermissions(next);
    });
  };

  const permissionOptions = useMemo(() => [
    ['sale.view_all', l.allSales], ['sale.return', l.returns], ['sale.void', l.voids], ['reports.sales', l.salesReports], ['reports.profit', l.profitReports],
  ] as Array<[StaffPermission, string]>, [l]);

  const permissionLabel = (permission: string): string | null => ({
    'sale.create': l.createSales, 'sale.view_own': l.ownSales, 'sale.view_all': l.allSales, 'sale.return': l.returns, 'sale.void': l.voids, 'reports.sales': l.salesReports, 'reports.profit': l.profitReports,
  } as Record<string, string>)[permission] || null;

  const resetAddStaff = () => { setStaffName(''); setPin(''); setRole('cashier'); setPermissions(recommended('cashier')); };

  const addStaff = async () => {
    if (!staffName.trim() || !/^\d{4,8}$/.test(pin)) return;
    setBusy(true); setError('');
    try {
      await api('/api/cashier/management/staff', { method: 'POST', body: JSON.stringify({ display_name: staffName.trim(), role, pin, permissions: [...withBasePermissions(permissions)] }) });
      resetAddStaff(); await load();
    } catch (cause) { setError(localizedError(cause, l)); }
    finally { setBusy(false); }
  };

  const startEdit = (member: StaffView) => {
    setEditingStaffId(member.id); setEditName(member.display_name); setEditRole(member.role); setEditPin(''); setEditPermissions(withBasePermissions(knownPermissions(member.permissions))); setError('');
  };

  const cancelEdit = () => { setEditingStaffId(null); setEditPin(''); };

  const saveStaffEdit = async (member: StaffView) => {
    if (!editName.trim() || (editPin && !/^\d{4,8}$/.test(editPin))) return;
    setBusy(true); setError('');
    try {
      await api(`/api/cashier/management/staff/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ expected_version: member.version, display_name: editName.trim(), role: editRole, permissions: [...withBasePermissions(editPermissions)], ...(editPin ? { pin: editPin } : {}) }),
      });
      cancelEdit(); await load();
    } catch (cause) { setError(localizedError(cause, l)); }
    finally { setBusy(false); }
  };

  const toggleStaffStatus = async (member: StaffView) => {
    if (member.status === 'revoked') return;
    setBusy(true); setError('');
    try {
      await api(`/api/cashier/management/staff/${encodeURIComponent(member.id)}`, { method: 'PATCH', body: JSON.stringify({ expected_version: member.version, status: member.status === 'active' ? 'disabled' : 'active' }) });
      if (editingStaffId === member.id) cancelEdit(); await load();
    } catch (cause) { setError(localizedError(cause, l)); }
    finally { setBusy(false); }
  };

  const addStation = async () => {
    if (!stationName.trim() || !branchKey.trim()) return;
    setBusy(true); setError('');
    try {
      await api('/api/cashier/management/stations', { method: 'POST', body: JSON.stringify({ name: stationName.trim(), branch_key: branchKey.trim(), branch_label: branchLabel.trim() || undefined, offline_inventory_authority: offlineAuthority }) });
      setStationName(''); setBranchLabel(''); setOfflineAuthority(false); await load();
    } catch (cause) { setError(localizedError(cause, l)); }
    finally { setBusy(false); }
  };

  const createPairing = async (station: StationView) => {
    setBusy(true); setError(''); setCopied(false);
    try {
      const payload = await api(`/api/cashier/management/stations/${encodeURIComponent(station.id)}/pairing`, { method: 'POST', body: '{}' });
      setPairing({ stationId: station.id, stationName: station.name, code: String(payload.pairing_code || ''), expiresAt: String(payload.expires_at || '') });
    } catch (cause) { setError(localizedError(cause, l)); }
    finally { setBusy(false); }
  };

  const copyPairingCode = async () => {
    if (!pairing?.code) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(pairing.code);
      else {
        const area = document.createElement('textarea'); area.value = pairing.code; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      setCopied(true); window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };

  const statusLabel = (value: StaffView['status'] | StationView['status']) => value === 'active' ? l.active : value === 'disabled' ? l.disabled : l.revoked;
  const dateLocale = lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ku' : 'en';

  const PermissionGrid = ({ value, toggle }: { value: Set<StaffPermission>; toggle: (permission: StaffPermission) => void }) => (
    <>
      <p className="mt-4 text-sm font-bold">{l.permissions}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {permissionOptions.map(([permission, label]) => (
          <label key={permission} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${permission === 'reports.profit' ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/10' : ''}`}>
            <input type="checkbox" checked={value.has(permission)} onChange={() => toggle(permission)} className="mt-0.5 h-4 w-4" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {value.has('reports.profit') ? <p className="mt-2 text-xs font-semibold text-amber-700">{l.profitWarning}</p> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-4 pb-4 xl:h-[calc(100dvh-7rem)] xl:min-h-0 xl:overflow-hidden" dir={dir}>
      <div className="shrink-0"><h1 className="text-2xl font-bold text-foreground">{l.title}</h1><p className="mt-1 text-sm text-muted-foreground">{l.subtitle}</p></div>
      {error ? <div className="shrink-0 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive">{error}</div> : null}
      {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{l.loading}</div> : null}

      {!loading ? (
        <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-2">
          <section className="flex min-h-0 flex-col rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between"><h2 className="text-lg font-bold">{l.staff}</h2><span className="text-sm text-muted-foreground">{staff.length}</span></div>
            <div className="shrink-0 rounded-xl border bg-background p-4">
              <h3 className="font-bold">{l.addStaff}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">{l.name}<input value={staffName} onChange={event => setStaffName(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
                <div className="text-sm font-semibold"><span>{l.role}</span><Select value={role} onValueChange={value => setRoleWithDefaults(value as 'cashier' | 'manager')}><SelectTrigger className="mt-1.5 h-11 w-full rounded-lg bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cashier">{l.cashier}</SelectItem><SelectItem value="manager">{l.manager}</SelectItem></SelectContent></Select></div>
                <label className="text-sm font-semibold sm:col-span-2">{l.pin}<input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary" dir="ltr" /></label>
              </div>
              <PermissionGrid value={permissions} toggle={togglePermission} />
              <button type="button" disabled={busy || !staffName.trim() || !/^\d{4,8}$/.test(pin)} onClick={() => void addStaff()} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy ? l.saving : l.saveStaff}</button>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 xl:overflow-y-auto xl:pe-1">
              {staff.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{l.emptyStaff}</p> : staff.map(member => (
                <div key={member.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-bold">{member.display_name}</p><p className="text-xs text-muted-foreground">{member.role === 'manager' ? l.manager : l.cashier} · {statusLabel(member.status)}</p></div>
                    <div className="flex gap-2">
                      {member.status !== 'revoked' ? <button type="button" disabled={busy} onClick={() => startEdit(member)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-accent">{l.edit}</button> : null}
                      {member.status !== 'revoked' ? <button type="button" disabled={busy} onClick={() => void toggleStaffStatus(member)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-accent">{member.status === 'active' ? l.disable : l.enable}</button> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{member.permissions.map(permission => { const label = permissionLabel(permission); return label ? <span key={permission} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${permission === 'reports.profit' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>{label}</span> : null; })}</div>

                  {editingStaffId === member.id ? (
                    <div className="mt-3 rounded-xl border bg-card p-3">
                      <h4 className="font-bold">{l.editStaff}</h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-semibold">{l.name}<input value={editName} onChange={event => setEditName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal" /></label>
                        <div className="text-sm font-semibold"><span>{l.role}</span><Select value={editRole} onValueChange={value => setEditRoleWithDefaults(value as 'cashier' | 'manager')}><SelectTrigger className="mt-1.5 h-10 w-full rounded-lg bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cashier">{l.cashier}</SelectItem><SelectItem value="manager">{l.manager}</SelectItem></SelectContent></Select></div>
                        <label className="text-sm font-semibold sm:col-span-2">{l.newPin}<input value={editPin} onChange={event => setEditPin(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-center font-mono tracking-[0.25em]" dir="ltr" /></label>
                      </div>
                      <PermissionGrid value={editPermissions} toggle={toggleEditPermission} />
                      <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={cancelEdit} className="h-10 flex-1 rounded-lg border font-bold">{l.cancel}</button><button type="button" disabled={busy || !editName.trim() || Boolean(editPin && !/^\d{4,8}$/.test(editPin))} onClick={() => void saveStaffEdit(member)} className="h-10 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy ? l.saving : l.saveChanges}</button></div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between"><h2 className="text-lg font-bold">{l.stations}</h2><span className="text-sm text-muted-foreground">{stations.length}</span></div>
            <div className="shrink-0 rounded-xl border bg-background p-4">
              <h3 className="font-bold">{l.addStation}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">{l.stationName}<input value={stationName} onChange={event => setStationName(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
                <label className="text-sm font-semibold">{l.branchKey}<input value={branchKey} onChange={event => setBranchKey(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" dir="ltr" /></label>
                <label className="text-sm font-semibold sm:col-span-2">{l.branchLabel}<input value={branchLabel} onChange={event => setBranchLabel(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
              </div>
              <label className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-3 text-sm"><input type="checkbox" checked={offlineAuthority} onChange={event => setOfflineAuthority(event.target.checked)} className="mt-0.5 h-4 w-4" /><span><b className="block">{l.offlineAuthority}</b><span className="mt-1 block text-xs text-muted-foreground">{l.offlineHint}</span></span></label>
              <button type="button" disabled={busy || !stationName.trim() || !branchKey.trim()} onClick={() => void addStation()} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy ? l.saving : l.saveStation}</button>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 xl:overflow-y-auto xl:pe-1">
              {stations.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{l.emptyStations}</p> : stations.map(station => (
                <div key={station.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="font-bold">{station.name}</p><p className="text-xs text-muted-foreground">{station.branch_label || station.branch_key} · {statusLabel(station.status)} · {station.paired ? l.paired : l.notPaired}</p></div>
                    {station.status === 'active' ? <button type="button" disabled={busy} onClick={() => void createPairing(station)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{l.pair}</button> : null}
                  </div>
                  {station.offline_inventory_authority ? <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">{l.offlineBadge}</span> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {pairing ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setPairing(null); }}>
          <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl" dir={dir}>
            <h2 className="text-lg font-bold">{l.pairingTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{pairing.stationName}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{l.pairingHint}</p>
            <div className="mt-4 flex items-stretch gap-2">
              <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border bg-background px-4 py-3 font-mono text-base font-bold" dir="ltr"><span className="whitespace-nowrap">{pairing.code}</span></div>
              <button type="button" onClick={() => void copyPairingCode()} className="shrink-0 rounded-xl border bg-background px-4 text-sm font-bold hover:bg-accent">{copied ? l.copied : l.copyCode}</button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{l.expires}: <span dir="ltr">{new Date(pairing.expiresAt).toLocaleString(dateLocale)}</span></p>
            <button type="button" onClick={() => setPairing(null)} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground">{l.close}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
