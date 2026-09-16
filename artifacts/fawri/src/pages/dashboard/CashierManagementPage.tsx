import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  | 'sale.discount'
  | 'sale.discount_override'
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
  configuration_etag: string;
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
    addStaff: 'إضافة موظف', name: 'اسم الموظف', role: 'الدور', cashier: 'كاشير', manager: 'مدير', pin: 'رمز الدخول من 4 إلى 8 أرقام', saveStaff: 'إضافة الموظف', permissions: 'الصلاحيات', discountPolicies: 'سياسات الخصم',
    createSales: 'إنشاء المبيعات', ownSales: 'عرض مبيعاته', allSales: 'رؤية مبيعات الموظفين الآخرين', returns: 'تنفيذ المرتجعات', voids: 'إلغاء عملية بيع كاملة', manualDiscount: 'تنفيذ خصم يدوي', discountOverride: 'اعتماد تجاوز حد الخصم', salesReports: 'عرض تقارير المبيعات', profitReports: 'عرض الأرباح',
    discountWarning: 'صلاحية الخصم لا تُمنح تلقائيًا. بعد تفعيلها، حدّد حد الموظف من صفحة سياسات الخصم. أي خصم يتجاوز الحد يحتاج موافقة مدير مخوّل.', profitWarning: 'صلاحية الأرباح حساسة. لا تمنحها إلا لموظف موثوق.', active: 'نشط', disabled: 'معطل', revoked: 'ملغى نهائيًا', disable: 'تعطيل', enable: 'تفعيل', edit: 'تعديل', cancel: 'إلغاء', saveChanges: 'حفظ التعديلات', editStaff: 'تعديل الموظف', newPin: 'رمز دخول جديد (اختياري)',
    addStation: 'إضافة محطة كاشير', stationName: 'اسم المحطة', branchKey: 'رمز الفرع', branchLabel: 'اسم الفرع (اختياري)', offlineAuthority: 'السماح لهذه المحطة ببيع المنتجات ذات المخزون المتابع أثناء انقطاع الإنترنت', offlineHint: 'يمكن تفعيل هذا الخيار لمحطة واحدة فقط في كل فرع. عند انقطاع الإنترنت، تُمنع المحطات الأخرى من بيع المنتجات ذات المخزون المتابع لتجنب تعارض الكميات.', offlineBadge: 'مخزون متاح دون اتصال', saveStation: 'إضافة المحطة', editStation: 'تعديل المحطة', paired: 'مربوطة', notPaired: 'غير مربوطة', pair: 'إنشاء رمز ربط', stationStatus: 'حالة المحطة', disableStation: 'تعطيل المحطة', enableStation: 'تفعيل المحطة', activeStationHint: 'تعطيل المحطة يسحب صلاحية الجهاز الحالي فورًا وينهي أي مناوبة نشطة ويمنع أي بيع جديد.', disabledStationHint: 'المحطة معطلة وغير قابلة للاستخدام. فعّلها ثم أنشئ رمز ربط جديدًا للجهاز.', disableStationWarning: 'تعطيل هذه المحطة سيفك ربط الجهاز فورًا وينهي أي مناوبة نشطة. عند إعادة التفعيل يجب إنشاء رمز ربط جديد. هل تريد المتابعة؟',
    pairingTitle: 'رمز ربط الجهاز', pairingHint: 'افتح الكاشير على الجهاز الجديد وأدخل هذا الرمز. صالح لمدة 10 دقائق ويستخدم مرة واحدة.', expires: 'ينتهي', copyCode: 'نسخ الرمز', copied: 'تم النسخ', close: 'إغلاق',
    loading: 'جارٍ تحميل بيانات الكاشير...', failed: 'تعذر تنفيذ العملية. حاول مرة أخرى.', emptyStaff: 'لا يوجد موظفون حتى الآن.', emptyStations: 'لا توجد محطات كاشير حتى الآن.', saving: 'جارٍ الحفظ...', sessionExpired: 'انتهت جلسة التاجر. سجّل الدخول من جديد ثم أعد المحاولة.', versionConflict: 'تم تعديل بيانات الموظف في مكان آخر. حدّث الصفحة ثم أعد المحاولة.', stationVersionConflict: 'تم تعديل إعدادات المحطة في مكان آخر. حدّث الصفحة ثم أعد المحاولة.', offlineConflict: 'هناك محطة أخرى في هذا الفرع تملك صلاحية بيع المخزون أثناء انقطاع الإنترنت.',
  },
  ku: {
    title: 'کاشێر و کارمەندان', subtitle: 'بەڕێوەبردنی ئامێرەکان و کارمەندان و دەسەڵات و بەستنەوەی پارێزراو.', staff: 'کارمەندان', stations: 'وێستگەکانی کاشێر',
    addStaff: 'زیادکردنی کارمەند', name: 'ناوی کارمەند', role: 'ڕۆڵ', cashier: 'کاشێر', manager: 'بەڕێوەبەر', pin: 'کۆدی چوونەژوورەوە لە 4 تا 8 ژمارە', saveStaff: 'زیادکردنی کارمەند', permissions: 'دەسەڵاتەکان', discountPolicies: 'سیاسەتەکانی داشکاندن',
    createSales: 'دروستکردنی فرۆشتن', ownSales: 'بینینی فرۆشتنی خۆی', allSales: 'بینینی فرۆشتنی کارمەندانی تر', returns: 'گەڕاندنەوە', voids: 'هەڵوەشاندنەوەی فرۆشتن', manualDiscount: 'داشکاندنی دەستی', discountOverride: 'پەسەندکردنی تێپەڕاندنی سنووری داشکاندن', salesReports: 'بینینی ڕاپۆرتی فرۆشتن', profitReports: 'بینینی قازانج',
    discountWarning: 'دەسەڵاتی داشکاندن هەستیارە و بە ڕۆڵ خۆکارانە نادرێت. دوای پێدانی دەسەڵات، سنوورەکان لە پەڕەی سیاسەتی داشکاندن دیاری بکە. پەسەندکردنی تێپەڕاندن تەنها بۆ بەڕێوەبەرە.', profitWarning: 'دەسەڵاتی قازانج هەستیارە. تەنها بە کارمەندی متمانەپێکراو بدرێت.', active: 'چالاک', disabled: 'ناچالاک', revoked: 'هەڵوەشاوە', disable: 'ناچالاککردن', enable: 'چالاککردن', edit: 'دەستکاری', cancel: 'پاشگەزبوونەوە', saveChanges: 'پاشەکەوتکردن', editStaff: 'دەستکاری کارمەند', newPin: 'کۆدی چوونەژوورەوەی نوێ (ئارەزوومەندانە)',
    addStation: 'زیادکردنی وێستگەی کاشێر', stationName: 'ناوی وێستگە', branchKey: 'کۆدی لق', branchLabel: 'ناوی لق (ئارەزوومەندانە)', offlineAuthority: 'ڕێگەدان بە فرۆشتنی کۆگای بەدواداچووکراو لە کاتی نەبوونی ئینتەرنێت', offlineHint: 'تەنها یەک وێستگە لە هەر لقێک دەتوانێت ئەم دەسەڵاتە هەبێت.', offlineBadge: 'فرۆشتنی کۆگا بەبێ ئینتەرنێت', saveStation: 'زیادکردنی وێستگە', editStation: 'دەستکاری وێستگە', paired: 'بەستراوە', notPaired: 'نەبەستراوە', pair: 'دروستکردنی کۆدی بەستنەوە', stationStatus: 'دۆخی وێستگە', disableStation: 'ناچالاککردنی وێستگە', enableStation: 'چالاککردنی وێستگە', activeStationHint: 'ناچالاککردن دەسەڵاتی ئامێری ئێستا دەسڕێتەوە، مناوبەی چالاک کۆتایی پێدێنێت و فرۆشتنی نوێ ڕادەگرێت.', disabledStationHint: 'وێستگەکە ناچالاکە. چالاکی بکە و پاشان کۆدی بەستنەوەی نوێ دروست بکە.', disableStationWarning: 'ناچالاککردنی ئەم وێستگەیە بەستنی ئامێر دەکاتەوە و هەر مناوبەیەکی چالاک کۆتایی پێدێنێت. دوای چالاککردنەوە پێویستە کۆدی بەستنەوەی نوێ دروست بکەیت. بەردەوام بیت؟',
    pairingTitle: 'کۆدی بەستنی ئامێر', pairingHint: 'کاشێر لە ئامێری نوێ بکەرەوە و ئەم کۆدە بنووسە. 10 خولەک بەردەوامە و جارێک بەکاردێت.', expires: 'کۆتایی', copyCode: 'کۆپی کۆد', copied: 'کۆپی کرا', close: 'داخستن',
    loading: 'زانیاری کاشێر بار دەکرێن...', failed: 'کردارەکە سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.', emptyStaff: 'هێشتا هیچ کارمەندێک نییە.', emptyStations: 'هێشتا هیچ وێستگەیەکی کاشێر نییە.', saving: 'پاشەکەوت دەکرێت...', sessionExpired: 'دانیشتنی بازرگان کۆتایی هاتووە. دووبارە بچۆ ژوورەوە.', versionConflict: 'زانیاری کارمەند لە شوێنێکی تر گۆڕدراوە. پەڕەکە نوێ بکەرەوە.', stationVersionConflict: 'ڕێکخستنەکانی وێستگە لە شوێنێکی تر گۆڕدراون. پەڕەکە نوێ بکەرەوە.', offlineConflict: 'وێستگەیەکی تر لەم لقە ئەم دەسەڵاتەی هەیە.',
  },
  en: {
    title: 'Cashiers & Staff', subtitle: 'Manage cashier devices, staff permissions and secure pairing.', staff: 'Staff', stations: 'Cashier stations',
    addStaff: 'Add staff member', name: 'Employee name', role: 'Role', cashier: 'Cashier', manager: 'Manager', pin: '4–8 digit PIN', saveStaff: 'Add employee', permissions: 'Permissions', discountPolicies: 'Discount policies',
    createSales: 'Create sales', ownSales: 'View own sales', allSales: 'View other employees’ sales', returns: 'Process returns', voids: 'Void complete sales', manualDiscount: 'Apply manual discount', discountOverride: 'Approve discount limit override', salesReports: 'View sales reports', profitReports: 'View profit',
    discountWarning: 'Discount authority is sensitive and is never granted automatically by role. After granting it, set employee limits on Discount policies. Override approval is available only to managers.', profitWarning: 'Profit access is sensitive. Grant it only to trusted staff.', active: 'Active', disabled: 'Disabled', revoked: 'Revoked', disable: 'Disable', enable: 'Enable', edit: 'Edit', cancel: 'Cancel', saveChanges: 'Save changes', editStaff: 'Edit employee', newPin: 'New PIN (optional)',
    addStation: 'Add cashier station', stationName: 'Station name', branchKey: 'Branch key', branchLabel: 'Branch name (optional)', offlineAuthority: 'Allow this station to sell tracked inventory while offline', offlineHint: 'Only one station per branch can own offline inventory authority.', offlineBadge: 'Offline inventory enabled', saveStation: 'Add station', editStation: 'Edit station', paired: 'Paired', notPaired: 'Not paired', pair: 'Create pairing code', stationStatus: 'Station status', disableStation: 'Disable station', enableStation: 'Enable station', activeStationHint: 'Disabling immediately revokes this device, ends any active shift, and blocks new sales.', disabledStationHint: 'This station is disabled. Enable it, then create a new pairing code for the device.', disableStationWarning: 'Disabling this station will immediately unpair the current device and end any active shift. A new pairing code will be required after re-enabling. Continue?',
    pairingTitle: 'Device pairing code', pairingHint: 'Open Cashier on the new device and enter this code. It expires in 10 minutes and can be used once.', expires: 'Expires', copyCode: 'Copy code', copied: 'Copied', close: 'Close',
    loading: 'Loading cashier data...', failed: 'The operation could not be completed. Please try again.', emptyStaff: 'No staff members yet.', emptyStations: 'No cashier stations yet.', saving: 'Saving...', sessionExpired: 'The merchant session has expired. Sign in again and retry.', versionConflict: 'This employee changed elsewhere. Refresh the page and retry.', stationVersionConflict: 'This station changed elsewhere. Refresh the page and retry.', offlineConflict: 'Another station in this branch already owns offline inventory authority.',
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
    throw new ManagementApiError(
      String(payload.code || 'CASHIER_MANAGEMENT_FAILED'),
      String(payload.error || 'Cashier management failed'),
    );
  }
  return payload;
}

