import React, { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload as UploadIcon, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getCurrentMerchant } from '@/lib/store';
import type { Lang, ProductStatus } from '@/lib/types';
import {
  CatalogApiError,
  idempotencyAttemptForRequest,
  importCatalogProducts,
  type CatalogIdempotencyAttempt,
  type CatalogProductInput,
  type CatalogVariantInput,
} from '@/lib/catalogUiApi';
import {
  CatalogPromotionApiError,
  catalogMajorAmountToMinor,
  getCatalogCommerceContext,
} from '@/lib/catalogPromotionUiApi';

type ImportField =
  | 'product_name'
  | 'external_ref'
  | 'sku'
  | 'barcode'
  | 'category'
  | 'description'
  | 'price'
  | 'quantity'
  | 'status'
  | 'allow_fawri_reply'
  | 'color'
  | 'size';

type ImportRow = Record<string, unknown>;
type ImportMapping = Record<ImportField, string>;

type ImportReport = {
  imported: number;
  skipped: number;
};

const importFields: ImportField[] = [
  'product_name',
  'external_ref',
  'sku',
  'barcode',
  'category',
  'description',
  'price',
  'quantity',
  'status',
  'allow_fawri_reply',
  'color',
  'size',
];

const emptyMapping: ImportMapping = {
  product_name: '',
  external_ref: '',
  sku: '',
  barcode: '',
  category: '',
  description: '',
  price: '',
  quantity: '',
  status: '',
  allow_fawri_reply: '',
  color: '',
  size: '',
};

