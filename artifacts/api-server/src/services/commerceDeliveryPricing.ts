import {
  resolveEffectiveDeliveryFee,
  type CommercePromotionRule,
} from "./commercePromotionRuntime";
import {
  resolveDeliveryQuote,
  type DeliveryPricingPolicy,
  type DeliveryQuote,
} from "./deliveryPricing";

export type CommerceDeliveryQuote = DeliveryQuote & {
  pre_promotion_fee_iqd: number;
  promotion_applied: boolean;
  promotion_id?: string;
  promotion_name?: string;
  promotion_version?: number;
};

export function resolveCommerceDeliveryQuote(input: {
  policy: DeliveryPricingPolicy;
  area?: unknown;
  subtotal_iqd?: unknown;
  currency_code: string;
  promotions: CommercePromotionRule[];
  at?: string | Date | number;
}): CommerceDeliveryQuote {
  const quote = resolveDeliveryQuote({
    policy: input.policy,
    area: input.area,
    subtotal_iqd: input.subtotal_iqd,
  });

  if (!quote.available) {
    return {
      ...quote,
      pre_promotion_fee_iqd: quote.effective_fee_iqd,
      promotion_applied: false,
    };
  }

  // Permanent merchant policy (including its normal free-delivery threshold)
  // resolves first. A scheduled campaign only acts on the remaining fee so
  // reports do not attribute an already-free shipment to the campaign.
  const prePromotionFee = quote.effective_fee_iqd;
  if (prePromotionFee === 0) {
    return {
      ...quote,
      pre_promotion_fee_iqd: 0,
      promotion_applied: false,
    };
  }

  const promotion = resolveEffectiveDeliveryFee({
    merchantId: quote.merchant_id,
    baseFeeMinor: prePromotionFee,
    subtotalMinor: quote.subtotal_iqd,
    currencyCode: input.currency_code,
    promotions: input.promotions,
    at: input.at,
  });
  const promotionMadeDeliveryFree =
    promotion.promotion_applied && promotion.effective_fee_minor === 0;

  return {
    ...quote,
    pre_promotion_fee_iqd: prePromotionFee,
    effective_fee_iqd: promotion.effective_fee_minor,
    free_delivery_applied:
      quote.free_delivery_applied || promotionMadeDeliveryFree,
    total_iqd: quote.subtotal_iqd + promotion.effective_fee_minor,
    promotion_applied: promotion.promotion_applied,
    ...(promotion.promotion_id ? { promotion_id: promotion.promotion_id } : {}),
    ...(promotion.promotion_name
      ? { promotion_name: promotion.promotion_name }
      : {}),
    ...(promotion.promotion_version
      ? { promotion_version: promotion.promotion_version }
      : {}),
  };
}
