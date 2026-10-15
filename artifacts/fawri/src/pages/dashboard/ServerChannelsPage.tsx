import { SERVER_CHANNELS_PAGE_COPY } from '@/lib/translations/features/pages/dashboard/ServerChannelsPage';
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type MetaPlatform = "messenger" | "instagram";
type ServerChannelStatus =
  | "connecting"
  | "active"
  | "disconnecting"
  | "disconnected"
  | "error";
type ProductChannelStatus = "activation_pending" | "coming_soon" | "development";

type ServerChannelSummary = {
  id: string;
  merchant_id?: string;
  platform: MetaPlatform;
  page_id: string;
  page_name: string;
  instagram_account_id?: string;
  instagram_username?: string;
  status: ServerChannelStatus;
  webhook_subscribed: boolean;
  credential_configured: boolean;
  connection_version: number;
  connected_at?: string;
  disconnect_requested_at?: string;
  disconnected_at?: string;
  last_error_code?: string;
  created_at?: string;
  updated_at: string;
};

type ChannelsResponse = {
  ok?: unknown;
  channels?: unknown;
  code?: unknown;
  error?: unknown;
  current?: unknown;
};

type ProductChannel = {
  id: "instagram" | "messenger" | "whatsapp" | "web-chat" | "telegram" | "tiktok";
  name: string;
  description: string;
  status: ProductChannelStatus;
  iconSrc: string;
  iconAlt: string;
  features: string[];
};

const copy = SERVER_CHANNELS_PAGE_COPY;

function isServerChannelSummary(value: unknown): value is ServerChannelSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const channel = value as Record<string, unknown>;
  const statuses: ServerChannelStatus[] = [
    "connecting",
    "active",
    "disconnecting",
    "disconnected",
    "error",
  ];

  return (
    typeof channel.id === "string" &&
    (channel.platform === "messenger" || channel.platform === "instagram") &&
    typeof channel.page_id === "string" &&
    typeof channel.page_name === "string" &&
    typeof channel.status === "string" &&
    statuses.includes(channel.status as ServerChannelStatus) &&
    typeof channel.webhook_subscribed === "boolean" &&
    typeof channel.credential_configured === "boolean" &&
    Number.isInteger(channel.connection_version) &&
    Number(channel.connection_version) >= 1 &&
    typeof channel.updated_at === "string"
  );
}

async function readJson(response: Response): Promise<ChannelsResponse> {
  return response.json().catch(() => ({
    ok: false,
    error: "Invalid server response",
  }));
}

function statusBadgeClass(status: ProductChannelStatus) {
  if (status === "activation_pending") {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300";
  }
  if (status === "coming_soon") {
    return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
  }
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
}

