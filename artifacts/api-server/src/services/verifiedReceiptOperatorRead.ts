import { withReceiptOperatorReadTransaction } from "./operatorReceiptReadPostgresAuthority";
import crypto from "node:crypto";
import { operationalPostgresAuthorityRequired, operationalQueryRows } from "./operationalPostgresAuthority";

export class ReceiptOperatorReadError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
type ReceiptRow = {
  provider: string; provider_event_id: string; event_type: string; amount_iqd: number;
  first_received_at: string; payment_ref_suffix: string | null; request_ref_suffix: string | null;
};
function invalid(): never { throw new ReceiptOperatorReadError("RECEIPT_READ_QUERY_INVALID",400); }

export async function readVerifiedReceiptsForOperator(actorId: string, query: Record<string, unknown>) {
  if (!operationalPostgresAuthorityRequired()) throw new ReceiptOperatorReadError("RECEIPT_OPERATOR_POSTGRES_REQUIRED",503);
  if (Object.keys(query).some(key => key !== "limit" && key !== "cursor")) invalid();
  const rawLimit = query.limit === undefined ? "20" : query.limit;
  if (typeof rawLimit !== "string" || !/^[1-9][0-9]?$/.test(rawLimit)) invalid();
  const limit = Number(rawLimit);
  if (limit > 50) invalid();
  let before: string | null = null, beforeId: string | null = null;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== "string" || query.cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) invalid();
    try {
      const value = JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8"));
      if (!value || Array.isArray(value) || Object.keys(value).sort().join(",") !== "event_id,first_received_at" ||
          typeof value.event_id !== "string" || value.event_id.length < 1 || value.event_id.length > 300 ||
          typeof value.first_received_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.first_received_at)) invalid();
      const parsed = new Date(value.first_received_at);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,19) !== value.first_received_at.slice(0,19)) invalid();
      // Keep all six fractional digits; Date conversion would truncate them.
      before = value.first_received_at; beforeId = value.event_id;
    } catch { invalid(); }
  }
  const auditId = `billing-receipts-${crypto.randomUUID()}`;
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({auditId,limit,before,beforeId})).digest("hex");
  try {
    const rows = await withReceiptOperatorReadTransaction(database => operationalQueryRows<ReceiptRow>(database,
      "SELECT * FROM public.fawri_read_verified_payment_receipts($1,$2,$3,$4,$5,$6)",
      [actorId,limit+1,before,beforeId,auditId,requestHash]));
    const receipts = rows.slice(0,limit), last = receipts.at(-1);
    const nextCursor = rows.length > limit && last
      ? Buffer.from(JSON.stringify({first_received_at:last.first_received_at,event_id:last.provider_event_id})).toString("base64url") : null;
    return {receipts,next_cursor:nextCursor};
  } catch (error) {
    if (error instanceof ReceiptOperatorReadError) throw error;
    if (error && typeof error === "object" && "code" in error && "message" in error &&
        error.code === "42501" && error.message === "verified receipt operator not authorized") {
      throw new ReceiptOperatorReadError("RECEIPT_OPERATOR_PERMISSION_REQUIRED",403);
    }
    throw new ReceiptOperatorReadError("RECEIPT_OPERATOR_READ_UNAVAILABLE",503);
  }
}
