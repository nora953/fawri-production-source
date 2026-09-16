import { normalizeKnowledgeText } from "./normalization.js";

export type WarrantyAuthorityDomain =
  | "fawri_subscription_service_guarantee"
  | "merchant_product_warranty";

const FAWRI_SUBSCRIPTION_SERVICE_GUARANTEE_TERMS = [
  "ضمان فوري",
  "ضمان الاشتراك",
  "ضمان الخدمه",
  "ضمان الخدمة",
  "تعويض العطل",
  "تعويض التوقف",
  "تعويض انقطاع الخدمة",
  "تمديد الاشتراك بسبب العطل",
  "استرجاع الاشتراك",
  "استرداد الاشتراك",
  "استرجاع رسوم الاشتراك",
  "استرداد رسوم الاشتراك",
  "fawri subscription guarantee",
  "subscription service guarantee",
  "subscription guarantee",
  "service guarantee",
  "outage credit",
  "outage compensation",
  "subscription refund",
] as const;

const MERCHANT_PRODUCT_WARRANTY_TERMS = [
  "ضمان",
  "كفالة",
  "warranty",
  "product warranty",
  "guarantee",
] as const;

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalizeKnowledgeText(term)));
}

/**
 * Separates the platform's SaaS guarantee from a merchant's product warranty.
 *
 * This classifier does not itself authorize an answer. It only identifies
 * which structured authority is allowed to answer the question. The Fawri
 * subscription guarantee must be resolved from its server-side policy,
 * subscription, incident, and billing evidence. Merchant product warranty
 * remains fail-closed until a separate product-warranty authority is approved.
 */
export function classifyWarrantyAuthorityDomain(
  customerText: string,
): WarrantyAuthorityDomain | null {
  const normalized = normalizeKnowledgeText(customerText);
  if (!normalized) return null;

  if (containsAny(normalized, FAWRI_SUBSCRIPTION_SERVICE_GUARANTEE_TERMS)) {
    return "fawri_subscription_service_guarantee";
  }
  if (containsAny(normalized, MERCHANT_PRODUCT_WARRANTY_TERMS)) {
    return "merchant_product_warranty";
  }
  return null;
}

export function isFawriSubscriptionServiceGuaranteeQuestion(
  customerText: string,
): boolean {
  return (
    classifyWarrantyAuthorityDomain(customerText) ===
    "fawri_subscription_service_guarantee"
  );
}

export function isMerchantProductWarrantyQuestion(customerText: string): boolean {
  return classifyWarrantyAuthorityDomain(customerText) === "merchant_product_warranty";
}
