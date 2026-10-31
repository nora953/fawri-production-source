import type {SubscriptionPlanCycleTransaction} from './subscriptionPlanCycleAuthority';
import {SuperQiSandboxProviderError} from './superQiSandboxTransport';
const confirmedProviderScope=Symbol('confirmed-provider-receipt');
type Identity={requestId:string;paymentId:string;eventId:string;eventType:string;amountIqd:number;payloadHash:string};
export type ConfirmedProviderBillingScope=Identity&{readonly [confirmedProviderScope]:true;merchantId:string;orderId:string;authority:'bot_subscription'|'cashier_subscription';firstReceivedAt:string};
const sql='SELECT * FROM public.fawri_resolve_confirmed_payment_order($1,$2,$3,$4,$5,$6)';
const args=(scope:Identity)=>[scope.eventId,scope.paymentId,scope.requestId,scope.eventType,scope.amountIqd,scope.payloadHash];
async function resolve(client:SubscriptionPlanCycleTransaction,identity:Identity){
 try{return await client.query(sql,args(identity));}catch(error){
  const message=error instanceof Error?error.message:'';
  if(/^(SUPERQI_SANDBOX|CASHIER_BILLING)_[A-Z_]+$/.test(message))throw new SuperQiSandboxProviderError(message,'confirmed payment conflicts with durable order identity',/AMBIGUOUS|AUTHORITY_COLLISION/.test(message)?503:409);
  if(error&&typeof error==='object'&&'code' in error&&['42501','42883'].includes(String(error.code)))throw new SuperQiSandboxProviderError('SUPERQI_SANDBOX_ORDER_RESOLVER_UNAVAILABLE','confirmed payment order capability unavailable',503);
  throw error;
 }
}
export async function resolveConfirmedProviderBillingScope(client:SubscriptionPlanCycleTransaction,identity:Identity):Promise<ConfirmedProviderBillingScope|null>{
 const result=await resolve(client,identity);if(result.rows.length===0)return null;
 const row=result.rows[0];
 const merchantId=String(row.merchant_id??''),orderId=String(row.order_id??''),authority=String(row.authority),firstReceivedAt=row.first_received_at instanceof Date?row.first_received_at:new Date(String(row.first_received_at));
 if(result.rows.length!==1||!merchantId||!orderId||!['bot_subscription','cashier_subscription'].includes(authority)||!Number.isFinite(firstReceivedAt.getTime()))throw new Error('invalid confirmed payment order resolution');
 return {...identity,[confirmedProviderScope]:true,merchantId,orderId,authority:authority as ConfirmedProviderBillingScope['authority'],firstReceivedAt:firstReceivedAt.toISOString()};
}
// Separate from operator replay: never substitute an empty authorize callback.
export async function authorizeConfirmedProviderBillingScope(client:SubscriptionPlanCycleTransaction,scope:ConfirmedProviderBillingScope){
 if(scope[confirmedProviderScope]!==true)throw new SuperQiSandboxProviderError('SUPERQI_SANDBOX_CONFIRMED_SCOPE_INVALID','confirmed payment scope invalid',409);
 const resolved=await resolveConfirmedProviderBillingScope(client,scope);
 if(!resolved||resolved.orderId!==scope.orderId||resolved.merchantId!==scope.merchantId||resolved.authority!==scope.authority||resolved.firstReceivedAt!==scope.firstReceivedAt)throw new SuperQiSandboxProviderError('SUPERQI_SANDBOX_ORDER_REFERENCE_CONFLICT','confirmed payment order changed',409);
}
