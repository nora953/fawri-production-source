import { LANDING_PAGE_LANDING_TRUTH_COPY } from '@/lib/translations/features/pages/LandingPage';
import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link } from 'wouter';
import { Header } from '@/components/layout/Header';
import { motion } from 'framer-motion';
import { Zap, Globe2, TrendingUp, PackageCheck, Layers, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PolicyModal, type PolicyTab, getPolicyReadLabel } from '@/components/PolicyModal';

type LandingStatus = 'available' | 'activation_pending' | 'coming_soon' | 'development';

type LandingChannel = {
  id: string;
  name: string;
  nameLines: string[];
  iconSrc: string;
  status: LandingStatus;
  description: string;
  features: string[];
};

const landingTruthCopy = LANDING_PAGE_LANDING_TRUTH_COPY;

export default function LandingPage() {
  const { t, isRTL, lang } = useI18n();
  const truth = landingTruthCopy[lang];

  const brandName = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فورى' : 'Fawri';
  const getChannelLogoAlt = (name: string) => {
    if (lang === 'ar') return `شعار ${name}`;
    if (lang === 'ku') return `لۆگۆی ${name}`;
    return `${name} logo`;
  };
  const [selectedLandingChannel, setSelectedLandingChannel] = useState<LandingChannel | null>(null);

  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab>('privacy');

  const features = [
    { icon: Zap, title: t.feature_instant_title, desc: t.feature_instant_desc },
    { icon: Globe2, title: t.feature_languages_title, desc: t.feature_languages_desc },
    { icon: TrendingUp, title: t.feature_sales_title, desc: t.feature_sales_desc },
    { icon: PackageCheck, title: t.feature_stock_title, desc: t.feature_stock_desc },
    { icon: Layers, title: t.feature_channels_title, desc: truth.channelFeatureDescription },
    { icon: MessageCircle, title: t.feature_takeover_title, desc: t.feature_takeover_desc },
  ];

  const landingChannels: LandingChannel[] = [
    {
      id: 'instagram',
      name: 'Instagram',
      nameLines: ['Instagram'],
      iconSrc: '/channel-icons/instagram.svg',
      status: 'activation_pending',
      description: truth.instagramDescription,
      features: [t.channel_instagram_feature_reply, t.channel_instagram_feature_track, t.channel_instagram_feature_auto, t.channel_instagram_feature_orders, t.channel_instagram_feature_customer],
    },
    {
      id: 'messenger',
      name: 'Facebook Messenger',
      nameLines: ['Facebook', 'Messenger'],
      iconSrc: '/channel-icons/facebook-messenger.svg',
      status: 'activation_pending',
      description: truth.messengerDescription,
      features: [t.channel_messenger_feature_reply, t.channel_messenger_feature_track, t.channel_messenger_feature_auto, t.channel_messenger_feature_orders, t.channel_messenger_feature_customer],
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      nameLines: ['WhatsApp', 'Business'],
      iconSrc: '/channel-icons/whatsapp-business.svg',
      status: 'coming_soon',
      description: t.channel_whatsapp_desc,
      features: [t.channel_whatsapp_feature_reply, t.channel_whatsapp_feature_auto, t.channel_whatsapp_feature_orders],
    },
    {
      id: 'web-chat',
      name: 'Web Chat',
      nameLines: ['Web Chat'],
      iconSrc: '/channel-icons/web-chat.svg',
      status: 'development',
      description: t.channel_web_chat_desc,
      features: [t.channel_web_chat_feature_auto, t.channel_web_chat_feature_product, t.channel_web_chat_feature_live],
    },
    {
      id: 'telegram',
      name: 'Telegram',
      nameLines: ['Telegram'],
      iconSrc: '/channel-icons/telegram.svg',
      status: 'development',
      description: t.channel_telegram_desc,
      features: [t.channel_telegram_feature_bot, t.channel_telegram_feature_auto, t.channel_telegram_feature_orders],
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      nameLines: ['TikTok'],
      iconSrc: '/channel-icons/tiktok.svg',
      status: 'development',
      description: t.channel_tiktok_desc,
      features: [t.channel_tiktok_feature_auto, t.channel_tiktok_feature_roadmap],
    },
  ];

  const getLandingStatusLabel = (status: LandingStatus) => {
    if (status === 'available') return t.supported;
    if (status === 'activation_pending') return truth.activationPending;
    if (status === 'coming_soon') return t.coming_soon;
    return truth.inDevelopment;
  };

  const getLandingStatusClass = (status: LandingStatus) => {
    if (status === 'available') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30';
    if (status === 'activation_pending') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200';
    if (status === 'coming_soon') return 'bg-muted text-muted-foreground';
    return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30';
  };
  const plans = [
    { id: 'silver', name: t.plan_silver, price: '25,000', replies: '4,000', emergency: '400', popular: false },
    { id: 'gold', name: t.plan_gold, price: '49,000', replies: '8,000', emergency: '800', popular: true },
    { id: 'diamond', name: t.plan_diamond, price: '75,000', replies: '14,000', emergency: '1,400', popular: false },
  ] as const;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <Header />
      
      {/* Hero */}
      <section className="relative overflow-hidden flex flex-col items-center justify-start pt-14 pb-20 sm:pt-16 lg:pt-20 lg:pb-24">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-background to-amber-500/5 -z-10" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container px-4 text-center mx-auto max-w-4xl"
        >
        <section className="mb-7 px-4">
          <div dir="ltr" className="mx-auto grid max-w-md grid-cols-2 gap-3">
            <button
              type="button"
              disabled
              aria-label={`${t.android}: ${truth.inDevelopment}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-slate-500 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-green-600 shadow-sm">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
                  <path d="M17.6 9.48l1.84-3.18a.75.75 0 0 0-1.3-.75l-1.88 3.26A9.1 9.1 0 0 0 12 7.8c-1.54 0-2.98.36-4.26 1.01L5.86 5.55a.75.75 0 1 0-1.3.75L6.4 9.48C4.34 10.94 3 13.15 3 15.65V17a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-1.35c0-2.5-1.34-4.71-3.4-6.17ZM8 14.25a1.05 1.05 0 1 1 0-2.1 1.05 1.05 0 0 1 0 2.1Zm8 0a1.05 1.05 0 1 1 0-2.1 1.05 1.05 0 0 1 0 2.1Z" />
                </svg>
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-xs font-black text-slate-700 sm:text-sm">{t.android}</span>
                <span className="block text-[11px] font-bold text-slate-500">{truth.inDevelopment}</span>
              </span>
            </button>

            <button
              type="button"
              disabled
              aria-label={`${t.ios}: ${truth.inDevelopment}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-slate-500 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                <svg viewBox="0 0 384 512" className="h-5 w-5" aria-hidden="true" fill="currentColor" preserveAspectRatio="xMidYMid meet">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.2-39.4.6-75.6 22.9-95.9 58.3-40.9 71-10.4 176.1 29.4 233.8 19.5 28.2 42.7 59.9 73.2 58.8 29.4-1.2 40.5-19 75.9-19 35.3 0 45.4 19 76.4 18.4 31.5-.6 51.5-28.8 70.8-57.1 22.4-32.7 31.6-64.4 32.1-66.1-.7-.3-61.7-23.7-62.3-94.2zM260.9 102.1c16.2-19.6 27.1-46.8 24.1-74-23.3.9-51.5 15.5-68.3 35.1-15 17.4-28.2 45.1-24.6 71.7 26 .2 52.6-13.2 68.8-32.8z" />
                </svg>
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-xs font-black text-slate-700 sm:text-sm">{t.ios}</span>
                <span className="block text-[11px] font-bold text-slate-500">{truth.inDevelopment}</span>
              </span>
            </button>
          </div>
        </section>

              <span className="mx-auto mb-5 inline-flex w-fit cursor-default select-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-2 text-sm font-extrabold text-slate-600 shadow-none">{t.hero_badge}</span>
          <h1
            className={`${lang === 'ar' ? 'mx-auto max-w-5xl text-[2.5rem] leading-[1.28] tracking-normal md:text-[3.55rem] md:leading-[1.22] lg:text-[4rem]' : isRTL ? 'mx-auto max-w-5xl text-[2.55rem] leading-[1.2] md:text-[3.7rem] md:leading-[1.15] lg:text-[4.15rem]' : 'mx-auto max-w-5xl text-4xl leading-[1.12] md:text-5xl lg:text-[3.9rem]'} mb-5 text-balance font-bold text-foreground`}
          >
            {t.hero_title}
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
            {t.hero_subtitle}
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-14 w-full rounded-2xl border border-primary bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/90 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-md sm:w-auto sm:min-w-[220px]"
            >
              <Link href="/signup" className="flex h-full w-full items-center justify-center whitespace-nowrap px-1 text-primary-foreground">
                {t.hero_cta_primary}
              </Link>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="min-h-14 w-full rounded-2xl border border-primary bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/90 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-md sm:w-auto sm:min-w-[220px]"
              onClick={() => setIsHowItWorksOpen(true)}
            >
              <span className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-primary-foreground shadow-sm" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 translate-x-px" fill="currentColor" focusable="false">
                  <path d="M8 5.5v13l10-6.5-10-6.5Z" />
                </svg>
              </span>
              <span className="whitespace-nowrap">{t.hero_cta_secondary}</span>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Channels */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
              {t.channels_dashboard_title}
            </h2>
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {landingChannels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => setSelectedLandingChannel(channel)}
                className="flex min-h-[210px] flex-col items-center justify-center rounded-2xl border bg-card p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <img src={channel.iconSrc} alt={getChannelLogoAlt(channel.name)} className="mb-5 h-16 w-16 rounded-2xl object-contain" />
                <span className="flex min-h-[56px] flex-col items-center justify-center text-xl font-bold leading-7 text-foreground">
                  {channel.nameLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
                <span className={"mt-3 rounded-md px-3 py-1 text-sm font-bold " + getLandingStatusClass(channel.status)}>
                  {getLandingStatusLabel(channel.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedLandingChannel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="w-full max-w-md rounded-3xl border bg-background p-5 shadow-2xl">
            <div className="flex items-center gap-4">
              <img src={selectedLandingChannel.iconSrc} alt={getChannelLogoAlt(selectedLandingChannel.name)} className="h-16 w-16 rounded-2xl object-contain" />
              <div className="min-w-0 flex-1">
                <h3 className="text-2xl font-extrabold leading-tight text-foreground">
                  {selectedLandingChannel.name}
                </h3>
                <span className={"mt-2 inline-flex rounded-md px-3 py-1 text-sm font-bold " + getLandingStatusClass(selectedLandingChannel.status)}>
                  {getLandingStatusLabel(selectedLandingChannel.status)}
                </span>
              </div>
            </div>

            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              {selectedLandingChannel.description}
            </p>

            <div className="mt-5 rounded-2xl bg-muted/40 p-4">
              <p className="mb-3 text-sm font-extrabold text-foreground">
                {selectedLandingChannel.status === 'activation_pending'
                  ? truth.pendingCapabilitiesTitle
                  : t.channel_modal_title}
              </p>
              <div className="space-y-2">
                {selectedLandingChannel.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedLandingChannel(null)}
              className="mt-5 h-12 w-full rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-md"
            >
              {t.close}
            </button>
          </div>
        </div>
      ) : null}
      {/* Why brand */}
      <section className="bg-background py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center md:mb-10">
            <h2
              className={`${isRTL ? 'leading-[1.35]' : 'leading-tight'} mx-auto max-w-3xl text-balance text-3xl font-extrabold tracking-tight text-foreground md:text-[2.35rem]`}
            >
              {t.why_title}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group rounded-[1.5rem] border bg-card/95 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <h3 className={`${isRTL ? "font-[Arial,Tahoma,sans-serif]" : ""} text-[1.05rem] font-extrabold leading-7 text-foreground md:text-lg`}>
                      {feature.title}
                    </h3>
                    <p className={`${isRTL ? "font-[Arial,Tahoma,sans-serif]" : ""} mt-2 text-sm leading-7 text-muted-foreground`}>
                      {feature.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      {isHowItWorksOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" dir={isRTL ? "rtl" : "ltr"}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl border bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-3xl font-extrabold leading-tight text-foreground">
                  {t.how_title}
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {t.how_modal_subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsHowItWorksOpen(false)}
                className="fowri-how-modal-close flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
                aria-label={t.close}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {[
              { num: 1, title: t.step1, desc: t.step1_desc },
              { num: 2, title: t.step2, desc: t.step2_desc },
              { num: 3, title: truth.howStep3Title, desc: truth.howStep3Description },
              { num: 4, title: t.step4, desc: t.step4_desc },
              { num: 5, title: t.step5, desc: t.step5_desc },
              ].map((item) => (
                <div key={item.num} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="fowri-how-step-number grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-primary text-lg font-extrabold text-primary">
                    <span className="fowri-how-step-number-text tabular-nums">{item.num}</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50/80 p-4 text-center text-sm font-bold leading-7 text-orange-800">
                      {t.how_note}
            </div>

            <button
              type="button"
              onClick={() => setIsHowItWorksOpen(false)}
              className="mt-5 h-12 w-full rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-md"
            >
              {t.close}
            </button>
          </div>
        </div>
      ) : null}

      {/* Pricing */}
      <section id="pricing" className="bg-muted/25 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
            <h2
              className={`${isRTL ? 'leading-[1.35]' : 'leading-tight'} text-3xl font-extrabold tracking-tight text-foreground md:text-[2.35rem]`}
            >
              {t.pricing_title}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
              {t.pricing_note}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`relative flex min-h-[330px] flex-col rounded-[1.75rem] border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg ${plan.popular ? 'border-primary shadow-xl ring-1 ring-primary/25' : 'border-border'}`}
              >
                {plan.popular && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-5 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-foreground shadow-lg">
                    {t.most_popular}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-extrabold tracking-tight text-foreground">
                    {plan.name}
                  </h3>

                  <div dir="ltr" className="mt-4 flex flex-wrap items-end gap-x-2 gap-y-1">
                    <span className="text-4xl font-black tracking-tight text-foreground md:text-[2.75rem]">
                      {plan.price}
                    </span>
                    <span className="pb-1 text-sm font-bold text-muted-foreground">
                      IQD / {t.per_month}
                    </span>
                  </div>
                </div>

                <ul className="mb-7 flex-1 space-y-3.5">
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                      ✓
                    </span>
                    <span className="text-sm leading-7 text-foreground md:text-base">
                      <strong className="font-extrabold">{plan.replies}</strong> {t.auto_replies}
                    </span>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                      ✓
                    </span>
                    <span className="text-sm leading-7 text-foreground md:text-base">
                      <strong className="font-extrabold">{plan.emergency}</strong> {t.emergency_credit_label}
                    </span>
                  </li>
                </ul>

                <Button
                  variant={plan.popular ? 'default' : 'outline'}
                  className={`h-12 w-full rounded-2xl text-base font-extrabold shadow-sm transition-all ${plan.popular ? 'shadow-primary/20 hover:-translate-y-0.5 hover:shadow-lg' : 'hover:border-primary hover:bg-primary hover:text-primary-foreground'}`}
                  asChild
                >
                  <Link href={`/signup?plan=${plan.id}`}>{t.get_started}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-background px-4 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-orange-500 to-amber-500 px-6 py-12 text-center text-white shadow-2xl sm:px-10 md:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.18),transparent_30%)]" />
            <div className="relative mx-auto flex max-w-3xl flex-col items-center">
              <h2
                className={`${lang === 'ku' ? 'max-w-[780px] text-[2rem] leading-[1.55] md:text-[3.15rem] md:leading-[1.42]' : isRTL ? 'max-w-[720px] text-3xl leading-[1.45] md:text-5xl md:leading-[1.32]' : 'max-w-[720px] text-3xl leading-tight md:text-5xl'} text-balance font-extrabold tracking-tight`}
              >
                {t.final_cta_title}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-white/90 md:text-lg">
                {t.final_cta_sub}
              </p>
              <Button
                size="lg"
                variant="secondary"
                className="mt-7 h-12 w-auto min-w-[220px] max-w-[320px] rounded-2xl px-10 text-base font-extrabold text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg md:mt-8"
                asChild
              >
                <Link
                  href="/signup"
                  className="flex h-full w-full items-center justify-center whitespace-nowrap text-base font-extrabold leading-none"
                >
                  {t.create_account}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background py-8 text-foreground">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-start">
            <div className="flex flex-col items-center gap-2 md:items-start">
              <span className="block mb-6 text-3xl font-extrabold leading-none text-primary fowri-header-brand-font">
                {brandName}
              </span>
              <p dir="ltr" className="text-sm font-medium text-muted-foreground">
                © 2026 Fawri. All rights reserved.
              </p>
            </div>

            <div className="flex justify-center md:justify-end">
              <button
                type="button"
                onClick={() => { setPolicyTab('privacy'); setShowPolicyModal(true); }}
                className="inline-flex min-h-10 max-w-full items-center justify-center rounded-2xl border border-border bg-card px-4 py-2 text-sm font-extrabold leading-6 text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-primary hover:shadow-md md:max-w-[420px]"
                data-testid="button-read-policy-landing"
              >
                {getPolicyReadLabel(lang)}
              </button>
            </div>
          </div>
        </div>
      </footer>

      <PolicyModal
        open={showPolicyModal}
        onOpenChange={setShowPolicyModal}
        policyTab={policyTab}
        setPolicyTab={setPolicyTab}
      />
    </div>
  );
}
