from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


emergency_path = Path("artifacts/fawri/src/components/EmergencyCredit.tsx")
subscription_card_path = Path("artifacts/fawri/src/components/SubscriptionCard.tsx")
auth_path = Path("artifacts/api-server/src/routes/auth.ts")
test_path = Path(
    "artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs"
)
ar_path = Path("artifacts/fawri/src/lib/translations/ar.ts")
en_path = Path("artifacts/fawri/src/lib/translations/en.ts")
ku_path = Path("artifacts/fawri/src/lib/translations/ku.ts")

replace_once(
    emergency_path,
    '''  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  const locale =
''',
    '''  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const isRtl = lang !== 'en';
  const emergencyAmount = subscription.emergency_credit_amount;

  const locale =
''',
    "emergency modal direction constants",
)

replace_once(
    emergency_path,
    '''              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.activate_emergency}</DialogTitle>
                  <DialogDescription className="pt-4">
                    {t.emergency_confirm}
                  </DialogDescription>
                </DialogHeader>

                <DialogFooter className="mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    onClick={handleActivate}
                    disabled={!isEligible}
                  >
                    {t.confirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
''',
    '''              <DialogContent
                dir={isRtl ? 'rtl' : 'ltr'}
                className="max-w-md overflow-hidden p-0"
                closeButtonClassName={
                  isRtl ? 'left-4 right-auto' : 'right-4 left-auto'
                }
              >
                <div className="border-b border-orange-100 bg-orange-50/70 px-5 pb-5 pt-6 dark:border-orange-900/40 dark:bg-orange-950/20">
                  <DialogHeader className="space-y-3 text-start sm:text-start">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
                        <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <DialogTitle className="text-xl leading-7">
                        {t.activate_emergency}
                      </DialogTitle>
                    </div>
                    <DialogDescription className="text-start text-sm leading-6">
                      {t.emergency_confirm}
                    </DialogDescription>
                  </DialogHeader>
                </div>

                <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-2">
                  <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-center dark:border-orange-900/50 dark:bg-orange-950/20">
                    <p className="text-xs font-medium leading-5 text-muted-foreground">
                      {t.emergency_modal_credit_label}
                    </p>
                    <p
                      className="mt-1 text-2xl font-extrabold tabular-nums text-orange-600 dark:text-orange-400"
                      dir="ltr"
                    >
                      {emergencyAmount.toLocaleString(locale)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
                    <p className="text-xs font-medium leading-5 text-muted-foreground">
                      {t.emergency_modal_debt_label}
                    </p>
                    <p
                      className="mt-1 text-2xl font-extrabold tabular-nums text-foreground"
                      dir="ltr"
                    >
                      {emergencyAmount.toLocaleString(locale)}
                    </p>
                  </div>
                </div>

                <DialogFooter
                  dir="ltr"
                  className="mt-0 flex-row justify-end gap-2 space-x-0 border-t px-5 py-4"
                >
                  <Button
                    variant="outline"
                    className="min-w-24"
                    onClick={() => setOpen(false)}
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    className="min-w-24"
                    onClick={handleActivate}
                    disabled={!isEligible}
                  >
                    {t.confirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
''',
    "emergency modal layout",
)

replace_once(
    ar_path,
    '''  emergency_confirm: "سيُضاف رصيد الطوارئ الآن، ويُخصم دينه من أول عملية شراء لاحقة، سواء شراء خطة جديدة أو ردود إضافية.",
''',
    '''  emergency_confirm: "سيُضاف الرصيد الآن ويُسجل دين بالقيمة نفسها. يُخصم الدين مرة واحدة من أول تجديد أو تغيير للخطة أو شراء رصيد إضافي لاحق.",
  emergency_modal_credit_label: "رصيد الطوارئ المضاف",
  emergency_modal_debt_label: "دين الطوارئ المسجل",
''',
    "Arabic emergency modal copy",
)

replace_once(
    en_path,
    '''  emergency_confirm: "Emergency reply credit will be added now. Its debt will be deducted from your first later purchase, whether a new plan or additional replies.",
''',
    '''  emergency_confirm: "The replies will be added now and an equal debt will be recorded. The debt is deducted once from your next plan renewal, plan change, or additional-reply purchase.",
  emergency_modal_credit_label: "Emergency replies added",
  emergency_modal_debt_label: "Emergency debt recorded",
''',
    "English emergency modal copy",
)