function recommended(role: 'cashier' | 'manager'): Set<StaffPermission> {
  return new Set<StaffPermission>(role === 'manager'
    ? ['sale.create', 'sale.view_own', 'sale.view_all', 'sale.return', 'sale.void', 'reports.sales']
    : ['sale.create', 'sale.view_own']);
}

function knownPermissions(values: string[]): Set<StaffPermission> {
  const allowed = new Set<StaffPermission>([
    'sale.create', 'sale.view_own', 'sale.view_all', 'sale.return', 'sale.void',
    'sale.discount', 'sale.discount_override', 'reports.sales', 'reports.profit',
  ]);
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
  if (code === 'CASHIER_STATION_VERSION_CONFLICT') return l.stationVersionConflict;
  if (code === 'CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS') return l.offlineConflict;
  return l.failed;
}

function Modal({ children, dir, onClose }: { children: ReactNode; dir: 'rtl' | 'ltr'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" dir={dir} role="dialog" aria-modal="true">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl">
        {children}
        <button type="button" aria-label="close" onClick={onClose} className="sr-only">×</button>
      </div>
    </div>
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
  const [copied, setCopied] = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [addStationOpen, setAddStationOpen] = useState(false);

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

  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editStationName, setEditStationName] = useState('');
  const [editBranchKey, setEditBranchKey] = useState('');
  const [editBranchLabel, setEditBranchLabel] = useState('');
  const [editOfflineAuthority, setEditOfflineAuthority] = useState(false);

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
      setError(localizedError(cause, l));
    } finally {
      setLoading(false);
    }
  }, [l]);

  useEffect(() => { void load(); }, [load]);

  const permissionOptions = useMemo(() => [
    ['sale.view_all', l.allSales],
    ['sale.return', l.returns],
    ['sale.void', l.voids],
    ['sale.discount', l.manualDiscount],
    ['sale.discount_override', l.discountOverride],
    ['reports.sales', l.salesReports],
    ['reports.profit', l.profitReports],
  ] as Array<[StaffPermission, string]>, [l]);

  const permissionLabel = (permission: string): string | null => ({
    'sale.create': l.createSales,
    'sale.view_own': l.ownSales,
    'sale.view_all': l.allSales,
    'sale.return': l.returns,
    'sale.void': l.voids,
    'sale.discount': l.manualDiscount,
    'sale.discount_override': l.discountOverride,
    'reports.sales': l.salesReports,
    'reports.profit': l.profitReports,
  } as Record<string, string>)[permission] || null;

  const changePermission = (
    setter: React.Dispatch<React.SetStateAction<Set<StaffPermission>>>,
    permission: StaffPermission,
  ) => {
    setter(current => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission); else next.add(permission);
      if (permission === 'reports.profit' && next.has('reports.profit')) next.add('reports.sales');
      if (permission === 'reports.sales' && !next.has('reports.sales')) next.delete('reports.profit');
      return withBasePermissions(next);
    });
  };

  const resetAddStaff = () => {
    setStaffName('');
    setPin('');
    setRole('cashier');
    setPermissions(recommended('cashier'));
  };

  const openAddStaff = () => {
    resetAddStaff();
    setError('');
    setAddStaffOpen(true);
  };

  const closeAddStaff = () => {
    if (busy) return;
    resetAddStaff();
    setAddStaffOpen(false);
  };

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
          permissions: [...withBasePermissions(permissions)],
        }),
      });
      resetAddStaff();
      setAddStaffOpen(false);
      await load();
    } catch (cause) {
      setError(localizedError(cause, l));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (member: StaffView) => {
    setEditingStaffId(member.id);
    setEditName(member.display_name);
    setEditRole(member.role);
    setEditPin('');
    setEditPermissions(withBasePermissions(knownPermissions(member.permissions)));
    setError('');
  };

  const cancelEdit = () => {
    if (busy) return;
    setEditingStaffId(null);
    setEditPin('');
  };

  const saveStaffEdit = async (member: StaffView) => {
    if (!editName.trim() || (editPin && !/^\d{4,8}$/.test(editPin))) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/cashier/management/staff/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_version: member.version,
          display_name: editName.trim(),
          role: editRole,
          permissions: [...withBasePermissions(editPermissions)],
          ...(editPin ? { pin: editPin } : {}),
        }),
      });
      setEditingStaffId(null);
      setEditPin('');
      await load();
    } catch (cause) {
      setError(localizedError(cause, l));
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
      if (editingStaffId === member.id) setEditingStaffId(null);
      await load();
    } catch (cause) {
      setError(localizedError(cause, l));
    } finally {
      setBusy(false);
    }
  };

  const resetAddStation = () => {
    setStationName('');
    setBranchKey('main');
    setBranchLabel('');
    setOfflineAuthority(false);
  };

  const openAddStation = () => {
    resetAddStation();
    setError('');
    setAddStationOpen(true);
  };

  const closeAddStation = () => {
    if (busy) return;
    resetAddStation();
    setAddStationOpen(false);
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
      resetAddStation();
      setAddStationOpen(false);
      await load();
    } catch (cause) {
      setError(localizedError(cause, l));
    } finally {
      setBusy(false);
    }
  };

  const startStationEdit = (station: StationView) => {
    setEditingStationId(station.id);
    setEditStationName(station.name);
    setEditBranchKey(station.branch_key);
    setEditBranchLabel(station.branch_label || '');
    setEditOfflineAuthority(station.offline_inventory_authority);
    setError('');
  };

  const cancelStationEdit = () => {
    if (busy) return;
    setEditingStationId(null);
  };

  const saveStationEdit = async (station: StationView) => {
    if (!editStationName.trim() || !editBranchKey.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/cashier/management/stations/${encodeURIComponent(station.id)}/configuration`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_configuration_etag: station.configuration_etag,
          name: editStationName.trim(),
          branch_key: editBranchKey.trim(),
          branch_label: editBranchLabel.trim(),
          offline_inventory_authority: editOfflineAuthority,
        }),
      });
      setEditingStationId(null);
      await load();
    } catch (cause) {
      setError(localizedError(cause, l));
    } finally {
      setBusy(false);
    }
  };

  const toggleStationStatus = async (station: StationView) => {
    if (station.status === 'revoked') return;
    const disabling = station.status === 'active';
    if (disabling && !window.confirm(l.disableStationWarning)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/cashier/management/stations/${encodeURIComponent(station.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: disabling ? 'disabled' : 'active',
        }),
      });
      setEditingStationId(null);
      await load();
    } catch (cause) {
      setError(localizedError(cause, l));
    } finally {
      setBusy(false);
    }
  };

  const createPairing = async (station: StationView) => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const payload = await api(`/api/cashier/management/stations/${encodeURIComponent(station.id)}/pairing`, {
        method: 'POST',
        body: '{}',
      });
      setPairing({
        stationId: station.id,
        stationName: station.name,
        code: String(payload.pairing_code || ''),
        expiresAt: String(payload.expires_at || ''),
      });
    } catch (cause) {
      setError(localizedError(cause, l));
    } finally {
      setBusy(false);
    }
  };

  const copyPairingCode = async () => {
    if (!pairing?.code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pairing.code);
      } else {
        const area = document.createElement('textarea');
        area.value = pairing.code;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const statusLabel = (value: StaffView['status'] | StationView['status']) =>
    value === 'active' ? l.active : value === 'disabled' ? l.disabled : l.revoked;

  const PermissionGrid = ({
    value,
    toggle,
    staffRole,
  }: {
    value: Set<StaffPermission>;
    toggle: (permission: StaffPermission) => void;
    staffRole: 'cashier' | 'manager';
  }) => (
    <>
      <p className="mt-4 text-sm font-bold">{l.permissions}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {permissionOptions.map(([permission, label]) => {
          if (permission === 'sale.discount_override' && staffRole !== 'manager') return null;
          const sensitive = permission === 'reports.profit' || permission === 'sale.discount_override';
          return (
            <label
              key={permission}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${sensitive ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/10' : ''}`}
            >
              <input
                type="checkbox"
                checked={value.has(permission)}
                onChange={() => toggle(permission)}
                className="mt-0.5 h-4 w-4"
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
      {value.has('sale.discount') || value.has('sale.discount_override') ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">{l.discountWarning}</p>
      ) : null}
      {value.has('reports.profit') ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">{l.profitWarning}</p>
      ) : null}
    </>
  );

  const editingMember = editingStaffId
    ? staff.find(member => member.id === editingStaffId) || null
    : null;
  const editingStation = editingStationId
    ? stations.find(station => station.id === editingStationId) || null
    : null;

  return (
    <div className="flex flex-col gap-4 pb-4 xl:h-[calc(100dvh-4rem)] xl:min-h-0 xl:overflow-hidden xl:pb-0" dir={dir}>
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-foreground">{l.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{l.subtitle}</p>
      </div>

      {error ? (
        <div className="shrink-0 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{l.loading}</div>
      ) : (
        <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-2">
          <section className="flex min-h-[260px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm xl:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{l.staff}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{staff.length}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <a href="/dashboard/cashiers/discounts" className="rounded-lg border px-3 py-2 text-sm font-bold hover:bg-accent">
                  {l.discountPolicies}
                </a>
                <button type="button" onClick={openAddStaff} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                  {l.addStaff}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
              {staff.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{l.emptyStaff}</p>
              ) : staff.map(member => (
                <div key={member.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{member.display_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {member.role === 'manager' ? l.manager : l.cashier} · {statusLabel(member.status)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {member.status !== 'revoked' ? (
                        <button type="button" disabled={busy} onClick={() => startEdit(member)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-accent disabled:opacity-50">
                          {l.edit}
                        </button>
                      ) : null}
                      {member.status !== 'revoked' ? (
                        <button type="button" disabled={busy} onClick={() => void toggleStaffStatus(member)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-accent disabled:opacity-50">
                          {member.status === 'active' ? l.disable : l.enable}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {member.permissions.map(permission => {
                      const label = permissionLabel(permission);
                      const sensitive = permission === 'reports.profit' || permission === 'sale.discount_override';
                      return label ? (
                        <span key={permission} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${sensitive ? 'bg-amber-100 text-amber-800' : permission === 'sale.discount' ? 'bg-orange-100 text-orange-800' : 'bg-muted text-muted-foreground'}`}>
                          {label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-[260px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm xl:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{l.stations}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{stations.length}</span>
              </div>
              <button type="button" onClick={openAddStation} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                {l.addStation}
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
              {stations.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{l.emptyStations}</p>
              ) : stations.map(station => (
                <div key={station.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{station.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {station.branch_label ? `${station.branch_label} · ` : ''}{station.branch_key} · {statusLabel(station.status)} · {station.paired ? l.paired : l.notPaired}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {station.status !== 'revoked' ? (
                        <button type="button" disabled={busy} onClick={() => startStationEdit(station)} className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-accent disabled:opacity-50">
                          {l.edit}
                        </button>
                      ) : null}
                      <button type="button" disabled={busy || station.status !== 'active'} onClick={() => void createPairing(station)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
                        {l.pair}
                      </button>
                    </div>
                  </div>
                  {station.offline_inventory_authority ? (
                    <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{l.offlineBadge}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {addStaffOpen ? (
        <Modal dir={dir} onClose={closeAddStaff}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{l.addStaff}</h3>
            <button type="button" onClick={closeAddStaff} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{l.close}</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              {l.name}
              <input
                value={staffName}
                onChange={event => setStaffName(event.target.value)}
                name="cashier-staff-display-name-new"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary"
              />
            </label>
            <div className="text-sm font-semibold">
              <span>{l.role}</span>
              <Select
                value={role}
                onValueChange={value => {
                  const next = value as 'cashier' | 'manager';
                  setRole(next);
                  setPermissions(recommended(next));
                }}
              >
                <SelectTrigger className="mt-1.5 h-11 w-full rounded-lg bg-background"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cashier">{l.cashier}</SelectItem><SelectItem value="manager">{l.manager}</SelectItem></SelectContent>
              </Select>
            </div>
            <label className="text-sm font-semibold sm:col-span-2">
              {l.pin}
              <input
                value={pin}
                onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                name="cashier-staff-pin-new"
                autoComplete="new-password"
                data-1p-ignore="true"
                data-lpignore="true"
                inputMode="numeric"
                type="password"
                className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                dir="ltr"
              />
            </label>
          </div>
          <PermissionGrid value={permissions} toggle={permission => changePermission(setPermissions, permission)} staffRole={role} />
          <button type="button" disabled={busy || !staffName.trim() || !/^\d{4,8}$/.test(pin)} onClick={() => void addStaff()} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
            {busy ? l.saving : l.saveStaff}
          </button>
        </Modal>
      ) : null}

      {editingMember ? (
        <Modal dir={dir} onClose={cancelEdit}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{l.editStaff}</h3>
            <button type="button" onClick={cancelEdit} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{l.close}</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              {l.name}
              <input
                value={editName}
                onChange={event => setEditName(event.target.value)}
                name="cashier-staff-display-name-edit"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary"
              />
            </label>
            <div className="text-sm font-semibold">
              <span>{l.role}</span>
              <Select
                value={editRole}
                onValueChange={value => {
                  const next = value as 'cashier' | 'manager';
                  setEditRole(next);
                  setEditPermissions(recommended(next));
                }}
              >
                <SelectTrigger className="mt-1.5 h-11 w-full rounded-lg bg-background"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cashier">{l.cashier}</SelectItem><SelectItem value="manager">{l.manager}</SelectItem></SelectContent>
              </Select>
            </div>
            <label className="text-sm font-semibold sm:col-span-2">
              {l.newPin}
              <input
                value={editPin}
                onChange={event => setEditPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                name="cashier-staff-pin-edit"
                autoComplete="new-password"
                data-1p-ignore="true"
                data-lpignore="true"
                inputMode="numeric"
                type="password"
                className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                dir="ltr"
              />
            </label>
          </div>
          <PermissionGrid value={editPermissions} toggle={permission => changePermission(setEditPermissions, permission)} staffRole={editRole} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveStaffEdit(editingMember)} disabled={busy || !editName.trim() || Boolean(editPin && !/^\d{4,8}$/.test(editPin))} className={`flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 ${lang === 'ar' ? 'order-1' : 'order-2'}`}>
              {busy ? l.saving : l.saveChanges}
            </button>
            <button type="button" onClick={cancelEdit} disabled={busy} className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold ${lang === 'ar' ? 'order-2' : 'order-1'}`}>{l.cancel}</button>
          </div>
        </Modal>
      ) : null}

      {addStationOpen ? (
        <Modal dir={dir} onClose={closeAddStation}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{l.addStation}</h3>
            <button type="button" onClick={closeAddStation} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{l.close}</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{l.stationName}<input value={stationName} onChange={event => setStationName(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
            <label className="text-sm font-semibold">{l.branchKey}<input value={branchKey} onChange={event => setBranchKey(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" dir="ltr" /></label>
            <label className="text-sm font-semibold sm:col-span-2">{l.branchLabel}<input value={branchLabel} onChange={event => setBranchLabel(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-xl border p-3">
            <input type="checkbox" checked={offlineAuthority} onChange={event => setOfflineAuthority(event.target.checked)} className="mt-1 h-4 w-4" />
            <span><strong className="block text-sm">{l.offlineAuthority}</strong><span className="mt-1 block text-xs text-muted-foreground">{l.offlineHint}</span></span>
          </label>
          <button type="button" disabled={busy || !stationName.trim() || !branchKey.trim()} onClick={() => void addStation()} className="mt-4 h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
            {busy ? l.saving : l.saveStation}
          </button>
        </Modal>
      ) : null}

      {editingStation ? (
        <Modal dir={dir} onClose={cancelStationEdit}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{l.editStation}</h3>
            <button type="button" onClick={cancelStationEdit} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{l.close}</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{l.stationName}<input value={editStationName} onChange={event => setEditStationName(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
            <label className="text-sm font-semibold">{l.branchKey}<input value={editBranchKey} onChange={event => setEditBranchKey(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" dir="ltr" /></label>
            <label className="text-sm font-semibold sm:col-span-2">{l.branchLabel}<input value={editBranchLabel} onChange={event => setEditBranchLabel(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>
          </div>

          <section className={`mt-4 rounded-xl border p-3 ${editingStation.status === 'active' ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{l.stationStatus}</p>
                <p className={`mt-1 text-xs font-bold ${editingStation.status === 'active' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {statusLabel(editingStation.status)} · {editingStation.paired ? l.paired : l.notPaired}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleStationStatus(editingStation)}
                className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${editingStation.status === 'active' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
              >
                {editingStation.status === 'active' ? l.disableStation : l.enableStation}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {editingStation.status === 'active' ? l.activeStationHint : l.disabledStationHint}
            </p>
          </section>

          <label className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${editingStation.status !== 'active' ? 'opacity-60' : ''}`}>
            <input type="checkbox" checked={editOfflineAuthority} disabled={editingStation.status !== 'active'} onChange={event => setEditOfflineAuthority(event.target.checked)} className="mt-1 h-4 w-4" />
            <span><strong className="block text-sm">{l.offlineAuthority}</strong><span className="mt-1 block text-xs text-muted-foreground">{l.offlineHint}</span></span>
          </label>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveStationEdit(editingStation)} disabled={busy || !editStationName.trim() || !editBranchKey.trim()} className={`flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 ${lang === 'ar' ? 'order-1' : 'order-2'}`}>
              {busy ? l.saving : l.saveChanges}
            </button>
            <button type="button" onClick={cancelStationEdit} disabled={busy} className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold ${lang === 'ar' ? 'order-2' : 'order-1'}`}>{l.cancel}</button>
          </div>
        </Modal>
      ) : null}

      {pairing ? (
        <Modal dir={dir} onClose={() => { if (!busy) setPairing(null); }}>
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-lg font-bold">{l.pairingTitle}</h3><p className="mt-1 text-sm font-semibold text-muted-foreground">{pairing.stationName}</p></div>
            <button type="button" onClick={() => setPairing(null)} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{l.close}</button>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{l.pairingHint}</p>
          <div className="mt-4 rounded-xl border bg-muted/40 p-3">
            <div className="overflow-x-auto whitespace-nowrap rounded-lg bg-background px-3 py-3 text-center font-mono text-base font-bold" dir="ltr">{pairing.code}</div>
            <button type="button" onClick={() => void copyPairingCode()} className="mt-3 h-10 w-full rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
              {copied ? l.copied : l.copyCode}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">{l.expires}: <span dir="ltr">{new Date(pairing.expiresAt).toLocaleString(lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ku' : 'en')}</span></p>
        </Modal>
      ) : null}
    </div>
  );
}
