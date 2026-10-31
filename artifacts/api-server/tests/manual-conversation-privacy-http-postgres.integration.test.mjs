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
  const populated = new Map();
  await t.test('populated correction media and learning metadata survive own list aliases and detail', async () => {
    for (const actor of actors) {
      const customer = `metadata-customer-${randomUUID()}`, fawri = `metadata-fawri-${randomUUID()}`, manual = `metadata-manual-${randomUUID()}`;
      const customerMetadata = {media: {content_kind: 'image', attachment_count: 1, has_attachment: true, content_identity_hash: 'b'.repeat(64), image_sha256: 'c'.repeat(64), vision_provider_id: 'synthetic-vision', vision_model: 'synthetic-model', visual_alternatives: [{product_id: `product-${actor.id}`, confidence: 0.8}]}, reply_to_external_message_id: `synthetic-parent-${actor.id}`};
      const fawriMetadata = {knowledge_stage: 'ai_fallback', knowledge_source: 'synthetic', reason_code: 'SYNTHETIC_CONTEXT', confidence: 0.8, matched_record_id: null, grounding_record_ids: [`ground-${actor.id}`], source_customer_message_id: customer, training_request_id: null, handoff_after_reply: false};
      const manualMetadata = {correction_review: {status: 'pending', customer_message_id: customer, fawri_message_id: fawri, source_stage: 'ai_fallback', matched_record_id: null, created_at: new Date().toISOString(), knowledge_id: null, apply_mode: null}, manual_reply_learning: 'synthetic-retained', learned_training_request_id: `training-${actor.id}`, learned_answer_id: `answer-${actor.id}`};
      const fixtures = [
        {id: customer, sender: 'customer', status: 'received', text: `synthetic-question-${actor.id}`, metadata: customerMetadata},
        {id: fawri, sender: 'fawri', status: 'sent', text: `synthetic-answer-${actor.id}`, metadata: fawriMetadata},
        {id: manual, sender: 'merchant', status: 'sent', text: `synthetic-correction-${actor.id}`, metadata: manualMetadata},
      ];
      for (const row of fixtures) await admin.query('INSERT INTO messages(id,merchant_id,conversation_id,sender,status,text,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [row.id, actor.id, actor.conversation, row.sender, row.status, row.text, JSON.stringify(row.metadata)]);
      populated.set(actor.id, {customer, fawri, manual, fixtures, manualMetadata});
    }
    const before = await snapshot();
    for (const actor of actors) {
      const foreign = actor === a ? b : a;
      for (const path of ['/conversations', `/conversations/${actor.id}`, `/conversation/${actor.conversation}`]) {
        const r = await req(path, actor); assert.equal(r.status, 200); assert.equal(r.cache, 'no-store');
        const conversation = r.body.conversation || r.body.conversations.find(c => c.id === actor.conversation);
        for (const fixture of populated.get(actor.id).fixtures) assert.deepEqual(conversation.messages.find(m => m.id === fixture.id).metadata, fixture.metadata);
        assert.doesNotMatch(JSON.stringify(r.body), new RegExp(foreign.id)); privateFieldsAbsent(r.body);
      }
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('real populated correction IDs reject foreign and mismatched conversation access', async () => {
    const before = await snapshot();
    for (const actor of actors) {
      const foreign = actor === a ? b : a, foreignMessage = populated.get(foreign.id).manual;
      for (const conversation of [foreign.conversation, actor.conversation]) {
        const r = await req(`/conversations/${conversation}/messages/${foreignMessage}/correction-review`, actor, 'POST', {decision: 'dismiss', merchant_id: foreign.id});
        assert.equal(r.status, 404); assert.equal(r.body.code, 'CORRECTION_REVIEW_NOT_FOUND');
        assert.doesNotMatch(JSON.stringify(r.body), /synthetic-question|synthetic-correction|manual_reply_learning|grounding_record_ids/);
      }
      const detail = await req(`/conversation/${foreign.conversation}`, actor); assert.equal(detail.status, 404); privateFieldsAbsent(detail.body);
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('authorized dismissal and exact replay retain UI review state and sibling metadata', async () => {
    const fixture = populated.get(a.id), peer = await snapshot([b.id]);
    const path = `/conversations/${a.conversation}/messages/${fixture.manual}/correction-review`;
    const r = await req(path, a, 'POST', {decision: 'dismiss', merchant_id: b.id});
    assert.equal(r.status, 200); assert.equal(r.body.result.status, 'dismissed'); assert.equal(r.cache, 'no-store');
    const metadata = r.body.conversation.messages.find(m => m.id === fixture.manual).metadata;
    assert.equal(metadata.correction_review.status, 'dismissed'); assert.ok(metadata.correction_review.reviewed_at);
    for (const field of ['customer_message_id', 'fawri_message_id', 'source_stage']) assert.equal(metadata.correction_review[field], fixture.manualMetadata.correction_review[field]);
    for (const field of ['manual_reply_learning', 'learned_training_request_id', 'learned_answer_id']) assert.equal(metadata[field], fixture.manualMetadata[field]);
    for (const row of fixture.fixtures.filter(m => m.id !== fixture.manual)) assert.deepEqual(r.body.conversation.messages.find(m => m.id === row.id).metadata, row.metadata);
    const after = await snapshot();
    const replay = await req(path, a, 'POST', {decision: 'dismiss'}); assert.equal(replay.status, 200); assert.equal(replay.body.result.status, 'dismissed'); assert.deepEqual(await snapshot(), after);
    const conflict = await req(path, a, 'POST', {decision: 'approve'}); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'CORRECTION_REVIEW_CONFLICT'); assert.deepEqual(await snapshot(), after);
    assert.deepEqual(await snapshot([b.id]), peer); privateFieldsAbsent(r.body);
  });
  await t.test('invalid review decision and foreign context reference cannot mutate populated records', async () => {
    const fixture = populated.get(b.id), path = `/conversations/${b.conversation}/messages/${fixture.manual}/correction-review`;
    const before = await snapshot(); const invalid = await req(path, b, 'POST', {decision: 'invalid'}); assert.equal(invalid.status, 400); assert.deepEqual(await snapshot(), before);
    const poisoned = structuredClone(fixture.manualMetadata); poisoned.correction_review.customer_message_id = populated.get(a.id).customer;
    await admin.query('UPDATE messages SET metadata=$2::jsonb WHERE id=$1', [fixture.manual, JSON.stringify(poisoned)]);
    try {
      const state = await snapshot(), r = await req(path, b, 'POST', {decision: 'dismiss'});
      assert.equal(r.status, 409); assert.equal(r.body.code, 'CORRECTION_REVIEW_CONTEXT_INVALID'); assert.deepEqual(await snapshot(), state); privateFieldsAbsent(r.body);
    } finally {
      await admin.query('UPDATE messages SET metadata=$2::jsonb WHERE id=$1', [fixture.manual, JSON.stringify(fixture.manualMetadata)]);
    }
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
  await t.test('revoked session cannot read populated metadata or review a real correction', async () => {
    const before = await snapshot(), own = populated.get(a.id);
    assert.equal((await req(`/conversation/${a.conversation}`, a)).status, 401);
    assert.equal((await req(`/conversations/${a.conversation}/messages/${own.manual}/correction-review`, a, 'POST', {decision: 'dismiss'})).status, 401);
    assert.deepEqual(await snapshot(), before);
    const peer = await req(`/conversation/${b.conversation}`, b); assert.equal(peer.status, 200);
    assert.equal(peer.body.conversation.messages.find(m => m.id === populated.get(b.id).manual).metadata.correction_review.status, 'pending');
  });
  console.log('P0_CONVERSATION_PRIVACY_HTTP ' + JSON.stringify({syntheticMerchants: 2, actualRouter: true, restrictedSqlSessions: true, foreignDenials: 12, populatedMetadataFixtures: 6, populatedMetadataCases: 5, authorizedCorrectionDismissReplay: true, foreignCorrectionDenials: 4, pendingAndUncertainReturnDenied: true, failedAndSentReturnAccepted: true, deliveredHttpReplay: true, privateRequestProjectionAbsent: true, revokedSessionDenied: true, providerSendExecuted: false, wholeAppAccepted: false, fullEightTableMatrix: false, hostedAccepted: false}));
});
