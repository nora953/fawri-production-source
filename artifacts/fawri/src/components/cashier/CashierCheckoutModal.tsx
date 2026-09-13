import { useEffect, useRef } from 'react';
import CashierManualDiscountEditor from './CashierManualDiscountEditor';
import CashierDiscountOverrideEditor from './CashierDiscountOverrideEditor';
import type { CashierPaymentMethod } from '@/lib/cashierLocalContracts';
import type { CashierOperatorDiscountPolicy } from '@/lib/cashierDiscountPolicyClient';
import type {
  CashierDiscountOverrideApproval,
  CashierDiscountOverrideApprover,
} from '@/lib/cashierDiscountOverrideClient';
import type { CashierManualDiscountResolution } from '@/lib/cashierManualDiscount';
import type { CashierResolvedSalePricing } from '@/lib/cashierSalePricingRuntime';
import { CASHIER_POS_ENHANCEMENT_COPY } from '@/lib/cashierPosEnhancementCopy';
import { CASHIER_UI_COPY } from '@/lib/cashierUiCopy';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

type PosLabels = (typeof CASHIER_UI_COPY)[Lang]['pos'];

type Props = {
  open: boolean;
  online: boolean;
  lang: Lang;
  dir: 'rtl' | 'ltr';
  labels: PosLabels;
  quote: CashierResolvedSalePricing | null;
  finalTotalMinor: number | null;
  error?: string | null;
  paymentMethod: CashierPaymentMethod;
  cashTenderText: string;
  cashTenderedMinor: number | null;
  changeDueMinor: number | null;
  externalConfirmed: boolean;
  committing: boolean;
  canSubmit: boolean;
  discountPolicyLoading: boolean;
  discountPolicy: CashierOperatorDiscountPolicy;
  manualDiscountOpen: boolean;
  manualDiscountKind: 'amount' | 'percentage';
  manualDiscountValueText: string;
  manualDiscountReason: string;
  manualDiscountResolution: CashierManualDiscountResolution | null;
  manualDiscountInvalid: boolean;
  overrideNeeded: boolean;
  overrideApprovers: CashierDiscountOverrideApprover[];
  overrideApproversLoading: boolean;
  overrideSelectedApproverId: string;
  overridePin: string;
  overrideApproval: CashierDiscountOverrideApproval | null;
  overrideApprovalLoading: boolean;
  overrideErrorCode: string | null;
  onPaymentMethodChange: (method: CashierPaymentMethod) => void;
  onCashTenderChange: (value: string) => void;
  onExactCash: () => void;
  onExternalConfirmedChange: (confirmed: boolean) => void;
  onManualDiscountOpen: () => void;
  onManualDiscountRemove: () => void;
  onManualDiscountKindChange: (kind: 'amount' | 'percentage') => void;
  onManualDiscountValueChange: (value: string) => void;
  onManualDiscountReasonChange: (value: string) => void;
  onOverrideApproverChange: (staffId: string) => void;
  onOverridePinChange: (pin: string) => void;
  onOverrideApprove: () => void;
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

function moneyParts(
  amountMinor: number,
  currencyCode: string,
  fractionDigits: number,
  lang: Lang,
): { amount: string; currency: string } {
  const formatted = money(amountMinor, currencyCode, fractionDigits, lang);
  const separator = formatted.lastIndexOf('\u00a0');
  if (separator < 0) return { amount: formatted, currency: '' };
  return {
    amount: formatted.slice(0, separator),
    currency: formatted.slice(separator + 1),
  };
}

function MoneyValue({
  amountMinor,
  currencyCode,
  fractionDigits,
  lang,
  negative = false,
  amountClassName,
  currencyClassName,
}: {
  amountMinor: number;
  currencyCode: string;
  fractionDigits: number;
  lang: Lang;
  negative?: boolean;
  amountClassName: string;
  currencyClassName: string;
}) {
  const parts = moneyParts(amountMinor, currencyCode, fractionDigits, lang);
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" dir="ltr">
      {negative ? <span className={amountClassName}>−</span> : null}
      <span className={amountClassName} dir="ltr">{parts.amount}</span>
      {parts.currency ? (
        <span className={currencyClassName} dir="rtl">{parts.currency}</span>
      ) : null}
    </span>
  );
}

