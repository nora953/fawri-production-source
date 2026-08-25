import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from 'lucide-react';

import { CatalogImageUploadEditor } from '@/components/catalog/CatalogImageUploadEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  CatalogMeasurementDraft,
  CatalogProductFormState,
  CatalogVariantDraft,
} from '@/lib/catalogProductEditor';
import {
  catalogProductStockIsVariantManaged,
  createEmptyCatalogOptionDraft,
} from '@/lib/catalogProductEditor';
import {
  catalogVariantCombinationCount,
  catalogVariantDraftHasStructuredOptions,
  catalogVariantMatrixCoverage,
  catalogVariantOptionNameAvailable,
  catalogVariantOptionSetsFromVariants,
  catalogVariantValueAvailable,
  createCatalogVariantOptionSetDraft,
  regenerateCatalogVariantDrafts,
  type CatalogVariantOptionSetDraft,
} from '@/lib/catalogVariantMatrix';
import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import type { Lang } from '@/lib/types';

const MAX_VARIANTS = 100;
const MAX_OPTION_SETS = 10;

const copy = {
  ar: {
    quantity: 'الكمية',
    inventoryAfterSave: 'بعد الحفظ، عدّل المخزون من أدوات المخزون حتى تبقى كل حركة مسجلة.',
    inventoryManagedByVariants: 'المخزون في هذا المنتج يُدار لكل تركيبة بشكل مستقل.',
    variantQuantity: 'المخزون',
    reportingCost: 'تكلفة المنتج',
    reportingCostHint: 'اختياري ومخصص للتاجر فقط. يُستخدم لحساب الربح ولا يظهر للزبائن أو في ردود فوري.',
    variantCost: 'تكلفة خاصة',
    inheritedCost: (cost: string) => cost ? `فارغ = يرث تكلفة المنتج (${cost})` : 'فارغ = يرث تكلفة المنتج (غير محددة)',
    variants: 'المتغيرات',
    variantsHint: 'عرّف اللون أو المقاس أو أي خيار مرة واحدة، وسيُنشئ فوري التركيبات تلقائيًا ويحافظ على بيانات التركيبات الموجودة.',
    optionSets: 'خيارات المنتج',
    addOptionSet: 'إضافة خيار',
    noOptions: 'لا توجد خيارات لهذا المنتج بعد.',
    noOptionsHint: 'أضف خيارًا فقط إذا كان المنتج يأتي بألوان أو مقاسات أو أشكال متعددة.',
    optionSetName: 'اسم الخيار، مثل اللون أو المقاس',
    optionValue: 'قيمة الخيار، مثل أسود أو M',
    firstOptionValue: 'أول قيمة للخيار',
    createOption: 'إنشاء الخيار',
    cancel: 'إلغاء',
    rename: 'تغيير الاسم',
    applyRename: 'حفظ الاسم',
    addValue: 'إضافة قيمة',
    generatedVariants: 'التركيبات',
    generatedVariantsCount: (existing: number, expected: number) => expected > existing ? `${existing} من ${expected}` : `${existing}`,
    generatedVariantsHint: 'السعر الفارغ يرث سعر المنتج، والتكلفة الفارغة ترث تكلفة المنتج، والقياسات الفارغة ترث قياسات المنتج الأساسية.',
    incompleteMatrix: 'هذا المنتج يحتوي فقط على بعض التركيبات الممكنة.',
    incompleteMatrixCounts: (existing: number, expected: number) => `${existing} محفوظة من أصل ${expected} تركيبة ممكنة.`,
    completeMissing: 'إنشاء التركيبات الناقصة',
    combinationLimit: 'الحد الأقصى 100 تركيبة للمنتج. قلّل عدد القيم أولًا.',
    duplicateOption: 'يوجد خيار آخر بهذا الاسم.',
    duplicateValue: 'هذه القيمة موجودة بالفعل.',
    optionRequired: 'أدخل اسم الخيار وأول قيمة.',
    variantPrice: 'سعر خاص',
    inheritedPrice: (price: string) => `فارغ = يرث سعر المنتج (${price || '0'})`,
    zeroInheritedPrice: 'تنبيه: سعر المنتج الأساسي صفر. أي تركيبة بدون سعر خاص ستُحفظ بسعر 0.',
    variantSku: 'SKU',
    details: 'تفاصيل إضافية',
    hideDetails: 'إخفاء التفاصيل',
    variantName: 'اسم المتغير',
    variantNameHint: 'يمكنك الاحتفاظ باسم مخصص مثل صغير أو كبير. الاسم التلقائي يتغير مع الخيارات فقط.',
    barcode: 'الباركود',
    legacyVariants: 'هذا المنتج يحتوي متغيرات قديمة بلا خيارات منظمة. ستبقى قابلة للتحرير اليدوي حتى لا نفقد أي بيانات.',
    options: 'الخيارات',
    addOption: 'إضافة خيار',
    optionName: 'اسم الخيار، مثل اللون',
    optionValueLegacy: 'القيمة، مثل أسود',
    physical: 'الشحن والقياسات',
    physicalOptional: 'اختياري',
    physicalHint: 'اتركها فارغة إذا لم تكن تحتاجها. قياسات المتغير الفارغة ترث قياسات المنتج الأساسية.',
    weight: 'الوزن (كغم)',
    dimensions: 'الأبعاد (سم)',
    length: 'الطول',
    width: 'العرض',
    height: 'الارتفاع',
    confirmDeleteOption: 'حذف هذا الخيار سيعيد بناء التركيبات. هل تريد المتابعة؟',
  },
  ku: {
    quantity: 'بڕ',
    inventoryAfterSave: 'دوای پاشەکەوتکردن کۆگا لە ئامرازەکانی کۆگا بگۆڕە بۆ پاراستنی هەموو جوڵەکان.',
    inventoryManagedByVariants: 'کۆگای ئەم بەرهەمە بۆ هەر تێکەڵەیەک بە جیا بەڕێوەدەبرێت.',
    variantQuantity: 'کۆگا',
    reportingCost: 'تێچووی بەرهەم',
    reportingCostHint: 'ئارەزوومەندانە و تەنها بۆ بازرگانە. بۆ هەژمارکردنی قازانج بەکاردێت و بە کڕیار یان وەڵامەکانی فەوری پیشان نادرێت.',
    variantCost: 'تێچووی تایبەت',
    inheritedCost: (cost: string) => cost ? `بەتاڵ = تێچووی بەرهەم (${cost})` : 'بەتاڵ = تێچووی بەرهەم (دیاری نەکراوە)',
    variants: 'جۆراوجۆرییەکان',
    variantsHint: 'هەڵبژاردەکان جارێک دیاری بکە؛ فەوری تێکەڵەکان خۆکار دروست دەکات و داتای هەبوو دەپارێزێت.',
    optionSets: 'هەڵبژاردەکانی بەرهەم',
    addOptionSet: 'زیادکردنی هەڵبژاردە',
    noOptions: 'هێشتا هیچ هەڵبژاردەیەک نییە.',
    noOptionsHint: 'تەنها کاتێک هەڵبژاردە زیاد بکە کە بەرهەمەکە ڕەنگ یان قەبارەی جیاواز هەبێت.',
    optionSetName: 'ناوی هەڵبژاردە، وەک ڕەنگ یان قەبارە',
    optionValue: 'بەهای هەڵبژاردە، وەک ڕەش یان M',
    firstOptionValue: 'یەکەم بەها',
    createOption: 'دروستکردن',
    cancel: 'هەڵوەشاندنەوە',
    rename: 'گۆڕینی ناو',
    applyRename: 'پاشەکەوتکردنی ناو',
    addValue: 'زیادکردنی بەها',
    generatedVariants: 'تێکەڵەکان',
    generatedVariantsCount: (existing: number, expected: number) => expected > existing ? `${existing} لە ${expected}` : `${existing}`,
    generatedVariantsHint: 'نرخی بەتاڵ نرخی بەرهەم، تێچووی بەتاڵ تێچووی بەرهەم، و پێوانەی بەتاڵ پێوانەی بەرهەم بەکاردێنێت.',
    incompleteMatrix: 'ئەم بەرهەمە تەنها هەندێک لە تێکەڵە گونجاوەکانی هەیە.',
    incompleteMatrixCounts: (existing: number, expected: number) => `${existing} لە ${expected} تێکەڵە پاشەکەوت کراوە.`,
    completeMissing: 'دروستکردنی تێکەڵە ونبووەکان',
    combinationLimit: 'زۆرترین ژمارە 100 تێکەڵەیە. هەندێک بەها کەم بکە.',
    duplicateOption: 'هەڵبژاردەیەکی تر بە هەمان ناو هەیە.',
    duplicateValue: 'ئەم بەهایە پێشتر هەیە.',
    optionRequired: 'ناو و یەکەم بەهای هەڵبژاردە بنووسە.',
    variantPrice: 'نرخی تایبەت',
    inheritedPrice: (price: string) => `بەتاڵ = نرخی بەرهەم (${price || '0'})`,
    zeroInheritedPrice: 'ئاگاداری: نرخی سەرەکی صفرە. هەر تێکەڵەیەکی بێ نرخی تایبەت بە 0 پاشەکەوت دەکرێت.',
    variantSku: 'SKU',
    details: 'وردەکاری زیاتر',
    hideDetails: 'شاردنەوەی وردەکاری',
    variantName: 'ناوی جۆراوجۆری',
    variantNameHint: 'ناوی تایبەت دەپارێزرێت؛ ناوی خۆکاری لەگەڵ هەڵبژاردەکان نوێ دەبێتەوە.',
    barcode: 'بارکۆد',
    legacyVariants: 'ئەم بەرهەمە جۆراوجۆریی کۆنی هەیە کە هەڵبژاردەی ڕێکخراوی نییە؛ بۆ پاراستنی داتا بە دەستی دەستکاری دەکرێت.',
    options: 'هەڵبژاردەکان',
    addOption: 'زیادکردنی هەڵبژاردە',
    optionName: 'ناوی هەڵبژاردە، وەک ڕەنگ',
    optionValueLegacy: 'بەها، وەک ڕەش',
    physical: 'گەیاندن و پێوانەکان',
    physicalOptional: 'ئارەزوومەندانە',
    physicalHint: 'ئەگەر پێویست نییە بەتاڵی بهێڵە. پێوانەی بەتاڵ پێوانەی بەرهەم بەکاردێنێت.',
    weight: 'کێش (کگم)',
    dimensions: 'ڕەهەندەکان (سم)',
    length: 'درێژی',
    width: 'پانی',
    height: 'بەرزی',
    confirmDeleteOption: 'سڕینەوەی ئەم هەڵبژاردەیە تێکەڵەکان نوێ دەکاتەوە. بەردەوام بیت؟',
  },
  en: {
    quantity: 'Quantity',
    inventoryAfterSave: 'After saving, use inventory controls so every stock movement remains recorded.',
    inventoryManagedByVariants: 'Inventory for this product is managed independently for each combination.',
    variantQuantity: 'Stock',
    reportingCost: 'Product cost',
    reportingCostHint: 'Optional and merchant-private. Used for profit reporting; never shown to customers or included in Fawri replies.',
    variantCost: 'Custom cost',
    inheritedCost: (cost: string) => cost ? `Blank = inherit product cost (${cost})` : 'Blank = inherit product cost (not set)',
    variants: 'Variants',
    variantsHint: 'Define Color, Size, or another option once and Fawri will build combinations while preserving matching saved data.',
    optionSets: 'Product options',
    addOptionSet: 'Add option',
    noOptions: 'This product has no options yet.',
    noOptionsHint: 'Add an option only when the product comes in multiple colors, sizes, or other choices.',
    optionSetName: 'Option name, e.g. Color or Size',
    optionValue: 'Option value, e.g. Black or M',
    firstOptionValue: 'First option value',
    createOption: 'Create option',
    cancel: 'Cancel',
    rename: 'Rename',
    applyRename: 'Save name',
    addValue: 'Add value',
    generatedVariants: 'Combinations',
    generatedVariantsCount: (existing: number, expected: number) => expected > existing ? `${existing} of ${expected}` : `${existing}`,
    generatedVariantsHint: 'Blank price inherits product price, blank cost inherits product cost, and blank measurements inherit product measurements.',
    incompleteMatrix: 'This product currently contains only part of the possible option matrix.',
    incompleteMatrixCounts: (existing: number, expected: number) => `${existing} saved of ${expected} possible combinations.`,
    completeMissing: 'Create missing combinations',
    combinationLimit: 'A product can have up to 100 combinations. Remove values first.',
    duplicateOption: 'Another option already uses this name.',
    duplicateValue: 'This value already exists.',
    optionRequired: 'Enter an option name and its first value.',
    variantPrice: 'Custom price',
    inheritedPrice: (price: string) => `Blank = inherit product price (${price || '0'})`,
    zeroInheritedPrice: 'Warning: the base product price is zero. Any combination without a custom price will save at 0.',
    variantSku: 'SKU',
    details: 'More details',
    hideDetails: 'Hide details',
    variantName: 'Variant name',
    variantNameHint: 'Custom names are preserved. Auto combination names update with option changes only.',
    barcode: 'Barcode',
    legacyVariants: 'This product has legacy variants without structured options. They remain manually editable so no data is lost.',
    options: 'Options',
    addOption: 'Add option',
    optionName: 'Option name, e.g. Color',
    optionValueLegacy: 'Value, e.g. Black',
    physical: 'Shipping & measurements',
    physicalOptional: 'Optional',
    physicalHint: 'Leave these blank when they are not needed. Blank variant measurements inherit product measurements.',
    weight: 'Weight (kg)',
    dimensions: 'Dimensions (cm)',
    length: 'Length',
    width: 'Width',
    height: 'Height',
    confirmDeleteOption: 'Removing this option rebuilds combinations. Continue?',
  },
} as const;

