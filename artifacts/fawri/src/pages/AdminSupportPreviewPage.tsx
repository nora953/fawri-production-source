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
import { getAdminAuthHeaders, getAdminSessionToken } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

type Snapshot = {
  session: {
    id: string;
    merchant_name: string;
    admin_name: string;
    started_at: string;
    expires_at: string;
    status: string;
  };
  ticket: { id: string; subject: string; status: string };
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
  generated_at: string;
};

type Tab =
  | "overview"
  | "products"
  | "orders"
  | "conversations"
  | "saved"
  | "training"
  | "channels";

type UiLang = "ar" | "ku" | "en";

const TEXT = {
  ar: {
    title: "جلسة قراءة فقط",
    subtitle: "هذه الجلسة مرتبطة بموافقة التاجر والتذكرة الحالية. لا توجد أي أدوات تعديل أو إرسال أو حذف.",
    loading: "جارٍ تحميل بيانات الجلسة...",
    loadError: "تعذر تحميل جلسة القراءة أو انتهت صلاحيتها.",
    retry: "إعادة المحاولة",
    end: "إنهاء الجلسة",
    ending: "جارٍ الإنهاء...",
    back: "العودة إلى لوحة الإدارة",
    remaining: "الوقت المتبقي",
    expired: "انتهت الجلسة",
    overview: "نظرة عامة",
    products: "المنتجات",
    orders: "الطلبات",
    conversations: "المحادثات",
    saved: "الردود المحفوظة",
    training: "التدريب",
    channels: "القنوات",
    empty: "لا توجد بيانات في هذا القسم.",
    store: "المتجر",
    owner: "صاحب المتجر",
    phone: "الهاتف",
    activity: "النشاط",
    account: "حالة الحساب",
    ticket: "التذكرة",
    subscription: "الاشتراك",
    readOnly: "محمي من الخادم للقراءة فقط",
    plan: "الخطة",
    subscriptionStatus: "حالة الاشتراك",
    price: "السعر",
    startDate: "تاريخ البداية",
    endDate: "تاريخ الانتهاء",
    replyLimit: "إجمالي حد الردود",
    repliesUsed: "الردود المستخدمة",
    repliesRemaining: "الردود المتبقية",
    baseReplyLimit: "حد الردود الأساسية",
    baseRepliesUsed: "الأساسية المستخدمة",
    baseRepliesRemaining: "الأساسية المتبقية",
    addonRepliesRemaining: "الردود الإضافية المتبقية",
    emergencyDebt: "دين ردود الطوارئ",
    autoReply: "الرد التلقائي",
    enabled: "مفعّل",
    disabled: "متوقف",
    iqd: "د.ع",
  },
  ku: {
    title: "دانیشتنی تەنها خوێندنەوە",
    subtitle: "ئەم دانیشتنە بە ڕەزامەندی بازرگان و تیکێتی ئێستا بەستراوەتەوە. هیچ ئامرازێکی دەستکاری یان ناردن یان سڕینەوە نییە.",
    loading: "زانیارییەکانی دانیشتن بار دەکرێن...",
    loadError: "بارکردنی دانیشتن سەرکەوتوو نەبوو یان کاتی بەسەرچووە.",
    retry: "هەوڵدانەوە",
    end: "کۆتاییهێنان بە دانیشتن",
    ending: "کۆتایی پێدەهێنرێت...",
    back: "گەڕانەوە بۆ پانێڵی بەڕێوەبردن",
    remaining: "کاتی ماوە",
    expired: "دانیشتن کۆتایی هات",
    overview: "پوختە",
    products: "بەرهەمەکان",
    orders: "داواکارییەکان",
    conversations: "گفتوگۆکان",
    saved: "وەڵامە پاشەکەوتکراوەکان",
    training: "ڕاهێنان",
    channels: "کەناڵەکان",
    empty: "هیچ زانیارییەک لەم بەشەدا نییە.",
    store: "فرۆشگا",
    owner: "خاوەنی فرۆشگا",
    phone: "تەلەفۆن",
    activity: "چالاکی",
    account: "دۆخی هەژمار",
    ticket: "تیکێت",
    subscription: "بەشداریکردن",
    readOnly: "لە سێرڤەرەوە تەنها بۆ خوێندنەوە پارێزراوە",
    plan: "پلان",
    subscriptionStatus: "دۆخی بەشداریکردن",
    price: "نرخ",
    startDate: "بەرواری دەستپێک",
    endDate: "بەرواری کۆتایی",
    replyLimit: "کۆی سنووری وەڵامەکان",
    repliesUsed: "وەڵامە بەکارهاتووەکان",
    repliesRemaining: "وەڵامە ماوەکان",
    baseReplyLimit: "سنووری وەڵامە بنەڕەتییەکان",
    baseRepliesUsed: "بنەڕەتییە بەکارهاتووەکان",
    baseRepliesRemaining: "بنەڕەتییە ماوەکان",
    addonRepliesRemaining: "وەڵامە زیادکراوە ماوەکان",
    emergencyDebt: "قەرزی وەڵامی فریاکەوتن",
    autoReply: "وەڵامی خۆکار",
    enabled: "چالاکە",
    disabled: "ناچالاکە",
    iqd: "د.ع",
  },
  en: {
    title: "Read-only support session",
    subtitle: "This session is bound to the merchant's approval and the current support ticket. No edit, send, export, or delete tools are available.",
    loading: "Loading session data...",
    loadError: "The read-only session could not be loaded or has ended.",
    retry: "Try again",
    end: "End session",
    ending: "Ending...",
    back: "Back to admin panel",
    remaining: "Time remaining",
    expired: "Session ended",
    overview: "Overview",
    products: "Products",
    orders: "Orders",
    conversations: "Conversations",
    saved: "Saved answers",
    training: "Training",
    channels: "Channels",
    empty: "No data is available in this section.",
    store: "Store",
    owner: "Store owner",
    phone: "Phone",
    activity: "Activity",
    account: "Account status",
    ticket: "Ticket",
    subscription: "Subscription",
    readOnly: "Server-enforced read-only access",
    plan: "Plan",
    subscriptionStatus: "Subscription status",
    price: "Price",
    startDate: "Start date",
    endDate: "Expiry date",
    replyLimit: "Total reply limit",
    repliesUsed: "Replies used",
    repliesRemaining: "Replies remaining",
    baseReplyLimit: "Base reply limit",
    baseRepliesUsed: "Base replies used",
    baseRepliesRemaining: "Base replies remaining",
    addonRepliesRemaining: "Add-on replies remaining",
    emergencyDebt: "Emergency reply debt",
    autoReply: "Auto reply",
    enabled: "Enabled",
    disabled: "Disabled",
    iqd: "IQD",
  },
} as const;

