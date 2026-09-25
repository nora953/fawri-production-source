import {
  releaseMerchantAutoReplyReservation as releaseMerchantAutoReplyReservationLegacy,
  type MerchantReplyReleaseCode as LegacyMerchantReplyReleaseCode,
  type MerchantReplyReleaseResult,
} from "./merchantReplyReservationRelease";
import {
  restoreMerchantAutoReplyPostgres,
  subscriptionPostgresAuthorityRequired,
} from "./postgresSubscriptionEntitlement";

export type MerchantReplyReleaseCode =
  | LegacyMerchantReplyReleaseCode
  | "MERCHANT_APPROVAL_REQUIRED"
  | "MERCHANT_REJECTED"
  | "MERCHANT_SUSPENDED"
  | "MERCHANT_ACCESS_STATE_UNAVAILABLE"
  | "CONVERSATION_CONTEXT_SUPERSEDED";

function postgresReleaseRestore(reasonCode: MerchantReplyReleaseCode) {
  // PostgreSQL persists reply-ledger reason_code as text. Keep the authoritative
  // adapter wider than the older compile-time ReplyRestoreKind union so an
  // operational cutoff is recorded truthfully instead of being mislabeled as a
  // settings failure. The persistence primitive remains exactly-once.
  return { kind: "release", reasonCode } as unknown as Parameters<
    typeof restoreMerchantAutoReplyPostgres
  >[1];
}

export async function releaseMerchantAutoReplyReservationAuthoritative(
  eventId: string,
  reasonCode: MerchantReplyReleaseCode,
  now: Date = new Date(),
): Promise<MerchantReplyReleaseResult> {
  if (!subscriptionPostgresAuthorityRequired()) {
    return releaseMerchantAutoReplyReservationLegacy(
      eventId,
      reasonCode as LegacyMerchantReplyReleaseCode,
      now,
    );
  }

  const result = await restoreMerchantAutoReplyPostgres(
    eventId,
    postgresReleaseRestore(reasonCode),
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

export type { MerchantReplyReleaseResult };
