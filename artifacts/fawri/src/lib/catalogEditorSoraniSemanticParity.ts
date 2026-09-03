import { CATALOG_PRODUCT_DETAILS_COPY } from '@/lib/translations/features/catalog/catalogEditorCopy';

/**
 * Sorani Kurdish semantic parity for the merchant catalog editor.
 *
 * Arabic is the locked golden reference and is deliberately not mutated here.
 * Keep Sorani wording aligned with the approved Arabic merchant meaning while
 * preserving natural Sorani grammar.
 */
export function applyCatalogEditorSoraniSemanticParity() {
  const details = CATALOG_PRODUCT_DETAILS_COPY.ku as unknown as Record<string, unknown>;

  Object.assign(details, {
    optionNamePlaceholder: 'نموونە: ڕەنگ، گنجایش، تام',
    noVariants: 'هەڵبژاردەیەک وەک ڕەنگ، گنجایش، تام یان قەبارە زیاد بکە، پاشان هەموو بەهاکان لە یەک ڕیز بنووسە.',
  });
}
