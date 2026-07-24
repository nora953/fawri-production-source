import React, { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload as UploadIcon, Download, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getCurrentMerchant, getProducts, saveProducts } from '@/lib/store';
import { Product, ProductStatus, ProductVariant } from '@/lib/types';

type ImportField =
  | 'product_name'
  | 'sku'
  | 'barcode'
  | 'category'
  | 'price'
  | 'quantity'
  | 'color'
  | 'size';

type ImportRow = Record<string, unknown>;
type ImportMapping = Record<ImportField, string>;

const importFields: ImportField[] = [
  'product_name',
  'sku',
  'barcode',
  'category',
  'price',
  'quantity',
  'color',
  'size',
];

const emptyMapping: ImportMapping = {
  product_name: '',
  sku: '',
  barcode: '',
  category: '',
  price: '',
  quantity: '',
  color: '',
  size: '',
};

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseNumericCell(value: unknown): number {
  const normalized = normalizeCell(value)
    .replace(/[,\s]/g, '')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function ImportProductsPage() {
  const { t, dir, isRTL } = useI18n();
  const merchant = getCurrentMerchant();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileData, setFileData] = useState<ImportRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [step, setStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [report, setReport] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const fieldLabels: Record<ImportField, string> = {
    product_name: t.import_field_product_name,
    sku: t.import_field_sku,
    barcode: t.import_field_barcode,
    category: t.import_field_category,
    price: t.import_field_price,
    quantity: t.import_field_quantity,
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
          normalizedHeader.includes('name') ||
          normalizedHeader.includes('اسم المنتج') ||
          normalizedHeader.includes('ناوی کاڵا') ||
          normalizedHeader.includes('ناوی بەرهەم')
        ) {
          autoMap.product_name = header;
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

      setColumns(headers);
      setFileData(rows);
      setMapping(autoMap);
      setReport(null);
      setStep(2);
    } catch (error) {
      console.error('Import file read failed:', error);
      toast.error(t.import_file_read_error);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
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

  const handleImport = () => {
    if (!merchant) return;

    if (!mapping.product_name || !mapping.sku) {
      toast.error(t.import_mapping_required);
      return;
    }

    const currentProducts = getProducts(merchant.id);
    const existingSkus = new Set(
      currentProducts
        .map(product => product.sku.trim().toLowerCase())
        .filter(Boolean)
    );

    let importedCount = 0;
    let skippedCount = 0;

    const newProducts: Product[] = [];

    fileData.forEach((row, index) => {
      const name = normalizeCell(row[mapping.product_name]);
      const sku = normalizeCell(row[mapping.sku]);
      const normalizedSku = sku.toLowerCase();

      if (!name || !sku || existingSkus.has(normalizedSku)) {
        skippedCount += 1;
        return;
      }

      const price = mapping.price
        ? parseNumericCell(row[mapping.price])
        : 0;

      const quantity = mapping.quantity
        ? Math.floor(parseNumericCell(row[mapping.quantity]))
        : 0;

      const barcode = mapping.barcode
        ? normalizeCell(row[mapping.barcode])
        : '';

      const category = mapping.category
        ? normalizeCell(row[mapping.category])
        : '';

      const color = mapping.color
        ? normalizeCell(row[mapping.color])
        : '';

      const size = mapping.size
        ? normalizeCell(row[mapping.size])
        : '';

      const variants: ProductVariant[] =
        color || size
          ? [
              {
                color: color || undefined,
                size: size || undefined,
                quantity,
                sku,
              },
            ]
          : [];

      const status: ProductStatus =
        quantity > 0 ? 'available' : 'out_of_stock';

      importedCount += 1;
      existingSkus.add(normalizedSku);

      newProducts.push({
        id: `prod-imp-${Date.now()}-${index}`,
        merchant_id: merchant.id,
        code: `B${1000 + currentProducts.length + importedCount}`,
        name,
        sku,
        barcode,
        category,
        description: '',
        original_price: price,
        current_price: price,
        quantity,
        status,
        allow_fawri_reply: true,
        images: [],
        variants,
        created_at: new Date().toISOString(),
      });
    });

    if (newProducts.length > 0) {
      saveProducts(
        [...currentProducts, ...newProducts],
        merchant.id
      );
    }

    setReport({
      imported: importedCount,
      skipped: skippedCount,
    });

    setStep(3);
    toast.success(`${t.import_success_message}: ${importedCount}`);
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        product_name: 'Test Product',
        sku: 'TST-001',
        barcode: '123456',
        category: 'General',
        price: 10000,
        quantity: 10,
        color: 'Red',
        size: 'M',
      },
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'fawri_products_template.xlsx');
  };

  const resetImport = () => {
    setFileData([]);
    setColumns([]);
    setMapping(emptyMapping);
    setReport(null);
    setIsDragging(false);
    setStep(1);
  };

  return (
    <div
      className="mx-auto max-w-4xl space-y-6"
      dir={dir}
    >
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

            if (event.currentTarget === event.target) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <UploadIcon className="mb-4 h-12 w-12 text-muted-foreground" />

          <h3 className="mb-2 text-lg font-medium">
            {t.import_drag_drop}
          </h3>

          <p className="mb-6 text-muted-foreground">
            {t.import_supported_formats}
          </p>

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
              <Download
                className={
                  isRTL
                    ? 'ml-2 h-4 w-4'
                    : 'mr-2 h-4 w-4'
                }
              />
              {t.download_template}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="mb-4 text-lg font-medium">
              {t.col_map}
            </h3>

            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {importFields.map(field => (
                <div
                  key={field}
                  className="flex flex-col gap-1.5"
                >
                  <label className="text-sm font-medium">
                    {fieldLabels[field]}
                    {(field === 'product_name' || field === 'sku') && ' *'}
                  </label>

                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={mapping[field]}
                    onChange={event =>
                      setMapping(current => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      -- {t.import_ignore} --
                    </option>

                    {columns.map(column => (
                      <option
                        key={column}
                        value={column}
                      >
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={resetImport}
              >
                {t.import_back}
              </Button>

              <Button
                type="button"
                onClick={handleImport}
              >
                {t.import}
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
                      <th
                        key={field}
                        className="px-4 py-2 text-start"
                      >
                        {fieldLabels[field]}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {fileData.slice(0, 3).map((row, index) => (
                    <tr
                      key={index}
                      className="border-t"
                    >
                      {importFields.map(field => (
                        <td
                          key={field}
                          className="whitespace-nowrap px-4 py-2"
                        >
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

          <h3 className="mb-6 text-2xl font-bold">
            {t.import_completed_title}
          </h3>

          <div className="mb-8 grid w-full max-w-sm grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-3xl font-bold text-green-600">
                {report.imported}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t.imported}
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">
                {report.skipped}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t.skipped}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <Button
              type="button"
              onClick={resetImport}
            >
              {t.import_another_file}
            </Button>

            <Button
              type="button"
              variant="outline"
              asChild
            >
              <Link href="/dashboard/products">
                {t.import_go_to_products}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
