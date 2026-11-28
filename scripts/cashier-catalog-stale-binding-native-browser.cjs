// P0 cashier catalog refresh: a delayed old-station response must never
// resurrect obsolete station credentials or delete data from a new pairing.
// Real Chromium IndexedDB and real operator cloud sync code; HTTP is synthetic.
async function browserPhase(){
  const runtime=await import('/src/lib/cashierOperatorSessionRuntime.ts');
  const {IndexedDbCashierAuthority}=await import('/src/lib/cashierIndexedDbAuthority.ts');
  const {syncCashierOperatorCatalogFromCloud}=await import('/src/lib/cashierOperatorCloudSync.ts');
  const check=(ok,m)=>{if(!ok)throw Error('P0_CATALOG_STALE_BINDING '+m);};
  const same=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m);
  const suffix=crypto.randomUUID();
  const expires=new Date(Date.now()+3600000).toISOString();
  const merchant='catalog-merchant-'+suffix,local='catalog-local-'+suffix;
  const device='catalog-device-'+suffix,station='catalog-old-station-'+suffix;
  const staff='catalog-staff-'+suffix,shift='catalog-shift-'+suffix;
  const identity={
    id:'default',local_merchant_id:local,cloud_merchant_id:merchant,
    created_at:new Date().toISOString(),device_id:device,
    station_id:station,station_name:'Catalog old station',
    location_id:'catalog-shared-location',branch_key:'catalog-branch',
    station_token:'catalog-old-token-'+suffix,
    station_credential_expires_at:expires,
  };
  const config={localMerchantId:local,cloudMerchantId:merchant,
    deviceId:device,databaseName:'fawri-cashier-'+local+'-v1'};
  const authority=new IndexedDbCashierAuthority(config);
  const previous=globalThis.fetch;
  try{
    await runtime.writeCashierDeviceIdentity(identity);
    sessionStorage.setItem('fawri.cashier.operator-session.v1',JSON.stringify({
      operator_token:'synthetic-catalog-operator-token',
      context:{merchant_id:merchant,device_id:device,station_id:station,
        station_name:identity.station_name,station_token:identity.station_token,
        location_id:identity.location_id,branch_key:identity.branch_key,
        operator_session_id:'session-'+suffix,staff_id:staff,shift_id:shift,
        operator_expires_at:expires,credential_expires_at:expires,
        credential_id:'synthetic',credential_version:1,
        role:'cashier',permissions:['sale.create']},
    }));
    await authority.getCatalogItem('does-not-exist');
    const payload={
      ok:true,merchant_id:merchant,device_id:device,station_id:station,
      location_id:identity.location_id,staff_id:staff,shift_id:shift,
      context:{currency_code:'IQD',currency_fraction_digits:0},
      products:[],promotions:[],
    };
    const response=()=>new Response(JSON.stringify(payload),{
      status:200,headers:{'Content-Type':'application/json'},
    });
    let release,requestArrived;
    const pendingFetch=new Promise(resolve=>{requestArrived=resolve;});
    globalThis.fetch=(url,options)=>{
      check(url==='/api/cashier/operator/catalog-snapshot','actual catalog endpoint required');
      check(options.credentials==='omit','operator token must not use cookie credentials');
      requestArrived();
      return new Promise(resolve=>{release=resolve;});
    };
    const slow=syncCashierOperatorCatalogFromCloud().then(
      result=>({ok:true,result}),error=>({ok:false,code:error?.code}),
    );
    await pendingFetch;
    // Another tab re-paired this same physical device while catalog fetch waited.
    const newer={...identity,station_id:'catalog-new-station-'+suffix,
      station_name:'Catalog newer station',station_token:'catalog-new-token-'+suffix};
    await runtime.writeCashierDeviceIdentity(newer);
    release(response());
    const stale=await slow;
    const after=await runtime.getOrCreateCashierDeviceIdentity();
    check(stale.ok===false && stale.code==='CASHIER_OPERATOR_DEVICE_MISMATCH',
      'obsolete catalog response must be refused before touching new station');
    same(after,newer,'stale catalog response must preserve current station/token');
    // Positive non-racing path: same session + matching identity still refresh.
    await runtime.writeCashierDeviceIdentity(identity);
    globalThis.fetch=async()=>response();
    const current=await syncCashierOperatorCatalogFromCloud();
    const positive=await runtime.getOrCreateCashierDeviceIdentity();
    check(current.merchant_id===merchant && current.product_count===0,
      'legitimate catalog refresh must still work');
    check(positive.station_id===station && positive.station_token===identity.station_token,
      'nonracing refresh retains the same station and token');
    check(typeof positive.last_catalog_sync_at==='string' && positive.last_catalog_sync_at.length>0,
      'catalog last sync metadata still stamped after success');
    return {nativeIndexedDb:true,actualCloudCatalogSync:true,
      lateOldStationSnapshotRejected:true,newStationTokenPreserved:true,
      unchangedSessionCatalogRefreshWorks:true,syntheticHttp:true,
      physicalDeviceAttested:false,hostedAccepted:false};
  }finally{
    globalThis.fetch=previous;
    await authority.close();
  }
}

module.exports=async function runCatalogBindingRace(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',{
      waitUntil:'networkidle',
    });
    const data=await page.evaluate(browserPhase);
    console.log('P0_CATALOG_STALE_BINDING_REAL_INDEXEDDB '+JSON.stringify(data));
    return data;
  }finally{await context.close();}
};
