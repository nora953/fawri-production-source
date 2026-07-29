from pathlib import Path

ADMIN_PAGE = Path('artifacts/fawri/src/pages/AdminPage.tsx')
ADMIN_TRANSLATIONS = Path('artifacts/fawri/src/lib/admin-translations.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f'{label}: start marker not found')
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f'{label}: end marker not found')
    if text.find(start, start_index + len(start)) >= 0:
        raise RuntimeError(f'{label}: multiple start markers found')
    return text[:start_index] + replacement + text[end_index:]


admin_page = ADMIN_PAGE.read_text(encoding='utf-8')

new_summary = '''function SubscriptionUsageSummary({
  subscription,
  planName,
  locale,
  baseUsedLabel,
  baseRemainingLabel,
  baseLimitLabel,
  emergencyBalanceLabel,
  addonBalanceLabel,
  totalAvailableLabel,
  compact = false,
}: {
  subscription: Subscription;
  planName: string;
  locale: string;
  baseUsedLabel: string;
  baseRemainingLabel: string;
  baseLimitLabel: string;
  emergencyBalanceLabel: string;
  addonBalanceLabel: string;
  totalAvailableLabel: string;
  compact?: boolean;
}) {
  const baseReplyLimit = subscription.base_reply_limit ?? subscription.reply_limit;
  const baseRepliesUsed =
    subscription.base_replies_used ??
    Math.min(subscription.replies_used, baseReplyLimit);
  const baseRepliesRemaining =
    subscription.base_replies_remaining ??
    Math.max(0, baseReplyLimit - baseRepliesUsed);
  const emergencyRepliesRemaining = subscription.emergency_credit_remaining ?? 0;
  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;

  const exactPercentage =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;
  const percentageText = formatUsagePercentage(
    baseRepliesUsed,
    baseReplyLimit,
    locale,
  );
  const progressWidth =
    baseRepliesUsed > 0
      ? Math.max(0.5, Math.min(100, exactPercentage))
      : 0;
  const roundedPercentage = Math.round(exactPercentage);

  const balanceItems = [
    [emergencyBalanceLabel, emergencyRepliesRemaining],
    [addonBalanceLabel, addonRepliesRemaining],
    [totalAvailableLabel, totalRepliesAvailable],
  ] as const;

  return (
    <div
      className={
        "space-y-2.5 rounded-xl border border-border/80 bg-gradient-to-b from-muted/35 to-background shadow-sm " +
        (compact ? "min-w-[230px] p-3" : "p-3.5")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold capitalize text-foreground">
          {planName}
        </span>
        <span
          className="rounded-full bg-background px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm"
          dir="ltr"
        >
          {percentageText}
        </span>
      </div>

      <div className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
        <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <span>{baseLimitLabel}</span>
          <strong className="text-xs font-bold tabular-nums text-foreground" dir="ltr">
            {baseReplyLimit.toLocaleString(locale)}
          </strong>
        </div>

        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, roundedPercentage)}
        >
          <div
            className={
              "h-full rounded-full transition-all " +
              (roundedPercentage >= 90
                ? "bg-red-500"
                : roundedPercentage >= 80
                  ? "bg-yellow-500"
                  : "bg-primary")
            }
            style={{ width: String(progressWidth) + "%" }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-muted-foreground">
          <span>
            {baseUsedLabel}: <strong className="tabular-nums text-foreground" dir="ltr">{baseRepliesUsed.toLocaleString(locale)}</strong>
          </span>
          <span>
            {baseRemainingLabel}: <strong className="tabular-nums text-foreground" dir="ltr">{baseRepliesRemaining.toLocaleString(locale)}</strong>
          </span>
        </div>
      </div>

      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-3 gap-2"}>
        {balanceItems.map(([label, value], index) => (
          <div
            key={label}
            className={
              "flex min-h-[54px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center " +
              (compact && index === 2 ? "col-span-2" : "")
            }
          >
            <p className="text-[9px] font-medium leading-3.5 text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-xs font-bold tabular-nums text-foreground" dir="ltr">
              {value.toLocaleString(locale)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

'''

