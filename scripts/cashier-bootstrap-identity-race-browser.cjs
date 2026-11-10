// P0 cashier local identity creation in multiple same-origin tabs.
// This exercises real getOrCreateCashierDeviceIdentity and Chromium IndexedDB,
// with no server, credentials, production data or synthetic identity override.
module.exports=async function runCashierBootstrapIdentityRace(browser){
  const context=await browser.newContext();
  try {
    const pages=await Promise.all([context.newPage(),context.newPage()]);
    for(const page of pages)await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',{waitUntil:'networkidle'});
    const initialize=async(page)=>page.evaluate(async()=>{
      const req=indexedDB.deleteDatabase('fawri-cashier-bootstrap-v1');
      return new Promise((resolve,reject)=>{
        req.onsuccess=()=>resolve(true);
        req.onerror=()=>reject(req.error);
        req.onblocked=()=>reject(new Error('P0_BOOTSTRAP_DELETE_BLOCKED'));
      });
    });
    await initialize(pages[0]);
    const values=await Promise.all(pages.map(page=>page.evaluate(async()=>{
      const runtime=await import('/src/lib/cashierOperatorSessionRuntime.ts');
      const results=await Promise.all(Array.from({length:24},()=>runtime.getOrCreateCashierDeviceIdentity()));
      return results;
    })));
    const all=values.flat();
    const identifiers=all.map(x=>x.local_merchant_id+'|'+x.device_id+'|'+x.created_at);
    const distinct=[...new Set(identifiers)];
    const persisted=await Promise.all(pages.map(p=>p.evaluate(async()=>{
      const runtime=await import('/src/lib/cashierOperatorSessionRuntime.ts');
      return runtime.getOrCreateCashierDeviceIdentity();
    })));
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    if(distinct.length!==1)throw Error('P0_BOOTSTRAP_CONCURRENT_CREATE_LOST_IDENTITY '+JSON.stringify({
      distinct_created_identifiers:distinct.length,instances:all.length,
      persisted_match:identifiers.includes(persisted[0].local_merchant_id+'|'+persisted[0].device_id+'|'+persisted[0].created_at)
    }));
    if(!same(persisted[0],persisted[1])||!same(all[0],persisted[0]))
      throw Error('P0_BOOTSTRAP_CONCURRENT_CREATE_PERSISTENCE_MISMATCH');
    for(const x of all){
      if(x.id!=='default'||!x.device_id||!x.local_merchant_id||
         !same(x,persisted[0]))throw Error('P0_BOOTSTRAP_CREATED_IDENTITY_DRIFT');
    }
    console.log('P0_CASHIER_BOOTSTRAP_ATOMIC_CREATE_REAL_INDEXEDDB '+JSON.stringify({
      nativeIndexedDb:true,realChromium:true,independentTabs:2,
      simultaneousCallers:all.length,uniqueIdentities:distinct.length,
      stableAcrossBothTabs:true,serverAcceptance:false,physicalDeviceAcceptance:false
    }));
  }finally{await context.close();}
};
