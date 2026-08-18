import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Coins,
  Database,
  Gauge,
  Headphones,
  Loader2,
  MessageCircle,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  Users,
  Wifi,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminAuthHeaders } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { ADMIN_EARLY_WARNING_PAGE_TEXT } from "@/lib/translations/features/pages/AdminEarlyWarningPage";

type WindowKey = "1h" | "24h" | "7d" | "30d";
type Health = "healthy" | "warning" | "critical" | "unknown";
type Coverage = "available" | "partial" | "not_instrumented";

type Incident = {
  id: string;
  severity: "warning" | "critical";
  area: string;
  code: string;
  value: number;
  runbook: string;
};

type MerchantHealth = {
  merchant_id: string;
  store_name: string;
  merchant_status: string;
  account_status: string;
  health: Health;
  connected_channels: number;
  recent_channel_errors: number;
  messages: number;
  failed_messages: number;
  jobs: number;
  failed_jobs: number;
  dead_letter_jobs: number;
  uncertain_deliveries: number;
  refund_conflicts: number;
  open_support_tickets: number;
  ai_recorded_tokens: number;
  ai_runtime_calls?: number;
  ai_runtime_input_tokens?: number;
  ai_runtime_output_tokens?: number;
  ai_runtime_total_tokens?: number;
};

type Snapshot = {
  authority: "postgresql";
  generated_at: string;
  window: WindowKey;
  window_started_at: string;
  database_latency_ms: number;
  overall_health: Health;
  incidents: Incident[];
  queue: {
    ready: number;
    processing: number;
    dead_letter: number;
    oldest_ready_age_seconds: number;
    failed_in_window: number;
    dangerous_failures_in_window: number;
  };
  channels: {
    connected: number;
    non_connected: number;
    recent_errors: number;
    expiring_credentials_7d: number;
    latest_webhook_at: string | null;
  };
  messaging: {
    inbound_events: number;
    messages: number;
    customer_messages: number;
    fawri_messages: number;
    failed_messages: number;
    outbound_sent: number;
    outbound_confirmed_failed: number;
    outbound_uncertain: number;
    outbound_stuck_pending: number;
    outbound_p95_latency_ms: number | null;
  };
  bot_quality: {
    knowledge_decisions: number;
    successful_decisions: number;
    handoffs: number;
    rejected_decisions: number;
    prompt_injection_blocks: number;
    expected_suppressions: number;
    dangerous_guardrail_events: number;
  };
  credits: {
    debits: number;
    credits: number;
    debit_amount: number;
    credit_amount: number;
    stale_reservations: number;
    pending_refunds: number;
    refund_conflicts: number;
  };
  support: {
    open_tickets: number;
    created_in_window: number;
    waiting_on_admin: number;
    attachment_bytes_in_window: number;
    local_filesystem_attachments: number;
  };
  ai_usage: {
    coverage: Coverage;
    recorded_calls: number;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  };
  ai_runtime: {
    coverage: "current_process";
    process_started_at: string;
    retained_events: number;
    capped: boolean;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    average_latency_ms: number | null;
    providers: Array<{
      provider_id: string;
      model: string;
      calls: number;
      total_tokens: number;
    }>;
  };
  http: {
    coverage: "current_process";
    process_started_at: string;
    retained_events: number;
    capped: boolean;
    requests: number;
    rejected: number;
    errors: number;
    error_rate: number | null;
    p50_latency_ms: number | null;
    p95_latency_ms: number | null;
    p99_latency_ms: number | null;
    request_bytes: number | null;
    response_bytes: number | null;
    by_operation: Array<{
      operation: string;
      requests: number;
      errors: number;
      p95_latency_ms: number | null;
    }>;
  };
  data_usage: {
    support_attachment_bytes: number;
    tracked_message_text_bytes: number;
    database_storage_bytes: null;
    network_transfer_bytes: null;
  };
  coverage: Array<{
    id: string;
    coverage: Coverage;
    note: string;
  }>;
  merchants: MerchantHealth[];
};

