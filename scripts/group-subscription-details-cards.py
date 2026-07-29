from pathlib import Path

PAGE = Path('artifacts/fawri/src/pages/AdminPage.tsx')
TRANSLATIONS = Path('artifacts/fawri/src/lib/admin-translations.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


page = PAGE.read_text(encoding='utf-8')

page = replace_once(
    page,
    '  const locale = lang === "en" ? "en-US" : "ar-IQ";\n',
    '  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";\n',
    'details locale',
)

page = replace_once(
    page,
    '''  const usedPct = sub
    ? Math.round((sub.replies_used / sub.reply_limit) * 100)
    : 0;
''',
    '''  const baseReplyLimit = sub?.base_reply_limit ?? sub?.reply_limit ?? 0;
  const baseRepliesUsed = sub
    ? sub.base_replies_used ?? Math.min(sub.replies_used, baseReplyLimit)
    : 0;
  const baseRepliesRemaining = sub
    ? sub.base_replies_remaining ?? Math.max(0, baseReplyLimit - baseRepliesUsed)
    : 0;
  const emergencyRepliesRemaining = sub
    ? sub.emergency_credit_remaining ??
      Math.max(0, sub.emergency_credit_amount - sub.emergency_credit_used)
    : 0;
  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;
  const emergencyDebtRemaining =
    sub?.emergency_debt ?? sub?.pending_next_cycle_deduction ?? 0;
  const usedPct =
    baseReplyLimit > 0
      ? Math.round((baseRepliesUsed / baseReplyLimit) * 100)
      : 0;
''',
    'correct subscription balance calculations',
)

old_details = '''  const subscriptionDetails: [string, string][] = sub
    ? [
        [
          adminText.detailsPlan,
          planNames[sub.plan_name as PlanKey] ?? sub.plan_name,
        ],
        [
            adminText.detailsSubscriptionStatus,
            getSubscriptionStatusLabel(sub.status, lang),
          ],
        [
          adminText.detailsStartDate,
          new Date(sub.start_date).toLocaleDateString(locale),
        ],
        [
          adminText.detailsExpiryDate,
          new Date(sub.expires_at).toLocaleDateString(locale),
        ],
        [
          adminText.detailsDaysRemaining,
          `${daysRemaining} ${adminText.detailsDay}`,
        ],
        [
          adminText.detailsReplyLimit,
          sub.reply_limit.toLocaleString(locale),
        ],
        [
          adminText.detailsUsed,
          `${sub.replies_used.toLocaleString(locale)} (${usedPct}%)`,
        ],
        [
          adminText.detailsRemaining,
          sub.replies_remaining.toLocaleString(locale),
        ],
        [
          adminText.detailsAutoReplies,
          sub.auto_reply_enabled
            ? adminText.detailsEnabled
            : adminText.detailsDisabled,
        ],
        [
          adminText.detailsEmergencyCredit,
          sub.emergency_credit_activated
            ? adminText.detailsEnabled
            : adminText.detailsNotEnabled,
        ],
        [
          adminText.detailsEmergencyCreditAmount,
          sub.emergency_credit_amount.toLocaleString(locale),
        ],
        [
          adminText.detailsEmergencyCreditUsed,
          sub.emergency_credit_used.toLocaleString(locale),
        ],
        [
          adminText.detailsNextCycleDeduction,
          sub.pending_next_cycle_deduction.toLocaleString(locale),
        ],
      ]
    : [];
'''

page = replace_once(
    page,
    old_details,
    '',
    'remove old subscription detail list',
)

old_render = '''          {activeTab === "subscription" &&
            (sub ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {subscriptionDetails.map(([label, value]) => (
                  <div
                    key={label}
                    className={`flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 ${textAlignmentClass}`}
                  >
                    <p className="text-sm font-medium leading-5">{label}</p>

                    <span
                      className={`inline-flex min-h-9 w-full items-center justify-start rounded-md border bg-muted px-2 py-2 text-sm font-medium ${textAlignmentClass}`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {adminText.detailsNoActiveSubscription}
              </p>
            ))}
'''

new_render = '''          {activeTab === "subscription" &&
            (sub ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/80 bg-muted/15 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [
                        adminText.detailsPlan,
                        planNames[sub.plan_name as PlanKey] ?? sub.plan_name,
                      ],
                      [
                        adminText.detailsSubscriptionStatus,
                        getSubscriptionStatusLabel(sub.status, lang),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background p-2.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/15 p-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      [
                        adminText.detailsStartDate,
                        new Date(sub.start_date).toLocaleDateString(locale),
                      ],
                      [
                        adminText.detailsExpiryDate,
                        new Date(sub.expires_at).toLocaleDateString(locale),
                      ],
                      [
                        adminText.detailsDaysRemaining,
                        `${daysRemaining.toLocaleString(locale)} ${adminText.detailsDay}`,
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background p-2.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
                        <p className="mt-1 text-xs font-bold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/15 p-3 sm:col-span-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [
                        adminText.detailsBaseReplyLimit,
                        baseReplyLimit.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsBaseUsed,
                        `${baseRepliesUsed.toLocaleString(locale)} (${usedPct.toLocaleString(locale)}%)`,
                      ],
                      [
                        adminText.detailsBaseRemaining,
                        baseRepliesRemaining.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsAutoReplies,
                        sub.auto_reply_enabled
                          ? adminText.detailsEnabled
                          : adminText.detailsDisabled,
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background p-2.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 dark:border-orange-900 dark:bg-orange-950/20">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [
                        adminText.detailsEmergencyCredit,
                        sub.emergency_credit_activated
                          ? adminText.detailsEnabled
                          : adminText.detailsNotEnabled,
                      ],
                      [
                        adminText.detailsEmergencyBalance,
                        emergencyRepliesRemaining.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsEmergencyCreditUsed,
                        sub.emergency_credit_used.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsNextCycleDeduction,
                        emergencyDebtRemaining.toLocaleString(locale),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background p-2.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/15 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [
                        adminText.detailsAddonBalance,
                        addonRepliesRemaining.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsTotalAvailable,
                        totalRepliesAvailable.toLocaleString(locale),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background p-2.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
                        <p className="mt-1 text-base font-black text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {adminText.detailsNoActiveSubscription}
              </p>
            ))}
'''

page = replace_once(
    page,
    old_render,
    new_render,
    'group subscription detail cards',
)

PAGE.write_text(page, encoding='utf-8')

translations = TRANSLATIONS.read_text(encoding='utf-8')
translations = replace_once(
    translations,
    '    detailsNextCycleDeduction: "خصم الدورة القادمة",',
    '    detailsNextCycleDeduction: "دين الطوارئ المتبقي",',
    'Arabic emergency debt label',
)
translations = replace_once(
    translations,
    '    detailsNextCycleDeduction: "Next-cycle deduction",',
    '    detailsNextCycleDeduction: "Remaining emergency debt",',
    'English emergency debt label',
)
translations = replace_once(
    translations,
    '  detailsNextCycleDeduction: "داڕشتنی دەوری داهاتوو",',
    '  detailsNextCycleDeduction: "قەرزی فریاکەوتنی ماوە",',
    'Kurdish emergency debt label',
)
TRANSLATIONS.write_text(translations, encoding='utf-8')

print('Grouped subscription details and corrected base, emergency, add-on, and total balances.')