const validStatuses = new Set<ProductStatus>([
  'available',
  'low_stock',
  'out_of_stock',
  'draft',
  'hidden_from_fawri',
]);

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeDigits(value: unknown): string {
  return normalizeCell(value)
    .replace(/[,٬\s]/g, '')
    .replace(/٫/g, '.')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function parseNonNegativeInteger(value: unknown): number | null {
  const normalized = normalizeDigits(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseCatalogPrice(value: unknown, fractionDigits: number): number | null {
  const normalized = normalizeDigits(value);
  if (!normalized) return 0;
  return catalogMajorAmountToMinor(normalized, fractionDigits);
}

function parseBoolean(value: unknown, fallback = true): boolean | null {
  const normalized = normalizeCell(value).toLowerCase();
  if (!normalized) return fallback;
  if (['true', '1', 'yes', 'on', 'نعم', 'بەڵێ'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'لا', 'نەخێر'].includes(normalized)) return false;
  return null;
}

function localText(
  lang: Lang,
  values: { ar: string; ku: string; en: string },
): string {
  return values[lang] || values.en;
}

function rowLabel(lang: Lang, rowNumber: number): string {
  return localText(lang, {
    ar: `الصف ${rowNumber}`,
    ku: `ڕیزی ${rowNumber}`,
    en: `Row ${rowNumber}`,
  });
}

export default function ImportProductsPage() {
  const { t, lang, dir, isRTL } = useI18n();
  const merchant = getCurrentMerchant();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importAttemptRef = useRef<CatalogIdempotencyAttempt | null>(null);

  const [fileData, setFileData] = useState<ImportRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [step, setStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fieldLabels: Record<ImportField, string> = {
    product_name: t.import_field_product_name,
    external_ref: localText(lang, {
      ar: 'المرجع الخارجي',
      ku: 'ناسنامەی دەرەکی',
      en: 'External reference',
    }),
    sku: t.import_field_sku,
    barcode: t.import_field_barcode,
    category: t.import_field_category,
    description: t.products_description,
    price: t.import_field_price,
    quantity: t.import_field_quantity,
    status: t.products_status,
    allow_fawri_reply: t.products_allowFawri,
    color: t.import_field_color,
    size: t.import_field_size,
  };

  const processFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        toast.error(t.import_file_empty);
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
        defval: '',
        raw: false,
      });

      if (rows.length === 0) {
        toast.error(t.import_file_empty);
        return;
      }

      const headers = Object.keys(rows[0]).map(header => header.trim());
      if (headers.length === 0) {
        toast.error(t.import_file_empty);
        return;
      }

      const autoMap: ImportMapping = { ...emptyMapping };
      headers.forEach(header => {
        const normalizedHeader = header.toLowerCase();

        if (
          normalizedHeader.includes('product_name') ||
          normalizedHeader.includes('product name') ||
          normalizedHeader === 'name' ||
          normalizedHeader.includes('اسم المنتج') ||
          normalizedHeader.includes('ناوی کاڵا') ||
          normalizedHeader.includes('ناوی بەرهەم')
        ) {
          autoMap.product_name = header;
        }
        if (
          normalizedHeader.includes('external_ref') ||
          normalizedHeader.includes('external ref') ||
          normalizedHeader === 'code' ||
          normalizedHeader.includes('الكود')
        ) {
          autoMap.external_ref = header;
        }
        if (
          normalizedHeader.includes('sku') ||
          normalizedHeader.includes('رمز') ||
          normalizedHeader.includes('الرقم المخزني')
        ) {
          autoMap.sku = header;
        }
        if (
          normalizedHeader.includes('barcode') ||
          normalizedHeader.includes('باركود') ||
          normalizedHeader.includes('بارکۆد')
        ) {
          autoMap.barcode = header;
        }
        if (
          normalizedHeader.includes('category') ||
          normalizedHeader.includes('فئة') ||
          normalizedHeader.includes('الفئة') ||
          normalizedHeader.includes('القسم') ||
          normalizedHeader.includes('پۆل')
        ) {
          autoMap.category = header;
        }
        if (
          normalizedHeader.includes('description') ||
          normalizedHeader.includes('الوصف') ||
          normalizedHeader.includes('وەسف')
        ) {
          autoMap.description = header;
        }
        if (
          normalizedHeader.includes('price') ||
          normalizedHeader.includes('سعر') ||
          normalizedHeader.includes('نرخ')
        ) {
          autoMap.price = header;
        }
        if (
          normalizedHeader.includes('quantity') ||
          normalizedHeader.includes('qty') ||
          normalizedHeader.includes('كمية') ||
          normalizedHeader.includes('الكمية') ||
          normalizedHeader.includes('بڕ')
        ) {
          autoMap.quantity = header;
        }
        if (
          normalizedHeader === 'status' ||
          normalizedHeader.includes('الحالة') ||
          normalizedHeader.includes('دۆخ')
        ) {
          autoMap.status = header;
        }
        if (
          normalizedHeader.includes('allow_fawri_reply') ||
          normalizedHeader.includes('allow fawri') ||
          normalizedHeader.includes('fawri reply')
        ) {
          autoMap.allow_fawri_reply = header;
        }
        if (
          normalizedHeader.includes('color') ||
          normalizedHeader.includes('لون') ||
          normalizedHeader.includes('اللون') ||
          normalizedHeader.includes('ڕەنگ')
        ) {
          autoMap.color = header;
        }
        if (
          normalizedHeader.includes('size') ||
          normalizedHeader.includes('حجم') ||
          normalizedHeader.includes('مقاس') ||
          normalizedHeader.includes('المقاس') ||
          normalizedHeader.includes('قەبارە')
        ) {
          autoMap.size = header;
        }
      });

      importAttemptRef.current = null;
      setColumns(headers);
      setFileData(rows);
      setMapping(autoMap);
      setReport(null);
      setValidationErrors([]);
      setStep(2);
    } catch (error) {
      console.error('Import file read failed:', error);
      toast.error(t.import_file_read_error);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      toast.error(t.import_file_read_error);
      return;
    }
    await processFile(file);
  };

  const validateAndBuildImport = (fractionDigits: number): {
    products: CatalogProductInput[];
    errors: string[];
  } => {
    const products: CatalogProductInput[] = [];
    const errors: string[] = [];

    if (!mapping.product_name) {
      errors.push(
        localText(lang, {
          ar: 'يجب ربط عمود اسم المنتج.',
          ku: 'دەبێت ستوونی ناوی بەرهەم دیاری بکرێت.',
          en: 'Product name must be mapped.',
        }),
      );
      return { products, errors };
    }

    fileData.forEach((row, index) => {
      const rowNumber = index + 2;
      const label = rowLabel(lang, rowNumber);
      const name = normalizeCell(row[mapping.product_name]);
      const externalRef = mapping.external_ref
        ? normalizeCell(row[mapping.external_ref])
        : '';
      const sku = mapping.sku ? normalizeCell(row[mapping.sku]) : '';
      const barcode = mapping.barcode ? normalizeCell(row[mapping.barcode]) : '';
      const category = mapping.category
        ? normalizeCell(row[mapping.category])
        : '';
      const description = mapping.description
        ? normalizeCell(row[mapping.description])
        : '';
      const price = mapping.price
        ? parseCatalogPrice(row[mapping.price], fractionDigits)
        : 0;
      const quantity = mapping.quantity
        ? parseNonNegativeInteger(row[mapping.quantity])
        : 0;
      const color = mapping.color ? normalizeCell(row[mapping.color]) : '';
      const size = mapping.size ? normalizeCell(row[mapping.size]) : '';
      const requestedStatus = mapping.status
        ? normalizeCell(row[mapping.status])
        : '';
      const allowFawriReply = mapping.allow_fawri_reply
        ? parseBoolean(row[mapping.allow_fawri_reply], true)
        : true;

      if (!name) {
        errors.push(
          `${label}: ${localText(lang, {
            ar: 'اسم المنتج مطلوب.',
            ku: 'ناوی بەرهەم پێویستە.',
            en: 'product name is required.',
          })}`,
        );
      }
      if (!externalRef && !sku && !barcode) {
        errors.push(
          `${label}: ${localText(lang, {
            ar: 'يجب توفير مرجع خارجي أو SKU أو باركود.',
            ku: 'دەبێت ناسنامەی دەرەکی یان SKU یان بارکۆد هەبێت.',
            en: 'external reference, SKU, or barcode is required.',
          })}`,
        );
      }
      if (price === null) {
        errors.push(
          `${label}: ${localText(lang, {
            ar: 'السعر يجب أن يكون مبلغًا صالحًا غير سالب بعملة المتجر.',
            ku: 'نرخ دەبێت بڕێکی دروست و نەفی نەبێت بە دراوی فرۆشگا.',
            en: 'price must be a valid non-negative amount in the store currency.',
          })}`,
        );
      }
      if (quantity === null) {
        errors.push(
          `${label}: ${localText(lang, {
            ar: 'الكمية يجب أن تكون رقمًا صحيحًا غير سالب.',
            ku: 'بڕ دەبێت ژمارەیەکی تەواو و نەفی نەبێت.',
            en: 'quantity must be a non-negative integer.',
          })}`,
        );
      }
      if (requestedStatus && !validStatuses.has(requestedStatus as ProductStatus)) {
        errors.push(
          `${label}: ${localText(lang, {
            ar: 'حالة المنتج غير صالحة.',
            ku: 'دۆخی بەرهەم دروست نییە.',
            en: 'product status is invalid.',
          })}`,
        );
      }
      if (allowFawriReply === null) {
        errors.push(
          `${label}: ${localText(lang, {
            ar: 'قيمة السماح برد فوري يجب أن تكون نعم/لا.',
            ku: 'بەهای وەڵامی فەوری دەبێت بەڵێ/نەخێر بێت.',
            en: 'allow Fawri reply must be a boolean value.',
          })}`,
        );
      }

      if (
        !name ||
        (!externalRef && !sku && !barcode) ||
        price === null ||
        quantity === null ||
        (requestedStatus && !validStatuses.has(requestedStatus as ProductStatus)) ||
        allowFawriReply === null
      ) {
        return;
      }

      const variants: CatalogVariantInput[] =
        color || size
          ? [
              {
                name: [color, size].filter(Boolean).join(' / '),
                stock_quantity: quantity,
                options: {
                  ...(color ? { Color: color } : {}),
                  ...(size ? { Size: size } : {}),
                },
                image_refs: [],
              },
            ]
          : [];

      const status = requestedStatus
        ? (requestedStatus as ProductStatus)
        : quantity > 0
          ? 'available'
          : 'out_of_stock';

      products.push({
        ...(externalRef ? { external_ref: externalRef } : {}),
        name,
        ...(description ? { description } : {}),
        ...(category ? { category } : {}),
        ...(sku ? { sku } : {}),
        ...(barcode ? { barcode } : {}),
        price_iqd: price,
        ...(variants.length === 0 ? { stock_quantity: quantity } : {}),
        status,
        allow_fawri_reply: allowFawriReply,
        variants,
        image_refs: [],
      } as CatalogProductInput);
    });

    return { products, errors };
  };

  const handleImport = async () => {
    if (!merchant || isImporting) return;

    setValidationErrors([]);
    setIsImporting(true);
    try {
      const context = await getCatalogCommerceContext();
      const { products, errors } = validateAndBuildImport(
        context.currency_fraction_digits,
      );
      if (errors.length > 0) {
        setValidationErrors(errors);
        toast.error(
          localText(lang, {
            ar: 'لم يتم الاستيراد. صحح الأخطاء المعروضة أولًا.',
            ku: 'هاوردەکردن نەکرا. سەرەتا هەڵە پیشاندراوەکان چاک بکە.',
            en: 'Nothing was imported. Fix the displayed errors first.',
          }),
        );
        return;
      }
      if (products.length === 0) {
        setValidationErrors([
          localText(lang, {
            ar: 'لا توجد منتجات صالحة للاستيراد.',
            ku: 'هیچ بەرهەمێکی دروست بۆ هاوردەکردن نییە.',
            en: 'There are no valid products to import.',
          }),
        ]);
        return;
      }

      const attempt = idempotencyAttemptForRequest(
        importAttemptRef.current,
        'catalog-import',
        { products },
      );
      importAttemptRef.current = attempt;

      const created = await importCatalogProducts(products, attempt.key);
      importAttemptRef.current = null;
      setReport({ imported: created.length, skipped: 0 });
      setStep(3);
      toast.success(`${t.import_success_message}: ${created.length}`);
    } catch (error) {
      console.error('Canonical catalog import failed:', error);
      const serverError =
        error instanceof CatalogApiError || error instanceof CatalogPromotionApiError
          ? `${error.code}: ${error.message}`
          : localText(lang, {
              ar: 'فشل طلب الاستيراد إلى الخادم.',
              ku: 'داواکاری هاوردەکردن بۆ سێرڤەر سەرکەوتوو نەبوو.',
              en: 'The server import request failed.',
            });
      setValidationErrors([serverError]);
      toast.error(
        localText(lang, {
          ar: 'لم يتم حفظ أي صف لأن الاستيراد فشل.',
          ku: 'هیچ ڕیزێک پاشەکەوت نەکرا چونکە هاوردەکردن شکستی هێنا.',
          en: 'No rows were saved because the import failed.',
        }),
      );
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        product_name: 'Test Product',
        external_ref: 'EXT-001',
        sku: 'TST-001',
        barcode: '123456',
        category: 'General',
        description: 'Example product',
        price: 10000,
        quantity: 10,
        status: 'available',
        allow_fawri_reply: 'true',
        color: 'Red',
        size: 'M',
      },
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'fawri_products_template.xlsx');
  };

  const resetImport = () => {
    importAttemptRef.current = null;
    setFileData([]);
    setColumns([]);
    setMapping(emptyMapping);
    setReport(null);
    setValidationErrors([]);
    setIsDragging(false);
    setIsImporting(false);
    setStep(1);
  };

  if (!merchant) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir={dir}>
      <h1 className="text-2xl font-bold">{t.import_title}</h1>

      <div className="mb-8 flex gap-4">
        <div
          className={`flex-1 rounded-xl border p-4 ${
            step >= 1
              ? 'border-primary bg-primary/10 text-primary'
              : 'bg-card text-muted-foreground'
          }`}
        >
          1. {t.upload_file}
        </div>
        <div
          className={`flex-1 rounded-xl border p-4 ${
            step >= 2
              ? 'border-primary bg-primary/10 text-primary'
              : 'bg-card text-muted-foreground'
          }`}
        >
          2. {t.col_map}
        </div>
        <div
          className={`flex-1 rounded-xl border p-4 ${
            step >= 3
              ? 'border-primary bg-primary/10 text-primary'
              : 'bg-card text-muted-foreground'
          }`}
        >
          3. {t.import_finish}
        </div>
      </div>

      {step === 1 && (
        <div
          className={`flex flex-col items-center rounded-xl border border-dashed p-12 text-center transition-colors ${
            isDragging
              ? 'border-orange-500 bg-orange-50/50'
              : 'border-border bg-card'
          }`}
          onDragEnter={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={event => {
            event.preventDefault();
            if (event.currentTarget === event.target) setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <UploadIcon className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">{t.import_drag_drop}</h3>
          <p className="mb-6 text-muted-foreground">{t.import_supported_formats}</p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />

          <div className="flex flex-wrap justify-center gap-4">
            <Button
              type="button"
              className="rounded-xl px-8"
              onClick={() => fileInputRef.current?.click()}
            >
              {t.upload_file}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="rounded-xl px-8"
              onClick={downloadTemplate}
            >
              <Download className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />
              {t.download_template}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="mb-2 text-lg font-medium">{t.col_map}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {localText(lang, {
                ar: 'اسم المنتج مطلوب، وكل صف يجب أن يحتوي على مرجع خارجي أو SKU أو باركود.',
                ku: 'ناوی بەرهەم پێویستە و هەر ڕیزێک دەبێت ناسنامەی دەرەکی یان SKU یان بارکۆدی هەبێت.',
                en: 'Product name is required, and every row must have an external reference, SKU, or barcode.',
              })}
            </p>

            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {importFields.map(field => (
                <div key={field} className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    {fieldLabels[field]}
                    {field === 'product_name' && ' *'}
                  </label>

                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={mapping[field]}
                    onChange={event => {
                      importAttemptRef.current = null;
                      setValidationErrors([]);
                      setMapping(current => ({
                        ...current,
                        [field]: event.target.value,
                      }));
                    }}
                  >
                    <option value="">-- {t.import_ignore} --</option>
                    {columns.map(column => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {validationErrors.length > 0 && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  {localText(lang, {
                    ar: 'أخطاء الاستيراد',
                    ku: 'هەڵەکانی هاوردەکردن',
                    en: 'Import errors',
                  })}
                </div>
                <ul className="list-disc space-y-1 px-5 text-sm">
                  {validationErrors.slice(0, 20).map((error, index) => (
                    <li key={`${error}-${index}`}>{error}</li>
                  ))}
                </ul>
                {validationErrors.length > 20 && (
                  <p className="mt-2 text-xs">
                    +{validationErrors.length - 20}{' '}
                    {localText(lang, {
                      ar: 'أخطاء إضافية',
                      ku: 'هەڵەی زیاتر',
                      en: 'more errors',
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={resetImport}>
                {t.import_back}
              </Button>
              <Button
                type="button"
                onClick={() => void handleImport()}
                disabled={isImporting}
              >
                {isImporting ? t.products_saving : t.import}
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b p-4 font-medium">
              {t.preview} ({t.import_preview_first_rows})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {importFields.map(field => (
                      <th key={field} className="px-4 py-2 text-start">
                        {fieldLabels[field]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fileData.slice(0, 3).map((row, index) => (
                    <tr key={index} className="border-t">
                      {importFields.map(field => (
                        <td key={field} className="whitespace-nowrap px-4 py-2">
                          {mapping[field]
                            ? normalizeCell(row[mapping[field]]) || '-'
                            : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 3 && report && (
        <div className="flex flex-col items-center rounded-xl border bg-card p-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h3 className="mb-6 text-2xl font-bold">{t.import_completed_title}</h3>

          <div className="mb-8 grid w-full max-w-sm grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{report.imported}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t.imported}</div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{report.skipped}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t.skipped}</div>
            </div>
          </div>

          <p className="mb-6 text-sm text-muted-foreground">
            {localText(lang, {
              ar: 'الاستيراد ذري: إذا فشل أي صف فلن يُحفظ أي صف.',
              ku: 'هاوردەکردن یەکپارچەیە: ئەگەر هەر ڕیزێک شکستی هێنا هیچ ڕیزێک پاشەکەوت ناکرێت.',
              en: 'Import is atomic: if any row fails, no rows are saved.',
            })}
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Button type="button" onClick={resetImport}>
              {t.import_another_file}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/products">{t.import_go_to_products}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
