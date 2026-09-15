import { useEffect } from 'react';

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

let sharedAbortController: AbortController | null = null;
let activeConsumers = 0;
let delayedClose: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionGeneration = 0;

const REALTIME_EVENT_NAMES: MerchantRealtimeEventName[] = [
  'snapshot',
  'subscription_updated',
  'notifications_updated',
  'support_updated',
];

function closeSharedSource(): void {
  connectionGeneration += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  sharedAbortController?.abort();
  sharedAbortController = null;
}

function dispatchRealtimeData(
  eventName: MerchantRealtimeEventName,
  data: string,
): void {
  try {
    const payload = JSON.parse(data) as Omit<MerchantRealtimeDetail, 'event'>;
    if (
      !payload ||
      typeof payload.unread_notification_count !== 'number' ||
      typeof payload.emitted_at !== 'string'
    ) {
      return;
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

function dispatchSseBlock(block: string): void {
  let eventName: MerchantRealtimeEventName | null = null;
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      const candidate = line.slice('event:'.length).trim();
      if (REALTIME_EVENT_NAMES.includes(candidate as MerchantRealtimeEventName)) {
        eventName = candidate as MerchantRealtimeEventName;
      }
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (!eventName || dataLines.length === 0) return;
  dispatchRealtimeData(eventName, dataLines.join('\n'));
}

async function consumeRealtimeStream(
  response: Response,
  signal: AbortSignal,
): Promise<void> {
  if (!response.ok || !response.body) {
    throw new Error(`Merchant realtime connection failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (block.trim()) dispatchSseBlock(block);
      boundary = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) dispatchSseBlock(buffer.replace(/\r\n/g, '\n'));
}

function scheduleReconnect(generation: number): void {
  if (
    reconnectTimer ||
    generation !== connectionGeneration ||
    activeConsumers === 0
  ) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (generation === connectionGeneration && activeConsumers > 0) {
      openSharedSource();
    }
  }, 1_000);
}

async function runSharedSource(
  controller: AbortController,
  generation: number,
): Promise<void> {
  try {
    const response = await fetch('/api/auth/events', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    await consumeRealtimeStream(response, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Merchant realtime connection failed:', error);
    }
  } finally {
    if (sharedAbortController === controller) {
      sharedAbortController = null;
    }
    if (!controller.signal.aborted) {
      scheduleReconnect(generation);
    }
  }
}

function openSharedSource(): void {
  if (typeof window === 'undefined') return;
  if (sharedAbortController && !sharedAbortController.signal.aborted) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const controller = new AbortController();
  const generation = connectionGeneration;
  sharedAbortController = controller;
  void runSharedSource(controller, generation);
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
      if (!sharedAbortController || sharedAbortController.signal.aborted) {
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
