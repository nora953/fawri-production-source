import type { AccountStatus, MerchantStatus, OnboardingStatus } from './types';

const ACCOUNT_STATUSES = new Set<AccountStatus>([
  'pending_review',
  'approved',
  'rejected',
  'suspended',
]);

const MERCHANT_STATUSES = new Set<MerchantStatus>([
  'pending_activation',
  'approved',
  'rejected',
  'suspended',
]);

const ONBOARDING_STATUSES = new Set<OnboardingStatus>([
  'pending_review',
  'awaiting_channel',
  'channel_connected',
  'activation_expired',
]);

export type MerchantLifecycleSnapshot = {
  account_status: AccountStatus;
  merchant_status: MerchantStatus;
  onboarding_status: OnboardingStatus;
};

export type MerchantLifecycleCheck =
  | { ok: true; lifecycle: MerchantLifecycleSnapshot }
  | { ok: false; reason: 'unauthenticated' | 'unavailable' };

export async function checkMerchantLifecycle(
  signal?: AbortSignal,
): Promise<MerchantLifecycleCheck> {
  try {
    const response = await fetch('/api/auth/lifecycle', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    const result = await response.json().catch(() => null);

    if (response.status === 401) {
      return { ok: false, reason: 'unauthenticated' };
    }
    if (!response.ok || !result?.ok || !result.lifecycle) {
      return { ok: false, reason: 'unavailable' };
    }

    const accountStatus = result.lifecycle.account_status as AccountStatus;
    const merchantStatus = result.lifecycle.merchant_status as MerchantStatus;
    const onboardingStatus = result.lifecycle.onboarding_status as OnboardingStatus;
    if (
      !ACCOUNT_STATUSES.has(accountStatus) ||
      !MERCHANT_STATUSES.has(merchantStatus) ||
      !ONBOARDING_STATUSES.has(onboardingStatus)
    ) {
      return { ok: false, reason: 'unavailable' };
    }

    return {
      ok: true,
      lifecycle: {
        account_status: accountStatus,
        merchant_status: merchantStatus,
        onboarding_status: onboardingStatus,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return { ok: false, reason: 'unavailable' };
  }
}

export function lifecyclePollDelay(failureCount: number): number {
  if (failureCount <= 0) return 30_000;
  return Math.min(60_000, 30_000 * 2 ** Math.max(0, failureCount - 1));
}

export function shouldPollMerchantLifecycle(
  state: AccountStatus | 'unavailable',
): boolean {
  return state === 'pending_review' || state === 'suspended' || state === 'unavailable';
}
