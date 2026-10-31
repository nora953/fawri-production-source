// GitHub-owned browser context only. Real native IndexedDB and production drain
// clients; fetch responses are an in-browser synthetic ledger, never a server.
async function browserPhase({phase, saved}) {
  const {IndexedDbCashierAuthority} = await import('/src/lib/cashierIndexedDbAuthority.ts');
  const identityRuntime = await import('/src/lib/cashierOperatorSessionRuntime.ts');
  const {syncCashierOutboxToCloud} = await import('/src/lib/cashierCloudOutboxSync.ts');
  const {syncCashierOperatorOutboxToCloud} = await import('/src/lib/cashierOperatorCloudSync.ts');
  const assert = (value, message) => {if (!value) throw new Error('Native outbox: '+message);};
  const same = (a,b,message) => assert(JSON.stringify(a)===JSON.stringify(b),message);
  const request = req => new Promise((ok,no)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);});
  const done = tx => new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error);tx.onerror=()=>no(tx.error);});
  async function snapshot(config) {
    const db=await request(indexedDB.open(config.databaseName));
    try {
      const stores=[...db.objectStoreNames].sort(),tx=db.transaction(stores,'readonly'),completion=done(tx);
      const rows=await Promise.all(stores.map(name=>request(tx.objectStore(name).getAll())));
      await completion;
      return Object.fromEntries(stores.map((name,i)=>[name,rows[i].map(row=>JSON.stringify(row)).sort()]));
    } finally {db.close();}
  }
  async function seed(gap) {
    const suffix=crypto.randomUUID(),identity={id:'default',local_merchant_id:'native-'+suffix,cloud_merchant_id:'synthetic-cloud-'+suffix,device_id:'device-'+suffix,created_at:new Date().toISOString()};
    const config={localMerchantId:identity.local_merchant_id,cloudMerchantId:identity.cloud_merchant_id,deviceId:identity.device_id,databaseName:'fawri-cashier-'+identity.local_merchant_id+'-v1'};
    const authority=new IndexedDbCashierAuthority(config),ops=[];
    try {
      await authority.upsertCatalogSnapshot([{product_id:'product',item_type:'product',name:'Synthetic',track_inventory:true,stock_quantity:5,currency_code:'IQD',currency_fraction_digits:0,base_unit_price_minor:1000,catalog_version:1}],{preserveLocalInventory:false});
      async function sale(){const op='sale-'+crypto.randomUUID();ops.push(op);await authority.commitSale({operation_id:op,payment_method:'cash',payment_status:'paid',lines:[{product_id:'product',quantity:1}]});}
      await sale();
      if(gap){const op='adjust-'+crypto.randomUUID();ops.push(op);await authority.adjustInventory({operation_id:op,product_id:'product',delta:1,reason:'manual_adjustment'});}
      await sale();
      const pending=await authority.listPendingSync();
      same([...new Set(pending.map(x=>x.device_sequence))],gap?[1,2,3]:[1,2],'real local producer sequence');
      assert(pending.length===(gap?5:4),'real operation envelope count');
      assert((await authority.getCatalogItem('product')).stock_quantity===(gap?4:3),'local stock after commits');
    } finally {await authority.close();}
    return {identity,config,ops};
  }
  async function denied(work,code){let seen;try{await work();}catch(error){seen=error.code;}assert(seen===code,'expected '+code+', got '+seen);}
  const originalFetch=globalThis.fetch,calls=[],ledger=new Map(saved?.ledger||[]);
  let loseAck=phase==='prepare';
  globalThis.fetch=async(url,options)=>{
    assert(String(url)==='/api/cashier/sync/sale','only expected synthetic sale transport');
    const body=JSON.parse(options.body);calls.push({operation_id:body.operation_id,sequence:body.device_sequence});
    const serialized=JSON.stringify(body),prior=ledger.get(body.operation_id);
    if(prior!==undefined)assert(prior===serialized,'retry payload must match synthetic accepted operation');
    ledger.set(body.operation_id,serialized);
    if(loseAck){loseAck=false;throw new TypeError('Synthetic response lost after synthetic acceptance');}
    return new Response(JSON.stringify({ok:true,operation_id:body.operation_id,device_sequence:body.device_sequence,order_id:'synthetic-order-'+body.operation_id,replayed:prior!==undefined,accepted_entity_ids:body.envelopes.map(x=>x.entity_id)}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    if(phase==='prepare'){
      const gap=await seed(true),peer=await seed(false),before=await snapshot(gap.config),peerBefore=await snapshot(peer.config);
      const expires=new Date(Date.now()+3600000).toISOString();
      await identityRuntime.writeCashierDeviceIdentity({...gap.identity,station_id:'synthetic-station',station_name:'Synthetic',location_id:'synthetic-location',branch_key:'synthetic',station_token:'synthetic-token',station_credential_expires_at:expires});
      sessionStorage.setItem('fawri.cashier.operator-session.v1',JSON.stringify({operator_token:'synthetic-operator',context:{merchant_id:gap.identity.cloud_merchant_id,device_id:gap.identity.device_id,station_id:'synthetic-station',station_token:'synthetic-token',operator_session_id:'synthetic-session',operator_expires_at:expires,permissions:['sale.create']}}));
      await denied(syncCashierOperatorOutboxToCloud,'CASHIER_OPERATOR_UNSUPPORTED_OPERATION');
      assert(calls.length===0,'operator preflight must send nothing');same(await snapshot(gap.config),before,'operator denial keeps all raw stores');
      await denied(syncCashierOutboxToCloud,'CASHIER_OUTBOX_NETWORK_FAILED');
      same(calls.map(x=>x.sequence),[1],'lost ACK does not advance to later sequence');assert(ledger.size===1,'synthetic acceptance once');
      same(await snapshot(gap.config),before,'lost ACK keeps every native store/envelope');same(await snapshot(peer.config),peerBefore,'peer preserved before reload');
      return {gap,peer,before,peerBefore,ledger:[...ledger],operatorPreflight:true,lostAckPreserved:true};
    }
    const {gap,peer,before,peerBefore}=saved;
    same(await snapshot(gap.config),before,'page reload preserves all native records');same(await snapshot(peer.config),peerBefore,'page reload preserves peer');
    await denied(syncCashierOutboxToCloud,'CASHIER_OUTBOX_UNSUPPORTED_OPERATION');
    same(calls.map(x=>x.sequence),[1],'only exact sequence1 replay before unsupported2');assert(ledger.size===1,'replay does not add synthetic ledger entry');
    const expected={...before,outbox:before.outbox.filter(row=>JSON.parse(row).operation_id!==gap.ops[0])};
    assert(expected.outbox.length===3,'held adjustment2 and both sale3 envelopes');
    same(await snapshot(gap.config),expected,'only completely ACKed operation1 envelopes removed');
    for(let attempt=0;attempt<2;attempt++)await denied(syncCashierOutboxToCloud,'CASHIER_OUTBOX_UNSUPPORTED_OPERATION');
    assert(calls.length===1,'retries at unsupported2 never upload3');same(await snapshot(gap.config),expected,'retries preserve native held operations');same(await snapshot(peer.config),peerBefore,'peer remains exact');
    const positive=await seed(false);await identityRuntime.writeCashierDeviceIdentity(positive.identity);
    const positiveResult=await syncCashierOutboxToCloud();
    assert(positiveResult.uploaded_operations===2&&positiveResult.acknowledged_operations===2&&positiveResult.pending_after===0,'supported queue uploads and ACKs completely');
    same(calls.map(x=>x.sequence),[1,1,2],'positive transport order');same(await snapshot(gap.config),expected,'positive other identity does not clear held queue');
    const authority=new IndexedDbCashierAuthority(positive.config);
    try{assert((await authority.getCatalogItem('product')).stock_quantity===3,'ACK leaves committed stock intact');for(const op of positive.ops)assert(await authority.getSale('sale:'+op),'ACK leaves committed sale intact');}finally{await authority.close();}
    return {nativeIndexedDb:true,realLegacyDrain:true,realOperatorPreflight:true,operatorSessionSynthetic:true,syntheticTransport:true,syntheticLedger:true,postCommitAckLoss:true,actualPageReload:true,heldSequences:[2,3],heldEnvelopes:3,exactReplayPayload:true,peerPreserved:true,positiveUploaded:2,sqlServerProof:false,httpAuthenticationProof:false,recoveryContractAccepted:false,hostedAccepted:false};
  } finally {globalThis.fetch=originalFetch;}
}

module.exports = async function runNativeOutboxRegression(browser) {
  const context=await browser.newContext();
  try {
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',{waitUntil:'networkidle'});
    const saved=await page.evaluate(browserPhase,{phase:'prepare'});
    await page.reload({waitUntil:'networkidle'});
    const report=await page.evaluate(browserPhase,{phase:'verify',saved});
    console.log('P0_NATIVE_OUTBOX_REGRESSION '+JSON.stringify(report));
    return report;
  } finally {await context.close();}
};
