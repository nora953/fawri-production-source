import { COMMERCE_CATALOG_COPY } from '@/lib/translations/features/catalog/catalogEditorCopy';
import type { Lang } from '@/lib/types';

type CatalogDetailsItemType = 'product' | 'service';

type CatalogDetailsLabels = {
  productDetails: string;
  serviceDetails: string;
  editProduct: string;
  editService: string;
};

const DETAILS_LABELS: Record<Lang, CatalogDetailsLabels> = {
  ar: {
    productDetails: 'تفاصيل المنتج',
    serviceDetails: 'تفاصيل الخدمة',
    editProduct: 'تعديل المنتج',
    editService: 'تعديل الخدمة',
  },
  ku: {
    productDetails: 'وردەکاری بەرهەم',
    serviceDetails: 'وردەکاری خزمەتگوزاری',
    editProduct: 'دەستکاری بەرهەم',
    editService: 'دەستکاری خزمەتگوزاری',
  },
  en: {
    productDetails: 'Product details',
    serviceDetails: 'Service details',
    editProduct: 'Edit product',
    editService: 'Edit service',
  },
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function activeLang(): Lang {
  const value = String(document.documentElement.lang || 'en').trim().toLowerCase();
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('ku')) return 'ku';
  return 'en';
}

function exactText(element: Element | null): string {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function asciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)));
}

function detectItemType(dialog: HTMLElement, lang: Lang): CatalogDetailsItemType | null {
  const copy = COMMERCE_CATALOG_COPY[lang] || COMMERCE_CATALOG_COPY.en;
  const pills = Array.from(dialog.querySelectorAll<HTMLElement>('[class*="rounded-full"]'));
  if (pills.some(pill => exactText(pill) === copy.service)) return 'service';
  if (pills.some(pill => exactText(pill) === copy.product)) return 'product';
  return null;
}

function replaceButtonLabel(button: HTMLButtonElement, label: string): void {
  const textNode = Array.from(button.childNodes).find(node =>
    node.nodeType === Node.TEXT_NODE && String(node.nodeValue || '').trim().length > 0,
  );
  if (textNode) {
    if (String(textNode.nodeValue || '').trim() !== label) textNode.nodeValue = ` ${label}`;
    return;
  }
  const span = Array.from(button.querySelectorAll<HTMLElement>('span')).find(candidate =>
    exactText(candidate).length > 0 && !candidate.classList.contains('sr-only'),
  );
  if (span && exactText(span) !== label) span.textContent = label;
}

function stabilizeSkuDirection(dialog: HTMLElement): void {
  const sku = Array.from(dialog.querySelectorAll<HTMLElement>('p')).find(element =>
    /^SKU\s*:/i.test(exactText(element)),
  );
  if (!sku) return;

  sku.dataset.fawriPreserveDigits = 'true';
  sku.setAttribute('dir', 'ltr');
  sku.style.direction = 'ltr';
  sku.style.unicodeBidi = 'isolate';
  sku.style.fontVariantNumeric = 'tabular-nums';

  const current = exactText(sku);
  const normalized = asciiDigits(current);
  if (current !== normalized) sku.textContent = normalized;
}

function stabilizePriceRangeDirection(dialog: HTMLElement, lang: Lang): void {
  const copy = COMMERCE_CATALOG_COPY[lang] || COMMERCE_CATALOG_COPY.en;
  const priceLabel = Array.from(dialog.querySelectorAll<HTMLElement>('div')).find(element =>
    exactText(element) === copy.price && element.querySelector('svg'),
  );
  const card = priceLabel?.parentElement;
  const value = card?.querySelector<HTMLElement>('p[dir="ltr"]');
  if (!value) return;

  value.setAttribute('dir', 'ltr');
  value.style.direction = 'ltr';
  value.style.unicodeBidi = 'isolate';
  value.style.fontVariantNumeric = 'tabular-nums';

  const range = value.querySelector<HTMLElement>('span');
  if (range) {
    range.setAttribute('dir', 'ltr');
    range.style.direction = 'ltr';
    range.style.unicodeBidi = 'isolate';
    range.style.display = 'inline-flex';
    range.style.alignItems = 'baseline';
    // Arabic and Sorani details should match the catalog card: the numeric
    // amount stays on the visual right while the currency sits on the left.
    // English keeps its normal amount-then-currency visual order.
    range.style.flexDirection = lang === 'en' ? 'row' : 'row-reverse';
  }

  const firstBdi = value.querySelector<HTMLElement>('bdi');
  if (firstBdi) {
    firstBdi.setAttribute('dir', 'ltr');
    firstBdi.style.direction = 'ltr';
    // Keep the numeric range in logical minimum -> maximum order even after
    // Arabic/Sorani digit localization. Plain `isolate` lets the bidi algorithm
    // visually swap the two Arabic-Indic numeric runs around the neutral hyphen.
    firstBdi.style.unicodeBidi = 'isolate-override';
  }
}

function harmonizeCatalogDetailsDialog(dialog: HTMLElement): void {
  if (dialog.classList.contains('catalog-editor-shell')) return;

  const lang = activeLang();
  const copy = COMMERCE_CATALOG_COPY[lang] || COMMERCE_CATALOG_COPY.en;
  const labels = DETAILS_LABELS[lang];
  const title = dialog.querySelector<HTMLElement>('h2.text-xl.font-extrabold');
  if (!title) return;

  const knownTitles = new Set([
    copy.detailsTitle,
    labels.productDetails,
    labels.serviceDetails,
  ]);
  if (!knownTitles.has(exactText(title))) return;

  const type = detectItemType(dialog, lang);
  if (!type) return;

  dialog.dataset.catalogDetailsType = type;
  const wantedTitle = type === 'service' ? labels.serviceDetails : labels.productDetails;
  if (exactText(title) !== wantedTitle) title.textContent = wantedTitle;

  const knownEditLabels = new Set([
    copy.edit,
    labels.editProduct,
    labels.editService,
  ]);
  const editButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    knownEditLabels.has(exactText(button)),
  );
  if (editButton) {
    replaceButtonLabel(editButton, type === 'service' ? labels.editService : labels.editProduct);
  }

  stabilizeSkuDirection(dialog);
  stabilizePriceRangeDirection(dialog, lang);
}

function harmonizeOpenCatalogDetails(): void {
  for (const dialog of document.querySelectorAll<HTMLElement>('[role="dialog"]')) {
    harmonizeCatalogDetailsDialog(dialog);
  }
}

export function installCatalogDetailsTypeParity(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  harmonizeOpenCatalogDetails();

  const observer = new MutationObserver(() => harmonizeOpenCatalogDetails());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
