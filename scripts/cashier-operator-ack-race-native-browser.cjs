// P0 cashier operator full-drain / local ACK race rehearsal.
// Native Chromium IndexedDB, actual operator sync client, SYNTHETIC HTTP ONLY.
// Does not prove real hosted cashier provider, real device or financial receipt.
async function browserPhase() {
  const {IndexedDbCashierAuthority}=await import('/src/lib/cashierIndexedDbAuthority.ts');
  const operatorSecurity=await import('/src/lib/cashierOperatorLocalSecurity.ts');
  const sessionRuntime=await import('/src/lib/cashierOperatorSessionRuntime.ts');
  const {syncCashierOperatorOutboxToCloud}=await import('/src/lib/cashierOperatorCloudSync.ts');
  const assert=(condition,label)=>{if(!condition)throw Error('OPERATOR_NATIVE_ACK_RACE: '+label);};
  const same=(a,b,label)=>assert(JSON.stringify(a)===JSON.stringify(b),label);
  const request=req=>new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  const completion=tx=>new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  const suffix=crypto.randomUUID(),expires=new Date(Date.now()+3600000).toISOString();
  const localId='native-operator-'+suffix,merchantId='native-merchant-'+suffix;
  const deviceId='device-'+suffix,stationId='station-'+suffix,staffId='staff-'+suffix;
  const identity={
    id:'default',local_merchant_id:localId,cloud_merchant_id:merchantId,device_id:deviceId,
    created_at:new Date().toISOString(),station_id:stationId,station_name:'Synthetic',
    location_id:'location-'+suffix,branch_key:'ci',station_token:'synthetic-station-token',
    station_credential_expires_at:expires,
  };
  const config={localMerchantId:localId,cloudMerchantId:merchantId,deviceId,
    databaseName:'fawri-cashier-'+localId+'-v1'};
  const authority=new IndexedDbCashierAuthority(config);
  const firstId='sale-'+crypto.randomUUID(),secondId='sale-'+crypto.randomUUID();
  const state={calls:0,inject:true,accepted:new Map(),injected:false};
  const beforeFetch=globalThis.fetch;
  let database;
  async function readOutbox(){
    const db=await request(indexedDB.open(config.databaseName));
    try{
      const tx=db.transaction('outbox','readonly'),done=completion(tx);
      const rows=await request(tx.objectStore('outbox').getAll());
      await done;return rows;
    }finally{db.close();}
  }
  async function rawExtra(action){
    const db=await request(indexedDB.open(config.databaseName));
    try{
      const tx=db.transaction('outbox','readwrite'),done=completion(tx),store=tx.objectStore('outbox');
      const key='outbox:'+firstId+':inventory_movement:late';
      if(action==='add'){
        const rows=await request(store.index('operation_id').getAll(firstId));
        const movement=rows.find(row=>row.entity_type==='inventory_movement');
        assert(Boolean(movement),'seeded sale needs real native movement');
        store.put({...movement,outbox_id:key,entity_id:'late',
          payload:{...movement.payload,movement_id:'late'}});
      }else store.delete(key);
      await done;
    }finally{db.close();}
  }
  try{
    await sessionRuntime.writeCashierDeviceIdentity(identity);
    sessionStorage.setItem('fawri.cashier.operator-session.v1',JSON.stringify({
      operator_token:'synthetic-operator-token',
      context:{
        merchant_id:merchantId,station_id:stationId,station_name:'Synthetic',
        location_id:identity.location_id,branch_key:'ci',branch_label:'CI',
        offline_inventory_authority:false,station_token:identity.station_token,
        credential_expires_at:expires,device_id:deviceId,credential_id:'ci-credential',
        credential_version:1,operator_session_id:'ci-session-'+suffix,staff_id:staffId,
        shift_id:'ci-shift',role:'cashier',permissions:['sale.create'],
        operator_expires_at:expires,
      }
    }));
    await authority.upsertCatalogSnapshot([{
      product_id:'product',item_type:'product',name:'Synthetic',track_inventory:true,
      stock_quantity:5,currency_code:'IQD',currency_fraction_digits:0,
      base_unit_price_minor:1000,catalog_version:1,
    }],{preserveLocalInventory:false});
    await operatorSecurity.upsertCashierCostEvidence([{
      key:operatorSecurity.cashierCostEvidenceKey({
        merchantId,productId:'product',catalogVersion:1,
      }),
      merchant_id:merchantId,product_id:'product',variant_id:'',catalog_version:1,
      token:'synthetic-opaque-provider-cost-evidence',stored_at:new Date().toISOString(),
    }]);
    for(const op of [firstId,secondId]){
      await authority.commitSale({
        operation_id:op,payment_method:'cash',payment_status:'paid',
        lines:[{product_id:'product',quantity:1}],
      });
      await operatorSecurity.bindCashierOperation({
        operation_id:op,operation_kind:'sale',merchant_id:merchantId,
        station_id:stationId,staff_id:staffId,shift_id:'ci-shift',
        device_id:deviceId,bound_at:new Date().toISOString(),
      });
    }
    const starting=await readOutbox();
    assert(starting.length===4,'two real native sales with stock movements required');
    globalThis.fetch=async(url,options)=>{
      assert(String(url)==='/api/cashier/operator/sync/sale','only supported operator route called');
      assert(options?.credentials==='omit','operator transport must not rely on browser cookies');
      const body=JSON.parse(options.body);
      assert(body.cloud_merchant_id===merchantId && body.device_id===deviceId,'operation bound to expected identity');
      state.calls++;
      const serialized=JSON.stringify(body);
      const prior=state.accepted.get(body.operation_id);
      if(prior!==undefined)assert(prior===serialized,'replay payload must remain byte-for-byte identical');
      state.accepted.set(body.operation_id,serialized);
      if(state.inject){
        state.inject=false;
        await rawExtra('add');state.injected=true;
      }
      return new Response(JSON.stringify({
        ok:true,operation_id:body.operation_id,device_sequence:body.device_sequence,
        order_id:'synthetic-ack-'+body.operation_id,replayed:prior!==undefined,
        accepted_entity_ids:body.envelopes.map(row=>row.entity_id),
      }),{status:200,headers:{'Content-Type':'application/json'}});
    };
    let deniedCode;
    try{await syncCashierOperatorOutboxToCloud();}catch(error){deniedCode=error?.code;}
    assert(deniedCode==='CASHIER_LOCAL_ACK_EVIDENCE_MISMATCH',
      'positive server ACK must never delete changed local operation');
    assert(state.injected && state.calls===1,'only original first sale reached synthetic ledger');
    const afterConflict=await readOutbox();
    assert(afterConflict.length===starting.length+1,'all original outbox rows AND late record preserved');
    assert(afterConflict.some(r=>r.entity_id==='late'),'late unacknowledged row retained');
    assert(afterConflict.filter(r=>r.operation_id===secondId).length===2,
      'the next device sequence cannot advance after ACK conflict');
    assert((await authority.getCatalogItem('product')).stock_quantity===3,
      'both sales still affect local committed stock exactly once');

    // Test-only repair of a deliberately injected synthetic row; this is not
    // production permission to discard actual restored inventory evidence.
    await rawExtra('remove');
    same(await readOutbox(),starting,'synthetic repair returns to exact original outbox');
    const retried=await syncCashierOperatorOutboxToCloud();
    assert(retried.replayed_operations===1 && retried.uploaded_operations===1 &&
      retried.acknowledged_operations===2 && retried.pending_after===0,
      'same replay accepted and both complete original operations ACKed');
    assert(state.calls===3 && state.accepted.size===2,
      'first operation replay plus next sequence exactly once');
    assert((await readOutbox()).length===0,'only fully ACKed original operation rows deleted');
    assert(Boolean(await authority.getSale('sale:'+firstId)) &&
      Boolean(await authority.getSale('sale:'+secondId)),
      'sale source records never deleted by outbox ACK');
    assert((await authority.getCatalogItem('product')).stock_quantity===3,
      'outbox ACK never re-applies stock movement');
    return {
      nativeIndexedDb:true,actualOperatorDrain:true,actualServerAckValidation:true,
      syntheticTransport:true,authProviderAttested:false,hostedAccepted:false,
      lateSameOperationRowRetained:true,secondDeviceSequenceBlocked:true,
      exactOriginalSnapshotRetry:true,firstServerAcceptedReplay:true,
      completeAckDeletesOnlySentRows:true,sourceSaleAndStockPreserved:true,
      realPhysicalDeviceTest:false,
    };
  }finally{
    globalThis.fetch=beforeFetch;
    await authority.close();
  }
}

module.exports=async function runOperatorAckRace(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',{waitUntil:'networkidle'});
    const result=await page.evaluate(browserPhase);
    console.log('P0_OPERATOR_FULL_DRAIN_ACK_RACE_REAL_INDEXEDDB '+JSON.stringify(result));
    return result;
  }finally{await context.close();}
};
