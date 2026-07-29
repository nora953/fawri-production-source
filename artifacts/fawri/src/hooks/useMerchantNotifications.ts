import { useCallback, useEffect, useState } from 'react';

export const MERCHANT_NOTIFICATIONS_CHANGED_EVENT =
  'fawri:merchant-notifications-changed';

export function notifyMerchantNotificationsChanged(): void {
  window.dispatchEvent(new Event(MERCHANT_NOTIFICATIONS_CHANGED_EVENT));
}

export function useUnreadMerchantNotificationCount(): number {
  const [count, setCount] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/notifications?unread=1&limit=50', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setCount(0);
        return;
      }

      setCount(
        Array.isArray(data.notifications) ? data.notifications.length : 0,
      );
    } catch (error) {
      console.error('Could not load unread merchant notification count:', error);
    }
  }, []);

  useEffect(() => {
    void loadCount();

    const handleRefresh = () => void loadCount();
    window.addEventListener('focus', handleRefresh);
    window.addEventListener(
      MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
      handleRefresh,
    );

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener(
        MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
        handleRefresh,
      );
    };
  }, [loadCount]);

  return count;
}
