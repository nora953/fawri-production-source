import { CashierSyncError } from "./postgresCashierSyncAuthority";
import type { OperationalQueryTarget } from "./operationalPostgresAuthority";

export type CashierVersionedStreamContext = {
  streamId: string;
  attribution: {
    merchant_id: string; station_id: string; location_id: string; staff_id: string;
    shift_id: string; device_id: string; credential_id: string; operator_session_id: string;
  };
};
type Operation = {
  merchantId: string; deviceId: string; operationId: string; deviceSequence: number;
  kind: "sale"|"return"|"void"; occurredAt: string; requestHash: string; resultId: string;
};
export type CashierStreamAdmission = Operation & CashierVersionedStreamContext & {replayed:boolean};

// Only an internal server argument enables this prototype. Existing HTTP routes
// never populate it; their unsupported-v2 guard remains unchanged.
export function prepareInternalCashierStreamBody(body: unknown, context: CashierVersionedStreamContext): unknown {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string,unknown> : {};
  if (raw.protocol_version !== 2 || typeof raw.stream_id !== "string" || raw.stream_id !== context.streamId ||
      !context.streamId || context.streamId.length > 200) {
    throw new CashierSyncError("CASHIER_SYNC_PROTOCOL_UNSUPPORTED", "versioned cashier stream identity is required", 409);
  }
  const result = {...raw};delete result.protocol_version;delete result.stream_id;return result;
}

export async function beginCashierStreamOperation(
  target: OperationalQueryTarget, context: CashierVersionedStreamContext, operation: Operation,
): Promise<CashierStreamAdmission> {
  const a=context.attribution;
  if (a.merchant_id!==operation.merchantId || a.device_id!==operation.deviceId) {
    throw new CashierSyncError("CASHIER_STREAM_IDENTITY_CONFLICT","stream attribution identity conflicts",409);
  }
  // Definer capability validates the actual LOGIN and trusted tenant scope,
  // and locks the stream. No direct primary UPDATE grant is introduced.
  const locked=await target.query<{last_sequence:string;version:number}>(
    "SELECT last_sequence::text,version FROM public.fawri_lock_cashier_financial_stream($1,$2,$3)",
    [operation.merchantId,operation.deviceId,context.streamId],
  );
  if(locked.rows.length!==1)throw new CashierSyncError("CASHIER_STREAM_REVIEW_REQUIRED","active reviewed stream required",409);
  const historical=await target.query(
    `SELECT 1 FROM cashier_operator_sessions os
      JOIN cashier_shifts sh ON sh.id=os.shift_id AND sh.merchant_id=os.merchant_id AND sh.station_id=os.station_id AND sh.staff_id=os.staff_id
      JOIN merchant_cashier_stations st ON st.id=os.station_id AND st.merchant_id=os.merchant_id
      JOIN cashier_station_credentials cr ON cr.id=$8 AND cr.station_id=os.station_id AND cr.merchant_id=os.merchant_id AND cr.device_id=$7
      WHERE os.id=$6 AND os.merchant_id=$1 AND os.station_id=$2 AND os.staff_id=$3 AND os.shift_id=$4 AND st.location_id=$5
      AND os.issued_at<=$9 AND os.expires_at>$9 AND (os.revoked_at IS NULL OR os.revoked_at>$9)
      AND cr.issued_at<=$9 AND cr.expires_at>$9 AND (cr.revoked_at IS NULL OR cr.revoked_at>$9)
      AND sh.started_at<=$9 AND (sh.ended_at IS NULL OR sh.ended_at>=$9)`,
    [operation.merchantId,a.station_id,a.staff_id,a.shift_id,a.location_id,a.operator_session_id,operation.deviceId,a.credential_id,new Date(operation.occurredAt)],
  );
  if(historical.rows.length!==1)throw new CashierSyncError("CASHIER_STREAM_ATTRIBUTION_REQUIRED","original historical attribution required",409);
  const time=Date.parse(operation.occurredAt);
  if(time>Date.now()+5*60*1000)throw new CashierSyncError("CASHIER_OPERATION_CLOCK_AHEAD","operation clock is ahead",409);
  const receipts=await target.query<Record<string,unknown>>(
    `SELECT stream_id,device_sequence::text,operation_id,operation_kind,canonical_version,request_hash,result_id,
       station_id,location_id,staff_id,shift_id,occurred_at FROM cashier_operation_receipts
       WHERE merchant_id=$1 AND (operation_id=$2 OR (stream_id=$3 AND device_sequence=$4))`,
    [operation.merchantId,operation.operationId,context.streamId,operation.deviceSequence],
  );
  if(receipts.rows.length){
    const r=receipts.rows[0];
    const same=receipts.rows.length===1 && r.stream_id===context.streamId && r.operation_id===operation.operationId &&
      String(r.device_sequence)===String(operation.deviceSequence) && r.operation_kind===operation.kind &&
      r.canonical_version===1 && r.request_hash===operation.requestHash && r.result_id===operation.resultId &&
      r.station_id===a.station_id && r.location_id===a.location_id && r.staff_id===a.staff_id && r.shift_id===a.shift_id &&
      new Date(r.occurred_at as string).toISOString()===operation.occurredAt;
    if(!same)throw new CashierSyncError("CASHIER_STREAM_IDENTITY_CONFLICT","immutable stream receipt conflicts",409);
    return {...operation,...context,replayed:true};
  }
  const last=Number(locked.rows[0].last_sequence);
  if(operation.deviceSequence<=last)throw new CashierSyncError("CASHIER_STREAM_RECONCILIATION_REQUIRED","missing original receipt requires review",409);
  if(operation.deviceSequence!==last+1)throw new CashierSyncError("CASHIER_STREAM_SEQUENCE_GAP","next contiguous operation required",409,{expected_sequence:last+1});
  const previous=await target.query<{occurred_at:string}>(
    "SELECT occurred_at FROM cashier_operation_receipts WHERE merchant_id=$1 AND stream_id=$2 AND device_sequence=$3",
    [operation.merchantId,context.streamId,last],
  );
  if(last>0 && previous.rows.length!==1)throw new CashierSyncError("CASHIER_STREAM_RECONCILIATION_REQUIRED","checkpoint receipt unavailable",409);
  if(previous.rows[0] && time+2*60*1000<new Date(previous.rows[0].occurred_at).getTime())throw new CashierSyncError("CASHIER_OPERATION_CLOCK_ROLLBACK","operation clock moved backwards",409);
  return {...operation,...context,replayed:false};
}

export async function persistCashierStreamReceipt(
  target: OperationalQueryTarget, admission: CashierStreamAdmission,
): Promise<void>{
  if(admission.replayed)return;
  const a=admission.attribution;
  await target.query("SELECT public.fawri_commit_cashier_financial_receipt($1::jsonb)",[JSON.stringify({
    stream_id:admission.streamId,merchant_id:admission.merchantId,device_id:admission.deviceId,
    device_sequence:admission.deviceSequence,operation_id:admission.operationId,operation_kind:admission.kind,
    request_hash:admission.requestHash,result_id:admission.resultId,station_id:a.station_id,
    location_id:a.location_id,staff_id:a.staff_id,shift_id:a.shift_id,occurred_at:admission.occurredAt,
    operator_session_id:a.operator_session_id,credential_id:a.credential_id,
  })]);
}
