import { Minus, Plus, Trash2, X } from 'lucide-react';

import { CatalogImageUploadEditor } from '@/components/catalog/CatalogImageUploadEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CatalogProductFormState, CatalogVariantDraft } from '@/lib/catalogProductEditor';
import {
  catalogProductStockIsVariantManaged,
  createEmptyCatalogOptionDraft,
  createEmptyCatalogVariantDraft,
} from '@/lib/catalogProductEditor';
import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import type { Lang } from '@/lib/types';

const copy = {
  ar: {
    quantity: 'الكمية',
    inventoryAfterSave: 'بعد الحفظ، عدّل المخزون من أدوات المخزون حتى تبقى الحركات مسجلة.',
    variantQuantity: 'مخزون هذا المتغير',
    variants: 'المتغيرات',
    variantsHint: 'استخدمها للأحجام أو الألوان أو أي نسخة لها سعر أو مخزون أو صورة مختلفة.',
    addVariant: 'إضافة متغير',
    variantName: 'اسم المتغير',
    variantPrice: 'سعر المتغير (اختياري)',
    options: 'الخيارات',
    addOption: 'إضافة خيار',
    optionName: 'اسم الخيار، مثل اللون',
    optionValue: 'القيمة، مثل أسود',
    physical: 'الشحن / التفاصيل الفيزيائية',
    physicalHint: 'اختياري. تستخدم هذه القيم للشحن ويمكن للمتغير أن يملك قياساته الخاصة.',
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
    variantsHint: 'بۆ قەبارە و ڕەنگ یان هەر وەشانێک بە نرخی یان کۆگای جیاواز بەکاری بهێنە.',
    addVariant: 'زیادکردنی جۆراوجۆری',
    variantName: 'ناوی جۆراوجۆری',
    variantPrice: 'نرخی جۆراوجۆری (ئارەزوومەندانە)',
    options: 'هەڵبژاردەکان',
    addOption: 'زیادکردنی هەڵبژاردە',
    optionName: 'ناوی هەڵبژاردە، وەک ڕەنگ',
    optionValue: 'بەها، وەک ڕەش',
    physical: 'گەیاندن / وردەکاریی فیزیکی',
    physicalHint: 'ئارەزوومەندانە. بۆ گەیاندن بەکاردێت و جۆراوجۆری دەتوانێت پێوانەی خۆی هەبێت.',
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
    variantsHint: 'Use for sizes, colors, or any version with different price, stock, or image.',
    addVariant: 'Add variant',
    variantName: 'Variant name',
    variantPrice: 'Variant price (optional)',
    options: 'Options',
    addOption: 'Add option',
    optionName: 'Option name, e.g. Color',
    optionValue: 'Value, e.g. Black',
    physical: 'Shipping / physical details',
    physicalHint: 'Optional. These values support shipping and can be overridden by each variant.',
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
  value: Pick<CatalogProductFormState, 'weight_kg' | 'length_cm' | 'width_cm' | 'height_cm'>;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
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
          <Input
            inputMode="decimal"
            dir="ltr"
            value={value.length_cm}
            onChange={event => onChange({ length_cm: event.target.value })}
            placeholder={labels.length}
            className="h-10 rounded-xl"
          />
          <Input
            inputMode="decimal"
            dir="ltr"
            value={value.width_cm}
            onChange={event => onChange({ width_cm: event.target.value })}
            placeholder={labels.width}
            className="h-10 rounded-xl"
          />
          <Input
            inputMode="decimal"
            dir="ltr"
            value={value.height_cm}
            onChange={event => onChange({ height_cm: event.target.value })}
            placeholder={labels.height}
            className="h-10 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}

function VariantEditor({
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
        <Input value={variant.name} onChange={event => patch({ name: event.target.value })} placeholder={labels.variantName} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.price_iqd} onChange={event => patch({ price_iqd: event.target.value })} placeholder={labels.variantPrice} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.sku} onChange={event => patch({ sku: event.target.value })} placeholder={COMMON_UI_LABELS.technical.sku} className="h-10 rounded-xl" />
        <Input dir="ltr" value={variant.barcode} onChange={event => patch({ barcode: event.target.value })} placeholder={COMMON_UI_LABELS.technical.barcode} className="h-10 rounded-xl" />
      </div>

      {trackInventory && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.variantQuantity}</span>
          <Input
            type="number"
            min={0}
            dir="ltr"
            value={variant.stock_quantity}
            onChange={event => patch({ stock_quantity: event.target.value })}
            disabled={Boolean(variant.id)}
            className="h-10 rounded-xl"
          />
          {variant.id && <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>}
        </label>
      )}

      <Measurements lang={lang} value={variant} onChange={next => patch(next)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{labels.options}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => patch({ options: [...variant.options, createEmptyCatalogOptionDraft()] })}
          >
            <Plus className="mr-1 h-4 w-4" />
            {labels.addOption}
          </Button>
        </div>
        {variant.options.map((option, optionIndex) => (
          <div key={option.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              value={option.name}
              onChange={event =>
                patch({
                  options: variant.options.map((item, itemIndex) =>
                    itemIndex === optionIndex ? { ...item, name: event.target.value } : item,
                  ),
                })
              }
              placeholder={labels.optionName}
              className="h-10 rounded-xl"
            />
            <Input
              value={option.value}
              onChange={event =>
                patch({
                  options: variant.options.map((item, itemIndex) =>
                    itemIndex === optionIndex ? { ...item, value: event.target.value } : item,
                  ),
                })
              }
              placeholder={labels.optionValue}
              className="h-10 rounded-xl"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() =>
                patch({ options: variant.options.filter((_, itemIndex) => itemIndex !== optionIndex) })
              }
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <CatalogImageUploadEditor
        images={variant.image_refs}
        onChange={image_refs => patch({ image_refs })}
        maxImages={5}
      />
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

  if (form.item_type !== 'product') return null;

  return (
    <div className="space-y-5">
      {form.track_inventory && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.quantity}</span>
          <Input
            type="number"
            min={0}
            dir="ltr"
            value={form.quantity}
            onChange={event => onChange({ quantity: event.target.value })}
            disabled={variantManaged || editing}
            className="h-11 rounded-xl"
          />
          {(variantManaged || editing) && (
            <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>
          )}
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

      <section className="space-y-3 rounded-2xl border bg-muted/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{labels.variants}</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{labels.variantsHint}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => onChange({ variants: [...form.variants, createEmptyCatalogVariantDraft()] })}
          >
            <Plus className="mr-1 h-4 w-4" />
            {labels.addVariant}
          </Button>
        </div>

        {form.variants.map((variant, index) => (
          <VariantEditor
            key={variant.key}
            lang={lang}
            variant={variant}
            index={index}
            trackInventory={form.track_inventory}
            onChange={nextVariant =>
              onChange({
                variants: form.variants.map((item, itemIndex) =>
                  itemIndex === index ? nextVariant : item,
                ),
              })
            }
            onRemove={() =>
              onChange({ variants: form.variants.filter((_, itemIndex) => itemIndex !== index) })
            }
          />
        ))}
      </section>
    </div>
  );
}

export default CatalogProductDetailsEditor;
