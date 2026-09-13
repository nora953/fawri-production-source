import { useEffect, useState } from 'react';
import { CASHIER_POS_ENHANCEMENT_COPY } from '@/lib/cashierPosEnhancementCopy';
import type { CashierOperatorDiscountPolicy } from '@/lib/cashierDiscountPolicyClient';
import type { CashierManualDiscountResolution } from '@/lib/cashierManualDiscount';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

type Props = {
  lang: Lang;
  online: boolean;
  loading: boolean;
  policy: CashierOperatorDiscountPolicy;
  currencyCode: string;
  fractionDigits: number;
  open: boolean;
  kind: 'amount' | 'percentage';
  valueText: string;
  reason: string;
  resolution: CashierManualDiscountResolution | null;
  invalid: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onKindChange: (kind: 'amount' | 'percentage') => void;
  onValueChange: (value: string) => void;
  onReasonChange: (value: string) => void;
};

const REASON_NOTE_SEPARATOR = ' — ';

export default function CashierManualDiscountEditor({
  lang,
  online,
  loading,
  policy,
  currencyCode,
  fractionDigits,
  open,
  kind,
  valueText,
  reason,
  resolution,
  invalid,
  onOpen,
  onRemove,
  onKindChange,
  onValueChange,
  onReasonChange,
}: Props) {
  const copy = CASHIER_POS_ENHANCEMENT_COPY[lang];
  const [showReasonNote, setShowReasonNote] = useState(false);
  const money = (value: number) =>
    formatMerchantMoneyMinor(value, currencyCode, fractionDigits, lang);
  const reasonOptions = [
    copy.discountReasonCustomerRecovery,
    copy.discountReasonLoyalty,
    copy.discountReasonPriceMatch,
    copy.discountReasonDamagedItem,
    copy.discountReasonSpecialOffer,
    copy.discountReasonClearance,
    copy.discountReasonOther,
  ];
  const selectedReason = reasonOptions.find(option =>
    reason === option || reason.startsWith(`${option}${REASON_NOTE_SEPARATOR}`),
  ) ?? null;
  const selectedNote = selectedReason && reason.startsWith(`${selectedReason}${REASON_NOTE_SEPARATOR}`)
    ? reason.slice(`${selectedReason}${REASON_NOTE_SEPARATOR}`.length)
    : '';
  const customLegacyReason = reason.trim() !== '' && selectedReason === null;
  const noteVisible = showReasonNote || selectedNote !== '' || customLegacyReason;

  useEffect(() => {
    if (!open) setShowReasonNote(false);
  }, [open]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        {copy.discountPolicyLoading}
      </div>
    );
  }

  if (!online) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        {copy.discountOnlineRequired}
      </div>
    );
  }

  if (!policy.enabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-xl border border-dashed border-orange-300 bg-orange-50/50 px-3 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-50"
      >
        + {copy.addDiscount}
      </button>
    );
  }

  const limitText = kind === 'amount'
    ? money(policy.max_amount_minor ?? 0)
    : `${policy.max_percentage_bps / 100}%`;

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-900">{copy.manualDiscount}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {copy.discountEmployeeLimit}: <strong dir="ltr">{limitText}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-bold text-red-600 hover:underline"
        >
          {copy.removeDiscount}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onKindChange('amount')}
          className={`h-9 rounded-lg border text-xs font-bold ${
            kind === 'amount'
              ? 'border-orange-500 bg-white text-orange-700 ring-2 ring-orange-100'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {copy.discountAmount}
        </button>
        <button
          type="button"
          onClick={() => onKindChange('percentage')}
          className={`h-9 rounded-lg border text-xs font-bold ${
            kind === 'percentage'
              ? 'border-orange-500 bg-white text-orange-700 ring-2 ring-orange-100'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {copy.discountPercent}
        </button>
      </div>

      <label className="mt-3 block text-xs font-bold text-slate-700">
        {copy.discountValue}
        <input
          type="text"
          inputMode="numeric"
          value={valueText}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="0"
          className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-end text-base font-black outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          dir="ltr"
        />
      </label>

      <div className="mt-3">
        <p className="text-xs font-bold text-slate-700">{copy.discountReason}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {reasonOptions.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={selectedReason === option}
              onClick={() => {
                onReasonChange(option);
                setShowReasonNote(false);
              }}
              className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-bold transition ${
                selectedReason === option
                  ? 'border-orange-500 bg-orange-100 text-orange-800 ring-2 ring-orange-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {selectedReason ? (
          <button
            type="button"
            onClick={() => setShowReasonNote(current => !current)}
            className="mt-2 text-xs font-bold text-slate-600 underline decoration-dotted underline-offset-4"
          >
            {copy.discountReasonAddNote}
          </button>
        ) : null}

        {noteVisible ? (
          <input
            type="text"
            maxLength={selectedReason ? 120 : 200}
            value={selectedReason ? selectedNote : reason}
            onChange={(event) => {
              const note = event.target.value;
              if (selectedReason) {
                onReasonChange(
                  note.trim() === ''
                    ? selectedReason
                    : `${selectedReason}${REASON_NOTE_SEPARATOR}${note}`,
                );
              } else {
                onReasonChange(note);
              }
            }}
            placeholder={copy.discountReasonNotePlaceholder}
            className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        ) : null}
      </div>

      {resolution && resolution.manual_discount_minor > 0 ? (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
          <span className="font-bold text-slate-600">{copy.manualDiscount}</span>
          <strong className="text-red-600" dir="ltr">− {money(resolution.manual_discount_minor)}</strong>
        </div>
      ) : null}

      {resolution && !resolution.allowed_without_override && resolution.manual_discount_minor > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-bold leading-5 text-amber-800">
          {copy.discountNeedsManager}
        </p>
      ) : null}
      {invalid ? (
        <p className="mt-2 text-xs font-bold text-red-600">{copy.discountReasonRequired}</p>
      ) : null}
    </div>
  );
}
