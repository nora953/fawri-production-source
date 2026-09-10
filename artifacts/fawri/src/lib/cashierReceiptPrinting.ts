import type {
  CashierPaymentMethod,
  CashierSaleSnapshot,
} from '@/lib/cashierLocalContracts';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

const RECEIPT_SETTINGS_PREFIX = 'fawri.cashier.receipt-print.v1';
const PRINT_FRAME_TIMEOUT_MS = 60_000;

export type CashierReceiptPrintSettings = {
  auto_print: boolean;
};

export const CASHIER_RECEIPT_COPY = {
  ar: {
    receiptTitle: 'إيصال بيع',
    saleReference: 'رقم البيع',
    saleTime: 'الوقت',
    item: 'الصنف',
    quantity: 'الكمية',
    amount: 'المبلغ',
    subtotal: 'المجموع قبل الخصم',
    discount: 'الخصم',
    total: 'الإجمالي',
    paymentMethod: 'طريقة الدفع',
    cashReceived: 'المبلغ المستلم',
    changeDue: 'الباقي للعميل',
    cash: 'نقدي',
    card: 'بطاقة',
    electronic: 'إلكتروني',
    other: 'أخرى',
    thankYou: 'شكرًا لكم',
    printReceipt: 'طباعة الإيصال',
    printShortcut: 'F9',
    autoPrintOn: 'الطباعة التلقائية: مفعلة',
    autoPrintOff: 'الطباعة التلقائية: متوقفة',
    autoPrintHint: 'في نسخة المتصفح تفتح نافذة الطباعة تلقائيًا بعد نجاح البيع. الطباعة الصامتة المباشرة تحتاج تكامل جهاز/وضع Kiosk.',
    printFailed: 'تم البيع، لكن تعذر فتح طباعة الإيصال. يمكنك المحاولة من زر طباعة الإيصال.',
    settingsUnavailable: 'تعذر حفظ إعداد الطباعة التلقائية على هذا الجهاز.',
  },
  ku: {
    receiptTitle: 'پسوڵەی فرۆشتن',
    saleReference: 'ژمارەی فرۆشتن',
    saleTime: 'کات',
    item: 'کاڵا',
    quantity: 'بڕ',
    amount: 'بڕی پارە',
    subtotal: 'کۆی پێش داشکاندن',
    discount: 'داشکاندن',
    total: 'کۆی گشتی',
    paymentMethod: 'شێوازی پارەدان',
    cashReceived: 'پارەی وەرگیراو',
    changeDue: 'پارەی گەڕاوە',
    cash: 'نەقد',
    card: 'کارت',
    electronic: 'ئەلیکترۆنی',
    other: 'هی تر',
    thankYou: 'سوپاس',
    printReceipt: 'چاپی پسوڵە',
    printShortcut: 'F9',
    autoPrintOn: 'چاپی خۆکار: چالاکە',
    autoPrintOff: 'چاپی خۆکار: ناچالاکە',
    autoPrintHint: 'لە وەشانی وێبدا دوای فرۆشتنی سەرکەوتوو پەنجەرەی چاپ خۆکارانە دەکرێتەوە. چاپی بێ پەنجەرە پێویستی بە Kiosk یان پەیوەندی چاپکەر هەیە.',
    printFailed: 'فرۆشتن تەواو بوو، بەڵام چاپی پسوڵە نەکرایەوە. دەتوانیت دووبارە هەوڵ بدەیت.',
    settingsUnavailable: 'نەتوانرا ڕێکخستنی چاپی خۆکار لەم ئامێرە پاشەکەوت بکرێت.',
  },
  en: {
    receiptTitle: 'Sales receipt',
    saleReference: 'Sale reference',
    saleTime: 'Time',
    item: 'Item',
    quantity: 'Qty',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
    paymentMethod: 'Payment method',
    cashReceived: 'Cash received',
    changeDue: 'Change due',
    cash: 'Cash',
    card: 'Card',
    electronic: 'Electronic',
    other: 'Other',
    thankYou: 'Thank you',
    printReceipt: 'Print receipt',
    printShortcut: 'F9',
    autoPrintOn: 'Auto print: On',
    autoPrintOff: 'Auto print: Off',
    autoPrintHint: 'In the browser build, the print dialog opens automatically after a successful sale. Silent direct printing requires kiosk mode or a local printer bridge.',
    printFailed: 'The sale completed, but receipt printing could not be opened. You can retry with Print receipt.',
    settingsUnavailable: 'Auto-print settings could not be saved on this device.',
  },
} as const;

