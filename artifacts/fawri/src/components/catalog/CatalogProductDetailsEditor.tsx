import { useMemo, useState } from 'react';
import { Boxes, ChevronDown, Layers3, Plus, Ruler, Trash2 } from 'lucide-react';

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

type BuilderForm = CatalogProductFormState & {
  variant_option_rows?: BulkOptionRow[];
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
    salePrice: 'سعر بيع خاص — اختياري',
    cost: 'كلفة خاصة — اختياري',
    stock: 'المخزون',
    images: 'صورة خاصة — اختياري',
    inheritedSale: (value: string) => `العام: ${value || 'سعر المنتج'}`,
    inheritedCost: (value: string) => `العام: ${value || 'كلفة المنتج'}`,
    inheritedImage: 'بدون صورة خاصة = يستخدم صور المنتج',
    inheritanceTitle: 'البيانات العامة تطبق تلقائيًا',
    inheritanceHint: (price: string, cost: string) => `سعر البيع ${price || '—'} والكلفة ${cost || '—'} وصور المنتج هي الافتراضية لكل التركيبات. اكتب فقط القيمة المختلفة عند الحاجة.`,
    bulkStock: 'كمية لكل تركيبة',
    applyStock: 'تطبيق على الكل',
    generateSku: 'توليد SKU للتركيبات',
    startOptions: 'إضافة خيارات للمنتج',
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
    salePrice: 'نرخی فرۆشتنی تایبەت — ئارەزوومەندانە',
    cost: 'تێچووی تایبەت — ئارەزوومەندانە',
    stock: 'کۆگا',
    images: 'وێنەی تایبەت — ئارەزوومەندانە',
    inheritedSale: (value: string) => `گشتی: ${value || 'نرخی بەرهەم'}`,
    inheritedCost: (value: string) => `گشتی: ${value || 'تێچووی بەرهەم'}`,
    inheritedImage: 'بێ وێنەی تایبەت = وێنەکانی بەرهەم',
    inheritanceTitle: 'داتای گشتی خۆکار جێبەجێ دەبێت',
    inheritanceHint: (price: string, cost: string) => `نرخی ${price || '—'} و تێچووی ${cost || '—'} و وێنەکانی بەرهەم بۆ هەموو تێکەڵەکان بنەڕەتین. تەنها جیاوازییەکان بنووسە.`,
    bulkStock: 'بڕ بۆ هەر تێکەڵە',
    applyStock: 'جێبەجێکردن بۆ هەموو',
    generateSku: 'دروستکردنی SKU بۆ تێکەڵەکان',
    startOptions: 'زیادکردنی هەڵبژاردە',
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
    salePrice: 'Special sale price — optional',
    cost: 'Special cost — optional',
    stock: 'Stock',
    images: 'Special image — optional',
    inheritedSale: (value: string) => `Default: ${value || 'product price'}`,
    inheritedCost: (value: string) => `Default: ${value || 'product cost'}`,
    inheritedImage: 'No special image = use product images',
    inheritanceTitle: 'General data applies automatically',
    inheritanceHint: (price: string, cost: string) => `Sale price ${price || '—'}, cost ${cost || '—'}, and product images are the defaults for every combination. Enter only what is different.`,
    bulkStock: 'Stock per combination',
    applyStock: 'Apply to all',
    generateSku: 'Generate combination SKUs',
    startOptions: 'Add product options',
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

function optionSummary(variant: CatalogVariantDraft): string {
  const values = variant.options
    .filter(option => option.name.trim() && option.value.trim())
    .map(option => option.value.trim());
  return values.join(' / ') || variant.name || '—';
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
  const builderForm = form as BuilderForm;
  const optionRows = builderForm.variant_option_rows ?? rowsFromVariants(form.variants);
  const [feedback, setFeedback] = useState('');
  const [bulkStock, setBulkStock] = useState('');

  const legacy = form.variants.length > 0 && form.variants.some(variant => !catalogVariantDraftHasStructuredOptions(variant));
  const multiEnabled = form.variants.length > 0 || optionRows.length > 0;
  const structuredDefinitions = useMemo(() => optionRows
    .filter(row => row.name.trim() || row.values.trim())
    .map(row => createCatalogVariantOptionSetDraft(row.name, splitValues(row.values))), [optionRows]);
  const combinationCount = useMemo(() => catalogVariantCombinationCount(structuredDefinitions), [structuredDefinitions]);

  if (form.item_type !== 'product') return null;

  const patchOptionRows = (next: BulkOptionRow[]) => {
    onChange({ variant_option_rows: next } as unknown as Partial<CatalogProductFormState>);
  };

  const updateVariant = (index: number, patch: Partial<CatalogVariantDraft>) => {
    onChange({ variants: form.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant) });
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
    patchOptionRows([]);
    setFeedback('');
  };

  const addOptionRow = () => {
    patchOptionRows([...optionRows, { key: nextBulkRowKey(), name: '', values: '' }]);
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
    onChange({
      variants: withSku,
      variant_option_rows: optionRows,
    } as unknown as Partial<CatalogProductFormState>);
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
                          <td className="p-2.5"><Input type="text" inputMode="decimal" dir="ltr" value={variant.price_iqd} onChange={event => updateVariant(index, { price_iqd: event.target.value })} placeholder={labels.inheritedSale(form.current_price)} className="h-10 min-w-36 rounded-xl" /></td>
                          <td className="p-2.5"><Input type="text" inputMode="decimal" dir="ltr" value={variant.cost_iqd} onChange={event => updateVariant(index, { cost_iqd: event.target.value })} placeholder={labels.inheritedCost(form.cost_iqd)} className="h-10 min-w-36 rounded-xl" /></td>
                          {form.track_inventory && <td className="p-2.5"><Input type="text" inputMode="numeric" dir="ltr" value={variant.stock_quantity} onChange={event => updateVariant(index, { stock_quantity: event.target.value })} disabled={Boolean(editing && variant.id)} placeholder={editing && variant.id ? labels.currentInventoryLocked : '0'} className="h-10 w-24 rounded-xl" /></td>}
                          <td className="p-2.5"><Input type="text" dir="ltr" value={variant.sku} onChange={event => updateVariant(index, { sku: event.target.value })} className="h-10 min-w-36 rounded-xl" /></td>
                          <td className="p-2.5"><Input type="text" inputMode="numeric" dir="ltr" value={variant.barcode} onChange={event => updateVariant(index, { barcode: event.target.value })} className="h-10 min-w-36 rounded-xl" /></td>
                          <td className="p-2.5">
                            <div className="min-w-44">
                              <CatalogImageUploadEditor images={variant.image_refs} onChange={image_refs => updateVariant(index, { image_refs })} maxImages={5} compact hideHeading />
                              {variant.image_refs.length === 0 && <p className="mt-1 text-[10px] text-muted-foreground">{labels.inheritedImage}</p>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
