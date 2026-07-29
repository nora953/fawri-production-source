import { useEffect } from 'react';

import { saveSubscriptions } from '@/lib/store';
import type { Subscription } from '@/lib/types';

export const MERCHANT_REALTIME_EVENT = 'fawri:merchant-realtime';

export type MerchantRealtimeEventName =
  | 'snapshot'
  | 'subscription_updated'
  | 'notifications_updated'
  | 'support_updated';

export interface MerchantRealtimeDetail {
  event: MerchantRealtimeEventName;
  subscription: Subscription | null;
  unread_notification_count: number;
  emitted_at: string;
}

let sharedSource: EventSource | null = null;
let activeConsumers = 0;
let delayedClose: ReturnType<typeof setTimeout> | null = null;

const REALTIME_EVENT_NAMES: MerchantRealtimeEventName[] = [
  'snapshot',
  'subscription_updated',
  'notifications_updated',
  'support_updated',
];

function closeSharedSource(): void {
  sharedSource?.close();
  sharedSource = null;
}

function dispatchRealtimeEvent(
  eventName: MerchantRealtimeEventName,
  event: Event,
): void {
  if (!(event instanceof MessageEvent)) return;

  try {
    const payload = JSON.parse(event.data) as Omit<
      MerchantRealtimeDetail,
      'event'
    >;
    if (
      !payload ||
      typeof payload.unread_notification_count !== 'number' ||
      typeof payload.emitted_at !== 'string'
    ) {
      return;
    }

    if (payload.subscription) {
      saveSubscriptions([payload.subscription]);
    } else {
      saveSubscriptions([]);
    }

    window.dispatchEvent(
      new CustomEvent<MerchantRealtimeDetail>(MERCHANT_REALTIME_EVENT, {
        detail: { ...payload, event: eventName },
      }),
    );
  } catch (error) {
    console.error('Could not parse merchant realtime event:', error);
  }
}

function openSharedSource(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  if (
    sharedSource &&
    (sharedSource.readyState === EventSource.OPEN ||
      sharedSource.readyState === EventSource.CONNECTING)
  ) {
    return;
  }

  closeSharedSource();
  const source = new EventSource('/api/auth/events');
  sharedSource = source;

  for (const eventName of REALTIME_EVENT_NAMES) {
    source.addEventListener(eventName, (event) =>
      dispatchRealtimeEvent(eventName, event),
    );
  }

  source.onerror = () => {
    // Native EventSource reconnects automatically. A fresh connection receives
    // a complete snapshot, so missed changes are recovered without polling.
  };
}

export function useMerchantRealtimeConnection(): void {
  useEffect(() => {
    activeConsumers += 1;
    if (delayedClose) {
      clearTimeout(delayedClose);
      delayedClose = null;
    }
    openSharedSource();

    const handleFocus = () => {
      if (!sharedSource || sharedSource.readyState === EventSource.CLOSED) {
        openSharedSource();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      activeConsumers = Math.max(0, activeConsumers - 1);
      delayedClose = setTimeout(() => {
        if (activeConsumers === 0) closeSharedSource();
      }, 750);
    };
  }, []);
}