function Measurements({
  lang,
  value,
  onChange,
}: {
  lang: Lang;
  value: CatalogMeasurementDraft;
  onChange: (patch: Partial<CatalogMeasurementDraft>) => void;
}) {
  const labels = copy[lang] || copy.en;
  const hasValues = Boolean(
    value.weight_kg.trim() || value.length_cm.trim() || value.width_cm.trim() || value.height_cm.trim(),
  );

  return (
    <details className="group rounded-2xl border bg-muted/10" open={hasValues || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div>
          <p className="text-sm font-bold">{labels.physical}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{labels.physicalOptional}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t p-4">
        <p className="text-xs leading-5 text-muted-foreground">{labels.physicalHint}</p>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
          <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
            <span>{labels.weight}</span>
            <Input
              inputMode="decimal"
              dir="ltr"
              value={value.weight_kg}
              onChange={event => onChange({ weight_kg: event.target.value })}
              placeholder="مثال: 1.25"
              className="h-10 rounded-xl"
            />
          </label>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{labels.dimensions}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input inputMode="decimal" dir="ltr" value={value.length_cm} onChange={event => onChange({ length_cm: event.target.value })} placeholder={labels.length} className="h-10 rounded-xl" />
              <Input inputMode="decimal" dir="ltr" value={value.width_cm} onChange={event => onChange({ width_cm: event.target.value })} placeholder={labels.width} className="h-10 rounded-xl" />
              <Input inputMode="decimal" dir="ltr" value={value.height_cm} onChange={event => onChange({ height_cm: event.target.value })} placeholder={labels.height} className="h-10 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function OptionSummary({ variant }: { variant: CatalogVariantDraft }) {
  const options = variant.options.filter(option => option.name.trim() && option.value.trim());
  if (options.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
      {options.map(option => (
        <span key={option.key} dir="ltr" className="inline-flex items-center gap-1 rounded-full border bg-muted/20 px-2 py-0.5">
          <bdi>{option.name.trim()}</bdi><span aria-hidden="true">:</span><bdi>{option.value.trim()}</bdi>
        </span>
      ))}
    </div>
  );
}

function LegacyVariantEditor({ lang, variant, index, trackInventory, moneyStep, onChange, onRemove }: {
  lang: Lang;
  variant: CatalogVariantDraft;
  index: number;
  trackInventory: boolean;
  moneyStep: string;
  onChange: (variant: CatalogVariantDraft) => void;
  onRemove: () => void;
}) {
  const labels = copy[lang] || copy.en;
  const patch = (next: Partial<CatalogVariantDraft>) => onChange({ ...variant, ...next });
  return (
    <div className="space-y-4 rounded-2xl border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold">{labels.variants} #{index + 1}</p>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{labels.variantName}</span><Input value={variant.name} onChange={event => patch({ name: event.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{labels.variantPrice}</span><Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={variant.price_iqd} onChange={event => patch({ price_iqd: event.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{labels.variantCost}</span><Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={variant.cost_iqd} onChange={event => patch({ cost_iqd: event.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{labels.variantSku}</span><Input dir="ltr" value={variant.sku} onChange={event => patch({ sku: event.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{labels.barcode}</span><Input dir="ltr" value={variant.barcode} onChange={event => patch({ barcode: event.target.value })} className="h-10 rounded-xl" /></label>
      </div>
      {trackInventory && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.variantQuantity}</span>
          <Input type="number" min={0} dir="ltr" value={variant.stock_quantity} onChange={event => patch({ stock_quantity: event.target.value })} disabled={Boolean(variant.id)} className="h-10 rounded-xl" />
        </label>
      )}
      <Measurements lang={lang} value={variant} onChange={patch} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{labels.options}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => patch({ options: [...variant.options, createEmptyCatalogOptionDraft()] })}>
            <Plus className="me-1 h-4 w-4" />{labels.addOption}
          </Button>
        </div>
        {variant.options.map((option, optionIndex) => (
          <div key={option.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input value={option.name} onChange={event => patch({ options: variant.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, name: event.target.value } : item) })} placeholder={labels.optionName} className="h-10 rounded-xl" />
            <Input value={option.value} onChange={event => patch({ options: variant.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, value: event.target.value } : item) })} placeholder={labels.optionValueLegacy} className="h-10 rounded-xl" />
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => patch({ options: variant.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}><X className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => patch({ image_refs })} maxImages={5} />
    </div>
  );
}

