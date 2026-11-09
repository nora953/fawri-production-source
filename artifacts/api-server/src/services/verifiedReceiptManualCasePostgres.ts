import crypto from "node:crypto";
import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

export class VerifiedReceiptManualCaseError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}
type AuthenticatedOperator = { id: string; sessionId: string; deviceHash: string };
const intake = createOperatorDirectoryAuthority({ capability: "receiptManualCaseIntake" });
const escalation = createOperatorDirectoryAuthority({ capability: "receiptManualCaseEscalation" });

function reject(code: string, status: number): never {
  throw new VerifiedReceiptManualCaseError(code,status);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validEventId(value: unknown): value is string {
  // SuperQi confirmed event IDs use a bounded alphanumeric digest identifier.
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/.test(value);
}
function ready(actor: AuthenticatedOperator) {
  if (!operationalPostgresAuthorityRequired()) reject("RECEIPT_CASE_POSTGRES_REQUIRED",503);
  if (!actor.id || !actor.sessionId || !actor.deviceHash ||
      actor.id.length > 180 || actor.sessionId.length > 180 ||
      actor.deviceHash.length < 32 || actor.deviceHash.length > 128) {
    reject("RECEIPT_CASE_PERMISSION_REQUIRED",403);
  }
}
function dbError(error: unknown): never {
  const sqlstate = error && typeof error === "object" && "code" in error
    ? error.code : undefined;
  if (sqlstate === "42501") reject("RECEIPT_CASE_PERMISSION_REQUIRED",403);
  if (sqlstate === "23514" || sqlstate === "23505") reject("RECEIPT_CASE_CONFLICT",409);
  if (sqlstate === "22023") reject("RECEIPT_CASE_INVALID",400);
  reject("RECEIPT_CASE_UNAVAILABLE",503);
}

/**
 * A case is deterministic by trusted receipt provider+event, so a lost HTTP
 * acknowledgment cannot create a second case. Never take merchant, order,
 * provider payment ref or financial instructions from a caller.
 *
 * This module does not auto-enable held migrations or SQL EXECUTE grants.
 * Production remains unavailable until independently reviewed privilege
 * admission, migration and deployment. No refund or entitlement is possible.
 */
export async function openVerifiedReceiptManualCase(
  actor: AuthenticatedOperator, eventId: unknown, body: unknown
) {
  ready(actor);
  if (!validEventId(eventId) || !isObject(body) || Object.keys(body).length !== 0) {
    reject("RECEIPT_CASE_INVALID",400);
  }
  const caseId = "receipt-case-" + crypto.createHash("sha256")
    .update("superqi_sandbox:\0" + eventId,"utf8").digest("hex");
  try {
    const rows = await intake.transaction(async client => {
      const value = await client.query<{
        case_id: string; receipt_event_id: string; case_state: string; applied: boolean;
      }>("SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)",
      [actor.id,actor.sessionId,actor.deviceHash,caseId,eventId]);
      return value.rows;
    });
    if (rows.length !== 1 || rows[0].case_id !== caseId ||
        rows[0].receipt_event_id !== eventId || rows[0].applied !== false ||
        !["UNRESOLVED_HOLD","PROVIDER_REVIEW","PROVIDER_DISPUTE"].includes(rows[0].case_state)) {
      reject("RECEIPT_CASE_UNAVAILABLE",503);
    }
    return {case_id:caseId,receipt_event_id:eventId,status:rows[0].case_state,applied:false};
  } catch (error) {
    if (error instanceof VerifiedReceiptManualCaseError) throw error;
    dbError(error);
  }
}

export async function escalateVerifiedReceiptManualCase(
  actor: AuthenticatedOperator, caseId: unknown, body: unknown
) {
  ready(actor);
  if (typeof caseId !== "string" || !/^receipt-case-[a-f0-9]{64}$/.test(caseId) ||
    !isObject(body) || Object.keys(body).sort().join(",") !== "action,provider_evidence_hash") {
    reject("RECEIPT_CASE_INVALID",400);
  }
  const action = body.action;
  const evidence = body.provider_evidence_hash;
  if (action === "ESCALATE_TO_PROVIDER") {
    if (evidence !== null) reject("RECEIPT_CASE_INVALID",400);
  } else if (action === "RECORD_PROVIDER_DISPUTE") {
    if (typeof evidence !== "string" || !/^[a-f0-9]{64}$/.test(evidence)) {
      reject("RECEIPT_CASE_INVALID",400);
    }
  } else reject("RECEIPT_CASE_INVALID",400);
  const eventId = "case-event-" + crypto.randomUUID();
  try {
    const rows = await escalation.transaction(async client => {
      const value = await client.query<{ state: string }>(
        "SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7) AS state",
        [actor.id,actor.sessionId,actor.deviceHash,caseId,action,eventId,evidence]);
      return value.rows;
    });
    const expected = action === "ESCALATE_TO_PROVIDER" ? "PROVIDER_REVIEW" : "PROVIDER_DISPUTE";
    if (rows.length !== 1 || rows[0].state !== expected) reject("RECEIPT_CASE_UNAVAILABLE",503);
    return {case_id:caseId,status:expected,applied:false,provider_settled:false};
  } catch (error) {
    if (error instanceof VerifiedReceiptManualCaseError) throw error;
    dbError(error);
  }
}
