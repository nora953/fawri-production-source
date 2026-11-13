/**
 * R-OWN-5: fail-closed domain contract for unmatched verified receipts.
 * This module is deliberately side-effect free. It grants no operator SQL,
 * does not create/retarget an order, execute a refund, or close a case.
 * Durable case storage and audited provider reconciliation remain separate
 * launch blockers until accepted on the actual restricted runtime.
 */
export type ManualCaseState =
  | "UNRESOLVED_HOLD"
  | "PROVIDER_REVIEW"
  | "PROVIDER_DISPUTE";

export type ManualCaseAction =
  | "ESCALATE_TO_PROVIDER"
  | "RECORD_PROVIDER_DISPUTE";

export type ManualCaseTransition = {
  action: ManualCaseAction;
  expectedState: ManualCaseState;
  nextState: ManualCaseState;
  caseId: string;
  receiptEventId: string;
  actorId: string;
  independentlyApprovedBy: string | null;
  providerEvidenceHash: string | null;
};

export class ManualReceiptCasePolicyError extends Error {
  readonly code = "RECEIPT_MANUAL_CASE_POLICY_DENIED";
  constructor() { super("receipt manual case policy denied"); }
}

function deny(): never { throw new ManualReceiptCasePolicyError(); }
function boundedId(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}
function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Parse a system-generated case transition only. It MUST NOT be used as a
 * public HTTP body parser or treated as authentication/authorization.
 *
 * Critical: reject any extra keys, especially merchant_id, order_id, amount,
 * refund fields and arbitrary ownership reassignment. Decision inputs must
 * originate from independently persisted verified receipt/case identities.
 */
export function parseManualCaseTransition(value: unknown): ManualCaseTransition {
  if (!value || typeof value !== "object" || Array.isArray(value)) deny();
  const data = value as Record<string, unknown>;
  const fields = [
    "action", "expectedState", "nextState", "caseId", "receiptEventId",
    "actorId", "independentlyApprovedBy", "providerEvidenceHash"
  ];
  if (Object.keys(data).sort().join(",") !== fields.sort().join(",")) deny();
  if (!boundedId(data.caseId, 180) || !boundedId(data.receiptEventId, 300)
      || !boundedId(data.actorId, 180)) deny();
  const action = data.action;
  const before = data.expectedState;
  const after = data.nextState;
  // A terminal outcome needs an authenticated second approver and provider
  // reconciliation; it cannot be certified by a caller-supplied actor ID.
  if (action !== "ESCALATE_TO_PROVIDER" && action !== "RECORD_PROVIDER_DISPUTE") deny();
  if (before !== "UNRESOLVED_HOLD" && before !== "PROVIDER_REVIEW") deny();
  if (after !== "PROVIDER_REVIEW" && after !== "PROVIDER_DISPUTE") deny();
  if (data.independentlyApprovedBy !== null
      && !boundedId(data.independentlyApprovedBy, 180)) deny();
  if (data.providerEvidenceHash !== null && !digest(data.providerEvidenceHash)) deny();
  // No transition can ever assert a refund or imply entitlement/order ownership.
  if (action === "ESCALATE_TO_PROVIDER") {
    if (before !== "UNRESOLVED_HOLD" || after !== "PROVIDER_REVIEW"
      || data.independentlyApprovedBy !== null || data.providerEvidenceHash !== null) deny();
  } else {
    if (before !== "PROVIDER_REVIEW" || after !== "PROVIDER_DISPUTE"
      || !digest(data.providerEvidenceHash) || data.independentlyApprovedBy !== null) deny();
  }
  return data as unknown as ManualCaseTransition;
}

/** The only non-applying case-intake result permitted by the policy. */
export function heldReceiptCaseIntake(receipt: {
  provider_event_id: unknown; first_received_at: unknown; order_id: unknown;
}, caseId: unknown) {
  if (!receipt || !boundedId(receipt.provider_event_id, 300)
      || !boundedId(caseId, 180) || receipt.order_id !== null
      || typeof receipt.first_received_at !== "string"
      || !Number.isFinite(Date.parse(receipt.first_received_at))) deny();
  return Object.freeze({
    case_id: caseId,
    receipt_event_id: receipt.provider_event_id,
    status: "UNRESOLVED_HOLD" as const,
    applied: false as const,
  });
}
