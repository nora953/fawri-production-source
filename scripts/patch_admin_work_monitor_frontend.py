from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))


# -----------------------------------------------------------------------------
# Browser device identity, auth headers, tracked logout
# -----------------------------------------------------------------------------
store = Path("artifacts/fawri/src/lib/store.ts")
replace_once(
    store,
    "const ADMIN_SESSION_TOKEN_KEY = 'fawri_admin_session_token';\n",
    """const ADMIN_SESSION_TOKEN_KEY = 'fawri_admin_session_token';
const ADMIN_DEVICE_ID_KEY = 'fawri_admin_device_id';

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `device-${crypto.randomUUID()}`;
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const getAdminDeviceId = (): string => {
  let deviceId = localStorage.getItem(ADMIN_DEVICE_ID_KEY) || '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
    deviceId = createDeviceId().slice(0, 128);
    localStorage.setItem(ADMIN_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

export const getAdminDeviceLabel = (): string => {
  const userAgent = navigator.userAgent;
  const platform = /Android/i.test(userAgent)
    ? 'Android phone'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'Apple mobile device'
      : /Windows/i.test(userAgent)
        ? 'Windows computer'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'Mac computer'
          : /Linux/i.test(userAgent)
            ? 'Linux computer'
            : 'Browser device';
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\//i.test(userAgent)
      ? 'Firefox'
      : /Chrome\//i.test(userAgent)
        ? 'Chrome'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : 'Browser';
  return `${platform} / ${browser}`;
};
""",
    "admin device helpers",
)
replace_once(
    store,
    """export const getAdminAuthHeaders = (): Record<string, string> => {
  const token = getAdminSessionToken();

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
};
""",
    """export const getAdminAuthHeaders = (): Record<string, string> => {
  const token = getAdminSessionToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
        'X-Fawri-Device-Id': getAdminDeviceId(),
      }
    : {};
};
""",
    "tracked admin auth headers",
)
replace_once(
    store,
    """export const clearSession = () => {
  const hadSession = Boolean(localStorage.getItem('fawri_session'));
  localStorage.removeItem('fawri_session');
  clearAdminSessionToken();

  if (hadSession) {
    void fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }
};
""",
    """export const clearSession = () => {
  const hadSession = Boolean(localStorage.getItem('fawri_session'));
  const adminToken = getAdminSessionToken();
  const adminHeaders = adminToken ? getAdminAuthHeaders() : {};

  localStorage.removeItem('fawri_session');
  clearAdminSessionToken();

  if (adminToken) {
    void fetch('/api/auth/admin/session/logout', {
      method: 'POST',
      headers: adminHeaders,
      keepalive: true,
    }).catch(() => undefined);
  } else if (hadSession) {
    void fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }
};
""",
    "tracked admin logout",
)

