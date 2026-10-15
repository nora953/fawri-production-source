export type ReceiptReplayIntent={authority:'bot_subscription'|'cashier_subscription';order_id:string};
export class ReceiptReplayFailure extends Error {
  constructor(readonly kind:'denied'|'conflict'|'unavailable'|'uncertain'){super(kind);}
}
export async function sendReceiptReplayAction(action:'replay-review'|'replay',eventId:string,intent:ReceiptReplayIntent,headers:Record<string,string>,signal:AbortSignal,request:typeof fetch=fetch) {
  if(!eventId||eventId.length>300||!['bot_subscription','cashier_subscription'].includes(intent.authority)||!intent.order_id||intent.order_id.length>180)throw new ReceiptReplayFailure('conflict');
  let response:Response;
  try {response=await request(`/api/auth/admin/billing/verified-receipts/${encodeURIComponent(eventId)}/${action}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},signal,body:JSON.stringify({authority:intent.authority,order_id:intent.order_id})});}
  catch(error){if(signal.aborted)throw error;throw new ReceiptReplayFailure(action==='replay'?'uncertain':'unavailable');}
  if(!response.ok)throw new ReceiptReplayFailure(response.status===401||response.status===403?'denied':response.status===409||response.status===400?'conflict':action==='replay'?'uncertain':'unavailable');
  let value;
  try {value=await response.json();}catch{throw new ReceiptReplayFailure(action==='replay'?'uncertain':'unavailable');}
  if(value?.ok!==true||value.receipt_event_id!==eventId||value.order_id!==intent.order_id||value.authority!==intent.authority||
    (action==='replay-review'?value.status!=='verified'||value.applied!==false:!['applied','duplicate'].includes(value.status)))throw new ReceiptReplayFailure(action==='replay'?'uncertain':'unavailable');
  return {status:value.status as 'verified'|'applied'|'duplicate'};
}