export default function ServerChannelsPage() {
  const { t, lang, dir } = useI18n();
  const text = copy[lang];
  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";
  const [channels, setChannels] = useState<ServerChannelSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyChannel, setBusyChannel] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/channels", {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await readJson(response);
      if (!response.ok || body.ok !== true || !Array.isArray(body.channels)) {
        throw new Error(text.unavailable);
      }
      if (!body.channels.every(isServerChannelSummary)) {
        throw new Error(text.unavailable);
      }
      setChannels(body.channels);
    } catch {
      setChannels(null);
      setError(text.unavailable);
    } finally {
      setLoading(false);
    }
  }, [text.unavailable]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disconnect = async (channel: ServerChannelSummary) => {
    if (channel.status !== "active" && channel.status !== "error") return;

    setBusyChannel(channel.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/channels/meta/${encodeURIComponent(channel.platform)}/${encodeURIComponent(channel.page_id)}/disconnect`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ expected_version: channel.connection_version }),
        },
      );
      const body = await readJson(response);

      if (response.status === 409) {
        await refresh();
        setError(text.conflict);
        return;
      }
      if (!response.ok || body.ok !== true) {
        throw new Error(text.disconnectFailed);
      }

      await refresh();
      setNotice(text.disconnectQueued);
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : text.disconnectFailed,
      );
    } finally {
      setBusyChannel("");
    }
  };

  const productChannels: ProductChannel[] = [
    {
      id: "instagram",
      name: t.channels_page_instagram_name,
      description: text.activationPendingDescription,
      status: "activation_pending",
      iconSrc: "/channel-icons/instagram.svg",
      iconAlt: "Instagram logo",
      features: [
        t.channels_page_feature_messages,
        t.channels_page_feature_comments,
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_orders,
      ],
    },
    {
      id: "messenger",
      name: t.channels_page_messenger_name,
      description: text.activationPendingDescription,
      status: "activation_pending",
      iconSrc: "/channel-icons/facebook-messenger.svg",
      iconAlt: "Facebook Messenger logo",
      features: [
        t.channels_page_feature_messages,
        t.channels_page_feature_comments,
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_orders,
      ],
    },
    {
      id: "whatsapp",
      name: t.channels_page_whatsapp_name,
      description: t.channels_page_whatsapp_desc,
      status: "coming_soon",
      iconSrc: "/channel-icons/whatsapp-business.svg",
      iconAlt: "WhatsApp Business logo",
      features: [
        t.channels_page_feature_messages,
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_orders,
      ],
    },
    {
      id: "web-chat",
      name: t.channels_page_web_chat_name,
      description: t.channels_page_web_chat_desc,
      status: "development",
      iconSrc: "/channel-icons/web-chat.svg",
      iconAlt: "Web Chat icon",
      features: [
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_products,
        t.channels_page_feature_live_chat,
      ],
    },
    {
      id: "telegram",
      name: t.channels_page_telegram_name,
      description: t.channels_page_telegram_desc,
      status: "development",
      iconSrc: "/channel-icons/telegram.svg",
      iconAlt: "Telegram logo",
      features: [
        t.channels_page_feature_bot,
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_orders,
      ],
    },
    {
      id: "tiktok",
      name: t.channels_page_tiktok_name,
      description: t.channels_page_tiktok_desc,
      status: "development",
      iconSrc: "/channel-icons/tiktok.svg",
      iconAlt: "TikTok logo",
      features: [t.channels_page_feature_auto_reply, t.channels_page_feature_roadmap],
    },
  ];

  const getProductStatusLabel = (status: ProductChannelStatus) => {
    if (status === "activation_pending") return text.activationPending;
    if (status === "coming_soon") return text.comingSoon;
    return text.development;
  };

  const activeCount = channels?.filter((channel) => channel.status === "active").length;
  const renderSummaryNumber = (value: number | undefined) => {
    if (loading) return "…";
    if (!channels || value === undefined) return "—";
    return value.toLocaleString(locale);
  };

  return (
    <main className="min-h-screen bg-background p-4 pb-24" dir={dir}>
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black tracking-tight">{t.channels_page_title}</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              {text.serverDescription}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            {text.refresh}
          </Button>
        </header>

        <section className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-orange-900/60 dark:bg-orange-950/20">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background shadow-sm">
              <ShieldCheck className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground">{text.newMetaTitle}</h2>
              <p className="mt-2 leading-7 text-muted-foreground">
                {text.activationPendingDescription}
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {text.existingDescription}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border bg-card p-5 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-950/30">
              <Link2 className="h-5 w-5" />
            </div>
            <div className="text-4xl font-black text-foreground">
              {renderSummaryNumber(activeCount)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{text.activeCount}</p>
          </div>
          <div className="rounded-3xl border bg-card p-5 text-center shadow-sm">
            <div className="text-4xl font-black text-foreground">
              {renderSummaryNumber(channels?.length)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{text.recordCount}</p>
          </div>
        </section>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
            {notice}
          </div>
        ) : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-black text-foreground">{text.serverTitle}</h2>
          </div>

          {loading ? (
            <div className="rounded-3xl border bg-card p-8 text-center text-muted-foreground">
              {text.loading}
            </div>
          ) : channels === null ? (
            <div className="rounded-3xl border bg-card p-8 text-center text-muted-foreground">
              {text.unavailable}
            </div>
          ) : channels.length === 0 ? (
            <div className="rounded-3xl border bg-card p-8 text-center">
              <h3 className="text-xl font-black">{text.noRecords}</h3>
              <p className="mt-2 text-muted-foreground">
                {text.activationPendingDescription}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {channels.map((channel) => {
                const canDisconnect =
                  channel.status === "active" || channel.status === "error";
                const busy = busyChannel === channel.id;
                const updated = new Date(channel.updated_at);
                const updatedLabel = Number.isFinite(updated.getTime())
                  ? updated.toLocaleString(locale)
                  : channel.updated_at;

                return (
                  <article key={channel.id} className="rounded-3xl border bg-card p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                          {channel.platform === "instagram"
                            ? t.channels_page_instagram_name
                            : t.channels_page_messenger_name}
                        </p>
                        <h3 className="mt-1 break-words text-2xl font-black text-foreground">
                          {channel.page_name}
                        </h3>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {text.pageId}: {channel.page_id}
                        </p>
                        {channel.instagram_username ? (
                          <p className="mt-1 text-sm font-semibold text-muted-foreground">
                            {text.username}: @{channel.instagram_username}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant={channel.status === "active" ? "default" : "secondary"}>
                        {text.status[channel.status]}
                      </Badge>
                    </div>

                    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-2xl bg-muted/50 p-3">
                        <dt className="text-muted-foreground">{text.webhook}</dt>
                        <dd className="mt-1 font-bold">
                          {channel.webhook_subscribed ? text.subscribed : text.notSubscribed}
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-muted/50 p-3">
                        <dt className="text-muted-foreground">{text.credential}</dt>
                        <dd className="mt-1 font-bold">
                          {channel.credential_configured ? text.configured : text.removed}
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-muted/50 p-3">
                        <dt className="text-muted-foreground">{text.version}</dt>
                        <dd className="mt-1 font-bold tabular-nums" dir="ltr">
                          {channel.connection_version}
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-muted/50 p-3">
                        <dt className="text-muted-foreground">{text.lastUpdated}</dt>
                        <dd className="mt-1 font-bold">{updatedLabel}</dd>
                      </div>
                    </dl>

                    {channel.last_error_code ? (
                      <p className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
                        {channel.last_error_code}
                      </p>
                    ) : null}

                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-5 w-full rounded-2xl"
                      disabled={!canDisconnect || busy || channel.status === "disconnecting"}
                      onClick={() => void disconnect(channel)}
                    >
                      {busy || channel.status === "disconnecting"
                        ? text.disconnecting
                        : text.disconnect}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-black text-foreground">{t.channels_page_title}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {productChannels.map((channel) => (
              <article key={channel.id} className="rounded-3xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-black text-foreground">{channel.name}</h3>
                      <Badge className={`border ${statusBadgeClass(channel.status)}`}>
                        {getProductStatusLabel(channel.status)}
                      </Badge>
                    </div>
                    <p className="mt-3 leading-7 text-muted-foreground">{channel.description}</p>
                  </div>
                  <img
                    src={channel.iconSrc}
                    alt={channel.iconAlt}
                    className="h-12 w-12 shrink-0 object-contain"
                    loading="lazy"
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {channel.features.map((feature) => (
                    <span
                      key={`${channel.id}-${feature}`}
                      className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-foreground"
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                <Button type="button" variant="outline" className="mt-5 w-full" disabled>
                  {channel.status === "activation_pending"
                    ? text.newConnectionUnavailable
                    : getProductStatusLabel(channel.status)}
                </Button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
