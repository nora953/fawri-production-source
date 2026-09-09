import { useCallback, useMemo, useState } from 'react';
import {
  DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY,
  loadCurrentCashierDiscountPolicy,
  type CashierOperatorDiscountPolicy,
} from './cashierDiscountPolicyClient';
import {
  resolveCashierManualDiscount,
  type CashierManualDiscountResolution,
} from './cashierManualDiscount';
import type { CashierResolvedSalePricing } from './cashierSalePricingRuntime';

function digits(value: string): string {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabic = '۰۱۲۳۴۵۶۷۸۹';
  return String(value || '')
    .split('')
    .map((character) => {
      const a = arabicIndic.indexOf(character);
      if (a >= 0) return String(a);
      const e = easternArabic.indexOf(character);
      if (e >= 0) return String(e);
      return character;
    })
    .join('')
    .replace(/[^0-9]/g, '')
    .replace(/^0+(?=\d)/, '');
}

function safeNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export type CashierManualDiscountCheckoutState = {
  policy: CashierOperatorDiscountPolicy;
  policyLoading: boolean;
  policyError: boolean;
  editorOpen: boolean;
  kind: 'amount' | 'percentage';
  valueText: string;
  reason: string;
  resolution: CashierManualDiscountResolution | null;
  manualDiscountMinor: number;
  finalTotalMinor: number | null;
  invalid: boolean;
  canSubmit: boolean;
  refreshPolicy: () => Promise<void>;
  openEditor: () => void;
  remove: () => void;
  setKind: (kind: 'amount' | 'percentage') => void;
  setValueText: (value: string) => void;
  setReason: (value: string) => void;
  reset: () => void;
};

export function useCashierManualDiscountCheckout(input: {
  quote: CashierResolvedSalePricing | null;
  online: boolean;
}): CashierManualDiscountCheckoutState {
  const [policy, setPolicy] = useState<CashierOperatorDiscountPolicy>(
    DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY,
  );
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [kind, setKindState] = useState<'amount' | 'percentage'>('amount');
  const [valueText, setValueTextState] = useState('');
  const [reason, setReasonState] = useState('');

  const resetDraft = useCallback(() => {
    setEditorOpen(false);
    setKindState('amount');
    setValueTextState('');
    setReasonState('');
  }, []);

  const refreshPolicy = useCallback(async () => {
    setPolicyError(false);
    if (!input.online) {
      setPolicy(DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY);
      resetDraft();
      return;
    }
    setPolicyLoading(true);
    try {
      const next = await loadCurrentCashierDiscountPolicy();
      setPolicy(next);
      if (!next.enabled) resetDraft();
    } catch {
      setPolicy(DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY);
      setPolicyError(true);
      resetDraft();
    } finally {
      setPolicyLoading(false);
    }
  }, [input.online, resetDraft]);

  const numericValue = safeNumber(valueText);
  const draftValue = numericValue === null
    ? null
    : kind === 'percentage'
      ? numericValue * 100
      : numericValue;
  const reasonValid = reason.normalize('NFKC').trim().length > 0 && reason.length <= 200;

  const resolution = useMemo(() => {
    if (!input.quote) return null;
    if (!editorOpen || draftValue === null || draftValue <= 0) {
      return resolveCashierManualDiscount({
        subtotalMinor: input.quote.subtotal_minor,
        promotionDiscountMinor: input.quote.discount_minor,
        draft: null,
        policy,
      });
    }
    try {
      return resolveCashierManualDiscount({
        subtotalMinor: input.quote.subtotal_minor,
        promotionDiscountMinor: input.quote.discount_minor,
        draft: {
          kind,
          value: draftValue,
          // The durable commit still requires the real reason. This placeholder
          // exists only so the UI can preview arithmetic before the reason is typed.
          reason: reasonValid ? reason.normalize('NFKC').trim() : 'discount-preview',
        },
        policy,
      });
    } catch {
      return null;
    }
  }, [draftValue, editorOpen, input.quote, kind, policy, reason, reasonValid]);

  const manualDiscountMinor = editorOpen
    ? Number(resolution?.manual_discount_minor || 0)
    : 0;
  const finalTotalMinor = input.quote
    ? input.quote.total_minor - manualDiscountMinor
    : null;
  const invalid = editorOpen && (
    draftValue === null ||
    draftValue <= 0 ||
    !reasonValid ||
    !resolution
  );
  const canSubmit = !editorOpen || Boolean(
    !invalid &&
    resolution &&
    resolution.manual_discount_minor > 0 &&
    resolution.allowed_without_override
  );

  return {
    policy,
    policyLoading,
    policyError,
    editorOpen,
    kind,
    valueText,
    reason,
    resolution,
    manualDiscountMinor,
    finalTotalMinor,
    invalid,
    canSubmit,
    refreshPolicy,
    openEditor: () => setEditorOpen(true),
    remove: resetDraft,
    setKind: (next) => {
      setKindState(next);
      setValueTextState('');
    },
    setValueText: (value) => setValueTextState(digits(value)),
    setReason: (value) => setReasonState(value.slice(0, 200)),
    reset: () => {
      setPolicy(DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY);
      setPolicyError(false);
      resetDraft();
    },
  };
}
