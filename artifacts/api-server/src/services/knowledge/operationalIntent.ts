import { normalizeKnowledgeText } from "./normalization.js";

const DELIVERY_TERMS = ["توصيل", "شحن", "يوصل", "delivery", "shipping", "گەیاندن", "گواستنەوە"];

export function hasPriceIntent(customerText: string): boolean {
  const text = normalizeKnowledgeText(customerText);
  return ["سعر", "بكم", "شكد", "نرخ"].some((term) => text.includes(normalizeKnowledgeText(term)))
    || /(?:^|\s)(?:price|cost)(?:\s|$)/.test(text)
    || /\bhow much (?:is|are)\b|\bhow much does\b.*\bcost\b/.test(text);
}

/** Distinguish explicit electrical terminology without exempting mixed intents. */
export function hasDeliveryPolicyIntent(customerText: string): boolean {
  let text = normalizeKnowledgeText(customerText)
    .replace(/\bpower\s+delivery\b/g, " ");

  // Bare شحن remains ambiguous and requires authoritative handling. Only mask
  // a charging-speed verb whose preceding subject is electrical equipment.
  // A destination or merchant/shipment context keeps the delivery interpretation.
  const shippingContext = /(?:^|\s)(?:الي|ل[\p{L}]+)(?:\s|$)/u.test(text)
    || /متجر|محل|بايع|بائع|طلب|طرد|شركه/.test(text);
  if (!shippingContext) {
    text = text.replace(/(?:يشحن|تشحن)(?=\s+(?:بسرعه|ببطء|ببطي))/g, (verb, offset: number) => {
      const subject = text.slice(0, offset);
      return /شاحن|بطاريه|كابل|كيبل/.test(subject) ? " " : verb;
    });
  }
  return DELIVERY_TERMS.some((term) => text.includes(normalizeKnowledgeText(term)));
}
