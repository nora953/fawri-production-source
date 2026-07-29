from pathlib import Path

PATH = Path('artifacts/fawri/src/pages/dashboard/OverviewPage.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


text = PATH.read_text(encoding='utf-8')

text = replace_once(
    text,
    '''  const messages = subscriptionStateMessages[lang];
  const planName = sub
''',
    '''  const messages = subscriptionStateMessages[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const planName = sub
''',
    'overview locale',
)

text = replace_once(
    text,
    '''  const usagePercent =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;
''',
    '''  const baseRepliesRemaining = sub
    ? sub.base_replies_remaining ?? Math.max(0, baseReplyLimit - baseRepliesUsed)
    : 0;
  const emergencyRepliesRemaining = sub?.emergency_credit_remaining ?? 0;
  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;
  const usagePercent =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;
''',
    'overview reply balance variables',
)

old_card = '''        {isActive && sub && (
          <Card className="rounded-2xl">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">{t.reply_limit}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{sub.replies_used} {t.replies_used}</span>
                <span className="font-medium">{sub.reply_limit} {t.total}</span>
              </div>
              <Progress value={usagePercent} className={`h-2 ${progressColor}`} />
              <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                <span>{sub.replies_remaining} {t.replies_remaining}</span>
                <span>{daysRemaining} {t.days_remaining}</span>
              </div>
            </CardContent>
          </Card>
        )}
'''

new_card = '''        {isActive && sub && (
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
              <CardTitle className="text-base">{t.reply_limit}</CardTitle>
              <span className="text-xs font-semibold text-muted-foreground">
                {daysRemaining.toLocaleString(locale)} {t.days_remaining}
              </span>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                  <span>
                    {t.subscription_base_limit}:{' '}
                    <strong className="font-extrabold tabular-nums" dir="ltr">
                      {baseReplyLimit.toLocaleString(locale)}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    {t.subscription_base_used}:{' '}
                    <strong className="font-bold tabular-nums text-foreground" dir="ltr">
                      {baseRepliesUsed.toLocaleString(locale)}
                    </strong>
                  </span>
                </div>
                <Progress value={usagePercent} className={`mt-2 h-2 ${progressColor}`} />
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  [t.subscription_base_remaining, baseRepliesRemaining],
                  [t.subscription_emergency_balance, emergencyRepliesRemaining],
                  [t.subscription_addon_balance, addonRepliesRemaining],
                  [t.subscription_total_available, totalRepliesAvailable],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex min-h-[62px] flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-2 py-2 text-center shadow-sm"
                  >
                    <p className="text-[11px] font-medium leading-4 text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-base font-extrabold tabular-nums text-foreground" dir="ltr">
                      {Number(value).toLocaleString(locale)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
'''

text = replace_once(
    text,
    old_card,
    new_card,
    'overview reply balance card',
)

PATH.write_text(text, encoding='utf-8')
print('Separated the overview base, emergency, add-on, and total reply balances.')
