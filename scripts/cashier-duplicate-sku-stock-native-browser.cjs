// Launch-blocker cashier stock invariant: duplicate SKU lines in one sale.
// Run real production commitSale in native Chromium IndexedDB, no HTTP/hosted DB.
async function browserPhase() {
  const {IndexedDbCashierAuthority}=await import('/src/lib/cashierIndexedDbAuthority.ts');
  const insist=(condition,label)=>{if(!condition)throw Error('P0_DUPLICATE_SKU: '+label);};
  const equal=(actual,expected,label)=>
    insist(JSON.stringify(actual)===JSON.stringify(expected),label+
      ' expected '+JSON.stringify(expected)+' actual '+JSON.stringify(actual));
  const request=req=>new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  const completion=tx=>new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  const suffix=crypto.randomUUID();
  const config={
    localMerchantId:'stock-test-'+suffix,cloudMerchantId:'synthetic-'+suffix,
    deviceId:'device-'+suffix,databaseName:'fawri-cashier-stock-'+suffix+'-v1',
  };
  const authority=new IndexedDbCashierAuthority(config);
  async function snapshot() {
    const db=await request(indexedDB.open(config.databaseName));
    try {
      const names=[...db.objectStoreNames].sort(),tx=db.transaction(names,'readonly'),done=completion(tx);
      const values=await Promise.all(names.map(name=>request(tx.objectStore(name).getAll())));
      await done;
      return Object.fromEntries(names.map((name,i)=>[
        name,values[i].map(value=>JSON.stringify(value)).sort(),
      ]));
    } finally {db.close();}
  }
  async function rejected(input,code) {
    let got;
    try {await authority.commitSale(input);}catch(error){got=error?.code;}
    insist(got===code, 'expected '+code+', got '+got);
  }
  const saleInput=(operation_id,lines)=>({
    operation_id,lines,payment_method:'cash',payment_status:'paid',
  });
  const product=(product_id,stock_quantity)=>({
    product_id,item_type:'product',name:'Synthetic '+product_id,track_inventory:true,
    stock_quantity,currency_code:'IQD',currency_fraction_digits:0,
    base_unit_price_minor:1000,catalog_version:1,
  });
  try {
    await authority.upsertCatalogSnapshot([product('SKU-A',5),product('SKU-B',3)],
      {preserveLocalInventory:false});
    const before=await snapshot();
    // This used to succeed incorrectly: the two independent IDB get() clones
    // each saw stock 5, and two writes of stock 2 to the same key.
    await rejected(saleInput('oversell-'+suffix,[
      {product_id:'SKU-A',quantity:3},{product_id:'SKU-A',quantity:3},
    ]),'CASHIER_OUT_OF_STOCK');
    equal(await snapshot(),before,'invalid aggregate request must roll back meta/catalog/sales/movements/outbox');

    const op='valid-'+suffix;
    const original=saleInput(op,[
      {product_id:'SKU-A',quantity:2},{product_id:'SKU-A',quantity:2},
    ]);
    const result=await authority.commitSale(original);
    insist(result.sale.device_sequence===1,'rejected sale must not consume sequence');
    insist(result.sale.total_minor===4000,'two same-SKU lines priced once each');
    insist(result.sale.lines.length===2,'two original price/line records retained');
    insist(result.inventory_movements.length===2,'one immutable movement per sale line');
    equal(result.inventory_movements.map(m=>m.delta),[-2,-2],'both movement deltas retained');
    insist(result.outbox.length===3,'sale envelope plus both movements are queued');
    insist(result.outbox.every(env=>env.operation_id===op && env.device_sequence===1),
      'all envelopes share the accepted atomic operation');
    insist((await authority.getCatalogItem('SKU-A')).stock_quantity===1,
      'stock must be reduced by FOUR, not only the last duplicate line');
    insist((await authority.getCatalogItem('SKU-B')).stock_quantity===3,
      'unrelated SKU inventory must be unchanged');

    const persisted=await snapshot();
    const replay=await authority.commitSale(original);
    equal(replay,result,'same operation replay must recover original committed sale');
    equal(await snapshot(),persisted,'same operation replay must never double deduct stock');
    await rejected(saleInput(op,[{product_id:'SKU-A',quantity:1}]),
      'CASHIER_SALE_OPERATION_ID_CONFLICT');
    equal(await snapshot(),persisted,'conflicting replay must never mutate any store');

    await rejected(saleInput('oversell-after-'+suffix,[
      {product_id:'SKU-A',quantity:1},{product_id:'SKU-A',quantity:1},
    ]),'CASHIER_OUT_OF_STOCK');
    equal(await snapshot(),persisted,'second combined overstock must leave all stores unchanged');

    const mixed=await authority.commitSale(saleInput('mixed-'+suffix,[
      {product_id:'SKU-A',quantity:1},{product_id:'SKU-B',quantity:2},
    ]));
    insist(mixed.sale.device_sequence===2,'mixed valid sale receives next contiguous sequence');
    insist(mixed.inventory_movements.length===2 && mixed.outbox.length===3,
      'mixed sale movements and outbox remain complete');
    insist((await authority.getCatalogItem('SKU-A')).stock_quantity===0,
      'first SKU reaches zero exactly');
    insist((await authority.getCatalogItem('SKU-B')).stock_quantity===1,
      'second SKU reduced independently and exactly');

    return {
      nativeIndexedDb:true,realCommitSale:true,aggregatedDuplicateSkuValidation:true,
      sameSkuOverstockDeniedBeforeWrites:true,invalidSaleDoesNotAdvanceSequence:true,
      duplicateValidSkuCorrectTotalAndTwoMovements:true,
      exactCombinedStockDeduction:true,unrelatedSkuPreserved:true,
      replayIdempotent:true,conflictingReplayDenied:true,
      mixedSkuStockCorrect:true,noProviderHttp:true,
      hostedAccepted:false,physicalDeviceAccepted:false,
    };
  } finally {await authority.close();}
}
module.exports=async browser=>{
  const context=await browser.newContext();
  try {
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/__dev/cashier-indexeddb-smoke',
      {waitUntil:'networkidle'});
    const result=await page.evaluate(browserPhase);
    console.log('P0_CASHIER_DUPLICATE_SKU_STOCK_NATIVE_INDEXEDDB '+JSON.stringify(result));
    return result;
  } finally {await context.close();}
};
