import { peekCatalogCreateRecoveryDraft } from '@/lib/catalogEditorRecovery';
import type { ProductStatus } from '@/lib/types';
import type {
  CatalogImageInput,
  CatalogImageReference,
  CatalogItemType,
  CatalogProduct,
  CatalogProductInput,
  CatalogServiceLocationChoice,
  CatalogServiceLocationMode,
  CatalogServicePriceType,
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

export type CatalogMeasurementDraft = {
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
};

export type CatalogVariantDraft = CatalogMeasurementDraft & {
  key: string;
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  price_iqd: string;
  cost_iqd: string;
  stock_quantity: string;
  options: CatalogOptionDraft[];
  image_refs: CatalogImageDraft[];
};

export type CatalogProductFormState = CatalogMeasurementDraft & {
  item_type: CatalogItemType;
  track_inventory: boolean;
  service_duration_minutes: string;
  service_buffer_minutes: string;
  service_booking_required: boolean;
  service_price_type: CatalogServicePriceType;
  service_location_mode: CatalogServiceLocationMode;
  service_location_modes: CatalogServiceLocationChoice[];
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  original_price: string;
  current_price: string;
  cost_iqd: string;
  quantity: string;
  status: ProductStatus;
  allow_fawri_reply: boolean;
  image_refs: CatalogImageDraft[];
  variants: CatalogVariantDraft[];
};

export type CatalogEditorValidationCode =
  | 'name'
  | 'price'
  | 'cost'
  | 'compare_price'
  | 'quantity'
  | 'measurement'
  | 'partial_dimensions'
  | 'service_duration'
  | 'service_buffer'
  | 'image_reference'
  | 'variant_identity'
  | 'variant_price'
  | 'variant_cost'
  | 'variant_quantity'
  | 'variant_measurement'
  | 'variant_partial_dimensions'
  | 'variant_option'
  | 'variant_option_duplicate'
  | 'variant_image_reference';

const MAX_WEIGHT_G = 100_000_000;
const MAX_DIMENSION_MM = 100_000;
let draftSequence = 0;

function nextDraftKey(prefix: string): string {
  draftSequence += 1;
  return `${prefix}-${draftSequence}`;
}

function trimmed(value: unknown): string {
  return String(value ?? '').trim();
}

const SERVICE_LOCATION_CHOICES: CatalogServiceLocationChoice[] = ['merchant', 'customer', 'online'];

function serviceLocationChoices(
  mode: CatalogServiceLocationMode,
  choices?: readonly CatalogServiceLocationChoice[],
): CatalogServiceLocationChoice[] {
  const normalized = [...new Set((choices || []).filter(choice => SERVICE_LOCATION_CHOICES.includes(choice)))];
  if (mode === 'flexible') {
    return normalized.length >= 2 ? normalized : [...SERVICE_LOCATION_CHOICES];
  }
  return normalized.length === 1 && normalized[0] === mode ? normalized : [mode];
}

function wholeNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalBoundedWholeNumber(
  value: string,
  minimum: number,
  maximum: number,
): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function canonicalDecimal(value: string, scale: number, max: number): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const decimals = String(scale).length - 1;
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) return null;
  const scaled = Number(whole) * scale + Number(fraction.padEnd(decimals, '0') || '0');
  return Number.isSafeInteger(scaled) && scaled > 0 && scaled <= max ? scaled : null;
}

function displayCanonical(value: number | undefined, scale: number): string {
  if (value === undefined) return '';
  const decimals = String(scale).length - 1;
  const whole = Math.floor(value / scale);
  const remainder = String(value % scale).padStart(decimals, '0').replace(/0+$/, '');
  return remainder ? `${whole}.${remainder}` : String(whole);
}

function measurementDraft(source?: {
  weight_g?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
}): CatalogMeasurementDraft {
  return {
    weight_kg: displayCanonical(source?.weight_g, 1_000),
    length_cm: displayCanonical(source?.length_mm, 10),
    width_cm: displayCanonical(source?.width_mm, 10),
    height_cm: displayCanonical(source?.height_mm, 10),
  };
}

