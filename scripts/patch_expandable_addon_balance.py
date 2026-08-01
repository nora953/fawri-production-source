from pathlib import Path

path = Path("artifacts/fawri/src/components/SubscriptionCard.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "import { AlertTriangle, Clock } from 'lucide-react';",
    "import { AlertTriangle, ChevronDown, Clock } from 'lucide-react';",
    "lucide import",
)

replace_once(
    "  const { t, lang } = useI18n();\n  const messages = subscriptionStateMessages[lang];",
    "  const { t, lang } = useI18n();\n  const [isAddonExpanded, setIsAddonExpanded] = React.useState(false);\n  const messages = subscriptionStateMessages[lang];",
    "expand state",
)

replace_once(
    "  const addonReplyBatches = [...(subscription.addon_reply_batches ?? [])]\n    .filter((batch) => batch.remaining > 0)\n    .sort(\n      (left, right) =>\n        new Date(left.expires_at).getTime() -\n        new Date(right.expires_at).getTime(),\n    );",
    "  const addonReplyBatches = [...(subscription.addon_reply_batches ?? [])]\n    .filter((batch) => batch.remaining > 0)\n    .sort(\n      (left, right) =>\n        new Date(left.expires_at).getTime() -\n        new Date(right.expires_at).getTime(),\n    );\n  const hasAddonReplyBatches = addonReplyBatches.length > 0;",
    "batch flag",
)

old_block = '''        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            [t.subscription_addon_balance, addonRepliesRemaining],
            [t.subscription_total_available, totalRepliesAvailable],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="flex min-h-[86px] flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-3 text-center shadow-sm"
            >
              <p className="flex min-h-8 items-center justify-center text-xs font-medium leading-4 text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground" dir="ltr">
                {Number(value).toLocaleString(locale)}
              </p>
            </div>
          ))}
        </div>

        {addonReplyBatches.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3">
            <h3 className="text-sm font-bold text-foreground">
              {t.subscription_addon_batches_title}
            </h3>
            <div className="space-y-2">
              {addonReplyBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {batch.source === 'emergency'
                        ? t.subscription_addon_batch_emergency
                        : t.subscription_addon_batch_purchase}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t.subscription_addon_batch_expires}:{' '}
                      <strong className="text-foreground">
                        {new Date(batch.expires_at).toLocaleDateString(locale)}
                      </strong>
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t.subscription_addon_batch_remaining}:{' '}
                    <strong className="text-base font-extrabold text-foreground" dir="ltr">
                      {batch.remaining.toLocaleString(locale)}
                    </strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
'''

new_block = '''        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              if (hasAddonReplyBatches) {
                setIsAddonExpanded((current) => !current);
              }
            }}
            aria-expanded={hasAddonReplyBatches ? isAddonExpanded : undefined}
            className={`flex min-h-[86px] w-full flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-3 text-center shadow-sm transition hover:border-primary/45 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              isAddonExpanded ? 'sm:col-span-2' : ''
            } ${hasAddonReplyBatches ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex min-h-8 w-full items-center justify-center gap-2 text-xs font-medium leading-4 text-muted-foreground">
              <span>{t.subscription_addon_balance}</span>
              {hasAddonReplyBatches && (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${
                    isAddonExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground" dir="ltr">
              {addonRepliesRemaining.toLocaleString(locale)}
            </p>

            {isAddonExpanded && hasAddonReplyBatches && (
              <div className="mt-4 w-full border-t border-border/70 pt-3 text-start">
                <h3 className="mb-2 text-sm font-bold text-foreground">
                  {t.subscription_addon_batches_title}
                </h3>
                <div className="space-y-2">
                  {addonReplyBatches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {batch.source === 'emergency'
                            ? t.subscription_addon_batch_emergency
                            : t.subscription_addon_batch_purchase}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{t.subscription_addon_batch_expires}</span>
                          <strong className="font-semibold text-foreground" dir="ltr">
                            {new Date(batch.expires_at).toLocaleDateString(locale)}
                          </strong>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t.subscription_addon_batch_remaining}:{' '}
                        <strong className="text-base font-extrabold text-foreground" dir="ltr">
                          {batch.remaining.toLocaleString(locale)}
                        </strong>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </button>

          <div className="flex min-h-[86px] flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-3 text-center shadow-sm">
            <p className="flex min-h-8 items-center justify-center text-xs font-medium leading-4 text-muted-foreground">
              {t.subscription_total_available}
            </p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground" dir="ltr">
              {totalRepliesAvailable.toLocaleString(locale)}
            </p>
          </div>
        </div>
'''

replace_once(old_block, new_block, "addon balance block")

path.write_text(text)
print("Expandable add-on balance card patch applied.")