export default function CashierCheckoutModal({
  open,
  online,
  lang,
  dir,
  labels,
  quote,
  finalTotalMinor,
  error,
  paymentMethod,
  cashTenderText,
  cashTenderedMinor,
  changeDueMinor,
  externalConfirmed,
  committing,
  canSubmit,
  discountPolicyLoading,
  discountPolicy,
  manualDiscountOpen,
  manualDiscountKind,
  manualDiscountValueText,
  manualDiscountReason,
  manualDiscountResolution,
  manualDiscountInvalid,
  overrideNeeded,
  overrideApprovers,
  overrideApproversLoading,
  overrideSelectedApproverId,
  overridePin,
  overrideApproval,
  overrideApprovalLoading,
  overrideErrorCode,
  onPaymentMethodChange,
  onCashTenderChange,
  onExactCash,
  onExternalConfirmedChange,
  onManualDiscountOpen,
  onManualDiscountRemove,
  onManualDiscountKindChange,
  onManualDiscountValueChange,
  onManualDiscountReasonChange,
  onOverrideApproverChange,
  onOverridePinChange,
  onOverrideApprove,
  onClose,
  onSubmit,
}: Props) {
  const cashInputRef = useRef<HTMLInputElement>(null);
  const cashTouchedRef = useRef(false);
  const previousExactTotalRef = useRef<number | null>(null);
  const extra = CASHIER_POS_ENHANCEMENT_COPY[lang];

  useEffect(() => {
    if (!open) {
      cashTouchedRef.current = false;
      previousExactTotalRef.current = null;
      return;
    }
    if (paymentMethod !== 'cash') {
      cashTouchedRef.current = false;
      previousExactTotalRef.current = null;
      return;
    }
    if (
      previousExactTotalRef.current !== finalTotalMinor &&
      !cashTouchedRef.current
    ) {
      previousExactTotalRef.current = finalTotalMinor;
      onExactCash();
    }
  }, [finalTotalMinor, onExactCash, open, paymentMethod]);

  useEffect(() => {
    if (!open) return;
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!committing && !overrideApprovalLoading) onClose();
        return;
      }
      if (
        event.key !== 'Enter' ||
        event.repeat ||
        committing ||
        overrideApprovalLoading ||
        !canSubmit ||
        paymentMethod !== 'cash'
      ) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'select' || tag === 'button') return;
        if (tag === 'input' && target.id !== 'cashier-cash-received') return;
      }

      event.preventDefault();
      event.stopPropagation();
      onSubmit();
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [canSubmit, committing, onClose, onSubmit, open, overrideApprovalLoading, paymentMethod]);

  useEffect(() => {
    if (!open || paymentMethod !== 'cash' || overrideNeeded) return;
    const timer = window.setTimeout(() => cashInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, overrideNeeded, paymentMethod]);

  if (!open || !quote || finalTotalMinor === null) return null;

  const insufficient =
    paymentMethod === 'cash' &&
    cashTenderedMinor !== null &&
    cashTenderedMinor < finalTotalMinor;
  const hasPromotionDiscount = quote.discount_minor > 0;
  const hasManualDiscount = Boolean(
    manualDiscountResolution && manualDiscountResolution.manual_discount_minor > 0,
  );

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
        className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="cashier-checkout-title" className="text-xl font-black text-slate-900">
              {extra.checkoutTitle}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{extra.checkoutSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={committing || overrideApprovalLoading}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {extra.closeCheckout}
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-center justify-between gap-4">
              <span className="text-base font-black leading-6 text-slate-100">
                {hasManualDiscount ? extra.finalTotal : labels.total}
              </span>
              <MoneyValue
                amountMinor={finalTotalMinor}
                currencyCode={quote.currency_code}
                fractionDigits={quote.currency_fraction_digits}
                lang={lang}
                amountClassName="text-[2rem] font-black leading-none tracking-tight text-white"
                currencyClassName="text-lg font-extrabold text-slate-300"
              />
            </div>

            {hasPromotionDiscount || hasManualDiscount ? (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                {hasPromotionDiscount ? (
                  <div className="flex items-center justify-between gap-3 text-emerald-200">
                    <span className="text-sm font-bold">{extra.promotionDiscount}</span>
                    <MoneyValue
                      amountMinor={quote.discount_minor}
                      currencyCode={quote.currency_code}
                      fractionDigits={quote.currency_fraction_digits}
                      lang={lang}
                      negative
                      amountClassName="text-base font-black"
                      currencyClassName="text-sm font-bold text-emerald-300"
                    />
                  </div>
                ) : null}
                {hasManualDiscount && manualDiscountResolution ? (
                  <div className="flex items-center justify-between gap-3 text-orange-200">
                    <span className="text-sm font-bold">{extra.manualDiscount}</span>
                    <MoneyValue
                      amountMinor={manualDiscountResolution.manual_discount_minor}
                      currencyCode={quote.currency_code}
                      fractionDigits={quote.currency_fraction_digits}
                      lang={lang}
                      negative
                      amountClassName="text-base font-black"
                      currencyClassName="text-sm font-bold text-orange-300"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <CashierManualDiscountEditor
            lang={lang}
            online={online}
            loading={discountPolicyLoading}
            policy={discountPolicy}
            currencyCode={quote.currency_code}
            fractionDigits={quote.currency_fraction_digits}
            open={manualDiscountOpen}
            kind={manualDiscountKind}
            valueText={manualDiscountValueText}
            reason={manualDiscountReason}
            resolution={manualDiscountResolution}
            invalid={manualDiscountInvalid}
            onOpen={onManualDiscountOpen}
            onRemove={onManualDiscountRemove}
            onKindChange={onManualDiscountKindChange}
            onValueChange={onManualDiscountValueChange}
            onReasonChange={onManualDiscountReasonChange}
          />

          <CashierDiscountOverrideEditor
            lang={lang}
            needed={overrideNeeded}
            online={online}
            approvers={overrideApprovers}
            approversLoading={overrideApproversLoading}
            selectedApproverId={overrideSelectedApproverId}
            pin={overridePin}
            approval={overrideApproval}
            approvalLoading={overrideApprovalLoading}
            errorCode={overrideErrorCode}
            onApproverChange={onOverrideApproverChange}
            onPinChange={onOverridePinChange}
            onApprove={onOverrideApprove}
          />

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">{labels.paymentMethod}</label>
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
                  onClick={() => {
                    cashTouchedRef.current = false;
                    previousExactTotalRef.current = finalTotalMinor;
                    onExactCash();
                  }}
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
                onChange={event => {
                  cashTouchedRef.current = true;
                  onCashTenderChange(event.target.value);
                }}
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
                  {changeDueMinor !== null ? (
                    <MoneyValue
                      amountMinor={changeDueMinor}
                      currencyCode={quote.currency_code}
                      fractionDigits={quote.currency_fraction_digits}
                      lang={lang}
                      amountClassName="text-xl font-black"
                      currencyClassName="text-sm font-bold opacity-80"
                    />
                  ) : (
                    <strong className="text-xl">—</strong>
                  )}
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

        <footer
          dir="ltr"
          className="grid shrink-0 grid-cols-[0.8fr_1.2fr] gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4"
        >
          <button
            type="button"
            dir={dir}
            onClick={onClose}
            disabled={committing || overrideApprovalLoading}
            className="h-12 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {extra.cancelCheckout}
          </button>
          <button
            type="button"
            dir={dir}
            onClick={onSubmit}
            disabled={!canSubmit || committing || overrideApprovalLoading}
            className="h-12 rounded-xl bg-orange-600 text-sm font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {committing ? labels.completingSale : extra.confirmSale}
          </button>
        </footer>
      </section>
    </div>
  );
}
