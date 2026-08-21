import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  WalletCards,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAdminAuthHeaders } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

type SourceType = "owner_configured" | "provider_rate_card" | "provider_api";
type UsageAuthority = "connected" | "not_connected";

type MeterDefinition = {
  meter_key: string;
  unit_code: string;
  category: string;
  usage_authority: UsageAuthority;
  report_component: string | null;
};

type Rate = {
  id: string;
  meter_key: string;
  provider_key: string;
  unit_code: string;
  dimension_key: string;
  dimension_value: string;
  rate_usd: number;
  source_type: SourceType;
  source_reference: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Configuration = {
  generated_at: string;
  catalog: MeterDefinition[];
  monthly_budget_usd: number | null;
  current_rates: Rate[];
  history: Rate[];
};

type Draft = {
  provider_key: string;
  rate_usd: string;
  source_type: "owner_configured" | "provider_rate_card";
  source_reference: string;
  effective_month: string;
  notes: string;
};

const TEXT = {
  ar: {
    launch: "إعداد أسعار الخدمات",
    title: "إعداد أسعار الخدمات",
    subtitle: "سجّل تكلفة المزود التي تدفعها فوري. لا تضع بيانات بطاقة أو مفاتيح سرية هنا.",
    budget: "ميزانية التشغيل الشهرية",
    budgetHint: "اختياري — بالدولار الأمريكي",
    saveBudget: "حفظ الميزانية",
    provider: "المزود",
    rate: "السعر",
    source: "مصدر السعر",
    effective: "يبدأ من",
    reference: "مرجع السعر",
    notes: "ملاحظات",
    save: "حفظ السعر",
    refresh: "تحديث",
    connected: "يستخدم في تقرير التكلفة",
    notConnected: "السعر محفوظ لكن الاستهلاك غير مربوط بعد",
    ownerConfigured: "مدخل يدويًا من المالك",
    rateCard: "جدول أسعار المزود",
    providerApi: "فعلي من API المزود",
    noRate: "غير مسعّر",
    sourceProtected: "الأسعار القادمة من API المزود تُكتب تلقائيًا فقط ولا يمكن انتحالها يدويًا.",
    saved: "تم الحفظ",
    saveFailed: "تعذر حفظ السعر.",
    loadFailed: "تعذر تحميل إعدادات الأسعار.",
    providerPlaceholder: "مثال: openai أو meta",
    referencePlaceholder: "رابط/رقم جدول السعر — بدون أسرار",
    notesPlaceholder: "ملاحظة اختيارية",
    history: "سجل الأسعار",
    current: "السعر الحالي",
    month: "الشهر",
    sourceLabel: "المصدر",
    rateHistoryEmpty: "لا يوجد سجل أسعار بعد.",
    close: "إغلاق",
  },
  ku: {
    launch: "ڕێکخستنی نرخی خزمەتگوزاری",
    title: "ڕێکخستنی نرخی خزمەتگوزاری",
    subtitle: "تێچووی دابینکەر تۆمار بکە. زانیاری کارتی پارەدان یان نهێنی لێرە مەنووسە.",
    budget: "بودجەی مانگانەی کارپێکردن",
    budgetHint: "ئارەزوومەندانە — بە USD",
    saveBudget: "پاشەکەوتکردنی بودجە",
    provider: "دابینکەر",
    rate: "نرخ",
    source: "سەرچاوەی نرخ",
    effective: "دەستپێک لە",
    reference: "سەرچاوە/ڕەفەرەنس",
    notes: "تێبینی",
    save: "پاشەکەوتکردنی نرخ",
    refresh: "نوێکردنەوە",
    connected: "لە ڕاپۆرتی تێچوودا بەکاردێت",
    notConnected: "نرخ پاشەکەوت کراوە بەڵام بەکارهێنان هێشتا پەیوەست نییە",
    ownerConfigured: "بە دەستی خاوەنەوە دانراوە",
    rateCard: "خشتەی نرخی دابینکەر",
    providerApi: "ڕاستەقینە لە API دابینکەر",
    noRate: "بێ نرخ",
    sourceProtected: "نرخی provider API تەنها بە connectorی متمانەپێکراو دەنووسرێت.",
    saved: "پاشەکەوت کرا",
    saveFailed: "پاشەکەوتکردنی نرخ سەرکەوتوو نەبوو.",
    loadFailed: "بارکردنی ڕێکخستنەکانی نرخ سەرکەوتوو نەبوو.",
    providerPlaceholder: "نموونە: openai یان meta",
    referencePlaceholder: "ڕەفەرەنس — بێ نهێنی",
    notesPlaceholder: "تێبینی ئارەزوومەندانە",
    history: "مێژووی نرخ",
    current: "نرخی ئێستا",
    month: "مانگ",
    sourceLabel: "سەرچاوە",
    rateHistoryEmpty: "هێشتا مێژووی نرخ نییە.",
    close: "داخستن",
  },
  en: {
    launch: "Service cost settings",
    title: "Service cost settings",
    subtitle: "Record the provider cost Fawri pays. Never enter payment-card data or secret credentials here.",
    budget: "Monthly operating budget",
    budgetHint: "Optional — USD",
    saveBudget: "Save budget",
    provider: "Provider",
    rate: "Rate",
    source: "Rate source",
    effective: "Effective from",
    reference: "Rate reference",
    notes: "Notes",
    save: "Save rate",
    refresh: "Refresh",
    connected: "Used in the cost report",
    notConnected: "Rate is stored, but usage is not connected yet",
    ownerConfigured: "Owner configured",
    rateCard: "Provider rate card",
    providerApi: "Actual provider API",
    noRate: "Unpriced",
    sourceProtected: "Provider-API rates can only be written by a trusted billing connector.",
    saved: "Saved",
    saveFailed: "Could not save the rate.",
    loadFailed: "Could not load provider cost settings.",
    providerPlaceholder: "e.g. openai or meta",
    referencePlaceholder: "Rate-card URL/reference — no secrets",
    notesPlaceholder: "Optional note",
    history: "Rate history",
    current: "Current rate",
    month: "Month",
    sourceLabel: "Source",
    rateHistoryEmpty: "No rate history yet.",
    close: "Close",
  },
} as const;

const METER_LABELS: Record<string, { ar: string; ku: string; en: string }> = {
  ai_input_tokens_per_1m: { ar: "توكن إدخال AI — لكل مليون", ku: "تۆکنی هاتنەژووری AI — بۆ ١ ملیۆن", en: "AI input tokens — per 1M" },
  ai_output_tokens_per_1m: { ar: "توكن إخراج AI — لكل مليون", ku: "تۆکنی دەرچووی AI — بۆ ١ ملیۆن", en: "AI output tokens — per 1M" },
  outbound_messages_per_1000: { ar: "الرسائل الصادرة — لكل 1000", ku: "نامەی دەرچوو — بۆ ١٠٠٠", en: "Outbound messages — per 1,000" },
  support_storage_gb_month: { ar: "تخزين مرفقات الدعم — GB/شهر", ku: "هەڵگرتنی هاوپێچی پشتگیری — GB/مانگ", en: "Support attachment storage — GB/month" },
  otp_message: { ar: "OTP / رسالة تحقق", ku: "OTP / نامەی پشتڕاستکردنەوە", en: "OTP / verification message" },
  meta_whatsapp_marketing_message: { ar: "WhatsApp — رسالة تسويقية مسلّمة", ku: "WhatsApp — نامەی مارکێتینگ گەیشتوو", en: "WhatsApp — delivered marketing message" },
  meta_whatsapp_utility_message: { ar: "WhatsApp — رسالة خدمية مسلّمة", ku: "WhatsApp — نامەی utility گەیشتوو", en: "WhatsApp — delivered utility message" },
  meta_whatsapp_authentication_message: { ar: "WhatsApp — رسالة مصادقة مسلّمة", ku: "WhatsApp — نامەی authentication گەیشتوو", en: "WhatsApp — delivered authentication message" },
  database_storage_gb_month: { ar: "تخزين قاعدة البيانات — GB/شهر", ku: "هەڵگرتنی بنکەدراوە — GB/مانگ", en: "Database storage — GB/month" },
  network_egress_gb: { ar: "نقل البيانات الصادر — GB", ku: "داتای دەرچوو — GB", en: "Network egress — GB" },
  object_storage_gb_month: { ar: "تخزين الملفات/Objects — GB/شهر", ku: "هەڵگرتنی فایل/Object — GB/مانگ", en: "Object/file storage — GB/month" },
  email_message: { ar: "رسالة بريد إلكتروني", ku: "نامەی ئیمەیڵ", en: "Email message" },
  external_api_1000_requests: { ar: "API خارجي — لكل 1000 طلب", ku: "API دەرەکی — بۆ ١٠٠٠ داواکاری", en: "External API — per 1,000 requests" },
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthOf(value?: string | null) {
  return value ? value.slice(0, 7) : currentMonth();
}

function unitLabel(unit: string) {
  if (unit === "usd_per_1m_tokens") return "USD / 1M tokens";
  if (unit === "usd_per_1000_messages") return "USD / 1,000 messages";
  if (unit === "usd_per_gb_month") return "USD / GB / month";
  if (unit === "usd_per_gb") return "USD / GB";
  if (unit === "usd_per_delivered_message") return "USD / delivered message";
  if (unit === "usd_per_message") return "USD / message";
  if (unit === "usd_per_1000_requests") return "USD / 1,000 requests";
  return unit;
}

function draftFor(rate?: Rate): Draft {
  return {
    provider_key: rate?.provider_key || "",
    rate_usd: rate ? String(rate.rate_usd) : "",
    source_type: rate?.source_type === "provider_rate_card" ? "provider_rate_card" : "owner_configured",
    source_reference: rate?.source_reference || "",
    effective_month: monthOf(rate?.effective_from),
    notes: rate?.notes || "",
  };
}

export default function ProviderCostSettings({ root }: { root: HTMLElement | null }) {
  const { lang } = useI18n();
  const t = TEXT[lang];
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [budget, setBudget] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/admin/provider-costs", {
        headers: getAdminAuthHeaders(),
        cache: "no-store",
      });
      if (response.status === 403 || response.status === 401) {
        setAllowed(false);
        return;
      }
      if (!response.ok) throw new Error(`provider_costs_${response.status}`);
      const body = (await response.json()) as { configuration?: Configuration };
      if (!body.configuration) throw new Error("provider_costs_payload");
      const next = body.configuration;
      setAllowed(true);
      setConfiguration(next);
      setBudget(next.monthly_budget_usd === null ? "" : String(next.monthly_budget_usd));
      const currentByMeter = new Map(
        next.current_rates
          .filter((rate) => rate.dimension_key === "global" && rate.dimension_value === "global")
          .map((rate) => [rate.meter_key, rate]),
      );
      setDrafts(Object.fromEntries(next.catalog.map((meter) => [meter.meter_key, draftFor(currentByMeter.get(meter.meter_key))])));
    } catch {
      setAllowed(false);
      if (open) setError(t.loadFailed);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [open, t.loadFailed]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!root || !allowed) {
      setPortalTarget(null);
      return;
    }
    const costTitles = new Set(["الاستهلاك والتكاليف", "بەکارهێنان و تێچوو", "Usage & costs"]);
    const locate = () => {
      const headings = [...root.querySelectorAll("h2")];
      const heading = headings.find((node) => costTitles.has((node.textContent || "").trim()));
      setPortalTarget((heading?.parentElement as HTMLElement | null) || null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, [allowed, root]);

  const currentByMeter = useMemo(() => new Map(
    (configuration?.current_rates || [])
      .filter((rate) => rate.dimension_key === "global" && rate.dimension_value === "global")
      .map((rate) => [rate.meter_key, rate]),
  ), [configuration]);

  const setDraft = (meterKey: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [meterKey]: { ...(current[meterKey] || draftFor()), ...patch },
    }));
  };

  const saveRate = async (meter: MeterDefinition) => {
    const draft = drafts[meter.meter_key] || draftFor();
    setSavingKey(meter.meter_key);
    setSaved("");
    setError("");
    try {
      const response = await fetch(`/api/auth/admin/provider-costs/rates/${encodeURIComponent(meter.meter_key)}`, {
        method: "PUT",
        headers: { ...getAdminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_key: draft.provider_key,
          rate_usd: draft.rate_usd,
          source_type: draft.source_type,
          source_reference: draft.source_reference || null,
          effective_month: draft.effective_month,
          notes: draft.notes || null,
          dimension_key: "global",
          dimension_value: "global",
        }),
      });
      if (!response.ok) throw new Error(`provider_cost_rate_${response.status}`);
      setSaved(meter.meter_key);
      await load(false);
    } catch {
      setError(t.saveFailed);
    } finally {
      setSavingKey("");
    }
  };

  const saveBudget = async () => {
    setSavingKey("budget");
    setSaved("");
    setError("");
    try {
      const response = await fetch("/api/auth/admin/provider-costs/settings", {
        method: "PATCH",
        headers: { ...getAdminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_budget_usd: budget === "" ? null : budget }),
      });
      if (!response.ok) throw new Error(`provider_cost_budget_${response.status}`);
      setSaved("budget");
      await load(false);
    } catch {
      setError(t.saveFailed);
    } finally {
      setSavingKey("");
    }
  };

  if (!allowed || !configuration) return null;

  const launcher = portalTarget ? createPortal(
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="ms-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-[10px] font-black text-foreground shadow-sm hover:bg-muted"
    >
      <WalletCards className="h-3.5 w-3.5 text-primary" />
      <span className="hidden sm:inline">{t.launch}</span>
    </button>,
    portalTarget,
  ) : null;

  return (
    <>
      {launcher}
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" dir={lang === "en" ? "ltr" : "rtl"}>
            <header className="flex shrink-0 items-start gap-3 border-b px-4 py-3 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><WalletCards className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="font-black">{t.title}</h2>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{t.subtitle}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setOpen(false)} title={t.close}><X className="h-4 w-4" /></Button>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              {error && <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"><AlertTriangle className="h-4 w-4" />{error}</div>}
              <div className="mb-4 rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid min-w-56 gap-1.5 text-xs font-bold">
                    <span>{t.budget}</span>
                    <input type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={t.budgetHint} className="h-9 rounded-lg border bg-background px-3 outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" dir="ltr" />
                  </label>
                  <Button size="sm" className="h-9 gap-1.5" onClick={() => void saveBudget()} disabled={savingKey === "budget"}>{savingKey === "budget" ? <Loader2 className="h-4 w-4 animate-spin" /> : saved === "budget" ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved === "budget" ? t.saved : t.saveBudget}</Button>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void load(true)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t.refresh}</Button>
                </div>
              </div>

              <div className="space-y-3">
                {configuration.catalog.map((meter) => {
                  const current = currentByMeter.get(meter.meter_key);
                  const draft = drafts[meter.meter_key] || draftFor(current);
                  return (
                    <article key={meter.meter_key} className="rounded-xl border bg-card p-3 sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-black">{METER_LABELS[meter.meter_key]?.[lang] || meter.meter_key}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className={`rounded-full border px-2 py-1 font-bold ${meter.usage_authority === "connected" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-muted/40 text-muted-foreground"}`}>{meter.usage_authority === "connected" ? t.connected : t.notConnected}</span>
                            <span className="rounded-full border bg-background px-2 py-1 font-mono">{unitLabel(meter.unit_code)}</span>
                          </div>
                        </div>
                        <div className="text-end text-[10px] text-muted-foreground">
                          <div>{t.current}: <b className="text-foreground" dir="ltr">{current ? `$${current.rate_usd}` : t.noRate}</b></div>
                          {current && <div className="mt-1">{t.sourceLabel}: <b className="text-foreground">{current.source_type === "provider_api" ? t.providerApi : current.source_type === "provider_rate_card" ? t.rateCard : t.ownerConfigured}</b></div>}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                        <label className="grid gap-1 text-[10px] font-bold"><span>{t.provider}</span><input value={draft.provider_key} onChange={(event) => setDraft(meter.meter_key, { provider_key: event.target.value })} placeholder={t.providerPlaceholder} className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" dir="ltr" /></label>
                        <label className="grid gap-1 text-[10px] font-bold"><span>{t.rate}</span><input type="number" min="0" step="any" value={draft.rate_usd} onChange={(event) => setDraft(meter.meter_key, { rate_usd: event.target.value })} className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" dir="ltr" /></label>
                        <label className="grid gap-1 text-[10px] font-bold"><span>{t.source}</span><select value={draft.source_type} onChange={(event) => setDraft(meter.meter_key, { source_type: event.target.value as Draft["source_type"] })} className="h-9 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"><option value="owner_configured">{t.ownerConfigured}</option><option value="provider_rate_card">{t.rateCard}</option></select></label>
                        <label className="grid gap-1 text-[10px] font-bold"><span>{t.effective}</span><input type="month" value={draft.effective_month} onChange={(event) => setDraft(meter.meter_key, { effective_month: event.target.value })} className="h-9 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" dir="ltr" /></label>
                        <label className="grid gap-1 text-[10px] font-bold"><span>{t.reference}</span><input value={draft.source_reference} onChange={(event) => setDraft(meter.meter_key, { source_reference: event.target.value })} placeholder={t.referencePlaceholder} className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" /></label>
                        <label className="grid gap-1 text-[10px] font-bold"><span>{t.notes}</span><input value={draft.notes} onChange={(event) => setDraft(meter.meter_key, { notes: event.target.value })} placeholder={t.notesPlaceholder} className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" /></label>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">{t.sourceProtected}</p>
                        <Button size="sm" className="h-8 gap-1.5" onClick={() => void saveRate(meter)} disabled={savingKey === meter.meter_key || !draft.provider_key.trim() || draft.rate_usd === ""}>{savingKey === meter.meter_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved === meter.meter_key ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}{saved === meter.meter_key ? t.saved : t.save}</Button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border bg-card p-3 sm:p-4">
                <h3 className="text-sm font-black">{t.history}</h3>
                {configuration.history.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">{t.rateHistoryEmpty}</p> : <div className="mt-3 overflow-auto rounded-lg border"><table className="w-full min-w-[760px] text-[11px]"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 text-start">{t.month}</th><th className="px-3 py-2 text-start">{t.provider}</th><th className="px-3 py-2 text-start">{t.rate}</th><th className="px-3 py-2 text-start">{t.sourceLabel}</th><th className="px-3 py-2 text-start">Meter</th></tr></thead><tbody className="divide-y">{configuration.history.map((rate) => <tr key={rate.id}><td className="px-3 py-2" dir="ltr">{rate.effective_from.slice(0, 7)}</td><td className="px-3 py-2" dir="ltr">{rate.provider_key}</td><td className="px-3 py-2 font-bold" dir="ltr">${rate.rate_usd}</td><td className="px-3 py-2">{rate.source_type === "provider_api" ? t.providerApi : rate.source_type === "provider_rate_card" ? t.rateCard : t.ownerConfigured}</td><td className="px-3 py-2 font-mono text-[10px]">{rate.meter_key}</td></tr>)}</tbody></table></div>}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
