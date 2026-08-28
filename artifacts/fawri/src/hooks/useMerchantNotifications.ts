import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

export const MERCHANT_NOTIFICATIONS_CHANGED_EVENT =
  'fawri:merchant-notifications-changed';

export type MerchantNotificationCountState = number | 'loading' | 'unavailable';

export function notifyMerchantNotificationsChanged(): void {
  window.dispatchEvent(new Event(MERCHANT_NOTIFICATIONS_CHANGED_EVENT));
}

export function useUnreadMerchantNotificationCount(): MerchantNotificationCountState {
  const [count, setCount] = useState<MerchantNotificationCountState>('loading');
  const loadRequestIdRef = useRef(0);

  const loadCount = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    try {
      const response = await fetch('/api/auth/notifications?unread=1&limit=50', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (requestId !== loadRequestIdRef.current) return;

      if (!response.ok || !data?.ok || !Array.isArray(data.notifications)) {
        setCount('unavailable');
        return;
      }

      setCount(data.notifications.length);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('Could not load unread merchant notification count:', error);
      setCount('unavailable');
    }
  }, []);

  useEffect(() => {
    void loadCount();

    const handleRefresh = () => void loadCount();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (typeof detail?.unread_notification_count === 'number') {
        loadRequestIdRef.current += 1;
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
      loadRequestIdRef.current += 1;
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
