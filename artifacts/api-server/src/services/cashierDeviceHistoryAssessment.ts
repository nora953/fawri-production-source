import {
  OperationalPostgresAuthorityError,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

const MAX_INSPECTION_ROWS = 512;
const MAX_CLIENT_SEQUENCE = BigInt(Number.MAX_SAFE_INTEGER);

type HistoryAssessment = {
  status: "EMPTY" | "CONTIGUOUS" | "GAPPED" | "REVIEW_REQUIRED";
  reason: "EMPTY_HISTORY" | "CONTIGUOUS_NUMBERS_ONLY" | "MISSING_SEQUENCE" |
    "INSPECTION_LIMIT" | "UNSAFE_SEQUENCE" | "INCONSISTENT_ORDER";
  observedRows: number;
  inspectionLimit: number;
  historyComplete: boolean;
  firstSequence: string | null;
  lastSequence: string | null;
  firstMissingSequence: string | null;
  // Numeric contiguity is neither receipt provenance nor an enrollment grant.
  enrollmentAuthorized: false;
  statementSnapshotOnly: true;
};

function identifier(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!id || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new OperationalPostgresAuthorityError(
      "CASHIER_HISTORY_INPUT_INVALID", "cashier history identity is invalid", 400,
    );
  }
  return id;
}

// Internal read-only preparation for SEQ-D1. Caller supplies an existing trusted
// tenant transaction target. This does not authenticate a device, enroll a
// stream, certify legacy receipts or change live sequence admission.
export async function assessCashierDeviceHistory(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  deviceId: string;
  inspectionLimit?: number;
}): Promise<HistoryAssessment> {
  const merchantId = identifier(input.merchantId), deviceId = identifier(input.deviceId);
  const limit = input.inspectionLimit ?? MAX_INSPECTION_ROWS;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_INSPECTION_ROWS) {
    throw new OperationalPostgresAuthorityError(
      "CASHIER_HISTORY_INPUT_INVALID", "cashier history inspection limit is invalid", 400,
    );
  }
  // One statement gives a coherent Read Committed snapshot. The extra row
  // detects truncation; a bounded prefix must never certify full history.
  const result = await input.target.query<{ device_sequence: string }>(
    `SELECT device_sequence::text AS device_sequence
       FROM cashier_device_operation_timeline
      WHERE merchant_id = $1 AND device_id = $2
      ORDER BY device_sequence ASC
      LIMIT $3`,
    [merchantId, deviceId, limit + 1],
  );
  const base = {
    observedRows: Math.min(result.rows.length, limit), inspectionLimit: limit,
    historyComplete: result.rows.length <= limit,
    firstSequence: null, lastSequence: null, firstMissingSequence: null,
    enrollmentAuthorized: false as const, statementSnapshotOnly: true as const,
  };
  if (!base.historyComplete) return { ...base, status: "REVIEW_REQUIRED", reason: "INSPECTION_LIMIT" };
  if (!result.rows.length) return { ...base, status: "EMPTY", reason: "EMPTY_HISTORY" };
  let previous = 0n, missing: bigint | null = null;
  for (const row of result.rows) {
    if (!/^[1-9][0-9]*$/.test(row.device_sequence)) {
      return { ...base, status: "REVIEW_REQUIRED", reason: "UNSAFE_SEQUENCE" };
    }
    const sequence = BigInt(row.device_sequence);
    if (sequence > MAX_CLIENT_SEQUENCE) {
      return { ...base, status: "REVIEW_REQUIRED", reason: "UNSAFE_SEQUENCE" };
    }
    if (sequence <= previous) return { ...base, status: "REVIEW_REQUIRED", reason: "INCONSISTENT_ORDER" };
    if (missing === null && sequence !== previous + 1n) missing = previous + 1n;
    previous = sequence;
  }
  return {
    ...base, firstSequence: result.rows[0].device_sequence, lastSequence: previous.toString(),
    firstMissingSequence: missing?.toString() ?? null,
    status: missing === null ? "CONTIGUOUS" : "GAPPED",
    reason: missing === null ? "CONTIGUOUS_NUMBERS_ONLY" : "MISSING_SEQUENCE",
  };
}

export type CashierEnrollmentHistoryReview = {
  serverHistoryPresent: boolean;
  signals: {
    timeline: boolean;
    sale: boolean;
    compensation: boolean;
    attribution: boolean;
    stream: boolean;
  };
  reviewReason: "SERVER_HISTORY_PRESENT" | "TRUSTED_PROVENANCE_REQUIRED";
  enrollmentAuthorized: false;
  statementSnapshotOnly: true;
};

// Internal enrollment prerequisite, not an enrollment grant or public API.
// Pairing and an empty numeric timeline are not fresh-device provenance.
// These existentials deliberately return no peer rows, amounts or operation IDs.
// A later trusted enrollment writer must serialize this review with all writers;
// this read-only statement neither locks nor certifies concurrent absence.
export async function reviewCashierDeviceEnrollmentHistory(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  deviceId: string;
}): Promise<CashierEnrollmentHistoryReview> {
  const merchantId = identifier(input.merchantId), deviceId = identifier(input.deviceId);
  const result = await input.target.query<{
    timeline: boolean; sale: boolean; compensation: boolean;
    attribution: boolean; stream: boolean;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM cashier_device_operation_timeline
         WHERE merchant_id=$1 AND device_id=$2) AS timeline,
       EXISTS(SELECT 1 FROM orders
         WHERE merchant_id=$1 AND source_channel='cashier'
           AND metadata->'cashier_sync'->>'device_id'=$2) AS sale,
       EXISTS(SELECT 1 FROM orders o
         WHERE o.merchant_id=$1 AND o.source_channel='cashier'
           AND EXISTS(SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(o.metadata->'cashier_sync'->'compensations')='array'
               THEN o.metadata->'cashier_sync'->'compensations'
               ELSE '[]'::jsonb END) compensation
             WHERE compensation->>'device_id'=$2)) AS compensation,
       EXISTS(SELECT 1 FROM cashier_operation_attribution
         WHERE merchant_id=$1 AND device_id=$2) AS attribution,
       EXISTS(SELECT 1 FROM cashier_device_streams
         WHERE merchant_id=$1 AND device_id=$2) AS stream
     FROM (SELECT 1 WHERE fawri_security.allows_merchant($1)) authorized_scope`,
    [merchantId, deviceId],
  );
  const signals = result.rows[0];
  if (!signals) {
    throw new OperationalPostgresAuthorityError(
      "CASHIER_ENROLLMENT_SCOPE_REQUIRED",
      "cashier enrollment history requires the trusted merchant scope",
      403,
    );
  }
  const serverHistoryPresent = Object.values(signals).some(Boolean);
  return {
    serverHistoryPresent, signals,
    reviewReason: serverHistoryPresent ? "SERVER_HISTORY_PRESENT" : "TRUSTED_PROVENANCE_REQUIRED",
    enrollmentAuthorized: false, statementSnapshotOnly: true,
  };
}
