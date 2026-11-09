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
    // The production pricing contract deliberately forbids duplicate SKUs in
    // one sale. Verify BOTH the early stock rejection for obvious overselling
    // and the later ambiguous-catalog/duplicate-line fail-closed contract.
    await rejected(saleInput('oversell-'+suffix,[
      {product_id:'SKU-A',quantity:3},{product_id:'SKU-A',quantity:3},
    ]),'CASHIER_SALE_PRICING_CATALOG_AMBIGUOUS');
    equal(await snapshot(),before,'duplicate-SKU overstock must not touch local stores');

    await rejected(saleInput('duplicate-'+suffix,[
      {product_id:'SKU-A',quantity:2},{product_id:'SKU-A',quantity:2},
    ]),'CASHIER_SALE_PRICING_CATALOG_AMBIGUOUS');
    equal(await snapshot(),before,'duplicate-SKU pricing is not an approved sale route');

    // JS callers and restored local data can bypass TypeScript union checks.
    // Unknown payment enums must never poison the financial outbox or advance
    // the cashier device sequence, even for otherwise valid stock/line data.
    const one=[{product_id:'SKU-A',quantity:1}];
    for(const [label,altered,code] of [
      ['unknown-method',{payment_method:'voucher'},'CASHIER_PAYMENT_METHOD_INVALID'],
      ['blank-method',{payment_method:''},'CASHIER_PAYMENT_METHOD_INVALID'],
      ['trimmed-method',{payment_method:' cash '},'CASHIER_PAYMENT_METHOD_INVALID'],
      ['unknown-state',{payment_status:'cancelled'},'CASHIER_PAYMENT_STATUS_INVALID'],
      ['blank-state',{payment_status:''},'CASHIER_PAYMENT_STATUS_INVALID'],
      ['failed-state',{payment_status:'failed'},'CASHIER_FAILED_PAYMENT_NOT_SALE'],
    ]) {
      await rejected({...saleInput(label+'-'+suffix,one),...altered},code);
      equal(await snapshot(),before,label+' may not commit sale, stock, outbox or sequence');
    }

    const op='valid-'+suffix;
    const original=saleInput(op,[
      {product_id:'SKU-A',quantity:2},{product_id:'SKU-B',quantity:2},
    ]);
    const result=await authority.commitSale(original);
    insist(result.sale.device_sequence===1,'rejected mutations may not consume sequence');
    insist(result.sale.total_minor===4000,'two distinct products price correctly');
    insist(result.sale.lines.length===2,'two immutable price/line records retained');
    insist(result.inventory_movements.length===2,'one movement per distinct tracked SKU');
    equal(result.inventory_movements.map(m=>m.delta),[-2,-2],'both movement deltas retained');
    insist(result.outbox.length===3,'sale envelope and movements queued exactly once');
    insist(result.outbox.every(env=>env.operation_id===op && env.device_sequence===1),
      'all envelopes share first committed device sequence');
    insist((await authority.getCatalogItem('SKU-A')).stock_quantity===3,
      'first SKU decremented by two');
    insist((await authority.getCatalogItem('SKU-B')).stock_quantity===1,
      'second SKU decremented by two');

    const persisted=await snapshot();
    const replay=await authority.commitSale(original);
    equal(replay,result,'valid idempotent same-operation replay recovers sale');
    equal(await snapshot(),persisted,'replay must never double-decrement stock');
    await rejected(saleInput(op,[{product_id:'SKU-A',quantity:1}]),
      'CASHIER_SALE_OPERATION_ID_CONFLICT');
    equal(await snapshot(),persisted,'conflicting operation ID must preserve all stores');

    await rejected(saleInput('overstock-after-'+suffix,[
      {product_id:'SKU-A',quantity:4},
    ]),'CASHIER_OUT_OF_STOCK');
    equal(await snapshot(),persisted,'valid-looking insufficient stock may not mutate state');

    const final=await authority.commitSale(saleInput('final-'+suffix,[
      {product_id:'SKU-A',quantity:3},
    ]));
    insist(final.sale.device_sequence===2,'next accepted sale receives contiguous device sequence');
    insist((await authority.getCatalogItem('SKU-A')).stock_quantity===0,
      'remaining first-SKU stock reaches zero exactly');
    insist((await authority.getCatalogItem('SKU-B')).stock_quantity===1,
      'second-SKU stock not modified by unrelated sale');

    return {
      nativeIndexedDb:true,realCommitSale:true,
      duplicateSkuSaleDeniedWithoutSideEffects:true,
      unknownPaymentMethodDeniedBeforeWrites:true,unknownPaymentStatusDeniedBeforeWrites:true,
      failedPaymentRetainsExistingDenial:true,invalidSaleDoesNotAdvanceSequence:true,
      validMixedSkuPricingAndMovement:true,replayIdempotent:true,
      conflictingReplayDenied:true,overstockDenied:true,
      sourceSaleAndStockPreserved:true,noProviderHttp:true,
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
