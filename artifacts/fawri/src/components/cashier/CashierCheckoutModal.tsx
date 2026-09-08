import { useEffect, useRef } from 'react';
import type { CashierPaymentMethod } from '@/lib/cashierLocalContracts';
import type { CashierResolvedSalePricing } from '@/lib/cashierSalePricingRuntime';
import { CASHIER_UI_COPY } from '@/lib/cashierUiCopy';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

type PosLabels = (typeof CASHIER_UI_COPY)[Lang]['pos'];

type Props = {
  open: boolean;
  lang: Lang;
  dir: 'rtl' | 'ltr';
  labels: PosLabels;
  quote: CashierResolvedSalePricing | null;
  paymentMethod: CashierPaymentMethod;
  cashTenderText: string;
  cashTenderedMinor: number | null;
  changeDueMinor: number | null;
  externalConfirmed: boolean;
  committing: boolean;
  canSubmit: boolean;
  onPaymentMethodChange: (method: CashierPaymentMethod) => void;
  onCashTenderChange: (value: string) => void;
  onExactCash: () => void;
  onExternalConfirmedChange: (confirmed: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function money(
  amountMinor: number,
  currencyCode: string,
  fractionDigits: number,
  lang: Lang,
): string {
  return formatMerchantMoneyMinor(amountMinor, currencyCode, fractionDigits, lang);
}

export default function CashierCheckoutModal({
  open,
  lang,
  dir,
  labels,
  quote,
  paymentMethod,
  cashTenderText,
  cashTenderedMinor,
  changeDueMinor,
  externalConfirmed,
  committing,
  canSubmit,
  onPaymentMethodChange,
  onCashTenderChange,
  onExactCash,
  onExternalConfirmedChange,
  onClose,
  onSubmit,
}: Props) {
  const cashInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !committing) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [committing, onClose, open]);

  useEffect(() => {
    if (!open || paymentMethod !== 'cash') return;
    const timer = window.setTimeout(() => cashInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, paymentMethod]);

  if (!open || !quote) return null;

  const insufficient =
    paymentMethod === 'cash' &&
    cashTenderedMinor !== null &&
    cashTenderedMinor < quote.total_minor;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      data-cashier-checkout="open"
      dir={dir}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashier-checkout-title"
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="cashier-checkout-title" className="text-xl font-black text-slate-900">
              {labels.checkoutTitle}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{labels.checkoutSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={committing}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.closeCheckout}
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm font-semibold text-slate-300">{labels.total}</span>
              <strong className="text-3xl font-black" dir="ltr">
                {money(quote.total_minor, quote.currency_code, quote.currency_fraction_digits, lang)}
              </strong>
            </div>
            {quote.discount_minor > 0 ? (
              <div className="mt-2 flex justify-between text-xs text-emerald-300">
                <span>{labels.discount}</span>
                <span dir="ltr">− {money(quote.discount_minor, quote.currency_code, quote.currency_fraction_digits, lang)}</span>
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold text-slate-600">{labels.paymentMethod}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ['cash', labels.cash],
                ['card', labels.card],
                ['electronic', labels.electronic],
                ['other', labels.other],
              ] as Array<[CashierPaymentMethod, string]>).map(([method, label]) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => onPaymentMethodChange(method)}
                  className={`h-11 rounded-xl border px-3 text-sm font-bold transition ${
                    paymentMethod === method
                      ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'cash' ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor="cashier-cash-received" className="text-sm font-bold text-slate-800">
                  {labels.cashReceived}
                </label>
                <button
                  type="button"
                  onClick={onExactCash}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {labels.exactCash}
                </button>
              </div>
              <input
                ref={cashInputRef}
                id="cashier-cash-received"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cashTenderText}
                onChange={event => onCashTenderChange(event.target.value)}
                placeholder={labels.cashReceivedPlaceholder}
                className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-end text-2xl font-black outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                dir="ltr"
              />

              <div className={`mt-3 rounded-xl border px-4 py-3 ${
                changeDueMinor !== null
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{labels.changeDue}</span>
                  <strong className="text-xl" dir="ltr">
                    {changeDueMinor !== null
                      ? money(changeDueMinor, quote.currency_code, quote.currency_fraction_digits, lang)
                      : '—'}
                  </strong>
                </div>
              </div>

              {insufficient ? (
                <p className="mt-2 text-sm font-bold text-red-600">{labels.cashInsufficient}</p>
              ) : null}
            </div>
          ) : (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <input
                type="checkbox"
                checked={externalConfirmed}
                onChange={event => onExternalConfirmedChange(event.target.checked)}
                className="mt-1 h-5 w-5"
              />
              <span>{labels.externalPaymentConfirmed}</span>
            </label>
          )}
        </div>

        <footer className="grid grid-cols-[0.8fr_1.2fr] gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={committing}
            className="h-12 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {labels.cancelCheckout}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || committing}
            className="h-12 rounded-xl bg-orange-600 text-sm font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {committing ? labels.completingSale : labels.confirmSale}
          </button>
        </footer>
      </section>
    </div>
  );
}
