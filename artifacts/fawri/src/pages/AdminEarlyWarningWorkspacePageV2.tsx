import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  MoreHorizontal,
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
type MerchantChartMetric = "tokens" | "messages" | "storage" | "cost";
type MerchantSortMetric = "cost" | "tokens" | "messages" | "storage";

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

type CostMerchant = {
  merchant_id: string;
  store_name: string;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_total_tokens: number;
  outbound_messages: number;
  support_storage_bytes: number;
  attachments_created_bytes: number;
  known_cost_usd: number | null;
};

type CostReport = {
  currency: "USD";
  month: string;
  month_started_at: string;
  month_ended_at: string;
  is_current_month: boolean;
  available_months: string[];
  generated_at: string;
  actual_billing_connected: false;
  cost_basis: "configured_rate_estimate";
  pricing_status: "unconfigured" | "partial" | "configured";
  pricing_coverage_percent: number;
  rates: {
    ai_input_per_1m_usd: number | null;
    ai_output_per_1m_usd: number | null;
    outbound_message_per_1000_usd: number | null;
    support_storage_per_gb_month_usd: number | null;
  };
  unpriced_services: string[];
  usage_authority: {
    ai_tokens: "message_metadata_partial";
    outbound_messages: "fawri_message_records";
    support_storage: "support_attachment_records";
    otp_delivery: "not_connected";
    database_storage: "not_connected";
    network_transfer: "not_connected";
    provider_billing: "not_connected";
  };
  budget_status: "unconfigured" | "configured";
  monthly_budget_usd: number | null;
  budget_remaining_usd: number | null;
  budget_utilization_percent: number | null;
  known_monthly_cost_usd: number | null;
  projected_month_end_cost_usd: number | null;
  previous_month: {
    month: string;
    known_monthly_cost_usd: number | null;
    ai_total_tokens: number;
    outbound_messages: number;
  } | null;
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
  merchants: CostMerchant[];
  daily: Array<{
    date: string;
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_total_tokens: number;
    outbound_messages: number;
    known_variable_cost_usd: number | null;
  }>;
};

type MerchantUsageTrend = {
  merchant_id: string;
  store_name: string;
  support_storage_bytes: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_total_tokens: number;
  outbound_messages: number;
  attachments_created_bytes: number;
  daily: Array<{
    date: string;
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_total_tokens: number;
    outbound_messages: number;
    attachments_created_bytes: number;
  }>;
};

type MerchantUsageReport = {
  month: string;
  generated_at: string;
  merchants: MerchantUsageTrend[];
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
  merchant_usage_status?: "available" | "unavailable";
  merchant_usage?: MerchantUsageReport | null;
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
  coverage: Array<{ id: string; coverage: Coverage; note: string }>;
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
  more: string;
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
  affectedMerchants: string;
  monthlyKnownCost: string;
  projectedCost: string;
  pricingCoverage: string;
  pricingUnavailable: string;
  pricingPartial: string;
  billingNotice: string;
  dailyCost: string;
  dailyTokens: string;
  merchantReports: string;
  knownCost: string;
  outboundMessages: string;
  unpriced: string;
  costReportUnavailable: string;
  month: string;
  budget: string;
  budgetRemaining: string;
  budgetUsage: string;
  previousMonth: string;
  connectedUsage: string;
  disconnectedCosts: string;
  notConnected: string;
  actualBilling: string;
  selectMerchant: string;
  tokenInput: string;
  tokenOutput: string;
  totalTokens: string;
  dailyMerchantUsage: string;
  tokenShare: string;
  messageShare: string;
  storageShare: string;
  merchantReason: string;
  noConnectedChannel: string;
  channelErrors: string;
  messageFailures: string;
  deadLetter: string;
  uncertainDelivery: string;
  refundConflict: string;
  otp: string;
  databaseStorage: string;
  networkTransfer: string;
  objectStorage: string;
  providerBilling: string;
  supportStorage: string;
  addedAttachments: string;
  messagesMetric: string;
  storageMetric: string;
  tokensMetric: string;
  costMetric: string;
  statusFilter: string;
  scopeFilter: string;
  severityFilter: string;
  noActiveIncidents: string;
  noResolvedIncidents: string;
  noMatchingIncidents: string;
  noTokenData: string;
  noMessageData: string;
  noStorageData: string;
  noCostData: string;
  costPricingRequired: string;
  reportingWindow: string;
  monthlyScope: string;
  sortBy: string;
  highestCost: string;
  highestTokens: string;
  highestMessages: string;
  highestStorage: string;
  rank: string;
};

