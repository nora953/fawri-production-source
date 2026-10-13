// Audit-only: original application and original tests are unchanged.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
process.env.FAWRI_AUTH_SECURITY_SECRET='catalog-archive-owned-audit-secret-32-bytes';
const {pool}=await import('@workspace/db');
const accounts=await import('../../../artifacts/api-server/src/services/postgresMerchantAccountAuthority.js');
const catalog=await import('../../../artifacts/api-server/src/services/postgresCatalogAuthority.js');
async function seed(){
 const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12);
 const pending=await accounts.upsertPendingMerchantAuthoritative({phone:`+96477${crypto.randomInt(0,100000000).toString().padStart(8,'0')}`,passwordHash:`hash-${suffix}`,ownerName:'Owned archive audit',storeName:'Owned archive audit',activityType:'retail',language:'ar',requestedPlan:'silver'});
 const verified=await accounts.markMerchantOtpVerifiedAuthoritative(pending.account.id);
 assert.ok(verified?.merchantProfile);
 const merchantId=pending.account.id,productId=`prd-archive-${suffix}`,variantId=`var-archive-${suffix}`;
 const created=await catalog.createCatalogProductAuthoritative({merchantId,idempotencyKey:`create-${suffix}`,input:{id:productId,name:'Archive history baseline',price_iqd:12000,low_stock_threshold:1,status:'available',allow_fawri_reply:true,variants:[{id:variantId,name:'Blue',stock_quantity:5,options:{Color:'Blue'}}]}});
 const adjusted=await catalog.adjustCatalogInventoryAuthoritative({merchantId,productId,variantId,expectedVersion:created.product.version,delta:-1,idempotencyKey:`adjust-${suffix}`,reason:'owned archive immutable history'});
 assert.equal(adjusted.product.version,2);assert.equal(adjusted.product.variants[0].stock_quantity,4);
 return {merchantId,productId,variantId,product:adjusted.product};
}
async function history(s:Awaited<ReturnType<typeof seed>>){return (await pool.query('SELECT * FROM inventory_mutations WHERE merchant_id=$1 AND product_id=$2 AND variant_id=$3 ORDER BY id',[s.merchantId,s.productId,s.variantId])).rows;}
function input(product:any,name:string){return {...product,name,variants:[]};}
test('successful archive hides variant and preserves immutable mutation across later rebuild',async()=>{
 const s=await seed();const before=await history(s);assert.equal(before.length,1);
 const removed=await catalog.updateCatalogProductAuthoritative({merchantId:s.merchantId,productId:s.productId,expectedVersion:s.product.version,input:input(s.product,'Archived successfully')});
 assert.equal(removed.variants.length,0);assert.equal(removed.version,3);
 assert.deepEqual(await history(s),before);
 const row=(await pool.query('SELECT id,quantity,metadata FROM product_variants WHERE merchant_id=$1 AND product_id=$2 AND id=$3',[s.merchantId,s.productId,s.variantId])).rows;
 assert.equal(row.length,1);assert.equal(row[0].id,s.variantId);assert.equal(row[0].quantity,0);assert.equal(row[0].metadata.catalog_archived,true);
 const visible=await catalog.getCatalogProductAuthoritative(s.merchantId,s.productId);assert.equal(visible.variants.length,0);
 const rebuilt=await catalog.updateCatalogProductAuthoritative({merchantId:s.merchantId,productId:s.productId,expectedVersion:visible.version,input:input(visible,'Later rebuild')});
 assert.equal(rebuilt.variants.length,0);assert.deepEqual(await history(s),before);
 const listed=(await catalog.listCatalogProductsAuthoritative(s.merchantId)).find(p=>p.id===s.productId);assert.equal(listed?.variants.length,0);
 console.log('CATALOG_ARCHIVE_OBSERVATION '+JSON.stringify({scenario:'successful-archive',historyUnchanged:true,archivedRowRetained:true,hiddenAfterRebuild:true}));
});
test('archive marker SQL failure should roll back product edit and leave active variant intact',async()=>{
 const s=await seed();const before=await history(s);
 await pool.query(`CREATE FUNCTION audit_seq282_reject_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'catalog_archived'='true' THEN RAISE EXCEPTION 'AUDIT_SEQ282_MARKER_FAILURE'; END IF; RETURN NEW; END $$`);
 await pool.query('CREATE TRIGGER audit_seq282_marker BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION audit_seq282_reject_marker()');
 try{
  await assert.rejects(catalog.updateCatalogProductAuthoritative({merchantId:s.merchantId,productId:s.productId,expectedVersion:s.product.version,input:input(s.product,'Must roll back on marker failure')}),/AUDIT_SEQ282_MARKER_FAILURE/);
  const after=await catalog.getCatalogProductAuthoritative(s.merchantId,s.productId);
  const raw=(await pool.query('SELECT quantity,metadata FROM product_variants WHERE merchant_id=$1 AND id=$2',[s.merchantId,s.variantId])).rows[0];
  const unchanged=JSON.stringify(await history(s))===JSON.stringify(before);
  console.log('CATALOG_ARCHIVE_OBSERVATION '+JSON.stringify({scenario:'marker-fault',requestRejected:true,beforeVersion:s.product.version,afterVersion:after.version,nameChanged:after.name!==s.product.name,visibleVariantCount:after.variants.length,variantQuantity:raw.quantity,archiveMarked:raw.metadata.catalog_archived===true,historyUnchanged:unchanged}));
  assert.deepEqual(await history(s),before);
  assert.equal(after.name,s.product.name,'rejected archive must not commit rename');
  assert.equal(after.version,s.product.version);assert.deepEqual(after.variants,s.product.variants);
 }finally{await pool.query('DROP TRIGGER audit_seq282_marker ON product_variants');await pool.query('DROP FUNCTION audit_seq282_reject_marker()');}
});
test.after(async()=>{await pool.end();});
