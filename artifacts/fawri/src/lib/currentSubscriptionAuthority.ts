import type { Subscription } from '@/lib/types';

export type CurrentSubscriptionAuthorityResult =
  | { status: 'ready'; subscription: Subscription }
  | { status: 'missing'; subscription: null }
  | { status: 'unavailable'; subscription: null; code: string | null };

type CurrentSubscriptionEnvelope = {
  ok?: unknown;
  code?: unknown;
  subscription?: unknown;
};

export async function loadCurrentSubscriptionAuthority(): Promise<CurrentSubscriptionAuthorityResult> {
  try {
    const response = await fetch('/api/auth/subscription/current', {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = (await response.json().catch(() => null)) as CurrentSubscriptionEnvelope | null;

    if (response.ok && data?.ok === true && data.subscription) {
      return {
        status: 'ready',
        subscription: data.subscription as Subscription,
      };
    }

    if (response.status === 404 && data?.code === 'SUBSCRIPTION_NOT_FOUND') {
      return { status: 'missing', subscription: null };
    }

    return {
      status: 'unavailable',
      subscription: null,
      code: typeof data?.code === 'string' ? data.code : null,
    };
  } catch {
    return { status: 'unavailable', subscription: null, code: null };
  }
}
