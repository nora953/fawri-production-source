import { useMemo, useState } from 'react';
import { Boxes, ChevronDown, Copy, Layers3, Plus, Ruler, Trash2, Undo2 } from 'lucide-react';

import { CatalogImageUploadEditor } from '@/components/catalog/CatalogImageUploadEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  catalogProductStockIsVariantManaged,
  type CatalogImageDraft,
  type CatalogProductFormState,
  type CatalogVariantDraft,
} from '@/lib/catalogProductEditor';
import {
  catalogVariantCombinationCount,
  catalogVariantDraftHasStructuredOptions,
  catalogVariantOptionSetDefinitionsAreValid,
  catalogVariantOptionSetsFromVariants,
  createCatalogVariantOptionSetDraft,
  regenerateCatalogVariantDrafts,
} from '@/lib/catalogVariantMatrix';
import type { Lang } from '@/lib/types';

const MAX_VARIANTS = 100;
let bulkRowSequence = 0;

function nextBulkRowKey() {
  bulkRowSequence += 1;
  return `bulk-option-${bulkRowSequence}`;
}

type BulkOptionRow = {
  key: string;
  name: string;
  values: string;
};

type ExcludedVariantDraft = {
  signature: string;
  label: string;
  variant: CatalogVariantDraft;
};

type BuilderForm = CatalogProductFormState & {
  variant_option_rows?: BulkOptionRow[];
  excluded_variant_combinations?: ExcludedVariantDraft[];
};

type VariantGroup = {
  key: string;
  optionName: string;
  optionValue: string;
  indexes: number[];
};

type GroupDraft = {
  sale: string;
  cost: string;
  stock: string;
  copyTarget: string;
};

const EMPTY_GROUP_DRAFT: GroupDraft = {
  sale: '',
  cost: '',
  stock: '',
  copyTarget: '',
};

