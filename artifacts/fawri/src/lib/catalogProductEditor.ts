import type { ProductStatus } from '@/lib/types';
import type {
  CatalogImageInput,
  CatalogImageReference,
  CatalogProduct,
  CatalogProductInput,
  CatalogVariant,
  CatalogVariantInput,
} from '@/lib/catalogUiApi';

export type CatalogImageDraft = {
  key: string;
  id?: string;
  url: string;
  storage_key: string;
  alt: string;
};

export type CatalogOptionDraft = {
  key: string;
  name: string;
  value: string;
};

export type CatalogVariantDraft = {
  key: string;
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  price_iqd: string;
  stock_quantity: string;
  options: CatalogOptionDraft[];
  image_refs: CatalogImageDraft[];
};

export type CatalogProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  original_price: string;
  current_price: string;
  quantity: string;
  status: ProductStatus;
  allow_fawri_reply: boolean;
  image_refs: CatalogImageDraft[];
  variants: CatalogVariantDraft[];
};

export type CatalogEditorValidationCode =
  | 'name'
  | 'price'
  | 'compare_price'
  | 'quantity'
  | 'image_reference'
  | 'variant_identity'
  | 'variant_price'
  | 'variant_quantity'
  | 'variant_option'
  | 'variant_option_duplicate'
  | 'variant_image_reference';

let draftSequence = 0;

function nextDraftKey(prefix: string): string {
  draftSequence += 1;
  return `${prefix}-${draftSequence}`;
}

function trimmed(value: unknown): string {
  return String(value ?? '').trim();
}

function wholeNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function imageDraftIsEmpty(image: CatalogImageDraft): boolean {
  return !image.url.trim() && !image.storage_key.trim() && !image.alt.trim();
}

function imageInput(image: CatalogImageDraft): CatalogImageInput {
  return {
    ...(image.id ? { id: image.id } : {}),
    ...(image.url.trim() ? { url: image.url.trim() } : {}),
    ...(image.storage_key.trim() ? { storage_key: image.storage_key.trim() } : {}),
    ...(image.alt.trim() ? { alt: image.alt.trim() } : {}),
  };
}

function imageInputs(images: CatalogImageDraft[]): CatalogImageInput[] {
  return images.filter(image => !imageDraftIsEmpty(image)).map(imageInput);
}

function imageDraftFromReference(reference?: CatalogImageReference): CatalogImageDraft {
  return {
    key: nextDraftKey('image'),
    ...(reference?.id ? { id: reference.id } : {}),
    url: reference?.url || '',
    storage_key: reference?.storage_key || '',
    alt: reference?.alt || '',
  };
}

function optionDraft(name = '', value = ''): CatalogOptionDraft {
  return {
    key: nextDraftKey('option'),
    name,
    value,
  };
}

function variantDraftFromVariant(variant?: CatalogVariant): CatalogVariantDraft {
  return {
    key: variant?.id || nextDraftKey('variant'),
    ...(variant?.id ? { id: variant.id } : {}),
    name: variant?.name || '',
    sku: variant?.sku || '',
    barcode: variant?.barcode || '',
    price_iqd: variant?.price_iqd === undefined ? '' : String(variant.price_iqd),
    stock_quantity: String(variant?.stock_quantity ?? 0),
    options: variant
      ? Object.entries(variant.options).map(([name, value]) => optionDraft(name, value))
      : [],
    image_refs: variant?.image_refs.map(imageDraftFromReference) || [],
  };
}

export function createEmptyCatalogProductForm(): CatalogProductFormState {
  return {
    name: '',
    sku: '',
    barcode: '',
    category: '',
    description: '',
    original_price: '',
    current_price: '',
    quantity: '',
    status: 'available',
    allow_fawri_reply: true,
    image_refs: [],
    variants: [],
  };
}

export function createEmptyCatalogImageDraft(): CatalogImageDraft {
  return imageDraftFromReference();
}

export function createEmptyCatalogOptionDraft(): CatalogOptionDraft {
  return optionDraft();
}

export function createEmptyCatalogVariantDraft(): CatalogVariantDraft {
  return variantDraftFromVariant();
}

export function catalogProductFormFromProduct(
  product: CatalogProduct,
): CatalogProductFormState {
  return {
    name: product.name || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    category: product.category || '',
    description: product.description || '',
    original_price:
      product.compare_at_price_iqd === undefined
        ? ''
        : String(product.compare_at_price_iqd),
    current_price: String(product.price_iqd),
    quantity: String(product.stock_quantity),
    status: product.status,
    allow_fawri_reply: product.allow_fawri_reply,
    image_refs: product.image_refs.map(imageDraftFromReference),
    variants: product.variants.map(variantDraftFromVariant),
  };
}

