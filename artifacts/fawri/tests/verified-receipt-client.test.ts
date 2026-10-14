import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchVerifiedReceiptPage,ReceiptReadFailure} from '../src/lib/verifiedReceiptClient';
const row = {provider:'superqi_sandbox',provider_event_id:'synthetic-event',event_type:'paid',amount_iqd:25000,first_received_at:'2026-10-14T12:00:00.123456Z',payment_ref_suffix:'12345678',request_ref_suffix:null};
test('receipt request uses cookie/device authority, uncached GET and preserves opaque cursor', async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const request: typeof fetch = async (url,init) => {
    calls++;
    const parsed = new URL(String(url),'http://localhost');
    assert.equal(parsed.pathname,'/api/auth/admin/billing/verified-receipts');
    assert.equal(parsed.searchParams.get('cursor'),'opaque_cursor-123');
    assert.equal(parsed.searchParams.get('limit'),'20');
    assert.equal(init?.method,'GET'); assert.equal(init?.credentials,'same-origin'); assert.equal(init?.cache,'no-store');
    assert.deepEqual(init?.headers,{'X-Fawri-Device-Id':'synthetic-device'}); assert.equal(init?.signal,signal); assert.equal(init?.body,undefined);
    return Response.json({ok:true,receipts:[{...row,payment_ref:'MUST_NOT_KEEP',payload_hash:'MUST_NOT_KEEP'}],next_cursor:'next_opaque'});
  };
  const result = await fetchVerifiedReceiptPage({'X-Fawri-Device-Id':'synthetic-device'},'opaque_cursor-123',signal,request);
  assert.deepEqual(result,{receipts:[row],next_cursor:'next_opaque'}); assert.equal(calls,1);
});
test('denials and outages never consume or expose server error bodies', async () => {
  for (const status of [401,403,500,503]) {
    const request: typeof fetch = async () => new Response('SENSITIVE_DRIVER_DETAIL',{status});
    await assert.rejects(fetchVerifiedReceiptPage({},null,new AbortController().signal,request),error => error instanceof ReceiptReadFailure && error.kind === ([401,403].includes(status)?'denied':'unavailable') && !error.message.includes('SENSITIVE'));
  }
});
test('malformed payload, excessive page and unredacted suffix fail closed', async () => {
  for (const value of [{ok:false,receipts:[],next_cursor:null},{ok:true,receipts:Array(21).fill(row),next_cursor:null},{ok:true,receipts:[{...row,payment_ref_suffix:'FULL_REFERENCE'}],next_cursor:null},{ok:true,receipts:[{...row,amount_iqd:NaN}],next_cursor:null},{ok:true,receipts:[row],next_cursor:42}]) {
    await assert.rejects(fetchVerifiedReceiptPage({},null,new AbortController().signal,async () => Response.json(value)),ReceiptReadFailure);
  }
});
test('empty page remains a successful empty state; aborted request propagates', async () => {
  assert.deepEqual(await fetchVerifiedReceiptPage({},null,new AbortController().signal,async () => Response.json({ok:true,receipts:[],next_cursor:null})),{receipts:[],next_cursor:null});
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchVerifiedReceiptPage({},null,controller.signal,async (_url,init) => {init?.signal?.throwIfAborted(); throw new Error('unexpected');}),{name:'AbortError'});
});
