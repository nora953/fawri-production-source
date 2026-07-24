import React from "react";
import { useI18n } from "@/lib/i18n";
import { getCurrentMerchant } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ClipboardCheck,
  Info,
  Link2,
  LockKeyhole,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";type ChannelStatus = "available" | "coming_soon" | "development";

type Channel = {
  id: string;
  name: string;
  description: string;
  status: ChannelStatus;
  iconSrc: string;
  iconAlt: string;
  features: string[];
};function getStatusClass(status: ChannelStatus) {
  if (status === "available") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  }

  if (status === "coming_soon") {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
}

function getIconBoxClass(status: ChannelStatus) {
  if (status === "development") {
    return "bg-zinc-50 opacity-80 grayscale dark:bg-zinc-900";
  }

  return "bg-orange-50 dark:bg-orange-950/30";
}

export default function ChannelsPage() {
  const { t, dir } = useI18n();
  const merchant = getCurrentMerchant();

  if (!merchant) return null;

  const channels: Channel[] = [
    {
      id: "instagram",
      name: t.channels_page_instagram_name,
      description: t.channels_page_instagram_desc,
      status: "available",
      iconSrc: "/channel-icons/instagram.svg",
      iconAlt: "Instagram logo",
      features: [
        t.channels_page_feature_messages,
        t.channels_page_feature_comments,
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_orders,
        t.channels_page_feature_ownership,
      ],
    },
    {
      id: "messenger",
      name: t.channels_page_messenger_name,
      description: t.channels_page_messenger_desc,
      status: "available",
      iconSrc: "/channel-icons/facebook-messenger.svg",
      iconAlt: "Facebook Messenger logo",
      features: [
        t.channels_page_feature_messages,
        t.channels_page_feature_comments,
        t.channels_page_feature_auto_reply,
        t.channels_page_feature_orders,
        t.channels_page_feature_ownership,
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
      features: [t.channels_page_feature_bot, t.channels_page_feature_auto_reply, t.channels_page_feature_orders],
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

  const summary = {
    connected: 0,
    activation: channels.filter((channel) => channel.status === "available")
      .length,
    roadmap: channels.filter((channel) => channel.status !== "available")
      .length,
  };

  const guideItems = [
    t.channels_page_guide1,
    t.channels_page_guide2,
    t.channels_page_guide3,
    t.channels_page_guide4,
    t.channels_page_guide5,
  ];

  const getStatusLabel = (status: ChannelStatus) => {
    if (status === "available") return t.channels_page_status_available;
    if (status === "coming_soon") return t.channels_page_status_coming_soon;
    return t.channels_page_status_development;
  };

  const getActionLabel = (status: ChannelStatus) => {
    if (status === "available") return t.channels_page_request_activation;
    if (status === "coming_soon") return t.channels_page_status_coming_soon;
    return t.channels_page_status_development;
  };

  const getToastMessage = (status: ChannelStatus) => {
    if (status === "available") return t.channels_page_activation_requested;
    if (status === "coming_soon") return t.channels_page_coming_soon_message;
    return t.channels_page_development_message;
  };

  const handleChannelAction = (channel: Channel) => {
    const message = getToastMessage(channel.status);

    if (channel.status !== "available") {
      toast.info(message);
      return;
    }

    if (channel.id === "messenger") {
      if (!merchant?.id) {
        toast.error(t.channels_page_login_required);
        return;
      }

      const loginUrl =
        `/api/meta/login?merchantId=${encodeURIComponent(merchant.id)}` +
        `&platform=messenger`;

      window.location.assign(loginUrl);
      return;
    }

    // Instagram OAuth will be enabled after the API stores the linked
    // Instagram professional account instead of treating it as Messenger.
    toast.info(message);
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 p-4 pb-28"
      dir={dir}
    >
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl">
                {t.channels_page_title}
              </h1>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                {t.channels_page_subtitle}
              </p>
            </div>

            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-card shadow-sm sm:flex">
              <Info className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50/80 p-6 shadow-sm dark:border-orange-900/60 dark:bg-orange-950/20">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-background shadow-sm">
              <LockKeyhole className="h-8 w-8 text-orange-600" />
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-black text-orange-900 dark:text-orange-200">
                {t.channels_page_security_title}
              </h2>
              <p className="text-lg leading-9 text-orange-950/80 dark:text-orange-100/80">
                {t.channels_page_security_desc}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-3xl border bg-card p-4 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Link2 className="h-6 w-6" />
            </div>
            <div className="text-4xl font-black text-foreground">
              {summary.connected}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
              {t.channels_page_connected_count}
            </p>
          </div>

          <div className="rounded-3xl border bg-card p-4 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="text-4xl font-black text-foreground">
              {summary.activation}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
              {t.channels_page_activation_count}
            </p>
          </div>

          <div className="rounded-3xl border bg-card p-4 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Rocket className="h-6 w-6" />
            </div>
            <div className="text-4xl font-black text-foreground">
              {summary.roadmap}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
              {t.channels_page_roadmap_count}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {channels.map((channel) => {
            const isAvailable = channel.status === "available";

            return (
              <article
                key={channel.id}
                className="overflow-hidden rounded-[2rem] border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="space-y-5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-3xl font-black leading-tight text-foreground">
                          {channel.name}
                        </h2>
                        <Badge
                          className={`rounded-full border px-4 py-1 text-sm ${getStatusClass(channel.status)}`}
                        >
                          {getStatusLabel(channel.status)}
                        </Badge>
                      </div>
                    </div>

                    <div
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${getIconBoxClass(
                        channel.status,
                      )}`}
                    >
                      <img
                        src={channel.iconSrc}
                        alt={channel.iconAlt}
                        loading="lazy"
                        className="h-10 w-10 object-contain"
                      />
                    </div>
                  </div>

                  <p className="min-h-[4.5rem] text-lg leading-9 text-muted-foreground">
                    {channel.description}
                  </p>
                </div>

                <div className="space-y-4 border-t bg-muted/20 p-5">
                  <div className="flex flex-wrap gap-2">
                    {channel.features.map((feature) => (
                      <span
                        key={`${channel.id}-${feature}`}
                        className="rounded-full bg-background px-4 py-2 text-sm font-bold text-foreground shadow-sm"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>

                  <Button
                    className={`h-14 w-full rounded-2xl text-lg font-black shadow-sm ${
                      isAvailable
                        ? "bg-orange-600 text-white hover:bg-orange-700"
                        : "border border-orange-100 bg-background text-muted-foreground hover:bg-background disabled:opacity-70"
                    }`}
                    disabled={!isAvailable}
                    onClick={() => handleChannelAction(channel)}
                  >
                    <Link2 className="h-5 w-5" />
                    {getActionLabel(channel.status)}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-[2rem] border border-blue-100 bg-blue-50/70 p-6 shadow-sm dark:border-blue-950 dark:bg-blue-950/20">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-background shadow-sm">
              <ClipboardCheck className="h-8 w-8 text-blue-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-foreground">
                {t.channels_page_guide_title}
              </h2>
              <p className="text-lg leading-8 text-muted-foreground">
                {t.channels_page_guide_intro}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {guideItems.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 text-lg leading-8 text-foreground"
              >
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-orange-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
