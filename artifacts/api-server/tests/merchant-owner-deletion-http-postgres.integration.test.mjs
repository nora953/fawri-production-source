import assert from 'node:assert/strict';
import {randomInt, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env, {FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required', FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: 'required', FAWRI_AUTH_SECURITY_SECRET: 'synthetic-owner-deletion-secret-over-32-characters', FAWRI_PASSWORD_SALT: 'synthetic-owner-deletion-salt-over-32-characters', FAWRI_ALLOWED_ORIGINS: 'https://deletion.example.invalid'});

test('actual owner deletion HTTP enforces password session quiescence and tenant boundaries', {timeout: 120000}, async t => {
  const runtime = await createDisposableKnowledgeRuntime(), admin = runtime.admin;
  const ids = [], merchants = [], actors = [];
  const dataRoot = process.env.FAWRI_DATA_DIR; assert.ok(dataRoot);
  let server;
  t.after(() => cleanupResources([
    ['HTTP', async () => {if (server) {server.closeAllConnections(); await new Promise((ok, no) => server.close(e => e ? no(e) : ok()));}}],
    ...['background_jobs', 'catalog_image_references', 'saved_answers', 'products', 'merchant_admin_notes', 'merchant_channel_overrides', 'audit_events','emergency_access_requests'].map(table => [table, () => admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`, [merchants])]),
    ['requests', () => admin.query('DELETE FROM merchant_deletion_requests WHERE merchant_id_snapshot=ANY($1::text[])', [merchants])],
    ['notices', () => admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=ANY($2::text[])', [merchants, ids])],
    ['directory audits', () => admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])', [ids])],
    ['devices', () => admin.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])', [ids])],
    ['accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [ids])],
    ['runtime', () => runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority: auth} = await import('../src/services/authPostgresSessionAuthority.ts');
  const {hashPassword} = await import('../src/services/authPasswordService.ts');
  const security = await import('../src/services/postgresAdminSecurityAuthority.ts');
  const {ADMIN_SESSION_COOKIE, MERCHANT_SESSION_COOKIE, enforceAuthOrigin} = await import('../src/middleware/authSession.ts');
  const {default: router} = await import('../src/routes/auth-merchant-management-postgres-routes.ts');
  const management = await import('../src/services/postgresMerchantManagementAuthority.ts');
  const media = await import('../src/services/catalogMediaStorage.ts');
  const {default: express} = await import('express'), {default: cookieParser} = await import('cookie-parser');
  const ownerPassword = `Synthetic-${randomUUID()}-A1!`;
  async function actor(kind, role, permissions = []) {
    const id = `delete-http-${randomUUID()}`; ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,$4,$5,true)", [id, kind, `+198${randomInt(100000000,999999999)}`, kind === 'admin' && role === 'owner_admin' ? hashPassword(ownerPassword) : 'synthetic', 'active']);
    if (kind === 'admin') {
      await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)", [id, role]);
      for (const permission of permissions) await admin.query('INSERT INTO admin_permissions(admin_id,permission) VALUES($1,$2)', [id, permission]);
    } else {
      merchants.push(id); await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic owner','Synthetic store','retail','approved','approved')", [id]);
    }
    const result = {id, kind, role, permissions, device: `device-${randomUUID()}`}; actors.push(result); return result;
  }
  const owner = await actor('admin', 'owner_admin'), assistant = await actor('admin', 'assistant_admin', ['manage_merchant_status', 'manage_channels', 'view_logs', 'manage_subscriptions']);
  const a = await actor('merchant'), b = await actor('merchant'), blocked = await actor('merchant'), race = await actor('merchant'), staged = await actor('merchant');
  for (const actor of actors) {
    if (actor.kind === 'admin') {const device = await security.registerAdminDeviceAuthoritative({accountId: actor.id, accountKind: 'admin', deviceId: actor.device, deviceLabel: 'Synthetic'}); await security.setAdminDeviceTrustAuthoritative({deviceRecordId: device.id, trusted: true, actorAccountId: owner.id});}
    actor.session = await auth.issueSession({accountId: actor.id, accountKind: actor.kind, tenantId: actor.kind === 'admin' ? 'fawri-admin' : actor.id, adminRole: actor.role, permissions: actor.permissions, deviceId: actor.device});
    actor.cookie = `${actor.kind === 'admin' ? ADMIN_SESSION_COOKIE : MERCHANT_SESSION_COOKIE}=${actor.session.token}`;
  }
  for (const actor of [a, b, blocked, race, staged]) {
    await management.updateMerchantStatusPostgres({merchantId: actor.id, status: 'suspended', reason: 'Synthetic deletion prerequisite', actorAdminId: owner.id});
    await admin.query("INSERT INTO products(id,merchant_id,name) VALUES($1,$2,'Synthetic private product')", [`product-${actor.id}`, actor.id]);
    await admin.query("INSERT INTO saved_answers(id,merchant_id,category,question_pattern,normalized_question,answer_text,language) VALUES($1,$2,'custom','Synthetic?','synthetic','Synthetic private answer','en')", [`answer-${actor.id}`, actor.id]);
    await management.setMerchantAdminNotePostgres({merchantId: actor.id, note: `private-note-${actor.id}`, actorAdminId: owner.id});
    await management.setMerchantChannelOverridePostgres({merchantId: actor.id, platform: 'messenger', status: 'connected', actorAdminId: owner.id});
    actor.request = await management.createDeletionRequestPostgres({merchantId: actor.id, actorAdminId: assistant.id, reason: 'policy_violation', details: 'Synthetic scoped HTTP regression'});
    const uploaded = await media.storeCatalogImage({merchantId: actor.id, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), suppliedMime: 'image/jpeg'});
    actor.image = path.join(dataRoot, 'catalog-media', uploaded.storage_key);
    await admin.query('INSERT INTO catalog_image_references(id,merchant_id,product_id,storage_key,ordinal) VALUES($1,$2,$3,$4,0)', [`image-${actor.id}`, actor.id, `product-${actor.id}`, uploaded.storage_key]);
  }
  const jobId = `queued-${randomUUID()}`;
  await admin.query("INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,status) VALUES($1,'audit.test',$1,$2,'queued')", [jobId, blocked.id]);
  const {default: emergencyRouter}=await import('../src/routes/auth-emergency-postgres-routes.ts');
  const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/api/auth', enforceAuthOrigin, router, emergencyRouter);
  server = await new Promise((ok, no) => {const s = app.listen(0, '127.0.0.1', () => ok(s)); s.once('error', no);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function req(actor, target = a, overrides = {}, headers = {}) {
    const response = await fetch(`${origin}/api/auth/merchants/${target.id}/delete`, {method: 'POST', headers: {'Content-Type': 'application/json', ...(actor ? {Cookie: actor.cookie, 'X-Fawri-Device-Id': actor.device} : {}), ...headers}, body: JSON.stringify({adminId: owner.id, adminPassword: ownerPassword, deletionRequestId: target.request.id, ...overrides})});
    return {status: response.status, body: await response.json()};
  }
  async function snapshot(targets = [a, b, blocked]) {
    const tenantIds = targets.map(x => x.id), result = {};
    result.accounts = (await admin.query('SELECT to_jsonb(t) AS row FROM accounts t WHERE id=ANY($1::text[]) ORDER BY id', [tenantIds])).rows;
    result.merchants = (await admin.query('SELECT to_jsonb(t) AS row FROM merchants t WHERE id=ANY($1::text[]) ORDER BY id', [tenantIds])).rows;
    for (const table of ['products', 'saved_answers', 'catalog_image_references', 'merchant_admin_notes', 'merchant_channel_overrides', 'audit_events', 'background_jobs']) result[table] = (await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`, [tenantIds])).rows;
    result.requests = (await admin.query('SELECT to_jsonb(t) AS row FROM merchant_deletion_requests t WHERE merchant_id_snapshot=ANY($1::text[]) ORDER BY id', [tenantIds])).rows;
    result.images = targets.map(x => ({id: x.id, exists: fs.existsSync(x.image)})); return result;
  }
  await t.test('anonymous merchant and assistant cannot complete owner deletion with owner body credentials', async () => {
    const before = await snapshot(); for (const [actor, status] of [[undefined, 401], [b, 401], [assistant, 403]]) assert.equal((await req(actor)).status, status); assert.deepEqual(await snapshot(), before);
  });
  await t.test('owner password identity and required input are checked without business mutations', async () => {
    const before = await snapshot();
    for (const [body, status] of [[{adminPassword: 'Wrong-password-A1!'}, 401], [{adminId: assistant.id}, 401], [{deletionRequestId: ''}, 400]]) assert.equal((await req(owner, a, body)).status, status);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('wrong device and origin cannot delete even with a valid owner password', async () => {
    const before = await snapshot();
    assert.equal((await req(owner, a, {}, {'X-Fawri-Device-Id': 'wrong'})).status, 401);
    assert.equal((await req(owner, a, {}, {Origin: 'https://forbidden.example.invalid'})).status, 403); assert.deepEqual(await snapshot(), before);
  });
  await t.test('foreign deletion request cannot authorize target merchant purge', async () => {
    const before = await snapshot(), r = await req(owner, a, {deletionRequestId: b.request.id}); assert.equal(r.status, 404); assert.equal(r.body.code, 'DELETION_REQUEST_NOT_FOUND'); assert.deepEqual(await snapshot(), before);
  });
  await t.test('queued operational work blocks actual HTTP purge despite restricted primary visibility', async () => {
    const before = await snapshot(), r = await req(owner, blocked); assert.equal(r.status, 409); assert.equal(r.body.code, 'MERCHANT_DELETION_OPERATIONS_PENDING'); assert.deepEqual(await snapshot(), before);
  });
  let peerEmergencyRows;
  async function auditRead(){const response=await fetch(origin+'/api/auth/admin/emergency-read-access/audit',{headers:{Cookie:owner.cookie,'X-Fawri-Device-Id':owner.device}});return {status:response.status,body:await response.json()};}
  await t.test('real emergency ledger is valid before deletion of one audited merchant',async()=>{
    const {createEmergencyRequestPostgres}=await import('../src/services/postgresEmergencyReadAccessAuthority.ts');
    for(const merchant of [b,blocked])await createEmergencyRequestPostgres({adminId:owner.id,adminName:'Synthetic owner',adminSessionId:owner.session.id,isOwner:true,merchantId:merchant.id,incidentReference:'synthetic-chain-'+merchant.id,severity:'high',reason:'Synthetic deletion chain interaction',durationMinutes:15,criticalSelfActivate:false});
    const first=await auditRead();assert.equal(first.status,200);assert.equal(first.body.verification.valid,true);
    peerEmergencyRows=(await admin.query("SELECT to_jsonb(t) AS row FROM audit_events t WHERE merchant_id=$1 AND entity_type='emergency_read_access' ORDER BY id",[b.id])).rows;assert.equal(peerEmergencyRows.length,2);
  });
  await t.test('audited merchant deletion fails closed without scrubbing PII or changing the global ledger',async()=>{
    const before=await snapshot();const result=await req(owner,b);assert.equal(result.status,409);assert.equal(result.body.code,'MERCHANT_DELETION_AUDIT_POLICY_REQUIRED');assert.deepEqual(await snapshot(),before);
    const audit=await auditRead();assert.equal(audit.status,200);assert.equal(audit.body.verification.valid,true);
  });
  await t.test('overlapping emergency creation and deletion never leave emergency access on a deleted merchant or break the chain',async()=>{
    const gate=await admin.connect();let held=false,tasks=[];
    try{
      await gate.query('BEGIN');const gatePid=(await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await gate.query('SELECT id FROM merchants WHERE id=$1 FOR UPDATE',[race.id]);held=true;
      tasks=[req(owner,race),fetch(origin+'/api/auth/admin/emergency-read-access/requests',{method:'POST',headers:{'Content-Type':'application/json',Cookie:owner.cookie,'X-Fawri-Device-Id':owner.device},body:JSON.stringify({merchant_id:race.id,incident_reference:'synthetic-concurrent-'+race.id,severity:'high',reason:'Synthetic concurrent deletion boundary',duration_minutes:15}),signal:AbortSignal.timeout(15000)}).then(async response=>({status:response.status,body:await response.json()}))];
      const outcomes=[];tasks=tasks.map((task,index)=>task.then(value=>{outcomes.push({index,status:value.status,code:value.body?.code??null});return value;}));
      const deadline=Date.now()+5000;let waiters=0,activity=[];
      while(Date.now()<deadline){const r=await admin.query("SELECT pid,state,wait_event_type,wait_event,left(query,240) AS query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE usename=$1 ORDER BY pid",[runtime.authRole]);activity=r.rows;waiters=activity.filter(row=>row.wait_event_type==='Lock' && row.blockers.includes(gatePid)).length;if(waiters>=2)break;await new Promise(ok=>setTimeout(ok,25));}
      console.log('P0_DELETION_EMERGENCY_GATE '+JSON.stringify({gatePid,waiters,activity,outcomes}));
      assert.ok(waiters>=2,'two actual SQL lock waiters required');
      await gate.query('COMMIT');held=false;
      const results=await Promise.all(tasks);const deleted=(await admin.query('SELECT retention_status FROM merchants WHERE id=$1',[race.id])).rows[0].retention_status==='deleted';
      const active=(await admin.query("SELECT count(*)::int AS n FROM emergency_access_requests WHERE merchant_id=$1 AND status IN ('pending','active')",[race.id])).rows[0].n;
      const audit=await auditRead();console.log('P0_DELETION_EMERGENCY_RACE '+JSON.stringify({waiters,statuses:results.map(x=>x.status),deleted,activeRequests:active,auditStatus:audit.status}));
      assert.equal(audit.status,200);assert.equal(audit.body.verification.valid,true);
      if(deleted)assert.equal(active,0,'deleted merchant must not receive newly active emergency access');
      assert.ok(results.every(r=>[200,201,404,409].includes(r.status)),JSON.stringify(results));
    }finally{if(held)await gate.query('ROLLBACK');gate.release();await Promise.allSettled(tasks);}
  });
  await t.test('emergency request paused after merchant validation cannot activate on a concurrently deleted merchant',async()=>{
    const trigger='deletion_emergency_gate_'+randomUUID().replaceAll('-','');
    const lockKey=randomInt(100000,2000000000),gate=await admin.connect();
    let held=false,tasks=[];
    const peer=await snapshot([b,blocked]);
    try{
      await admin.query(`CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id='${staged.id}' THEN PERFORM pg_advisory_xact_lock(${lockKey}); END IF; RETURN NEW; END $$`);
      await admin.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON emergency_access_requests FOR EACH ROW EXECUTE FUNCTION public.${trigger}()`);
      await gate.query('BEGIN');await gate.query('SELECT pg_advisory_xact_lock($1)',[lockKey]);held=true;
      const gatePid=(await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const creation=fetch(origin+'/api/auth/admin/emergency-read-access/requests',{method:'POST',headers:{'Content-Type':'application/json',Cookie:owner.cookie,'X-Fawri-Device-Id':owner.device},body:JSON.stringify({merchant_id:staged.id,incident_reference:'synthetic-staged-'+staged.id,severity:'high',reason:'Synthetic staged deletion boundary',duration_minutes:15}),signal:AbortSignal.timeout(20000)}).then(async response=>({status:response.status,body:await response.json()}));
      tasks.push(creation);
      let creatorPid,deadline=Date.now()+5000;
      while(Date.now()<deadline){const rows=(await admin.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND wait_event='advisory'",[runtime.authRole])).rows;creatorPid=rows.find(row=>row.blockers.includes(gatePid))?.pid;if(creatorPid)break;await new Promise(ok=>setTimeout(ok,25));}
      assert.ok(creatorPid,'canonical emergency INSERT must reach the owned post-validation advisory gate');
      let deletionResult;const deletion=req(owner,staged).then(result=>{deletionResult=result;return result;});tasks.push(deletion);
      let deleteWait=false;deadline=Date.now()+5000;
      while(Date.now()<deadline){if(deletionResult)break;const rows=(await admin.query("SELECT pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",[runtime.authRole])).rows;deleteWait=rows.some(row=>row.blockers.includes(creatorPid));if(deleteWait)break;await new Promise(ok=>setTimeout(ok,25));}
      assert.ok(deletionResult||deleteWait,'deletion must either finish or demonstrably wait on the paused creator');
      await gate.query('COMMIT');held=false;
      const [created,deleted]=await Promise.all([creation,deletion]);
      const state=(await admin.query('SELECT retention_status FROM merchants WHERE id=$1',[staged.id])).rows[0];
      const active=(await admin.query("SELECT count(*)::int AS n FROM emergency_access_requests WHERE merchant_id=$1 AND status IN ('pending','active')",[staged.id])).rows[0].n;
      const audit=await auditRead();
      console.log('P0_DELETION_EMERGENCY_STAGED '+JSON.stringify({postValidationGateObserved:true,deleteWait,creationStatus:created.status,deletionStatus:deleted.status,deletionCode:deleted.body.code??null,retentionStatus:state.retention_status,activeRequests:active,auditStatus:audit.status}));
      assert.equal(audit.status,200);assert.equal(audit.body.verification.valid,true);assert.deepEqual(await snapshot([b,blocked]),peer);
      assert.ok(state.retention_status!=='deleted'||active===0,'post-validation emergency insertion must not activate access on a deleted merchant');
      assert.equal(created.status,201);assert.equal(deleted.status,409);assert.equal(deleted.body.code,'MERCHANT_DELETION_AUDIT_POLICY_REQUIRED');
    }finally{
      if(held)await gate.query('ROLLBACK');gate.release();await Promise.allSettled(tasks);
      await admin.query(`DROP TRIGGER IF EXISTS ${trigger} ON emergency_access_requests`);await admin.query(`DROP FUNCTION IF EXISTS public.${trigger}()`);
    }
  });
  await t.test('authorized owner HTTP purges only target private data and local media then rejects repeat', async () => {
    const peer = await snapshot([b, blocked]), r = await req(owner); assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.body.deletedMerchantId, a.id); assert.equal(r.body.deletion_request.status, 'completed');
    const account = (await admin.query('SELECT state,phone,phone_verified,password_hash FROM accounts WHERE id=$1', [a.id])).rows[0]; assert.equal(account.state, 'closed'); assert.equal(account.phone, null); assert.equal(account.phone_verified, false); assert.match(account.password_hash, /^deleted\$/);
    const merchant = (await admin.query('SELECT owner_name,store_name,retention_status FROM merchants WHERE id=$1', [a.id])).rows[0]; assert.equal(merchant.owner_name, '[deleted merchant]'); assert.equal(merchant.store_name, '[deleted merchant]'); assert.equal(merchant.retention_status, 'deleted');
    for (const table of ['products', 'saved_answers', 'catalog_image_references', 'merchant_admin_notes', 'merchant_channel_overrides']) assert.equal((await admin.query(`SELECT 1 FROM ${table} WHERE merchant_id=$1`, [a.id])).rowCount, 0);
    assert.equal(fs.existsSync(a.image), false); assert.deepEqual(await snapshot([b, blocked]), peer);
    const auditCount = (await admin.query("SELECT count(*)::int AS n FROM audit_events WHERE merchant_id=$1 AND action_type='merchant_deleted'", [a.id])).rows[0].n; assert.equal(auditCount, 1);
    const after = await snapshot(); const repeat = await req(owner); assert.equal(repeat.status, 404); assert.equal(repeat.body.code, 'MERCHANT_NOT_FOUND'); assert.deepEqual(await snapshot(), after);
    assert.equal((await runtime.runtimePool.query('SELECT id FROM products WHERE merchant_id=ANY($1::text[])', [merchants])).rowCount, 0);
  });
  await t.test('deleting an audited merchant preserves global emergency verification and exact peer ledger',async()=>{
    const audit=await auditRead();console.log('P0_DELETION_CHAIN_OBSERVATION '+JSON.stringify({status:audit.status,valid:audit.body.verification?.valid??false,code:audit.body.code??null}));
    assert.equal(audit.status,200,'completed merchant deletion must not invalidate global owner audit');assert.equal(audit.body.verification.valid,true);
    assert.deepEqual((await admin.query("SELECT to_jsonb(t) AS row FROM audit_events t WHERE merchant_id=$1 AND entity_type='emergency_read_access' ORDER BY id",[b.id])).rows,peerEmergencyRows);
  });
  await t.test('revoked owner session cannot delete intact peer with valid password', async () => {
    assert.equal(await auth.revokeSession(owner.session.token, 'admin', 'logout'), true); const before = await snapshot([b, blocked]); assert.equal((await req(owner, b)).status, 401); assert.deepEqual(await snapshot([b, blocked]), before);
  });
  console.log('P0_OWNER_DELETION_HTTP ' + JSON.stringify({syntheticMerchants: 3, actualRouter: true, restrictedPrimaryLogin: true, separateAuthenticationLogin: true, realOwnerPassword: true, foreignRequestDenied: true, queuedWorkDenied: true, peerAndBlockedTenantPreserved: true, localPhysicalMedia: true, repeatNoMutation: true, operatorPoolClaimed: false, financialRetentionPolicyAccepted: false, hostedAccepted: false, fullRoleMatrix: false}));
});
