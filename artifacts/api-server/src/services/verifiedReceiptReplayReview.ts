import crypto from 'node:crypto';
import {withReceiptOperatorReviewTransaction} from './operatorReceiptReviewPostgresAuthority';
import {operationalQueryRows,operationalPostgresAuthorityRequired} from './operationalPostgresAuthority';
import {getSuperQiSandboxPaymentStatus,getSuperQiSandboxPublicState,superQiWebhookPayloadHash,type SuperQiFetch} from './superQiSandboxTransport';
import {superQiConfirmedProviderEventId} from './superQiSandboxWebhook';
export class ReceiptReplayReviewError extends Error {
  constructor(readonly code: string,readonly status: number) {super(code);}
}
export type ReviewRow={provider:string;provider_event_id:string;payment_ref:string;request_ref:string;event_type:string;amount_iqd:number;payload_hash:string;first_received_at:string;order_id:string;authority:string};
function fail(code:string,status:number):never {throw new ReceiptReplayReviewError(code,status);}
export async function reviewVerifiedReceiptReplay(actorId:string,eventId:string,body:unknown,fetchImpl?:SuperQiFetch) {
  if (!operationalPostgresAuthorityRequired()) fail('RECEIPT_REPLAY_REVIEW_UNAVAILABLE',503);
  const value=parseReceiptReplayIntent(eventId,body);
  const review=async()=>{
    const auditId=`billing-review-${crypto.randomUUID()}`;
    const hash=crypto.createHash('sha256').update(JSON.stringify({auditId,eventId,authority:value.authority,orderId:value.order_id})).digest('hex');
    try {
      const rows=await withReceiptOperatorReviewTransaction(database=>operationalQueryRows<ReviewRow>(database,'SELECT * FROM public.fawri_review_verified_payment_receipt($1,$2,$3,$4,$5,$6)',[actorId,eventId,value.authority,value.order_id,auditId,hash]));
      if(rows.length!==1) fail('RECEIPT_REPLAY_REVIEW_CONFLICT',409);
      return rows[0];
    }catch(error){
      if(error instanceof ReceiptReplayReviewError) throw error;
      if(error&&typeof error==='object'&&'code' in error&&'message' in error&&error.code==='42501'&&error.message==='verified receipt operator not authorized') fail('RECEIPT_REPLAY_REVIEW_PERMISSION_REQUIRED',403);
      fail('RECEIPT_REPLAY_REVIEW_UNAVAILABLE',503);
    }
  };
  // Commit the audit before provider I/O; never keep actor locks across the network.
  const receipt=await review();
  await confirmReceiptReplay(receipt,fetchImpl);
  // Fresh authorization/mapping check after provider I/O; review authorizes no later grant.
  const current=await review();
  if(JSON.stringify(current)!==JSON.stringify(receipt)) fail('RECEIPT_REPLAY_REVIEW_CONFLICT',409);
  return {status:'verified' as const,applied:false as const,receipt_event_id:eventId,order_id:current.order_id,authority:current.authority};
}

export function parseReceiptReplayIntent(eventId:string,body:unknown) {
  if (!eventId || eventId.length>300 || !body || typeof body!=='object' || Array.isArray(body)) fail('RECEIPT_REPLAY_REVIEW_INVALID',400);
  const value=body as Record<string,unknown>;
  if (Object.keys(value).sort().join(',')!=='authority,order_id' || (typeof value.authority!=='string'||!['bot_subscription','cashier_subscription'].includes(value.authority)) ||
      typeof value.order_id!=='string' || !value.order_id || value.order_id.length>180) fail('RECEIPT_REPLAY_REVIEW_INVALID',400);
  return value as {authority:'bot_subscription'|'cashier_subscription';order_id:string};
}
export async function confirmReceiptReplay(receipt:ReviewRow,fetchImpl?:SuperQiFetch) {
  if(receipt.event_type!=='payment_succeeded') fail('RECEIPT_REPLAY_REVIEW_CONFLICT',409);
  if(!getSuperQiSandboxPublicState().checkout_available) fail('RECEIPT_REPLAY_REVIEW_UNAVAILABLE',503);
  let confirmed;
  try {confirmed=await getSuperQiSandboxPaymentStatus(receipt.payment_ref,fetchImpl);}catch {fail('RECEIPT_REPLAY_REVIEW_PROVIDER_UNAVAILABLE',503);}
  if(confirmed.status!=='SUCCESS'||confirmed.canceled||confirmed.requestId!==receipt.request_ref||confirmed.amount!==receipt.amount_iqd||
      (confirmed.confirmedAmount??confirmed.amount)!==receipt.amount_iqd||confirmed.currency!=='IQD'||
      superQiConfirmedProviderEventId(confirmed)!==receipt.provider_event_id||superQiWebhookPayloadHash(confirmed)!==receipt.payload_hash) fail('RECEIPT_REPLAY_REVIEW_CONFLICT',409);
}
