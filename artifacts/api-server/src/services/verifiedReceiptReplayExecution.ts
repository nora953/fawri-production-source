import {issueMerchantTransactionScope} from "./tenantTransactionScope";
import crypto from 'node:crypto';
import {withReceiptOperatorExecutionTransaction} from './operatorReceiptExecutionPostgresAuthority';
import type {BillingReplayScope} from './billingReplayScope';
import {operationalPostgresAuthorityRequired,OperationalPostgresAuthorityError,type OperationalQueryTarget} from './operationalPostgresAuthority';
import {parseReceiptReplayIntent,confirmReceiptReplay,ReceiptReplayReviewError,type ReviewRow} from './verifiedReceiptReplayReview';
import {applyVerifiedSaasBillingProviderEvent} from './saasBillingAuthority';
import {applyVerifiedCashierBillingProviderEvent} from './cashierBillingAuthority';
import type {SubscriptionPlanCycleTransaction} from './subscriptionPlanCycleAuthority';
import type {SuperQiFetch} from './superQiSandboxTransport';
type ExecutionRow=ReviewRow & {merchant_id:string};
export async function executeVerifiedReceiptReplay(actor:{id:string;sessionId:string;deviceHash:string},eventId:string,body:unknown,fetchImpl?:SuperQiFetch) {
  if(!operationalPostgresAuthorityRequired())throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',503);
  const intent=parseReceiptReplayIntent(eventId,body);
  const transaction = async <T>(work:(client:OperationalQueryTarget)=>Promise<T>):Promise<T> => {
    try { return await withReceiptOperatorExecutionTransaction(work); }
    catch(error) {
      if(error instanceof OperationalPostgresAuthorityError) throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',503);
      if(error instanceof Error && 'status' in error) throw error;
      throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',503);
    }
  };
  const authorize=async(client:SubscriptionPlanCycleTransaction,phase="billing-transaction"):Promise<ExecutionRow>=>{
    const auditId=`billing-execute-${crypto.randomUUID()}`;
    const hash=crypto.createHash('sha256').update(JSON.stringify({auditId,eventId,...intent})).digest('hex');
    try {
      const result=await client.query('SELECT * FROM public.fawri_authorize_verified_receipt_replay($1,$2,$3,$4,$5,$6,$7,$8)',[actor.id,actor.sessionId,actor.deviceHash,eventId,intent.authority,intent.order_id,auditId,hash]);
      if(result.rows.length!==1)throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_CONFLICT',409);
      return result.rows[0] as ExecutionRow;
    }catch(error){
      if(error instanceof ReceiptReplayReviewError)throw error;
      if(error&&typeof error==='object'&&'code' in error&&'message' in error){
        if(error.code==='42501'&&error.message==='verified receipt operator not authorized')throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_PERMISSION_REQUIRED',403);
        if(error.code==='23514'&&error.message==='verified receipt replay conflict')throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_CONFLICT',409);
      }
      const sqlstate=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:'unknown';
      console.warn('RECEIPT_REPLAY_AUTHORIZATION_SQL_FAILURE '+JSON.stringify({phase,sqlstate}));
      throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',503);
    }
  };
  // Commit execution audit and release actor locks before provider I/O.
  const receipt=await transaction(client=>authorize(client,"provider-admission"));
  await confirmReceiptReplay(receipt,fetchImpl);
  const scope:BillingReplayScope={transaction:work=>transaction(async client=>{
    await issueMerchantTransactionScope(client,receipt.merchant_id);
    return work(client);
  }),merchantId:receipt.merchant_id,requestId:receipt.request_ref,firstReceivedAt:receipt.first_received_at,authorize:async(client:SubscriptionPlanCycleTransaction)=>{
    const current=await authorize(client);
    if(JSON.stringify(current)!==JSON.stringify(receipt))throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_CONFLICT',409);
  }};
  const event={provider:'superqi_sandbox' as const,providerEventId:receipt.provider_event_id,orderId:receipt.order_id,eventType:'payment_succeeded' as const,
    signatureVerified:true as const,payloadHash:receipt.payload_hash,occurredAt:new Date(receipt.first_received_at),amountIqd:receipt.amount_iqd,currency:'IQD' as const,providerPaymentRef:receipt.payment_ref};
  // Original receipt admission and entitlement phases remain separate durable commits.
  let outcome;
  try {outcome=intent.authority==='bot_subscription'?await applyVerifiedSaasBillingProviderEvent(event,scope):await applyVerifiedCashierBillingProviderEvent(event,scope);}
  catch(error){const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'unknown';console.warn('RECEIPT_REPLAY_APPLICATION_FAILURE '+JSON.stringify({authority:intent.authority,code}));throw error;}

  if(!['applied','duplicate'].includes(outcome.status))throw new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_RECONCILIATION_REQUIRED',409);
  return {status:outcome.status,receipt_event_id:eventId,order_id:receipt.order_id,authority:intent.authority};
}
