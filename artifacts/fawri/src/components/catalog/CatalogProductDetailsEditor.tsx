import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';

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
  catalogVariantOptionSetsFromVariants,
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
    inventoryAfterSave: 'بعد الحفظ، عدّل المخزون من أدوات المخزون حتى تبقى الحركات مسجلة.',
    variantQuantity: 'مخزون هذا المتغير',
    variants: 'المتغيرات',
    variantsHint: 'عرّف الخيارات مرة واحدة، وسيُنشئ فوري كل التركيبات تلقائيًا. بعدها عدّل السعر أو SKU أو المخزون لكل تركيبة عند الحاجة.',
    optionSets: 'خيارات المنتج',
    addOptionSet: 'إضافة خيار',
    optionSetName: 'اسم الخيار، مثل اللون أو المقاس',
    optionValue: 'أضف قيمة، مثل أسود أو M',
    addValue: 'إضافة',
    generatedVariants: 'التركيبات الناتجة',
    generatedVariantsHint: 'السعر الفارغ يرث سعر المنتج. القياسات الفارغة ترث قياسات المنتج.',
    combinationLimit: 'الحد الأقصى 100 تركيبة للمنتج. احذف بعض القيم قبل إضافة قيمة جديدة.',
    variantPrice: 'سعر خاص (اختياري)',
    details: 'تفاصيل إضافية',
    hideDetails: 'إخفاء التفاصيل',
    barcode: 'الباركود',
    legacyVariants: 'هذا المنتج يحتوي متغيرات قديمة بلا خيارات منظمة. ستبقى متاحة للتحرير اليدوي حتى لا نفقد أي بيانات.',
    options: 'الخيارات',
    addOption: 'إضافة خيار',
    optionName: 'اسم الخيار، مثل اللون',
    optionValueLegacy: 'القيمة، مثل أسود',
    physical: 'الشحن / التفاصيل الفيزيائية',
    physicalHint: 'اختياري. اتركها فارغة في المتغير ليستخدم قياسات المنتج الأساسية.',
    weight: 'الوزن (كغم)',
    dimensions: 'الأبعاد (سم)',
    length: 'الطول',
    width: 'العرض',
    height: 'الارتفاع',
  },
  ku: {
    quantity: 'بڕ',
    inventoryAfterSave: 'دوای پاشەکەوتکردن کۆگا لە ئامرازەکانی کۆگا بگۆڕە بۆ پاراستنی تۆماری جوڵەکان.',
    variantQuantity: 'کۆگای ئەم جۆراوجۆرییە',
    variants: 'جۆراوجۆرییەکان',
    variantsHint: 'هەڵبژاردەکان جارێک دیاری بکە؛ فەوری هەموو تێکەڵەکان خۆکار دروست دەکات، پاشان نرخ و SKU و کۆگا بگۆڕە.',
    optionSets: 'هەڵبژاردەکانی بەرهەم',
    addOptionSet: 'زیادکردنی هەڵبژاردە',
    optionSetName: 'ناوی هەڵبژاردە، وەک ڕەنگ یان قەبارە',
    optionValue: 'بەها زیاد بکە، وەک ڕەش یان M',
    addValue: 'زیادکردن',
    generatedVariants: 'تێکەڵە دروستکراوەکان',
    generatedVariantsHint: 'نرخی بەتاڵ نرخی بەرهەم بەکاردێنێت؛ پێوانەی بەتاڵ پێوانەی بەرهەم بەکاردێنێت.',
    combinationLimit: 'زۆرترین ژمارە 100 تێکەڵەیە. هەندێک بەها بسڕەوە.',
    variantPrice: 'نرخی تایبەت (ئارەزوومەندانە)',
    details: 'وردەکاری زیاتر',
    hideDetails: 'شاردنەوەی وردەکاری',
    barcode: 'بارکۆد',
    legacyVariants: 'ئەم بەرهەمە جۆراوجۆریی کۆنی هەیە کە هەڵبژاردەی ڕێکخراوی نییە؛ بۆ پاراستنی داتا بە دەستی دەستکاری دەکرێت.',
    options: 'هەڵبژاردەکان',
    addOption: 'زیادکردنی هەڵبژاردە',
    optionName: 'ناوی هەڵبژاردە، وەک ڕەنگ',
    optionValueLegacy: 'بەها، وەک ڕەش',
    physical: 'گەیاندن / وردەکاریی فیزیکی',
    physicalHint: 'ئارەزوومەندانە. بەتاڵ بهێڵە بۆ بەکارهێنانی پێوانەکانی بەرهەم.',
    weight: 'کێش (کگم)',
    dimensions: 'ڕەهەندەکان (سم)',
    length: 'درێژی',
    width: 'پانی',
    height: 'بەرزی',
  },
  en: {
    quantity: 'Quantity',
    inventoryAfterSave: 'After saving, use inventory controls so every stock movement remains recorded.',
    variantQuantity: 'Variant inventory',
    variants: 'Variants',
    variantsHint: 'Define options once and Fawri will generate every combination. Then override price, SKU, or stock only where needed.',
    optionSets: 'Product options',
    addOptionSet: 'Add option',
    optionSetName: 'Option name, e.g. Color or Size',
    optionValue: 'Add a value, e.g. Black or M',
    addValue: 'Add',
    generatedVariants: 'Generated combinations',
    generatedVariantsHint: 'Blank price inherits the product price. Blank measurements inherit the product measurements.',
    combinationLimit: 'A product can have up to 100 combinations. Remove some values before adding another.',
    variantPrice: 'Custom price (optional)',
    details: 'More details',
    hideDetails: 'Hide details',
    barcode: 'Barcode',
    legacyVariants: 'This product has legacy variants without structured options. They remain manually editable so no data is lost.',
    options: 'Options',
    addOption: 'Add option',
    optionName: 'Option name, e.g. Color',
    optionValueLegacy: 'Value, e.g. Black',
    physical: 'Shipping / physical details',
    physicalHint: 'Optional. Leave variant values blank to inherit the product measurements.',
    weight: 'Weight (kg)',
    dimensions: 'Dimensions (cm)',
    length: 'Length',
    width: 'Width',
    height: 'Height',
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
  return (
    <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
      <div>
        <p className="text-sm font-bold">{labels.physical}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.physicalHint}</p>
      </div>
      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
        <span>{labels.weight}</span>
        <Input
          inputMode="decimal"
          dir="ltr"
          value={value.weight_kg}
          onChange={event => onChange({ weight_kg: event.target.value })}
          placeholder="1.25"
          className="h-10 rounded-xl"
        />
      </label>
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{labels.dimensions}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input inputMode="decimal" dir="ltr" value={value.length_cm} onChange={event => onChange({ length_cm: event.target.value })} placeholder={labels.length} className="h-10 rounded-xl" />
          <Input inputMode="decimal" dir="ltr" value={value.width_cm} onChange={event => onChange({ width_cm: event.target.value })} placeholder={labels.width} className="h-10 rounded-xl" />
          <Input inputMode="decimal" dir="ltr" value={value.height_cm} onChange={event => onChange({ height_cm: event.target.value })} placeholder={labels.height} className="h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function LegacyVariantEditor({
  lang,
  variant,
  index,
  trackInventory,
  onChange,
  onRemove,
}: {
  lang: Lang;
  variant: CatalogVariantDraft;
  index: number;
  trackInventory: boolean;
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={variant.name} onChange={event => patch({ name: event.target.value })} placeholder={labels.variants} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.price_iqd} onChange={event => patch({ price_iqd: event.target.value })} placeholder={labels.variantPrice} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.sku} onChange={event => patch({ sku: event.target.value })} placeholder={COMMON_UI_LABELS.technical.sku} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.barcode} onChange={event => patch({ barcode: event.target.value })} placeholder={labels.barcode} className="h-10 rounded-xl" />
      </div>
      {trackInventory && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.variantQuantity}</span>
          <Input type="number" min={0} dir="ltr" value={variant.stock_quantity} onChange={event => patch({ stock_quantity: event.target.value })} disabled={Boolean(variant.id)} className="h-10 rounded-xl" />
          {variant.id && <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>}
        </label>
      )}
      <Measurements lang={lang} value={variant} onChange={patch} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{labels.options}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => patch({ options: [...variant.options, createEmptyCatalogOptionDraft()] })}>
            <Plus className="mr-1 h-4 w-4" />{labels.addOption}
          </Button>
        </div>
        {variant.options.map((option, optionIndex) => (
          <div key={option.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input value={option.name} onChange={event => patch({ options: variant.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, name: event.target.value } : item) })} placeholder={labels.optionName} className="h-10 rounded-xl" />
            <Input value={option.value} onChange={event => patch({ options: variant.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, value: event.target.value } : item) })} placeholder={labels.optionValueLegacy} className="h-10 rounded-xl" />
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => patch({ options: variant.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => patch({ image_refs })} maxImages={5} />
    </div>
  );
}

