import { getAdminText } from "@/lib/admin-translations";

type AdminLanguage = Parameters<typeof getAdminText>[0];

export const getMerchantStatusLabel = (
  status: string | null | undefined,
  lang: AdminLanguage,
): string => {
  if (!status) {
    return "";
  }

  const adminText = getAdminText(lang);

  const labels: Record<string, string> = {
    pending_activation: adminText.merchantStatusPending,
    approved: adminText.merchantStatusApproved,
    suspended: adminText.merchantStatusSuspended,
    rejected: adminText.merchantStatusRejected,
  };

  return labels[status] ?? status;
};

export const getSubscriptionStatusLabel = (
  status: string | null | undefined,
  lang: AdminLanguage,
): string => {
  if (!status) {
    return "";
  }

  const adminText = getAdminText(lang);

  const labels: Record<string, string> = {
    active: adminText.subscriptionStatusActive,
    expired: adminText.subscriptionStatusExpired,
    suspended: adminText.subscriptionStatusSuspended,
    replies_exhausted: adminText.subscriptionStatusRepliesExhausted,
    pending_activation: adminText.subscriptionStatusPendingActivation,
  };

  return labels[status] ?? status;
};
