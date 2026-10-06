import { useQuery } from '@tanstack/react-query';
import { loadCurrentSubscriptionAuthority } from '@/lib/currentSubscriptionAuthority';

export type CashierFeatureState =
  | 'inactive'
  | 'active'
  | 'grace'
  | 'restricted'
  | 'suspended';

type MerchantFeatureEntitlements = {
  botVisible: boolean;
  cashierManagementVisible: boolean;
  cashierRuntimeVisible: boolean;
  cashierState: CashierFeatureState;
};

async function loadMerchantFeatureEntitlements(): Promise<MerchantFeatureEntitlements> {
  const [bot, cashierResponse] = await Promise.all([
    loadCurrentSubscriptionAuthority(),
    fetch('/api/cashier/subscription', {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }).catch(() => null),
  ]);

  const botVisible =
    bot.status === 'ready' &&
    !['expired', 'suspended'].includes(bot.subscription.status);

  let cashierState: CashierFeatureState = 'inactive';
  if (cashierResponse?.ok) {
    const payload = await cashierResponse.json().catch(() => null);
    const state = String(payload?.entitlement?.state || 'inactive');
    if (
      state === 'active' ||
      state === 'grace' ||
      state === 'restricted' ||
      state === 'suspended'
    ) {
      cashierState = state;
    }
  }

  return {
    botVisible,
    cashierManagementVisible: cashierState !== 'inactive',
    cashierRuntimeVisible: cashierState === 'active' || cashierState === 'grace',
    cashierState,
  };
}

export function useMerchantFeatureEntitlements() {
  const query = useQuery({
    queryKey: ['merchant-feature-entitlements'],
    queryFn: loadMerchantFeatureEntitlements,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return {
    loading: query.isLoading,
    botVisible: query.data?.botVisible === true,
    cashierManagementVisible: query.data?.cashierManagementVisible === true,
    cashierRuntimeVisible: query.data?.cashierRuntimeVisible === true,
    cashierState: query.data?.cashierState || 'inactive',
  };
}