function measurementValidation(
  draft: CatalogMeasurementDraft,
): 'measurement' | 'partial_dimensions' | null {
  if (draft.weight_kg.trim() && canonicalDecimal(draft.weight_kg, 1_000, MAX_WEIGHT_G) === null) {
    return 'measurement';
  }
  const dimensions = [draft.length_cm, draft.width_cm, draft.height_cm];
  const present = dimensions.filter(value => value.trim()).length;
  if (present > 0 && present < dimensions.length) return 'partial_dimensions';
  if (
    present === dimensions.length &&
    dimensions.some(value => canonicalDecimal(value, 10, MAX_DIMENSION_MM) === null)
  ) {
    return 'measurement';
  }
  return null;
}

function measurementInput(draft: CatalogMeasurementDraft) {
  const dimensionsPresent = Boolean(
    draft.length_cm.trim() || draft.width_cm.trim() || draft.height_cm.trim(),
  );
  return {
    weight_g: draft.weight_kg.trim()
      ? canonicalDecimal(draft.weight_kg, 1_000, MAX_WEIGHT_G)
      : null,
    length_mm: dimensionsPresent
      ? canonicalDecimal(draft.length_cm, 10, MAX_DIMENSION_MM)
      : null,
    width_mm: dimensionsPresent
      ? canonicalDecimal(draft.width_cm, 10, MAX_DIMENSION_MM)
      : null,
    height_mm: dimensionsPresent
      ? canonicalDecimal(draft.height_cm, 10, MAX_DIMENSION_MM)
      : null,
  };
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
    cost_iqd: variant?.cost_iqd === undefined ? '' : String(variant.cost_iqd),
    stock_quantity: String(variant?.stock_quantity ?? 0),
    ...measurementDraft(variant),
    options: variant
      ? Object.entries(variant.options).map(([name, value]) => optionDraft(name, value))
      : [],
    image_refs: variant?.image_refs.map(imageDraftFromReference) || [],
  };
}

