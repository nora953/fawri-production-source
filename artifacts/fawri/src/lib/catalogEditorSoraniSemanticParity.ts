import {
  CATALOG_IMAGE_UPLOAD_COPY,
  CATALOG_PRODUCT_DETAILS_COPY,
  COMMERCE_CATALOG_COPY,
} from '@/lib/translations/features/catalog/catalogEditorCopy';

/**
 * Sorani Kurdish semantic parity for the merchant catalog editor.
 *
 * Arabic is the locked golden reference and is deliberately not mutated here.
 * Keep Sorani wording aligned with the approved Arabic merchant meaning while
 * preserving natural Sorani grammar.
 */
export function applyCatalogEditorSoraniSemanticParity() {
  const commerce = COMMERCE_CATALOG_COPY.ku as unknown as Record<string, unknown>;
  const details = CATALOG_PRODUCT_DETAILS_COPY.ku as unknown as Record<string, unknown>;
  const images = CATALOG_IMAGE_UPLOAD_COPY.ku as unknown as Record<string, unknown>;

  // Hidden/catalog states reviewed against the Arabic golden reference.
  Object.assign(commerce, {
    noItems: 'هێشتا هیچ بابەتێک نییە',
    loadFailed: 'نەتوانرا کەتەلۆگ لە سێرڤەر بار بکرێت.',
    secureCrypto: 'نەتوانرا نیشانەیەکی پارێزراو بۆ کردارەکە دروست بکرێت.',
  });

  // Product-editor copy, including states that are not visible in a populated
  // single-option screenshot (empty state, inheritance and validation paths).
  Object.assign(details, {
    reportingCostHint: 'ئارەزوومەندانە، تەنها بۆ ڕاپۆرت و هەژمارکردنی قازانجە و بە کڕیار پیشان نادرێت.',
    optionNamePlaceholder: 'نموونە: ڕەنگ، گنجایش، تام',
    inheritedImage: 'بێ وێنەی تایبەت = وێنەکانی بەرهەم بەکاردەهێنرێن',
    inheritanceHint: (price: string, cost: string) =>
      `نرخی فرۆشتن ${price || '—'} و تێچوو ${cost || '—'} و وێنەکانی بەرهەم بەها بنەڕەتییەکانی هەموو جۆرەکانن. تەنها لە کاتی پێویستدا بەها جیاوازەکان بنووسە.`,
    noVariants: 'هەڵبژاردەیەک وەک ڕەنگ، گنجایش، تام یان قەبارە زیاد بکە، پاشان هەموو بەهاکان لە یەک ڕیز بنووسە.',
  });

  // Image-editor hidden states are part of the same product workflow.
  Object.assign(images, {
    uploading: 'باردەکرێتە سەرەوە...',
    drop: 'وێنەکان بۆ ئێرە ڕابکێشە و دایانبخە، یان کلیک بکە بۆ هەڵبژاردن',
    previewFailed: 'نەتوانرا وێنەکە پیشان بدرێت',
  });
}
