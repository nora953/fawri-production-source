import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coins,
  Columns2,
  Database,
  Gauge,
  Grid2X2,
  HardDrive,
  Headphones,
  KeyRound,
  LayoutGrid,
  Loader2,
  Maximize2,
  MessageCircle,
  Minus,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  Square,
  Users,
  WalletCards,
  Wifi,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  earlyWarningCoverageLabel,
  earlyWarningCoverageNote,
  earlyWarningIncidentAreaLabel,
  earlyWarningIncidentLabel,
} from "@/lib/earlyWarningCoverageCopy";
import { useI18n } from "@/lib/i18n";
import { getAdminAuthHeaders } from "@/lib/store";
import { ADMIN_EARLY_WARNING_PAGE_TEXT } from "@/lib/translations/features/pages/AdminEarlyWarningPage";

type WindowKey = "1h" | "24h" | "7d" | "30d";
type Health = "healthy" | "warning" | "critical" | "unknown";
type Coverage = "available" | "partial" | "not_instrumented";
type IncidentStatus = "active" | "resolved";
type IncidentScope = "system" | "merchant";
type PanelKey =
  | "incidents"
  | "api"
  | "database"
  | "queue"
  | "channels"
  | "messaging"
  | "bot"
  | "ai"
  | "costs"
  | "credits"
  | "support"
  | "data"
  | "coverage"
  | "merchants";

type Incident = {
  id: string;
  severity: "warning" | "critical";
  area: string;
  code: string;
  value: number;
  runbook: string;
  scope?: IncidentScope;
  merchant_id?: string | null;
  merchant_name?: string | null;
};

type IncidentHistoryItem = {
  episode_id: string;
  incident_key: string;
  severity: "warning" | "critical";
  area: string;
  code: string;
  value: number;
  runbook: string;
  scope: IncidentScope;
  merchant_id: string | null;
  merchant_name: string | null;
  status: IncidentStatus;
  started_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  duration_seconds: number;
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
  ai_runtime_failed_calls?: number;
  ai_runtime_input_tokens?: number;
  ai_runtime_output_tokens?: number;
  ai_runtime_total_tokens?: number;
};

type CostReport = {
  currency: "USD";
  month: string;
  month_started_at: string;
  generated_at: string;
  actual_billing_connected: false;
  pricing_status: "unconfigured" | "partial" | "configured";
  pricing_coverage_percent: number;
  rates: {
    ai_input_per_1m_usd: number | null;
    ai_output_per_1m_usd: number | null;
    outbound_message_per_1000_usd: number | null;
    support_storage_per_gb_month_usd: number | null;
  };
  unpriced_services: string[];
  known_monthly_cost_usd: number | null;
  projected_month_end_cost_usd: number | null;
  usage: {
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_total_tokens: number;
    outbound_messages: number;
    support_storage_bytes: number;
    attachments_created_bytes: number;
  };
  services: Array<{
    id: "ai_input" | "ai_output" | "outbound_messages" | "support_storage";
    usage: number;
    unit: string;
    rate_usd: number | null;
    known_cost_usd: number | null;
  }>;
  merchants: Array<{
    merchant_id: string;
    store_name: string;
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_total_tokens: number;
    outbound_messages: number;
    support_storage_bytes: number;
    attachments_created_bytes: number;
    known_cost_usd: number | null;
  }>;
  daily: Array<{
    date: string;
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_total_tokens: number;
    outbound_messages: number;
    known_variable_cost_usd: number | null;
  }>;
};

