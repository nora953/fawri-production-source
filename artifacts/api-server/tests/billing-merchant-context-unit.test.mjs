import assert from 'node:assert/strict';
import test,{after} from 'node:test';
const values={NODE_ENV:'test',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_SAAS_BILLING_PROVIDER:'test_fake',FAWRI_SAAS_BILLING_PROVIDERS:'test_fake',DATABASE_URL:undefined};
const before=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
for(const [k,v]of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
after(()=>{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const {applyVerifiedSaasBillingProviderEvent}=await import('../src/services/saasBillingAuthority.ts');
const {applyVerifiedCashierBillingProviderEvent}=await import('../src/services/cashierBillingAuthority.ts');
const event={provider:'test_fake',providerEventId:'owned-context-event',orderId:'owned-context-order',eventType:'payment_succeeded',signatureVerified:true,payloadHash:'a'.repeat(64),occurredAt:new Date(),amountIqd:3900,currency:'IQD'};
for(const [kind,apply]of [['saas',applyVerifiedSaasBillingProviderEvent],['cashier',applyVerifiedCashierBillingProviderEvent]]){
  test(`${kind}: direct calls require explicit merchant context before opening a database`,async()=>{
    for(const merchantId of [undefined,'','   ','x'.repeat(201)])await assert.rejects(()=>apply({...event,merchantId}),error=>error.status===400&&error.code===`${kind.toUpperCase()}_BILLING_INPUT_INVALID`);
  });
  test(`${kind}: merchant context cannot bypass signature or currency validation`,async()=>{
    await assert.rejects(()=>apply({...event,merchantId:'owned-a',signatureVerified:false}),error=>error.status===401);
    await assert.rejects(()=>apply({...event,merchantId:'owned-a',currency:'USD'}),error=>error.status===409);
  });
}
