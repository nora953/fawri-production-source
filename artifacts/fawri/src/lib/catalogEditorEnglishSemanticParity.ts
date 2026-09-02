import {
  CATALOG_ITEM_TYPE_COPY,
  CATALOG_PRODUCT_DETAILS_COPY,
  COMMERCE_CATALOG_COPY,
} from '@/lib/translations/features/catalog/catalogEditorCopy';

/**
 * English semantic parity for the merchant catalog editor.
 *
 * Arabic is the approved golden reference and is deliberately not mutated here.
 * This layer keeps English merchant-facing wording faithful to the approved
 * Arabic meaning while preserving natural English grammar.
 *
 * Internal API/domain names still use `variant`; only merchant-facing copy uses
 * "type/types" because the approved Arabic UI uses "النوع / الأنواع".
 */
export function applyCatalogEditorEnglishSemanticParity() {
  Object.assign(COMMERCE_CATALOG_COPY.en, {
    subtitle: 'Add the item information once; Fawri automatically calculates inventory status and uses it in the cashier and replies.',
    noItems: 'No items yet',
    noItemsHint: 'Add the first product or service so Fawri can start using trusted catalog data.',
    secureCrypto: 'Could not create a secure token for the operation.',
    variants: 'Types',
    fawriHint: 'When turned off, the item stays in the catalog and cashier, but Fawri does not use its information in automated replies.',
    variantDetails: 'Type details',
    hideVariantDetails: 'Hide types',
    someVariantsOut: 'Some types are out of stock',
    availableForSaleHint: 'This option appears only when item availability does not depend on a recorded inventory quantity.',
  });

  const details = CATALOG_PRODUCT_DETAILS_COPY.en as unknown as Record<string, unknown>;
  Object.assign(details, {
    inventoryAfterSave: 'Saved type inventory is adjusted from the inventory tools after saving so every movement stays recorded.',
    reportingCostHint: 'Optional. Used only for reports and profit calculations and is not shown to customers.',
    multiProductHint: 'Enable it if the product has different versions such as color, capacity, weight, flavor, material, or size.',
    optionsHint: 'Add each attribute once and enter its values in the same row, then create all types at once.',
    valuesHint: 'Separate values with an Arabic or English comma.',
    generate: 'Create / update types',
    combinations: 'Product types',
    combination: 'Type',
    images: 'Type image — optional',
    inheritanceHint: (price: string, cost: string) => `Sale price ${price || '—'}, cost ${cost || '—'}, and product images are the default values for all types. Enter only the values that are different when needed.`,
    bulkStock: 'Quantity per type',
    generateSku: 'Generate SKUs for types',
    tooMany: 'There are more than 100 types. Reduce the number of values.',
    existingVariants: 'This product contains saved types. Multi-option mode cannot be turned off until the types are removed or changed.',
    legacy: 'This product contains old types without structured options. They remain in the table so no data is lost.',
    groupCount: (count: number) => `${count} ${count === 1 ? 'type' : 'types'}`,
    groupStock: 'Stock for each type in the group',
    groupImagesHint: 'Images added here apply to all types in this group. You can change the image for one type from its row.',
    copyHint: 'Copies price, cost, images, and stock only to matching types. SKU and barcode are not copied.',
    mixedGroupImages: 'Some types in this group have different images. Adding images here will make the group images consistent.',
    excludeCombination: 'Exclude type',
    excludedTitle: 'Excluded types',
    excludedHint: 'These types will not be created even if you update the types again. You can restore them before saving.',
    savedVariantProtected: 'This is a saved type. It is not deleted from the creation editor so inventory history is not lost.',
  });

  Object.assign(CATALOG_ITEM_TYPE_COPY.en, {
    itemSettingsHint: 'Short operating settings for this item.',
    serviceDetailsHint: 'This information helps Fawri give customers accurate details about the service.',
    bufferHint: 'Optional. Used later when managing bookings.',
    bookingRequiredHint: 'Enable it if the customer needs to request an appointment or book the service in advance.',
    priceCustom: 'On request',
    locationMerchant: 'At the merchant location',
    locationCustomer: 'At the customer location',
    locationFlexible: 'Flexible / more than one option',
  });
}
