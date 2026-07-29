from pathlib import Path

ROOT = Path('.')
CARD = ROOT / 'artifacts/fawri/src/components/SubscriptionCard.tsx'
EMERGENCY = ROOT / 'artifacts/fawri/src/components/EmergencyCredit.tsx'
EN = ROOT / 'artifacts/fawri/src/lib/translations/en.ts'
AR = ROOT / 'artifacts/fawri/src/lib/translations/ar.ts'
KU = ROOT / 'artifacts/fawri/src/lib/translations/ku.ts'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


card = CARD.read_text(encoding='utf-8')
card = replace_once(
    card,
    """  const { t, lang } = useI18n();
  const messages = subscriptionStateMessages[lang];
  const planName = {
    silver: t.plan_silver,
    gold: t.plan_gold,
    diamond: t.plan_diamond,
    trial: t.plan_trial,
  }[subscription.plan_name];

  const usagePercent = subscription.reply_limit > 0
    ? (subscription.replies_used / subscription.reply_limit) * 100
    : 0;
""",
    """  const { t, lang } = useI18n();
  const messages = subscriptionStateMessages[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const planName = {
    silver: t.plan_silver,
    gold: t.plan_gold,
    diamond: t.plan_diamond,
    trial: t.plan_trial,
  }[subscription.plan_name];

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
  const usagePercent = baseReplyLimit > 0
    ? (baseRepliesUsed / baseReplyLimit) * 100
    : 0;
""",
    'subscription card calculations',
)

card = replace_once(
    card,
    """        <div className=\"space-y-2\">
          <div className=\"flex justify-between text-sm\">
            <span>{t.reply_limit}</span>
            <span className=\"font-medium\">{subscription.reply_limit.toLocaleString()}</span>
          </div>
          <Progress value={usagePercent} className={`h-2 ${progressColor}`} />
          <div className=\"flex justify-between text-xs text-muted-foreground\">
            <span>{subscription.replies_used.toLocaleString()} {t.replies_used}</span>
            <span>{subscription.replies_remaining.toLocaleString()} {t.replies_remaining}</span>
          </div>
        </div>
""",
    """        <div className=\"space-y-3\">
          <div className=\"flex justify-between gap-4 text-sm\">
            <span>{t.subscription_base_limit}</span>
            <span className=\"font-medium\" dir=\"ltr\">
              {baseReplyLimit.toLocaleString(locale)}
            </span>
          </div>
          <Progress value={usagePercent} className={`h-2 ${progressColor}`} />
          <div className=\"flex justify-between gap-4 text-xs text-muted-foreground\">
            <span>
              {baseRepliesUsed.toLocaleString(locale)} {t.subscription_base_used}
            </span>
            <span>
              {baseRepliesRemaining.toLocaleString(locale)} {t.subscription_base_remaining}
            </span>
          </div>
        </div>

        <div className=\"grid grid-cols-2 gap-3 sm:grid-cols-3\">
          {[
            [t.subscription_base_limit, baseReplyLimit],
            [t.subscription_base_used, baseRepliesUsed],
            [t.subscription_base_remaining, baseRepliesRemaining],
            [t.subscription_emergency_balance, emergencyRepliesRemaining],
            [t.subscription_addon_balance, addonRepliesRemaining],
            [t.subscription_total_available, totalRepliesAvailable],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className=\"rounded-xl border border-border/70 bg-muted/20 p-3 text-start\"
            >
              <p className=\"text-xs leading-5 text-muted-foreground\">{label}</p>
              <p className=\"mt-1 text-lg font-bold tabular-nums\" dir=\"ltr\">
                {Number(value).toLocaleString(locale)}
              </p>
            </div>
          ))}
        </div>
""",
    'subscription card balance display',
)
CARD.write_text(card, encoding='utf-8')

