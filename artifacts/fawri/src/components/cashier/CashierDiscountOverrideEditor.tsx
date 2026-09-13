import type { CashierDiscountOverrideApproval, CashierDiscountOverrideApprover } from '@/lib/cashierDiscountOverrideClient';
import { CASHIER_POS_ENHANCEMENT_COPY } from '@/lib/cashierPosEnhancementCopy';
import type { Lang } from '@/lib/types';

type Props = {
  lang: Lang;
  needed: boolean;
  online: boolean;
  approvers: CashierDiscountOverrideApprover[];
  approversLoading: boolean;
  selectedApproverId: string;
  pin: string;
  approval: CashierDiscountOverrideApproval | null;
  approvalLoading: boolean;
  errorCode: string | null;
  onApproverChange: (staffId: string) => void;
  onPinChange: (pin: string) => void;
  onApprove: () => void;
};

export default function CashierDiscountOverrideEditor({
  lang,
  needed,
  online,
  approvers,
  approversLoading,
  selectedApproverId,
  pin,
  approval,
  approvalLoading,
  errorCode,
  onApproverChange,
  onPinChange,
  onApprove,
}: Props) {
  if (!needed) return null;
  const copy = CASHIER_POS_ENHANCEMENT_COPY[lang];

  if (approval) {
    const manager = approvers.find((item) => item.id === approval.approver_staff_id);
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-emerald-950"
      >
        <p className="text-sm font-black">{copy.managerApprovalApproved}</p>
        {manager ? <p className="mt-1 text-[13px] font-bold">{manager.display_name}</p> : null}
      </div>
    );
  }

  if (!online) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[13px] font-bold leading-5 text-amber-900">
        {copy.managerApprovalOnlineRequired}
      </div>
    );
  }

  const pinReady = /^\d{4,8}$/.test(pin);
  const locked = errorCode === 'CASHIER_PIN_LOCKED';
  const invalidPin = errorCode === 'CASHIER_OPERATOR_INVALID';
  const managerLimitExceeded =
    errorCode === 'CASHIER_DISCOUNT_OVERRIDE_MANAGER_LIMIT_EXCEEDED';

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-3.5">
      <div className="mb-3 rounded-xl border border-orange-100 bg-white/80 px-3 py-2.5">
        <p className="text-base font-black text-slate-900">{copy.managerApprovalTitle}</p>
        <p className="mt-0.5 text-[13px] font-medium leading-5 text-slate-600">
          {copy.managerApprovalSubtitle}
        </p>
      </div>

      {approversLoading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-500">
          {copy.managerApprovalLoading}
        </p>
      ) : approvers.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-[13px] font-bold leading-5 text-amber-800">
          {copy.managerApprovalNoApprovers}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-[13px] font-extrabold text-slate-700">
            {copy.managerApprovalManager}
            <select
              value={selectedApproverId}
              onChange={(event) => onApproverChange(event.target.value)}
              disabled={approvalLoading}
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
            >
              {approvers.map((approver) => (
                <option key={approver.id} value={approver.id}>{approver.display_name}</option>
              ))}
            </select>
          </label>

          <label className="block text-[13px] font-extrabold text-slate-700">
            {copy.managerApprovalPin}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              maxLength={8}
              onChange={(event) => onPinChange(event.target.value)}
              disabled={approvalLoading}
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-center text-xl font-black tracking-[0.35em] outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
              dir="ltr"
              aria-describedby={errorCode ? 'cashier-manager-approval-error' : undefined}
            />
          </label>

          {errorCode ? (
            <p
              id="cashier-manager-approval-error"
              role="alert"
              className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] font-bold leading-5 text-red-700"
            >
              {locked
                ? copy.managerApprovalLocked
                : invalidPin
                  ? copy.managerApprovalInvalidPin
                  : managerLimitExceeded
                    ? copy.managerApprovalManagerLimitExceeded
                    : copy.managerApprovalFailed}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onApprove}
            disabled={approvalLoading || !selectedApproverId || !pinReady}
            className="h-12 w-full rounded-xl bg-orange-600 text-sm font-black text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {approvalLoading ? copy.managerApprovalChecking : copy.managerApprovalAction}
          </button>
        </div>
      )}
    </div>
  );
}
