import { CATALOG_PRODUCT_DETAILS_COPY } from '@/lib/translations/features/catalog/catalogEditorCopy';

/**
 * Final Arabic merchant-facing wording corrections that are intentionally
 * additive so the established catalog editor reference layout stays frozen.
 */
export function applyCatalogEditorArabicFinalSemanticParity() {
  CATALOG_PRODUCT_DETAILS_COPY.ar.groupCount = (count: number) => {
    if (count === 1) return 'نوع واحد';
    if (count === 2) return 'نوعان';
    return `${count} أنواع`;
  };
}