emergency = EMERGENCY.read_text(encoding='utf-8')
emergency = replace_once(
    emergency,
    """  const baseRepliesRemaining =
    subscription.base_replies_remaining ?? subscription.replies_remaining;
""",
    """  const baseRepliesRemaining =
    subscription.base_replies_remaining ?? subscription.replies_remaining;
  const emergencyDebt =
    subscription.emergency_debt ??
    subscription.pending_next_cycle_deduction ??
    0;
""",
    'emergency debt calculation',
)
emergency = emergency.replace(
    'className="mt-6 w-full rounded-xl border border-orange-200 bg-orange-50/50 p-4 text-center dark:border-orange-900/50 dark:bg-orange-950/20 sm:w-auto"',
    'className="mt-6 w-full rounded-xl border border-orange-200 bg-orange-50/50 p-5 text-start dark:border-orange-900/50 dark:bg-orange-950/20"',
    1,
)
emergency = emergency.replace(
    'className="min-w-0 flex-1"',
    'className="min-w-0 flex-1 text-start"',
    1,
)
emergency = emergency.replace(
    'className="text-sm text-muted-foreground"',
    'className="text-sm leading-6 text-muted-foreground"',
    1,
)
emergency = replace_once(
    emergency,
    """          <div className=\"mt-3\">
            <span className=\"text-2xl font-bold\">
              {subscription.emergency_credit_remaining.toLocaleString(locale)}
            </span>

            <span className=\"ms-1 text-sm text-muted-foreground\">
              {t.subscription_replies_available}
            </span>
          </div>
""",
    """          <div className=\"mt-3 rounded-lg border border-orange-200/70 bg-background/70 p-3\">
            <p className=\"text-xs text-muted-foreground\">
              {t.subscription_emergency_balance}
            </p>
            <p className=\"mt-1 text-2xl font-bold tabular-nums\" dir=\"ltr\">
              {subscription.emergency_credit_remaining.toLocaleString(locale)}
            </p>
          </div>
""",
    'emergency balance card',
)
emergency = replace_once(
    emergency,
    """      {subscription.pending_next_cycle_deduction > 0 && (
        <div className=\"mt-4 w-full border-t border-orange-200/50 pt-4 text-center text-xs text-orange-700/80 dark:border-orange-900/30 dark:text-orange-400/80 sm:w-auto\">
          {t.subscription_pending_deduction}:{' '}
          {subscription.pending_next_cycle_deduction.toLocaleString(locale)}{' '}
          {t.subscription_reply_unit}
        </div>
      )}
""",
    """      {emergencyDebt > 0 && (
        <div className=\"mt-4 rounded-lg border border-orange-200/70 bg-background/70 p-3 text-start\">
          <p className=\"text-xs text-muted-foreground\">
            {t.subscription_emergency_debt}
          </p>
          <p className=\"mt-1 text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-400\" dir=\"ltr\">
            {emergencyDebt.toLocaleString(locale)}
          </p>
          <p className=\"mt-2 border-t border-orange-200/50 pt-2 text-xs leading-5 text-orange-700/90 dark:border-orange-900/30 dark:text-orange-400/90\">
            {t.subscription_pending_deduction}
          </p>
        </div>
      )}
""",
    'emergency debt card',
)
EMERGENCY.write_text(emergency, encoding='utf-8')


def patch_translation(path: Path, old_copy: str, new_copy: str, old_labels: str, new_labels: str, language: str) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(text, old_copy, new_copy, f'{language} emergency copy')
    text = replace_once(text, old_labels, new_labels, f'{language} balance labels')
    path.write_text(text, encoding='utf-8')


patch_translation(
    EN,
    """  emergency_credit: \"Emergency Reply Credit\",
  emergency_subtitle: \"Borrowed replies deducted from next billing cycle\",
  activate_emergency: \"Activate Emergency Credit\",
  emergency_confirm: \"Emergency reply credit will be added now and deducted from your next billing cycle.\",
""",
    """  emergency_credit: \"Emergency Reply Credit\",
  emergency_subtitle: \"Temporary replies whose debt is deducted from your first later purchase\",
  activate_emergency: \"Activate Emergency Credit\",
  emergency_confirm: \"Emergency reply credit will be added now. Its debt will be deducted from your first later purchase, whether a new plan or additional replies.\",
""",
    """  subscription_replies_available: \"replies available\",
  subscription_emergency_activated: \"Activated\",
  subscription_pending_deduction: \"Pending deduction next cycle\",
""",
    """  subscription_replies_available: \"replies available\",
  subscription_base_limit: \"Base plan limit\",
  subscription_base_used: \"base replies used\",
  subscription_base_remaining: \"base replies remaining\",
  subscription_emergency_balance: \"Emergency balance\",
  subscription_addon_balance: \"Add-on balance\",
  subscription_total_available: \"Total replies available\",
  subscription_emergency_debt: \"Emergency debt remaining\",
  subscription_emergency_activated: \"Activated\",
  subscription_pending_deduction: \"This emergency debt will be deducted from the first later purchase.\",
""",
    'English',
)

