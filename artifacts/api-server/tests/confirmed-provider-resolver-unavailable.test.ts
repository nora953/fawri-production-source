import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveConfirmedProviderBillingScope} from '../src/services/confirmedProviderBillingScope.ts';

const identity={
  requestId:'synthetic-request',paymentId:'synthetic-payment',
  eventId:'synthetic-event',eventType:'SUCCESS',amountIqd:3900,
  payloadHash:'synthetic-payload-hash',
};

for(const sqlstate of ['42501','42883']){
  test(`confirmed payment resolver fails closed on PostgreSQL ${sqlstate}`,async()=>{
    let calls=0;
    const client={query:async(sql,args)=>{
      calls++;
      assert.equal(sql,'SELECT * FROM public.fawri_resolve_confirmed_payment_order($1,$2,$3,$4,$5,$6)');
      assert.deepEqual(args,[identity.eventId,identity.paymentId,identity.requestId,identity.eventType,identity.amountIqd,identity.payloadHash]);
      throw Object.assign(new Error('synthetic PostgreSQL failure'),{code:sqlstate});
    }};
    await assert.rejects(
      resolveConfirmedProviderBillingScope(client as never,identity),
      error=>error?.code==='SUPERQI_SANDBOX_ORDER_RESOLVER_UNAVAILABLE'&&error?.status===503,
    );
    assert.equal(calls,1);
  });
}
