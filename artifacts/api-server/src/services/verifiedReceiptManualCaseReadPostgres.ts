import crypto from "node:crypto";
import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";
import { VerifiedReceiptManualCaseError } from "./verifiedReceiptManualCasePostgres";

type Operator = { id: string; sessionId: string; deviceHash: string };
type QueueRow = { case_id: string; receipt_event_id: string; case_state: string;
  opened_at: string; last_changed_at: string };
type HistoryRow = { event_sequence: string; event_action: string; case_state: string;
  actor_id: string; provider_evidence_hash: string | null; recorded_at: string };

const queueCapability = createOperatorDirectoryAuthority({ capability: "receiptManualCaseList" });
const historyCapability = createOperatorDirectoryAuthority({ capability: "receiptManualCaseHistory" });

function deny(code: string,status: number): never {
  throw new VerifiedReceiptManualCaseError(code,status);
}
function guard(actor: Operator) {
  if (!operationalPostgresAuthorityRequired()) deny("RECEIPT_CASE_POSTGRES_REQUIRED",503);
  if (!actor.id || !actor.sessionId || !actor.deviceHash ||
    actor.id.length > 180 || actor.sessionId.length > 180 ||
    actor.deviceHash.length < 32 || actor.deviceHash.length > 128) {
    deny("RECEIPT_CASE_PERMISSION_REQUIRED",403);
  }
}
function invalid(): never { deny("RECEIPT_CASE_QUERY_INVALID",400); }
function onError(error: unknown): never {
  if (error instanceof VerifiedReceiptManualCaseError) throw error;
  const state = error && typeof error === "object" && "code" in error ? error.code : null;
  if (state === "42501") deny("RECEIPT_CASE_PERMISSION_REQUIRED",403);
  if (state === "22023") invalid();
  if (state === "23514") deny("RECEIPT_CASE_NOT_FOUND",404);
  deny("RECEIPT_CASE_READ_UNAVAILABLE",503);
}
function limitOf(query: Record<string,unknown>): number {
  const raw = query.limit === undefined ? "20" : query.limit;
  if (typeof raw !== "string" || !/^[1-9][0-9]?$/.test(raw) || Number(raw)>50) invalid();
  return Number(raw);
}
function parseCursor(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  try {
    const decoded = Buffer.from(value,"base64url").toString("utf8");
    // Prevent accepting alternate base64 representation / extra trailing bytes.
    if (Buffer.from(decoded,"utf8").toString("base64url")!==value) invalid();
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
    return parsed as Record<string,unknown>;
  } catch { invalid(); }
}
function isoMicroseconds(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) return false;
  const t=new Date(value);
  return Number.isFinite(t.getTime()) && t.toISOString().slice(0,19)===value.slice(0,19);
}
function encoded(value: Record<string,string>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function audit(prefix: string, input: unknown) {
  const id = prefix + crypto.randomUUID();
  const hash = crypto.createHash("sha256").update(JSON.stringify({id,input})).digest("hex");
  return {id,hash};
}
function validState(value: unknown): value is string {
  return value==="UNRESOLVED_HOLD" || value==="PROVIDER_REVIEW" || value==="PROVIDER_DISPUTE";
}

/** Explicit operator read capability: no raw receipt/provider credentials, no direct SELECT grant. */
export async function listVerifiedReceiptManualCases(actor:Operator, query:Record<string,unknown>) {
  guard(actor);
  if (Object.keys(query).some(k=>k!=="limit" && k!=="cursor")) invalid();
  const limit=limitOf(query);
  let beforeAt:string|null=null,beforeId:string|null=null;
  if (query.cursor!==undefined) {
    const c=parseCursor(query.cursor);
    if (Object.keys(c).sort().join(",")!=="case_id,opened_at" ||
       typeof c.case_id!=="string" || !/^receipt-case-[0-9a-f]{64}$/.test(c.case_id) ||
       !isoMicroseconds(c.opened_at)) invalid();
    beforeAt=c.opened_at as string;
    beforeId=c.case_id;
  }
  const evidence=audit("case-queue-", {limit,beforeAt,beforeId});
  try {
    const result=await queueCapability.transaction(client=>client.query<QueueRow>(
      "SELECT * FROM public.fawri_list_verified_receipt_manual_cases($1,$2,$3,$4,$5,$6,$7,$8)",
      [actor.id,actor.sessionId,actor.deviceHash,limit+1,beforeAt,beforeId,evidence.id,evidence.hash]));
    const rows=result.rows.slice(0,limit), last=rows.at(-1);
    for(const item of rows) {
      if(!/^receipt-case-[a-f0-9]{64}$/.test(item.case_id) ||
         typeof item.receipt_event_id!=="string" || !validState(item.case_state) ||
         !isoMicroseconds(item.opened_at) || !isoMicroseconds(item.last_changed_at)) {
        deny("RECEIPT_CASE_READ_UNAVAILABLE",503);
      }
    }
    const cursor=result.rows.length>limit && last
      ? encoded({case_id:last.case_id,opened_at:last.opened_at}) : null;
    return {cases:rows,next_cursor:cursor};
  } catch(error) { onError(error); }
}

/** Independent audited history read; no ability to mark a provider outcome or refund. */
export async function readVerifiedReceiptManualCaseHistory(
  actor:Operator,caseId:unknown,query:Record<string,unknown>
) {
  guard(actor);
  if(typeof caseId!=="string" || !/^receipt-case-[a-f0-9]{64}$/.test(caseId) ||
     Object.keys(query).some(k=>k!=="limit" && k!=="cursor")) invalid();
  const limit=limitOf(query);
  let before:string|null=null;
  if(query.cursor!==undefined) {
    const c=parseCursor(query.cursor);
    if(Object.keys(c).join(",")!=="sequence" || typeof c.sequence!=="string" ||
      !/^[1-9][0-9]{0,18}$/.test(c.sequence) ||
      BigInt(c.sequence)>9223372036854775807n) invalid();
    before=c.sequence;
  }
  const evidence=audit("case-history-", {caseId,limit,before});
  try {
    const result=await historyCapability.transaction(client=>client.query<HistoryRow>(
      "SELECT * FROM public.fawri_read_verified_receipt_manual_case_history($1,$2,$3,$4,$5,$6,$7,$8)",
      [actor.id,actor.sessionId,actor.deviceHash,caseId,limit+1,before,evidence.id,evidence.hash]));
    const rows=result.rows.slice(0,limit),last=rows.at(-1);
    for(const item of rows) {
      const n=String(item.event_sequence);
      if(!/^[1-9][0-9]{0,18}$/.test(n) || !validState(item.case_state) ||
         !["OPEN_HOLD","ESCALATE_TO_PROVIDER","RECORD_PROVIDER_DISPUTE"].includes(item.event_action) ||
         !isoMicroseconds(item.recorded_at) ||
         typeof item.actor_id!=="string" ||
         (item.provider_evidence_hash!==null && !/^[a-f0-9]{64}$/.test(item.provider_evidence_hash))) {
        deny("RECEIPT_CASE_READ_UNAVAILABLE",503);
      }
      item.event_sequence=n;
    }
    return {case_id:caseId,events:rows,next_cursor:result.rows.length>limit && last
      ?encoded({sequence:String(last.event_sequence)}):null};
  }catch(error){onError(error);}
}
