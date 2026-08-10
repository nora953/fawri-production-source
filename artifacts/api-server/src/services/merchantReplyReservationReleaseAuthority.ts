import {
  releaseMerchantAutoReplyReservation as releaseMerchantAutoReplyReservationLegacy,
  type MerchantReplyReleaseCode,
  type MerchantReplyReleaseResult,
} from "./merchantReplyReservationRelease";
import {
  restoreMerchantAutoReplyPostgres,
  subscriptionPostgresAuthorityRequired,
} from "./postgresSubscriptionEntitlement";

export async function releaseMerchantAutoReplyReservationAuthoritative(
  eventId: string,
  reasonCode: MerchantReplyReleaseCode,
  now: Date = new Date(),
): Promise<MerchantReplyReleaseResult> {
  if (!subscriptionPostgresAuthorityRequired()) {
    return releaseMerchantAutoReplyReservationLegacy(eventId, reasonCode, now);
  }

  const result = await restoreMerchantAutoReplyPostgres(
    eventId,
    { kind: "release", reasonCode },
    now,
  );
  return result.restored
    ? {
        released: true,
        merchantId: result.merchantId,
        subscriptionId: result.subscriptionId,
      }
    : { released: false, reason: result.reason };
}

export type { MerchantReplyReleaseCode, MerchantReplyReleaseResult };
