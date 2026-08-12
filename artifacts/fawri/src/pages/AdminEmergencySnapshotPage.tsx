import {
  ADMIN_EMERGENCY_SNAPSHOT_PAGE_FIELD_LABELS,
  ADMIN_EMERGENCY_SNAPSHOT_PAGE_STATUS_LABELS,
  ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT,
} from '@/lib/translations/features/pages/AdminEmergencySnapshotPage';
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Eye,
  GraduationCap,
  Headphones,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  clearSession,
  getAdminAuthHeaders,
} from "@/lib/store";

type UiLang = "ar" | "ku" | "en";
type Tab =
  | "overview"
  | "products"
  | "orders"
  | "conversations"
  | "saved"
  | "training"
  | "channels";

type Snapshot = {
  merchant: Record<string, unknown>;
  subscription: Record<string, unknown> | null;
  products: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  saved_answers: Array<Record<string, unknown>>;
  training_requests: Array<Record<string, unknown>>;
  learned_answers: Array<Record<string, unknown>>;
  channels: Array<Record<string, unknown>>;
  counts: Record<string, number>;
  emergency_access: {
    request_id: string;
    incident_reference: string;
    severity: string;
    reason: string;
    expires_at: string;
  };
  generated_at: string;
};

const TEXT = ADMIN_EMERGENCY_SNAPSHOT_PAGE_TEXT;

const FIELD_LABELS: Record<UiLang, Record<string, string>> = ADMIN_EMERGENCY_SNAPSHOT_PAGE_FIELD_LABELS;

const STATUS_LABELS: Record<UiLang, Record<string, string>> = ADMIN_EMERGENCY_SNAPSHOT_PAGE_STATUS_LABELS;

const SENSITIVE_KEYS = new Set([
  "id",
  "merchant_id",
  "admin_id",
  "request_id",
  "password",
  "password_hash",
  "token",
  "access_token",
  "page_access_token",
  "otp",
  "otp_code",
  "secret",
]);

function formatDate(value: unknown, locale: string): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: unknown, locale: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(locale).format(number);
}

function localizedValue(
  value: unknown,
  lang: UiLang,
  locale: string,
  text: (typeof TEXT)[UiLang],
  key = "",
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? text.yes : text.no;
  if (Array.isArray(value)) return `${formatNumber(value.length, locale)} ${text.items}`;
  if (typeof value === "object") return text.extraData;
  if (
    key.endsWith("_at") ||
    key.endsWith("_date") ||
    key === "expires_at" ||
    key === "start_date"
  ) {
    const formatted = formatDate(value, locale);
    if (formatted !== "—") return formatted;
  }
  const raw = String(value);
  const translated = STATUS_LABELS[lang][raw.toLowerCase()];
  if (translated) return translated;
  if (key === "price_iqd" || key === "total_iqd") {
    return `${formatNumber(value, locale)} ${text.iqd}`;
  }
  if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(raw)) {
    return formatNumber(value, locale);
  }
  return raw;
}

function DataGrid({
  data,
  lang,
  locale,
  text,
}: {
  data: Record<string, unknown> | null;
  lang: UiLang;
  locale: string;
  text: (typeof TEXT)[UiLang];
}) {
  if (!data) return <p className="text-sm text-muted-foreground">{text.empty}</p>;

  const entries = Object.entries(data).filter(
    ([key, value]) =>
      !SENSITIVE_KEYS.has(key) &&
      FIELD_LABELS[lang][key] &&
      value !== undefined,
  );

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{text.empty}</p>;
  }

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0 rounded-xl bg-muted/35 p-3">
          <p className="text-xs text-muted-foreground">{FIELD_LABELS[lang][key]}</p>
          <p className="mt-1 break-words font-bold">
            {localizedValue(value, lang, locale, text, key)}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecordList({
  records,
  lang,
  locale,
  text,
}: {
  records: Array<Record<string, unknown>>;
  lang: UiLang;
  locale: string;
  text: (typeof TEXT)[UiLang];
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {text.empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record, index) => (
        <article
          key={String(record.id || record.page_id || index)}
          className="min-w-0 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm"
        >
          <DataGrid data={record} lang={lang} locale={locale} text={text} />
        </article>
      ))}
    </div>
  );
}