const copy = {
  ar: {
    quantity: 'الكمية',
    inventoryAfterSave: 'مخزون التركيبات المحفوظة يُعدّل من أدوات المخزون بعد الحفظ حتى تبقى الحركة مسجلة.',
    baseData: 'بيانات المنتج',
    reportingCost: 'تكلفة المنتج',
    reportingCostHint: 'اختياري، للتقارير وحساب الربح فقط ولا يظهر للعميل.',
    sku: 'SKU',
    barcode: 'الباركود',
    multiProduct: 'منتج متعدد الخيارات',
    multiProductHint: 'فعّله إذا كان للمنتج نسخ مختلفة مثل اللون، السعة، الوزن، النكهة، المادة أو المقاس.',
    options: 'خيارات المنتج',
    optionsHint: 'أضف كل خاصية مرة واحدة واكتب قيمها في نفس السطر، ثم أنشئ التركيبات دفعة واحدة.',
    addOption: 'إضافة خيار',
    optionName: 'اسم الخيار',
    optionNamePlaceholder: 'مثال: اللون، السعة، النكهة',
    optionValues: 'القيم',
    optionValuesPlaceholder: 'مثال: أسود، أبيض أو 128GB، 256GB',
    valuesHint: 'افصل القيم بفاصلة عربية أو إنجليزية.',
    generate: 'إنشاء / تحديث التركيبات',
    combinations: 'تركيبات المنتج',
    combination: 'التركيبة',
    variantWithinGroup: 'باقي الخيارات',
    salePrice: 'سعر بيع خاص — اختياري',
    cost: 'كلفة خاصة — اختياري',
    stock: 'المخزون',
    images: 'صورة التركيبة — اختياري',
    actions: 'إجراء',
    inheritedSale: (value: string) => `العام: ${value || 'سعر المنتج'}`,
    inheritedCost: (value: string) => `العام: ${value || 'كلفة المنتج'}`,
    inheritedImage: 'بدون صورة خاصة = يستخدم صور المنتج',
    inheritanceTitle: 'البيانات العامة تطبق تلقائيًا',
    inheritanceHint: (price: string, cost: string) => `سعر البيع ${price || '—'} والكلفة ${cost || '—'} وصور المنتج هي الافتراضية لكل التركيبات. اكتب فقط القيمة المختلفة عند الحاجة.`,
    bulkStock: 'كمية لكل تركيبة',
    applyStock: 'تطبيق على الكل',
    generateSku: 'توليد SKU للتركيبات',
    noVariants: 'أضف خيارًا مثل اللون أو السعة أو النكهة أو المقاس، ثم اكتب كل القيم في سطر واحد.',
    invalidOptions: 'أدخل اسمًا وقيمة واحدة على الأقل لكل خيار، ولا تكرر أسماء الخيارات.',
    tooMany: 'عدد التركيبات أكبر من 100. قلل عدد القيم.',
    existingVariants: 'هذا المنتج يحتوي تركيبات محفوظة. لا يمكن إيقاف تعدد الخيارات قبل إزالة التركيبات أو تعديلها.',
    legacy: 'هذا المنتج يحتوي متغيرات قديمة بلا خيارات منظمة. أبقيناها في الجدول حتى لا نفقد أي بيانات.',
    name: 'الاسم',
    advanced: 'الشحن والقياسات الفيزيائية',
    advancedHint: 'اختياري. هذه بيانات وزن وأبعاد الشحن فقط، وليست خيارات المنتج.',
    weight: 'الوزن (كغم)',
    length: 'الطول (سم)',
    width: 'العرض (سم)',
    height: 'الارتفاع (سم)',
    currentInventoryLocked: 'بعد الحفظ',
    groupCount: (count: number) => `${count} تركيبة`,
    groupSale: 'سعر بيع لكل هذه المجموعة',
    groupCost: 'كلفة لكل هذه المجموعة',
    groupStock: 'مخزون لكل تركيبة في المجموعة',
    groupImages: 'صور هذه المجموعة',
    groupImagesHint: 'الصورة التي تضيفها هنا تطبق على كل التركيبات داخل هذه المجموعة. تستطيع تغيير صورة تركيبة واحدة من صفها.',
    applyGroup: 'تطبيق',
    clearOverrideHint: 'اتركه فارغًا واضغط تطبيق للرجوع إلى القيمة العامة.',
    copyGroup: 'نسخ بيانات المجموعة',
    copyTo: 'اختر المجموعة الهدف',
    copyAction: 'نسخ',
    copyHint: 'ينسخ السعر والكلفة والصور والمخزون للتركيبات المناظرة فقط. لا ينسخ SKU أو الباركود.',
    mixedGroupImages: 'بعض التركيبات داخل هذه المجموعة لها صور مختلفة. إضافة صور هنا ستوحّد صور المجموعة.',
    excludeCombination: 'استبعاد التركيبة',
    excludedTitle: 'تركيبات غير متوفرة',
    excludedHint: 'هذه الاحتمالات لن تُنشأ حتى لو حدّثت التركيبات مرة أخرى. يمكنك استعادتها قبل الحفظ.',
    restoreCombination: 'استعادة',
    savedVariantProtected: 'هذه تركيبة محفوظة. لا نحذفها من محرر الإنشاء حتى لا نفقد سجل المخزون.',
  },
  ku: {
    quantity: 'بڕ',
    inventoryAfterSave: 'کۆگای تێکەڵە پاشەکەوتکراوەکان دوای پاشەکەوتکردن لە ئامرازەکانی کۆگا بگۆڕە.',
    baseData: 'داتای بەرهەم',
    reportingCost: 'تێچووی بەرهەم',
    reportingCostHint: 'ئارەزوومەندانە، تەنها بۆ ڕاپۆرت و قازانجە و بە کڕیار پیشان نادرێت.',
    sku: 'SKU',
    barcode: 'بارکۆد',
    multiProduct: 'بەرهەمی چەند هەڵبژاردەیی',
    multiProductHint: 'ئەگەر بەرهەمەکە وەشانە جیاوازەکانی هەیە وەک ڕەنگ، قەبارە، کێش، تام یان ماددە چالاکی بکە.',
    options: 'هەڵبژاردەکانی بەرهەم',
    optionsHint: 'هەر تایبەتمەندییەک جارێک زیاد بکە و هەموو بەهاکانی لە هەمان ڕیز بنووسە، پاشان تێکەڵەکان یەکجار دروست بکە.',
    addOption: 'زیادکردنی هەڵبژاردە',
    optionName: 'ناوی هەڵبژاردە',
    optionNamePlaceholder: 'نموونە: ڕەنگ، قەبارە، تام',
    optionValues: 'بەهاکان',
    optionValuesPlaceholder: 'نموونە: ڕەش، سپی یان 128GB، 256GB',
    valuesHint: 'بەهاکان بە کۆما جیا بکەوە.',
    generate: 'دروستکردن / نوێکردنەوەی تێکەڵەکان',
    combinations: 'تێکەڵەکانی بەرهەم',
    combination: 'تێکەڵە',
    variantWithinGroup: 'هەڵبژاردەکانی تر',
    salePrice: 'نرخی فرۆشتنی تایبەت — ئارەزوومەندانە',
    cost: 'تێچووی تایبەت — ئارەزوومەندانە',
    stock: 'کۆگا',
    images: 'وێنەی تێکەڵە — ئارەزوومەندانە',
    actions: 'کردار',
    inheritedSale: (value: string) => `گشتی: ${value || 'نرخی بەرهەم'}`,
    inheritedCost: (value: string) => `گشتی: ${value || 'تێچووی بەرهەم'}`,
    inheritedImage: 'بێ وێنەی تایبەت = وێنەکانی بەرهەم',
    inheritanceTitle: 'داتای گشتی خۆکار جێبەجێ دەبێت',
    inheritanceHint: (price: string, cost: string) => `نرخی ${price || '—'} و تێچووی ${cost || '—'} و وێنەکانی بەرهەم بۆ هەموو تێکەڵەکان بنەڕەتین. تەنها جیاوازییەکان بنووسە.`,
    bulkStock: 'بڕ بۆ هەر تێکەڵە',
    applyStock: 'جێبەجێکردن بۆ هەموو',
    generateSku: 'دروستکردنی SKU بۆ تێکەڵەکان',
    noVariants: 'هەڵبژاردەیەک وەک ڕەنگ، قەبارە یان تام زیاد بکە و هەموو بەهاکان لە یەک ڕیز بنووسە.',
    invalidOptions: 'بۆ هەر هەڵبژاردە ناو و لانیکەم یەک بەها بنووسە و ناوەکان دووبارە مەکە.',
    tooMany: 'ژمارەی تێکەڵەکان لە 100 زیاترە.',
    existingVariants: 'ئەم بەرهەمە تێکەڵەی پاشەکەوتکراوی هەیە و ناتوانرێت چەند هەڵبژاردەیی ناچالاک بکرێت.',
    legacy: 'ئەم بەرهەمە جۆراوجۆری کۆنی هەیە. بۆ پاراستنی داتا لە خشتەکە ماوەتەوە.',
    name: 'ناو',
    advanced: 'گەیاندن و پێوانە فیزیکییەکان',
    advancedHint: 'ئارەزوومەندانە. ئەمانە تەنها کێش و قەبارەی گەیاندنن، نە هەڵبژاردەکانی بەرهەم.',
    weight: 'کێش (کگم)',
    length: 'درێژی (سم)',
    width: 'پانی (سم)',
    height: 'بەرزی (سم)',
    currentInventoryLocked: 'دوای پاشەکەوتکردن',
    groupCount: (count: number) => `${count} تێکەڵە`,
    groupSale: 'نرخی فرۆشتن بۆ ئەم گرووپە',
    groupCost: 'تێچوو بۆ ئەم گرووپە',
    groupStock: 'کۆگا بۆ هەر تێکەڵەی گرووپەکە',
    groupImages: 'وێنەکانی ئەم گرووپە',
    groupImagesHint: 'وێنەکانی لێرە بۆ هەموو تێکەڵەکانی گرووپەکە جێبەجێ دەبن. دەتوانیت وێنەی یەک تێکەڵە لە ڕیزەکەی بگۆڕیت.',
    applyGroup: 'جێبەجێکردن',
    clearOverrideHint: 'بە بەتاڵی بهێڵەوە و جێبەجێ بکە بۆ گەڕانەوە بۆ نرخی گشتی.',
    copyGroup: 'کۆپیکردنی داتای گرووپ',
    copyTo: 'گرووپی ئامانج هەڵبژێرە',
    copyAction: 'کۆپی',
    copyHint: 'نرخ و تێچوو و وێنە و کۆگا بۆ تێکەڵە هاوشێوەکان کۆپی دەکات. SKU و بارکۆد کۆپی ناکات.',
    mixedGroupImages: 'هەندێک تێکەڵەی ئەم گرووپە وێنەی جیاواز هەیە. زیادکردنی وێنە لێرە وێنەکانی گرووپەکە یەکسان دەکات.',
    excludeCombination: 'لابردنی تێکەڵە',
    excludedTitle: 'تێکەڵە بەردەست نییەکان',
    excludedHint: 'ئەم تێکەڵانە لە نوێکردنەوەدا دووبارە دروست نابن. پێش پاشەکەوتکردن دەتوانیت بیانگەڕێنیتەوە.',
    restoreCombination: 'گەڕاندنەوە',
    savedVariantProtected: 'ئەم تێکەڵەیە پاشەکەوتکراوە و لێرە ناسڕدرێتەوە بۆ پاراستنی مێژووی کۆگا.',
  },
  en: {
    quantity: 'Quantity',
    inventoryAfterSave: 'Saved variant inventory is adjusted from inventory tools after save so every movement stays auditable.',
    baseData: 'Product data',
    reportingCost: 'Product cost',
    reportingCostHint: 'Optional, merchant-only reporting cost used for profit calculations.',
    sku: 'SKU',
    barcode: 'Barcode',
    multiProduct: 'Multi-option product',
    multiProductHint: 'Enable when the product has sellable versions such as color, capacity, weight, flavor, material, or size.',
    options: 'Product options',
    optionsHint: 'Add each attribute once, enter all its values on the same row, then generate every combination in one step.',
    addOption: 'Add option',
    optionName: 'Option name',
    optionNamePlaceholder: 'e.g. Color, Capacity, Flavor',
    optionValues: 'Values',
    optionValuesPlaceholder: 'e.g. Black, White or 128GB, 256GB',
    valuesHint: 'Separate values with commas.',
    generate: 'Generate / update combinations',
    combinations: 'Product combinations',
    combination: 'Combination',
    variantWithinGroup: 'Other options',
    salePrice: 'Special sale price — optional',
    cost: 'Special cost — optional',
    stock: 'Stock',
    images: 'Combination image — optional',
    actions: 'Action',
    inheritedSale: (value: string) => `Default: ${value || 'product price'}`,
    inheritedCost: (value: string) => `Default: ${value || 'product cost'}`,
    inheritedImage: 'No special image = use product images',
    inheritanceTitle: 'General data applies automatically',
    inheritanceHint: (price: string, cost: string) => `Sale price ${price || '—'}, cost ${cost || '—'}, and product images are the defaults for every combination. Enter only what is different.`,
    bulkStock: 'Stock per combination',
    applyStock: 'Apply to all',
    generateSku: 'Generate combination SKUs',
    noVariants: 'Add an option such as color, capacity, flavor, or size, then enter all values on one row.',
    invalidOptions: 'Give every option a name and at least one value, with no duplicate option names.',
    tooMany: 'More than 100 combinations. Reduce the number of values.',
    existingVariants: 'This product already has saved combinations. Multi-option mode cannot be disabled until those combinations are removed or changed.',
    legacy: 'This product contains legacy variants without structured options. They remain editable in the table to avoid data loss.',
    name: 'Name',
    advanced: 'Shipping & physical measurements',
    advancedHint: 'Optional. These are only shipping weight and dimensions, not product options.',
    weight: 'Weight (kg)',
    length: 'Length (cm)',
    width: 'Width (cm)',
    height: 'Height (cm)',
    currentInventoryLocked: 'after save',
    groupCount: (count: number) => `${count} combinations`,
    groupSale: 'Sale price for this group',
    groupCost: 'Cost for this group',
    groupStock: 'Stock for each combination in group',
    groupImages: 'Images for this group',
    groupImagesHint: 'Images added here apply to every combination in this group. You can override one combination from its row.',
    applyGroup: 'Apply',
    clearOverrideHint: 'Leave blank and apply to return to the general value.',
    copyGroup: 'Copy group data',
    copyTo: 'Choose target group',
    copyAction: 'Copy',
    copyHint: 'Copies price, cost, images, and stock to matching combinations only. SKU and barcode are never copied.',
    mixedGroupImages: 'Some combinations in this group have different images. Adding images here will unify the group images.',
    excludeCombination: 'Exclude combination',
    excludedTitle: 'Unavailable combinations',
    excludedHint: 'These combinations stay excluded when you regenerate. You can restore them before saving.',
    restoreCombination: 'Restore',
    savedVariantProtected: 'This is a saved combination. It is protected here so inventory history is not discarded.',
  },
} as const;