const PLAN_LABELS: Record<UiLang, Record<string, string>> = {
  ar: {
    silver: "الفضية",
    gold: "الذهبية",
    diamond: "الماسية",
  },
  ku: {
    silver: "زیوی",
    gold: "زێڕین",
    diamond: "ئەڵماسی",
  },
  en: {
    silver: "Silver",
    gold: "Gold",
    diamond: "Diamond",
  },
};

const STATUS_LABELS: Record<UiLang, Record<string, string>> = {
  ar: {
    active: "نشط",
    approved: "موافق عليه",
    pending: "قيد الانتظار",
    pending_activation: "بانتظار التفعيل",
    expired: "منتهي",
    suspended: "موقوف",
    retention_suspended: "موقوف بسبب الاحتفاظ",
    replies_exhausted: "نفدت الردود",
    rejected: "مرفوض",
    inactive: "غير نشط",
    open: "مفتوح",
    in_progress: "قيد المعالجة",
    resolved: "تم الحل",
    closed: "مغلق",
  },
  ku: {
    active: "چالاک",
    approved: "پەسەندکراو",
    pending: "چاوەڕوان",
    pending_activation: "چاوەڕوانی چالاککردن",
    expired: "بەسەرچوو",
    suspended: "ڕاگیراو",
    retention_suspended: "بەهۆی پاراستنەوە ڕاگیراو",
    replies_exhausted: "وەڵامەکان تەواوبوون",
    rejected: "ڕەتکراوە",
    inactive: "ناچالاک",
    open: "کراوە",
    in_progress: "لە ژێر چارەسەرکردندایە",
    resolved: "چارەسەرکرا",
    closed: "داخراو",
  },
  en: {
    active: "Active",
    approved: "Approved",
    pending: "Pending",
    pending_activation: "Pending activation",
    expired: "Expired",
    suspended: "Suspended",
    retention_suspended: "Retention suspended",
    replies_exhausted: "Replies exhausted",
    rejected: "Rejected",
    inactive: "Inactive",
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    closed: "Closed",
  },
};