function validateImages(
  images: CatalogImageDraft[],
  code: 'image_reference' | 'variant_image_reference',
): CatalogEditorValidationCode | null {
  for (const image of images) {
    if (imageDraftIsEmpty(image)) continue;
    if (!image.url.trim() && !image.storage_key.trim()) return code;
  }
  return null;
}

export function validateCatalogProductForm(
  form: CatalogProductFormState,
): CatalogEditorValidationCode | null {
  if (!form.name.trim()) return 'name';

  const currentPrice = wholeNumber(form.current_price || form.original_price);
  if (currentPrice === null) return 'price';

  if (form.original_price.trim()) {
    const comparePrice = wholeNumber(form.original_price);
    if (comparePrice === null || comparePrice < currentPrice) return 'compare_price';
  }

  const productImageError = validateImages(form.image_refs, 'image_reference');
  if (productImageError) return productImageError;

  if (form.variants.length === 0) {
    if (wholeNumber(form.quantity) === null) return 'quantity';
    return null;
  }

  for (const variant of form.variants) {
    const usableOptions = variant.options.filter(
      option => option.name.trim() || option.value.trim(),
    );
    if (!variant.name.trim() && usableOptions.length === 0) return 'variant_identity';

    if (variant.price_iqd.trim() && wholeNumber(variant.price_iqd) === null) {
      return 'variant_price';
    }
    if (wholeNumber(variant.stock_quantity) === null) return 'variant_quantity';

    const optionNames = new Set<string>();
    for (const option of usableOptions) {
      if (!option.name.trim() || !option.value.trim()) return 'variant_option';
      const normalizedName = option.name.trim().toLocaleLowerCase('en-US');
      if (optionNames.has(normalizedName)) return 'variant_option_duplicate';
      optionNames.add(normalizedName);
    }

    const variantImageError = validateImages(
      variant.image_refs,
      'variant_image_reference',
    );
    if (variantImageError) return variantImageError;
  }

  return null;
}

function variantInput(variant: CatalogVariantDraft): CatalogVariantInput {
  const options = Object.fromEntries(
    variant.options
      .filter(option => option.name.trim() || option.value.trim())
      .map(option => [option.name.trim(), option.value.trim()]),
  );

  return {
    ...(variant.id ? { id: variant.id } : {}),
    ...(variant.name.trim() ? { name: variant.name.trim() } : {}),
    sku: variant.sku.trim(),
    barcode: variant.barcode.trim(),
    price_iqd: variant.price_iqd.trim() ? wholeNumber(variant.price_iqd) : null,
    stock_quantity: wholeNumber(variant.stock_quantity) ?? 0,
    options,
    image_refs: imageInputs(variant.image_refs),
  };
}

export function catalogProductInputFromForm(
  form: CatalogProductFormState,
  existing?: CatalogProduct,
): CatalogProductInput {
  const variants = form.variants.map(variantInput);
  const currentPrice = wholeNumber(form.current_price || form.original_price) ?? 0;
  const compareAtPrice = form.original_price.trim()
    ? wholeNumber(form.original_price)
    : null;

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    sku: form.sku.trim(),
    barcode: form.barcode.trim(),
    price_iqd: currentPrice,
    compare_at_price_iqd: compareAtPrice,
    ...(variants.length === 0
      ? { stock_quantity: wholeNumber(form.quantity) ?? 0 }
      : {}),
    ...(existing ? { low_stock_threshold: existing.low_stock_threshold } : {}),
    status: form.status,
    allow_fawri_reply: form.allow_fawri_reply,
    image_refs: imageInputs(form.image_refs),
    variants,
  };
}

export function variantOptionSummary(variant: CatalogVariant | CatalogVariantDraft): string {
  const options = Object.entries(
    'options' in variant && Array.isArray(variant.options)
      ? Object.fromEntries(
          variant.options
            .filter(option => option.name.trim() && option.value.trim())
            .map(option => [option.name.trim(), option.value.trim()]),
        )
      : variant.options,
  );
  return options.map(([name, value]) => `${name}: ${value}`).join(' · ');
}

export function catalogProductHasVariantAuthority(
  product: Pick<CatalogProduct, 'variants'>,
): boolean {
  return product.variants.length > 0;
}

export function catalogProductStockIsVariantManaged(
  form: Pick<CatalogProductFormState, 'variants'>,
): boolean {
  return form.variants.length > 0;
}

export function cleanCatalogText(value: unknown): string {
  return trimmed(value);
}
