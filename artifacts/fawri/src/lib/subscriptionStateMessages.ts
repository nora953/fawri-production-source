import { SUBSCRIPTION_STATE_MESSAGES_SUBSCRIPTION_STATE_MESSAGES } from '@/lib/translations/features/lib/subscriptionStateMessages';
import type { Lang } from './types';

type SubscriptionStateMessages = {
  noSubscriptionTitle: string;
  noSubscriptionBody: string;
  suspendedTitle: string;
  suspendedBody: string;
  expiredProtectedTitle: string;
  expiredProtectedBody: string;
  pendingTitle: string;
  pendingBody: string;
  repliesExhaustedTitle: string;
  repliesExhaustedBody: string;
  emergencyUnavailable: string;
};

export const subscriptionStateMessages: Record<Lang, SubscriptionStateMessages> = SUBSCRIPTION_STATE_MESSAGES_SUBSCRIPTION_STATE_MESSAGES;
