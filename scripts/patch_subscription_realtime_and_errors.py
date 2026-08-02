from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


retention_path = Path(
    "artifacts/fawri/src/components/SubscriptionRetentionCard.tsx"
)
admin_page_path = Path("artifacts/fawri/src/pages/AdminPage.tsx")
admin_translations_path = Path("artifacts/fawri/src/lib/admin-translations.ts")

replace_once(
    retention_path,
    'import { Card, CardContent } from "@/components/ui/card";\n',
    '''import { Card, CardContent } from "@/components/ui/card";
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from "@/hooks/useMerchantRealtime";
''',
    "retention realtime import",
)

replace_once(
    retention_path,
    '''  useEffect(() => {
    let active = true;

    Promise.all([
      refreshCurrentMerchantFromApi(),
      fetch('/api/auth/subscription/current').then(async response => ({
        response,
        data: await response.json().catch(() => null),
      })),
    ])
      .then(([updatedMerchant, subscriptionResult]) => {
        if (!active) return;
        if (updatedMerchant) setMerchant(updatedMerchant);

        if (
          subscriptionResult.response.ok &&
          subscriptionResult.data?.ok &&
          subscriptionResult.data.subscription
        ) {
          const serverSubscription = subscriptionResult.data.subscription as Subscription;
          saveSubscriptions([serverSubscription]);
          setSubscription(serverSubscription);
        } else {
          setSubscription(null);
        }
      })
      .catch(error => {
        console.error("Merchant subscription state refresh failed:", error);
        if (active) setSubscription(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);
''',
    '''  useEffect(() => {
    let active = true;

    const applySubscription = (nextSubscription: Subscription | null) => {
      if (!active) return;
      if (nextSubscription) saveSubscriptions([nextSubscription]);
      else saveSubscriptions([]);
      setSubscription(nextSubscription);
      setLoading(false);
    };

    const loadState = async () => {
      try {
        const [updatedMerchant, subscriptionResult] = await Promise.all([
          refreshCurrentMerchantFromApi(),
          fetch('/api/auth/subscription/current', { cache: 'no-store' }).then(
            async response => ({
              response,
              data: await response.json().catch(() => null),
            }),
          ),
        ]);
        if (!active) return;
        if (updatedMerchant) setMerchant(updatedMerchant);

        applySubscription(
          subscriptionResult.response.ok &&
            subscriptionResult.data?.ok &&
            subscriptionResult.data.subscription
            ? (subscriptionResult.data.subscription as Subscription)
            : null,
        );
      } catch (error) {
        console.error("Merchant subscription state refresh failed:", error);
        if (active) setLoading(false);
      }
    };

    const handleFocus = () => void loadState();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      const nextSubscription = detail?.subscription ?? null;
      if (
        nextSubscription &&
        merchant?.id &&
        nextSubscription.merchant_id !== merchant.id
      ) {
        return;
      }
      applySubscription(nextSubscription);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    void loadState();

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [merchant?.id]);
''',
    "retention realtime effect",
)

replace_once(
    admin_translations_path,
    '''    noSubscriptionError: "لا يوجد اشتراك",
    subscriptionOperationError:
      "تعذر حفظ عملية الاشتراك في السيرفر.",
''',
    '''    noSubscriptionError: "لا يوجد اشتراك",
    subscriptionOperationError:
      "تعذر حفظ عملية الاشتراك في السيرفر.",
    planCycleStartBlocked:
      "لا يمكن تجديد أو تغيير الخطة قبل نفاد الرصيد الأساسي أو انتهاء صلاحية الاشتراك.",
''',
    "Arabic active-cycle message",
)

replace_once(
    admin_translations_path,
    '''    noSubscriptionError: "No subscription found.",
    subscriptionOperationError:
      "The subscription operation could not be saved on the server.",
''',
    '''    noSubscriptionError: "No subscription found.",
    subscriptionOperationError:
      "The subscription operation could not be saved on the server.",
    planCycleStartBlocked:
      "The plan can only be renewed or changed after the base balance is exhausted or the subscription expires.",
''',
    "English active-cycle message",
)

replace_once(
    admin_translations_path,
    '''  noSubscriptionError: "هیچ بەشدارییەکی چالاک نەدۆزرایەوە",
  subscriptionOperationError:
    "نەتوانرا کردارەکەی بەشداری لە سێرڤەر پاشەکەوت بکرێت.",
''',
    '''  noSubscriptionError: "هیچ بەشدارییەکی چالاک نەدۆزرایەوە",
  subscriptionOperationError:
    "نەتوانرا کردارەکەی بەشداری لە سێرڤەر پاشەکەوت بکرێت.",
  planCycleStartBlocked:
    "نوێکردنەوە یان گۆڕینی پلان تەنها دوای بەتاڵبوونی باڵانسی سەرەکی یان بەسەرچوونی بەشداری دەکرێت.",
''',
    "Kurdish active-cycle message",
)

replace_once(
    admin_page_path,
    '''      toast.error(
        operation === "activate"
          ? adminText.planActivationSaveError
          : operation === "change"
            ? adminText.planChangeSaveError
            : adminText.planRenewSaveError,
      );
''',
    '''      const message = error instanceof Error ? error.message : "";
      const cycleStillActive = message.includes(
        "a new subscription cycle requires exhausted base replies or an expired subscription",
      );
      toast.error(
        cycleStillActive
          ? adminText.planCycleStartBlocked
          : operation === "activate"
            ? adminText.planActivationSaveError
            : operation === "change"
              ? adminText.planChangeSaveError
              : adminText.planRenewSaveError,
      );
''',
    "admin active-cycle error mapping",
)

print("Subscription realtime card and clear cycle error messages applied.")