function VariantCombinationEditor({ lang, variant, trackInventory, inheritedPrice, inheritedCost, moneyStep, expanded, onToggle, onChange }: {
  lang: Lang;
  variant: CatalogVariantDraft;
  trackInventory: boolean;
  inheritedPrice: string;
  inheritedCost: string;
  moneyStep: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (variant: CatalogVariantDraft) => void;
}) {
  const labels = copy[lang] || copy.en;
  const patch = (next: Partial<CatalogVariantDraft>) => onChange({ ...variant, ...next });
  return (
    <div className={`rounded-2xl border bg-background p-3 sm:p-4 ${expanded ? 'xl:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold" dir="auto"><bdi>{variant.name}</bdi></p>
          <OptionSummary variant={variant} />
        </div>
        <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onToggle}>
          {expanded ? <ChevronUp className="me-1 h-4 w-4" /> : <ChevronDown className="me-1 h-4 w-4" />}
          {expanded ? labels.hideDetails : labels.details}
        </Button>
      </div>
      <div className={`mt-4 grid gap-3 ${trackInventory ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          <span>{labels.variantPrice}</span>
          <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={variant.price_iqd} onChange={event => patch({ price_iqd: event.target.value })} placeholder={labels.variantPrice} className="h-10 rounded-xl" />
          <span className="block font-normal">{labels.inheritedPrice(inheritedPrice)}</span>
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          <span>{labels.variantCost}</span>
          <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={variant.cost_iqd} onChange={event => patch({ cost_iqd: event.target.value })} placeholder={labels.variantCost} className="h-10 rounded-xl" />
          <span className="block font-normal">{labels.inheritedCost(inheritedCost)}</span>
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          <span>{labels.variantSku}</span>
          <Input dir="ltr" value={variant.sku} onChange={event => patch({ sku: event.target.value })} placeholder={COMMON_UI_LABELS.technical.sku} className="h-10 rounded-xl" />
        </label>
        {trackInventory && (
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            <span>{labels.variantQuantity}</span>
            <Input type="number" min={0} dir="ltr" value={variant.stock_quantity} onChange={event => patch({ stock_quantity: event.target.value })} disabled={Boolean(variant.id)} className="h-10 rounded-xl" />
          </label>
        )}
      </div>
      {expanded && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-muted-foreground">
              <span>{labels.variantName}</span>
              <Input value={variant.name} onChange={event => patch({ name: event.target.value })} className="h-10 rounded-xl" />
              <span className="block font-normal">{labels.variantNameHint}</span>
            </label>
            <label className="space-y-1 text-xs font-semibold text-muted-foreground">
              <span>{labels.barcode}</span>
              <Input dir="ltr" value={variant.barcode} onChange={event => patch({ barcode: event.target.value })} placeholder="مثال: 123456789" className="h-10 rounded-xl" />
            </label>
          </div>
          <Measurements lang={lang} value={variant} onChange={patch} />
          <CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => patch({ image_refs })} maxImages={5} />
        </div>
      )}
    </div>
  );
}