export function createEmptyCatalogProductForm(): CatalogProductFormState {
  const recovered = peekCatalogCreateRecoveryDraft();
  if (recovered) {
    const recoveredMode = recovered.service_location_mode || 'merchant';
    return {
      ...recovered,
      service_location_mode: recoveredMode,
      service_location_modes: serviceLocationChoices(recoveredMode, recovered.service_location_modes),
    };
  }
  return {
    item_type: 'product',
    track_inventory: true,
    service_duration_minutes: '',
    service_buffer_minutes: '0',
    service_booking_required: true,
    service_price_type: 'fixed',
    service_location_mode: 'merchant',
    service_location_modes: ['merchant'],
    name: '',
    sku: '',
    barcode: '',
    category: '',
    description: '',
    original_price: '',
    current_price: '',
    cost_iqd: '',
    quantity: '',
    ...measurementDraft(),
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
  const itemType = product.item_type || 'product';
  const service = product.service_details;
  return {
    item_type: itemType,
    track_inventory: itemType === 'service' ? false : product.track_inventory !== false,
    service_duration_minutes:
      service?.duration_minutes === undefined ? '' : String(service.duration_minutes),
    service_buffer_minutes: String(service?.buffer_minutes ?? 0),
    service_booking_required: service?.booking_required ?? true,
    service_price_type: service?.price_type ?? 'fixed',
    service_location_mode: service?.location_mode ?? 'merchant',
    service_location_modes: serviceLocationChoices(service?.location_mode ?? 'merchant', service?.location_modes),
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
    cost_iqd: product.cost_iqd === undefined ? '' : String(product.cost_iqd),
    quantity: String(product.stock_quantity),
    ...measurementDraft(product),
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

  const isService = form.item_type === 'service';
  const serviceUsesAmount =
    !isService || form.service_price_type === 'fixed' || form.service_price_type === 'from';
  const currentPrice = serviceUsesAmount
    ? wholeNumber(form.current_price || form.original_price)
    : 0;
  if (currentPrice === null) return 'price';
  if (form.cost_iqd.trim() && wholeNumber(form.cost_iqd) === null) return 'cost';

  if (serviceUsesAmount && form.original_price.trim()) {
    const comparePrice = wholeNumber(form.original_price);
    if (comparePrice === null || comparePrice < currentPrice) return 'compare_price';
  }

  const productImageError = validateImages(form.image_refs, 'image_reference');
  if (productImageError) return productImageError;

  if (isService) {
    if (
      optionalBoundedWholeNumber(form.service_duration_minutes, 1, 1_440) === null
    ) {
      return 'service_duration';
    }
    if (optionalBoundedWholeNumber(form.service_buffer_minutes, 0, 480) === null) {
      return 'service_buffer';
    }
    return null;
  }

  const measurementError = measurementValidation(form);
  if (measurementError) return measurementError;

  if (form.variants.length === 0) {
    if (form.track_inventory && wholeNumber(form.quantity) === null) return 'quantity';
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
    if (variant.cost_iqd.trim() && wholeNumber(variant.cost_iqd) === null) {
      return 'variant_cost';
    }
    if (form.track_inventory && wholeNumber(variant.stock_quantity) === null) {
      return 'variant_quantity';
    }

    const variantMeasurementError = measurementValidation(variant);
    if (variantMeasurementError === 'partial_dimensions') return 'variant_partial_dimensions';
    if (variantMeasurementError) return 'variant_measurement';

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

function variantInput(
  variant: CatalogVariantDraft,
  trackInventory: boolean,
): CatalogVariantInput {
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
    cost_iqd: variant.cost_iqd.trim() ? wholeNumber(variant.cost_iqd) : null,
    stock_quantity: trackInventory ? wholeNumber(variant.stock_quantity) ?? 0 : 0,
    ...measurementInput(variant),
    options,
    image_refs: imageInputs(variant.image_refs),
  };
}

export function catalogProductInputFromForm(
  form: CatalogProductFormState,
  existing?: CatalogProduct,
): CatalogProductInput {
  const isService = form.item_type === 'service';
  const trackInventory = !isService && form.track_inventory;
  const variants = isService
    ? []
    : form.variants.map(variant => variantInput(variant, trackInventory));
  const serviceUsesAmount =
    !isService || form.service_price_type === 'fixed' || form.service_price_type === 'from';
  const currentPrice = serviceUsesAmount
    ? wholeNumber(form.current_price || form.original_price) ?? 0
    : 0;
  const compareAtPrice = serviceUsesAmount && form.original_price.trim()
    ? wholeNumber(form.original_price)
    : null;
  const serviceLocationModes = serviceLocationChoices(form.service_location_mode, form.service_location_modes);

  return {
    item_type: form.item_type,
    track_inventory: trackInventory,
    ...(isService
      ? {
          service_details: {
            ...(form.service_duration_minutes.trim()
              ? {
                  duration_minutes:
                    optionalBoundedWholeNumber(
                      form.service_duration_minutes,
                      1,
                      1_440,
                    ) ?? undefined,
                }
              : {}),
            buffer_minutes:
              optionalBoundedWholeNumber(form.service_buffer_minutes, 0, 480) ?? 0,
            booking_required: form.service_booking_required,
            price_type: form.service_price_type,
            location_mode: serviceLocationModes.length > 1 ? 'flexible' : serviceLocationModes[0],
            location_modes: serviceLocationModes,
          },
        }
      : {}),
    name: form.name.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    sku: isService ? '' : form.sku.trim(),
    barcode: isService ? '' : form.barcode.trim(),
    price_iqd: currentPrice,
    cost_iqd: form.cost_iqd.trim() ? wholeNumber(form.cost_iqd) : null,
    compare_at_price_iqd: compareAtPrice,
    ...(!trackInventory || variants.length === 0
      ? { stock_quantity: trackInventory ? wholeNumber(form.quantity) ?? 0 : 0 }
      : {}),
    ...(existing ? { low_stock_threshold: existing.low_stock_threshold } : {}),
    ...(isService
      ? { weight_g: null, length_mm: null, width_mm: null, height_mm: null }
      : measurementInput(form)),
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
  form: Pick<CatalogProductFormState, 'variants' | 'track_inventory' | 'item_type'>,
): boolean {
  return form.item_type === 'product' && form.track_inventory && form.variants.length > 0;
}

export function catalogItemTracksInventory(
  value: Pick<CatalogProductFormState, 'item_type' | 'track_inventory'> | Pick<CatalogProduct, 'item_type' | 'track_inventory'>,
): boolean {
  return value.item_type === 'product' && value.track_inventory !== false;
}

export function cleanCatalogText(value: unknown): string {
  return trimmed(value);
}