type VariantEditorCopy = (typeof copy)[keyof typeof copy];

function splitValues(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const piece of raw.split(/[\n,،]+/)) {
    const value = piece.trim();
    const key = value.normalize('NFKC').toLocaleLowerCase('en-US');
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function rowsFromVariants(variants: CatalogVariantDraft[]): BulkOptionRow[] {
  return catalogVariantOptionSetsFromVariants(variants).map(set => ({
    key: nextBulkRowKey(),
    name: set.name,
    values: set.values.join('، '),
  }));
}

function structuredOptions(variant: CatalogVariantDraft) {
  return variant.options.filter(option => option.name.trim() && option.value.trim());
}

function normalized(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function optionSummary(variant: CatalogVariantDraft): string {
  const values = structuredOptions(variant).map(option => option.value.trim());
  return values.join(' / ') || variant.name || '—';
}

function optionSummaryWithinGroup(variant: CatalogVariantDraft): string {
  const values = structuredOptions(variant).slice(1).map(option => option.value.trim());
  return values.join(' / ') || variant.name || '—';
}

function variantSignature(variant: CatalogVariantDraft): string {
  return structuredOptions(variant)
    .map(option => `${normalized(option.name)}=${normalized(option.value)}`)
    .join('|');
}

function cloneImages(images: CatalogImageDraft[]): CatalogImageDraft[] {
  return images.map(image => ({ ...image }));
}

function cloneVariant(variant: CatalogVariantDraft): CatalogVariantDraft {
  return {
    ...variant,
    options: variant.options.map(option => ({ ...option })),
    image_refs: cloneImages(variant.image_refs),
  };
}

function variantGroups(variants: CatalogVariantDraft[]): VariantGroup[] {
  const ordered: VariantGroup[] = [];
  const byKey = new Map<string, VariantGroup>();
  variants.forEach((variant, index) => {
    const first = structuredOptions(variant)[0];
    if (!first) return;
    const key = `${normalized(first.name)}=${normalized(first.value)}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        optionName: first.name.trim(),
        optionValue: first.value.trim(),
        indexes: [],
      };
      byKey.set(key, group);
      ordered.push(group);
    }
    group.indexes.push(index);
  });
  return ordered;
}

function secondarySignature(variant: CatalogVariantDraft): string {
  return structuredOptions(variant)
    .slice(1)
    .map(option => `${normalized(option.name)}=${normalized(option.value)}`)
    .join('|');
}

function imageSignature(images: CatalogImageDraft[]): string {
  return JSON.stringify(images.map(image => ({
    id: image.id || '',
    url: image.url.trim(),
    storage_key: image.storage_key.trim(),
    alt: image.alt.trim(),
  })));
}

function sharedGroupImages(group: VariantGroup, variants: CatalogVariantDraft[]): {
  images: CatalogImageDraft[];
  mixed: boolean;
} {
  const first = variants[group.indexes[0]]?.image_refs || [];
  const signature = imageSignature(first);
  const mixed = group.indexes.some(index => imageSignature(variants[index]?.image_refs || []) !== signature);
  return {
    images: mixed ? [] : cloneImages(first),
    mixed,
  };
}

function cleanSkuPrefix(value: string): string {
  return value.trim().normalize('NFKC').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'FWR';
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-orange-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'end-1' : 'start-1'}`} />
    </button>
  );
}

function Measurements({
  labels,
  form,
  onChange,
}: {
  labels: VariantEditorCopy;
  form: CatalogProductFormState;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  return (
    <details className="rounded-2xl border bg-muted/10 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold">
        <span className="flex items-center gap-2"><Ruler className="h-4 w-4" />{labels.advanced}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </summary>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{labels.advancedHint}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs font-semibold"><span>{labels.weight}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.weight_kg} onChange={e => onChange({ weight_kg: e.target.value })} className="h-10 rounded-xl text-center tabular-nums" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>{labels.length}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.length_cm} onChange={e => onChange({ length_cm: e.target.value })} className="h-10 rounded-xl text-center tabular-nums" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>{labels.width}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.width_cm} onChange={e => onChange({ width_cm: e.target.value })} className="h-10 rounded-xl text-center tabular-nums" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>{labels.height}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.height_cm} onChange={e => onChange({ height_cm: e.target.value })} className="h-10 rounded-xl text-center tabular-nums" /></label>
      </div>
    </details>
  );
}

export function CatalogProductDetailsEditor({
  lang,
  form,
  editing,
  moneyStep,
  onChange,
}: {
  lang: Lang;
  form: CatalogProductFormState;
  editing: boolean;
  moneyStep: string;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  const labels = copy[lang] || copy.en;
  const builderForm = form as BuilderForm;
  const optionRows = builderForm.variant_option_rows ?? rowsFromVariants(form.variants);
  const excluded = builderForm.excluded_variant_combinations ?? [];
  const [feedback, setFeedback] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupDraft>>({});

  const legacy = form.variants.length > 0 && form.variants.some(variant => !catalogVariantDraftHasStructuredOptions(variant));
  const multiEnabled = form.variants.length > 0 || optionRows.length > 0 || excluded.length > 0;
  const structuredDefinitions = useMemo(() => optionRows
    .filter(row => row.name.trim() || row.values.trim())
    .map(row => createCatalogVariantOptionSetDraft(row.name, splitValues(row.values))), [optionRows]);
  const combinationCount = useMemo(() => catalogVariantCombinationCount(structuredDefinitions), [structuredDefinitions]);
  const groups = useMemo(() => legacy ? [] : variantGroups(form.variants), [form.variants, legacy]);
  const variantManagedInventory = catalogProductStockIsVariantManaged(form);

  if (form.item_type !== 'product') return null;

  const patchBuilder = (patch: Partial<BuilderForm>) => {
    onChange(patch as unknown as Partial<CatalogProductFormState>);
  };

  const patchOptionRows = (next: BulkOptionRow[]) => {
    patchBuilder({ variant_option_rows: next });
  };

  const updateVariant = (index: number, patch: Partial<CatalogVariantDraft>) => {
    onChange({ variants: form.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant) });
  };

  const updateGroupDraft = (groupKey: string, patch: Partial<GroupDraft>) => {
    setGroupDrafts(current => ({
      ...current,
      [groupKey]: { ...(current[groupKey] || EMPTY_GROUP_DRAFT), ...patch },
    }));
  };

  const setMultiEnabled = (enabled: boolean) => {
    if (enabled) {
      if (optionRows.length === 0) patchOptionRows([{ key: nextBulkRowKey(), name: '', values: '' }]);
      setFeedback('');
      return;
    }
    if (form.variants.length > 0) {
      setFeedback(labels.existingVariants);
      return;
    }
    patchBuilder({ variant_option_rows: [], excluded_variant_combinations: [] });
    setFeedback('');
  };

  const addOptionRow = () => {
    patchOptionRows([...optionRows, { key: nextBulkRowKey(), name: '', values: '' }]);
    setFeedback('');
  };

  const generatedFromDefinitions = (
    exclusionInput: ExcludedVariantDraft[],
    preservationPool: CatalogVariantDraft[],
  ) => {
    const all = regenerateCatalogVariantDrafts(structuredDefinitions, preservationPool, form.track_inventory);
    const validSignatures = new Set(all.map(variantSignature));
    const nextExcluded = exclusionInput.filter(item => validSignatures.has(item.signature));
    const excludedSignatures = new Set(nextExcluded.map(item => item.signature));
    const filtered = all.filter(variant => !excludedSignatures.has(variantSignature(variant)));
    const prefix = cleanSkuPrefix(form.sku);
    const variants = filtered.map((variant, index) => ({
      ...variant,
      sku: variant.sku.trim() || `${prefix}-${String(index + 1).padStart(2, '0')}`,
    }));
    return { variants, excluded: nextExcluded };
  };

  const generate = () => {
    if (legacy) return;
    if (structuredDefinitions.length === 0 || !catalogVariantOptionSetDefinitionsAreValid(structuredDefinitions)) {
      setFeedback(labels.invalidOptions);
      return;
    }
    const names = structuredDefinitions.map(set => normalized(set.name));
    if (new Set(names).size !== names.length) {
      setFeedback(labels.invalidOptions);
      return;
    }
    const count = catalogVariantCombinationCount(structuredDefinitions);
    if (count <= 0) {
      setFeedback(labels.invalidOptions);
      return;
    }
    if (count > MAX_VARIANTS) {
      setFeedback(labels.tooMany);
      return;
    }
    const preservationPool = [...form.variants, ...excluded.map(item => cloneVariant(item.variant))];
    const generated = generatedFromDefinitions(excluded, preservationPool);
    patchBuilder({
      variants: generated.variants,
      variant_option_rows: optionRows,
      excluded_variant_combinations: generated.excluded,
    });
    setGroupDrafts({});
    setFeedback('');
  };

  const excludeVariant = (index: number) => {
    const variant = form.variants[index];
    if (!variant) return;
    const signature = variantSignature(variant);
    if (!signature) return;
    const nextExcluded = excluded.some(item => item.signature === signature)
      ? excluded
      : [...excluded, { signature, label: optionSummary(variant), variant: cloneVariant(variant) }];
    patchBuilder({
      variants: form.variants.filter((_, itemIndex) => itemIndex !== index),
      excluded_variant_combinations: nextExcluded,
    });
    setFeedback('');
  };

  const restoreExcluded = (signature: string) => {
    const record = excluded.find(item => item.signature === signature);
    if (!record) return;
    if (structuredDefinitions.length === 0 || !catalogVariantOptionSetDefinitionsAreValid(structuredDefinitions)) {
      setFeedback(labels.invalidOptions);
      return;
    }
    const nextExcluded = excluded.filter(item => item.signature !== signature);
    const preservationPool = [...form.variants, cloneVariant(record.variant), ...nextExcluded.map(item => cloneVariant(item.variant))];
    const generated = generatedFromDefinitions(nextExcluded, preservationPool);
    patchBuilder({
      variants: generated.variants,
      excluded_variant_combinations: generated.excluded,
    });
    setFeedback('');
  };

  const applyBulkStock = () => {
    const value = bulkStock.trim();
    if (!/^\d+$/.test(value)) return;
    onChange({ variants: form.variants.map(variant => ({ ...variant, stock_quantity: value })) });
  };

  const generateMissingSkus = () => {
    const prefix = cleanSkuPrefix(form.sku);
    onChange({ variants: form.variants.map((variant, index) => ({
      ...variant,
      sku: variant.sku.trim() || `${prefix}-${String(index + 1).padStart(2, '0')}`,
    })) });
  };

  const applyGroupField = (
    group: VariantGroup,
    field: 'price_iqd' | 'cost_iqd' | 'stock_quantity',
    raw: string,
  ) => {
    const value = raw.trim();
    if (field === 'stock_quantity' && !/^\d+$/.test(value)) return;
    const memberIndexes = new Set(group.indexes);
    onChange({
      variants: form.variants.map((variant, index) => {
        if (!memberIndexes.has(index)) return variant;
        return { ...variant, [field]: value };
      }),
    });
  };

  const applyGroupImages = (group: VariantGroup, images: CatalogImageDraft[]) => {
    const memberIndexes = new Set(group.indexes);
    onChange({
      variants: form.variants.map((variant, index) => memberIndexes.has(index)
        ? { ...variant, image_refs: cloneImages(images) }
        : variant),
    });
  };

  const copyGroupData = (source: VariantGroup, targetKey: string) => {
    const target = groups.find(group => group.key === targetKey);
    if (!target) return;
    const sourceBySecondary = new Map<string, CatalogVariantDraft>();
    for (const index of source.indexes) {
      const variant = form.variants[index];
      if (variant) sourceBySecondary.set(secondarySignature(variant), variant);
    }
    const targetIndexes = new Set(target.indexes);
    onChange({
      variants: form.variants.map((variant, index) => {
        if (!targetIndexes.has(index)) return variant;
        const matching = sourceBySecondary.get(secondarySignature(variant));
        if (!matching) return variant;
        return {
          ...variant,
          price_iqd: matching.price_iqd,
          cost_iqd: matching.cost_iqd,
          image_refs: cloneImages(matching.image_refs),
          ...(form.track_inventory ? { stock_quantity: matching.stock_quantity } : {}),
        };
      }),
    });
  };

  const numericClass = 'h-10 rounded-xl text-center tabular-nums';

  const variantTable = (indexes: number[], grouped: boolean) => (
    <div className="overflow-x-auto rounded-2xl border bg-background">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="w-32 p-3 text-center">{legacy ? labels.name : grouped ? labels.variantWithinGroup : labels.combination}</th>
            <th className="p-3 text-center">{labels.salePrice}</th>
            <th className="p-3 text-center">{labels.cost}</th>
            {form.track_inventory && <th className="p-3 text-center">{labels.stock}</th>}
            <th className="p-3 text-center">{labels.sku}</th>
            <th className="p-3 text-center">{labels.barcode}</th>
            <th className="w-40 p-3 text-center">{labels.images}</th>
            <th className="w-32 p-3 text-center">{labels.actions}</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map(index => {
            const variant = form.variants[index];
            if (!variant) return null;
            return (
              <tr key={variant.key} className="border-t align-middle">
                <td className="w-32 p-2.5 text-center align-middle">
                  {legacy
                    ? <Input value={variant.name} onChange={event => updateVariant(index, { name: event.target.value })} className="h-10 min-w-32 rounded-xl text-center" />
                    : <div className="mx-auto flex min-h-10 w-28 items-center justify-center rounded-xl bg-muted/30 px-3 py-2.5 text-center font-bold" dir="auto">{grouped ? optionSummaryWithinGroup(variant) : optionSummary(variant)}</div>}
                </td>
                <td className="p-2.5"><Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={variant.price_iqd} onChange={event => updateVariant(index, { price_iqd: event.target.value })} placeholder={labels.inheritedSale(form.current_price)} className={`${numericClass} min-w-32`} /></td>
                <td className="p-2.5"><Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={variant.cost_iqd} onChange={event => updateVariant(index, { cost_iqd: event.target.value })} placeholder={labels.inheritedCost(form.cost_iqd)} className={`${numericClass} min-w-32`} /></td>
                {form.track_inventory && <td className="p-2.5"><Input type="text" inputMode="numeric" dir="ltr" value={variant.stock_quantity} onChange={event => updateVariant(index, { stock_quantity: event.target.value })} placeholder="0" className={`${numericClass} w-24`} /></td>}
                <td className="p-2.5"><Input type="text" dir="ltr" value={variant.sku} onChange={event => updateVariant(index, { sku: event.target.value })} className="h-10 min-w-36 rounded-xl text-center font-mono text-xs" /></td>
                <td className="p-2.5"><Input type="text" inputMode="numeric" dir="ltr" value={variant.barcode} onChange={event => updateVariant(index, { barcode: event.target.value })} className={`${numericClass} min-w-32`} /></td>
                <td className="w-40 p-2.5 align-middle">
                  <div className="mx-auto flex w-28 flex-col items-center justify-center">
                    <CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => updateVariant(index, { image_refs })} maxImages={5} compact dense hideHeading />
                    {variant.image_refs.length === 0 && <p className="mt-1 w-28 text-center text-[9px] leading-3 text-muted-foreground">{labels.inheritedImage}</p>}
                  </div>
                </td>
                <td className="w-32 p-2.5 text-center align-middle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={labels.excludeCombination}
                    aria-label={labels.excludeCombination}
                    className="h-9 w-9 rounded-xl text-destructive"
                    onClick={() => excludeVariant(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {form.track_inventory && !variantManagedInventory && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.quantity}</span>
          <Input type="text" inputMode="numeric" dir="ltr" value={form.quantity} onChange={event => onChange({ quantity: event.target.value })} className="h-11 rounded-xl text-center tabular-nums" />
          {editing && <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>}
        </label>
      )}

      <section className="space-y-3 rounded-2xl border bg-muted/10 p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><Boxes className="h-4 w-4" />{labels.baseData}</div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold">
            <span>{labels.reportingCost}</span>
            <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={form.cost_iqd} onChange={event => onChange({ cost_iqd: event.target.value })} placeholder="0" className="h-11 rounded-xl text-center tabular-nums" />
            <span className="block text-xs font-normal leading-5 text-muted-foreground">{labels.reportingCostHint}</span>
          </label>
          <label className="space-y-1 text-sm font-semibold"><span>{labels.sku}</span><Input type="text" dir="ltr" value={form.sku} onChange={event => onChange({ sku: event.target.value })} className="h-11 rounded-xl text-center font-mono" /></label>
          <label className="space-y-1 text-sm font-semibold"><span>{labels.barcode}</span><Input type="text" inputMode="numeric" dir="ltr" value={form.barcode} onChange={event => onChange({ barcode: event.target.value })} className="h-11 rounded-xl text-center tabular-nums" /></label>
        </div>
      </section>

      <Measurements labels={labels} form={form} onChange={onChange} />

      <section className="space-y-4 rounded-2xl border bg-muted/10 p-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold"><Layers3 className="h-4 w-4" />{labels.multiProduct}</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{labels.multiProductHint}</p>
          </div>
          <Toggle checked={multiEnabled} onChange={setMultiEnabled} />
        </div>

        {multiEnabled && (
          <>
            <div>
              <p className="text-sm font-bold">{labels.options}</p>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{labels.optionsHint}</p>
            </div>

            {legacy ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">{labels.legacy}</p>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[minmax(9rem,0.8fr)_minmax(14rem,1.8fr)_auto] gap-2 px-1 text-xs font-bold text-muted-foreground md:grid">
                  <span>{labels.optionName}</span><span>{labels.optionValues}</span><span />
                </div>
                {optionRows.map((row, index) => (
                  <div key={row.key} className="grid gap-2 rounded-xl border bg-background p-2 md:grid-cols-[minmax(9rem,0.8fr)_minmax(14rem,1.8fr)_auto]">
                    <Input value={row.name} onChange={event => patchOptionRows(optionRows.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={labels.optionNamePlaceholder} className="h-10 rounded-xl" />
                    <Input value={row.values} onChange={event => patchOptionRows(optionRows.map((item, itemIndex) => itemIndex === index ? { ...item, values: event.target.value } : item))} placeholder={labels.optionValuesPlaceholder} className="h-10 rounded-xl" />
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive" onClick={() => patchOptionRows(optionRows.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addOptionRow}><Plus className="me-1 h-4 w-4" />{labels.addOption}</Button>
                    <p className="text-xs text-muted-foreground">{labels.valuesHint} {combinationCount > 0 ? `${labels.combinations}: ${combinationCount}` : ''}</p>
                  </div>
                  <Button type="button" className="rounded-xl bg-orange-500 text-white hover:bg-orange-600" onClick={generate}>{labels.generate}</Button>
                </div>
                {optionRows.length === 0 && <p className="rounded-xl border border-dashed bg-background p-3 text-xs text-muted-foreground">{labels.noVariants}</p>}
                {feedback && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{feedback}</p>}
              </div>
            )}

            {excluded.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <p className="text-sm font-bold text-amber-950">{labels.excludedTitle} — {excluded.length}</p>
                <p className="mt-1 text-xs leading-5 text-amber-900/80">{labels.excludedHint}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {excluded.map(item => (
                    <Button key={item.signature} type="button" variant="outline" size="sm" className="h-8 rounded-xl bg-background text-xs" onClick={() => restoreExcluded(item.signature)}>
                      <Undo2 className="me-1 h-3.5 w-3.5" />{item.label} · {labels.restoreCombination}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {form.variants.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                  <p className="text-sm font-bold text-orange-900">{labels.inheritanceTitle}</p>
                  <p className="mt-1 text-xs leading-5 text-orange-900/80">{labels.inheritanceHint(form.current_price, form.cost_iqd)}</p>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-bold">{labels.combinations} — {form.variants.length}</p>
                    {editing && form.track_inventory && <p className="mt-1 text-xs text-muted-foreground">{labels.inventoryAfterSave}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {form.track_inventory && <><Input type="text" inputMode="numeric" dir="ltr" value={bulkStock} onChange={event => setBulkStock(event.target.value)} placeholder={labels.bulkStock} className="h-9 w-40 rounded-xl text-center tabular-nums" /><Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={applyBulkStock}>{labels.applyStock}</Button></>}
                    <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={generateMissingSkus}>{labels.generateSku}</Button>
                  </div>
                </div>

                {legacy || groups.length === 0 ? (
                  variantTable(form.variants.map((_, index) => index), false)
                ) : (
                  <div className="space-y-4">
                    {groups.map(group => {
                      const draft = groupDrafts[group.key] || EMPTY_GROUP_DRAFT;
                      const shared = sharedGroupImages(group, form.variants);
                      return (
                        <section key={group.key} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                          <div className="space-y-3 border-b bg-muted/20 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-base font-extrabold" dir="auto">{group.optionName}: {group.optionValue}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{labels.groupCount(group.indexes.length)}</p>
                              </div>
                            </div>

                            <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_minmax(15rem,1.2fr)]">
                              <label className="space-y-1 text-xs font-semibold">
                                <span>{labels.groupSale}</span>
                                <div className="flex gap-1.5">
                                  <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={draft.sale} onChange={event => updateGroupDraft(group.key, { sale: event.target.value })} placeholder={labels.inheritedSale(form.current_price)} className="h-10 rounded-xl text-center tabular-nums" />
                                  <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => applyGroupField(group, 'price_iqd', draft.sale)}>{labels.applyGroup}</Button>
                                </div>
                                <span className="block text-[10px] font-normal text-muted-foreground">{labels.clearOverrideHint}</span>
                              </label>

                              <label className="space-y-1 text-xs font-semibold">
                                <span>{labels.groupCost}</span>
                                <div className="flex gap-1.5">
                                  <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={draft.cost} onChange={event => updateGroupDraft(group.key, { cost: event.target.value })} placeholder={labels.inheritedCost(form.cost_iqd)} className="h-10 rounded-xl text-center tabular-nums" />
                                  <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => applyGroupField(group, 'cost_iqd', draft.cost)}>{labels.applyGroup}</Button>
                                </div>
                                <span className="block text-[10px] font-normal text-muted-foreground">{labels.clearOverrideHint}</span>
                              </label>

                              {form.track_inventory ? (
                                <label className="space-y-1 text-xs font-semibold">
                                  <span>{labels.groupStock}</span>
                                  <div className="flex gap-1.5">
                                    <Input type="text" inputMode="numeric" dir="ltr" value={draft.stock} onChange={event => updateGroupDraft(group.key, { stock: event.target.value })} placeholder="0" className="h-10 rounded-xl text-center tabular-nums" />
                                    <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => applyGroupField(group, 'stock_quantity', draft.stock)}>{labels.applyGroup}</Button>
                                  </div>
                                </label>
                              ) : <div />}

                              <div className="space-y-1 text-xs font-semibold">
                                <span>{labels.groupImages}</span>
                                <CatalogImageUploadEditor images={shared.images} onChange={images => applyGroupImages(group, images)} maxImages={5} compact hideHeading />
                                <span className="block text-[10px] font-normal leading-4 text-muted-foreground">{shared.mixed ? labels.mixedGroupImages : labels.groupImagesHint}</span>
                              </div>
                            </div>

                            {groups.length > 1 && (
                              <div className="flex flex-col gap-2 rounded-xl border bg-background p-2.5 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <p className="flex items-center gap-1.5 text-xs font-bold"><Copy className="h-3.5 w-3.5" />{labels.copyGroup}</p>
                                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{labels.copyHint}</p>
                                </div>
                                <div className="flex min-w-0 flex-1 gap-2 lg:max-w-md">
                                  <select value={draft.copyTarget} onChange={event => updateGroupDraft(group.key, { copyTarget: event.target.value })} className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20">
                                    <option value="">{labels.copyTo}</option>
                                    {groups.filter(candidate => candidate.key !== group.key).map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.optionValue}</option>)}
                                  </select>
                                  <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={!draft.copyTarget} onClick={() => copyGroupData(group, draft.copyTarget)}>{labels.copyAction}</Button>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="p-2.5">
                            {variantTable(group.indexes, true)}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!multiEnabled && <p className="text-xs leading-5 text-muted-foreground">{labels.noVariants}</p>}
      </section>
    </div>
  );
}

export default CatalogProductDetailsEditor;
