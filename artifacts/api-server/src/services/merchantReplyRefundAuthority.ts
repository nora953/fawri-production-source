import {
  refundMerchantAutoReply as refundMerchantAutoReplyLegacy,
  type ReplyRefundResult,
} from "./merchantReplyRefund";
import {
  restoreMerchantAutoReplyPostgres,
  subscriptionPostgresAuthorityRequired,
} from "./postgresSubscriptionEntitlement";

export async function refundMerchantAutoReplyAuthoritative(
  eventId: string,
  confirmedFailureCode: "META_REPLY_FAILED",
  now: Date = new Date(),
): Promise<ReplyRefundResult> {
  if (!subscriptionPostgresAuthorityRequired()) {
    return refundMerchantAutoReplyLegacy(eventId, confirmedFailureCode, now);
  }

  const result = await restoreMerchantAutoReplyPostgres(
    eventId,
    { kind: "refund", reasonCode: confirmedFailureCode },
    now,
  );
  return result.restored
    ? {
        refunded: true,
        merchantId: result.merchantId,
        subscriptionId: result.subscriptionId,
      }
    : { refunded: false, reason: result.reason };
}
