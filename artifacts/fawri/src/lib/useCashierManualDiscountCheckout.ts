import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY,
  loadCurrentCashierDiscountPolicy,
  type CashierOperatorDiscountPolicy,
} from './cashierDiscountPolicyClient';
import {
  listCashierDiscountOverrideApprovers,
  requestCashierDiscountOverrideApproval,
  type CashierDiscountOverrideApproval,
  type CashierDiscountOverrideApprover,
} from './cashierDiscountOverrideClient';
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

function pinDigits(value: string): string {
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
    .slice(0, 8);
}

function safeNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function approvalLive(approval: CashierDiscountOverrideApproval | null): boolean {
  if (!approval) return false;
  const expiresAt = new Date(approval.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

function newOverrideOperationId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  overrideNeeded: boolean;
  overrideApprovers: CashierDiscountOverrideApprover[];
  overrideApproversLoading: boolean;
  overrideSelectedApproverId: string;
  overridePin: string;
  overrideApproval: CashierDiscountOverrideApproval | null;
  overrideApprovalLoading: boolean;
  overrideErrorCode: string | null;
  refreshPolicy: () => Promise<void>;
  openEditor: () => void;
  remove: () => void;
  setKind: (kind: 'amount' | 'percentage') => void;
  setValueText: (value: string) => void;
  setReason: (value: string) => void;
  setOverrideSelectedApproverId: (value: string) => void;
  setOverridePin: (value: string) => void;
  approveOverride: () => Promise<void>;
  reset: () => void;
};

export function useCashierManualDiscountCheckout(input: {
  quote: CashierResolvedSalePricing | null;
  online: boolean;
  operationId: string | null;
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
  const [overrideApprovers, setOverrideApprovers] = useState<CashierDiscountOverrideApprover[]>([]);
  const [overrideApproversLoading, setOverrideApproversLoading] = useState(false);
  const [overrideSelectedApproverId, setOverrideSelectedApproverIdState] = useState('');
  const [overridePin, setOverridePinState] = useState('');
  const [overrideApproval, setOverrideApproval] = useState<CashierDiscountOverrideApproval | null>(null);
  const [overrideApprovalLoading, setOverrideApprovalLoading] = useState(false);
  const [overrideErrorCode, setOverrideErrorCode] = useState<string | null>(null);
  const previousOperationIdRef = useRef<string | null>(null);

  const clearOverride = useCallback((clearApprovers = false) => {
    setOverrideApproval(null);
    setOverridePinState('');
    setOverrideErrorCode(null);
    if (clearApprovers) {
      setOverrideApprovers([]);
      setOverrideSelectedApproverIdState('');
    }
  }, []);

  const resetDraft = useCallback(() => {
    setEditorOpen(false);
    setKindState('amount');
    setValueTextState('');
    setReasonState('');
    clearOverride(true);
  }, [clearOverride]);

  useEffect(() => {
    const previousOperationId = previousOperationIdRef.current;
    previousOperationIdRef.current = input.operationId;
    if (input.operationId && input.operationId !== previousOperationId) {
      resetDraft();
    }
  }, [input.operationId, resetDraft]);

  const refreshPolicy = useCallback(async () => {
    setPolicyError(false);
    clearOverride(true);
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
  }, [clearOverride, input.online, resetDraft]);

  const numericValue = safeNumber(valueText);
  const draftValue = numericValue === null
    ? null
    : kind === 'percentage'
      ? numericValue * 100
      : numericValue;
  const normalizedReason = reason.normalize('NFKC').trim();
  const reasonValid = normalizedReason.length > 0 && reason.length <= 200;

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
          reason: reasonValid ? normalizedReason : 'discount-preview',
        },
        policy,
      });
    } catch {
      return null;
    }
  }, [draftValue, editorOpen, input.quote, kind, normalizedReason, policy, reasonValid]);

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
  const overrideNeeded = Boolean(
    editorOpen &&
    !invalid &&
    resolution &&
    resolution.manual_discount_minor > 0 &&
    !resolution.allowed_without_override
  );
  const overrideApproved = overrideNeeded && approvalLive(overrideApproval);
  const canSubmit = !editorOpen || Boolean(
    !invalid &&
    resolution &&
    resolution.manual_discount_minor > 0 &&
    (resolution.allowed_without_override || overrideApproved)
  );

  const quoteBinding = input.quote
    ? `${input.quote.subtotal_minor}:${input.quote.discount_minor}:${input.quote.total_minor}`
    : 'none';

  useEffect(() => {
    clearOverride(true);
  }, [clearOverride, input.operationId, quoteBinding]);

  useEffect(() => {
    if (!overrideApproval) return;
    const expiresAt = new Date(overrideApproval.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) {
      clearOverride();
      return;
    }
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearOverride();
      return;
    }
    const timer = window.setTimeout(() => clearOverride(), remaining + 25);
    return () => window.clearTimeout(timer);
  }, [clearOverride, overrideApproval]);

  useEffect(() => {
    if (!overrideNeeded || !input.online || !input.operationId) {
      if (!overrideNeeded) clearOverride(true);
      return;
    }
    let stopped = false;
    setOverrideApproversLoading(true);
    setOverrideErrorCode(null);
    void listCashierDiscountOverrideApprovers()
      .then((values) => {
        if (stopped) return;
        setOverrideApprovers(values);
        setOverrideSelectedApproverIdState((current) =>
          values.some((approver) => approver.id === current)
            ? current
            : values[0]?.id || '',
        );
      })
      .catch((error: unknown) => {
        if (stopped) return;
        setOverrideApprovers([]);
        setOverrideSelectedApproverIdState('');
        setOverrideErrorCode(
          errorCode(error) || 'CASHIER_DISCOUNT_OVERRIDE_APPROVERS_LOAD_FAILED',
        );
      })
      .finally(() => {
        if (!stopped) setOverrideApproversLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [clearOverride, input.online, input.operationId, overrideNeeded]);

  const approveOverride = useCallback(async () => {
    if (
      !overrideNeeded ||
      !input.online ||
      !input.operationId ||
      !overrideSelectedApproverId ||
      !/^\d{4,8}$/.test(overridePin) ||
      !resolution ||
      resolution.manual_discount_minor <= 0 ||
      !reasonValid
    ) {
      setOverrideErrorCode('CASHIER_DISCOUNT_OVERRIDE_INPUT_INVALID');
      return;
    }
    setOverrideApprovalLoading(true);
    setOverrideErrorCode(null);
    const pinForRequest = overridePin;
    const requestForOperation = (operationId: string) =>
      requestCashierDiscountOverrideApproval({
        approverStaffId: overrideSelectedApproverId,
        pin: pinForRequest,
        operationId,
        manualDiscountMinor: resolution.manual_discount_minor,
        reason: normalizedReason,
      });
    try {
      let approval: CashierDiscountOverrideApproval;
      try {
        approval = await requestForOperation(input.operationId);
      } catch (error: unknown) {
        if (errorCode(error) !== 'CASHIER_DISCOUNT_OVERRIDE_OPERATION_CONFLICT') {
          throw error;
        }
        // A completed/expired approval request permanently owns its operation id.
        // Renew the approval with a fresh sale operation id while preserving the
        // old approval as immutable audit evidence. The runtime commits the sale
        // with the operation id carried by the renewed approval binding.
        approval = await requestForOperation(newOverrideOperationId());
      }
      setOverrideApproval(approval);
    } catch (error: unknown) {
      setOverrideApproval(null);
      setOverrideErrorCode(
        errorCode(error) || 'CASHIER_DISCOUNT_OVERRIDE_APPROVAL_FAILED',
      );
    } finally {
      // Never retain a manager PIN after the authorization request.
      setOverridePinState('');
      setOverrideApprovalLoading(false);
    }
  }, [
    input.online,
    input.operationId,
    normalizedReason,
    overrideNeeded,
    overridePin,
    overrideSelectedApproverId,
    reasonValid,
    resolution,
  ]);

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
    overrideNeeded,
    overrideApprovers,
    overrideApproversLoading,
    overrideSelectedApproverId,
    overridePin,
    overrideApproval,
    overrideApprovalLoading,
    overrideErrorCode,
    refreshPolicy,
    openEditor: () => setEditorOpen(true),
    remove: resetDraft,
    setKind: (next) => {
      clearOverride();
      setKindState(next);
      setValueTextState('');
    },
    setValueText: (value) => {
      clearOverride();
      setValueTextState(digits(value));
    },
    setReason: (value) => {
      clearOverride();
      setReasonState(value.slice(0, 200));
    },
    setOverrideSelectedApproverId: (value) => {
      clearOverride();
      setOverrideSelectedApproverIdState(value);
    },
    setOverridePin: (value) => {
      setOverrideErrorCode(null);
      setOverridePinState(pinDigits(value));
    },
    approveOverride,
    reset: () => {
      setPolicy(DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY);
      setPolicyError(false);
      previousOperationIdRef.current = null;
      resetDraft();
    },
  };
}
