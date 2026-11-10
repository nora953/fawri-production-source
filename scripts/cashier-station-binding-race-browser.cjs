// P0 native IndexedDB identity race: a pending station/me response must NOT
// overwrite a newer merchant pairing or its durable device identity.
// Synthetic response transport only; real Chromium IndexedDB transaction.
async function stationRaceInRealBrowser() {
  const runtime = await import('/src/lib/cashierOperatorSessionRuntime.ts');
  const recovery = await import('/src/lib/cashierStationBindingRecovery.ts');
  const check = (truth, detail) => {if(!truth) throw new Error('P0_STATION_BINDING_RACE: '+detail);};
  const same = (a,b,detail) => check(JSON.stringify(a)===JSON.stringify(b),detail);
  const initial = await runtime.getOrCreateCashierDeviceIdentity();
  const suffix = crypto.randomUUID();
  const old = {
    ...initial,
    cloud_merchant_id:'p0-merchant-'+suffix,
    station_id:'p0-old-station-'+suffix,
    station_token:'p0-old-token-'+suffix,
    device_id:initial.device_id,
  };
  delete old.location_id;
  delete old.branch_key;
  delete old.station_name;
  await runtime.writeCashierDeviceIdentity(old);
  const newBinding = {
    ...old,
    station_id:'p0-new-station-'+suffix,
    station_token:'p0-new-token-'+suffix,
    station_name:'Newly Paired Station',
    location_id:'p0-new-location',
    branch_key:'p0-new-branch',
  };
  const originalFetch = globalThis.fetch;
  let resolveFetch, started;
  const fetchStarted = new Promise(resolve=>{started=resolve;});
  let requests=0;
  try {
    globalThis.fetch=(url,opts)=>{
      check(url==='/api/cashier/station/me','unexpected URL');
      check(opts?.headers?.['X-Fawri-Cashier-Station-Token']===old.station_token,
        'wrong old token used for legacy hydration');
      requests++;
      started();
      return new Promise(resolve=>{resolveFetch=resolve;});
    };
    const stale = recovery.recoverLegacyCashierStationBinding();
    await fetchStarted;
    // A real IndexedDB write commits WHILE the old HTTP request is pending.
    await runtime.writeCashierDeviceIdentity(newBinding);
    resolveFetch(new Response(JSON.stringify({
      ok:true,station:{
        merchant_id:old.cloud_merchant_id,
        station_id:old.station_id,
        station_name:'Old Stale Station',
        location_id:'old-stale-location',
        branch_key:'old-stale-branch',
        device_id:old.device_id,
        offline_inventory_authority:true,
      },
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const accepted = await stale;
    check(accepted===false,'old pending response overwrote new pairing');
    same(await runtime.getOrCreateCashierDeviceIdentity(),newBinding,
      'newly paired station must stay byte-identical after stale response');
    check(requests===1,'exactly one legacy HTTP query');

    // Identity CAS must also deny any stale metadata mutation at the actual
    // write transaction, not only after a non-atomic read/recheck.
    const staleAttempt = await runtime.writeCashierDeviceIdentityIfUnchanged(old,{
      ...old,station_name:'Forged Old Station',location_id:'forged',
    });
    check(staleAttempt===false,'stale direct compare-and-swap must refuse');
    same(await runtime.getOrCreateCashierDeviceIdentity(),newBinding,
      'CAS denial cannot alter device or station identity');

    // Positive compatible legacy response: original identity never changed.
    await runtime.writeCashierDeviceIdentity(old);
    globalThis.fetch=async()=>new Response(JSON.stringify({
      ok:true,station:{
        merchant_id:old.cloud_merchant_id,
        station_id:old.station_id,
        station_name:'Verified Old Station',
        location_id:'p0-verified-location',
        branch_key:'p0-verified-branch',
        device_id:old.device_id,
        offline_inventory_authority:false,
      },
    }),{status:200,headers:{'Content-Type':'application/json'}});
    check(await recovery.recoverLegacyCashierStationBinding()===true,
      'unchanged station legacy recovery must remain possible');
    const hydrated=await runtime.getOrCreateCashierDeviceIdentity();
    check(hydrated.station_id===old.station_id &&
      hydrated.location_id==='p0-verified-location' &&
      hydrated.station_name==='Verified Old Station' &&
      hydrated.station_token===old.station_token &&
      hydrated.device_id===old.device_id &&
      hydrated.station_credential_expires_at==='9999-12-31T23:59:59.999Z',
      'legitimate recovery must preserve original device/token and hydrate location');

    // Another writer wins the transaction, and a stale expiry refresh fails.
    const concurrent={...hydrated,station_name:'Renamed Concurrent Station'};
    await runtime.writeCashierDeviceIdentity(concurrent);
    check(await runtime.writeCashierDeviceIdentityIfUnchanged(hydrated,{
      ...hydrated,station_credential_expires_at:'9999-12-31T23:59:59.999Z',
    })===false,'stale metadata update must not win after another write');
    same(await runtime.getOrCreateCashierDeviceIdentity(),concurrent,
      'CAS cannot overwrite a concurrent renamed station');
    // Separate P0 bug: an INVALID response for the *old* station token must
    // not clear a brand-new pairing committed while its HTTP request waited.
    // This invokes the exact public recovery routine on real IndexedDB.
    const oldBinding = await runtime.getCashierStationBinding();
    check(oldBinding?.station_id===old.station_id,
      'old failing request must carry captured station binding');
    const replaced = {
      ...concurrent,
      station_id:'p0-repaired-station-'+suffix,
      station_token:'p0-repaired-token-'+suffix,
      station_name:'Fresh Repaired Station',
      location_id:'p0-repaired-location',
      branch_key:'p0-repaired-branch',
    };
    await runtime.writeCashierDeviceIdentity(replaced);
    const oldErrorClear=await recovery.clearInvalidCashierStationBinding(oldBinding);
    check(oldErrorClear===false,
      'stale invalid-credential response must not clear later pairing');
    same(await runtime.getOrCreateCashierDeviceIdentity(),replaced,
      'stale invalidation must leave new station/token intact');

    // A genuinely rejected CURRENT station must still be unpaired. The
    // financial device/merchant identity and all local operation stores stay.
    const currentBinding=await runtime.getCashierStationBinding();
    check(currentBinding?.station_id===replaced.station_id,
      'current request carries current binding');
    const currentErrorClear=await recovery.clearInvalidCashierStationBinding(currentBinding);
    check(currentErrorClear===true,
      'current invalid-credential response must clear only station binding');
    const afterClearing=await runtime.getOrCreateCashierDeviceIdentity();
    check(!afterClearing.station_id && !afterClearing.station_token &&
      !afterClearing.location_id && !afterClearing.branch_key &&
      afterClearing.device_id===replaced.device_id &&
      afterClearing.cloud_merchant_id===replaced.cloud_merchant_id &&
      afterClearing.local_merchant_id===replaced.local_merchant_id,
      'current invalidation must preserve durable identity while unpairing');
    return {
      real_chromium_indexeddb:true,
      old_http_response_overwrite_denied:true,
      new_station_preserved:true,
      stale_transaction_cas_denied:true,
      matching_original_station_hydrated:true,
      canonical_device_identity_preserved:true,
      stale_invalid_credentials_did_not_clear_new_binding:true,
      current_invalid_credentials_cleared_only_station:true,
      synthetic_transport_only:true,
      server_sql_or_http_accepted:false,
      physical_device_attested:false,
      financial_v2_or_hosted_release_authorized:false,
    };
  } finally {
    globalThis.fetch=originalFetch;
  }
}

async function concurrentPairingInRealBrowser() {
  const runtime=await import('/src/lib/cashierOperatorSessionRuntime.ts');
  const assert=(ok,message)=>{if(!ok)throw Error('P0_STATION_CONCURRENT_PAIRING_CAS '+message);};
  const initial=await runtime.getOrCreateCashierDeviceIdentity();
  const original={...initial,cloud_merchant_id:'p0-pair-merchant-'+crypto.randomUUID()};
  // Use already initialized local cashier DB from the smoke test. No local
  // pending receipts exist in this fresh isolated browser context.
  await runtime.writeCashierDeviceIdentity(original);
  const responses=[];
  let ready;
  const bothSent=new Promise(resolve=>{ready=resolve;});
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=(url,options)=>{
      assert(url==='/api/cashier/station/pair','unexpected pairing URL');
      assert(options?.method==='POST','pairing must be POST');
      const body=JSON.parse(options.body);
      assert(body.device_id===original.device_id,'pairing must retain device identity');
      return new Promise(resolve=>{
        responses.push({code:body.pairing_code,resolve});
        if(responses.length===2)ready();
      });
    };
    const first=runtime.pairCashierStation('old-code').then(
      value=>({ok:true,value}),error=>({ok:false,code:error?.code}));
    const second=runtime.pairCashierStation('new-code').then(
      value=>({ok:true,value}),error=>({ok:false,code:error?.code}));
    await bothSent;
    assert(responses.length===2,'two different outstanding HTTP requests required');
    const oldRequest=responses.find(r=>r.code==='old-code');
    const newRequest=responses.find(r=>r.code==='new-code');
    assert(oldRequest&&newRequest,'both pairing requests must be captured');
    const response=(stationId,token)=>new Response(JSON.stringify({
      ok:true,merchant_id:original.cloud_merchant_id,
      station_id:stationId,station_name:stationId,
      location_id:'p0-concurrent-location',branch_key:'p0-concurrent-branch',
      station_token:token,credential_expires_at:'9999-12-31T23:59:59.999Z',
    }),{status:200,headers:{'Content-Type':'application/json'}});
    // The SECOND request is legitimately accepted first while the original
    // HTTP attempt is stalled. The original response must not replace it.
    const currentStation='p0-newer-paired-station';
    const currentToken='p0-newer-station-token';
    newRequest.resolve(response(currentStation,currentToken));
    const accepted=await second;
    assert(accepted.ok===true,'newer pairing must succeed');
    const afterNew=await runtime.getOrCreateCashierDeviceIdentity();
    assert(afterNew.station_id===currentStation &&
      afterNew.station_token===currentToken,'new pairing must commit first');
    oldRequest.resolve(response('p0-old-stale-station','p0-old-stale-token'));
    const stale=await first;
    const final=await runtime.getOrCreateCashierDeviceIdentity();
    assert(stale.ok===false && stale.code==='CASHIER_PAIRING_STALE_RESPONSE',
      'late original response must fail closed, not report a successful re-pair');
    assert(JSON.stringify(final)===JSON.stringify(afterNew),
      'late original response must not overwrite new token/station/metadata');
    return {
      real_chromium_indexeddb:true,synthetic_http_response_only:true,
      late_original_pairing_denied:true,new_station_preserved:true,
      pending_financial_sequence_not_attested:true,
      physical_device_or_hosted_v2_accepted:false,
    };
  }finally{
    globalThis.fetch=originalFetch;
  }
}


// P0 re-pair boundary: the pending-outbox preflight can become stale
// during a slow HTTP pairing response. Commit a REAL offline cashier sale
// while the station/pair request waits, then require denial with no rebind.
async function lateOutboxDuringPairInRealBrowser() {
  const runtime=await import('/src/lib/cashierOperatorSessionRuntime.ts');
  const {IndexedDbCashierAuthority}=await import('/src/lib/cashierIndexedDbAuthority.ts');
  const check=(ok,label)=>{if(!ok)throw Error('P0_PAIRING_LATE_OUTBOX '+label);};
  const suffix=crypto.randomUUID();
  const original={
    id:'default',local_merchant_id:'p0-race-local-'+suffix,
    cloud_merchant_id:'p0-race-merchant-'+suffix,
    device_id:'p0-race-device-'+suffix,
    created_at:new Date().toISOString(),cloud_bound_at:new Date().toISOString(),
    station_id:'p0-original-station-'+suffix,station_name:'Original assigned station',
    location_id:'p0-race-location-'+suffix,branch_key:'p0-branch',
    station_token:'p0-original-token-'+suffix,
    station_credential_expires_at:'9999-12-31T23:59:59.999Z',
  };
  const authority=new IndexedDbCashierAuthority({
    localMerchantId:original.local_merchant_id,
    cloudMerchantId:original.cloud_merchant_id,
    deviceId:original.device_id,
    databaseName:'fawri-cashier-'+original.local_merchant_id+'-v1',
  });
  const priorFetch=globalThis.fetch;
  let resolveRequest,startRequest;
  const requestStarted=new Promise(resolve=>{startRequest=resolve;});
  try{
    await runtime.writeCashierDeviceIdentity(original);
    await authority.upsertCatalogSnapshot([{
      product_id:'p0-item',item_type:'product',name:'Offline synthetic item',
      track_inventory:true,stock_quantity:3,currency_code:'IQD',
      currency_fraction_digits:0,base_unit_price_minor:1000,catalog_version:1,
    }],{preserveLocalInventory:false});
    check((await runtime.getCashierPendingEnvelopeCount())===0,
      'fixture must start without pending sales');
    globalThis.fetch=(url,options)=>{
      check(url==='/api/cashier/station/pair','only pairing endpoint expected');
      check(options?.method==='POST','pairing requires POST');
      const body=JSON.parse(options.body);
      check(body.device_id===original.device_id,'original device must be used');
      startRequest();
      return new Promise(resolve=>{resolveRequest=resolve;});
    };
    const pairing=runtime.pairCashierStation('p0-race-new-pair-code').then(
      value=>({ok:true,value}),error=>({ok:false,code:error?.code}),
    );
    await requestStarted;
    const sale=await authority.commitSale({
      operation_id:'p0-pending-sale-'+suffix,
      payment_method:'cash',payment_status:'paid',
      lines:[{product_id:'p0-item',quantity:1}],
    });
    check(Boolean(sale),'actual IndexedDB sale must commit while HTTP waits');
    const pendingBefore=await authority.listPendingSync(20);
    check(pendingBefore.length>=2,
      'committed sale AND stock movement must be pending before pairing resolves');
    check((await runtime.getCashierPendingEnvelopeCount())===pendingBefore.length,
      'real pairing preflight source must now report pending envelopes');
    resolveRequest(new Response(JSON.stringify({
      ok:true,merchant_id:original.cloud_merchant_id,
      station_id:'p0-new-station-'+suffix,station_name:'New unapproved station',
      location_id:original.location_id,branch_key:original.branch_key,
      station_token:'p0-new-token-'+suffix,
      credential_expires_at:'9999-12-31T23:59:59.999Z',
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const result=await pairing;
    const after=await runtime.getOrCreateCashierDeviceIdentity();
    check(result.ok===false && result.code==='CASHIER_PAIRING_PENDING_OPERATIONS',
      'new unsynced financial operation must block delayed station re-pair');
    check(JSON.stringify(after)===JSON.stringify(original),
      'failed delayed re-pair must retain exact original station/device/token');
    const pendingAfter=await authority.listPendingSync(20);
    check(JSON.stringify(pendingAfter)===JSON.stringify(pendingBefore),
      'pairing denial must not mutate or ACK local sale/movement outbox');
    check(Boolean(await authority.getSale('sale:'+'p0-pending-sale-'+suffix)),
      'original committed sale retained');
    check((await authority.getCatalogItem('p0-item')).stock_quantity===2,
      'source stock must remain reduced exactly once');
    return {
      nativeIndexedDb:true,actualCommittedSale:true,
      pendingSaleAndMovementRetained:true,
      delayedPairingDenied:true,originalBindingUnchanged:true,
      sourceStockPreserved:true,syntheticPairingHttpOnly:true,
      crossDbLinearizableGuarantee:false,hostedOrPhysicalDeviceAccepted:false,
    };
  }finally{
    globalThis.fetch=priorFetch;
    await authority.close();
  }
}

module.exports=async function runStationBindingRace(browser){
  const context=await browser.newContext();
  try {
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',
      {waitUntil:'networkidle'});
    const result=await page.evaluate(stationRaceInRealBrowser);
    console.log('P0_STATION_BINDING_RACE_REAL_INDEXEDDB '+JSON.stringify(result));
    const concurrent=await page.evaluate(concurrentPairingInRealBrowser);
    console.log('P0_STATION_CONCURRENT_PAIRING_CAS_REAL_INDEXEDDB '+JSON.stringify(concurrent));
    const lateOutbox=await page.evaluate(lateOutboxDuringPairInRealBrowser);
    console.log('P0_STATION_PAIRING_LATE_OUTBOX_NATIVE_INDEXEDDB '+JSON.stringify(lateOutbox));
    return {recovery:result,concurrentPairing:concurrent,lateOutbox};
  } finally {await context.close();}
};
