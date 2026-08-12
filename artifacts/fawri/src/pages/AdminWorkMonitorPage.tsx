import {
  ADMIN_WORK_MONITOR_PAGE_LOG_LABELS,
  ADMIN_WORK_MONITOR_PAGE_TEXT,
} from '@/lib/translations/features/pages/AdminWorkMonitorPage';
import { useCallback, useEffect, useState } from "react";
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
  merchant_name?: string;
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

type InterfaceLanguage = "ar" | "ku" | "en";

const LOG_LABELS: Record<InterfaceLanguage, Record<string, string>> = ADMIN_WORK_MONITOR_PAGE_LOG_LABELS;

function logLabel(log: LogRecord, lang: InterfaceLanguage): string {
  const known = LOG_LABELS[lang][log.action_type];
  if (known) return known;
  if (lang === "en") return log.details || log.action_type.replace(/_/g, " ");
  return lang === "ku" ? "کردارێکی بەڕێوەبردن تۆمار کرا" : "تم تسجيل عملية إدارية";
}

function formatLimitCount(
  current: number,
  limit: number,
  lang: InterfaceLanguage,
): string {
  const currentNumber = `\u2066${current}\u2069`;
  const limitNumber = `\u2066${limit}\u2069`;

  if (lang === "en") return `${currentNumber} of ${limitNumber}`;
  if (lang === "ku") return `${currentNumber} لە ${limitNumber}`;
  return `${currentNumber} من ${limitNumber}`;
}

export default function AdminWorkMonitorPage({ adminId }: { adminId: string }) {
  const { lang } = useI18n();
  const [, setLocation] = useLocation();
  const isRTL = lang !== "en";
  const text = ADMIN_WORK_MONITOR_PAGE_TEXT[lang];

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
                  [
                    Activity,
                    text.sessions,
                    formatLimitCount(
                      data.summary.open_session_count,
                      data.summary.session_limit,
                      lang,
                    ),
                  ],
                  [
                    ShieldCheck,
                    text.trustedDevices,
                    formatLimitCount(
                      data.summary.trusted_device_count,
                      data.summary.trusted_device_limit,
                      lang,
                    ),
                  ],
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
                      <p className="font-semibold">{logLabel(log, lang)}</p>
                      {log.merchant_name && <p className="mt-1 text-xs text-muted-foreground">{log.merchant_name}</p>}
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
        <DialogContent
          dir={isRTL ? "rtl" : "ltr"}
          closeButtonClassName={isRTL ? "left-5 right-auto top-5" : "left-auto right-5 top-5"}
          className="w-[calc(100%-1.5rem)] max-w-xl gap-0 overflow-hidden rounded-2xl border bg-background p-0 shadow-2xl sm:w-full"
        >
          <div className="space-y-6 px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
            <DialogHeader className="space-y-0 pe-14 text-start sm:!text-start">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1.5 pt-0.5">
                  <DialogTitle className="text-xl leading-8">{text.confirmTitle}</DialogTitle>
                  <DialogDescription className="max-w-md text-sm leading-6">
                    {text.confirmDescription}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-xl border bg-muted/20 p-4 sm:p-5">
              <div className="space-y-2.5">
                <Label htmlFor="work-monitor-owner-password" className="block text-sm font-semibold leading-6">
                  {text.ownerPassword}
                </Label>
                <PasswordInput
                  id="work-monitor-owner-password"
                  value={ownerPassword}
                  disabled={processing}
                  dir="ltr"
                  autoComplete="current-password"
                  className="h-12 bg-background text-base"
                  onChange={(event) => { setOwnerPassword(event.target.value); setActionError(""); }}
                />
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                {actionError}
              </div>
            )}
          </div>

          <div className="border-t bg-muted/20 px-5 py-4 sm:px-8 sm:py-5">
            <div dir="ltr" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="order-2 h-11 w-full sm:order-1"
                disabled={processing}
                onClick={closeAction}
              >
                {text.cancel}
              </Button>
              <Button
                type="button"
                className="order-1 h-11 w-full disabled:bg-primary/45 disabled:text-primary-foreground/90 disabled:opacity-100 sm:order-2"
                disabled={processing || !ownerPassword}
                onClick={() => void executeAction()}
              >
                {processing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {processing ? text.processing : text.confirm}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
