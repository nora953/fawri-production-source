from pathlib import Path

path = Path("artifacts/fawri/src/pages/AdminPage.tsx")
text = path.read_text(encoding="utf-8")

before = '''  }, [
    canManageSubscriptions,
    handleUnauthorizedAdminResponse,
  ]);

  const getSub = (id: string) =>
    subscriptions.find((s) => s.merchant_id === id);
'''

after = '''  }, [
    canManageSubscriptions,
    handleUnauthorizedAdminResponse,
  ]);

  useEffect(() => {
    if (!canManageSubscriptions) return;

    const refreshSubscriptionsWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshSubscriptionsFromApi();
    };

    const intervalId = window.setInterval(
      refreshSubscriptionsWhenVisible,
      5_000,
    );
    window.addEventListener("focus", refreshSubscriptionsWhenVisible);
    document.addEventListener(
      "visibilitychange",
      refreshSubscriptionsWhenVisible,
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSubscriptionsWhenVisible);
      document.removeEventListener(
        "visibilitychange",
        refreshSubscriptionsWhenVisible,
      );
    };
  }, [canManageSubscriptions, refreshSubscriptionsFromApi]);

  const getSub = (id: string) =>
    subscriptions.find((s) => s.merchant_id === id);
'''

count = text.count(before)
if count != 1:
    raise SystemExit(f"Expected one insertion point, found {count}")

path.write_text(text.replace(before, after, 1), encoding="utf-8")
print("Admin subscription data now has a visible-tab refresh fallback.")
