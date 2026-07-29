from pathlib import Path

SIDEBAR = Path('artifacts/fawri/src/components/layout/Sidebar.tsx')
OVERVIEW = Path('artifacts/fawri/src/pages/dashboard/OverviewPage.tsx')
RETENTION = Path('artifacts/fawri/src/components/SubscriptionRetentionCard.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def replace_exact(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{label}: expected {expected} matches, found {count}')
    return text.replace(old, new, expected)


# Place the notification bell at the far opposite edge of the brand header.
sidebar = SIDEBAR.read_text(encoding='utf-8')
sidebar = replace_once(
    sidebar,
    '      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-6">',
    '      <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-6">',
    'sidebar brand and bell spacing',
)
SIDEBAR.write_text(sidebar, encoding='utf-8')


# Make the retention card compact only where requested.
retention = RETENTION.read_text(encoding='utf-8')
retention = replace_once(
    retention,
    '''type RetentionStatus = NonNullable<Merchant["retention_status"]>;
''',
    '''type RetentionStatus = NonNullable<Merchant["retention_status"]>;

type SubscriptionRetentionCardProps = {
  compact?: boolean;
};
''',
    'retention compact prop type',
)
retention = replace_once(
    retention,
    'export default function SubscriptionRetentionCard() {',
    'export default function SubscriptionRetentionCard({ compact = false }: SubscriptionRetentionCardProps) {',
    'retention compact prop',
)
retention = replace_once(
    retention,
    '''    <Card className={`rounded-3xl ${classes}`} dir={dir}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-6 w-6 shrink-0" />
''',
    '''    <Card className={`${compact ? "rounded-2xl" : "rounded-3xl"} ${classes}`} dir={dir}>
      <CardContent
        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${
          compact ? "gap-3 p-4" : "gap-4 p-5"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`${compact ? "h-5 w-5" : "h-6 w-6"} mt-0.5 shrink-0`} />
''',
    'compact retention card shell',
)
retention = replace_once(
    retention,
    '            <h2 className="text-base font-extrabold">{title}</h2>',
    '            <h2 className={`${compact ? "text-sm" : "text-base"} font-extrabold`}>{title}</h2>',
    'compact retention title',
)
retention = replace_once(
    retention,
    '            <p className="mt-1 text-sm leading-6 opacity-85">{body}</p>',
    '            <p className={`${compact ? "mt-0.5 text-xs leading-5" : "mt-1 text-sm leading-6"} opacity-85`}>{body}</p>',
    'compact retention body',
)
retention = replace_once(
    retention,
    '              <p className="mt-2 text-sm font-bold">',
    '              <p className={`${compact ? "mt-1 text-xs" : "mt-2 text-sm"} font-bold`}>',
    'compact active until text',
)
retention = replace_once(
    retention,
    '''          <Button className="shrink-0" onClick={() => setLocation("/dashboard/subscription")}>
''',
    '''          <Button
            className={`shrink-0 ${compact ? "h-9 px-4 text-xs" : ""}`}
            onClick={() => setLocation("/dashboard/subscription")}
          >
''',
    'compact retention button',
)
RETENTION.write_text(retention, encoding='utf-8')