# -----------------------------------------------------------------------------
# Login sends stable device identity and shows security-specific responses
# -----------------------------------------------------------------------------
login = Path("artifacts/fawri/src/pages/LoginPage.tsx")
replace_once(
    login,
    """  getMerchants,
  saveMerchants,
  setAdminSessionToken,
  setSession,
""",
    """  getAdminDeviceId,
  getAdminDeviceLabel,
  getMerchants,
  saveMerchants,
  setAdminSessionToken,
  setSession,
""",
    "login device imports",
)
replace_once(
    login,
    """  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab>('privacy');
""",
    """  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab>('privacy');
  const securityText = {
    ar: {
      approval: 'تم إرسال طلب اعتماد هذا الجهاز إلى المالك. لن يمكن الدخول حتى يمنح المالك الثقة للجهاز من صفحة مراقب العمل.',
      sessionLimit: 'تم بلوغ الحد الأقصى: جلستان مفتوحتان. يجب على المالك إنهاء إحدى الجلسات أولًا.',
      deviceRequired: 'تعذر التحقق من هوية الجهاز. أعد فتح المتصفح وحاول مرة أخرى.',
    },
    en: {
      approval: 'A device approval request was sent to the owner. Sign-in remains blocked until the owner trusts this device from Work Monitor.',
      sessionLimit: 'The two-session limit has been reached. The owner must terminate an existing session first.',
      deviceRequired: 'The device identity could not be verified. Reopen the browser and try again.',
    },
    ku: {
      approval: 'داواکاری متمانەپێکردنی ئەم ئامێرە بۆ خاوەنەکە نێردرا. تا خاوەنەکە لە چاودێری کار متمانەی پێ نەدات چوونەژوورەوە ڕێگەپێنەدراوە.',
      sessionLimit: 'سنووری دوو دانیشتن پڕ بووە. خاوەنەکە دەبێت یەکێک لە دانیشتنەکان کۆتایی پێبهێنێت.',
      deviceRequired: 'ناسنامەی ئامێرەکە پشتڕاست نەکرایەوە. وێبگەڕەکە دووبارە بکەرەوە.',
    },
  }[lang];
""",
    "login security translations",
)
replace_once(
    login,
    """        body: JSON.stringify({ phone: cleanPhone, password: cleanPassword }),
""",
    """        body: JSON.stringify({
          phone: cleanPhone,
          password: cleanPassword,
          device_id: getAdminDeviceId(),
          device_label: getAdminDeviceLabel(),
        }),
""",
    "login device body",
)
replace_once(
    login,
    """      if (!response.ok || !result?.ok || !result?.merchant) {
        toast.error(t.login_error_invalid);
        return;
      }
""",
    """      if (!response.ok || !result?.ok || !result?.merchant) {
        if (result?.code === 'ADMIN_DEVICE_APPROVAL_REQUIRED') {
          toast.error(securityText.approval, { duration: 9000 });
        } else if (result?.code === 'ADMIN_SESSION_LIMIT_REACHED') {
          toast.error(securityText.sessionLimit, { duration: 8000 });
        } else if (result?.code === 'ADMIN_DEVICE_ID_REQUIRED') {
          toast.error(securityText.deviceRequired);
        } else {
          toast.error(t.login_error_invalid);
        }
        return;
      }
""",
    "login security response",
)

# Mandatory password change must preserve device binding.
required_dialog = Path(
    "artifacts/fawri/src/components/admin/RequiredAdminPasswordChangeDialog.tsx"
)
replace_once(
    required_dialog,
    'import { setAdminSessionToken } from "@/lib/store";\n',
    'import { getAdminAuthHeaders, setAdminSessionToken } from "@/lib/store";\n',
    "required password device import",
)
replace_once(
    required_dialog,
    """        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("fawri_admin_session_token") || ""}`,
          "Content-Type": "application/json",
        },
""",
    """        headers: {
          ...getAdminAuthHeaders(),
          "Content-Type": "application/json",
        },
""",
    "required password tracked headers",
)

# -----------------------------------------------------------------------------
# Global administrator activity heartbeat
# -----------------------------------------------------------------------------
app = Path("artifacts/fawri/src/App.tsx")
replace_once(
    app,
    'import { initStore } from "@/lib/store";\n',
    'import { clearSession, getAdminAuthHeaders, getAdminSessionToken, initStore } from "@/lib/store";\n',
    "heartbeat store imports",
)
replace_once(
    app,
    'const AdminPage = lazy(() => import("@/pages/AdminPage"));\n',
    'const AdminPage = lazy(() => import("@/pages/AdminPage"));\nconst AdminWorkMonitorPage = lazy(() => import("@/pages/AdminWorkMonitorPage"));\n',
    "work monitor lazy page",
)
replace_once(
    app,
    """        <Route path="/admin">{() => <AdminPage />}</Route>
""",
    """        <Route path="/admin/work-monitor/:adminId">
          {(params) => <AdminWorkMonitorPage adminId={params.adminId} />}
        </Route>
        <Route path="/admin">{() => <AdminPage />}</Route>
""",
    "work monitor route",
)
replace_once(
    app,
    """function App() {
  useEffect(() => {
    initStore();
  }, []);
""",
    """function AdminActivityHeartbeat() {
  useEffect(() => {
    let activityPending = true;
    let stopped = false;

    const markActivity = () => {
      activityPending = true;
    };

    const sendHeartbeat = async () => {
      if (stopped || !getAdminSessionToken()) return;
      const activity = activityPending;
      activityPending = false;

      try {
        const response = await fetch('/api/auth/admin/session/heartbeat', {
          method: 'POST',
          headers: {
            ...getAdminAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ activity }),
        });
        if (response.status === 401) {
          clearSession();
          window.location.href = '/login';
        }
      } catch {
        // A temporary connection interruption must not destroy a valid session.
      }
    };

    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', markActivity);
    void sendHeartbeat();
    const timer = window.setInterval(() => void sendHeartbeat(), 30_000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', markActivity);
    };
  }, []);

  return null;
}

function App() {
  useEffect(() => {
    initStore();
  }, []);
""",
    "global administrator heartbeat",
)
replace_once(
    app,
    """        <TooltipProvider>
          <WouterRouter base={routerBase}>
""",
    """        <TooltipProvider>
          <AdminActivityHeartbeat />
          <WouterRouter base={routerBase}>
""",
    "heartbeat mount",
)

