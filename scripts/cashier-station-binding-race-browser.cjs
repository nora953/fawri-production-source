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
module.exports=async function runStationBindingRace(browser){
  const context=await browser.newContext();
  try {
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',
      {waitUntil:'networkidle'});
    const result=await page.evaluate(stationRaceInRealBrowser);
    console.log('P0_STATION_BINDING_RACE_REAL_INDEXEDDB '+JSON.stringify(result));
    return result;
  } finally {await context.close();}
};