export default function AdminEmergencySnapshotPage({
  requestId,
}: {
  requestId: string;
}) {
  const { lang, dir } = useI18n();
  const [, setLocation] = useLocation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ending, setEnding] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [tab, setTab] = useState<Tab>("overview");

  const uiLang: UiLang = lang === "en" ? "en" : lang === "ku" ? "ku" : "ar";
  const text = TEXT[uiLang];
  const locale = uiLang === "en" ? "en-US" : uiLang === "ku" ? "ckb-IQ" : "ar-IQ";

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(false);
      try {
        const response = await fetch(
          `/api/auth/admin/emergency-read-access/requests/${encodeURIComponent(requestId)}/snapshot`,
          { headers: getAdminAuthHeaders(), cache: "no-store" },
        );
        if (response.status === 401) {
          clearSession();
          setLocation("/login");
          return;
        }
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data.snapshot) {
          throw new Error(data?.error || "invalid emergency snapshot");
        }
        setSnapshot(data.snapshot as Snapshot);
      } catch (loadError) {
        console.error("Could not load emergency snapshot:", loadError);
        if (!silent) setError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [requestId, setLocation],
  );

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(true), 10_000);
    const clock = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  const remainingSeconds = snapshot
    ? Math.max(
        0,
        Math.floor(
          (new Date(snapshot.emergency_access.expires_at).getTime() - nowMs) /
            1000,
        ),
      )
    : 0;
  const remaining = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(
    remainingSeconds % 60,
  ).padStart(2, "0")}`;

  const tabs = useMemo(
    () => [
      { id: "overview" as const, label: text.overview, icon: Eye, count: 1 },
      {
        id: "products" as const,
        label: text.products,
        icon: Package,
        count: snapshot?.products.length || 0,
      },
      {
        id: "orders" as const,
        label: text.orders,
        icon: ShoppingBag,
        count: snapshot?.orders.length || 0,
      },
      {
        id: "conversations" as const,
        label: text.conversations,
        icon: MessageSquare,
        count: snapshot?.conversations.length || 0,
      },
      {
        id: "saved" as const,
        label: text.saved,
        icon: Boxes,
        count: snapshot?.saved_answers.length || 0,
      },
      {
        id: "training" as const,
        label: text.training,
        icon: GraduationCap,
        count:
          (snapshot?.training_requests.length || 0) +
          (snapshot?.learned_answers.length || 0),
      },
      {
        id: "channels" as const,
        label: text.channels,
        icon: Headphones,
        count: snapshot?.channels.length || 0,
      },
    ],
    [snapshot, text],
  );

  const endSession = async () => {
    setEnding(true);
    try {
      const response = await fetch(
        `/api/auth/admin/emergency-read-access/requests/${encodeURIComponent(requestId)}/end`,
        { method: "POST", headers: getAdminAuthHeaders() },
      );
      if (response.status === 401) {
        clearSession();
        setLocation("/login");
        return;
      }
    } finally {
      setLocation("/admin/emergency-access");
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" dir={dir}>
        <Loader2 className="me-2 h-5 w-5 animate-spin" />
        {text.loading}
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4" dir={dir}>
        <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-4 font-black">{text.loadError}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => void load()}>
              <RefreshCw className="me-2 h-4 w-4" />
              {text.retry}
            </Button>
            <Button variant="outline" onClick={() => setLocation("/admin/emergency-access")}>
              <ArrowLeft className="me-2 h-4 w-4" />
              {text.back}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sectionRecords =
    tab === "products"
      ? snapshot.products
      : tab === "orders"
        ? snapshot.orders
        : tab === "conversations"
          ? snapshot.conversations
          : tab === "saved"
            ? snapshot.saved_answers
            : tab === "training"
              ? [...snapshot.training_requests, ...snapshot.learned_answers]
              : tab === "channels"
                ? snapshot.channels
                : [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-muted/20" dir={dir}>
      <header className="sticky top-0 z-40 border-b border-emerald-300 bg-background/95 shadow-sm backdrop-blur dark:border-emerald-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-black">{text.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {String(snapshot.merchant.store_name || "—")} · {snapshot.emergency_access.incident_reference}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground">{text.remaining}</p>
            <p className="font-black tabular-nums" dir="ltr">
              {remainingSeconds > 0 ? remaining : text.expired}
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/admin/emergency-access")}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {text.back}
          </Button>
          <Button variant="destructive" disabled={ending} onClick={() => void endSession()}>
            {ending ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="me-2 h-4 w-4" />
            )}
            {ending ? text.ending : text.end}
          </Button>
        </div>
        <div className="border-t bg-emerald-50 px-4 py-2 text-center text-xs font-bold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          {text.readOnly} — {text.subtitle}
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-7xl p-4 md:p-6">
        <div className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${
                tab === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{count}</span>
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="min-w-0 space-y-4">
            <section className="grid min-w-0 gap-3 sm:grid-cols-3">
              {[
                [text.incident, snapshot.emergency_access.incident_reference],
                [text.reason, snapshot.emergency_access.reason],
                [text.generatedAt, formatDate(snapshot.generated_at, locale)],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">{String(label)}</p>
                  <p className="mt-1 break-words font-bold">{String(value || "—")}</p>
                </div>
              ))}
            </section>

            <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-black">{text.store}</h2>
              <div className="mt-4">
                <DataGrid data={snapshot.merchant} lang={uiLang} locale={locale} text={text} />
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-black">{text.subscription}</h2>
              <div className="mt-4">
                <DataGrid data={snapshot.subscription} lang={uiLang} locale={locale} text={text} />
              </div>
            </section>
          </div>
        ) : (
          <RecordList records={sectionRecords} lang={uiLang} locale={locale} text={text} />
        )}
      </main>
    </div>
  );
}