function storageKey(deviceId: string): string {
  return `${RECEIPT_SETTINGS_PREFIX}.${encodeURIComponent(String(deviceId || 'unknown'))}`;
}

export function readCashierReceiptPrintSettings(
  deviceId: string,
): CashierReceiptPrintSettings {
  if (typeof localStorage === 'undefined') return { auto_print: false };
  try {
    const raw = localStorage.getItem(storageKey(deviceId));
    if (!raw) return { auto_print: false };
    const parsed = JSON.parse(raw) as Partial<CashierReceiptPrintSettings>;
    return { auto_print: parsed.auto_print === true };
  } catch {
    return { auto_print: false };
  }
}

export function writeCashierReceiptPrintSettings(
  deviceId: string,
  settings: CashierReceiptPrintSettings,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(
      storageKey(deviceId),
      JSON.stringify({ auto_print: settings.auto_print === true }),
    );
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function receiptLocale(lang: Lang): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'ku') return 'ckb-IQ';
  return 'ar-IQ';
}

function formatReceiptDate(value: string, lang: Lang): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return escapeHtml(value);
  try {
    return new Intl.DateTimeFormat(receiptLocale(lang), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function paymentMethodLabel(method: CashierPaymentMethod, lang: Lang): string {
  return CASHIER_RECEIPT_COPY[lang][method];
}

function money(sale: CashierSaleSnapshot, amountMinor: number, lang: Lang): string {
  return formatMerchantMoneyMinor(
    amountMinor,
    sale.currency_code,
    sale.currency_fraction_digits,
    lang,
  );
}

export function renderCashierReceiptHtml(input: {
  sale: CashierSaleSnapshot;
  lang: Lang;
  stationLabel?: string;
}): string {
  const { sale, lang } = input;
  const copy = CASHIER_RECEIPT_COPY[lang];
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  const lines = sale.lines.map(line => {
    const variant = line.variant_name_snapshot
      ? `<div class="variant">${escapeHtml(line.variant_name_snapshot)}</div>`
      : '';
    const unit = money(sale, line.effective_unit_price_minor, lang);
    return `<tr>
      <td class="item-cell">
        <div class="item-name">${escapeHtml(line.product_name_snapshot)}</div>
        ${variant}
        <div class="unit">${escapeHtml(String(line.quantity))} × ${escapeHtml(unit)}</div>
      </td>
      <td class="qty">${escapeHtml(String(line.quantity))}</td>
      <td class="money">${escapeHtml(money(sale, line.line_total_minor, lang))}</td>
    </tr>`;
  }).join('');

  const discountRow = sale.discount_minor > 0
    ? `<div class="summary-row"><span>${escapeHtml(copy.discount)}</span><strong>− ${escapeHtml(money(sale, sale.discount_minor, lang))}</strong></div>`
    : '';
  const cashRows = sale.payment_method === 'cash'
    ? `${sale.cash_tendered_minor !== undefined
        ? `<div class="summary-row"><span>${escapeHtml(copy.cashReceived)}</span><strong>${escapeHtml(money(sale, sale.cash_tendered_minor, lang))}</strong></div>`
        : ''}
       ${sale.change_due_minor !== undefined
        ? `<div class="summary-row"><span>${escapeHtml(copy.changeDue)}</span><strong>${escapeHtml(money(sale, sale.change_due_minor, lang))}</strong></div>`
        : ''}`
    : '';
  const station = input.stationLabel
    ? `<div class="station">${escapeHtml(input.stationLabel)}</div>`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(copy.receiptTitle)} ${escapeHtml(sale.sale_id)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body { width: 72mm; font-family: Arial, Tahoma, sans-serif; font-size: 11px; line-height: 1.35; }
  .receipt { width: 100%; }
  .header { text-align: center; padding-bottom: 8px; border-bottom: 1px dashed #555; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: .3px; }
  .title { margin-top: 2px; font-size: 12px; font-weight: 700; }
  .station { margin-top: 2px; font-size: 10px; }
  .meta { padding: 7px 0; border-bottom: 1px dashed #555; }
  .meta-row, .summary-row { display: flex; justify-content: space-between; gap: 8px; }
  .meta-row + .meta-row, .summary-row + .summary-row { margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 7px; }
  th { font-size: 10px; font-weight: 700; border-bottom: 1px solid #999; padding: 0 0 4px; }
  td { vertical-align: top; padding: 6px 0; border-bottom: 1px dotted #bbb; }
  .item-cell { padding-inline-end: 4px; }
  .item-name { font-weight: 700; }
  .variant, .unit { color: #555; font-size: 9px; margin-top: 1px; }
  .qty { width: 12mm; text-align: center; white-space: nowrap; }
  .money { width: 24mm; text-align: end; white-space: nowrap; font-weight: 700; }
  .summary { padding-top: 7px; }
  .summary-row.total { margin-top: 6px; padding-top: 6px; border-top: 1px solid #111; font-size: 13px; }
  .payment { margin-top: 7px; padding-top: 7px; border-top: 1px dashed #555; }
  .footer { text-align: center; margin-top: 10px; padding-top: 7px; border-top: 1px dashed #555; font-weight: 700; }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">Fawri</div>
      <div class="title">${escapeHtml(copy.receiptTitle)}</div>
      ${station}
    </div>
    <div class="meta">
      <div class="meta-row"><span>${escapeHtml(copy.saleReference)}</span><strong>${escapeHtml(sale.sale_id)}</strong></div>
      <div class="meta-row"><span>${escapeHtml(copy.saleTime)}</span><span>${escapeHtml(formatReceiptDate(sale.occurred_at, lang))}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="item-cell">${escapeHtml(copy.item)}</th>
          <th class="qty">${escapeHtml(copy.quantity)}</th>
          <th class="money">${escapeHtml(copy.amount)}</th>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>
    <div class="summary">
      <div class="summary-row"><span>${escapeHtml(copy.subtotal)}</span><strong>${escapeHtml(money(sale, sale.subtotal_minor, lang))}</strong></div>
      ${discountRow}
      <div class="summary-row total"><span>${escapeHtml(copy.total)}</span><strong>${escapeHtml(money(sale, sale.total_minor, lang))}</strong></div>
    </div>
    <div class="payment">
      <div class="summary-row"><span>${escapeHtml(copy.paymentMethod)}</span><strong>${escapeHtml(paymentMethodLabel(sale.payment_method, lang))}</strong></div>
      ${cashRows}
    </div>
    <div class="footer">${escapeHtml(copy.thankYou)}</div>
  </div>
</body>
</html>`;
}

export async function printCashierReceipt(input: {
  sale: CashierSaleSnapshot;
  lang: Lang;
  stationLabel?: string;
}): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('CASHIER_RECEIPT_PRINT_UNAVAILABLE');
  }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.inlineSize = '1px';
  frame.style.blockSize = '1px';
  frame.style.insetInlineEnd = '0';
  frame.style.insetBlockEnd = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';

  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error('CASHIER_RECEIPT_PRINT_FRAME_FAILED'));
  });
  frame.srcdoc = renderCashierReceiptHtml(input);
  document.body.appendChild(frame);

  try {
    await loaded;
    const printWindow = frame.contentWindow;
    if (!printWindow || typeof printWindow.print !== 'function') {
      throw new Error('CASHIER_RECEIPT_PRINT_UNAVAILABLE');
    }

    let cleaned = false;
    let cleanupTimer: number | undefined;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
      frame.remove();
    };

    printWindow.addEventListener('afterprint', cleanup, { once: true });
    cleanupTimer = window.setTimeout(cleanup, PRINT_FRAME_TIMEOUT_MS);
    printWindow.focus();
    printWindow.print();
  } catch (cause) {
    frame.remove();
    throw cause;
  }
}