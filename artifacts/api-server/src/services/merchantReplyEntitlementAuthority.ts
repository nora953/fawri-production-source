import {
  reserveMerchantAutoReply as reserveMerchantAutoReplyLegacy,
  type MerchantReplyEntitlementDecision,
} from "./merchantReplyEntitlement";
import {
  reserveMerchantAutoReplyPostgres,
  subscriptionPostgresAuthorityRequired,
} from "./postgresSubscriptionEntitlement";

/**
 * Transitional authority switch. `required` means fail-closed PostgreSQL.
 * Other values preserve the pre-cutover file-backed behavior until an explicit
 * production activation is approved.
 */
export async function reserveMerchantAutoReplyAuthoritative(
  merchantId: string,
  eventId: string,
  now: Date = new Date(),
): Promise<MerchantReplyEntitlementDecision> {
  if (subscriptionPostgresAuthorityRequired()) {
    return reserveMerchantAutoReplyPostgres(merchantId, eventId, now);
  }
  return reserveMerchantAutoReplyLegacy(merchantId, eventId, now);
}