type Snapshot = {
  authority: "postgresql";
  generated_at: string;
  window: WindowKey;
  window_started_at: string;
  database_latency_ms: number;
  overall_health: Health;
  incidents: Incident[];
  incident_history_status?: "available" | "unavailable";
  incident_history?: IncidentHistoryItem[];
  cost_report_status?: "available" | "unavailable";
  cost_report?: CostReport | null;
  merchant_health_visible?: boolean;
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
    successful_calls?: number;
    failed_calls?: number;
    timeouts?: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    average_latency_ms: number | null;
    error_rate?: number | null;
    providers: Array<{
      provider_id: string;
      model: string;
      calls: number;
      failed_calls?: number;
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

type WorkspaceCopy = {
  openSection: string;
  layout: string;
  onePanel: string;
  twoPanels: string;
  fourPanels: string;
  emptyWorkspace: string;
  emptyWorkspaceHint: string;
  minimized: string;
  restore: string;
  minimize: string;
  maximize: string;
  close: string;
  alerts: string;
  active: string;
  resolved: string;
  all: string;
  general: string;
  merchant: string;
  started: string;
  resolvedAt: string;
  duration: string;
  ongoing: string;
  historyUnavailable: string;
  scope: string;
  status: string;
  severity: string;
  affectedMerchants: string;
  monthlyKnownCost: string;
  projectedCost: string;
  pricingCoverage: string;
  pricingUnavailable: string;
  pricingPartial: string;
  billingNotice: string;
  usageOnly: string;
  dailyCost: string;
  dailyTokens: string;
  serviceBreakdown: string;
  merchantBreakdown: string;
  knownCost: string;
  outboundMessages: string;
  storage: string;
  rate: string;
  unpriced: string;
  costReportUnavailable: string;
  currentMonth: string;
};

const WORKSPACE_COPY: Record<"ar" | "ku" | "en", WorkspaceCopy> = {
  ar: {
    openSection: "فتح قسم",
    layout: "تخطيط النوافذ",
    onePanel: "نافذة واحدة",
    twoPanels: "نافذتان",
    fourPanels: "أربع نوافذ",
    emptyWorkspace: "مساحة المراقبة فارغة",
    emptyWorkspaceHint: "افتح قسمًا من القائمة أعلاه لبدء المراقبة.",
    minimized: "النوافذ المصغّرة",
    restore: "استعادة",
    minimize: "تصغير",
    maximize: "تكبير",
    close: "إغلاق",
    alerts: "مركز التحذيرات",
    active: "مستمر",
    resolved: "تمت المعالجة",
    all: "الكل",
    general: "عام — فوري",
    merchant: "متجر",
    started: "بدأ",
    resolvedAt: "تمت المعالجة",
    duration: "المدة",
    ongoing: "مستمر الآن",
    historyUnavailable: "سجل دورة حياة التحذيرات غير متاح حاليًا؛ ما زالت التحذيرات اللحظية ظاهرة.",
    scope: "النطاق",
    status: "الحالة",
    severity: "الخطورة",
    affectedMerchants: "متاجر متأثرة",
    monthlyKnownCost: "التكلفة المعروفة هذا الشهر",
    projectedCost: "المتوقع لنهاية الشهر",
    pricingCoverage: "تغطية التسعير",
    pricingUnavailable: "لم يتم ضبط أسعار الخدمات بعد؛ تعرض اللوحة الاستهلاك الحقيقي فقط ولا تفترض تكلفة.",
    pricingPartial: "بعض الخدمات فقط لها أسعار مضبوطة؛ الإجماليات المعروضة لا تشمل الخدمات غير المسعّرة.",
    billingNotice: "لا يوجد ربط مباشر بفواتير مزودي الخدمات بعد؛ التكلفة المعروفة محسوبة فقط من أسعار تشغيل مضبوطة صراحة.",
    usageOnly: "استهلاك فقط",
    dailyCost: "التكلفة اليومية المعروفة",
    dailyTokens: "استهلاك التوكن اليومي",
    serviceBreakdown: "تفصيل الخدمات",
    merchantBreakdown: "تفصيل المتاجر",
    knownCost: "تكلفة معروفة",
    outboundMessages: "رسائل صادرة",
    storage: "تخزين الدعم",
    rate: "السعر المضبوط",
    unpriced: "غير مسعّر",
    costReportUnavailable: "تعذر تحميل تقرير الاستهلاك والتكاليف.",
    currentMonth: "الشهر الحالي",
  },
  ku: {
    openSection: "کردنەوەی بەش",
    layout: "ڕێکخستنی پەنجەرەکان",
    onePanel: "یەک پەنجەرە",
    twoPanels: "دوو پەنجەرە",
    fourPanels: "چوار پەنجەرە",
    emptyWorkspace: "شوێنی چاودێری بەتاڵە",
    emptyWorkspaceHint: "بەشێک لە لیستەکە بکەرەوە بۆ دەستپێکردنی چاودێری.",
    minimized: "پەنجەرە بچووککراوەکان",
    restore: "گەڕاندنەوە",
    minimize: "بچووککردنەوە",
    maximize: "گەورەکردن",
    close: "داخستن",
    alerts: "ناوەندی ئاگاداری",
    active: "بەردەوامە",
    resolved: "چارەسەر کرا",
    all: "هەموو",
    general: "گشتی — فۆری",
    merchant: "فرۆشیار",
    started: "دەستی پێکرد",
    resolvedAt: "چارەسەر کرا",
    duration: "ماوە",
    ongoing: "ئێستا بەردەوامە",
    historyUnavailable: "مێژووی تەواوی ئاگاداری بەردەست نییە؛ ئاگادارییەکانی ئێستا هێشتا پیشان دەدرێن.",
    scope: "مەودا",
    status: "دۆخ",
    severity: "مەترسی",
    affectedMerchants: "فرۆشیاری کاریگەری لەسەر",
    monthlyKnownCost: "تێچووی ناسراوی ئەم مانگە",
    projectedCost: "پێشبینی کۆتایی مانگ",
    pricingCoverage: "داپۆشینی نرخ",
    pricingUnavailable: "نرخی خزمەتگوزارییەکان دانەنراوە؛ تەنها بەکارهێنانی ڕاستەقینە پیشان دەدرێت.",
    pricingPartial: "تەنها هەندێک خزمەتگوزاری نرخدارە؛ کۆی نیشاندراو خزمەتگوزاری بێ نرخ ناگرێتەوە.",
    billingNotice: "هێشتا پەیوەندی ڕاستەوخۆ بە پسوڵەی دابینکەر نییە؛ تێچوو تەنها لە نرخی ڕێکخراو هەژمار دەکرێت.",
    usageOnly: "تەنها بەکارهێنان",
    dailyCost: "تێچووی ڕۆژانەی ناسراو",
    dailyTokens: "تۆکنی ڕۆژانە",
    serviceBreakdown: "وردەکاری خزمەتگوزاری",
    merchantBreakdown: "وردەکاری فرۆشیار",
    knownCost: "تێچووی ناسراو",
    outboundMessages: "نامەی دەرچوو",
    storage: "هەڵگرتنی پشتگیری",
    rate: "نرخی ڕێکخراو",
    unpriced: "بێ نرخ",
    costReportUnavailable: "ڕاپۆرتی بەکارهێنان و تێچوو بار نەکرا.",
    currentMonth: "مانگی ئێستا",
  },
  en: {
    openSection: "Open section",
    layout: "Window layout",
    onePanel: "One panel",
    twoPanels: "Two panels",
    fourPanels: "Four panels",
    emptyWorkspace: "Monitoring workspace is empty",
    emptyWorkspaceHint: "Open a section above to begin monitoring.",
    minimized: "Minimized windows",
    restore: "Restore",
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",
    alerts: "Alert center",
    active: "Ongoing",
    resolved: "Resolved",
    all: "All",
    general: "General — Fawri",
    merchant: "Merchant",
    started: "Started",
    resolvedAt: "Resolved",
    duration: "Duration",
    ongoing: "Ongoing now",
    historyUnavailable: "Incident lifecycle history is unavailable; current alerts are still visible.",
    scope: "Scope",
    status: "Status",
    severity: "Severity",
    affectedMerchants: "Affected merchants",
    monthlyKnownCost: "Known cost this month",
    projectedCost: "Projected month end",
    pricingCoverage: "Pricing coverage",
    pricingUnavailable: "Service prices are not configured. Real usage is shown without inventing a cost.",
    pricingPartial: "Only some services have configured rates; shown totals exclude unpriced services.",
    billingNotice: "Provider billing is not connected yet; known cost uses only explicitly configured operating rates.",
    usageOnly: "Usage only",
    dailyCost: "Known daily cost",
    dailyTokens: "Daily token usage",
    serviceBreakdown: "Service breakdown",
    merchantBreakdown: "Merchant breakdown",
    knownCost: "Known cost",
    outboundMessages: "Outbound messages",
    storage: "Support storage",
    rate: "Configured rate",
    unpriced: "Unpriced",
    costReportUnavailable: "Usage and cost report is unavailable.",
    currentMonth: "Current month",
  },
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

function MetricTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border bg-background/80 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <p className="mt-1.5 break-words text-base font-black tabular-nums">{value}</p>
    </div>
  );
}

function StatStrip({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function WorkspacePanel({
  title,
  icon: Icon,
  focused,
  onMinimize,
  onFocus,
  onClose,
  labels,
  children,
}: {
  title: string;
  icon: LucideIcon;
  focused: boolean;
  onMinimize: () => void;
  onFocus: () => void;
  onClose: () => void;
  labels: WorkspaceCopy;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-muted/25 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="truncate text-sm font-black">{title}</h2>
        </div>
        <div className="flex items-center gap-1" dir="ltr">
          <button type="button" title={labels.minimize} aria-label={labels.minimize} onClick={onMinimize} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" title={focused ? labels.restore : labels.maximize} aria-label={focused ? labels.restore : labels.maximize} onClick={onFocus} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            {focused ? <Square className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" title={labels.close} aria-label={labels.close} onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

export default function AdminEarlyWarningPage() {
  const { lang } = useI18n();
  const text = ADMIN_EARLY_WARNING_PAGE_TEXT[lang];
  const copy = WORKSPACE_COPY[lang];
  const [, setLocation] = useLocation();
  const [windowKey, setWindowKey] = useState<WindowKey>("1h");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [layoutSlots, setLayoutSlots] = useState<1 | 2 | 4>(2);
  const [openPanels, setOpenPanels] = useState<PanelKey[]>(["incidents", "api"]);
  const [minimizedPanels, setMinimizedPanels] = useState<PanelKey[]>([]);
  const [focusedPanel, setFocusedPanel] = useState<PanelKey | null>(null);
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<"all" | IncidentStatus>("all");
  const [incidentScopeFilter, setIncidentScopeFilter] = useState<"all" | IncidentScope>("all");
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<"all" | "warning" | "critical">("all");
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

  useEffect(() => {
    if (focusedPanel) return;
    const active = openPanels.filter((panel) => !minimizedPanels.includes(panel));
    if (active.length <= layoutSlots) return;
    const overflow = active.slice(0, active.length - layoutSlots);
    setMinimizedPanels((current) => [...new Set([...current, ...overflow])]);
  }, [focusedPanel, layoutSlots, minimizedPanels, openPanels]);

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

  const formatDate = useCallback(
    (value: string | null | undefined) => {
      if (!value) return text.unavailable;
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return text.unavailable;
      return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(date);
    },
    [locale, text.unavailable],
  );

  const formatDuration = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainder = safe % 60;
    if (lang === "en") return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
    if (lang === "ku") return hours > 0 ? `${hours} ک ${minutes} خ` : minutes > 0 ? `${minutes} خ ${remainder} چ` : `${remainder} چ`;
    return hours > 0 ? `${hours} س ${minutes} د` : minutes > 0 ? `${minutes} د ${remainder} ث` : `${remainder} ث`;
  }, [lang]);

  const moneyValue = useCallback((value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return text.unavailable;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  }, [text.unavailable]);

  const sortedMerchants = useMemo(() => {
    const rank: Record<Health, number> = { critical: 0, warning: 1, healthy: 2, unknown: 3 };
    return [...(snapshot?.merchants || [])].sort(
      (left, right) => rank[left.health] - rank[right.health] || left.store_name.localeCompare(right.store_name),
    );
  }, [snapshot]);

  const incidentRows = useMemo<IncidentHistoryItem[]>(() => {
    if (!snapshot) return [];
    if (snapshot.incident_history_status === "available" && snapshot.incident_history) {
      return snapshot.incident_history;
    }
    return snapshot.incidents.map((incident) => ({
      episode_id: incident.id,
      incident_key: incident.id,
      severity: incident.severity,
      area: incident.area,
      code: incident.code,
      value: incident.value,
      runbook: incident.runbook,
      scope: incident.scope === "merchant" ? "merchant" : "system",
      merchant_id: incident.merchant_id || null,
      merchant_name: incident.merchant_name || null,
      status: "active",
      started_at: snapshot.generated_at,
      last_seen_at: snapshot.generated_at,
      resolved_at: null,
      duration_seconds: 0,
    }));
  }, [snapshot]);

  const filteredIncidents = useMemo(
    () => incidentRows.filter((incident) =>
      (incidentStatusFilter === "all" || incident.status === incidentStatusFilter) &&
      (incidentScopeFilter === "all" || incident.scope === incidentScopeFilter) &&
      (incidentSeverityFilter === "all" || incident.severity === incidentSeverityFilter),
    ),
    [incidentRows, incidentScopeFilter, incidentSeverityFilter, incidentStatusFilter],
  );

  const activeIncidents = incidentRows.filter((incident) => incident.status === "active");
  const affectedMerchants = new Set(
    activeIncidents.map((incident) => incident.merchant_id).filter((value): value is string => Boolean(value)),
  ).size;

  const panelDefinitions = useMemo<Array<{ key: PanelKey; label: string; icon: LucideIcon }>>(
    () => [
      { key: "incidents", label: copy.alerts, icon: Bell },
      { key: "api", label: text.api, icon: Network },
      { key: "database", label: text.database, icon: Database },
      { key: "queue", label: text.queue, icon: Server },
      { key: "channels", label: text.channels, icon: Wifi },
      { key: "messaging", label: text.messaging, icon: MessageCircle },
      { key: "bot", label: text.botQuality, icon: ShieldAlert },
      { key: "ai", label: text.ai, icon: Bot },
      { key: "costs", label: lang === "en" ? "Usage & costs" : lang === "ku" ? "بەکارهێنان و تێچوو" : "الاستهلاك والتكاليف", icon: WalletCards },
      { key: "credits", label: text.credits, icon: Coins },
      { key: "support", label: text.support, icon: Headphones },
      { key: "data", label: text.dataUsage, icon: HardDrive },
      { key: "coverage", label: text.coverage, icon: LayoutGrid },
      { key: "merchants", label: text.merchantHealth, icon: Users },
    ],
    [copy.alerts, lang, text],
  );
  const panelByKey = useMemo(() => new Map(panelDefinitions.map((item) => [item.key, item])), [panelDefinitions]);

  const openPanel = (key: PanelKey) => {
    setFocusedPanel(null);
    setOpenPanels((current) => (current.includes(key) ? current : [...current, key]));
    setMinimizedPanels((current) => current.filter((item) => item !== key));
  };
  const minimizePanel = (key: PanelKey) => {
    setFocusedPanel((current) => (current === key ? null : current));
    setMinimizedPanels((current) => (current.includes(key) ? current : [...current, key]));
  };
  const closePanel = (key: PanelKey) => {
    setFocusedPanel((current) => (current === key ? null : current));
    setOpenPanels((current) => current.filter((item) => item !== key));
    setMinimizedPanels((current) => current.filter((item) => item !== key));
  };
  const focusPanel = (key: PanelKey) => {
    setMinimizedPanels((current) => current.filter((item) => item !== key));
    setFocusedPanel((current) => (current === key ? null : key));
  };
  const changeLayout = (slots: 1 | 2 | 4) => {
    setFocusedPanel(null);
    setLayoutSlots(slots);
  };

  const visiblePanels = focusedPanel
    ? [focusedPanel]
    : openPanels.filter((panel) => !minimizedPanels.includes(panel)).slice(-layoutSlots);
  const gridClass = focusedPanel || layoutSlots === 1
    ? "grid-cols-1"
    : layoutSlots === 2
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 md:grid-cols-2";

  const renderPanelBody = (key: PanelKey) => {
    if (!snapshot) return null;
    const cost = snapshot.cost_report;

    if (key === "incidents") {
      return (
        <div className="space-y-3">
          {snapshot.incident_history_status === "unavailable" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              {copy.historyUnavailable}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "active", "resolved"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setIncidentStatusFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${incidentStatusFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                {value === "all" ? copy.all : value === "active" ? copy.active : copy.resolved}
              </button>
            ))}
            {(["all", "system", "merchant"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setIncidentScopeFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${incidentScopeFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                {value === "all" ? copy.all : value === "system" ? copy.general : copy.merchant}
              </button>
            ))}
            {(["all", "critical", "warning"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setIncidentSeverityFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${incidentSeverityFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                {value === "all" ? copy.all : value === "critical" ? text.critical : text.warning}
              </button>
            ))}
          </div>
          {filteredIncidents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{text.noIncidents}</div>
          ) : (
            <div className="space-y-2">
              {filteredIncidents.map((incident) => (
                <article key={incident.episode_id} className={`rounded-xl border p-3 ${healthClass(incident.status === "resolved" ? "healthy" : incident.severity === "critical" ? "critical" : "warning")}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-background/70">
                      <Bell className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-black leading-5">{earlyWarningIncidentLabel(lang, incident.code)}</p>
                          <p className="mt-0.5 text-[11px] opacity-75">{earlyWarningIncidentAreaLabel(lang, incident.area)}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
                          <span className="rounded-full border bg-background/60 px-2 py-1">{incident.status === "active" ? copy.active : copy.resolved}</span>
                          <span className="rounded-full border bg-background/60 px-2 py-1">{incident.scope === "merchant" ? `${copy.merchant}: ${incident.merchant_name || incident.merchant_id || "—"}` : copy.general}</span>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1 text-[11px] opacity-80 sm:grid-cols-2">
                        <span>{copy.started}: <b>{formatDate(incident.started_at)}</b></span>
                        <span>{copy.duration}: <b>{formatDuration(incident.duration_seconds)}</b></span>
                        {incident.status === "resolved" && <span>{copy.resolvedAt}: <b>{formatDate(incident.resolved_at)}</b></span>}
                        {incident.status === "active" && <span><b>{copy.ongoing}</b></span>}
                      </div>
                      <p className="mt-2 text-xs tabular-nums">{text.value}: <b>{incident.value.toLocaleString("en-US")}</b></p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (key === "api") {
      return (
        <div className="space-y-3">
          <StatStrip>
            <MetricTile label={text.requests} value={snapshot.http.requests} icon={Network} />
            <MetricTile label={text.errors} value={snapshot.http.errors} icon={AlertTriangle} />
            <MetricTile label={text.p95} value={metricValue(snapshot.http.p95_latency_ms, text.unavailable, " ms")} icon={Gauge} />
            <MetricTile label={text.p99} value={metricValue(snapshot.http.p99_latency_ms, text.unavailable, " ms")} icon={Activity} />
          </StatStrip>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label={text.rejected} value={snapshot.http.rejected} icon={XCircle} />
            <MetricTile label={text.errorRate} value={snapshot.http.error_rate === null ? text.unavailable : `${(snapshot.http.error_rate * 100).toFixed(2)}%`} icon={AlertTriangle} />
            <MetricTile label={text.p50} value={metricValue(snapshot.http.p50_latency_ms, text.unavailable, " ms")} icon={Gauge} />
            <MetricTile label={text.dataUsage} value={byteValue((snapshot.http.request_bytes ?? 0) + (snapshot.http.response_bytes ?? 0), text.unavailable)} icon={Network} />
          </div>
          <p className="rounded-xl border bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">{text.currentProcessNotice}</p>
        </div>
      );
    }

    if (key === "database") {
      return (
        <div className="space-y-3">
          <StatStrip>
            <MetricTile label={text.databaseSnapshotLatency} value={`${snapshot.database_latency_ms.toLocaleString("en-US")} ms`} icon={Database} />
            <MetricTile label={text.oldestReady} value={`${Math.round(snapshot.queue.oldest_ready_age_seconds).toLocaleString("en-US")} ${text.seconds}`} icon={Clock3} />
            <MetricTile label={text.databaseStorage} value={text.unavailable} icon={HardDrive} />
            <MetricTile label={text.currentProcess} value={formatDate(snapshot.generated_at)} icon={Clock3} />
          </StatStrip>
        </div>
      );
    }

    if (key === "queue") {
      return (
        <StatStrip>
          <MetricTile label={text.readyJobs} value={snapshot.queue.ready} icon={Server} />
          <MetricTile label={text.processingJobs} value={snapshot.queue.processing} icon={Activity} />
          <MetricTile label={text.deadLetter} value={snapshot.queue.dead_letter} icon={AlertTriangle} />
          <MetricTile label={text.failedJobs} value={snapshot.queue.failed_in_window} icon={XCircle} />
        </StatStrip>
      );
    }

    if (key === "channels") {
      return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile label={text.connectedChannels} value={snapshot.channels.connected} icon={Wifi} />
          <MetricTile label={text.nonConnectedChannels} value={snapshot.channels.non_connected} icon={Network} />
          <MetricTile label={text.channelErrors} value={snapshot.channels.recent_errors} icon={AlertTriangle} />
          <MetricTile label={text.expiringCredentials} value={snapshot.channels.expiring_credentials_7d} icon={KeyRound} />
          <MetricTile label={text.latestWebhook} value={formatDate(snapshot.channels.latest_webhook_at)} icon={Clock3} />
        </div>
      );
    }

    if (key === "messaging") {
      return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label={text.inboundEvents} value={snapshot.messaging.inbound_events} icon={MessageCircle} />
          <MetricTile label={text.messages} value={snapshot.messaging.messages} icon={MessageCircle} />
          <MetricTile label={text.failedMessages} value={snapshot.messaging.failed_messages} icon={XCircle} />
          <MetricTile label={text.sent} value={snapshot.messaging.outbound_sent} icon={CheckCircle2} />
          <MetricTile label={text.confirmedFailed} value={snapshot.messaging.outbound_confirmed_failed} icon={XCircle} />
          <MetricTile label={text.uncertain} value={snapshot.messaging.outbound_uncertain} icon={AlertTriangle} />
          <MetricTile label={text.stuckPending} value={snapshot.messaging.outbound_stuck_pending} icon={Clock3} />
          <MetricTile label={text.deliveryP95} value={metricValue(snapshot.messaging.outbound_p95_latency_ms, text.unavailable, " ms")} icon={Gauge} />
        </div>
      );
    }

    if (key === "bot") {
      return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile label={text.decisions} value={snapshot.bot_quality.knowledge_decisions} icon={Bot} />
          <MetricTile label={text.successfulDecisions} value={snapshot.bot_quality.successful_decisions} icon={CheckCircle2} />
          <MetricTile label={text.handoffs} value={snapshot.bot_quality.handoffs} icon={Users} />
          <MetricTile label={text.rejectedDecisions} value={snapshot.bot_quality.rejected_decisions} icon={AlertTriangle} />
          <MetricTile label={text.injectionBlocks} value={snapshot.bot_quality.prompt_injection_blocks} icon={ShieldAlert} />
          <MetricTile label={text.dangerousGuardrails} value={snapshot.bot_quality.dangerous_guardrail_events} icon={XCircle} />
        </div>
      );
    }

    if (key === "ai") {
      return (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile label={text.aiCalls} value={snapshot.ai_runtime.calls} icon={Bot} />
            <MetricTile label={text.inputTokens} value={snapshot.ai_runtime.input_tokens} icon={Activity} />
            <MetricTile label={text.outputTokens} value={snapshot.ai_runtime.output_tokens} icon={Activity} />
            <MetricTile label={text.totalTokens} value={snapshot.ai_runtime.total_tokens} icon={Gauge} />
            <MetricTile label={text.averageAiLatency} value={metricValue(snapshot.ai_runtime.average_latency_ms, text.unavailable, " ms")} icon={Clock3} />
            <MetricTile label={text.historicAi} value={metricValue(snapshot.ai_usage.total_tokens, text.unavailable)} icon={Database} />
          </div>
          {snapshot.ai_runtime.providers.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 text-start">Provider</th><th className="px-3 py-2 text-start">Model</th><th className="px-3 py-2 text-center">Calls</th><th className="px-3 py-2 text-center">Tokens</th></tr></thead>
                <tbody className="divide-y">{snapshot.ai_runtime.providers.map((provider) => <tr key={`${provider.provider_id}:${provider.model}`}><td className="px-3 py-2">{provider.provider_id}</td><td className="px-3 py-2">{provider.model}</td><td className="px-3 py-2 text-center tabular-nums">{provider.calls}</td><td className="px-3 py-2 text-center tabular-nums">{provider.total_tokens}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (key === "costs") {
      if (snapshot.cost_report_status === "unavailable" || !cost) {
        return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{copy.costReportUnavailable}</div>;
      }
      const chartUsesCost = cost.daily.some((row) => row.known_variable_cost_usd !== null);
      const chartValues = cost.daily.map((row) => chartUsesCost ? (row.known_variable_cost_usd ?? 0) : row.ai_total_tokens);
      const chartMax = Math.max(1, ...chartValues);
      return (
        <div className="space-y-3">
          <div className={`rounded-xl border p-3 text-xs leading-5 ${cost.pricing_status === "configured" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"}`}>
            <p className="font-black">{cost.pricing_status === "unconfigured" ? copy.pricingUnavailable : cost.pricing_status === "partial" ? copy.pricingPartial : `${copy.pricingCoverage}: 100%`}</p>
            <p className="mt-1 opacity-80">{copy.billingNotice}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label={copy.monthlyKnownCost} value={moneyValue(cost.known_monthly_cost_usd)} icon={WalletCards} />
            <MetricTile label={copy.projectedCost} value={moneyValue(cost.projected_month_end_cost_usd)} icon={BarChart3} />
            <MetricTile label={copy.pricingCoverage} value={`${cost.pricing_coverage_percent}%`} icon={Gauge} />
            <MetricTile label={text.totalTokens} value={cost.usage.ai_total_tokens.toLocaleString("en-US")} icon={Activity} />
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <strong className="text-xs">{chartUsesCost ? copy.dailyCost : copy.dailyTokens}</strong>
              <span className="text-[10px] text-muted-foreground">{cost.month}</span>
            </div>
            {cost.daily.length === 0 ? (
              <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">{copy.usageOnly}</div>
            ) : (
              <div className="flex h-32 items-end gap-1 overflow-hidden" dir="ltr">
                {cost.daily.map((row, index) => {
                  const value = chartValues[index] || 0;
                  const height = Math.max(value > 0 ? 4 : 1, Math.round((value / chartMax) * 100));
                  return (
                    <div key={row.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end" title={`${row.date}: ${chartUsesCost ? moneyValue(row.known_variable_cost_usd) : row.ai_total_tokens.toLocaleString("en-US")}`}>
                      <div className="w-full max-w-5 rounded-t bg-primary/75 transition group-hover:bg-primary" style={{ height: `${height}%` }} />
                      <span className="mt-1 hidden text-[8px] text-muted-foreground xl:block">{row.date.slice(-2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-background p-3">
            <h3 className="mb-2 text-xs font-black">{copy.serviceBreakdown}</h3>
            <div className="space-y-1.5">
              {cost.services.map((service) => {
                const label = service.id === "ai_input" ? text.inputTokens : service.id === "ai_output" ? text.outputTokens : service.id === "outbound_messages" ? copy.outboundMessages : copy.storage;
                const usage = service.unit === "bytes" ? byteValue(service.usage, text.unavailable) : service.usage.toLocaleString("en-US");
                return (
                  <div key={service.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg bg-muted/30 px-3 py-2 text-[11px]">
                    <span className="font-bold">{label}</span>
                    <span className="tabular-nums text-muted-foreground">{usage}</span>
                    <span className="min-w-20 text-end font-black tabular-nums">{service.known_cost_usd === null ? copy.unpriced : moneyValue(service.known_cost_usd)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="border-b px-3 py-2 text-xs font-black">{copy.merchantBreakdown}</div>
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 text-start">{text.merchant}</th><th className="px-3 py-2 text-center">{text.inputTokens}</th><th className="px-3 py-2 text-center">{text.outputTokens}</th><th className="px-3 py-2 text-center">{copy.outboundMessages}</th><th className="px-3 py-2 text-center">{copy.storage}</th><th className="px-3 py-2 text-center">{copy.knownCost}</th></tr></thead>
                <tbody className="divide-y">{cost.merchants.map((merchant) => <tr key={merchant.merchant_id}><td className="px-3 py-2"><b>{merchant.store_name || merchant.merchant_id}</b><div className="text-[10px] text-muted-foreground" dir="ltr">{merchant.merchant_id}</div></td><td className="px-3 py-2 text-center tabular-nums">{merchant.ai_input_tokens.toLocaleString("en-US")}</td><td className="px-3 py-2 text-center tabular-nums">{merchant.ai_output_tokens.toLocaleString("en-US")}</td><td className="px-3 py-2 text-center tabular-nums">{merchant.outbound_messages.toLocaleString("en-US")}</td><td className="px-3 py-2 text-center tabular-nums">{byteValue(merchant.support_storage_bytes, text.unavailable)}</td><td className="px-3 py-2 text-center font-bold tabular-nums">{merchant.known_cost_usd === null ? copy.unpriced : moneyValue(merchant.known_cost_usd)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (key === "credits") {
      return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile label={text.debits} value={snapshot.credits.debits} icon={Coins} />
          <MetricTile label={text.creditsCount} value={snapshot.credits.credits} icon={Coins} />
          <MetricTile label={text.staleReservations} value={snapshot.credits.stale_reservations} icon={Clock3} />
          <MetricTile label={text.pendingRefunds} value={snapshot.credits.pending_refunds} icon={Clock3} />
          <MetricTile label={text.refundConflicts} value={snapshot.credits.refund_conflicts} icon={AlertTriangle} />
        </div>
      );
    }

    if (key === "support") {
      return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label={text.openTickets} value={snapshot.support.open_tickets} icon={Headphones} />
          <MetricTile label={text.waitingAdmin} value={snapshot.support.waiting_on_admin} icon={Clock3} />
          <MetricTile label={text.attachmentBytes} value={byteValue(snapshot.support.attachment_bytes_in_window, text.unavailable)} icon={Database} />
          <MetricTile label={text.filesystemAttachments} value={snapshot.support.local_filesystem_attachments} icon={AlertTriangle} />
        </div>
      );
    }

    if (key === "data") {
      return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label={text.attachmentBytes} value={byteValue(snapshot.data_usage.support_attachment_bytes, text.unavailable)} icon={Database} />
          <MetricTile label={text.messageTextBytes} value={byteValue(snapshot.data_usage.tracked_message_text_bytes, text.unavailable)} icon={MessageCircle} />
          <MetricTile label={text.databaseStorage} value={text.unavailable} icon={Database} />
          <MetricTile label={text.networkTransfer} value={text.unavailable} icon={Network} />
        </div>
      );
    }

    if (key === "coverage") {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {snapshot.coverage.map((item) => (
            <div key={item.id} className="rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between gap-2"><strong className="text-xs">{earlyWarningCoverageLabel(lang, item.id)}</strong><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${item.coverage === "available" ? healthClass("healthy") : item.coverage === "partial" ? healthClass("warning") : healthClass("unknown")}`}>{coverageLabel(item.coverage)}</span></div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{earlyWarningCoverageNote(lang, item.id, item.note)}</p>
            </div>
          ))}
        </div>
      );
    }

    if (key === "merchants") {
      if (sortedMerchants.length === 0) return <div className="p-6 text-center text-sm text-muted-foreground">{text.noMerchants}</div>;
      return (
        <div className="overflow-hidden rounded-xl border bg-background">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="px-3 py-2 text-start">{text.merchant}</th><th className="px-3 py-2 text-start">{text.health}</th><th className="px-3 py-2 text-center">{text.merchantChannels}</th><th className="px-3 py-2 text-center">{text.merchantMessages}</th><th className="px-3 py-2 text-center">{text.merchantFailures}</th><th className="px-3 py-2 text-center">{text.merchantTokens}</th><th className="px-3 py-2 text-center">{text.merchantSupport}</th></tr></thead>
            <tbody className="divide-y">{sortedMerchants.map((merchant) => {
              const failures = merchant.failed_messages + merchant.failed_jobs + merchant.dead_letter_jobs + merchant.uncertain_deliveries + merchant.refund_conflicts;
              const tokens = (merchant.ai_runtime_total_tokens || 0) + merchant.ai_recorded_tokens;
              return <tr key={merchant.merchant_id} className="hover:bg-muted/30"><td className="px-3 py-2"><b>{merchant.store_name || merchant.merchant_id}</b><div className="text-[10px] text-muted-foreground" dir="ltr">{merchant.merchant_id}</div></td><td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${healthClass(merchant.health)}`}><HealthIcon health={merchant.health} className="h-3 w-3" />{healthLabel(merchant.health)}</span></td><td className="px-3 py-2 text-center tabular-nums">{merchant.connected_channels}</td><td className="px-3 py-2 text-center tabular-nums">{merchant.messages}</td><td className="px-3 py-2 text-center tabular-nums">{failures}</td><td className="px-3 py-2 text-center tabular-nums">{tokens}</td><td className="px-3 py-2 text-center tabular-nums">{merchant.open_support_tickets}</td></tr>;
            })}</tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-muted/30" dir={isRtl ? "rtl" : "ltr"}>
      <header className="z-30 shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-black sm:text-xl">{text.title}</h1>
              {snapshot && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${healthClass(snapshot.overall_health)}`}>
                  <HealthIcon health={snapshot.overall_health} className="h-3 w-3" />
                  {healthLabel(snapshot.overall_health)}
                </span>
              )}
            </div>
            <p className="mt-0.5 hidden max-w-3xl text-xs text-muted-foreground md:block">{text.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>{text.refresh}</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setLocation("/admin")}>
              <BackIcon className="h-3.5 w-3.5" />
              <span>{text.back}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b bg-background px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border bg-card">
            {(["1h", "24h", "7d", "30d"] as WindowKey[]).map((item) => (
              <button key={item} type="button" onClick={() => setWindowKey(item)} className={`px-3 py-1.5 text-[11px] font-black transition ${windowKey === item ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item}</button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" />
                {copy.openSection}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isRtl ? "end" : "start"} className="max-h-[65vh] w-64 overflow-auto" style={{ direction: isRtl ? "rtl" : "ltr" }}>
              {panelDefinitions.map(({ key, label, icon: Icon }) => (
                <DropdownMenuItem key={key} className="gap-2" onSelect={() => openPanel(key)}>
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="flex-1">{label}</span>
                  {openPanels.includes(key) && !minimizedPanels.includes(key) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center overflow-hidden rounded-lg border bg-card" title={copy.layout}>
            <button type="button" aria-label={copy.onePanel} onClick={() => changeLayout(1)} className={`flex h-8 w-9 items-center justify-center ${layoutSlots === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Square className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={copy.twoPanels} onClick={() => changeLayout(2)} className={`flex h-8 w-9 items-center justify-center border-x ${layoutSlots === 2 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Columns2 className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={copy.fourPanels} onClick={() => changeLayout(4)} className={`flex h-8 w-9 items-center justify-center ${layoutSlots === 4 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Grid2X2 className="h-3.5 w-3.5" /></button>
          </div>

          {snapshot && (
            <div className="ms-auto hidden items-center gap-3 text-[10px] text-muted-foreground xl:flex">
              <span>{text.lastUpdated}: <b className="text-foreground">{formatDate(snapshot.generated_at)}</b></span>
              <span>{copy.active}: <b className="text-foreground">{activeIncidents.length}</b></span>
              <span>{copy.affectedMerchants}: <b className="text-foreground">{affectedMerchants}</b></span>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">{text.loading}</p></div>
        </div>
      )}

      {!loading && loadError && (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-md"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-9 w-9 text-destructive" /><p className="mt-3 font-bold">{text.loadError}</p><Button variant="outline" className="mt-4" onClick={() => void load()}>{text.retry}</Button></CardContent></Card>
        </div>
      )}

      {!loading && !loadError && snapshot && (
        <>
          <div className="shrink-0 px-4 py-2 sm:px-6">
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
              <div className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 ${healthClass(snapshot.overall_health)}`}><HealthIcon health={snapshot.overall_health} className="h-4 w-4 shrink-0" /><div className="min-w-0"><p className="text-[9px] opacity-70">{text.systemHealth}</p><p className="truncate text-xs font-black">{healthLabel(snapshot.overall_health)}</p></div></div>
              <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2"><Bell className="h-4 w-4 shrink-0 text-primary" /><div><p className="text-[9px] text-muted-foreground">{copy.active}</p><p className="text-xs font-black tabular-nums">{activeIncidents.length}</p></div></div>
              <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2"><Users className="h-4 w-4 shrink-0 text-primary" /><div><p className="text-[9px] text-muted-foreground">{copy.affectedMerchants}</p><p className="text-xs font-black tabular-nums">{affectedMerchants}</p></div></div>
              <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2"><WalletCards className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-[9px] text-muted-foreground">{copy.monthlyKnownCost}</p><p className="truncate text-xs font-black tabular-nums">{moneyValue(snapshot.cost_report?.known_monthly_cost_usd)}</p></div></div>
            </div>
          </div>

          <div className="min-h-0 flex-1 px-4 pb-2 sm:px-6">
            {visiblePanels.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed bg-background/50 text-center">
                <div><LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 text-sm font-black">{copy.emptyWorkspace}</p><p className="mt-1 text-xs text-muted-foreground">{copy.emptyWorkspaceHint}</p></div>
              </div>
            ) : (
              <div className={`grid h-full min-h-0 gap-2 ${gridClass} ${!focusedPanel && layoutSlots === 4 ? "grid-rows-2" : "grid-rows-1"}`}>
                {visiblePanels.map((key) => {
                  const definition = panelByKey.get(key)!;
                  return (
                    <WorkspacePanel key={key} title={definition.label} icon={definition.icon} focused={focusedPanel === key} onMinimize={() => minimizePanel(key)} onFocus={() => focusPanel(key)} onClose={() => closePanel(key)} labels={copy}>
                      {renderPanelBody(key)}
                    </WorkspacePanel>
                  );
                })}
              </div>
            )}
          </div>

          {minimizedPanels.length > 0 && (
            <div className="shrink-0 border-t bg-background px-4 py-1.5 sm:px-6">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="shrink-0 text-[10px] font-bold text-muted-foreground">{copy.minimized}</span>
                {minimizedPanels.map((key) => {
                  const definition = panelByKey.get(key);
                  if (!definition) return null;
                  const Icon = definition.icon;
                  return <button key={key} type="button" onClick={() => openPanel(key)} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-[10px] font-bold hover:bg-muted"><Icon className="h-3 w-3 text-primary" />{definition.label}</button>;
                })}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