type ApiResponse = {
  ok?: boolean;
  snapshot?: Snapshot;
  code?: string;
  error?: string;
};

function healthClass(health: Health): string {
  if (health === "critical") return "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100";
  if (health === "warning") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100";
  if (health === "healthy") return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100";
  return "border-border bg-muted/40 text-muted-foreground";
}

function HealthIcon({ health, className = "h-5 w-5" }: { health: Health; className?: string }) {
  if (health === "critical") return <XCircle className={className} />;
  if (health === "warning") return <AlertTriangle className={className} />;
  if (health === "healthy") return <CheckCircle2 className={className} />;
  return <Gauge className={className} />;
}

function metricValue(value: number | null | undefined, unavailable: string, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return unavailable;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
}

function byteValue(value: number | null | undefined, unavailable: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return unavailable;
  if (value < 1024) return `${value.toLocaleString("en-US")} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon className="h-5 w-5 text-primary" />
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-lg font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminEarlyWarningPage() {
  const { lang } = useI18n();
  const text = ADMIN_EARLY_WARNING_PAGE_TEXT[lang];
  const [, setLocation] = useLocation();
  const [windowKey, setWindowKey] = useState<WindowKey>("1h");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const isRtl = lang !== "en";
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const response = await fetch(`/api/auth/admin/early-warning?window=${windowKey}`, {
          headers: getAdminAuthHeaders(),
          credentials: "same-origin",
          cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok || !result?.ok || !result.snapshot) {
          throw new Error(result?.code || "EARLY_WARNING_UNAVAILABLE");
        }
        setSnapshot(result.snapshot);
        setLoadError(false);
      } catch (error) {
        console.error("Early warning dashboard load failed:", error);
        if (!silent) setLoadError(true);
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [windowKey],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const healthLabel = useCallback(
    (health: Health) =>
      health === "healthy"
        ? text.healthy
        : health === "warning"
          ? text.warning
          : health === "critical"
            ? text.critical
            : text.unknown,
    [text],
  );

  const coverageLabel = useCallback(
    (coverage: Coverage) =>
      coverage === "available"
        ? text.available
        : coverage === "partial"
          ? text.partial
          : text.notInstrumented,
    [text],
  );

  const sortedMerchants = useMemo(() => {
    const rank: Record<Health, number> = { critical: 0, warning: 1, healthy: 2, unknown: 3 };
    return [...(snapshot?.merchants || [])].sort(
      (left, right) =>
        rank[left.health] - rank[right.health] || left.store_name.localeCompare(right.store_name),
    );
  }, [snapshot]);

  return (
    <main className="min-h-[100dvh] bg-muted/30" dir={isRtl ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-black sm:text-2xl">{text.title}</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{text.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">{text.refresh}</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/admin")}>
              <BackIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{text.back}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            <span>{text.window}</span>
          </div>
          <div className="flex overflow-hidden rounded-lg border bg-card">
            {(["1h", "24h", "7d", "30d"] as WindowKey[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setWindowKey(item)}
                className={`px-3 py-2 text-xs font-bold transition-colors sm:px-4 ${
                  windowKey === item ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex min-h-72 flex-col items-center justify-center">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">{text.loading}</p>
            </CardContent>
          </Card>
        )}

        {!loading && loadError && (
          <Card>
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="mt-4 font-semibold">{text.loadError}</p>
              <Button className="mt-4 gap-2" variant="outline" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
                {text.retry}
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && snapshot && (
          <>
            <Card className={healthClass(snapshot.overall_health)}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-background/60">
                    <HealthIcon health={snapshot.overall_health} className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold opacity-80">{text.systemHealth}</p>
                    <p className="mt-1 text-2xl font-black">{healthLabel(snapshot.overall_health)}</p>
                  </div>
                </div>
                <div className="text-sm opacity-80">
                  {text.lastUpdated}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(snapshot.generated_at))}
                </div>
              </CardContent>
            </Card>

            <Section title={text.activeIncidents}>
              {snapshot.incidents.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    {text.noIncidents}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {snapshot.incidents.map((incident) => (
                    <Card key={incident.id} className={healthClass(incident.severity === "critical" ? "critical" : "warning")}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold" dir="ltr">{incident.code}</p>
                            <p className="mt-1 text-xs opacity-75">{incident.area}</p>
                          </div>
                          <span className="rounded-full border px-2 py-1 text-xs font-bold">
                            {incident.severity === "critical" ? text.critical : text.warning}
                          </span>
                        </div>
                        <p className="mt-3 text-sm tabular-nums">{text.value}: {incident.value.toLocaleString("en-US")}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </Section>

            <Section title={text.api}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label={text.requests} value={snapshot.http.requests} icon={Network} />
                <MetricCard label={text.errors} value={snapshot.http.errors} icon={AlertTriangle} />
                <MetricCard label={text.p95} value={metricValue(snapshot.http.p95_latency_ms, text.unavailable, " ms")} icon={Gauge} />
                <MetricCard label={text.p99} value={metricValue(snapshot.http.p99_latency_ms, text.unavailable, " ms")} icon={Activity} />
              </div>
              <Card>
                <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div><span className="text-muted-foreground">{text.rejected}</span><p className="mt-1 font-bold tabular-nums">{snapshot.http.rejected}</p></div>
                  <div><span className="text-muted-foreground">{text.errorRate}</span><p className="mt-1 font-bold tabular-nums">{snapshot.http.error_rate === null ? text.unavailable : `${(snapshot.http.error_rate * 100).toFixed(2)}%`}</p></div>
                  <div><span className="text-muted-foreground">{text.p50}</span><p className="mt-1 font-bold tabular-nums">{metricValue(snapshot.http.p50_latency_ms, text.unavailable, " ms")}</p></div>
                  <div><span className="text-muted-foreground">{text.currentProcess}</span><p className="mt-1 font-bold">{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.http.process_started_at))}</p></div>
                  <div><span className="text-muted-foreground">{text.dataUsage}</span><p className="mt-1 font-bold">{byteValue((snapshot.http.request_bytes ?? 0) + (snapshot.http.response_bytes ?? 0), text.unavailable)}</p></div>
                </CardContent>
              </Card>
              <p className="text-xs leading-5 text-muted-foreground">{text.currentProcessNotice}</p>
            </Section>

            <div className="grid gap-5 xl:grid-cols-2">
              <Section title={text.database}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard label={text.databaseSnapshotLatency} value={`${snapshot.database_latency_ms.toLocaleString("en-US")} ms`} icon={Database} />
                  <MetricCard label={text.oldestReady} value={`${Math.round(snapshot.queue.oldest_ready_age_seconds).toLocaleString("en-US")} ${text.seconds}`} icon={Clock3} />
                </div>
              </Section>

              <Section title={text.queue}>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <MetricCard label={text.readyJobs} value={snapshot.queue.ready} icon={Server} />
                  <MetricCard label={text.processingJobs} value={snapshot.queue.processing} icon={Activity} />
                  <MetricCard label={text.deadLetter} value={snapshot.queue.dead_letter} icon={AlertTriangle} />
                  <MetricCard label={text.failedJobs} value={snapshot.queue.failed_in_window} icon={XCircle} />
                </div>
              </Section>
            </div>

            <Section title={text.channels}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label={text.connectedChannels} value={snapshot.channels.connected} icon={Wifi} />
                <MetricCard label={text.nonConnectedChannels} value={snapshot.channels.non_connected} icon={Network} />
                <MetricCard label={text.channelErrors} value={snapshot.channels.recent_errors} icon={AlertTriangle} />
                <MetricCard label={text.expiringCredentials} value={snapshot.channels.expiring_credentials_7d} icon={ShieldAlert} />
                <MetricCard label={text.latestWebhook} value={snapshot.channels.latest_webhook_at ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.channels.latest_webhook_at)) : text.unavailable} icon={Clock3} />
              </div>
            </Section>

            <Section title={text.messaging}>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                <MetricCard label={text.inboundEvents} value={snapshot.messaging.inbound_events} icon={MessageCircle} />
                <MetricCard label={text.messages} value={snapshot.messaging.messages} icon={MessageCircle} />
                <MetricCard label={text.failedMessages} value={snapshot.messaging.failed_messages} icon={XCircle} />
                <MetricCard label={text.sent} value={snapshot.messaging.outbound_sent} icon={CheckCircle2} />
                <MetricCard label={text.confirmedFailed} value={snapshot.messaging.outbound_confirmed_failed} icon={XCircle} />
                <MetricCard label={text.uncertain} value={snapshot.messaging.outbound_uncertain} icon={AlertTriangle} />
                <MetricCard label={text.stuckPending} value={snapshot.messaging.outbound_stuck_pending} icon={Clock3} />
                <MetricCard label={text.deliveryP95} value={metricValue(snapshot.messaging.outbound_p95_latency_ms, text.unavailable, " ms")} icon={Gauge} />
              </div>
            </Section>

            <Section title={text.botQuality}>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                <MetricCard label={text.decisions} value={snapshot.bot_quality.knowledge_decisions} icon={Bot} />
                <MetricCard label={text.successfulDecisions} value={snapshot.bot_quality.successful_decisions} icon={CheckCircle2} />
                <MetricCard label={text.handoffs} value={snapshot.bot_quality.handoffs} icon={Users} />
                <MetricCard label={text.rejectedDecisions} value={snapshot.bot_quality.rejected_decisions} icon={AlertTriangle} />
                <MetricCard label={text.injectionBlocks} value={snapshot.bot_quality.prompt_injection_blocks} icon={ShieldAlert} />
                <MetricCard label={text.dangerousGuardrails} value={snapshot.bot_quality.dangerous_guardrail_events} icon={XCircle} />
              </div>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4 text-sm">
                  <span className="text-muted-foreground">{text.expectedSuppressions}</span>
                  <strong className="tabular-nums">{snapshot.bot_quality.expected_suppressions.toLocaleString("en-US")}</strong>
                </CardContent>
              </Card>
            </Section>

            <Section title={text.ai}>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard label={text.aiCalls} value={snapshot.ai_runtime.calls} icon={Bot} />
                <MetricCard label={text.inputTokens} value={snapshot.ai_runtime.input_tokens} icon={Activity} />
                <MetricCard label={text.outputTokens} value={snapshot.ai_runtime.output_tokens} icon={Activity} />
                <MetricCard label={text.totalTokens} value={snapshot.ai_runtime.total_tokens} icon={Gauge} />
                <MetricCard label={text.averageAiLatency} value={metricValue(snapshot.ai_runtime.average_latency_ms, text.unavailable, " ms")} icon={Clock3} />
              </div>
              <Card>
                <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3">
                  <div><span className="text-muted-foreground">{text.currentProcess}</span><p className="mt-1 font-bold">{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.ai_runtime.process_started_at))}</p></div>
                  <div><span className="text-muted-foreground">{text.historicAi}</span><p className="mt-1 font-bold tabular-nums">{metricValue(snapshot.ai_usage.total_tokens, text.unavailable)}</p></div>
                  <div><span className="text-muted-foreground">{text.coverage}</span><p className="mt-1 font-bold">{coverageLabel(snapshot.ai_usage.coverage)}</p></div>
                </CardContent>
              </Card>
            </Section>

            <div className="grid gap-5 xl:grid-cols-2">
              <Section title={text.credits}>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  <MetricCard label={text.debits} value={snapshot.credits.debits} icon={Coins} />
                  <MetricCard label={text.creditsCount} value={snapshot.credits.credits} icon={Coins} />
                  <MetricCard label={text.staleReservations} value={snapshot.credits.stale_reservations} icon={Clock3} />
                  <MetricCard label={text.pendingRefunds} value={snapshot.credits.pending_refunds} icon={Clock3} />
                  <MetricCard label={text.refundConflicts} value={snapshot.credits.refund_conflicts} icon={AlertTriangle} />
                </div>
              </Section>

              <Section title={text.support}>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <MetricCard label={text.openTickets} value={snapshot.support.open_tickets} icon={Headphones} />
                  <MetricCard label={text.waitingAdmin} value={snapshot.support.waiting_on_admin} icon={Clock3} />
                  <MetricCard label={text.attachmentBytes} value={byteValue(snapshot.support.attachment_bytes_in_window, text.unavailable)} icon={Database} />
                  <MetricCard label={text.filesystemAttachments} value={snapshot.support.local_filesystem_attachments} icon={AlertTriangle} />
                </div>
              </Section>
            </div>

            <Section title={text.dataUsage}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label={text.attachmentBytes} value={byteValue(snapshot.data_usage.support_attachment_bytes, text.unavailable)} icon={Database} />
                <MetricCard label={text.messageTextBytes} value={byteValue(snapshot.data_usage.tracked_message_text_bytes, text.unavailable)} icon={MessageCircle} />
                <MetricCard label={text.databaseStorage} value={text.unavailable} icon={Database} />
                <MetricCard label={text.networkTransfer} value={text.unavailable} icon={Network} />
              </div>
            </Section>

            <Section title={text.coverage}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {snapshot.coverage.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm" dir="ltr">{item.id}</strong>
                        <span className={`rounded-full border px-2 py-1 text-xs font-bold ${
                          item.coverage === "available"
                            ? healthClass("healthy")
                            : item.coverage === "partial"
                              ? healthClass("warning")
                              : healthClass("unknown")
                        }`}>
                          {coverageLabel(item.coverage)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.note}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </Section>

            <Section title={text.merchantHealth}>
              {sortedMerchants.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{text.noMerchants}</CardContent></Card>
              ) : (
                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-semibold">{text.merchant}</th>
                          <th className="px-4 py-3 text-start font-semibold">{text.health}</th>
                          <th className="px-4 py-3 text-center font-semibold">{text.merchantChannels}</th>
                          <th className="px-4 py-3 text-center font-semibold">{text.merchantMessages}</th>
                          <th className="px-4 py-3 text-center font-semibold">{text.merchantFailures}</th>
                          <th className="px-4 py-3 text-center font-semibold">{text.merchantTokens}</th>
                          <th className="px-4 py-3 text-center font-semibold">{text.merchantSupport}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sortedMerchants.map((merchant) => {
                          const failureTotal = merchant.failed_messages + merchant.failed_jobs + merchant.dead_letter_jobs + merchant.uncertain_deliveries + merchant.refund_conflicts;
                          const tokens = (merchant.ai_runtime_total_tokens || 0) + merchant.ai_recorded_tokens;
                          return (
                            <tr key={merchant.merchant_id} className="hover:bg-muted/30">
                              <td className="px-4 py-3">
                                <p className="font-bold">{merchant.store_name || merchant.merchant_id}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{merchant.merchant_id}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-bold ${healthClass(merchant.health)}`}>
                                  <HealthIcon health={merchant.health} className="h-3.5 w-3.5" />
                                  {healthLabel(merchant.health)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center tabular-nums">{merchant.connected_channels}</td>
                              <td className="px-4 py-3 text-center tabular-nums">{merchant.messages}</td>
                              <td className="px-4 py-3 text-center tabular-nums">{failureTotal}</td>
                              <td className="px-4 py-3 text-center tabular-nums">{tokens}</td>
                              <td className="px-4 py-3 text-center tabular-nums">{merchant.open_support_tickets}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}