# -----------------------------------------------------------------------------
# Administrator cards: live state + work monitor button
# -----------------------------------------------------------------------------
admins_tab = Path(
    "artifacts/fawri/src/components/admin/AdministratorsTab.tsx"
)
replace_once(
    admins_tab,
    'import { useCallback, useEffect, useState } from "react";\n',
    'import { useCallback, useEffect, useState } from "react";\nimport { useLocation } from "wouter";\n',
    "administrator card routing import",
)
replace_once(
    admins_tab,
    """  CalendarDays,
  CheckCircle2,
""",
    """  Activity,
  CalendarDays,
  CheckCircle2,
""",
    "administrator activity icon",
)
replace_once(
    admins_tab,
    """  must_change_password: boolean;
}
""",
    """  must_change_password: boolean;
  work_status?: "active" | "idle" | "offline";
  open_session_count?: number;
  last_activity_at?: string | null;
  pending_device_count?: number;
}
""",
    "administrator work summary fields",
)
replace_once(
    admins_tab,
    """  const language = getInterfaceLanguage();
""",
    """  const language = getInterfaceLanguage();
  const [, setLocation] = useLocation();
""",
    "administrator card location",
)
replace_once(
    admins_tab,
    """  const administratorPasswordText = {
    ar: { button: "تغيير كلمة المرور", required: "بانتظار تغيير كلمة المرور" },
    en: { button: "Change password", required: "Password change pending" },
    ku: { button: "گۆڕینی وشەی نهێنی", required: "چاوەڕوانی گۆڕینی وشەی نهێنی" },
  }[language];
""",
    """  const administratorPasswordText = {
    ar: { button: "تغيير كلمة المرور", required: "بانتظار تغيير كلمة المرور" },
    en: { button: "Change password", required: "Password change pending" },
    ku: { button: "گۆڕینی وشەی نهێنی", required: "چاوەڕوانی گۆڕینی وشەی نهێنی" },
  }[language];

  const workMonitorText = {
    ar: {
      active: "نشط الآن",
      idle: "متصل لكنه خامل",
      offline: "غير متصل",
      button: "مراقب العمل",
      sessions: "الجلسات المفتوحة",
      pendingDevice: "جهاز بانتظار الموافقة",
      pendingDevices: "أجهزة بانتظار الموافقة",
    },
    en: {
      active: "Active now",
      idle: "Connected but idle",
      offline: "Offline",
      button: "Work Monitor",
      sessions: "Open sessions",
      pendingDevice: "device awaiting approval",
      pendingDevices: "devices awaiting approval",
    },
    ku: {
      active: "ئێستا چالاکە",
      idle: "پەیوەستە بەڵام ناچالاکە",
      offline: "پەیوەست نییە",
      button: "چاودێری کار",
      sessions: "دانیشتنە کراوەکان",
      pendingDevice: "ئامێرێک چاوەڕوانی پەسەندکردنە",
      pendingDevices: "ئامێر چاوەڕوانی پەسەندکردنن",
    },
  }[language];
""",
    "administrator work monitor translations",
)
replace_once(
    admins_tab,
    """  const loadAdministrators = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
""",
    """  const loadAdministrators = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setLoadError(false);
    }
""",
    "silent administrator status refresh start",
)
replace_once(
    admins_tab,
    """    } catch (error) {
      console.error("Administrators API load failed:", error);
      setAdministrators([]);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdministrators();
  }, [loadAdministrators]);
""",
    """    } catch (error) {
      console.error("Administrators API load failed:", error);
      if (!silent) {
        setAdministrators([]);
        setLoadError(true);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdministrators();
    const timer = window.setInterval(
      () => void loadAdministrators(true),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [loadAdministrators]);
""",
    "automatic administrator status refresh",
)
status_block = """                    {!isOwner && (
                      <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
"""
status_replacement = """                    {!isOwner && (
                      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span
                              className={
                                "h-3 w-3 shrink-0 rounded-full " +
                                (administrator.work_status === "active"
                                  ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]"
                                  : administrator.work_status === "idle"
                                    ? "bg-amber-500"
                                    : "bg-slate-400")
                              }
                              aria-hidden="true"
                            />
                            <span>
                              {administrator.work_status === "active"
                                ? workMonitorText.active
                                : administrator.work_status === "idle"
                                  ? workMonitorText.idle
                                  : workMonitorText.offline}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {workMonitorText.sessions}: {administrator.open_session_count ?? 0}
                          </p>
                          {(administrator.pending_device_count ?? 0) > 0 && (
                            <p className="mt-1 text-xs font-semibold text-orange-600">
                              {administrator.pending_device_count}{" "}
                              {(administrator.pending_device_count ?? 0) === 1
                                ? workMonitorText.pendingDevice
                                : workMonitorText.pendingDevices}
                            </p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2 sm:w-auto"
                          onClick={() =>
                            setLocation(`/admin/work-monitor/${administrator.id}`)
                          }
                        >
                          <Activity className="h-4 w-4" aria-hidden="true" />
                          {workMonitorText.button}
                          <Badge variant="secondary" className="ms-1 px-1.5 py-0">
                            {administrator.open_session_count ?? 0}
                          </Badge>
                        </Button>
                      </div>
                    )}

                    {!isOwner && (
                      <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
"""
replace_once(
    admins_tab,
    status_block,
    status_replacement,
    "administrator card work status row",
)

