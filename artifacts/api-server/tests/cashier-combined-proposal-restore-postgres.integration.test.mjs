import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,randomInt,createHash} from 'node:crypto';
import test from 'node:test';
import {Pool} from 'pg';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {verifyCashierAuthorityCandidate} from '../../../scripts/lib/cashier-authority-candidate.mjs';
import {fileURLToPath} from 'node:url';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const phase=process.env.FAWRI_AUDIT_RESTORE_PHASE;
const freshRecovery=process.env.FAWRI_AUDIT_FRESH_CLUSTER_RECOVERY==='1';
assert.ok(['seed','verify'].includes(phase));
const proofFile='/restore-proof/financial-proposals.json';
const bootstrapUrl=process.env.DATABASE_URL;
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
process.env.FAWRI_SAAS_BILLING_PROVIDER='test_fake';
process.env.FAWRI_SAAS_BILLING_PROVIDERS='test_fake';

test('combined enrollment and financial receipt proposals survive owned offline restore: '+phase,{timeout:120000},async t=>{
  let runtime,primary,reviewer,pool,manifest,server;
  t.after(()=>cleanupResources([
    ['HTTP server',()=>server?new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())):undefined],
    ['reviewer pool',()=>reviewer?.end()],
    ['authentication pool',async()=>{const {closeAuthenticationPool}=await import('../src/services/authenticationPostgresAuthority.ts');await closeAuthenticationPool();}],
    ['primary pool',()=>primary?.end()],
    ['bootstrap pool',()=>pool?.end()],
  ]));
  if(phase==='seed'){
    const {createDisposableKnowledgeRuntime}=await import('./helpers/disposable-knowledge-runtime.mjs');
    runtime=await createDisposableKnowledgeRuntime();pool=runtime.admin;primary=runtime.runtimePool;
    manifest={primaryUrl:process.env.DATABASE_URL,authUrl:process.env.FAWRI_AUTH_DATABASE_URL,primaryRole:runtime.role,authRole:runtime.authRole};
    const setup=await pool.connect();
    try{await setup.query('BEGIN');
      verifyCashierAuthorityCandidate(fileURLToPath(new URL('../../../',import.meta.url)));
      await setup.query(fs.readFileSync(new URL('../../../docs/final-audit/evidence/seq-d3-authority-candidate/reviewed.sql',import.meta.url),'utf8'));
      await setup.query('COMMIT');
    }catch(e){await setup.query('ROLLBACK');throw e;}finally{setup.release();}
    const role='restore_reviewer_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
    await pool.query("CREATE ROLE "+role+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION");
    await pool.query('GRANT USAGE ON SCHEMA public TO '+role);
    await pool.query('GRANT EXECUTE ON FUNCTION public.fawri_cashier_enrollment_runtime(),public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb) TO '+role);
    await pool.query('GRANT EXECUTE ON FUNCTION public.fawri_cashier_stream_financial_runtime(),public.fawri_lock_cashier_financial_stream(text,text,text),public.fawri_commit_cashier_financial_receipt(jsonb) TO '+runtime.role);
    const url=new URL(bootstrapUrl);url.username=role;url.password=password;url.search='';
    manifest.reviewerRole=role;manifest.reviewerUrl=url.toString();
  }else{
    manifest=JSON.parse(fs.readFileSync(proofFile,'utf8'));
    pool=new Pool({connectionString:bootstrapUrl,connectionTimeoutMillis:5000});
    // Install the restored restricted identities before any application DB import.
    process.env.DATABASE_URL=manifest.primaryUrl;process.env.FAWRI_AUTH_DATABASE_URL=manifest.authUrl;
    primary=(await import('@workspace/db')).pool;
  }
  reviewer=new Pool({connectionString:manifest.reviewerUrl,connectionTimeoutMillis:5000});
  const owned=[];
  const billing=await import('../src/services/cashierBillingAuthority.ts');
  const catalog=await import('../src/services/postgresCatalogAuthority.ts');
  const staff=await import('../src/services/postgresCashierStaffAuthority.ts');
  const {issueCashierCostEvidence}=await import('../src/services/cashierCostEvidence.ts');
  const commerce=await import('../src/services/cashierOperatorCommerceAuthority.ts');
  const operational=await import('../src/services/operationalPostgresAuthority.ts');
  const {enrollReviewedEmptyCashierStreamInTransaction:enroll}=await import('../src/services/cashierStreamEnrollmentAuthority.ts');
  async function fixture(initialStock = 1) {
    const suffix = randomUUID();
    const merchantId = `audit-sync-${suffix}`;
    owned.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",
      [merchantId, `+1996${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Sync race fixture','retail','approved','approved','channel_connected')", [merchantId]);
    const activation = await billing.createCashierBillingCheckout({ merchantId, operation: 'activate',
      requestedSeats: 2, idempotencyKey: randomUUID(), provider: 'test_fake' });
    await billing.applyVerifiedCashierBillingProviderEvent({ merchantId: activation.order.merchant_id, provider: 'test_fake', providerEventId: randomUUID(),
      orderId: activation.order.id, eventType: 'payment_succeeded', signatureVerified: true,
      payloadHash: createHash('sha256').update(suffix).digest('hex'), occurredAt: new Date(),
      amountIqd: activation.order.amount_iqd, currency: 'IQD', providerPaymentRef: randomUUID() });
    const subscription = (await pool.query('SELECT id FROM merchant_cashier_subscriptions WHERE merchant_id=$1', [merchantId])).rows[0];
    assert.ok(subscription, 'fixture must have applied subscription');
    const locationId = `audit-location-${suffix}`;
    await pool.query(`INSERT INTO merchant_locations(id,merchant_id,name,legacy_branch_key,is_default,
      operational_status,online_fulfillment_enabled,accept_online_orders_while_closed,merchant_priority,created_at,updated_at)
      VALUES($1,$2,'Sync location','sync',TRUE,'open',FALSE,FALSE,0,now(),now())`, [locationId, merchantId]);
    const productId = `audit-product-${suffix}`;
    await catalog.createCatalogProductAuthoritative({ merchantId, idempotencyKey: randomUUID(), input: {
      id: productId, name: 'One last stock item', price_iqd: 1000, stock_quantity: initialStock,
      low_stock_threshold: 0, status: 'available', allow_fawri_reply: true,
    } });
    const levels = await pool.query('SELECT id FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL',
      [merchantId, locationId, productId]);
    if (!levels.rows.length) {
      await pool.query(`INSERT INTO location_inventory_levels(id,merchant_id,location_id,product_id,variant_id,
        quantity,low_stock_threshold,version,created_at,updated_at) VALUES($1,$2,$3,$4,NULL,$5,0,1,now(),now())`,
        [`audit-level-${suffix}`, merchantId, locationId, productId, initialStock]);
    }
    const stations = [];
    for (let i = 0; i < 1; i++) {
      const stationId = `audit-station-${i}-${suffix}`, deviceId = `audit-device-${i}-${suffix}`;
      await pool.query(`INSERT INTO merchant_cashier_stations(id,merchant_id,name,branch_key,location_id,status,
        paired_device_id,offline_inventory_authority,credential_version,paired_at,created_at,updated_at)
        VALUES($1,$2,'Sync station',$3,$4,'active',$5,FALSE,1,now(),now(),now())`,
        [stationId, merchantId, `sync-${i}`, locationId, deviceId]);
      await pool.query(`INSERT INTO cashier_station_seat_assignments(id,merchant_id,subscription_id,station_id,
        status,assigned_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())`,
        [`audit-seat-${i}-${suffix}`, merchantId, subscription.id, stationId]);
      await pool.query(`INSERT INTO cashier_station_credentials(id,merchant_id,station_id,device_id,token_hash,
        version,status,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,1,'active',now(),now()+interval '1 month')`,
        [`audit-credential-${i}-${suffix}`, merchantId, stationId, deviceId,
          createHash('sha256').update(`synthetic-${i}-${suffix}`).digest('hex')]);
      stations.push({ stationId, deviceId, stationToken: `synthetic-${i}-${suffix}` });
    }
    return { merchantId, locationId, productId, stations, subscriptionId: subscription.id, billingOrderId: activation.order.id };
  }

  function saleBody(f, device, occurredAt, sequence = 1) {
    const operationId = `audit-op-${randomUUID()}`, saleId = `audit-sale-${randomUUID()}`;
    const identity = { operation_id: operationId, local_merchant_id: `local-${f.merchantId}`,
      cloud_merchant_id: f.merchantId, device_id: device.deviceId, device_sequence: sequence };
    const sale = { ...identity, sale_id: saleId, source: 'cashier', status: 'completed',
      lines: [{ line_id: `line-${randomUUID()}`, product_id: f.productId, product_name_snapshot: 'Last item',
        catalog_version: 1, cost_evidence: issueCashierCostEvidence({ merchantId: f.merchantId, productId: f.productId, catalogVersion: 1, unitCostMinor: null }), quantity: 1, base_unit_price_minor: 1000, effective_unit_price_minor: 1000,
        discount_minor: 0, line_total_minor: 1000 }], subtotal_minor: 1000, discount_minor: 0,
      total_minor: 1000, currency_code: 'IQD', currency_fraction_digits: 0,
      payment_method: 'cash', payment_status: 'paid', occurred_at: occurredAt };
    const movement = { ...identity, movement_id: `movement-${randomUUID()}`, product_id: f.productId,
      delta: -1, reason: 'sale', related_sale_id: saleId, occurred_at: occurredAt };
    const envelope = (entityType, entityId, payload) => ({ schema_version: 1, operation_id: operationId,
      device_id: device.deviceId, device_sequence: sequence, entity_type: entityType, entity_id: entityId,
      operation: 'append', occurred_at: occurredAt, payload });
    return { ...identity, envelopes: [envelope('sale', saleId, sale), envelope('inventory_movement', movement.movement_id, movement)] };
  }



  async function enrollReview(review){
    const c=await reviewer.connect();
    try{await c.query('BEGIN');const r=await enroll(c,review);await c.query('COMMIT');return r;}
    catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  const sell=(x,body=x.body)=>commerce.syncCashierOperatorSaleAuthoritative({context:x.context,body:{...body,protocol_version:2,stream_id:x.streamId},versionedStreamId:x.streamId});
  if(phase==='seed'){
    const [{default:express},{default:commerceRouter},{default:staffRouter}]=await Promise.all([import('express'),import('../src/routes/cashier-operator-commerce.ts'),import('../src/routes/cashier-staff-operations.ts')]);
    const app=express();app.use(express.json());app.use('/api',staffRouter,commerceRouter);
    server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
    async function actor(){
      const f=await fixture(4),d=f.stations[0];
      const member=await staff.createCashierStaffAuthoritative({merchantId:f.merchantId,displayName:'Synthetic restored manager',role:'manager',pin:'2468',permissions:['sale.create','sale.return','sale.void','sale.view_all']});
      const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/cashier/operator/login',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':d.stationToken,'x-fawri-cashier-device-id':d.deviceId},body:JSON.stringify({staff_id:member.id,pin:'2468'})});
      const login=await r.json();assert.equal(r.status,200);
      const review={merchantId:f.merchantId,stationId:d.stationId,deviceId:d.deviceId,reviewReference:'restore-review-'+randomUUID()+':device='+d.deviceId,reviewerReference:'Synthetic Reviewer <reviewer-'+randomUUID()+'@example.invalid>',evidenceSha256:'f'.repeat(64),reviewedAt:new Date().toISOString(),reviewedLocalCounter:0,reviewedPendingOperations:0};
      const enrolled=await enrollReview(review);assert.equal(enrolled.last_sequence,'0');
      const at=(await pool.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();
      return{f,review,streamId:enrolled.stream_id,context:login.context,body:saleBody(f,d,at)};
    }
    manifest.actors=[await actor(),await actor()];
    for(const x of manifest.actors)await sell(x);
    const x=manifest.actors[0];x.second=saleBody(x.f,x.f.stations[0],x.body.envelopes[0].occurred_at,2);await sell(x,x.second);
  }
  const [own,peer]=manifest.actors,ids=manifest.actors.map(x=>x.f.merchantId);
  const selectedTables=['orders','order_items','inventory_mutations','location_inventory_levels','cashier_device_operation_timeline','cashier_operation_attribution','cashier_device_streams','cashier_operation_receipts','cashier_stream_enrollment_reviews'];
  async function data(){
    const rows={};for(const table of selectedTables)rows[table]=(await pool.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[ids])).rows;return rows;
  }
  async function components(){
    const tables=(await pool.query("SELECT relname,pg_get_userbyid(relowner) AS owner,relrowsecurity,relforcerowsecurity,ARRAY(SELECT x::text FROM unnest(coalesce(relacl,acldefault('r',relowner))) x ORDER BY x::text) AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY relname",[selectedTables])).rows;
    const columns=(await pool.query("SELECT c.relname,a.attname,ARRAY(SELECT x::text FROM unnest(coalesce(attacl,ARRAY[]::aclitem[])) x ORDER BY x::text) AS acl FROM pg_attribute a JOIN pg_class c ON c.oid=attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND attnum>0 AND NOT attisdropped ORDER BY c.relname,attnum",[selectedTables])).rows;
    const functions=(await pool.query("SELECT proname,pg_get_userbyid(proowner) AS owner,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,ARRAY(SELECT x::text FROM unnest(coalesce(proacl,acldefault('f',proowner))) x ORDER BY x::text) AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND proname=ANY($1::text[]) ORDER BY proname,args",[['fawri_cashier_enrollment_runtime','fawri_enrollment_review_immutable','fawri_enroll_reviewed_empty_cashier_stream','fawri_cashier_stream_financial_runtime','fawri_lock_cashier_financial_stream','fawri_commit_cashier_financial_receipt','fawri_sequence_stream_guard','fawri_sequence_receipt_guard','fawri_sequence_receipt_commit_guard']])).rows;
    const policies=(await pool.query("SELECT c.relname,polname,polcmd,polpermissive,ARRAY(SELECT CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(polroles) r ORDER BY 1) AS roles,pg_get_expr(polqual,polrelid) AS predicate,pg_get_expr(polwithcheck,polrelid) AS check_predicate FROM pg_policy p JOIN pg_class c ON c.oid=polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY relname,polname")).rows;
    const triggers=(await pool.query("SELECT c.relname,tgname,tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=tgrelid WHERE c.relname=ANY($1::text[]) AND NOT tgisinternal ORDER BY c.relname,tgname",[selectedTables])).rows;
    const constraints=(await pool.query("SELECT c.relname,conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,conname",[selectedTables])).rows;
    const normalizer=await pool.connect();
    try{
      for(const [i,row]of constraints.entries())if(row.contype==='c'){
        const name='financial_restore_check_'+i;
        await normalizer.query('CREATE TEMP TABLE '+name+' (LIKE public.'+row.relname+')');
        try{await normalizer.query('ALTER TABLE '+name+' ADD CONSTRAINT normalized_check '+row.definition);
          row.definition=(await normalizer.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname='normalized_check'",['pg_temp.'+name])).rows[0].definition;
        }finally{await normalizer.query('DROP TABLE '+name);}
      }
    }finally{normalizer.release();}
    const names=[manifest.primaryRole,manifest.authRole,manifest.reviewerRole,'fawri_cashier_enrollment_owner','fawri_cashier_receipt_owner'];
    const roles=(await pool.query('SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[names])).rows;
    const memberships=(await pool.query('SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,pg_get_userbyid(grantor) AS grantor,admin_option FROM pg_auth_members WHERE pg_get_userbyid(roleid)=ANY($1::text[]) OR pg_get_userbyid(member)=ANY($1::text[]) ORDER BY role,member',[names])).rows;
    return{tables,columns,functions,policies,triggers,constraints,roles,memberships,data:await data()};
  }
  if(freshRecovery&&phase==='verify')await t.test('new cluster recovers reviewed roles with rotated credentials and cleared volatile scopes',async()=>{
    const source=JSON.parse(fs.readFileSync('/restore-proof/cashier-roles.json','utf8'));
    const target=JSON.parse(fs.readFileSync(process.env.FAWRI_DISPOSABLE_PG_ATTESTATION,'utf8'));
    assert.notEqual(source.sourceContainerId,target.containerId);assert.notEqual(source.sourceRunId,process.env.FAWRI_DISPOSABLE_PG_RUN_ID);
    assert.notEqual(source.sourceSystemIdentifier,manifest.recovery.targetSystemIdentifier);
    assert.equal(manifest.recovery.rolesInitiallyAbsent,6);assert.equal(manifest.recovery.rolesCreated,6);
    assert.equal(manifest.recovery.oldCredentialsRejected,3);assert.equal(manifest.recovery.newLoginsVerified,3);
    assert.equal(manifest.recovery.loopbackAuth,'scram-sha-256');assert.equal(manifest.recovery.ownerPasswordsAbsent,true);assert.equal(manifest.recovery.rolePasswordsCopied,false);
    assert.ok(manifest.recovery.scopeLeasesDiscarded>0);assert.equal(manifest.recovery.scopeLeasesAfterReset,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM fawri_security.transaction_scopes')).rows[0].n,0);
    assert.equal((await pool.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,manifest.recovery.targetSystemIdentifier);
  });

  const initial=await components(),fingerprint=createHash('sha256').update(JSON.stringify(initial)).digest('hex');
  await t.test('data schema function owners role flags policies constraints triggers and ACLs match',async()=>{
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,53);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind IN ('r','p')")).rows[0].n,98,'97 canonical plus one proposal table');
    assert.equal(initial.functions.length,9);assert.equal(initial.roles.length,5);
    assert.equal(initial.data.cashier_stream_enrollment_reviews.length,2);assert.equal(initial.data.cashier_operation_receipts.length,3);
    assert.equal(Number(initial.data.cashier_device_streams.find(x=>x.row.id===own.streamId).row.last_sequence),2);
    if(phase==='seed'){manifest.components=initial;manifest.fingerprint=fingerprint;fs.writeFileSync(proofFile,JSON.stringify(manifest),{mode:0o600});}
    else{assert.deepEqual(initial,manifest.components);assert.equal(fingerprint,manifest.fingerprint);}
  });

  const {assertCashierStreamAuthorityCandidateReady:authorityReady}=await import('../src/services/cashierStreamAuthorityReadiness.ts');
  const bootstrapRole=(await pool.query('SELECT session_user::text AS login')).rows[0].login;
  const identities={primaryRole:manifest.primaryRole,authenticationRole:manifest.authRole,reviewerRole:manifest.reviewerRole,bootstrapRole};
  async function readonlyAuthority(){
    const c=await primary.connect();
    try{await c.query('BEGIN READ ONLY');
      assert.equal((await c.query('SELECT session_user::text AS login')).rows[0].login,manifest.primaryRole);
      assert.deepEqual(await authorityReady(c,identities),{ok:true,statementSnapshotOnly:true,operationalAdoption:false,releaseAccepted:false});
      assert.equal((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    }finally{await c.query('ROLLBACK');c.release();}
  }
  await t.test('combined authority catalog readiness executes read only through real separate identities',async()=>{
    assert.equal((await reviewer.query('SELECT session_user::text AS login')).rows[0].login,manifest.reviewerRole);
    const {withAuthenticationTransaction}=await import('../src/services/authenticationPostgresAuthority.ts');
    assert.equal(await withAuthenticationTransaction(async c=>(await c.query('SELECT session_user::text AS login')).rows[0].login),manifest.authRole);
    await readonlyAuthority();
    await assert.rejects(authorityReady(primary,{...identities,reviewerRole:manifest.primaryRole}),e=>e.code==='CASHIER_STREAM_AUTHORITY_CANDIDATE_NOT_READY'&&e.issues.includes('DISTINCT_TRUSTED_IDENTITIES'));
    assert.deepEqual(await data(),initial.data);
  });
  if(phase==='seed')await t.test('metadata faults hold internal authority readiness and rollback preserves financial state',async faultT=>{
    const cases=[
      ['legacy raw reference column reintroduced','ALTER TABLE cashier_stream_enrollment_reviews ADD COLUMN reviewer_reference text','LEDGER_FIELD_CONTRACT'],
      ['review ledger RLS disabled','ALTER TABLE cashier_stream_enrollment_reviews DISABLE ROW LEVEL SECURITY','PROPOSAL_TABLE_METADATA'],
      ['receipt owner LOGIN','ALTER ROLE fawri_cashier_receipt_owner LOGIN','OWNER_ROLE_FLAGS'],
      ['reviewer unsafe inheritance','ALTER ROLE '+manifest.reviewerRole+' INHERIT','CALLER_ROLE_FLAGS'],
      ['receipt owner extra state update','GRANT UPDATE(state) ON cashier_device_streams TO fawri_cashier_receipt_owner','OWNER_COLUMN_ACL'],
      ['enrollment owner ledger delete','GRANT DELETE ON cashier_stream_enrollment_reviews TO fawri_cashier_enrollment_owner','OWNER_TABLE_ACL'],
      ['owner role reachable by reviewer','GRANT fawri_cashier_receipt_owner TO '+manifest.reviewerRole,'OWNER_MEMBERSHIPS'],
      ['public financial execution','GRANT EXECUTE ON FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) TO PUBLIC','FUNCTION_PUBLIC_EXECUTE'],
      ['unsafe financial search path','ALTER FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) SET search_path=public','FUNCTION_SEARCH_PATH'],
      ['wrong financial definer mode','ALTER FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) SECURITY INVOKER','FUNCTION_SECURITY'],
      ['wrong financial owner','ALTER FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) OWNER TO '+bootstrapRole,'FUNCTION_OWNER'],
      ['marker body drift',"CREATE OR REPLACE FUNCTION public.fawri_cashier_enrollment_runtime() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS 'SELECT false'",'FUNCTION_BODY'],
      ['unexpected financial overload',"CREATE FUNCTION public.fawri_cashier_stream_financial_runtime(integer) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS 'SELECT true'",'FUNCTION_SET'],
      ['weakened zero-checkpoint policy','ALTER POLICY enrollment_owner_stream_insert ON cashier_device_streams WITH CHECK(true)','OWNER_POLICY'],
      ['unknown stream policy','CREATE POLICY unexpected_authority_read ON cashier_device_streams FOR SELECT TO PUBLIC USING(true)','UNEXPECTED_POLICY'],
      ['extra owner policy outside stream tables','CREATE POLICY unexpected_authority_order_delete ON orders FOR DELETE TO fawri_cashier_receipt_owner USING(true)','OWNER_POLICY_SET'],
      ['review immutable trigger disabled','ALTER TABLE cashier_stream_enrollment_reviews DISABLE TRIGGER cashier_stream_enrollment_reviews_immutable','REVIEW_TRIGGER'],
      ['review immutable trigger rebound','DROP TRIGGER cashier_stream_enrollment_reviews_immutable ON cashier_stream_enrollment_reviews; CREATE TRIGGER cashier_stream_enrollment_reviews_immutable BEFORE UPDATE OR DELETE ON cashier_stream_enrollment_reviews FOR EACH ROW EXECUTE FUNCTION public.fawri_sequence_stream_guard()','REVIEW_TRIGGER'],
      ['receipt owner private issuer','GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO fawri_cashier_receipt_owner','OWNER_AUTHORITY_ACL'],
      ['primary raw review column exposed','GRANT SELECT(reviewer_reference_hash) ON cashier_stream_enrollment_reviews TO '+manifest.primaryRole,'CALLER_LEDGER_ACL'],
      ['auth financial capability','GRANT EXECUTE ON FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) TO '+manifest.authRole,'CALLER_FUNCTION_CAPABILITY'],
      ['reviewer financial capability','GRANT EXECUTE ON FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb) TO '+manifest.reviewerRole,'CALLER_FUNCTION_CAPABILITY'],
      ['primary financial capability removed','REVOKE EXECUTE ON FUNCTION public.fawri_lock_cashier_financial_stream(text,text,text) FROM '+manifest.primaryRole,'CALLER_FUNCTION_CAPABILITY'],
      ['owner public schema CREATE','GRANT CREATE ON SCHEMA public TO fawri_cashier_receipt_owner','OWNER_SCHEMA_ACL'],
    ];
    for(const [name,sql,issue]of cases)await faultT.test(name,async()=>{
      const c=await pool.connect();
      try{await c.query('BEGIN');await c.query(sql);await assert.rejects(authorityReady(c,identities),e=>e.code==='CASHIER_STREAM_AUTHORITY_CANDIDATE_NOT_READY'&&e.issues.includes(issue));}
      finally{await c.query('ROLLBACK');c.release();}
      await readonlyAuthority();assert.deepEqual(await data(),initial.data);
    });
    console.log('P0_COMBINED_AUTHORITY_READINESS '+JSON.stringify({readOnlyRestrictedPrimary:true,distinctAuthenticatedIdentities:true,metadataFaults:cases.length,rolledBackFaults:true,financialStatePreserved:true,operationalAdoption:false,productionStartupWired:false,hosted:false}));
  });


  await t.test('retained review ledger stores only correlation hashes before and after restore',async()=>{
    const rows=(await data()).cashier_stream_enrollment_reviews;
    for(const actor of manifest.actors){
      const row=rows.find(x=>x.row.stream_id===actor.streamId).row;
      assert.equal(row.review_reference_hash,createHash('sha256').update('cashier-enrollment-review-v1:'+actor.review.reviewReference).digest('hex'));
      assert.equal(row.reviewer_reference_hash,createHash('sha256').update('cashier-enrollment-reviewer-v1:'+actor.review.reviewerReference).digest('hex'));
      assert.equal(Object.hasOwn(row,'review_reference'),false);assert.equal(Object.hasOwn(row,'reviewer_reference'),false);
      const retained=JSON.stringify(row);
      for(const raw of [actor.review.reviewReference,actor.review.reviewerReference,actor.f.stations[0].deviceId])assert.equal(retained.includes(raw),false);
    }
    assert.deepEqual(await data(),initial.data);
  });

  await t.test('separate real LOGIN capabilities and trusted tenant reads remain isolated',async()=>{
    for(const candidate of [manifest.primaryRole,manifest.authRole,manifest.reviewerRole]){
      for(const owner of ['fawri_cashier_enrollment_owner','fawri_cashier_receipt_owner'])assert.equal((await pool.query("SELECT pg_has_role($1,$2,'USAGE') OR pg_has_role($1,$2,'SET') AS member",[candidate,owner])).rows[0].member,false);
    }
    for(const owner of ['fawri_cashier_enrollment_owner','fawri_cashier_receipt_owner']){
      const flags=initial.roles.find(x=>x.rolname===owner);assert.equal(flags.rolcanlogin,false);assert.equal(flags.rolsuper,false);assert.equal(flags.rolbypassrls,false);
    }
    for(const [role,enrollmentAllowed,receiptAllowed]of [[manifest.primaryRole,false,true],[manifest.authRole,false,false],[manifest.reviewerRole,true,false]]){
      assert.equal((await pool.query("SELECT has_function_privilege($1,'public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb)','EXECUTE') AS allowed",[role])).rows[0].allowed,enrollmentAllowed);
      assert.equal((await pool.query("SELECT has_function_privilege($1,'public.fawri_commit_cashier_financial_receipt(jsonb)','EXECUTE') AS allowed",[role])).rows[0].allowed,receiptAllowed);
    }
    await assert.rejects(reviewer.query('SELECT * FROM cashier_stream_enrollment_reviews'),e=>e.code==='42501');
    await assert.rejects(primary.query('SELECT * FROM cashier_stream_enrollment_reviews'),e=>e.code==='42501');
    await assert.rejects(reviewer.query("SELECT public.fawri_commit_cashier_financial_receipt('{}'::jsonb)"),e=>e.code==='42501');
    await assert.rejects(operational.withMerchantOperationalTransaction(own.f.merchantId,c=>enroll(c,own.review)),e=>e.code==='42501');
    assert.equal((await primary.query('SELECT id FROM cashier_operation_receipts')).rows.length,0);
    const unscoped=await primary.connect();
    try{await unscoped.query('BEGIN');await unscoped.query("SELECT set_config('fawri.tenant_id',$1,true)",[own.f.merchantId]);assert.equal((await unscoped.query('SELECT id FROM cashier_operation_receipts')).rowCount,0);}
    finally{await unscoped.query('ROLLBACK');unscoped.release();}
    await operational.withMerchantOperationalTransaction(own.f.merchantId,async c=>{
      assert.deepEqual((await c.query('SELECT DISTINCT merchant_id FROM cashier_operation_receipts')).rows,[{merchant_id:own.f.merchantId}]);
      assert.equal((await c.query('SELECT id FROM cashier_device_streams WHERE merchant_id=$1',[peer.f.merchantId])).rows.length,0);
    });
    await assert.rejects(operational.withMerchantOperationalTransaction(own.f.merchantId,c=>c.query('SELECT * FROM public.fawri_lock_cashier_financial_stream($1,$2,$3)',[peer.f.merchantId,peer.f.stations[0].deviceId,peer.streamId])),e=>e.code==='42501');
    assert.deepEqual(await data(),initial.data);
  });
  await t.test('exact financial and enrollment retries preserve advanced checkpoint and immutable ledger',async()=>{
    for(const x of manifest.actors){
      const result=await enrollReview(x.review);assert.equal(result.replayed,true);assert.equal(result.last_sequence,x===own?'2':'1');assert.equal(result.version,x===own?3:2);
      assert.equal((await sell(x)).replayed,true);
    }
    assert.equal((await sell(own,own.second)).replayed,true);
    await assert.rejects(enrollReview({...own.review,reviewReference:'reset-'+randomUUID(),reviewedAt:new Date().toISOString()}),e=>e.code==='23514');
    await assert.rejects(pool.query("UPDATE cashier_operation_receipts SET request_hash=repeat('a',64) WHERE stream_id=$1",[own.streamId]),e=>e.code==='23514');
    await assert.rejects(pool.query("UPDATE cashier_stream_enrollment_reviews SET evidence_sha256=repeat('a',64) WHERE stream_id=$1",[own.streamId]),e=>e.code==='23514');
    const changed=structuredClone(own.body);changed.envelopes[0].payload.note='changed after restore';
    await assert.rejects(sell(own,changed),e=>e.code==='CASHIER_STREAM_IDENTITY_CONFLICT');
    // A restored client may have lost its original receipt or skipped local operations.
    // Neither a fresh operation at an old sequence nor a future gap can reset the
    // server checkpoint, create financial rows, or affect another merchant.
    const stale=saleBody(own.f,own.f.stations[0],own.body.envelopes[0].occurred_at,1);
    await assert.rejects(sell(own,stale),e=>e.code==='CASHIER_STREAM_IDENTITY_CONFLICT'||e.code==='CASHIER_STREAM_RECONCILIATION_REQUIRED');
    const gap=saleBody(own.f,own.f.stations[0],own.body.envelopes[0].occurred_at,4);
    await assert.rejects(sell(own,gap),e=>e.code==='CASHIER_STREAM_SEQUENCE_GAP');
    // A restored local envelope must not be accepted under another merchant,
    // device, or stream even when its operation id and sequence are unchanged.
    const foreignMerchant=structuredClone(own.body);
    foreignMerchant.envelopes[0].payload.cloud_merchant_id=peer.f.merchantId;
    await assert.rejects(sell(own,foreignMerchant),e=>e.code==='CASHIER_SYNC_INVALID'||e.code==='CASHIER_SYNC_TENANT_MISMATCH'||e.code==='CASHIER_STREAM_IDENTITY_CONFLICT');
    const foreignDevice=structuredClone(own.body);
    foreignDevice.envelopes[0].device_id=peer.f.stations[0].deviceId;
    await assert.rejects(sell(own,foreignDevice),e=>e.code==='CASHIER_SYNC_INVALID'||e.code==='CASHIER_STREAM_IDENTITY_CONFLICT');
    // Restored clients cannot substitute a different enrolled stream.
    const substituted={...own,streamId:peer.streamId};
    await assert.rejects(sell(substituted));
    assert.deepEqual(await data(),initial.data);
  });
  if(phase==='verify')await t.test('restored canonical writer commits next sequence once and retains peer and review evidence',async()=>{
    const body=saleBody(own.f,own.f.stations[0],own.body.envelopes[0].occurred_at,3);
    const result=await sell(own,body);assert.equal(result.replayed,false);assert.equal(result.inventory_mutation_count,1);
    const after=await data(),stream=after.cashier_device_streams.find(x=>x.row.id===own.streamId).row;
    assert.equal(Number(stream.last_sequence),3);assert.equal(stream.version,4);
    assert.equal(after.cashier_operation_receipts.filter(x=>x.row.merchant_id===own.f.merchantId).length,3);
    assert.equal(after.orders.filter(x=>x.row.merchant_id===own.f.merchantId).length,3);
    assert.equal(after.inventory_mutations.filter(x=>x.row.merchant_id===own.f.merchantId).length,3);
    assert.equal(after.cashier_operation_attribution.filter(x=>x.row.merchant_id===own.f.merchantId).length,3);
    const stock=after.location_inventory_levels.find(x=>x.row.merchant_id===own.f.merchantId&&x.row.location_id===own.f.locationId&&x.row.product_id===own.f.productId&&x.row.variant_id===null).row;
    assert.equal(Number(stock.quantity),1);
    assert.deepEqual(after.cashier_stream_enrollment_reviews,initial.data.cashier_stream_enrollment_reviews);
    for(const table of selectedTables)assert.deepEqual(after[table].filter(x=>x.row.merchant_id===peer.f.merchantId),initial.data[table].filter(x=>x.row.merchant_id===peer.f.merchantId));
    assert.equal((await sell(own,body)).replayed,true);const retry=await enrollReview(own.review);assert.equal(retry.last_sequence,'3');assert.equal(retry.version,4);
    assert.deepEqual(await data(),after);
  });

  if(phase==='verify')await t.test('post-restore merchant deletion with hashed review ledger is atomic and cannot reset receipts',async deletionT=>{
    const management=await import('../src/services/postgresMerchantManagementAuthority.ts');
    const adminId='review-lifecycle-admin-'+randomUUID();
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')",[adminId,'+1997'+randomInt(100000000,999999999)]);
    await pool.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic lifecycle owner','owner_admin',true,false)",[adminId]);
    await pool.query("UPDATE merchants SET status='suspended',account_status='suspended' WHERE id=$1",[own.f.merchantId]);
    const request=await management.createDeletionRequestPostgres({merchantId:own.f.merchantId,reason:'policy_violation',details:'Synthetic reviewed stream lifecycle',actorAdminId:adminId});
    const lifecycleTables=[...selectedTables,'cashier_operator_sessions','cashier_station_credentials','merchant_cashier_stations','merchant_cashier_staff','cashier_shifts','cashier_station_seat_assignments','merchant_cashier_subscriptions','cashier_billing_orders','merchant_deletion_requests','audit_events','accounts','merchants'];
    async function lifecycleState(){
      const state={};
      for(const table of lifecycleTables){
        const column=['accounts','merchants'].includes(table)?'id':table==='merchant_deletion_requests'?'merchant_id_snapshot':'merchant_id';
        state[table]=(await pool.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE '+column+'=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[ids])).rows;
      }
      return state;
    }
    const before=await lifecycleState(),receipts=before.cashier_operation_receipts,ledger=before.cashier_stream_enrollment_reviews;
    const beforeStream=before.cashier_device_streams.find(x=>x.row.id===own.streamId).row;
    assert.equal(Number(beforeStream.last_sequence),3);
    const complete=()=>management.completeMerchantDeletionPostgres({merchantId:own.f.merchantId,deletionRequestId:request.id,actorAdminId:adminId});
    await deletionT.test('fault after actual stream retirement rolls merchant financial and review state back',async()=>{
      const name='zz_review_lifecycle_fault_'+randomUUID().replaceAll('-','');
      await pool.query("CREATE FUNCTION public."+name+"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lifecycle$ BEGIN IF NEW.id='"+own.f.merchantId+"' AND NEW.retention_status='deleted' THEN IF NOT EXISTS(SELECT 1 FROM public.cashier_device_streams WHERE id='"+own.streamId+"' AND state='retired' AND device_id IS NULL AND last_sequence=3) THEN RAISE EXCEPTION 'retirement barrier not reached'; END IF; RAISE EXCEPTION 'synthetic reviewed lifecycle rollback'; END IF; RETURN NEW; END $lifecycle$");
      await pool.query('CREATE TRIGGER '+name+' AFTER UPDATE OF retention_status ON merchants FOR EACH ROW EXECUTE FUNCTION public.'+name+'()');
      try{await assert.rejects(complete(),e=>e.code==='P0001'&&e.message.includes('synthetic reviewed lifecycle rollback'));}
      finally{await pool.query('DROP TRIGGER '+name+' ON merchants');await pool.query('DROP FUNCTION public.'+name+'()');}
      assert.deepEqual(await lifecycleState(),before);
      await readonlyAuthority();
    });
    await deletionT.test('actual deletion retires binding while preserving immutable receipts and hashed provenance',async()=>{
      assert.equal((await complete()).ok,true);
      const after=await lifecycleState(),stream=after.cashier_device_streams.find(x=>x.row.id===own.streamId).row;
      assert.equal(stream.state,'retired');assert.equal(stream.device_id,null);assert.equal(Number(stream.last_sequence),3);assert.equal(stream.version,beforeStream.version+1);assert.ok(Date.parse(stream.updated_at)>=Date.parse(beforeStream.updated_at));assert.equal(stream.enrolled_at,beforeStream.enrolled_at);
      assert.equal(stream.enrollment_evidence_hash,beforeStream.enrollment_evidence_hash);
      assert.deepEqual(after.cashier_operation_receipts,receipts);assert.deepEqual(after.cashier_stream_enrollment_reviews,ledger);
      const merchant=after.merchants.find(x=>x.row.id===own.f.merchantId).row,account=after.accounts.find(x=>x.row.id===own.f.merchantId).row;
      assert.equal(merchant.retention_status,'deleted');assert.equal(account.state,'closed');assert.equal(account.phone,null);
      for(const table of ['cashier_operator_sessions','cashier_station_credentials','inventory_mutations'])assert.equal(after[table].filter(x=>x.row.merchant_id===own.f.merchantId).length,0,'existing deletion purges '+table);
      for(const old of before.orders.filter(x=>x.row.merchant_id===own.f.merchantId)){
        const retained=after.orders.find(x=>x.row.id===old.row.id).row;
        const redacted=new Set(['conversation_id','customer_external_id','customer_name','customer_phone','customer_address','customer_area','notes','payment_rejection_reason','payment_conflict_resolution_note','metadata','updated_at']);
        for(const key of Object.keys(old.row).filter(k=>!redacted.has(k)))assert.deepEqual(retained[key],old.row[key],'retained financial order field '+key);
        assert.equal(retained.customer_name,'[deleted customer]');assert.deepEqual(retained.metadata,{});
      }
      for(const table of lifecycleTables){
        const column=['accounts','merchants'].includes(table)?'id':table==='merchant_deletion_requests'?'merchant_id_snapshot':'merchant_id';
        assert.deepEqual(after[table].filter(x=>x.row[column]===peer.f.merchantId),before[table].filter(x=>x.row[column]===peer.f.merchantId),'peer '+table);
      }
      const retained=JSON.stringify(after);
      for(const raw of [own.review.reviewReference,own.review.reviewerReference,own.f.stations[0].deviceId])assert.equal(retained.includes(raw),false);
      await readonlyAuthority();
    });
    await deletionT.test('retired deleted merchant cannot re-enroll replay or restart financial sequence',async()=>{
      const after=await lifecycleState();
      await assert.rejects(enrollReview(own.review),e=>e.code==='23514');
      await assert.rejects(enrollReview({...own.review,reviewReference:'restart-'+randomUUID(),reviewedAt:new Date().toISOString()}),e=>e.code==='23514');
      await assert.rejects(sell(own),e=>Number.isInteger(e.status)&&[403,404,409,410,423].includes(e.status));
      assert.deepEqual(await lifecycleState(),after);
    });
    console.log('P0_REVIEW_LEDGER_DELETION_LIFECYCLE '+JSON.stringify({actualMerchantDeletionService:true,postRestore:true,retirementFaultRollback:true,immutableReceiptsAndReviewHashesPreserved:true,rawReviewReferencesAbsent:true,deviceBindingErased:true,noReenrollmentReset:true,peerMerchantPreserved:true,hashesArePseudonymousNotAnonymity:true,retentionScheduleApproved:false,ownerHttpOrHosted:false}));
  });

  if(freshRecovery&&phase==='seed'){
    const {validateCashierRecoveryRolePlan}=await import('../../../scripts/lib/disposable-cashier-role-recovery.mjs');
    const source=JSON.parse(fs.readFileSync(process.env.FAWRI_DISPOSABLE_PG_ATTESTATION,'utf8'));
    const roles=(await pool.query("SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>session_user ORDER BY rolname")).rows;
    const memberships=(await pool.query('SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member FROM pg_auth_members WHERE pg_get_userbyid(roleid)=ANY($1::text[]) OR pg_get_userbyid(member)=ANY($1::text[])',[roles.map(x=>x.rolname)])).rows;
    const plan={format:'fawri-disposable-cashier-role-recovery-v1',sourceSystemIdentifier:(await pool.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,sourceContainerId:source.containerId,sourceRunId:process.env.FAWRI_DISPOSABLE_PG_RUN_ID,roles,memberships};
    validateCashierRecoveryRolePlan(plan,manifest);
    fs.writeFileSync('/restore-proof/cashier-roles.json',JSON.stringify(plan),{mode:0o600});
  }

  console.log('P0_COMBINED_CASHIER_PROPOSAL_RESTORE '+JSON.stringify({phase,fingerprint,canonicalMigrations:53,publicTablesIncludingProposal:98,proposalNotCanonical:true,realRestrictedLogins:true,independentEvidenceAssumed:true,rolesPreprovisionedSameOwnedCluster:!freshRecovery,freshClusterRecovery:freshRecovery,roleBootstrapVerified:freshRecovery&&phase==='verify',exactReplayAndNoReset:true,restoredNextCanonicalSale:phase==='verify',hosted:false}));
  // Deliberately retain roles and fixture data for pg_dump/pg_restore. The
  // existing launcher destroys both owned containers and anonymous volumes.
});
