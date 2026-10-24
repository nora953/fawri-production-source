import assert from 'node:assert/strict';
import {createHash, randomInt, randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env, {
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required',
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: 'required',
  FAWRI_AUTH_SECURITY_SECRET: 'synthetic-conversation-http-secret-over-32-characters',
  FAWRI_PASSWORD_SALT: 'synthetic-conversation-http-salt-over-32-characters',
});

// Application operations use actual restricted LOGINs. Bootstrap SQL is used
// only for synthetic setup, state inspection and cleanup; no provider credential.
test('manual conversation HTTP privacy and recovery use restricted SQL sessions', {timeout: 120000}, async t => {
  const runtime = await createDisposableKnowledgeRuntime(), admin = runtime.admin;
  const merchants = [0, 1].map(() => `conversation-tenant-${randomUUID()}`);
  const adminId = `conversation-owner-${randomUUID()}`;
  let server;
  t.after(() => cleanupResources([
    ['HTTP', async () => {if (server) {server.closeAllConnections(); await new Promise((ok, no) => server.close(e => e ? no(e) : ok()));}}],
    ['requests', () => admin.query('DELETE FROM manual_reply_requests WHERE merchant_id=ANY($1::text[])', [merchants])],
    ['messages', () => admin.query('DELETE FROM messages WHERE merchant_id=ANY($1::text[])', [merchants])],
    ['conversations', () => admin.query('DELETE FROM conversations WHERE merchant_id=ANY($1::text[])', [merchants])],
    ['channels', () => admin.query('DELETE FROM merchant_channels WHERE merchant_id=ANY($1::text[])', [merchants])],
    ['accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [[...merchants, adminId]])],
    ['runtime', () => runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority: auth} = await import('../src/services/authPostgresSessionAuthority.ts');
  const {MERCHANT_SESSION_COOKIE, ADMIN_SESSION_COOKIE} = await import('../src/middleware/authSession.ts');
  const {failManualReplyAuthoritative: fail, completeManualReplyAuthoritative: complete} = await import('../src/services/postgresManualConversationAuthority.ts');
  const {default: router} = await import('../src/routes/conversation-operations.ts');
  const {default: express} = await import('express');
  const {default: cookieParser} = await import('cookie-parser');
  const actors = [];
  for (const id of merchants) {
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
    const channel = `channel-${randomUUID()}`, conversation = `conversation-${randomUUID()}`;
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,page_id) VALUES($1,$2,'messenger','connected',$3)", [channel, id, `page-${id}`]);
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id,customer_name) VALUES($1,$2,$3,$4,$4)", [conversation, id, channel, `private-customer-${id}`]);
    const device = `device-${randomUUID()}`, session = await auth.issueSession({accountId: id, accountKind: 'merchant', tenantId: id, deviceId: device});
    actors.push({id, channel, conversation, device, session, cookie: `${MERCHANT_SESSION_COOKIE}=${session.token}`});
  }
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)", [adminId, `+198${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic','owner_admin',true,false)", [adminId]);
  const ownerSession = await auth.issueSession({accountId: adminId, accountKind: 'admin', tenantId: 'fawri-admin', adminRole: 'owner_admin', deviceId: 'synthetic-owner-device', permissions: []});
  const owner = {cookie: `${ADMIN_SESSION_COOKIE}=${ownerSession.token}`, device: 'synthetic-owner-device'};
  const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/api', router);
  server = await new Promise((ok, no) => {const s = app.listen(0, '127.0.0.1', () => ok(s)); s.once('error', no);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function req(path, actor, method = 'GET', body, extraHeaders = {}) {
    const response = await fetch(origin + '/api' + path, {method, headers: {
      ...(actor ? {Cookie: actor.cookie, 'X-Fawri-Device-Id': actor.device} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {}), ...extraHeaders,
    }, ...(body ? {body: JSON.stringify(body)} : {})});
    return {status: response.status, body: await response.json(), cache: response.headers.get('cache-control')};
  }
  async function snapshot(ids = merchants) {
    const rows = {};
    for (const table of ['conversations', 'messages', 'manual_reply_requests']) rows[table] = (await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`, [ids])).rows;
    return rows;
  }
  function privateFieldsAbsent(body) {
    assert.doesNotMatch(JSON.stringify(body), /text_sha256|idempotency_key|pageAccessToken|page_access_token|private-request-/);
  }
  const [a, b] = actors;
  const messageText = 'Synthetic reconciled reply';
  async function seedRequest(actor, suffix = '') {
    const key = `private-request-${randomUUID()}${suffix}`;
    await admin.query('INSERT INTO manual_reply_requests(id,merchant_id,conversation_id,idempotency_key,text_sha256) VALUES($1,$2,$3,$1,$4)', [key, actor.id, actor.conversation, createHash('sha256').update(messageText).digest('hex')]);
    return key;
  }
  const operations = actor => [
    ['/conversations', 'GET'], [`/conversations/${actor.id}`, 'GET'], [`/conversation/${actor.conversation}`, 'GET'],
    [`/conversations/${actor.conversation}/takeover`, 'POST'], [`/conversations/${actor.conversation}/return-to-fawri`, 'POST'],
    [`/conversations/${actor.conversation}/messages`, 'POST', {text: messageText}],
    [`/conversations/${actor.conversation}/messages/missing/correction-review`, 'POST', {decision: 'dismiss'}],
  ];
  await t.test('anonymous and administrative identities cannot use merchant routes', async () => {
    const before = await snapshot();
    for (const actor of [undefined, owner]) for (const [path, method, body] of operations(a)) assert.equal((await req(path, actor, method, body, {'Idempotency-Key': 'synthetic-denied-request-0001'})).status, 401);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('own list aliases and detail preserve projected fields and exclude peer', async () => {
    for (const actor of actors) {
      const foreign = actor === a ? b : a;
      for (const path of ['/conversations', `/conversations/${actor.id}`, `/conversations?merchant_id=${foreign.id}`]) {
        const r = await req(path, actor); assert.equal(r.status, 200); assert.equal(r.cache, 'no-store');
        assert.deepEqual(r.body.conversations.map(c => c.id), [actor.conversation]);
        assert.doesNotMatch(JSON.stringify(r.body), new RegExp(foreign.id)); privateFieldsAbsent(r.body);
      }
      const r = await req(`/conversation/${actor.conversation}`, actor); assert.equal(r.status, 200);
      assert.equal(r.body.conversation.customer_name, `private-customer-${actor.id}`); privateFieldsAbsent(r.body);
    }
  });
  await t.test('foreign list detail and all mutation paths deny without changing SQL', async () => {
    const before = await snapshot();
    for (const actor of actors) {
      const foreign = actor === a ? b : a;
      for (const [path, method, body] of operations(foreign).slice(1)) {
        const r = await req(path, actor, method, body, {'Idempotency-Key': 'synthetic-foreign-request-0001'});
        assert.equal(r.status, path === `/conversations/${foreign.id}` ? 403 : 404, JSON.stringify(r));
        assert.doesNotMatch(JSON.stringify(r.body), /private-customer|private-request|text_sha256/);
      }
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('own takeover and replay preserve peer and enable manual control', async () => {
    const peer = await snapshot([b.id]);
    for (let i = 0; i < 2; i++) {const r = await req(`/conversations/${a.conversation}/takeover`, a, 'POST'); assert.equal(r.status, 200); assert.equal(r.body.conversation.status, 'manual'); assert.equal(r.body.conversation.assigned_to_human, true); privateFieldsAbsent(r.body);}
    assert.deepEqual(await snapshot([b.id]), peer);
  });
  await t.test('pending and uncertain reply block return with no changes or private fields', async () => {
    const key = await seedRequest(a);
    for (const status of ['pending', 'uncertain']) {
      if (status === 'uncertain') await fail({merchantId: a.id, conversationId: a.conversation, idempotencyKey: key, uncertain: true, errorCode: 'SYNTHETIC_UNCERTAIN'});
      const before = await snapshot();
      const r = await req(`/conversations/${a.conversation}/return-to-fawri`, a, 'POST');
      assert.equal(r.status, 409); assert.equal(r.body.code, 'MANUAL_REPLY_RECONCILIATION_REQUIRED'); privateFieldsAbsent(r.body);
      assert.deepEqual(await snapshot(), before);
      const detail = await req(`/conversation/${a.conversation}`, a); assert.equal(detail.status, 200); privateFieldsAbsent(detail.body);
    }
    // The fixture reconciles uncertain delivery to confirmed failure. This is
    // setup, not a claim that an operator-facing reconciliation workflow exists.
    await admin.query("UPDATE manual_reply_requests SET status='failed',error_code='SYNTHETIC_RECONCILED_FAILURE',updated_at=now() WHERE id=$1", [key]);
  });
  await t.test('confirmed failure permits own return despite another tenant pending reply', async () => {
    await req(`/conversations/${b.conversation}/takeover`, b, 'POST');
    await seedRequest(b);
    const peer = await snapshot([b.id]);
    const r = await req(`/conversations/${a.conversation}/return-to-fawri`, a, 'POST');
    assert.equal(r.status, 200); assert.equal(r.body.conversation.status, 'auto_replying'); assert.equal(r.body.conversation.assigned_to_human, false);
    assert.deepEqual(await snapshot([b.id]), peer); privateFieldsAbsent(r.body);
  });
  await t.test('delivered service completion permits HTTP replay without send then legitimate return', async () => {
    assert.equal((await req(`/conversations/${a.conversation}/takeover`, a, 'POST')).status, 200);
    const key = await seedRequest(a);
    const delivered = await complete({merchantId: a.id, conversationId: a.conversation, idempotencyKey: key, messageText, externalMessageId: `synthetic-delivery-${randomUUID()}`});
    const before = await snapshot();
    const replay = await req(`/conversations/${a.conversation}/messages`, a, 'POST', {text: messageText}, {'Idempotency-Key': key});
    assert.equal(replay.status, 200); assert.equal(replay.body.deduplicated, true); assert.equal(replay.body.message.id, delivered.id); privateFieldsAbsent(replay.body);
    assert.deepEqual(await snapshot(), before);
    const changed = await req(`/conversations/${a.conversation}/messages`, a, 'POST', {text: 'changed'}, {'Idempotency-Key': key});
    assert.equal(changed.status, 409); assert.equal(changed.body.code, 'IDEMPOTENCY_KEY_REUSED'); assert.deepEqual(await snapshot(), before);
    const r = await req(`/conversations/${a.conversation}/return-to-fawri`, a, 'POST'); assert.equal(r.status, 200); assert.equal(r.body.conversation.status, 'auto_replying');
  });
  await t.test('delivered idempotency key cannot be reassigned to another own conversation', async () => {
    assert.equal((await req(`/conversations/${a.conversation}/takeover`, a, 'POST')).status, 200);
    const key = await seedRequest(a);
    await complete({merchantId: a.id, conversationId: a.conversation, idempotencyKey: key, messageText, externalMessageId: `synthetic-bound-delivery-${randomUUID()}`});
    const sibling = `sibling-${randomUUID()}`;
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id) VALUES($1,$2,$3,$1)", [sibling, a.id, a.channel]);
    assert.equal((await req(`/conversations/${sibling}/takeover`, a, 'POST')).status, 200);
    const before = await snapshot();
    const r = await req(`/conversations/${sibling}/messages`, a, 'POST', {text: messageText}, {'Idempotency-Key': key});
    assert.equal(r.status, 409); assert.equal(r.body.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.deepEqual(await snapshot(), before); privateFieldsAbsent(r.body);
  });
  await t.test('wrong device and administrative token in merchant cookie deny without changes', async () => {
    const before = await snapshot();
    for (const headers of [{'X-Fawri-Device-Id': 'wrong'}, {Cookie: `${MERCHANT_SESSION_COOKIE}=${ownerSession.token}`}]) for (const [path, method, body] of operations(a)) assert.equal((await req(path, a, method, body, headers)).status, 401);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('revoked merchant session loses all reads and writes while peer remains valid', async () => {
    assert.equal(await auth.revokeSession(a.session.token, 'merchant', 'logout'), true);
    const before = await snapshot();
    for (const [path, method, body] of operations(a)) assert.equal((await req(path, a, method, body)).status, 401);
    assert.deepEqual(await snapshot(), before); assert.equal((await req('/conversations', b)).status, 200);
  });
  console.log('P0_CONVERSATION_PRIVACY_HTTP ' + JSON.stringify({syntheticMerchants: 2, actualRouter: true, restrictedSqlSessions: true, foreignDenials: 12, pendingAndUncertainReturnDenied: true, failedAndSentReturnAccepted: true, deliveredHttpReplay: true, privateRequestProjectionAbsent: true, revokedSessionDenied: true, providerSendExecuted: false, wholeAppAccepted: false, fullEightTableMatrix: false, hostedAccepted: false}));
});