replace_once(
    ku_path,
    '''  emergency_confirm: "کرێدیتی فریاکەوتن ئێستا زیاد دەکرێت. قەرزەکەی لە یەکەم کڕینی داهاتوو کەم دەکرێتەوە، جا پلانی نوێ بێت یان وەڵامی زیادە.",
''',
    '''  emergency_confirm: "وەڵامەکان ئێستا زیاد دەکرێن و قەرزێک بە هەمان بڕ تۆمار دەکرێت. قەرزەکە تەنها یەک جار لە یەکەم نوێکردنەوە یان گۆڕینی پلان یان کڕینی وەڵامی زیادەی داهاتوو کەم دەکرێتەوە.",
  emergency_modal_credit_label: "وەڵامی فریاکەوتنی زیادکراو",
  emergency_modal_debt_label: "قەرزی فریاکەوتنی تۆمارکراو",
''',
    "Kurdish emergency modal copy",
)

replace_once(
    subscription_card_path,
    '''  const addonReplyBatches = [...(subscription.addon_reply_batches ?? [])]
    .filter((batch) => batch.remaining > 0)
    .sort(
      (left, right) =>
        new Date(left.expires_at).getTime() -
        new Date(right.expires_at).getTime(),
    );
''',
    '''  const addonReplyBatches = [...(subscription.addon_reply_batches ?? [])]
    .filter((batch) => batch.remaining > 0)
    .sort((left, right) => {
      const expiryDifference =
        new Date(left.expires_at).getTime() -
        new Date(right.expires_at).getTime();
      if (expiryDifference !== 0) return expiryDifference;

      const purchaseDifference =
        new Date(left.purchased_at).getTime() -
        new Date(right.purchased_at).getTime();
      if (purchaseDifference !== 0) return purchaseDifference;

      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
''',
    "frontend add-on batch deterministic order",
)

replace_once(
    auth_path,
    '''type SubscriptionRecord = {
''',
    '''function compareAddonReplyBatches(
  left: AddonReplyBatch,
  right: AddonReplyBatch,
): number {
  const expiryDifference =
    new Date(left.expires_at).getTime() -
    new Date(right.expires_at).getTime();
  if (expiryDifference !== 0) return expiryDifference;

  const purchaseDifference =
    new Date(left.purchased_at).getTime() -
    new Date(right.purchased_at).getTime();
  if (purchaseDifference !== 0) return purchaseDifference;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

type SubscriptionRecord = {
''',
    "backend add-on batch comparator",
)

replace_once(
    auth_path,
    '''    .sort(
      (left, right) =>
        new Date(left.expires_at).getTime() - new Date(right.expires_at).getTime(),
    );
''',
    '''    .sort(compareAddonReplyBatches);
''',
    "backend add-on batch normalization order",
)

replace_once(
    auth_path,
    '''function consumeReplies(subscription: SubscriptionRecord, amount: number): void {
  let remainingToConsume = amount;

  const fromBase = Math.min(subscription.base_replies_remaining, remainingToConsume);
''',
    '''function consumeReplies(subscription: SubscriptionRecord, amount: number): void {
  let remainingToConsume = amount;

  subscription.addon_reply_batches.sort(compareAddonReplyBatches);

  const fromBase = Math.min(subscription.base_replies_remaining, remainingToConsume);
''',
    "backend add-on batch consumption order",
)

replace_once(
    test_path,
    '''  assert.equal(emergencyC.body.subscription.replies_remaining, 900);
});
''',
    '''  assert.equal(emergencyC.body.subscription.replies_remaining, 900);

  const oldestExpiryFirst = await subscriptionAction(
    "merchant-c",
    "deduct_replies",
    450,
  );
  assert.equal(oldestExpiryFirst.response.status, 200);
  assert.equal(oldestExpiryFirst.body.subscription.base_replies_remaining, 0);
  assert.equal(oldestExpiryFirst.body.subscription.addon_replies_remaining, 450);
  assert.equal(oldestExpiryFirst.body.subscription.replies_remaining, 450);

  const [olderPurchaseBatch, newerEmergencyBatch] =
    oldestExpiryFirst.body.subscription.addon_reply_batches;
  assert.equal(olderPurchaseBatch.source, "purchase");
  assert.equal(olderPurchaseBatch.remaining, 50);
  assert.equal(newerEmergencyBatch.source, "emergency");
  assert.equal(newerEmergencyBatch.remaining, 400);
  assert.ok(
    new Date(olderPurchaseBatch.expires_at).getTime() <=
      new Date(newerEmergencyBatch.expires_at).getTime(),
  );
});
''',
    "add-on oldest-expiry-first integration coverage",
)

print("Emergency modal, deterministic batch order, and lifecycle coverage applied.")
