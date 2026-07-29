import { useCallback, useEffect, useState } from 'react';

import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

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
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (typeof detail?.unread_notification_count === 'number') {
        setCount(Math.max(0, detail.unread_notification_count));
      }
    };

    window.addEventListener('focus', handleRefresh);
    window.addEventListener(
      MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
      handleRefresh,
    );
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener(
        MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
        handleRefresh,
      );
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [loadCount]);

  return count;
}