function VariantCombinationEditor({
  lang,
  variant,
  trackInventory,
  expanded,
  onToggle,
  onChange,
}: {
  lang: Lang;
  variant: CatalogVariantDraft;
  trackInventory: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (variant: CatalogVariantDraft) => void;
}) {
  const labels = copy[lang] || copy.en;
  const patch = (next: Partial<CatalogVariantDraft>) => onChange({ ...variant, ...next });

  return (
    <div className="rounded-2xl border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{variant.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {variant.options.map(option => `${option.name}: ${option.value}`).join(' · ')}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onToggle}>
          {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
          {expanded ? labels.hideDetails : labels.details}
        </Button>
      </div>

      <div className={`mt-3 grid gap-2 ${trackInventory ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Input dir="ltr" value={variant.price_iqd} onChange={event => patch({ price_iqd: event.target.value })} placeholder={labels.variantPrice} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.sku} onChange={event => patch({ sku: event.target.value })} placeholder={COMMON_UI_LABELS.technical.sku} className="h-10 rounded-xl" />
        {trackInventory && (
          <Input type="number" min={0} dir="ltr" value={variant.stock_quantity} onChange={event => patch({ stock_quantity: event.target.value })} disabled={Boolean(variant.id)} placeholder={labels.variantQuantity} className="h-10 rounded-xl" />
        )}
      </div>
      {variant.id && trackInventory && <p className="mt-2 text-xs text-muted-foreground">{labels.inventoryAfterSave}</p>}

      {expanded && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            <span>{labels.barcode}</span>
            <Input dir="ltr" value={variant.barcode} onChange={event => patch({ barcode: event.target.value })} placeholder="123456789" className="h-10 rounded-xl" />
          </label>
          <Measurements lang={lang} value={variant} onChange={patch} />
          <CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => patch({ image_refs })} maxImages={5} />
        </div>
      )}
    </div>
  );
}

export function CatalogProductDetailsEditor({
  lang,
  form,
  editing,
  onChange,
}: {
  lang: Lang;
  form: CatalogProductFormState;
  editing: boolean;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  const labels = copy[lang] || copy.en;
  const variantManaged = catalogProductStockIsVariantManaged(form);
  const hasLegacyVariants = form.variants.some(variant => !catalogVariantDraftHasStructuredOptions(variant));
  const [optionSets, setOptionSets] = useState<CatalogVariantOptionSetDraft[]>(() =>
    hasLegacyVariants ? [] : catalogVariantOptionSetsFromVariants(form.variants),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [limitReached, setLimitReached] = useState(false);
  const combinationCount = useMemo(() => catalogVariantCombinationCount(optionSets), [optionSets]);

  if (form.item_type !== 'product') return null;

  const updateVariant = (index: number, nextVariant: CatalogVariantDraft) => {
    onChange({
      variants: form.variants.map((item, itemIndex) => itemIndex === index ? nextVariant : item),
    });
  };

  const syncOptionSets = (nextSets: CatalogVariantOptionSetDraft[], clearWhenIncomplete = false) => {
    setOptionSets(nextSets);
    setLimitReached(false);
    if (nextSets.length === 0) {
      onChange({ variants: [] });
      return;
    }
    const count = catalogVariantCombinationCount(nextSets);
    if (count > MAX_VARIANTS) {
      setLimitReached(true);
      return;
    }
    if (count === 0) {
      if (clearWhenIncomplete) onChange({ variants: [] });
      return;
    }
    onChange({ variants: regenerateCatalogVariantDrafts(nextSets, form.variants, form.track_inventory) });
  };

  const addValue = (setIndex: number) => {
    const set = optionSets[setIndex];
    const value = set.pendingValue.trim();
    if (!value || !set.name.trim()) return;
    if (set.values.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setOptionSets(current => current.map((item, index) => index === setIndex ? { ...item, pendingValue: '' } : item));
      return;
    }
    const nextSets = optionSets.map((item, index) => index === setIndex ? { ...item, values: [...item.values, value], pendingValue: '' } : item);
    const nextCount = catalogVariantCombinationCount(nextSets);
    if (nextCount > MAX_VARIANTS) {
      setLimitReached(true);
      return;
    }
    syncOptionSets(nextSets);
  };

  return (
    <div className="space-y-5">
      {form.track_inventory && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.quantity}</span>
          <Input type="number" min={0} dir="ltr" value={form.quantity} onChange={event => onChange({ quantity: event.target.value })} disabled={variantManaged || editing} className="h-11 rounded-xl" />
          {(variantManaged || editing) && <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>}
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          <span>{COMMON_UI_LABELS.technical.sku}</span>
          <Input dir="ltr" value={form.sku} onChange={event => onChange({ sku: event.target.value })} placeholder={COMMON_UI_LABELS.technical.skuExample} className="h-11 rounded-xl" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>{COMMON_UI_LABELS.technical.barcode}</span>
          <Input dir="ltr" value={form.barcode} onChange={event => onChange({ barcode: event.target.value })} placeholder="123456789" className="h-11 rounded-xl" />
        </label>
      </div>

      <Measurements lang={lang} value={form} onChange={onChange} />

      <section className="space-y-4 rounded-2xl border bg-muted/10 p-4">
        <div>
          <p className="text-sm font-bold">{labels.variants}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{labels.variantsHint}</p>
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
                onChange={nextVariant => updateVariant(index, nextVariant)}
                onRemove={() => onChange({ variants: form.variants.filter((_, itemIndex) => itemIndex !== index) })}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-2xl border bg-background p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">{labels.optionSets}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={optionSets.length >= MAX_OPTION_SETS}
                  onClick={() => setOptionSets(current => [...current, createCatalogVariantOptionSetDraft()])}
                >
                  <Plus className="mr-1 h-4 w-4" />{labels.addOptionSet}
                </Button>
              </div>

              {optionSets.map((set, setIndex) => (
                <div key={set.key} className="space-y-3 rounded-xl border bg-muted/10 p-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      value={set.name}
                      onChange={event => {
                        const nextSets = optionSets.map((item, index) => index === setIndex ? { ...item, name: event.target.value } : item);
                        if (set.values.length > 0) syncOptionSets(nextSets);
                        else setOptionSets(nextSets);
                      }}
                      placeholder={labels.optionSetName}
                      className="h-10 rounded-xl"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => syncOptionSets(optionSets.filter((_, index) => index !== setIndex), true)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  {set.values.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {set.values.map((value, valueIndex) => (
                        <span key={`${set.key}-${value}`} className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-semibold">
                          {value}
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              const nextSets = optionSets.map((item, index) => index === setIndex ? { ...item, values: item.values.filter((_, indexValue) => indexValue !== valueIndex) } : item);
                              syncOptionSets(nextSets, true);
                            }}
                            aria-label={`Remove ${value}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={set.pendingValue}
                      onChange={event => setOptionSets(current => current.map((item, index) => index === setIndex ? { ...item, pendingValue: event.target.value } : item))}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addValue(setIndex);
                        }
                      }}
                      placeholder={labels.optionValue}
                      className="h-10 rounded-xl"
                    />
                    <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => addValue(setIndex)}>{labels.addValue}</Button>
                  </div>
                </div>
              ))}

              {limitReached && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs font-semibold text-destructive">{labels.combinationLimit}</p>}
            </div>

            {form.variants.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{labels.generatedVariants} ({combinationCount || form.variants.length})</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.generatedVariantsHint}</p>
                  </div>
                </div>
                {form.variants.map((variant, index) => (
                  <VariantCombinationEditor
                    key={variant.key}
                    lang={lang}
                    variant={variant}
                    trackInventory={form.track_inventory}
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
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default CatalogProductDetailsEditor;