function variantStructureSignature(variants: CatalogVariantDraft[]): string {
  return JSON.stringify(
    variants.map(variant => variant.options
      .filter(option => option.name.trim() && option.value.trim())
      .map(option => [option.name.trim(), option.value.trim()])),
  );
}

export function CatalogProductDetailsEditor({ lang, form, editing, moneyStep, onChange }: {
  lang: Lang;
  form: CatalogProductFormState;
  editing: boolean;
  moneyStep: string;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  const labels = copy[lang] || copy.en;
  const variantManaged = catalogProductStockIsVariantManaged(form);
  const hasLegacyVariants = form.variants.some(variant => !catalogVariantDraftHasStructuredOptions(variant));
  const [optionSets, setOptionSets] = useState<CatalogVariantOptionSetDraft[]>(() => hasLegacyVariants ? [] : catalogVariantOptionSetsFromVariants(form.variants));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [limitReached, setLimitReached] = useState(false);
  const [newOptionOpen, setNewOptionOpen] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionValue, setNewOptionValue] = useState('');
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [feedback, setFeedback] = useState('');
  const structure = variantStructureSignature(form.variants);
  const localStructure = useRef(structure);
  const coverage = useMemo(() => catalogVariantMatrixCoverage(optionSets, form.variants), [optionSets, form.variants]);
  const inheritedPrice = form.current_price.trim() || form.original_price.trim() || '0';
  const inheritedCost = form.cost_iqd.trim();

  useEffect(() => {
    if (structure === localStructure.current) return;
    if (!hasLegacyVariants) setOptionSets(catalogVariantOptionSetsFromVariants(form.variants));
    localStructure.current = structure;
  }, [form.variants, hasLegacyVariants, structure]);

  if (form.item_type !== 'product') return null;

  const updateVariant = (index: number, nextVariant: CatalogVariantDraft) => {
    onChange({ variants: form.variants.map((item, itemIndex) => itemIndex === index ? nextVariant : item) });
  };

  const applyMatrix = (nextSets: CatalogVariantOptionSetDraft[]) => {
    setFeedback('');
    setLimitReached(false);
    if (nextSets.length === 0) {
      setOptionSets([]);
      localStructure.current = variantStructureSignature([]);
      onChange({ variants: [] });
      return true;
    }
    const count = catalogVariantCombinationCount(nextSets);
    if (count === 0) return false;
    if (count > MAX_VARIANTS) {
      setLimitReached(true);
      return false;
    }
    const nextVariants = regenerateCatalogVariantDrafts(nextSets, form.variants, form.track_inventory);
    setOptionSets(nextSets);
    localStructure.current = variantStructureSignature(nextVariants);
    onChange({ variants: nextVariants });
    return true;
  };

  const addValue = (setIndex: number) => {
    const set = optionSets[setIndex];
    const value = set.pendingValue.trim();
    if (!value) return;
    if (!catalogVariantValueAvailable(set, value)) {
      setFeedback(labels.duplicateValue);
      return;
    }
    applyMatrix(optionSets.map((item, index) => index === setIndex ? { ...item, values: [...item.values, value], pendingValue: '' } : item));
  };

  const removeValue = (setIndex: number, valueIndex: number) => {
    const set = optionSets[setIndex];
    if (set.values.length === 1) {
      if (typeof window !== 'undefined' && !window.confirm(labels.confirmDeleteOption)) return;
      applyMatrix(optionSets.filter((_, index) => index !== setIndex));
      return;
    }
    applyMatrix(optionSets.map((item, index) => index === setIndex ? { ...item, values: item.values.filter((_, indexValue) => indexValue !== valueIndex) } : item));
  };

  const createOption = () => {
    const name = newOptionName.trim();
    const value = newOptionValue.trim();
    if (!name || !value) {
      setFeedback(labels.optionRequired);
      return;
    }
    if (!catalogVariantOptionNameAvailable(optionSets, name)) {
      setFeedback(labels.duplicateOption);
      return;
    }
    if (!applyMatrix([...optionSets, createCatalogVariantOptionSetDraft(name, [value])])) return;
    setNewOptionName('');
    setNewOptionValue('');
    setNewOptionOpen(false);
  };

  const startRename = (index: number) => {
    setRenamingIndex(index);
    setRenameValue(optionSets[index]?.name || '');
    setFeedback('');
  };

  const finishRename = () => {
    if (renamingIndex === null) return;
    const name = renameValue.trim();
    if (!name) {
      setFeedback(labels.optionRequired);
      return;
    }
    if (!catalogVariantOptionNameAvailable(optionSets, name, renamingIndex)) {
      setFeedback(labels.duplicateOption);
      return;
    }
    if (!applyMatrix(optionSets.map((item, index) => index === renamingIndex ? { ...item, name } : item))) return;
    setRenamingIndex(null);
    setRenameValue('');
  };

  return (
    <div className="space-y-4">
      {form.track_inventory && !variantManaged && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.quantity}</span>
          <Input type="number" min={0} dir="ltr" value={form.quantity} onChange={event => onChange({ quantity: event.target.value })} disabled={editing} className="h-11 rounded-xl" />
          {editing && <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>}
        </label>
      )}
      {form.track_inventory && variantManaged && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs font-semibold text-sky-900">
          {labels.inventoryManagedByVariants} {editing ? labels.inventoryAfterSave : ''}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.reportingCost}</span>
          <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={form.cost_iqd} onChange={event => onChange({ cost_iqd: event.target.value })} placeholder="0" className="h-11 rounded-xl" />
          <span className="block text-xs font-normal leading-5 text-muted-foreground">{labels.reportingCostHint}</span>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>{COMMON_UI_LABELS.technical.sku}</span>
          <Input dir="ltr" value={form.sku} onChange={event => onChange({ sku: event.target.value })} placeholder={`مثال: ${COMMON_UI_LABELS.technical.skuExample}`} className="h-11 rounded-xl" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.barcode}</span>
          <Input dir="ltr" value={form.barcode} onChange={event => onChange({ barcode: event.target.value })} placeholder="مثال: 123456789" className="h-11 rounded-xl" />
        </label>
      </div>

      <Measurements lang={lang} value={form} onChange={onChange} />

      <section className="space-y-4 rounded-2xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold">{labels.variants}</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{labels.variantsHint}</p>
          </div>
          {!hasLegacyVariants && optionSets.length === 0 && !newOptionOpen && (
            <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => { setNewOptionOpen(true); setFeedback(''); }}>
              <Plus className="me-1 h-4 w-4" />{labels.addOptionSet}
            </Button>
          )}
        </div>

        {hasLegacyVariants ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">{labels.legacyVariants}</p>
            {form.variants.map((variant, index) => (
              <LegacyVariantEditor
                key={variant.key}
                lang={lang}
                variant={variant}
                index={index}
                trackInventory={form.track_inventory}
                moneyStep={moneyStep}
                onChange={nextVariant => updateVariant(index, nextVariant)}
                onRemove={() => onChange({ variants: form.variants.filter((_, itemIndex) => itemIndex !== index) })}
              />
            ))}
          </div>
        ) : (
          <>
            {optionSets.length === 0 && !newOptionOpen ? (
              <div className="rounded-xl border border-dashed bg-background px-4 py-5">
                <p className="text-sm font-semibold">{labels.noOptions}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.noOptionsHint}</p>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border bg-background p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{labels.optionSets}</p>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={optionSets.length >= MAX_OPTION_SETS || newOptionOpen} onClick={() => { setNewOptionOpen(true); setFeedback(''); }}>
                    <Plus className="me-1 h-4 w-4" />{labels.addOptionSet}
                  </Button>
                </div>

                {newOptionOpen && (
                  <div className="grid gap-2 rounded-xl border border-orange-200 bg-orange-50/40 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
                    <Input value={newOptionName} onChange={event => setNewOptionName(event.target.value)} placeholder={labels.optionSetName} className="h-10 rounded-xl bg-background" />
                    <Input value={newOptionValue} onChange={event => setNewOptionValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); createOption(); } }} placeholder={labels.firstOptionValue} className="h-10 rounded-xl bg-background" />
                    <Button type="button" className="h-10 rounded-xl" onClick={createOption}>{labels.createOption}</Button>
                    <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={() => { setNewOptionOpen(false); setNewOptionName(''); setNewOptionValue(''); setFeedback(''); }}>{labels.cancel}</Button>
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  {optionSets.map((set, setIndex) => (
                    <div key={set.key} className="space-y-3 rounded-xl border bg-muted/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        {renamingIndex === setIndex ? (
                          <div className="flex min-w-0 flex-1 gap-2">
                            <Input value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); finishRename(); } }} className="h-9 rounded-xl" />
                            <Button type="button" size="sm" className="rounded-xl" onClick={finishRename}>{labels.applyRename}</Button>
                            <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => { setRenamingIndex(null); setRenameValue(''); setFeedback(''); }}>{labels.cancel}</Button>
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate font-bold"><bdi>{set.name}</bdi></p>
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-xl px-2" onClick={() => startRename(setIndex)}><Pencil className="me-1 h-3.5 w-3.5" />{labels.rename}</Button>
                          </div>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => { if (typeof window !== 'undefined' && !window.confirm(labels.confirmDeleteOption)) return; applyMatrix(optionSets.filter((_, index) => index !== setIndex)); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {set.values.map((value, valueIndex) => (
                          <span key={`${set.key}-${value}`} className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-semibold">
                            <bdi>{value}</bdi>
                            <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-muted" onClick={() => removeValue(setIndex, valueIndex)} aria-label={`Remove ${value}`}><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input value={set.pendingValue} onChange={event => setOptionSets(current => current.map((item, index) => index === setIndex ? { ...item, pendingValue: event.target.value } : item))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addValue(setIndex); } }} placeholder={labels.optionValue} className="h-10 rounded-xl" />
                        <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => addValue(setIndex)}>{labels.addValue}</Button>
                      </div>
                    </div>
                  ))}
                </div>

                {feedback && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{feedback}</p>}
                {limitReached && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold text-destructive">{labels.combinationLimit}</p>}
              </div>
            )}

            {coverage.expectedCount > 0 && !coverage.complete && form.variants.length > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">{labels.incompleteMatrix}</p>
                  <p className="mt-1 text-xs">{labels.incompleteMatrixCounts(coverage.existingCount, coverage.expectedCount)}</p>
                </div>
                <Button type="button" variant="outline" className="rounded-xl border-amber-300 bg-white" onClick={() => applyMatrix(optionSets)}>{labels.completeMissing}</Button>
              </div>
            )}

            {form.variants.length > 0 && inheritedPrice === '0' && form.variants.some(variant => !variant.price_iqd.trim()) && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">{labels.zeroInheritedPrice}</p>
            )}

            {form.variants.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-bold">{labels.generatedVariants} — {labels.generatedVariantsCount(form.variants.length, coverage.expectedCount)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.generatedVariantsHint}</p>
                  </div>
                  {editing && form.track_inventory && <p className="text-xs text-muted-foreground">{labels.inventoryAfterSave}</p>}
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {form.variants.map((variant, index) => (
                    <VariantCombinationEditor
                      key={variant.key}
                      lang={lang}
                      variant={variant}
                      trackInventory={form.track_inventory}
                      inheritedPrice={inheritedPrice}
                      inheritedCost={inheritedCost}
                      moneyStep={moneyStep}
                      expanded={expanded.has(variant.key)}
                      onToggle={() => setExpanded(current => {
                        const next = new Set(current);
                        if (next.has(variant.key)) next.delete(variant.key);
                        else next.add(variant.key);
                        return next;
                      })}
                      onChange={nextVariant => updateVariant(index, nextVariant)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default CatalogProductDetailsEditor;
