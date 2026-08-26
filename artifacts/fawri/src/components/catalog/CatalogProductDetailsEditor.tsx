import { useMemo, useState } from 'react';
import { Boxes, ChevronDown, Plus, Ruler, Shirt, Trash2, WandSparkles } from 'lucide-react';

import { CatalogImageUploadEditor } from '@/components/catalog/CatalogImageUploadEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CatalogProductFormState, CatalogVariantDraft } from '@/lib/catalogProductEditor';
import {
  catalogVariantCombinationCount,
  catalogVariantDraftHasStructuredOptions,
  catalogVariantOptionSetDefinitionsAreValid,
  catalogVariantOptionSetsFromVariants,
  createCatalogVariantOptionSetDraft,
  regenerateCatalogVariantDrafts,
  type CatalogVariantOptionSetDraft,
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

const copy = {
  ar: {
    quantity: 'الكمية',
    inventoryAfterSave: 'مخزون التركيبات المحفوظة يُعدّل من أدوات المخزون بعد الحفظ حتى تبقى الحركة مسجلة.',
    baseData: 'بيانات المنتج',
    reportingCost: 'تكلفة المنتج',
    reportingCostHint: 'اختياري، للتقارير وحساب الربح فقط ولا يظهر للعميل.',
    sku: 'SKU',
    barcode: 'الباركود',
    variants: 'الألوان والمقاسات والمتغيرات',
    variantsHint: 'اكتب كل الخيارات في قائمة واحدة، ثم أنشئ التركيبات مرة واحدة. مثال: اللون = أسود، أبيض والمقاس = S، M، L.',
    clothingSetup: 'إعداد سريع للملابس',
    addOption: 'إضافة حقل',
    optionName: 'اسم الحقل',
    optionNamePlaceholder: 'مثال: اللون أو المقاس',
    optionValues: 'القيم',
    optionValuesPlaceholder: 'مثال: أسود، أبيض، أحمر',
    valuesHint: 'افصل القيم بفاصلة عربية أو إنجليزية.',
    generate: 'إنشاء / تحديث التركيبات',
    combinations: 'التركيبات',
    combination: 'التركيبة',
    salePrice: 'سعر خاص',
    cost: 'كلفة خاصة',
    stock: 'المخزون',
    images: 'الصور',
    inheritedSale: (value: string) => `يرث ${value || 'سعر المنتج'}`,
    inheritedCost: (value: string) => `يرث ${value || 'كلفة المنتج'}`,
    bulkStock: 'كمية لكل تركيبة',
    applyStock: 'تطبيق على الكل',
    generateSku: 'توليد SKU للتركيبات',
    noVariants: 'لا توجد تركيبات بعد. أضف اللون أو المقاس أو أي خيار آخر ثم اضغط إنشاء التركيبات.',
    invalidOptions: 'أدخل اسمًا وقيمة واحدة على الأقل لكل حقل، ولا تكرر أسماء الحقول.',
    tooMany: 'عدد التركيبات أكبر من 100. قلل عدد القيم.',
    legacy: 'هذا المنتج يحتوي متغيرات قديمة بلا خيارات منظمة. أبقيناها في جدول حتى لا نفقد أي بيانات.',
    name: 'الاسم',
    advanced: 'الشحن والقياسات',
    advancedHint: 'هذه قياسات الشحن الفيزيائية وليست مقاسات الملابس. اتركها فارغة إن لم تحتجها.',
    weight: 'الوزن (كغم)',
    length: 'الطول (سم)',
    width: 'العرض (سم)',
    height: 'الارتفاع (سم)',
    currentInventoryLocked: 'بعد الحفظ',
  },
  ku: {
    quantity: 'بڕ',
    inventoryAfterSave: 'کۆگای تێکەڵە پاشەکەوتکراوەکان دوای پاشەکەوتکردن لە ئامرازەکانی کۆگا بگۆڕە.',
    baseData: 'داتای بەرهەم',
    reportingCost: 'تێچووی بەرهەم',
    reportingCostHint: 'ئارەزوومەندانە، تەنها بۆ ڕاپۆرت و قازانجە و بە کڕیار پیشان نادرێت.',
    sku: 'SKU',
    barcode: 'بارکۆد',
    variants: 'ڕەنگ و قەبارە و جۆراوجۆری',
    variantsHint: 'هەموو هەڵبژاردەکان لە یەک لیست بنووسە و پاشان تێکەڵەکان یەکجار دروست بکە.',
    clothingSetup: 'ڕێکخستنی خێرا بۆ جل',
    addOption: 'زیادکردنی خانە',
    optionName: 'ناوی خانە',
    optionNamePlaceholder: 'نموونە: ڕەنگ یان قەبارە',
    optionValues: 'بەهاکان',
    optionValuesPlaceholder: 'نموونە: ڕەش، سپی، سور',
    valuesHint: 'بەهاکان بە کۆما جیا بکەوە.',
    generate: 'دروستکردن / نوێکردنەوەی تێکەڵەکان',
    combinations: 'تێکەڵەکان',
    combination: 'تێکەڵە',
    salePrice: 'نرخی تایبەت',
    cost: 'تێچووی تایبەت',
    stock: 'کۆگا',
    images: 'وێنەکان',
    inheritedSale: (value: string) => `نرخی بەرهەم ${value || ''}`,
    inheritedCost: (value: string) => `تێچووی بەرهەم ${value || ''}`,
    bulkStock: 'بڕ بۆ هەر تێکەڵە',
    applyStock: 'جێبەجێکردن بۆ هەموو',
    generateSku: 'دروستکردنی SKU بۆ تێکەڵەکان',
    noVariants: 'هێشتا هیچ تێکەڵەیەک نییە. ڕەنگ یان قەبارە زیاد بکە و تێکەڵەکان دروست بکە.',
    invalidOptions: 'بۆ هەر خانە ناو و لانیکەم یەک بەها بنووسە و ناوەکان دووبارە مەکە.',
    tooMany: 'ژمارەی تێکەڵەکان لە 100 زیاترە.',
    legacy: 'ئەم بەرهەمە جۆراوجۆری کۆنی هەیە. بۆ پاراستنی داتا لە خشتەکە ماوەتەوە.',
    name: 'ناو',
    advanced: 'گەیاندن و پێوانەکان',
    advancedHint: 'ئەمە پێوانە فیزیکییەکانی گەیاندنن، نە قەبارەی جل.',
    weight: 'کێش (کگم)',
    length: 'درێژی (سم)',
    width: 'پانی (سم)',
    height: 'بەرزی (سم)',
    currentInventoryLocked: 'دوای پاشەکەوتکردن',
  },
  en: {
    quantity: 'Quantity',
    inventoryAfterSave: 'Saved variant inventory is adjusted from inventory tools after save so every movement stays auditable.',
    baseData: 'Product data',
    reportingCost: 'Product cost',
    reportingCostHint: 'Optional, merchant-only reporting cost used for profit calculations.',
    sku: 'SKU',
    barcode: 'Barcode',
    variants: 'Colors, sizes & variants',
    variantsHint: 'Define all options in one list, then generate combinations once. Example: Color = Black, White and Size = S, M, L.',
    clothingSetup: 'Quick clothing setup',
    addOption: 'Add field',
    optionName: 'Field name',
    optionNamePlaceholder: 'e.g. Color or Size',
    optionValues: 'Values',
    optionValuesPlaceholder: 'e.g. Black, White, Red',
    valuesHint: 'Separate values with commas.',
    generate: 'Generate / update combinations',
    combinations: 'Combinations',
    combination: 'Combination',
    salePrice: 'Special price',
    cost: 'Special cost',
    stock: 'Stock',
    images: 'Images',
    inheritedSale: (value: string) => `inherits ${value || 'product price'}`,
    inheritedCost: (value: string) => `inherits ${value || 'product cost'}`,
    bulkStock: 'Stock per combination',
    applyStock: 'Apply to all',
    generateSku: 'Generate variant SKUs',
    noVariants: 'No combinations yet. Add color, size, or another option and generate combinations.',
    invalidOptions: 'Give every field a name and at least one value, with no duplicate field names.',
    tooMany: 'More than 100 combinations. Reduce the number of values.',
    legacy: 'This product contains legacy variants without structured options. They remain editable in the table to avoid data loss.',
    name: 'Name',
    advanced: 'Shipping & measurements',
    advancedHint: 'These are physical shipping measurements, not clothing sizes. Leave them blank unless needed.',
    weight: 'Weight (kg)',
    length: 'Length (cm)',
    width: 'Width (cm)',
    height: 'Height (cm)',
    currentInventoryLocked: 'after save',
  },
} as const;

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

function optionSummary(variant: CatalogVariantDraft): string {
  const values = variant.options.filter(option => option.name.trim() && option.value.trim()).map(option => option.value.trim());
  return values.join(' / ') || variant.name || '—';
}

function cleanSkuPrefix(value: string): string {
  return value.trim().normalize('NFKC').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'FWR';
}

function Measurements({
  labels,
  form,
  onChange,
}: {
  labels: typeof copy.ar;
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
        <label className="space-y-1 text-xs font-semibold"><span>{labels.weight}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.weight_kg} onChange={e => onChange({ weight_kg: e.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>{labels.length}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.length_cm} onChange={e => onChange({ length_cm: e.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>{labels.width}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.width_cm} onChange={e => onChange({ width_cm: e.target.value })} className="h-10 rounded-xl" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>{labels.height}</span><Input type="text" inputMode="decimal" dir="ltr" value={form.height_cm} onChange={e => onChange({ height_cm: e.target.value })} className="h-10 rounded-xl" /></label>
      </div>
    </details>
  );
}

export function CatalogProductDetailsEditor({
  lang,
  form,
  editing,
  moneyStep: _moneyStep,
  onChange,
}: {
  lang: Lang;
  form: CatalogProductFormState;
  editing: boolean;
  moneyStep: string;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  const labels = copy[lang] || copy.en;
  const [optionRows, setOptionRows] = useState<BulkOptionRow[]>(() => rowsFromVariants(form.variants));
  const [feedback, setFeedback] = useState('');
  const [bulkStock, setBulkStock] = useState('');

  const legacy = form.variants.length > 0 && form.variants.some(variant => !catalogVariantDraftHasStructuredOptions(variant));
  const structuredDefinitions = useMemo(() => optionRows
    .filter(row => row.name.trim() || row.values.trim())
    .map(row => createCatalogVariantOptionSetDraft(row.name, splitValues(row.values))), [optionRows]);
  const combinationCount = useMemo(() => catalogVariantCombinationCount(structuredDefinitions), [structuredDefinitions]);

  if (form.item_type !== 'product') return null;

  const updateVariant = (index: number, patch: Partial<CatalogVariantDraft>) => {
    onChange({ variants: form.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant) });
  };

  const addOptionRow = () => setOptionRows(current => [...current, { key: nextBulkRowKey(), name: '', values: '' }]);

  const quickClothing = () => {
    if (legacy) return;
    const colorName = lang === 'ar' ? 'اللون' : lang === 'ku' ? 'ڕەنگ' : 'Color';
    const sizeName = lang === 'ar' ? 'المقاس' : lang === 'ku' ? 'قەبارە' : 'Size';
    setOptionRows(current => {
      const names = new Set(current.map(row => row.name.trim().toLocaleLowerCase('en-US')));
      const next = [...current];
      if (!names.has(colorName.toLocaleLowerCase('en-US'))) next.push({ key: nextBulkRowKey(), name: colorName, values: '' });
      if (!names.has(sizeName.toLocaleLowerCase('en-US'))) next.push({ key: nextBulkRowKey(), name: sizeName, values: '' });
      return next;
    });
    setFeedback('');
  };

  const generate = () => {
    if (legacy) return;
    if (structuredDefinitions.length === 0 || !catalogVariantOptionSetDefinitionsAreValid(structuredDefinitions)) {
      setFeedback(labels.invalidOptions);
      return;
    }
    const names = structuredDefinitions.map(set => set.name.trim().normalize('NFKC').toLocaleLowerCase('en-US'));
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
    const regenerated = regenerateCatalogVariantDrafts(structuredDefinitions, form.variants, form.track_inventory);
    const prefix = cleanSkuPrefix(form.sku);
    const withSku = regenerated.map((variant, index) => ({
      ...variant,
      sku: variant.sku.trim() || `${prefix}-${String(index + 1).padStart(2, '0')}`,
    }));
    onChange({ variants: withSku });
    setFeedback('');
  };

  const applyBulkStock = () => {
    const value = bulkStock.trim();
    if (!/^\d+$/.test(value)) return;
    onChange({ variants: form.variants.map(variant => variant.id ? variant : { ...variant, stock_quantity: value }) });
  };

  const generateMissingSkus = () => {
    const prefix = cleanSkuPrefix(form.sku);
    onChange({ variants: form.variants.map((variant, index) => ({
      ...variant,
      sku: variant.sku.trim() || `${prefix}-${String(index + 1).padStart(2, '0')}`,
    })) });
  };

  return (
    <div className="space-y-4">
      {form.track_inventory && form.variants.length === 0 && (
        <label className="space-y-1 text-sm font-semibold">
          <span>{labels.quantity}</span>
          <Input type="text" inputMode="numeric" dir="ltr" value={form.quantity} onChange={event => onChange({ quantity: event.target.value })} disabled={editing} className="h-11 rounded-xl" />
          {editing && <span className="block text-xs font-normal text-muted-foreground">{labels.inventoryAfterSave}</span>}
        </label>
      )}

      <section className="space-y-3 rounded-2xl border bg-muted/10 p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><Boxes className="h-4 w-4" />{labels.baseData}</div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold">
            <span>{labels.reportingCost}</span>
            <Input type="text" inputMode="decimal" dir="ltr" value={form.cost_iqd} onChange={event => onChange({ cost_iqd: event.target.value })} placeholder="0" className="h-11 rounded-xl" />
            <span className="block text-xs font-normal leading-5 text-muted-foreground">{labels.reportingCostHint}</span>
          </label>
          <label className="space-y-1 text-sm font-semibold"><span>{labels.sku}</span><Input type="text" dir="ltr" value={form.sku} onChange={event => onChange({ sku: event.target.value })} className="h-11 rounded-xl" /></label>
          <label className="space-y-1 text-sm font-semibold"><span>{labels.barcode}</span><Input type="text" inputMode="numeric" dir="ltr" value={form.barcode} onChange={event => onChange({ barcode: event.target.value })} className="h-11 rounded-xl" /></label>
        </div>
      </section>

      <Measurements labels={labels} form={form} onChange={onChange} />

      <section className="space-y-4 rounded-2xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold"><Shirt className="h-4 w-4" />{labels.variants}</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{labels.variantsHint}</p>
          </div>
          {!legacy && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={quickClothing}><WandSparkles className="me-1 h-4 w-4" />{labels.clothingSetup}</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addOptionRow}><Plus className="me-1 h-4 w-4" />{labels.addOption}</Button>
            </div>
          )}
        </div>

        {legacy ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">{labels.legacy}</p>
        ) : (
          <>
            {optionRows.length === 0 ? (
              <button type="button" onClick={quickClothing} className="w-full rounded-xl border border-dashed bg-background px-4 py-5 text-start text-sm text-muted-foreground hover:border-orange-300">
                {labels.noVariants}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[minmax(9rem,0.8fr)_minmax(14rem,1.8fr)_auto] gap-2 px-1 text-xs font-bold text-muted-foreground md:grid">
                  <span>{labels.optionName}</span><span>{labels.optionValues}</span><span />
                </div>
                {optionRows.map((row, index) => (
                  <div key={row.key} className="grid gap-2 rounded-xl border bg-background p-2 md:grid-cols-[minmax(9rem,0.8fr)_minmax(14rem,1.8fr)_auto]">
                    <Input value={row.name} onChange={event => setOptionRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={labels.optionNamePlaceholder} className="h-10 rounded-xl" />
                    <Input value={row.values} onChange={event => setOptionRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, values: event.target.value } : item))} placeholder={labels.optionValuesPlaceholder} className="h-10 rounded-xl" />
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive" onClick={() => setOptionRows(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">{labels.valuesHint} {combinationCount > 0 ? `${labels.combinations}: ${combinationCount}` : ''}</p>
                  <Button type="button" className="rounded-xl bg-orange-500 text-white hover:bg-orange-600" onClick={generate}>{labels.generate}</Button>
                </div>
                {feedback && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{feedback}</p>}
              </div>
            )}
          </>
        )}

        {form.variants.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-xl border bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold">{labels.combinations} — {form.variants.length}</p>
                {editing && form.track_inventory && <p className="mt-1 text-xs text-muted-foreground">{labels.inventoryAfterSave}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {form.track_inventory && <><Input type="text" inputMode="numeric" dir="ltr" value={bulkStock} onChange={event => setBulkStock(event.target.value)} placeholder={labels.bulkStock} className="h-9 w-40 rounded-xl" /><Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={applyBulkStock}>{labels.applyStock}</Button></>}
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={generateMissingSkus}>{labels.generateSku}</Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border bg-background">
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">{legacy ? labels.name : labels.combination}</th>
                    <th className="p-3 text-start">{labels.salePrice}</th>
                    <th className="p-3 text-start">{labels.cost}</th>
                    {form.track_inventory && <th className="p-3 text-start">{labels.stock}</th>}
                    <th className="p-3 text-start">{labels.sku}</th>
                    <th className="p-3 text-start">{labels.barcode}</th>
                    <th className="p-3 text-start">{labels.images}</th>
                  </tr>
                </thead>
                <tbody>
                  {form.variants.map((variant, index) => (
                    <tr key={variant.key} className="border-t align-top">
                      <td className="p-2.5">
                        {legacy ? <Input value={variant.name} onChange={event => updateVariant(index, { name: event.target.value })} className="h-10 min-w-36 rounded-xl" /> : <div className="min-w-36 rounded-xl bg-muted/30 px-3 py-2.5 font-bold" dir="auto">{optionSummary(variant)}</div>}
                      </td>
                      <td className="p-2.5"><Input type="text" inputMode="decimal" dir="ltr" value={variant.price_iqd} onChange={event => updateVariant(index, { price_iqd: event.target.value })} placeholder={labels.inheritedSale(form.current_price)} className="h-10 min-w-32 rounded-xl" /></td>
                      <td className="p-2.5"><Input type="text" inputMode="decimal" dir="ltr" value={variant.cost_iqd} onChange={event => updateVariant(index, { cost_iqd: event.target.value })} placeholder={labels.inheritedCost(form.cost_iqd)} className="h-10 min-w-32 rounded-xl" /></td>
                      {form.track_inventory && <td className="p-2.5"><Input type="text" inputMode="numeric" dir="ltr" value={variant.stock_quantity} onChange={event => updateVariant(index, { stock_quantity: event.target.value })} disabled={Boolean(editing && variant.id)} placeholder={editing && variant.id ? labels.currentInventoryLocked : '0'} className="h-10 w-24 rounded-xl" /></td>}
                      <td className="p-2.5"><Input type="text" dir="ltr" value={variant.sku} onChange={event => updateVariant(index, { sku: event.target.value })} className="h-10 min-w-36 rounded-xl" /></td>
                      <td className="p-2.5"><Input type="text" inputMode="numeric" dir="ltr" value={variant.barcode} onChange={event => updateVariant(index, { barcode: event.target.value })} className="h-10 min-w-36 rounded-xl" /></td>
                      <td className="p-2.5"><div className="min-w-44"><CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => updateVariant(index, { image_refs })} maxImages={5} compact hideHeading /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default CatalogProductDetailsEditor;