const COPY: Record<"ar" | "ku" | "en", WorkspaceCopy> = {
  ar: {
    openSection: "فتح قسم",
    layout: "تخطيط النوافذ",
    onePanel: "نافذة واحدة",
    twoPanels: "نافذتان",
    fourPanels: "أربع نوافذ",
    emptyWorkspace: "مساحة المراقبة فارغة",
    emptyWorkspaceHint: "افتح قسمًا من القائمة أعلاه لبدء المراقبة.",
    minimized: "النوافذ المصغّرة",
    more: "المزيد",
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
    affectedMerchants: "متاجر متأثرة",
    monthlyKnownCost: "التكلفة المعروفة",
    projectedCost: "المتوقع لنهاية الشهر",
    pricingCoverage: "تغطية التسعير",
    pricingUnavailable: "لا توجد أسعار تشغيل مضبوطة بعد؛ تعرض اللوحة الاستهلاك الحقيقي فقط ولا تفترض تكلفة.",
    pricingPartial: "بعض الخدمات فقط لها أسعار مضبوطة؛ الإجماليات لا تشمل الخدمات غير المسعّرة.",
    billingNotice: "فواتير المزودين غير مربوطة مباشرة بعد؛ أي تكلفة ظاهرة تقدير محسوب من أسعار تشغيل مضبوطة صراحة.",
    dailyCost: "التكلفة اليومية المعروفة",
    dailyTokens: "استهلاك التوكن اليومي",
    merchantReports: "تقارير استهلاك المتاجر",
    knownCost: "تكلفة معروفة",
    outboundMessages: "رسائل صادرة",
    unpriced: "غير مسعّر",
    costReportUnavailable: "تعذر تحميل تقرير الاستهلاك والتكاليف.",
    month: "الشهر",
    budget: "ميزانية الشهر",
    budgetRemaining: "المتبقي من الميزانية",
    budgetUsage: "استخدام الميزانية",
    previousMonth: "الشهر السابق",
    connectedUsage: "مصادر استهلاك موصولة",
    disconnectedCosts: "تكاليف غير مربوطة بعد",
    notConnected: "غير مربوط",
    actualBilling: "الفوترة الفعلية",
    selectMerchant: "المتجر",
    tokenInput: "توكن الإدخال",
    tokenOutput: "توكن الإخراج",
    totalTokens: "إجمالي التوكن",
    dailyMerchantUsage: "الاستهلاك اليومي للمتجر",
    tokenShare: "حصة التوكن من فوري",
    messageShare: "حصة الرسائل من فوري",
    storageShare: "حصة التخزين من فوري",
    merchantReason: "سبب التحذير",
    noConnectedChannel: "لا توجد قناة متصلة",
    channelErrors: "أخطاء قنوات حديثة",
    messageFailures: "فشل رسائل",
    deadLetter: "مهام DLQ",
    uncertainDelivery: "إرسال غير مؤكد",
    refundConflict: "تعارض استرجاع",
    otp: "OTP / رسائل التحقق",
    databaseStorage: "تخزين PostgreSQL",
    networkTransfer: "نقل البيانات",
    objectStorage: "تخزين الملفات خارج مرفقات الدعم",
    providerBilling: "فواتير مزودي الخدمات",
    supportStorage: "تخزين مرفقات الدعم",
    addedAttachments: "مرفقات مضافة",
    messagesMetric: "الرسائل",
    storageMetric: "التخزين",
    tokensMetric: "التوكن",
    costMetric: "التكلفة",
    statusFilter: "الحالة",
    scopeFilter: "النطاق",
    severityFilter: "الخطورة",
    noActiveIncidents: "لا توجد إنذارات مستمرة تطابق الفلاتر المحددة.",
    noResolvedIncidents: "لا توجد إنذارات تمت معالجتها تطابق الفلاتر المحددة.",
    noMatchingIncidents: "لا توجد إنذارات تطابق الفلاتر المحددة.",
    noTokenData: "لا توجد بيانات توكن لهذا الشهر.",
    noMessageData: "لا توجد بيانات رسائل لهذا الشهر.",
    noStorageData: "لا توجد بيانات تخزين يومية لهذا الشهر.",
    noCostData: "لا توجد تكلفة يومية معروفة لهذا الشهر.",
    costPricingRequired: "اضبط أسعار AI أو الرسائل لعرض التكلفة اليومية المعروفة.",
    reportingWindow: "بيانات هذا القسم ضمن الفترة المحددة",
    monthlyScope: "هذا التقرير شهري ولا يتبع فلتر الساعة/الأيام أعلاه.",
    sortBy: "ترتيب المتاجر حسب",
    highestCost: "الأعلى تكلفة",
    highestTokens: "الأعلى توكن",
    highestMessages: "الأعلى رسائل",
    highestStorage: "الأعلى تخزينًا",
    rank: "الترتيب",
  },
  ku: {
    openSection: "کردنەوەی بەش",
    layout: "ڕێکخستنی پەنجەرەکان",
    onePanel: "یەک پەنجەرە",
    twoPanels: "دوو پەنجەرە",
    fourPanels: "چوار پەنجەرە",
    emptyWorkspace: "شوێنی چاودێری بەتاڵە",
    emptyWorkspaceHint: "بەشێک بکەرەوە بۆ دەستپێکردن.",
    minimized: "پەنجەرە بچووککراوەکان",
    more: "زیاتر",
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
    historyUnavailable: "مێژووی ئاگاداری بەردەست نییە.",
    affectedMerchants: "فرۆشیاری کاریگەری لەسەر",
    monthlyKnownCost: "تێچووی ناسراو",
    projectedCost: "پێشبینی کۆتایی مانگ",
    pricingCoverage: "داپۆشینی نرخ",
    pricingUnavailable: "نرخەکان دانەنراون؛ تەنها بەکارهێنانی ڕاستەقینە پیشان دەدرێت.",
    pricingPartial: "تەنها هەندێک خزمەتگوزاری نرخدارە.",
    billingNotice: "پسوڵەی دابینکەر هێشتا ڕاستەوخۆ پەیوەست نییە.",
    dailyCost: "تێچووی ڕۆژانەی ناسراو",
    dailyTokens: "تۆکنی ڕۆژانە",
    merchantReports: "ڕاپۆرتی بەکارهێنانی فرۆشیار",
    knownCost: "تێچووی ناسراو",
    outboundMessages: "نامەی دەرچوو",
    unpriced: "بێ نرخ",
    costReportUnavailable: "ڕاپۆرت بار نەکرا.",
    month: "مانگ",
    budget: "بودجەی مانگ",
    budgetRemaining: "بودجەی ماوە",
    budgetUsage: "بەکارهێنانی بودجە",
    previousMonth: "مانگی پێشوو",
    connectedUsage: "سەرچاوە پەیوەستەکان",
    disconnectedCosts: "تێچووی نەپەیوەستراو",
    notConnected: "نەپەیوەستراو",
    actualBilling: "پسوڵەی ڕاستەقینە",
    selectMerchant: "فرۆشیار",
    tokenInput: "تۆکنی هاتنەژوور",
    tokenOutput: "تۆکنی دەرچوو",
    totalTokens: "کۆی تۆکن",
    dailyMerchantUsage: "بەکارهێنانی ڕۆژانەی فرۆشیار",
    tokenShare: "بەشی تۆکن",
    messageShare: "بەشی نامە",
    storageShare: "بەشی هەڵگرتن",
    merchantReason: "هۆکاری ئاگاداری",
    noConnectedChannel: "هیچ کەناڵێک پەیوەست نییە",
    channelErrors: "هەڵەی کەناڵ",
    messageFailures: "شکستی نامە",
    deadLetter: "DLQ",
    uncertainDelivery: "گەیاندنی نادڵنیا",
    refundConflict: "ناکۆکی گەڕاندنەوە",
    otp: "OTP",
    databaseStorage: "هەڵگرتنی PostgreSQL",
    networkTransfer: "گواستنەوەی داتا",
    objectStorage: "هەڵگرتنی فایل لە دەرەوەی هاوپێچەکانی پشتگیری",
    providerBilling: "پسوڵەی دابینکەر",
    supportStorage: "هەڵگرتنی هاوپێچی پشتگیری",
    addedAttachments: "هاوپێچی زیادکراو",
    messagesMetric: "نامە",
    storageMetric: "هەڵگرتن",
    tokensMetric: "تۆکن",
    costMetric: "تێچوو",
    statusFilter: "دۆخ",
    scopeFilter: "مەودا",
    severityFilter: "مەترسی",
    noActiveIncidents: "هیچ ئاگادارییەکی بەردەوام کە لەگەڵ فلتەرەکان بگونجێت نییە.",
    noResolvedIncidents: "هیچ ئاگادارییەکی چارەسەرکراو کە لەگەڵ فلتەرەکان بگونجێت نییە.",
    noMatchingIncidents: "هیچ ئاگادارییەک لەگەڵ فلتەرەکان ناگونجێت.",
    noTokenData: "داتای تۆکن بۆ ئەم مانگە نییە.",
    noMessageData: "داتای نامە بۆ ئەم مانگە نییە.",
    noStorageData: "داتای ڕۆژانەی هەڵگرتن بۆ ئەم مانگە نییە.",
    noCostData: "تێچووی ڕۆژانەی ناسراو بۆ ئەم مانگە نییە.",
    costPricingRequired: "نرخی AI یان نامە دابنێ بۆ پیشاندانی تێچووی ڕۆژانە.",
    reportingWindow: "داتای ئەم بەشە لە ماوەی هەڵبژێردراودایە",
    monthlyScope: "ئەم ڕاپۆرتە مانگانەیە و بە فلتەری کاتەکەوە نەبەستراوە.",
    sortBy: "ڕیزکردنی فرۆشیار بە",
    highestCost: "زۆرترین تێچوو",
    highestTokens: "زۆرترین تۆکن",
    highestMessages: "زۆرترین نامە",
    highestStorage: "زۆرترین هەڵگرتن",
    rank: "ڕیز",
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
    more: "More",
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
    affectedMerchants: "Affected merchants",
    monthlyKnownCost: "Known cost",
    projectedCost: "Projected month end",
    pricingCoverage: "Pricing coverage",
    pricingUnavailable: "Service prices are not configured. Real usage is shown without inventing a cost.",
    pricingPartial: "Only some services have configured rates; totals exclude unpriced services.",
    billingNotice: "Provider billing is not connected yet; visible cost is an operating estimate from explicitly configured rates.",
    dailyCost: "Known daily cost",
    dailyTokens: "Daily token usage",
    merchantReports: "Merchant usage reports",
    knownCost: "Known cost",
    outboundMessages: "Outbound messages",
    unpriced: "Unpriced",
    costReportUnavailable: "Usage and cost report is unavailable.",
    month: "Month",
    budget: "Monthly budget",
    budgetRemaining: "Budget remaining",
    budgetUsage: "Budget usage",
    previousMonth: "Previous month",
    connectedUsage: "Connected usage sources",
    disconnectedCosts: "Costs not connected yet",
    notConnected: "Not connected",
    actualBilling: "Actual billing",
    selectMerchant: "Merchant",
    tokenInput: "Input tokens",
    tokenOutput: "Output tokens",
    totalTokens: "Total tokens",
    dailyMerchantUsage: "Daily merchant usage",
    tokenShare: "Share of Fawri tokens",
    messageShare: "Share of Fawri messages",
    storageShare: "Share of Fawri storage",
    merchantReason: "Warning reason",
    noConnectedChannel: "No connected channel",
    channelErrors: "Recent channel errors",
    messageFailures: "Message failures",
    deadLetter: "DLQ jobs",
    uncertainDelivery: "Uncertain delivery",
    refundConflict: "Refund conflict",
    otp: "OTP delivery",
    databaseStorage: "PostgreSQL storage",
    networkTransfer: "Network transfer",
    objectStorage: "File/object storage outside support attachments",
    providerBilling: "Provider invoices",
    supportStorage: "Support attachment storage",
    addedAttachments: "Attachments added",
    messagesMetric: "Messages",
    storageMetric: "Storage",
    tokensMetric: "Tokens",
    costMetric: "Cost",
    statusFilter: "Status",
    scopeFilter: "Scope",
    severityFilter: "Severity",
    noActiveIncidents: "No ongoing incidents match the selected filters.",
    noResolvedIncidents: "No resolved incidents match the selected filters.",
    noMatchingIncidents: "No incidents match the selected filters.",
    noTokenData: "No token data is available for this month.",
    noMessageData: "No message data is available for this month.",
    noStorageData: "No daily storage data is available for this month.",
    noCostData: "No known daily cost is available for this month.",
    costPricingRequired: "Configure AI or messaging rates to show known daily cost.",
    reportingWindow: "This section reflects the selected monitoring window",
    monthlyScope: "This report is monthly and does not follow the hour/day filter above.",
    sortBy: "Rank merchants by",
    highestCost: "Highest cost",
    highestTokens: "Highest tokens",
    highestMessages: "Highest messages",
    highestStorage: "Highest storage",
    rank: "Rank",
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

function MetricTile({ label, value, icon: Icon, compact = false }: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-background/80 shadow-sm ${compact ? "p-2" : "p-3"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`${compact ? "text-[9px] leading-3" : "text-[11px] leading-4"} text-muted-foreground`}>{label}</p>
        <Icon className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-primary`} />
      </div>
      <p className={`${compact ? "mt-1 text-sm" : "mt-1.5 text-base"} break-words font-black tabular-nums`}>{value}</p>
    </div>
  );
}

function MiniBarChart({ rows, values, valueLabel, emptyLabel }: {
  rows: Array<{ date: string }>;
  values: number[];
  valueLabel: (value: number) => string;
  emptyLabel: string;
}) {
  const hasData = values.some((value) => Number.isFinite(value) && value > 0);
  if (rows.length === 0 || !hasData) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-muted/10 px-4 text-center">
        <div>
          <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{emptyLabel}</p>
        </div>
      </div>
    );
  }
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-32 items-end gap-1 overflow-hidden" dir="ltr">
      {rows.map((row, index) => {
        const value = values[index] || 0;
        const height = Math.max(value > 0 ? 4 : 1, Math.round((value / max) * 100));
        return (
          <div key={row.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end" title={`${row.date}: ${valueLabel(value)}`}>
            <div className="w-full max-w-5 rounded-t bg-primary/75 transition group-hover:bg-primary" style={{ height: `${height}%` }} />
            <span className="mt-1 hidden text-[8px] text-muted-foreground xl:block">{row.date.slice(-2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShareBar({ label, value }: { label: string; value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px]"><span>{label}</span><b>{safe.toFixed(1)}%</b></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${safe}%` }} /></div>
    </div>
  );
}