admin_page = replace_between(
    admin_page,
    'function SubscriptionUsageSummary({',
    'function formatUsagePercentage(',
    new_summary,
    'subscription usage summary',
)

old_call = '''                                usedLabel={adminText.detailsUsed}
                                remainingLabel={adminText.detailsRemaining}
                                limitLabel={adminText.detailsReplyLimit}
'''
new_call = '''                                baseUsedLabel={adminText.detailsBaseUsed}
                                baseRemainingLabel={adminText.detailsBaseRemaining}
                                baseLimitLabel={adminText.detailsBaseReplyLimit}
                                emergencyBalanceLabel={adminText.detailsEmergencyBalance}
                                addonBalanceLabel={adminText.detailsAddonBalance}
                                totalAvailableLabel={adminText.detailsTotalAvailable}
'''
admin_page = replace_once(admin_page, old_call, new_call, 'mobile admin summary props')

old_compact_call = '''                                    usedLabel={adminText.detailsUsed}
                                    remainingLabel={adminText.detailsRemaining}
                                    limitLabel={adminText.detailsReplyLimit}
'''
new_compact_call = '''                                    baseUsedLabel={adminText.detailsBaseUsed}
                                    baseRemainingLabel={adminText.detailsBaseRemaining}
                                    baseLimitLabel={adminText.detailsBaseReplyLimit}
                                    emergencyBalanceLabel={adminText.detailsEmergencyBalance}
                                    addonBalanceLabel={adminText.detailsAddonBalance}
                                    totalAvailableLabel={adminText.detailsTotalAvailable}
'''
admin_page = replace_once(
    admin_page,
    old_compact_call,
    new_compact_call,
    'desktop admin summary props',
)

ADMIN_PAGE.write_text(admin_page, encoding='utf-8')

translations = ADMIN_TRANSLATIONS.read_text(encoding='utf-8')

translations = replace_once(
    translations,
    '''    detailsReplyLimit: "حد الردود",
    detailsUsed: "مُستخدم",
    detailsRemaining: "متبقي",
''',
    '''    detailsReplyLimit: "حد الردود",
    detailsUsed: "مُستخدم",
    detailsRemaining: "متبقي",
    detailsBaseReplyLimit: "حد الخطة الأساسي",
    detailsBaseUsed: "أساسي مستخدم",
    detailsBaseRemaining: "أساسي متبقٍ",
    detailsEmergencyBalance: "رصيد الطوارئ",
    detailsAddonBalance: "الرصيد الإضافي",
    detailsTotalAvailable: "الإجمالي المتاح",
''',
    'Arabic admin balance labels',
)

translations = replace_once(
    translations,
    '''    detailsReplyLimit: "Reply limit",
    detailsUsed: "Used",
    detailsRemaining: "Remaining",
''',
    '''    detailsReplyLimit: "Reply limit",
    detailsUsed: "Used",
    detailsRemaining: "Remaining",
    detailsBaseReplyLimit: "Base plan limit",
    detailsBaseUsed: "Base used",
    detailsBaseRemaining: "Base remaining",
    detailsEmergencyBalance: "Emergency balance",
    detailsAddonBalance: "Add-on balance",
    detailsTotalAvailable: "Total available",
''',
    'English admin balance labels',
)

translations = replace_once(
    translations,
    '''  detailsReplyLimit: "سنووری وەڵام",
  detailsUsed: "بەکارهێنراو",
  detailsRemaining: "ماوە",
''',
    '''  detailsReplyLimit: "سنووری وەڵام",
  detailsUsed: "بەکارهێنراو",
  detailsRemaining: "ماوە",
  detailsBaseReplyLimit: "سنووری سەرەکیی پلان",
  detailsBaseUsed: "سەرەکیی بەکارهێنراو",
  detailsBaseRemaining: "سەرەکیی ماوە",
  detailsEmergencyBalance: "کرێدیتی فریاکەوتن",
  detailsAddonBalance: "وەڵامی زیادە",
  detailsTotalAvailable: "کۆی بەردەست",
''',
    'Kurdish admin balance labels',
)

ADMIN_TRANSLATIONS.write_text(translations, encoding='utf-8')

print('Applied separated subscription balances to the admin panel.')