# -----------------------------------------------------------------------------
# Full owner-only Work Monitor page
# -----------------------------------------------------------------------------
monitor_page = Path("artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx")
monitor_page.write_text(r'''import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Laptop,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { getAdminAuthHeaders } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

type WorkStatus = "active" | "idle" | "offline";
type DeviceStatus = "pending" | "trusted" | "revoked";

type Session = {
  id: string;
  device_id: string;
  device_label: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  last_activity_at: string;
  expires_at: string;
};

type Device = {
  id: string;
  device_id: string;
  device_label: string;
  user_agent: string;
  status: DeviceStatus;
  first_seen_at: string;
  last_seen_at: string;
  trusted_at?: string;
};

type FailedLogin = {
  id: string;
  device_label?: string;
  created_at: string;
  reason: string;
};

type LogRecord = {
  id: string;
  action_type: string;
  details: string;
  created_at: string;
};

type MonitorResponse = {
  ok: boolean;
  admin?: {
    id: string;
    owner_name: string;
    phone: string;
    admin_enabled: boolean;
  };
  summary?: {
    work_status: WorkStatus;
    open_session_count: number;
    last_activity_at: string | null;
    pending_device_count: number;
    session_limit: number;
    trusted_device_limit: number;
    trusted_device_count: number;
    failed_login_count_24h: number;
  };
  sessions?: Session[];
  devices?: Device[];
  failed_logins?: FailedLogin[];
  recent_logs?: LogRecord[];
  error?: string;
  code?: string;
};

type SecurityAction =
  | { type: "trust"; device: Device }
  | { type: "revoke-device"; device: Device }
  | { type: "revoke-session"; session: Session }
  | { type: "revoke-all" };

function formatDate(value: string | null | undefined, lang: "ar" | "ku" | "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(
    lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(date);
}

function deviceIcon(label: string) {
  return /phone|mobile|android|iphone|ipad/i.test(label) ? Smartphone : Laptop;
}

export default function AdminWorkMonitorPage({ adminId }: { adminId: string }) {
  const { lang } = useI18n();
  const [, setLocation] = useLocation();
  const isRTL = lang !== "en";
  const text = useMemo(() => ({
    ar: {
      title: "مراقب العمل",
      subtitle: "مراقبة أمنية لجلسات المسؤول المساعد وأجهزته الموثوقة ونشاطه داخل فوري.",
      back: "العودة إلى المديرين",
      loading: "جارٍ تحميل بيانات المراقبة...",
      loadError: "تعذر تحميل بيانات مراقب العمل.",
      retry: "إعادة المحاولة",
      active: "نشط الآن",
      idle: "متصل لكنه خامل",
      offline: "غير متصل",
      sessions: "الجلسات المفتوحة",
      trustedDevices: "الأجهزة الموثوقة",
      pendingDevices: "طلبات الأجهزة الجديدة",
      failed24h: "محاولات دخول فاشلة خلال 24 ساعة",
      lastActivity: "آخر نشاط",
      securitySummary: "الملخص الأمني",
      sessionsTitle: "الجلسات المفتوحة",
      sessionsEmpty: "لا توجد جلسات مفتوحة لهذا المسؤول.",
      devicesTitle: "الأجهزة الموثوقة وطلبات الاعتماد",
      devicesEmpty: "لا توجد أجهزة مسجلة حتى الآن.",
      logsTitle: "آخر عمليات المسؤول",
      logsEmpty: "لا توجد عمليات مسجلة لهذا المسؤول.",
      loginAt: "تسجيل الدخول",
      lastSeen: "آخر اتصال",
      lastAction: "آخر حركة فعلية",
      expires: "انتهاء الجلسة",
      terminate: "إنهاء الجلسة",
      terminateAll: "إنهاء جميع الجلسات",
      trusted: "موثوق",
      pending: "بانتظار موافقة المالك",
      trust: "منح الثقة",
      reject: "رفض الطلب",
      revokeTrust: "سحب الثقة",
      firstSeen: "أول ظهور",
      confirmTitle: "تأكيد إجراء أمني",
      ownerPassword: "كلمة مرور المالك",
      confirmDescription: "يتطلب هذا الإجراء تأكيد كلمة مرور المالك، وسيُسجل في سجل الإدارة.",
      cancel: "إلغاء",
      confirm: "تأكيد التنفيذ",
      processing: "جارٍ التنفيذ...",
      passwordRequired: "أدخل كلمة مرور المالك.",
      wrongPassword: "كلمة مرور المالك غير صحيحة.",
      actionSuccess: "تم تنفيذ الإجراء الأمني بنجاح.",
      actionError: "تعذر تنفيذ الإجراء الأمني.",
      deviceLimit: "الحد الأقصى جهازان موثوقان.",
      sessionLimit: "الحد الأقصى جلستان مفتوحتان.",
      noFailed: "لا توجد محاولات دخول فاشلة حديثة.",
      recentFailures: "محاولات الدخول الفاشلة الحديثة",
      adminDisabled: "حساب المسؤول معطّل",
    },
    en: {
      title: "Work Monitor",
      subtitle: "Security monitoring for assistant administrator sessions, trusted devices, and activity inside Fawri.",
      back: "Back to administrators",
      loading: "Loading monitoring data...",
      loadError: "Could not load Work Monitor data.",
      retry: "Retry",
      active: "Active now",
      idle: "Connected but idle",
      offline: "Offline",
      sessions: "Open sessions",
      trustedDevices: "Trusted devices",
      pendingDevices: "New device requests",
      failed24h: "Failed sign-ins in 24 hours",
      lastActivity: "Last activity",
      securitySummary: "Security summary",
      sessionsTitle: "Open sessions",
      sessionsEmpty: "This administrator has no open sessions.",
      devicesTitle: "Trusted devices and approval requests",
      devicesEmpty: "No devices have been registered yet.",
      logsTitle: "Recent administrator actions",
      logsEmpty: "No actions are recorded for this administrator.",
      loginAt: "Signed in",
      lastSeen: "Last connection",
      lastAction: "Last active action",
      expires: "Session expires",
      terminate: "Terminate session",
      terminateAll: "Terminate all sessions",
      trusted: "Trusted",
      pending: "Awaiting owner approval",
      trust: "Trust device",
      reject: "Reject request",
      revokeTrust: "Revoke trust",
      firstSeen: "First seen",
      confirmTitle: "Confirm security action",
      ownerPassword: "Owner password",
      confirmDescription: "This action requires the owner password and will be recorded in the administration log.",
      cancel: "Cancel",
      confirm: "Confirm action",
      processing: "Processing...",
      passwordRequired: "Enter the owner password.",
      wrongPassword: "The owner password is incorrect.",
      actionSuccess: "The security action was completed successfully.",
      actionError: "The security action could not be completed.",
      deviceLimit: "Maximum: two trusted devices.",
      sessionLimit: "Maximum: two open sessions.",
      noFailed: "No recent failed sign-in attempts.",
      recentFailures: "Recent failed sign-in attempts",
      adminDisabled: "Administrator account disabled",
    },
    ku: {
      title: "چاودێری کار",
      subtitle: "چاودێری ئاسایشی دانیشتنەکان، ئامێرە متمانەپێکراوەکان و چالاکی بەڕێوەبەری یاریدەدەر لە فورى.",
      back: "گەڕانەوە بۆ بەڕێوەبەران",
      loading: "زانیارییەکانی چاودێری بار دەکرێن...",
      loadError: "زانیارییەکانی چاودێری کار بار نەکران.",
      retry: "هەوڵدانەوە",
      active: "ئێستا چالاکە",
      idle: "پەیوەستە بەڵام ناچالاکە",
      offline: "پەیوەست نییە",
      sessions: "دانیشتنە کراوەکان",
      trustedDevices: "ئامێرە متمانەپێکراوەکان",
      pendingDevices: "داواکارییەکانی ئامێری نوێ",
      failed24h: "هەوڵی چوونەژوورەوەی شکستخواردوو لە 24 کاتژمێر",
      lastActivity: "دوایین چالاکی",
      securitySummary: "پوختەی ئاسایش",
      sessionsTitle: "دانیشتنە کراوەکان",
      sessionsEmpty: "هیچ دانیشتنێکی کراوە نییە.",
      devicesTitle: "ئامێرە متمانەپێکراوەکان و داواکارییەکان",
      devicesEmpty: "هێشتا هیچ ئامێرێک تۆمار نەکراوە.",
      logsTitle: "دوایین کردارەکانی بەڕێوەبەر",
      logsEmpty: "هیچ کردارێک تۆمار نەکراوە.",
      loginAt: "چوونەژوورەوە",
      lastSeen: "دوایین پەیوەندی",
      lastAction: "دوایین جووڵەی ڕاستەقینە",
      expires: "کۆتایی دانیشتن",
      terminate: "کۆتاییهێنان بە دانیشتن",
      terminateAll: "کۆتاییهێنان بە هەموو دانیشتنەکان",
      trusted: "متمانەپێکراو",
      pending: "چاوەڕوانی پەسەندکردنی خاوەن",
      trust: "متمانەپێکردن",
      reject: "ڕەتکردنەوەی داواکاری",
      revokeTrust: "سڕینەوەی متمانە",
      firstSeen: "یەکەم دەرکەوتن",
      confirmTitle: "پشتڕاستکردنەوەی کردارێکی ئاسایشی",
      ownerPassword: "وشەی نهێنی خاوەن",
      confirmDescription: "ئەم کردارە وشەی نهێنی خاوەن پێویست دەکات و لە تۆماری بەڕێوەبردن تۆمار دەکرێت.",
      cancel: "هەڵوەشاندنەوە",
      confirm: "پشتڕاستکردنەوە",
      processing: "جێبەجێ دەکرێت...",
      passwordRequired: "وشەی نهێنی خاوەن بنووسە.",
      wrongPassword: "وشەی نهێنی خاوەن هەڵەیە.",
      actionSuccess: "کرداری ئاسایشی بە سەرکەوتوویی جێبەجێ کرا.",
      actionError: "کرداری ئاسایشی جێبەجێ نەکرا.",
      deviceLimit: "سنووری زۆرترین دوو ئامێری متمانەپێکراوە.",
      sessionLimit: "سنووری زۆرترین دوو دانیشتنی کراوەیە.",
      noFailed: "هیچ هەوڵی شکستخواردووی نوێ نییە.",
      recentFailures: "هەوڵە شکستخواردووە نوێیەکان",
      adminDisabled: "هەژماری بەڕێوەبەر ناچالاکە",
    },
  })[lang], [lang]);

  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<SecurityAction | null>(null);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [actionError, setActionError] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(
        `/api/auth/admins/${encodeURIComponent(adminId)}/work-monitor`,
        { headers: getAdminAuthHeaders() },
      );
      const result = (await response.json().catch(() => null)) as MonitorResponse | null;
      if (!response.ok || !result?.ok || !result.admin || !result.summary) {
        throw new Error(result?.error || "Could not load monitor");
      }
      setData(result);
      setLoadError(false);
    } catch (error) {
      console.error("Work monitor load failed:", error);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const closeAction = () => {
    if (processing) return;
    setAction(null);
    setOwnerPassword("");
    setActionError("");
  };

  const executeAction = async () => {
    if (!action || processing) return;
    if (!ownerPassword) {
      setActionError(text.passwordRequired);
      return;
    }
    setProcessing(true);
    setActionError("");

    let endpoint = "";
    if (action.type === "trust") {
      endpoint = `/api/auth/admins/${adminId}/devices/${encodeURIComponent(action.device.device_id)}/trust`;
    } else if (action.type === "revoke-device") {
      endpoint = `/api/auth/admins/${adminId}/devices/${encodeURIComponent(action.device.device_id)}/revoke`;
    } else if (action.type === "revoke-session") {
      endpoint = `/api/auth/admins/${adminId}/sessions/${encodeURIComponent(action.session.id)}/revoke`;
    } else {
      endpoint = `/api/auth/admins/${adminId}/sessions/revoke-all`;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...getAdminAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner_password: ownerPassword }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        if (result?.code === "OWNER_PASSWORD_INCORRECT") {
          setActionError(text.wrongPassword);
        } else if (result?.code === "ADMIN_TRUSTED_DEVICE_LIMIT_REACHED") {
          setActionError(text.deviceLimit);
        } else {
          setActionError(text.actionError);
        }
        return;
      }
      toast.success(text.actionSuccess);
      closeAction();
      await load(true);
    } catch (error) {
      console.error("Work monitor security action failed:", error);
      setActionError(text.actionError);
    } finally {
      setProcessing(false);
    }
  };

  const status = data?.summary?.work_status || "offline";
  const statusText = status === "active" ? text.active : status === "idle" ? text.idle : text.offline;
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <main className="min-h-[100dvh] bg-muted/30" dir={isRTL ? "rtl" : "ltr"}>
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">{text.title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{text.subtitle}</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 gap-2" onClick={() => setLocation("/admin")}>
            <BackIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{text.back}</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        {loading && (
          <Card><CardContent className="flex min-h-64 flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">{text.loading}</p>
          </CardContent></Card>
        )}

        {!loading && loadError && (
          <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <AlertTriangle className="h-9 w-9 text-destructive" />
            <p className="mt-4 font-semibold">{text.loadError}</p>
            <Button className="mt-4 gap-2" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />{text.retry}
            </Button>
          </CardContent></Card>
        )}

        {!loading && !loadError && data?.admin && data.summary && (
          <>
            <Card>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserRound className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{data.admin.owner_name}</h2>
                      {!data.admin.admin_enabled && <Badge variant="destructive">{text.adminDisabled}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground" dir="ltr">{data.admin.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold">
                  <span className={"h-3 w-3 rounded-full " + (status === "active" ? "bg-emerald-500" : status === "idle" ? "bg-amber-500" : "bg-slate-400")} />
                  {statusText}
                </div>
              </CardContent>
            </Card>

            <section>
              <h2 className="mb-3 text-lg font-bold">{text.securitySummary}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  [Activity, text.sessions, `${data.summary.open_session_count} / ${data.summary.session_limit}`],
                  [ShieldCheck, text.trustedDevices, `${data.summary.trusted_device_count} / ${data.summary.trusted_device_limit}`],
                  [Clock3, text.lastActivity, formatDate(data.summary.last_activity_at, lang)],
                  [AlertTriangle, text.pendingDevices, String(data.summary.pending_device_count)],
                  [ShieldOff, text.failed24h, String(data.summary.failed_login_count_24h)],
                ].map(([Icon, label, value]) => {
                  const SummaryIcon = Icon as typeof Activity;
                  return <Card key={String(label)}><CardContent className="p-4">
                    <SummaryIcon className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-xs text-muted-foreground">{String(label)}</p>
                    <p className="mt-1 text-base font-bold">{String(value)}</p>
                  </CardContent></Card>;
                })}
              </div>
            </section>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-lg">{text.sessionsTitle}</CardTitle>
                {(data.sessions?.length || 0) > 0 && (
                  <Button variant="destructive" size="sm" className="gap-2" onClick={() => setAction({ type: "revoke-all" })}>
                    <LogOut className="h-4 w-4" />{text.terminateAll}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {(data.sessions || []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{text.sessionsEmpty}</p>
                ) : data.sessions?.map((session) => {
                  const DeviceIcon = deviceIcon(session.device_label);
                  return <div key={session.id} className="rounded-xl border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <DeviceIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="font-semibold">{session.device_label}</p>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <span>{text.loginAt}: {formatDate(session.created_at, lang)}</span>
                            <span>{text.lastSeen}: {formatDate(session.last_seen_at, lang)}</span>
                            <span>{text.lastAction}: {formatDate(session.last_activity_at, lang)}</span>
                            <span>{text.expires}: {formatDate(session.expires_at, lang)}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAction({ type: "revoke-session", session })}>
                        <LogOut className="h-4 w-4" />{text.terminate}
                      </Button>
                    </div>
                  </div>;
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">{text.devicesTitle}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(data.devices || []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{text.devicesEmpty}</p>
                ) : data.devices?.map((device) => {
                  const DeviceIcon = deviceIcon(device.device_label);
                  return <div key={device.id} className="rounded-xl border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <DeviceIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{device.device_label}</p>
                            <Badge variant={device.status === "trusted" ? "default" : "outline"} className={device.status === "pending" ? "border-orange-300 bg-orange-50 text-orange-700" : ""}>
                              {device.status === "trusted" ? text.trusted : text.pending}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{text.firstSeen}: {formatDate(device.first_seen_at, lang)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{text.lastSeen}: {formatDate(device.last_seen_at, lang)}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {device.status === "pending" ? (
                          <>
                            <Button size="sm" className="gap-2" onClick={() => setAction({ type: "trust", device })}>
                              <CheckCircle2 className="h-4 w-4" />{text.trust}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAction({ type: "revoke-device", device })}>{text.reject}</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="destructive" className="gap-2" onClick={() => setAction({ type: "revoke-device", device })}>
                            <ShieldOff className="h-4 w-4" />{text.revokeTrust}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>;
                })}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-lg">{text.recentFailures}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(data.failed_logins || []).length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{text.noFailed}</p>
                  ) : data.failed_logins?.map((attempt) => (
                    <div key={attempt.id} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-semibold">{attempt.device_label || "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(attempt.created_at, lang)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">{text.logsTitle}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(data.recent_logs || []).length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{text.logsEmpty}</p>
                  ) : data.recent_logs?.slice(0, 15).map((log) => (
                    <div key={log.id} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-semibold">{log.details || log.action_type}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(log.created_at, lang)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) closeAction(); }}>
        <DialogContent dir={isRTL ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader className={isRTL ? "text-right sm:!text-right" : "text-left"}>
            <DialogTitle>{text.confirmTitle}</DialogTitle>
            <DialogDescription>{text.confirmDescription}</DialogDescription>
          </DialogHeader>
          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="work-monitor-owner-password" className={lang === "ar" ? "block leading-6" : undefined}>{text.ownerPassword}</Label>
            <PasswordInput
              id="work-monitor-owner-password"
              value={ownerPassword}
              disabled={processing}
              dir="ltr"
              autoComplete="current-password"
              onChange={(event) => { setOwnerPassword(event.target.value); setActionError(""); }}
            />
          </div>
          {actionError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={processing} onClick={closeAction}>{text.cancel}</Button>
            <Button type="button" disabled={processing || !ownerPassword} onClick={() => void executeAction()}>
              {processing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {processing ? text.processing : text.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
''')

print("Admin work monitor frontend applied.")