function WorkspacePanel({ title, icon: Icon, focused, compact, onMinimize, onFocus, onClose, labels, children }: {
  title: string;
  icon: LucideIcon;
  focused: boolean;
  compact: boolean;
  onMinimize: () => void;
  onFocus: () => void;
  onClose: () => void;
  labels: WorkspaceCopy;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={`flex shrink-0 items-center gap-2 border-b bg-muted/25 px-3 ${compact ? "h-9" : "h-11"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${compact ? "h-6 w-6" : "h-7 w-7"}`}><Icon className="h-4 w-4" /></span>
          <h2 className="truncate text-sm font-black">{title}</h2>
        </div>
        <div className="flex items-center gap-1" dir="ltr">
          <button type="button" title={labels.minimize} onClick={onMinimize} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" title={focused ? labels.restore : labels.maximize} onClick={onFocus} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">{focused ? <Square className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
          <button type="button" title={labels.close} onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className={`min-h-0 min-w-0 flex-1 overflow-auto ${compact ? "p-2" : "p-3"}`}>{children}</div>
    </section>
  );
}

export default function AdminEarlyWarningWorkspacePageV2() {
  const { lang } = useI18n();
  const text = ADMIN_EARLY_WARNING_PAGE_TEXT[lang];
  const copy = COPY[lang];
  const [, setLocation] = useLocation();
  const [windowKey, setWindowKey] = useState<WindowKey>("1h");
  const [costMonth, setCostMonth] = useState(() => new Date().toISOString().slice(0, 7));
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
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const [merchantChartMetric, setMerchantChartMetric] = useState<MerchantChartMetric>("tokens");
  const [merchantSortMetric, setMerchantSortMetric] = useState<MerchantSortMetric>("cost");
  const isRtl = lang !== "en";
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ window: windowKey, month: costMonth });
      const response = await fetch(`/api/auth/admin/early-warning?${params.toString()}`, {
        headers: getAdminAuthHeaders(),
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok || !result?.ok || !result.snapshot) throw new Error(result?.code || "EARLY_WARNING_UNAVAILABLE");
      setSnapshot(result.snapshot);
      setLoadError(false);
    } catch (error) {
      console.error("Early warning dashboard load failed:", error);
      if (!silent) setLoadError(true);
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [windowKey, costMonth]);

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

  useEffect(() => {
    const merchants = snapshot?.merchant_usage?.merchants || [];
    if (merchants.length === 0) return;
    if (!selectedMerchantId || !merchants.some((merchant) => merchant.merchant_id === selectedMerchantId)) {
      setSelectedMerchantId(merchants[0]!.merchant_id);
    }
  }, [selectedMerchantId, snapshot]);

  const healthLabel = useCallback((health: Health) => health === "healthy" ? text.healthy : health === "warning" ? text.warning : health === "critical" ? text.critical : text.unknown, [text]);
  const coverageLabel = useCallback((coverage: Coverage) => coverage === "available" ? text.available : coverage === "partial" ? text.partial : text.notInstrumented, [text]);
  const formatDate = useCallback((value: string | null | undefined) => {
    if (!value) return text.unavailable;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return text.unavailable;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: lang === "en",
      timeZone: "Asia/Baghdad",
    }).format(date);
  }, [lang, locale, text.unavailable]);
  const formatDuration = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainder = safe % 60;
    if (lang === "en") return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
    return hours > 0 ? `${hours} س ${minutes} د` : minutes > 0 ? `${minutes} د ${remainder} ث` : `${remainder} ث`;
  }, [lang]);
  const moneyValue = useCallback((value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? text.unavailable : new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value), [text.unavailable]);

  const sortedMerchants = useMemo(() => {
    const rank: Record<Health, number> = { critical: 0, warning: 1, healthy: 2, unknown: 3 };
    return [...(snapshot?.merchants || [])].sort((a, b) => rank[a.health] - rank[b.health] || a.store_name.localeCompare(b.store_name));
  }, [snapshot]);

  const incidentRows = useMemo<IncidentHistoryItem[]>(() => {
    if (!snapshot) return [];
    if (snapshot.incident_history_status === "available" && snapshot.incident_history) return snapshot.incident_history;
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

  const filteredIncidents = useMemo(() => incidentRows.filter((incident) =>
    (incidentStatusFilter === "all" || incident.status === incidentStatusFilter) &&
    (incidentScopeFilter === "all" || incident.scope === incidentScopeFilter) &&
    (incidentSeverityFilter === "all" || incident.severity === incidentSeverityFilter)
  ), [incidentRows, incidentScopeFilter, incidentSeverityFilter, incidentStatusFilter]);

  const activeIncidents = incidentRows.filter((incident) => incident.status === "active");
  const affectedMerchants = new Set(activeIncidents.map((incident) => incident.merchant_id).filter(Boolean)).size;

  const panelDefinitions = useMemo<Array<{ key: PanelKey; label: string; icon: LucideIcon }>>(() => [
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
  ], [copy.alerts, lang, text]);
  const panelByKey = useMemo(() => new Map(panelDefinitions.map((item) => [item.key, item])), [panelDefinitions]);

  const openPanel = (key: PanelKey) => {
    setFocusedPanel(null);
    setOpenPanels((current) => [...current.filter((item) => item !== key), key]);
    setMinimizedPanels((current) => current.filter((item) => item !== key));
  };
  const minimizePanel = (key: PanelKey) => {
    setFocusedPanel((current) => current === key ? null : current);
    setMinimizedPanels((current) => current.includes(key) ? current : [...current, key]);
  };
  const closePanel = (key: PanelKey) => {
    setFocusedPanel((current) => current === key ? null : current);
    setOpenPanels((current) => current.filter((item) => item !== key));
    setMinimizedPanels((current) => current.filter((item) => item !== key));
  };
  const focusPanel = (key: PanelKey) => {
    setMinimizedPanels((current) => current.filter((item) => item !== key));
    setOpenPanels((current) => [...current.filter((item) => item !== key), key]);
    setFocusedPanel((current) => current === key ? null : key);
  };
  const changeLayout = (slots: 1 | 2 | 4) => {
    setFocusedPanel(null);
    setLayoutSlots(slots);
  };

  const visiblePanels = focusedPanel ? [focusedPanel] : openPanels.filter((panel) => !minimizedPanels.includes(panel)).slice(-layoutSlots);
  const compactMode = !focusedPanel && layoutSlots === 4;
  const gridClass = focusedPanel || layoutSlots === 1 ? "grid-cols-1" : layoutSlots === 2 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2";
  const trayVisible = minimizedPanels.slice(-4);
  const trayOverflow = minimizedPanels.slice(0, Math.max(0, minimizedPanels.length - 4));

  const merchantReasons = (merchant: MerchantHealth): string[] => {
    const reasons: string[] = [];
    if (merchant.connected_channels === 0) reasons.push(copy.noConnectedChannel);
    if (merchant.recent_channel_errors > 0) reasons.push(`${copy.channelErrors}: ${merchant.recent_channel_errors}`);
    if (merchant.failed_messages > 0) reasons.push(`${copy.messageFailures}: ${merchant.failed_messages}`);
    if (merchant.dead_letter_jobs > 0) reasons.push(`${copy.deadLetter}: ${merchant.dead_letter_jobs}`);
    if (merchant.uncertain_deliveries > 0) reasons.push(`${copy.uncertainDelivery}: ${merchant.uncertain_deliveries}`);
    if (merchant.refund_conflicts > 0) reasons.push(`${copy.refundConflict}: ${merchant.refund_conflicts}`);
    return reasons;
  };

  const emptyIncidentLabel = incidentStatusFilter === "active"
    ? copy.noActiveIncidents
    : incidentStatusFilter === "resolved"
      ? copy.noResolvedIncidents
      : copy.noMatchingIncidents;

  const renderFilterGroup = (label: string, children: ReactNode) => (
    <div className="rounded-xl border bg-muted/15 p-2">
      <p className="mb-1.5 text-[9px] font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );

  const renderPanelBody = (key: PanelKey) => {
    if (!snapshot) return null;
    const cost = snapshot.cost_report;
    const tile = (label: string, value: string | number, icon: LucideIcon) => <MetricTile label={label} value={value} icon={icon} compact={compactMode} />;
    const metricGrid = compactMode ? "grid grid-cols-2 xl:grid-cols-4 gap-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-4";

    if (key === "incidents") return (
      <div className="flex min-h-full flex-col gap-3">
        {snapshot.incident_history_status === "unavailable" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{copy.historyUnavailable}</div>}
        <div className="grid gap-2 xl:grid-cols-3">
          {renderFilterGroup(copy.statusFilter, (["all", "active", "resolved"] as const).map((value) => (
            <button key={`s-${value}`} type="button" onClick={() => setIncidentStatusFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${incidentStatusFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{value === "all" ? copy.all : value === "active" ? copy.active : copy.resolved}</button>
          )))}
          {renderFilterGroup(copy.scopeFilter, (["all", "system", "merchant"] as const).map((value) => (
            <button key={`c-${value}`} type="button" onClick={() => setIncidentScopeFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${incidentScopeFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{value === "all" ? copy.all : value === "system" ? copy.general : copy.merchant}</button>
          )))}
          {renderFilterGroup(copy.severityFilter, (["all", "critical", "warning"] as const).map((value) => (
            <button key={`v-${value}`} type="button" onClick={() => setIncidentSeverityFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${incidentSeverityFilter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{value === "all" ? copy.all : value === "critical" ? text.critical : text.warning}</button>
          )))}
        </div>
        {filteredIncidents.length === 0 ? (
          <div className="flex min-h-36 flex-1 items-center justify-center rounded-xl border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
            <div><Bell className="mx-auto h-6 w-6 opacity-50" /><p className="mt-2">{emptyIncidentLabel}</p></div>
          </div>
        ) : (
          <div className="space-y-2">{filteredIncidents.map((incident) => (
            <article key={incident.episode_id} className={`rounded-xl border p-3 ${healthClass(incident.status === "resolved" ? "healthy" : incident.severity === "critical" ? "critical" : "warning")}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-background/70"><Bell className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="font-black leading-5">{earlyWarningIncidentLabel(lang, incident.code)}</p><p className="mt-0.5 text-[11px] opacity-75">{earlyWarningIncidentAreaLabel(lang, incident.area)}</p></div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-black"><span className="rounded-full border bg-background/60 px-2 py-1">{incident.status === "active" ? copy.active : copy.resolved}</span><span className="rounded-full border bg-background/60 px-2 py-1">{incident.scope === "merchant" ? `${copy.merchant}: ${incident.merchant_name || incident.merchant_id || "—"}` : copy.general}</span></div>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] opacity-80 sm:grid-cols-2"><span>{copy.started}: <b>{formatDate(incident.started_at)}</b></span><span>{copy.duration}: <b>{formatDuration(incident.duration_seconds)}</b></span>{incident.status === "resolved" ? <span>{copy.resolvedAt}: <b>{formatDate(incident.resolved_at)}</b></span> : <span><b>{copy.ongoing}</b></span>}</div>
                  <p className="mt-2 text-xs tabular-nums">{text.value}: <b>{incident.value.toLocaleString("en-US")}</b></p>
                </div>
              </div>
            </article>
          ))}</div>
        )}
      </div>
    );

    if (key === "api") return <div className="space-y-2"><div className={metricGrid}>{tile(text.requests, snapshot.http.requests, Network)}{tile(text.errors, snapshot.http.errors, AlertTriangle)}{tile(text.p95, metricValue(snapshot.http.p95_latency_ms, text.unavailable, " ms"), Gauge)}{tile(text.p99, metricValue(snapshot.http.p99_latency_ms, text.unavailable, " ms"), Activity)}{tile(text.rejected, snapshot.http.rejected, XCircle)}{tile(text.errorRate, snapshot.http.error_rate === null ? text.unavailable : `${(snapshot.http.error_rate * 100).toFixed(2)}%`, AlertTriangle)}{tile(text.p50, metricValue(snapshot.http.p50_latency_ms, text.unavailable, " ms"), Gauge)}{tile(text.dataUsage, byteValue((snapshot.http.request_bytes ?? 0) + (snapshot.http.response_bytes ?? 0), text.unavailable), Network)}</div>{!compactMode && <p className="rounded-xl border bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">{text.currentProcessNotice}</p>}</div>;
    if (key === "database") return <div className={metricGrid}>{tile(text.databaseSnapshotLatency, `${snapshot.database_latency_ms.toLocaleString("en-US")} ms`, Database)}{tile(text.oldestReady, `${Math.round(snapshot.queue.oldest_ready_age_seconds).toLocaleString("en-US")} ${text.seconds}`, Clock3)}{tile(text.databaseStorage, text.unavailable, HardDrive)}{tile(text.currentProcess, formatDate(snapshot.generated_at), Clock3)}</div>;
    if (key === "queue") return <div className={metricGrid}>{tile(text.readyJobs, snapshot.queue.ready, Server)}{tile(text.processingJobs, snapshot.queue.processing, Activity)}{tile(text.deadLetter, snapshot.queue.dead_letter, AlertTriangle)}{tile(text.failedJobs, snapshot.queue.failed_in_window, XCircle)}</div>;
    if (key === "channels") return <div className={metricGrid}>{tile(text.connectedChannels, snapshot.channels.connected, Wifi)}{tile(text.nonConnectedChannels, snapshot.channels.non_connected, Network)}{tile(text.channelErrors, snapshot.channels.recent_errors, AlertTriangle)}{tile(text.expiringCredentials, snapshot.channels.expiring_credentials_7d, KeyRound)}{tile(text.latestWebhook, formatDate(snapshot.channels.latest_webhook_at), Clock3)}</div>;
    if (key === "messaging") return <div className={metricGrid}>{tile(text.inboundEvents, snapshot.messaging.inbound_events, MessageCircle)}{tile(text.messages, snapshot.messaging.messages, MessageCircle)}{tile(text.failedMessages, snapshot.messaging.failed_messages, XCircle)}{tile(text.sent, snapshot.messaging.outbound_sent, CheckCircle2)}{tile(text.confirmedFailed, snapshot.messaging.outbound_confirmed_failed, XCircle)}{tile(text.uncertain, snapshot.messaging.outbound_uncertain, AlertTriangle)}{tile(text.stuckPending, snapshot.messaging.outbound_stuck_pending, Clock3)}{tile(text.deliveryP95, metricValue(snapshot.messaging.outbound_p95_latency_ms, text.unavailable, " ms"), Gauge)}</div>;
    if (key === "bot") return <div className={metricGrid}>{tile(text.decisions, snapshot.bot_quality.knowledge_decisions, Bot)}{tile(text.successfulDecisions, snapshot.bot_quality.successful_decisions, CheckCircle2)}{tile(text.handoffs, snapshot.bot_quality.handoffs, Users)}{tile(text.rejectedDecisions, snapshot.bot_quality.rejected_decisions, AlertTriangle)}{tile(text.injectionBlocks, snapshot.bot_quality.prompt_injection_blocks, ShieldAlert)}{tile(text.dangerousGuardrails, snapshot.bot_quality.dangerous_guardrail_events, XCircle)}</div>;
    if (key === "ai") return <div className="space-y-3"><div className={metricGrid}>{tile(text.aiCalls, snapshot.ai_runtime.calls, Bot)}{tile(copy.tokenInput, snapshot.ai_runtime.input_tokens, Activity)}{tile(copy.tokenOutput, snapshot.ai_runtime.output_tokens, Activity)}{tile(copy.totalTokens, snapshot.ai_runtime.total_tokens, Gauge)}{tile(text.averageAiLatency, metricValue(snapshot.ai_runtime.average_latency_ms, text.unavailable, " ms"), Clock3)}{tile(text.historicAi, metricValue(snapshot.ai_usage.total_tokens, text.unavailable), Database)}</div>{!compactMode && snapshot.ai_runtime.providers.length > 0 && <div className="overflow-auto rounded-xl border"><table className="w-full min-w-[520px] text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 text-start">Provider</th><th className="px-3 py-2 text-start">Model</th><th>Calls</th><th>Tokens</th></tr></thead><tbody className="divide-y">{snapshot.ai_runtime.providers.map((provider) => <tr key={`${provider.provider_id}:${provider.model}`}><td className="px-3 py-2">{provider.provider_id}</td><td className="px-3 py-2">{provider.model}</td><td className="text-center">{provider.calls}</td><td className="text-center">{provider.total_tokens}</td></tr>)}</tbody></table></div>}</div>;

    if (key === "costs") {
      if (snapshot.cost_report_status === "unavailable" || !cost) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{copy.costReportUnavailable}</div>;
      const chartUsesCost = cost.daily.some((row) => row.known_variable_cost_usd !== null);
      const chartValues = cost.daily.map((row) => chartUsesCost ? (row.known_variable_cost_usd ?? 0) : row.ai_total_tokens);
      const selectedTrend = snapshot.merchant_usage?.merchants.find((merchant) => merchant.merchant_id === selectedMerchantId) || snapshot.merchant_usage?.merchants[0] || null;
      const selectedCost = cost.merchants.find((merchant) => merchant.merchant_id === selectedTrend?.merchant_id) || null;
      const merchantRows = selectedTrend?.daily || [];
      const variableCostRatesAvailable = cost.rates.ai_input_per_1m_usd !== null || cost.rates.ai_output_per_1m_usd !== null || cost.rates.outbound_message_per_1000_usd !== null;
      const merchantDailyKnownCost = (row: MerchantUsageTrend["daily"][number]) => {
        let total = 0;
        if (cost.rates.ai_input_per_1m_usd !== null) total += (row.ai_input_tokens / 1_000_000) * cost.rates.ai_input_per_1m_usd;
        if (cost.rates.ai_output_per_1m_usd !== null) total += (row.ai_output_tokens / 1_000_000) * cost.rates.ai_output_per_1m_usd;
        if (cost.rates.outbound_message_per_1000_usd !== null) total += (row.outbound_messages / 1_000) * cost.rates.outbound_message_per_1000_usd;
        return total;
      };
      const merchantValues = merchantRows.map((row) => merchantChartMetric === "tokens"
        ? row.ai_total_tokens
        : merchantChartMetric === "messages"
          ? row.outbound_messages
          : merchantChartMetric === "storage"
            ? row.attachments_created_bytes
            : variableCostRatesAvailable ? merchantDailyKnownCost(row) : 0);
      const globalStorage = Math.max(1, cost.usage.support_storage_bytes);
      const tokenShare = selectedTrend ? (selectedTrend.ai_total_tokens / Math.max(1, cost.usage.ai_total_tokens)) * 100 : 0;
      const messageShare = selectedTrend ? (selectedTrend.outbound_messages / Math.max(1, cost.usage.outbound_messages)) * 100 : 0;
      const storageShare = selectedTrend ? (selectedTrend.support_storage_bytes / globalStorage) * 100 : 0;
      const disconnected = [copy.otp, copy.databaseStorage, copy.networkTransfer, copy.objectStorage, copy.providerBilling];
      const merchantChartEmptyLabel = merchantChartMetric === "tokens"
        ? copy.noTokenData
        : merchantChartMetric === "messages"
          ? copy.noMessageData
          : merchantChartMetric === "storage"
            ? copy.noStorageData
            : variableCostRatesAvailable ? copy.noCostData : copy.costPricingRequired;
      const rankedMerchants = [...cost.merchants].sort((a, b) => {
        if (merchantSortMetric === "tokens") return b.ai_total_tokens - a.ai_total_tokens;
        if (merchantSortMetric === "messages") return b.outbound_messages - a.outbound_messages;
        if (merchantSortMetric === "storage") return b.support_storage_bytes - a.support_storage_bytes;
        return (b.known_cost_usd ?? -1) - (a.known_cost_usd ?? -1) || b.ai_total_tokens - a.ai_total_tokens;
      });
      return <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3">
          <label className="text-xs font-bold">{copy.month}</label>
          <select value={costMonth} onChange={(event) => setCostMonth(event.target.value)} className="h-8 rounded-lg border bg-background px-2 text-xs font-bold" dir="ltr">{cost.available_months.map((month) => <option key={month} value={month}>{month}</option>)}</select>
          <span className={`ms-auto rounded-full border px-2.5 py-1 text-[10px] font-black ${cost.pricing_status === "configured" ? healthClass("healthy") : healthClass("warning")}`}>{copy.pricingCoverage}: {cost.pricing_coverage_percent}%</span>
          <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-[10px] font-black">{copy.actualBilling}: {copy.notConnected}</span>
        </div>
        <p className="rounded-lg border bg-muted/15 px-3 py-2 text-[10px] font-semibold text-muted-foreground">{copy.monthlyScope}</p>
        <div className={`rounded-xl border p-3 text-xs leading-5 ${cost.pricing_status === "configured" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}><p className="font-black">{cost.pricing_status === "unconfigured" ? copy.pricingUnavailable : cost.pricing_status === "partial" ? copy.pricingPartial : `${copy.pricingCoverage}: 100%`}</p><p className="mt-1 opacity-80">{copy.billingNotice}</p></div>
        <div className={metricGrid}>{tile(copy.monthlyKnownCost, moneyValue(cost.known_monthly_cost_usd), WalletCards)}{tile(copy.projectedCost, moneyValue(cost.projected_month_end_cost_usd), BarChart3)}{tile(copy.budget, moneyValue(cost.monthly_budget_usd), WalletCards)}{tile(copy.budgetRemaining, moneyValue(cost.budget_remaining_usd), Gauge)}{tile(copy.budgetUsage, cost.budget_utilization_percent === null ? text.unavailable : `${cost.budget_utilization_percent.toFixed(1)}%`, Gauge)}{tile(copy.totalTokens, cost.usage.ai_total_tokens.toLocaleString("en-US"), Activity)}{tile(copy.outboundMessages, cost.usage.outbound_messages.toLocaleString("en-US"), MessageCircle)}{tile(copy.supportStorage, byteValue(cost.usage.support_storage_bytes, text.unavailable), HardDrive)}</div>
        {cost.previous_month && <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border bg-muted/20 p-3 text-[11px]"><b>{copy.previousMonth}: {cost.previous_month.month}</b><span>{copy.knownCost}: {moneyValue(cost.previous_month.known_monthly_cost_usd)}</span><span>{copy.totalTokens}: {cost.previous_month.ai_total_tokens.toLocaleString("en-US")}</span><span>{copy.outboundMessages}: {cost.previous_month.outbound_messages.toLocaleString("en-US")}</span></div>}
        <div className="rounded-xl border bg-background p-3"><div className="mb-3 flex items-center justify-between gap-2"><strong className="text-xs">{chartUsesCost ? copy.dailyCost : copy.dailyTokens}</strong><span className="text-[10px] text-muted-foreground">{cost.month}</span></div><MiniBarChart rows={cost.daily} values={chartValues} valueLabel={(value) => chartUsesCost ? moneyValue(value) : value.toLocaleString("en-US")} emptyLabel={chartUsesCost ? copy.noCostData : copy.noTokenData} /></div>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border bg-background p-3"><h3 className="mb-2 text-xs font-black">{copy.connectedUsage}</h3><div className="space-y-1.5">{cost.services.map((service) => { const label = service.id === "ai_input" ? copy.tokenInput : service.id === "ai_output" ? copy.tokenOutput : service.id === "outbound_messages" ? copy.outboundMessages : copy.supportStorage; const usage = service.unit === "bytes" ? byteValue(service.usage, text.unavailable) : service.usage.toLocaleString("en-US"); return <div key={service.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg bg-muted/30 px-3 py-2 text-[11px]"><span className="font-bold">{label}</span><span className="tabular-nums text-muted-foreground">{usage}</span><span className="min-w-20 text-end font-black">{service.known_cost_usd === null ? copy.unpriced : moneyValue(service.known_cost_usd)}</span></div>; })}</div></div>
          <div className="rounded-xl border bg-background p-3"><h3 className="mb-2 text-xs font-black">{copy.disconnectedCosts}</h3><div className="grid gap-2 sm:grid-cols-2">{disconnected.map((label) => <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[11px]"><span className="font-bold">{label}</span><span className="shrink-0 rounded-full border bg-background px-2 py-1 text-[10px] font-black text-muted-foreground">{copy.notConnected}</span></div>)}</div></div>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/15 p-3">
            <h3 className="me-auto text-sm font-black">{copy.merchantReports}</h3>
            <label className="grid min-w-44 gap-1 text-[10px] font-bold text-muted-foreground"><span>{copy.selectMerchant}</span><select value={selectedMerchantId} onChange={(event) => setSelectedMerchantId(event.target.value)} className="h-9 max-w-64 rounded-xl border bg-background px-3 text-xs font-bold text-foreground shadow-sm">{(snapshot.merchant_usage?.merchants || []).map((merchant) => <option key={merchant.merchant_id} value={merchant.merchant_id}>{merchant.store_name || merchant.merchant_id}</option>)}</select></label>
          </div>
          {snapshot.merchant_usage_status === "unavailable" || !selectedTrend ? <div className="mt-3 rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">{text.unavailable}</div> : <div className="mt-3 space-y-3">
            <div className={metricGrid}>{tile(copy.tokenInput, selectedTrend.ai_input_tokens.toLocaleString("en-US"), Activity)}{tile(copy.tokenOutput, selectedTrend.ai_output_tokens.toLocaleString("en-US"), Activity)}{tile(copy.totalTokens, selectedTrend.ai_total_tokens.toLocaleString("en-US"), Gauge)}{tile(copy.outboundMessages, selectedTrend.outbound_messages.toLocaleString("en-US"), MessageCircle)}{tile(copy.supportStorage, byteValue(selectedTrend.support_storage_bytes, text.unavailable), HardDrive)}{tile(copy.addedAttachments, byteValue(selectedTrend.attachments_created_bytes, text.unavailable), HardDrive)}{tile(copy.knownCost, selectedCost?.known_cost_usd === null || selectedCost?.known_cost_usd === undefined ? copy.unpriced : moneyValue(selectedCost.known_cost_usd), WalletCards)}</div>
            <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
              <div className="rounded-xl border p-3"><div className="mb-3 flex flex-wrap items-center gap-2"><strong className="me-auto text-xs">{copy.dailyMerchantUsage}</strong>{(["tokens", "messages", "storage", "cost"] as MerchantChartMetric[]).map((metric) => <button key={metric} type="button" onClick={() => setMerchantChartMetric(metric)} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${merchantChartMetric === metric ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{metric === "tokens" ? copy.tokensMetric : metric === "messages" ? copy.messagesMetric : metric === "storage" ? copy.storageMetric : copy.costMetric}</button>)}</div><MiniBarChart rows={merchantRows} values={merchantValues} valueLabel={(value) => merchantChartMetric === "storage" ? byteValue(value, "0 B") : merchantChartMetric === "cost" ? moneyValue(value) : value.toLocaleString("en-US")} emptyLabel={merchantChartEmptyLabel} /></div>
              <div className="space-y-3 rounded-xl border p-3"><ShareBar label={copy.tokenShare} value={tokenShare} /><ShareBar label={copy.messageShare} value={messageShare} /><ShareBar label={copy.storageShare} value={storageShare} /></div>
            </div>
          </div>}
        </div>
        <div className="rounded-xl border bg-background p-3">
          <div className="mb-3 flex flex-wrap items-end gap-3"><h3 className="me-auto text-xs font-black">{copy.merchantReports}</h3><label className="grid gap-1 text-[10px] font-bold text-muted-foreground"><span>{copy.sortBy}</span><select value={merchantSortMetric} onChange={(event) => setMerchantSortMetric(event.target.value as MerchantSortMetric)} className="h-8 rounded-lg border bg-background px-2 text-xs font-bold text-foreground"><option value="cost">{copy.highestCost}</option><option value="tokens">{copy.highestTokens}</option><option value="messages">{copy.highestMessages}</option><option value="storage">{copy.highestStorage}</option></select></label></div>
          <div className="overflow-auto rounded-xl border"><table className="w-full min-w-[760px] text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-2 py-2 text-center">{copy.rank}</th><th className="px-3 py-2 text-start">{text.merchant}</th><th>{copy.tokenInput}</th><th>{copy.tokenOutput}</th><th>{copy.outboundMessages}</th><th>{copy.supportStorage}</th><th>{copy.knownCost}</th></tr></thead><tbody className="divide-y">{rankedMerchants.map((merchant, index) => <tr key={merchant.merchant_id}><td className="px-2 text-center font-black">{index + 1}</td><td className="px-3 py-2"><b>{merchant.store_name || merchant.merchant_id}</b><div className="max-w-52 truncate text-[10px] text-muted-foreground" dir="ltr" title={merchant.merchant_id}>{merchant.merchant_id}</div></td><td className="text-center">{merchant.ai_input_tokens.toLocaleString("en-US")}</td><td className="text-center">{merchant.ai_output_tokens.toLocaleString("en-US")}</td><td className="text-center">{merchant.outbound_messages.toLocaleString("en-US")}</td><td className="text-center">{byteValue(merchant.support_storage_bytes, text.unavailable)}</td><td className="text-center font-bold">{merchant.known_cost_usd === null ? copy.unpriced : moneyValue(merchant.known_cost_usd)}</td></tr>)}</tbody></table></div>
        </div>
      </div>;
    }

    if (key === "credits") return <div className={metricGrid}>{tile(text.debits, snapshot.credits.debits, Coins)}{tile(text.creditsCount, snapshot.credits.credits, Coins)}{tile(text.staleReservations, snapshot.credits.stale_reservations, Clock3)}{tile(text.pendingRefunds, snapshot.credits.pending_refunds, Clock3)}{tile(text.refundConflicts, snapshot.credits.refund_conflicts, AlertTriangle)}</div>;
    if (key === "support") return <div className="space-y-2"><div className={metricGrid}>{tile(text.openTickets, snapshot.support.open_tickets, Headphones)}{tile(text.waitingAdmin, snapshot.support.waiting_on_admin, Clock3)}{tile(text.attachmentBytes, byteValue(snapshot.support.attachment_bytes_in_window, text.unavailable), Database)}{tile(text.filesystemAttachments, snapshot.support.local_filesystem_attachments, AlertTriangle)}</div>{!compactMode && <p className="rounded-lg border bg-muted/15 px-3 py-2 text-[10px] font-semibold text-muted-foreground">{copy.reportingWindow}: {windowKey}</p>}</div>;
    if (key === "data") return <div className="space-y-2"><div className={metricGrid}>{tile(text.attachmentBytes, byteValue(snapshot.data_usage.support_attachment_bytes, text.unavailable), Database)}{tile(text.messageTextBytes, byteValue(snapshot.data_usage.tracked_message_text_bytes, text.unavailable), MessageCircle)}{tile(text.databaseStorage, text.unavailable, Database)}{tile(text.networkTransfer, text.unavailable, Network)}</div>{!compactMode && <p className="rounded-lg border bg-muted/15 px-3 py-2 text-[10px] font-semibold text-muted-foreground">{copy.reportingWindow}: {windowKey}</p>}</div>;
    if (key === "coverage") return <div className="grid gap-2 md:grid-cols-2">{snapshot.coverage.map((item) => <div key={item.id} className="rounded-xl border bg-background p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs">{earlyWarningCoverageLabel(lang, item.id)}</strong><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${item.coverage === "available" ? healthClass("healthy") : item.coverage === "partial" ? healthClass("warning") : healthClass("unknown")}`}>{coverageLabel(item.coverage)}</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{earlyWarningCoverageNote(lang, item.id, item.note)}</p></div>)}</div>;
    if (key === "merchants") {
      if (sortedMerchants.length === 0) return <div className="flex h-full min-h-36 items-center justify-center text-center text-sm text-muted-foreground">{text.noMerchants}</div>;
      if (compactMode) return <div className="overflow-hidden rounded-xl border bg-background"><table className="w-full table-fixed text-[10px]"><thead className="bg-muted text-muted-foreground"><tr><th className="w-[34%] px-2 py-2 text-start">{text.merchant}</th><th className="w-[20%] px-2 py-2 text-start">{text.health}</th><th className="px-2 py-2 text-start">{copy.merchantReason}</th></tr></thead><tbody className="divide-y">{sortedMerchants.map((merchant) => { const reasons = merchantReasons(merchant); return <tr key={merchant.merchant_id}><td className="px-2 py-2 align-top"><b className="block truncate">{merchant.store_name || merchant.merchant_id}</b><div className="mt-0.5 truncate text-[8px] text-muted-foreground" dir="ltr" title={merchant.merchant_id}>{merchant.merchant_id}</div></td><td className="px-2 py-2 align-top"><span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-1 font-black ${healthClass(merchant.health)}`}><HealthIcon health={merchant.health} className="h-3 w-3" />{healthLabel(merchant.health)}</span></td><td className="px-2 py-2 align-top">{reasons.length === 0 ? <span className="text-muted-foreground">—</span> : <div className="flex flex-wrap gap-1">{reasons.slice(0, 2).map((reason) => <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-1 font-bold text-amber-900">{reason}</span>)}</div>}</td></tr>; })}</tbody></table></div>;
      return <div className="overflow-hidden rounded-xl border bg-background"><table className="w-full table-fixed text-[11px]"><thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="w-[20%] px-3 py-2 text-start">{text.merchant}</th><th className="w-[11%] px-2 py-2 text-start">{text.health}</th><th className="w-[27%] px-2 py-2 text-start">{copy.merchantReason}</th><th>{text.merchantChannels}</th><th>{text.merchantMessages}</th><th>{text.merchantFailures}</th><th>{text.merchantTokens}</th><th>{text.merchantSupport}</th></tr></thead><tbody className="divide-y">{sortedMerchants.map((merchant) => { const failures = merchant.failed_messages + merchant.failed_jobs + merchant.dead_letter_jobs + merchant.uncertain_deliveries + merchant.refund_conflicts; const tokens = (merchant.ai_runtime_total_tokens || 0) + merchant.ai_recorded_tokens; const reasons = merchantReasons(merchant); return <tr key={merchant.merchant_id} className="hover:bg-muted/30"><td className="px-3 py-2 align-top"><b className="block truncate">{merchant.store_name || merchant.merchant_id}</b><div className="truncate text-[9px] text-muted-foreground" dir="ltr" title={merchant.merchant_id}>{merchant.merchant_id}</div></td><td className="px-2 py-2 align-top"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black ${healthClass(merchant.health)}`}><HealthIcon health={merchant.health} className="h-3 w-3" />{healthLabel(merchant.health)}</span></td><td className="px-2 py-2 align-top">{reasons.length === 0 ? <span className="text-muted-foreground">—</span> : <div className="flex flex-wrap gap-1">{reasons.map((reason) => <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-900">{reason}</span>)}</div>}</td><td className="text-center">{merchant.connected_channels}</td><td className="text-center">{merchant.messages}</td><td className="text-center">{failures}</td><td className="text-center">{tokens}</td><td className="text-center">{merchant.open_support_tickets}</td></tr>; })}</tbody></table></div>;
    }
    return null;
  };

  return (
    <main className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden bg-muted/30" dir={isRtl ? "rtl" : "ltr"}>
      <header className="z-30 shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="min-w-0"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /><h1 className="text-lg font-black sm:text-xl">{text.title}</h1>{snapshot && <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${healthClass(snapshot.overall_health)}`}><HealthIcon health={snapshot.overall_health} className="h-3 w-3" />{healthLabel(snapshot.overall_health)}</span>}</div><p className="mt-0.5 hidden max-w-3xl text-xs text-muted-foreground md:block">{text.subtitle}</p></div>
          <div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{text.refresh}</Button><Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setLocation("/admin")}><BackIcon className="h-3.5 w-3.5" />{text.back}</Button></div>
        </div>
      </header>

      <div className="shrink-0 border-b bg-background px-4 py-2 sm:px-6"><div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border bg-card">{(["1h", "24h", "7d", "30d"] as WindowKey[]).map((item) => <button key={item} type="button" onClick={() => setWindowKey(item)} className={`px-3 py-1.5 text-[11px] font-black transition ${windowKey === item ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item}</button>)}</div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1.5"><LayoutGrid className="h-3.5 w-3.5" />{copy.openSection}<ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align={isRtl ? "end" : "start"} className="max-h-[65vh] w-64 overflow-auto" style={{ direction: isRtl ? "rtl" : "ltr" }}>{panelDefinitions.map(({ key, label, icon: Icon }) => <DropdownMenuItem key={key} className="gap-2" onSelect={() => openPanel(key)}><Icon className="h-4 w-4 text-primary" /><span className="flex-1">{label}</span>{openPanels.includes(key) && !minimizedPanels.includes(key) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
        <div className="flex items-center overflow-hidden rounded-lg border bg-card" title={copy.layout}><button type="button" onClick={() => changeLayout(1)} className={`flex h-8 w-9 items-center justify-center ${layoutSlots === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Square className="h-3.5 w-3.5" /></button><button type="button" onClick={() => changeLayout(2)} className={`flex h-8 w-9 items-center justify-center border-x ${layoutSlots === 2 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Columns2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => changeLayout(4)} className={`flex h-8 w-9 items-center justify-center ${layoutSlots === 4 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Grid2X2 className="h-3.5 w-3.5" /></button></div>
        {snapshot && <div className="ms-auto hidden items-center gap-3 text-[10px] text-muted-foreground xl:flex"><span>{text.lastUpdated}: <b className="text-foreground">{formatDate(snapshot.generated_at)}</b></span><span>{copy.active}: <b className="text-foreground">{activeIncidents.length}</b></span><span>{copy.affectedMerchants}: <b className="text-foreground">{affectedMerchants}</b></span></div>}
      </div></div>

      {loading && <div className="flex min-h-0 flex-1 items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">{text.loading}</p></div></div>}
      {!loading && loadError && <div className="flex min-h-0 flex-1 items-center justify-center px-4"><Card className="w-full max-w-md"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-9 w-9 text-destructive" /><p className="mt-3 font-bold">{text.loadError}</p><Button variant="outline" className="mt-4" onClick={() => void load()}>{text.retry}</Button></CardContent></Card></div>}

      {!loading && !loadError && snapshot && <>
        <div className="shrink-0 px-4 py-2 sm:px-6"><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><div className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 ${healthClass(snapshot.overall_health)}`}><HealthIcon health={snapshot.overall_health} className="h-4 w-4 shrink-0" /><div className="min-w-0"><p className="text-[9px] opacity-70">{text.systemHealth}</p><p className="truncate text-xs font-black">{healthLabel(snapshot.overall_health)}</p></div></div><div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2"><Bell className="h-4 w-4 shrink-0 text-primary" /><div><p className="text-[9px] text-muted-foreground">{copy.active}</p><p className="text-xs font-black">{activeIncidents.length}</p></div></div><div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2"><Users className="h-4 w-4 shrink-0 text-primary" /><div><p className="text-[9px] text-muted-foreground">{copy.affectedMerchants}</p><p className="text-xs font-black">{affectedMerchants}</p></div></div><div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2"><WalletCards className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-[9px] text-muted-foreground">{copy.monthlyKnownCost}</p><p className="truncate text-xs font-black">{moneyValue(snapshot.cost_report?.known_monthly_cost_usd)}</p></div></div></div></div>
        <div className="min-h-0 min-w-0 flex-1 px-4 pb-2 sm:px-6">{visiblePanels.length === 0 ? <div className="flex h-full items-center justify-center rounded-2xl border border-dashed bg-background/50 text-center"><div><LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 text-sm font-black">{copy.emptyWorkspace}</p><p className="mt-1 text-xs text-muted-foreground">{copy.emptyWorkspaceHint}</p></div></div> : <div className={`grid h-full min-h-0 min-w-0 gap-2 ${gridClass} ${!focusedPanel && layoutSlots === 4 ? "grid-rows-2" : "grid-rows-1"}`}>{visiblePanels.map((key) => { const definition = panelByKey.get(key)!; return <WorkspacePanel key={key} title={definition.label} icon={definition.icon} focused={focusedPanel === key} compact={compactMode} onMinimize={() => minimizePanel(key)} onFocus={() => focusPanel(key)} onClose={() => closePanel(key)} labels={copy}>{renderPanelBody(key)}</WorkspacePanel>; })}</div>}</div>
        {minimizedPanels.length > 0 && <div className="shrink-0 border-t bg-background px-4 py-1.5 sm:px-6"><div className="flex min-w-0 items-center gap-2 overflow-hidden"><span className="shrink-0 text-[10px] font-bold text-muted-foreground">{copy.minimized}</span>{trayVisible.map((key) => { const definition = panelByKey.get(key); if (!definition) return null; const Icon = definition.icon; return <button key={key} type="button" onClick={() => openPanel(key)} className="inline-flex h-7 min-w-0 max-w-40 shrink items-center gap-1.5 rounded-lg border bg-card px-2.5 text-[10px] font-bold hover:bg-muted"><Icon className="h-3 w-3 shrink-0 text-primary" /><span className="truncate">{definition.label}</span></button>; })}{trayOverflow.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border bg-card px-2.5 text-[10px] font-bold shadow-sm hover:bg-muted"><MoreHorizontal className="h-3 w-3" />{copy.more} +{trayOverflow.length}</button></DropdownMenuTrigger><DropdownMenuContent align={isRtl ? "end" : "start"} className="min-w-56 p-1.5" style={{ direction: isRtl ? "rtl" : "ltr" }}>{trayOverflow.map((key) => { const definition = panelByKey.get(key); if (!definition) return null; const Icon = definition.icon; return <DropdownMenuItem key={key} className="gap-2 rounded-lg py-2" onSelect={() => openPanel(key)}><Icon className="h-4 w-4 text-primary" /><span className="flex-1">{definition.label}</span></DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>}</div></div>}
      </>}
    </main>
  );
}
