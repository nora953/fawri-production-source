import type { CatalogProductFormState } from '@/lib/catalogProductEditor';
import {
  catalogMajorAmountToMinor,
  catalogMinorAmountToMajor,
} from '@/lib/catalogPromotionUiApi';

export type CatalogMoneyValidationCode =
  | 'price'
  | 'cost'
  | 'compare_price'
  | 'variant_price'
  | 'variant_cost';

function displayAmount(rawMinor: string, fractionDigits: number): string {
  const normalized = rawMinor.trim();
  if (!normalized) return '';
  const minor = Number(normalized);
  return catalogMinorAmountToMajor(minor, fractionDigits);
}

function authorityAmount(rawMajor: string, fractionDigits: number): string | null {
  const normalized = rawMajor.trim();
  if (!normalized) return '';
  const minor = catalogMajorAmountToMinor(normalized, fractionDigits);
  return minor === null ? null : String(minor);
}

export function validateCatalogMoneyForm(
  form: CatalogProductFormState,
  fractionDigits: number,
): CatalogMoneyValidationCode | null {
  const isService = form.item_type === 'service';
  const serviceUsesAmount =
    !isService || form.service_price_type === 'fixed' || form.service_price_type === 'from';

  const currentRaw = form.current_price.trim() || form.original_price.trim();
  const current = serviceUsesAmount
    ? catalogMajorAmountToMinor(currentRaw || '0', fractionDigits)
    : 0;
  if (current === null) return 'price';

  if (
    form.cost_iqd.trim() &&
    catalogMajorAmountToMinor(form.cost_iqd, fractionDigits) === null
  ) {
    return 'cost';
  }

  if (serviceUsesAmount && form.original_price.trim()) {
    const compare = catalogMajorAmountToMinor(form.original_price, fractionDigits);
    if (compare === null || compare < current) return 'compare_price';
  }

  for (const variant of form.variants) {
    if (
      variant.price_iqd.trim() &&
      catalogMajorAmountToMinor(variant.price_iqd, fractionDigits) === null
    ) {
      return 'variant_price';
    }
    if (
      variant.cost_iqd.trim() &&
      catalogMajorAmountToMinor(variant.cost_iqd, fractionDigits) === null
    ) {
      return 'variant_cost';
    }
  }

  return null;
}

export function catalogMoneyFormForDisplay(
  form: CatalogProductFormState,
  fractionDigits: number,
): CatalogProductFormState {
  return {
    ...form,
    current_price: displayAmount(form.current_price, fractionDigits),
    original_price: displayAmount(form.original_price, fractionDigits),
    cost_iqd: displayAmount(form.cost_iqd, fractionDigits),
    variants: form.variants.map(variant => ({
      ...variant,
      price_iqd: displayAmount(variant.price_iqd, fractionDigits),
      cost_iqd: displayAmount(variant.cost_iqd, fractionDigits),
    })),
  };
}

export function catalogMoneyFormForAuthority(
  form: CatalogProductFormState,
  fractionDigits: number,
): CatalogProductFormState | null {
  const currentPrice = authorityAmount(form.current_price, fractionDigits);
  const originalPrice = authorityAmount(form.original_price, fractionDigits);
  const cost = authorityAmount(form.cost_iqd, fractionDigits);
  if (currentPrice === null || originalPrice === null || cost === null) return null;

  const variants = [] as CatalogProductFormState['variants'];
  for (const variant of form.variants) {
    const price = authorityAmount(variant.price_iqd, fractionDigits);
    const variantCost = authorityAmount(variant.cost_iqd, fractionDigits);
    if (price === null || variantCost === null) return null;
    variants.push({
      ...variant,
      price_iqd: price,
      cost_iqd: variantCost,
    });
  }

  return {
    ...form,
    current_price: currentPrice,
    original_price: originalPrice,
    cost_iqd: cost,
    variants,
  };
}