const COUNT_LABELS: Record<UiLang, Record<string, string>> = {
  ar: {
    products: "المنتجات",
    orders: "الطلبات",
    conversations: "المحادثات",
    saved_answers: "الردود المحفوظة",
    training_requests: "طلبات التدريب",
    learned_answers: "الردود المتعلّمة",
    channels: "القنوات",
  },
  ku: {
    products: "بەرهەمەکان",
    orders: "داواکارییەکان",
    conversations: "گفتوگۆکان",
    saved_answers: "وەڵامە پاشەکەوتکراوەکان",
    training_requests: "داواکارییەکانی ڕاهێنان",
    learned_answers: "وەڵامە فێربووەکان",
    channels: "کەناڵەکان",
  },
  en: {
    products: "Products",
    orders: "Orders",
    conversations: "Conversations",
    saved_answers: "Saved answers",
    training_requests: "Training requests",
    learned_answers: "Learned answers",
    channels: "Channels",
  },
};

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "object") return "—";
  return String(value);
}

function localizedValue(
  value: unknown,
  labels: Record<string, string>,
): string {
  const raw = valueText(value);
  return labels[raw.toLowerCase()] || raw;
}

function formatNumber(value: unknown, locale: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(locale).format(number);
}

function formatDate(value: unknown, locale: string): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function RecordList({
  records,
  empty,
}: {
  records: Array<Record<string, unknown>>;
  empty: string;
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {empty}
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
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(record)
              .filter(
                ([key]) =>
                  ![
                    "merchant_id",
                    "page_access_token",
                    "access_token",
                    "password",
                    "token",
                  ].includes(key),
              )
              .slice(0, 18)
              .map(([key, value]) => (
                <div key={key} className="min-w-0 rounded-xl bg-muted/35 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {key.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 break-all text-sm">{valueText(value)}</p>
                </div>
              ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AdminSupportPreviewPage({
  sessionId,
}: {
  sessionId: string;
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
      if (!getAdminSessionToken()) {
        setLocation("/login");
        return;
      }
      if (!silent) setLoading(true);
      setError(false);
      try {
        const response = await fetch(
          `/api/auth/admin/support-preview/${encodeURIComponent(sessionId)}/snapshot`,
          { headers: getAdminAuthHeaders(), cache: "no-store" },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data.snapshot) {
          throw new Error(data?.error || "invalid snapshot");
        }
        setSnapshot(data.snapshot as Snapshot);
      } catch (loadError) {
        console.error("Could not load support preview:", loadError);
        if (!silent) setError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionId, setLocation],
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
          (new Date(snapshot.session.expires_at).getTime() - nowMs) / 1000,
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
      await fetch(
        `/api/auth/admin/support-preview/${encodeURIComponent(sessionId)}/end`,
        { method: "POST", headers: getAdminAuthHeaders() },
      );
    } finally {
      setLocation("/admin");
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="me-2 h-5 w-5 animate-spin" />
        {text.loading}
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background p-4"
        dir={dir}
      >
        <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-4 font-black">{text.loadError}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => void load()}>
              <RefreshCw className="me-2 h-4 w-4" />
              {text.retry}
            </Button>
            <Button variant="outline" onClick={() => setLocation("/admin")}>
              <ArrowLeft className="me-2 h-4 w-4" />
              {text.back}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const merchant = snapshot.merchant;
  const subscription = snapshot.subscription;
  const subscriptionFields = subscription
    ? [
        [text.plan, localizedValue(subscription.plan_name, PLAN_LABELS[uiLang])],
        [
          text.subscriptionStatus,
          localizedValue(subscription.status, STATUS_LABELS[uiLang]),
        ],
        [text.price, `${formatNumber(subscription.price_iqd, locale)} ${text.iqd}`],
        [text.startDate, formatDate(subscription.start_date, locale)],
        [text.endDate, formatDate(subscription.expires_at, locale)],
        [text.replyLimit, formatNumber(subscription.reply_limit, locale)],
        [text.repliesUsed, formatNumber(subscription.replies_used, locale)],
        [text.repliesRemaining, formatNumber(subscription.replies_remaining, locale)],
        [text.baseReplyLimit, formatNumber(subscription.base_reply_limit, locale)],
        [text.baseRepliesUsed, formatNumber(subscription.base_replies_used, locale)],
        [text.baseRepliesRemaining, formatNumber(subscription.base_replies_remaining, locale)],
        [text.addonRepliesRemaining, formatNumber(subscription.addon_replies_remaining, locale)],
        ...(Number(subscription.emergency_debt) > 0
          ? [[text.emergencyDebt, formatNumber(subscription.emergency_debt, locale)]]
          : []),
        [
          text.autoReply,
          subscription.auto_reply_enabled === true ? text.enabled : text.disabled,
        ],
      ]
    : [];
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
              {snapshot.session.merchant_name} · {snapshot.ticket.subject}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground">{text.remaining}</p>
            <p className="font-black tabular-nums" dir="ltr">
              {remainingSeconds > 0 ? remaining : text.expired}
            </p>
          </div>
          <Button
            variant="destructive"
            disabled={ending}
            onClick={() => void endSession()}
          >
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
              <span className="rounded-full bg-background/20 px-1.5 text-[10px]">
                {count}
              </span>
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="grid min-w-0 gap-4 lg:grid-cols-3">
            <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2">
              <h2 className="font-black">{text.store}</h2>
              <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                {[
                  [text.store, merchant.store_name],
                  [text.owner, merchant.owner_name],
                  [text.phone, merchant.phone],
                  [text.activity, merchant.activity_type],
                  [
                    text.account,
                    localizedValue(merchant.status, STATUS_LABELS[uiLang]),
                  ],
                  [text.ticket, snapshot.ticket.id],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0 rounded-xl bg-muted/35 p-3">
                    <p className="text-xs text-muted-foreground">{String(label)}</p>
                    <p className="mt-1 break-all font-bold">{valueText(value)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-black">{text.subscription}</h2>
              <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {subscription ? (
                  subscriptionFields.map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="min-w-0 rounded-xl bg-muted/35 px-3 py-2"
                    >
                      <p className="text-xs text-muted-foreground">{String(label)}</p>
                      <p className="mt-1 break-words text-sm font-bold" dir="auto">
                        {String(value)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{text.empty}</p>
                )}
              </div>
            </section>

            <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
              {Object.entries(snapshot.counts).map(([key, value]) => (
                <div
                  key={key}
                  className="min-w-0 rounded-2xl border bg-card p-4 text-center shadow-sm"
                >
                  <p className="text-2xl font-black tabular-nums">{value}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {COUNT_LABELS[uiLang][key] || key.replaceAll("_", " ")}
                  </p>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <RecordList records={sectionRecords} empty={text.empty} />
        )}
      </main>
    </div>
  );
}
