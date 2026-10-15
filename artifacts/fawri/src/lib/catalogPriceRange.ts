import type { CatalogProduct } from '@/lib/catalogUiApi';

export type CatalogPriceRange = {
  minimum_iqd: number;
  maximum_iqd: number;
};

export function catalogEffectivePriceRange(product: CatalogProduct): CatalogPriceRange {
  if (product.item_type === 'service' || product.variants.length === 0) {
    return {
      minimum_iqd: product.price_iqd,
      maximum_iqd: product.price_iqd,
    };
  }

  const effectivePrices = product.variants.map(variant => variant.price_iqd ?? product.price_iqd);

  return {
    minimum_iqd: Math.min(...effectivePrices),
    maximum_iqd: Math.max(...effectivePrices),
  };
}
