import crypto from "node:crypto";
import { OperationalPostgresAuthorityError, type OperationalQueryTarget } from "./operationalPostgresAuthority";

export type IndependentlyReviewedEmptyDevice = {
  merchantId: string; stationId: string; deviceId: string;
  reviewReference: string; reviewerReference: string;
  evidenceSha256: string; reviewedAt: string;
  reviewedLocalCounter: 0; reviewedPendingOperations: 0;
};

// Internal provisioning primitive: caller must hold the separate enrollment
// capability, not an operator/browser bearer token. No route or pool is wired.
// The SQL authority rechecks the evidence and financial history under the same
// merchant/device advisory lock used by canonical sale and compensation.
export async function enrollReviewedEmptyCashierStreamInTransaction(
  target: OperationalQueryTarget, review: IndependentlyReviewedEmptyDevice,
): Promise<{stream_id:string;state:string;last_sequence:string;version:number;replayed:boolean}> {
  function id(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new OperationalPostgresAuthorityError("CASHIER_ENROLLMENT_REVIEW_INVALID", "independent enrollment review is invalid", 400);
    }
    return value.normalize("NFKC").trim();
  }
  if (review.reviewedLocalCounter !== 0 || review.reviewedPendingOperations !== 0 ||
      !/^[a-f0-9]{64}$/.test(review.evidenceSha256) || !Number.isFinite(Date.parse(review.reviewedAt))) {
    throw new OperationalPostgresAuthorityError("CASHIER_ENROLLMENT_REVIEW_INVALID", "review must attest a fresh empty device; no baseline import is allowed", 400);
  }
  const manifest = {
    version: 1, kind: "independent_empty_device_review",
    merchant_id: id(review.merchantId), station_id: id(review.stationId), device_id: id(review.deviceId),
    review_reference: id(review.reviewReference), reviewer_reference: id(review.reviewerReference),
    evidence_sha256: review.evidenceSha256, reviewed_at: new Date(review.reviewedAt).toISOString(),
    reviewed_local_counter: 0, reviewed_pending_operations: 0,
  };
  const streamId = "cashier_stream_" + crypto.createHash("sha256")
    .update("reviewed-empty-stream-v1\0" + manifest.review_reference).digest("hex");
  const result = await target.query<{stream_id:string;state:string;last_sequence:string;version:number;replayed:boolean}>(
    "SELECT stream_id,state,last_sequence::text,version,replayed FROM public.fawri_enroll_reviewed_empty_cashier_stream($1,$2::jsonb)",
    [streamId, JSON.stringify(manifest)],
  );
  if (result.rows.length !== 1) throw new OperationalPostgresAuthorityError(
    "CASHIER_ENROLLMENT_FAILED", "reviewed enrollment did not return one stream", 500,
  );
  return result.rows[0];
}