patch_translation(
    AR,
    """  emergency_credit: \"رصيد طوارئ\",
  emergency_subtitle: \"سلفني ردود تُخصم من الباقة القادمة\",
  activate_emergency: \"تفعيل رصيد الطوارئ\",
  emergency_confirm: \"سيتم إضافة رصيد طوارئ الآن، وسيتم خصمه من رصيد باقتك القادمة عند التجديد.\",
""",
    """  emergency_credit: \"رصيد طوارئ\",
  emergency_subtitle: \"رصيد مؤقت يُخصم دينه من أول عملية شراء لاحقة\",
  activate_emergency: \"تفعيل رصيد الطوارئ\",
  emergency_confirm: \"سيُضاف رصيد الطوارئ الآن، ويُخصم دينه من أول عملية شراء لاحقة، سواء شراء خطة جديدة أو ردود إضافية.\",
""",
    """  subscription_replies_available: \"رد متاح\",
  subscription_emergency_activated: \"مفعّل\",
  subscription_pending_deduction: \"الخصم المعلّق للدورة القادمة\",
""",
    """  subscription_replies_available: \"رد متاح\",
  subscription_base_limit: \"حد الخطة الأساسي\",
  subscription_base_used: \"رد أساسي مستخدم\",
  subscription_base_remaining: \"رد أساسي متبقٍ\",
  subscription_emergency_balance: \"رصيد الطوارئ المتاح\",
  subscription_addon_balance: \"الرصيد الإضافي المتاح\",
  subscription_total_available: \"إجمالي الردود المتاحة\",
  subscription_emergency_debt: \"دين الطوارئ المتبقي\",
  subscription_emergency_activated: \"مفعّل\",
  subscription_pending_deduction: \"يُخصم دين الطوارئ من أول عملية شراء لاحقة.\",
""",
    'Arabic',
)

patch_translation(
    KU,
    """  emergency_credit: \"کرێدیتی فریاکەوتن\",
  emergency_subtitle: \"وەڵامی قەرزی خصم دەکرێت لە دەوری داهاتوو\",
  activate_emergency: \"کرێدیتی فریاکەوتن چالاک بکە\",
  emergency_confirm: \"کرێدیتی فریاکەوتن ئێستا زیاد دەکرێت و لە دەوری داهاتووت خصم دەکرێت.\",
""",
    """  emergency_credit: \"کرێدیتی فریاکەوتن\",
  emergency_subtitle: \"کرێدیتێکی کاتییە و قەرزەکەی لە یەکەم کڕینی داهاتوو کەم دەکرێتەوە\",
  activate_emergency: \"کرێدیتی فریاکەوتن چالاک بکە\",
  emergency_confirm: \"کرێدیتی فریاکەوتن ئێستا زیاد دەکرێت. قەرزەکەی لە یەکەم کڕینی داهاتوو کەم دەکرێتەوە، جا پلانی نوێ بێت یان وەڵامی زیادە.\",
""",
    """  subscription_replies_available: \"وەڵامی بەردەست\",
  subscription_emergency_activated: \"چالاککراوە\",
  subscription_pending_deduction: \"کەمکردنەوەی چاوەڕوانکراو بۆ دەوری داهاتوو\",
""",
    """  subscription_replies_available: \"وەڵامی بەردەست\",
  subscription_base_limit: \"سنووری سەرەکیی پلان\",
  subscription_base_used: \"وەڵامی سەرەکیی بەکارهێنراو\",
  subscription_base_remaining: \"وەڵامی سەرەکیی ماوە\",
  subscription_emergency_balance: \"کرێدیتی فریاکەوتنی بەردەست\",
  subscription_addon_balance: \"وەڵامی زیادەی بەردەست\",
  subscription_total_available: \"کۆی وەڵامی بەردەست\",
  subscription_emergency_debt: \"قەرزی فریاکەوتنی ماوە\",
  subscription_emergency_activated: \"چالاککراوە\",
  subscription_pending_deduction: \"قەرزی فریاکەوتن لە یەکەم کڕینی داهاتوو کەم دەکرێتەوە.\",
""",
    'Kurdish',
)

print('Applied merchant subscription balance display and emergency text fixes.')