# Compact the overview, align its warning with the subscription page,
# and calculate the warning from the base plan rather than mixed balances.
overview = OVERVIEW.read_text(encoding='utf-8')
overview = replace_once(
    overview,
    "import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';\n",
    '',
    'remove old alert imports',
)
overview = replace_once(
    overview,
    '''  const usagePercent =
    sub && sub.reply_limit > 0
      ? (sub.replies_used / sub.reply_limit) * 100
      : 0;
''',
    '''  const baseReplyLimit = sub?.base_reply_limit ?? sub?.reply_limit ?? 0;
  const baseRepliesUsed = sub
    ? sub.base_replies_used ?? Math.min(sub.replies_used, baseReplyLimit)
    : 0;
  const usagePercent =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;
''',
    'overview base plan usage calculation',
)
overview = replace_once(
    overview,
    '''  let progressColor = 'bg-primary';
  if (usagePercent > 90) progressColor = 'bg-red-500';
  else if (usagePercent >= 80) progressColor = 'bg-yellow-500';
''',
    '''  let progressColor = 'bg-primary';
  if (usagePercent > 90) progressColor = 'bg-red-500';
  else if (usagePercent >= 80) progressColor = 'bg-yellow-500';

  const usageNotice =
    isActive && usagePercent >= 100
      ? { text: t.usage_100_warning, className: 'border-red-500 text-red-600' }
      : isActive && usagePercent >= 90
        ? { text: t.usage_90_warning, className: 'border-orange-500 text-orange-600' }
        : isActive && usagePercent >= 80
          ? { text: t.usage_80_warning, className: 'border-yellow-500 text-yellow-700' }
          : null;
''',
    'overview compact warning state',
)
overview = replace_once(
    overview,
    '''    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="space-y-6">
        <SubscriptionRetentionCard />

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t.overview}</h1>
        </div>
''',
    '''    <div className="bg-background" dir={dir}>
      <div className="space-y-4">
        <SubscriptionRetentionCard compact />

        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t.overview}</h1>
        </div>
''',
    'compact overview outer layout',
)
overview = replace_once(
    overview,
    '          <div className="rounded-3xl border bg-card p-5 text-center text-muted-foreground">',
    '          <div className="rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground">',
    'compact overview loading card',
)
old_alerts = '''        {isActive && usagePercent >= 100 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t.subscription_alert_title}</AlertTitle>
            <AlertDescription>{t.usage_100_warning}</AlertDescription>
          </Alert>
        )}

        {isActive && usagePercent >= 90 && usagePercent < 100 && (
          <Alert className="border-orange-500 text-orange-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_warning_title}</AlertTitle>
            <AlertDescription>{t.usage_90_warning}</AlertDescription>
          </Alert>
        )}

        {isActive && usagePercent >= 80 && usagePercent < 90 && (
          <Alert className="border-yellow-500 text-yellow-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_notice_title}</AlertTitle>
            <AlertDescription>{t.usage_80_warning}</AlertDescription>
          </Alert>
        )}

        {isActive && daysRemaining <= 3 && (
          <Alert className="border-orange-500 text-orange-600">
            <Clock className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_warning_title}</AlertTitle>
            <AlertDescription>{t.expiry_warning}</AlertDescription>
          </Alert>
        )}
'''
new_alerts = '''        {usageNotice && (
          <div
            className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 ${usageNotice.className}`}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold leading-5">{usageNotice.text}</p>
          </div>
        )}

        {isActive && daysRemaining <= 3 && (
          <div className="flex min-h-11 items-center gap-3 rounded-lg border border-orange-500 px-3 py-2 text-orange-600">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold leading-5">{t.expiry_warning}</p>
          </div>
        )}
'''
overview = replace_once(
    overview,
    old_alerts,
    new_alerts,
    'replace overview alert cards',
)
overview = replace_once(
    overview,
    '<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">',
    '<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">',
    'compact overview stat grid',
)
overview = replace_exact(
    overview,
    '<Card className="rounded-3xl">',
    '<Card className="rounded-2xl">',
    5,
    'compact overview cards',
)
overview = replace_exact(
    overview,
    '<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">',
    '<CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">',
    4,
    'compact stat card headers',
)
overview = replace_exact(
    overview,
    '<CardContent>',
    '<CardContent className="px-4 pb-4 pt-0">',
    4,
    'compact stat card content',
)
overview = replace_exact(
    overview,
    '<div className="text-2xl font-extrabold">',
    '<div className="text-xl font-extrabold">',
    4,
    'compact stat values',
)
overview = replace_once(
    overview,
    '''          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>{t.reply_limit}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
''',
    '''          <Card className="rounded-2xl">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">{t.reply_limit}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0">
''',
    'compact reply limit card',
)
OVERVIEW.write_text(overview, encoding='utf-8')

print('Moved the bell to the far edge and compacted the overview with aligned warnings.')
