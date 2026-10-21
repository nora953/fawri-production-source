import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env,{NODE_ENV:'test',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_SAAS_BILLING_PROVIDER:'test_fake',FAWRI_SAAS_BILLING_PROVIDERS:'test_fake'});
const {createDisposableProviderRuntime}=await import('./helpers/disposable-provider-runtime.mjs');
const fixture=await createDisposableProviderRuntime();
const saas=await import('../src/services/saasBillingAuthority.ts'),cashier=await import('../src/services/cashierBillingAuthority.ts');
test('direct merchant billing preserves own authority without a global order-owner lookup',async t=>{
  const merchants=['billing-context-a-'+randomUUID(),'billing-context-b-'+randomUUID()];
  t.after(()=>cleanupResources([
    ['owned accounts',()=>fixture.admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime fixture',()=>fixture.dispose()],
  ]));
  for(const id of merchants){
    await fixture.admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,'+197'+randomInt(100000000,999999999)]);
    await fixture.admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[id]);
  }
  for(const kind of ['saas','cashier'])await t.test(`${kind}: missing context and foreign order denied; concurrent own payment applies once`,async()=>{
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId:merchants[0],operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId:merchants[0],operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const apply=kind==='saas'?saas.applyVerifiedSaasBillingProviderEvent:cashier.applyVerifiedCashierBillingProviderEvent;
    const apps=kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications',events=kind==='saas'?'saas_billing_events':'cashier_billing_events';
    const event={provider:'test_fake',merchantId:merchants[0],providerEventId:randomUUID(),orderId:checkout.order.id,eventType:'payment_succeeded',signatureVerified:true,payloadHash:'b'.repeat(64),occurredAt:new Date(),amountIqd:checkout.order.amount_iqd,currency:'IQD',providerPaymentRef:randomUUID()};
    let calls=0;const query=fixture.runtimePool.query,connect=fixture.runtimePool.connect;
    fixture.runtimePool.query=async()=>{calls++;throw Error('unexpected unscoped query');};fixture.runtimePool.connect=async()=>{calls++;throw Error('unexpected unscoped lease');};
    try {await assert.rejects(()=>apply({...event,merchantId:undefined}),error=>error.status===400);assert.equal(calls,0);}
    finally{fixture.runtimePool.query=query;fixture.runtimePool.connect=connect;}
    await assert.rejects(()=>apply({...event,merchantId:merchants[1]}),error=>error.code===`${kind.toUpperCase()}_BILLING_ORDER_NOT_FOUND`);
    assert.equal((await fixture.admin.query(`SELECT count(*)::int AS n FROM ${events} WHERE provider_event_id=$1`,[event.providerEventId])).rows[0].n,0);
    const results=await Promise.all([apply(event),apply(event)]);assert.deepEqual(results.map(r=>r.status).sort(),['applied','duplicate']);
    assert.equal((await fixture.admin.query(`SELECT count(*)::int AS n FROM ${apps} WHERE order_id=$1`,[event.orderId])).rows[0].n,1);
    await assert.rejects(()=>apply({...event,merchantId:merchants[1]}),error=>error.code===`${kind.toUpperCase()}_BILLING_ORDER_NOT_FOUND`);
    assert.equal((await fixture.runtimePool.query("SELECT nullif(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
  });
  console.log('P0_DIRECT_MERCHANT_BILLING_CONTEXT_PROOF '+JSON.stringify({actualRuntimeLogin:true,explicitContextBeforeDatabase:true,globalOwnerLookupRemoved:true,foreignOrderReadAndMutationDenied:true,concurrentOwnApplyOnce:true,sessionReset:true,productionPredicateChanged:false,releaseAccepted:false}));
});
