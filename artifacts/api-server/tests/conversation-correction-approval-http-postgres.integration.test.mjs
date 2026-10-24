import assert from 'node:assert/strict';
import {randomInt, randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env, {
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required',
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: 'required',
  FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: 'disabled',
  FAWRI_AUTH_SECURITY_SECRET: 'synthetic-approval-http-secret-over-32-characters',
  FAWRI_PASSWORD_SALT: 'synthetic-approval-http-salt-over-32-characters',
});

test('correction approval preserves tenant knowledge and recovers after review-write failure', {timeout: 120000}, async t => {
  const runtime = await createDisposableKnowledgeRuntime(), admin = runtime.admin;
  const merchants = [0, 1].map(() => `approval-tenant-${randomUUID()}`);
  const trigger = `approval_fail_${randomUUID().replaceAll('-', '')}`;
  let server;
  t.after(() => cleanupResources([
    ['fault trigger', () => admin.query(`DROP TRIGGER IF EXISTS ${trigger} ON messages`)],
    ['fault function', () => admin.query(`DROP FUNCTION IF EXISTS public.${trigger}()`)],
    ['HTTP', async () => {if (server) {server.closeAllConnections(); await new Promise((ok, no) => server.close(e => e ? no(e) : ok()));}}],
    ...['knowledge_audit_events', 'knowledge_embeddings', 'learned_answers', 'saved_answers', 'messages', 'conversations', 'merchant_channels'].map(table => [table, () => admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`, [merchants])]),
    ['accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [merchants])],
    ['runtime', () => runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority: auth} = await import('../src/services/authPostgresSessionAuthority.ts');
  const {MERCHANT_SESSION_COOKIE} = await import('../src/middleware/authSession.ts');
  const {normalizeKnowledgeText} = await import('../src/services/knowledge/normalization.ts');
  const {default: router} = await import('../src/routes/conversation-operations.ts');
  const {default: express} = await import('express');
  const {default: cookieParser} = await import('cookie-parser');
  const question = 'How can I choose a fabric color?';
  const normalized = normalizeKnowledgeText(question), actors = [];
  async function seedReview(actor, questionText, answer) {
    const customer = `approval-customer-${randomUUID()}`, fawri = `approval-fawri-${randomUUID()}`, manual = `approval-manual-${randomUUID()}`;
    const review = {status: 'pending', customer_message_id: customer, fawri_message_id: fawri, source_stage: 'ai_fallback', matched_record_id: null, created_at: new Date().toISOString()};
    for (const row of [
      {id: customer, sender: 'customer', status: 'received', text: questionText, metadata: {}},
      {id: fawri, sender: 'fawri', status: 'sent', text: 'Synthetic original answer', metadata: {knowledge_stage: 'ai_fallback'}},
      {id: manual, sender: 'merchant', status: 'sent', text: answer, metadata: {correction_review: review}},
    ]) await admin.query('INSERT INTO messages(id,merchant_id,conversation_id,sender,status,text,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [row.id, actor.id, actor.conversation, row.sender, row.status, row.text, JSON.stringify(row.metadata)]);
    return {manual, answer, question: questionText};
  }
  for (const id of merchants) {
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
    const channel = `channel-${randomUUID()}`, conversation = `conversation-${randomUUID()}`;
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status) VALUES($1,$2,'messenger','connected')", [channel, id]);
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id) VALUES($1,$2,$3,$1)", [conversation, id, channel]);
    const device = `device-${randomUUID()}`, session = await auth.issueSession({accountId: id, accountKind: 'merchant', tenantId: id, deviceId: device});
    const actor = {id, conversation, device, session, cookie: `${MERCHANT_SESSION_COOKIE}=${session.token}`};
    actor.review = await seedReview(actor, question, `Synthetic corrected answer for ${id}`); actors.push(actor);
  }
  const [a, b] = actors, existingId = `saved-original-${randomUUID()}`;
  await admin.query("INSERT INTO saved_answers(id,merchant_id,category,question_pattern,normalized_question,answer_text,language,source,active,version) VALUES($1,$2,'custom',$3,$4,'Synthetic old own answer','en','merchant_approved',true,1)", [existingId, a.id, question, normalized]);
  const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/api', router);
  server = await new Promise((ok, no) => {const s = app.listen(0, '127.0.0.1', () => ok(s)); s.once('error', no);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function req(actor, review = actor.review, decision = 'approve', conversation = actor.conversation) {
    const response = await fetch(`${origin}/api/conversations/${conversation}/messages/${review.manual}/correction-review`, {method: 'POST', headers: {Cookie: actor.cookie, 'X-Fawri-Device-Id': actor.device, 'Content-Type': 'application/json'}, body: JSON.stringify({decision})});
    return {status: response.status, body: await response.json(), cache: response.headers.get('cache-control')};
  }
  async function snapshot(ids = merchants) {
    const state = {};
    for (const table of ['conversations', 'messages', 'saved_answers', 'learned_answers', 'knowledge_embeddings', 'knowledge_audit_events']) state[table] = (await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`, [ids])).rows;
    return state;
  }
  const saved = async (actor, key = normalized) => (await admin.query('SELECT * FROM saved_answers WHERE merchant_id=$1 AND normalized_question=$2', [actor.id, key])).rows;
  function assertApproved(result, actor, id, mode) {
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.cache, 'no-store');
    assert.deepEqual(result.body.result, {status: 'approved', messageId: actor.review.manual, knowledgeId: id, applyMode: mode});
    const review = result.body.conversation.messages.find(m => m.id === actor.review.manual).metadata.correction_review;
    assert.equal(review.status, 'approved'); assert.equal(review.knowledge_id, id); assert.equal(review.apply_mode, mode); assert.ok(review.reviewed_at);
  }
  await t.test('foreign real review and mixed conversation IDs cannot approve or create knowledge', async () => {
    const before = await snapshot();
    for (const actor of actors) {
      const foreign = actor === a ? b : a;
      for (const conversation of [foreign.conversation, actor.conversation]) {
        const r = await req(actor, foreign.review, 'approve', conversation);
        assert.equal(r.status, 404); assert.equal(r.body.code, 'CORRECTION_REVIEW_NOT_FOUND');
      }
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('own approval creates isolated knowledge despite identical peer normalized question', async () => {
    const peer = await snapshot([a.id]); const r = await req(b), rows = await saved(b);
    assert.equal(rows.length, 1); assert.equal(rows[0].answer_text, b.review.answer); assert.equal(rows[0].version, 1); assert.equal(rows[0].source, 'merchant_approved');
    b.knowledgeId = rows[0].id; assert.notEqual(b.knowledgeId, existingId); assertApproved(r, b, b.knowledgeId, 'created');
    assert.deepEqual(await snapshot([a.id]), peer);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM knowledge_embeddings WHERE merchant_id=ANY($1::text[])', [merchants])).rows[0].n, 0);
  });
  await t.test('own approval updates only own existing answer and advances version once', async () => {
    const peer = await snapshot([b.id]); const r = await req(a), rows = await saved(a);
    assert.equal(rows.length, 1); assert.equal(rows[0].id, existingId); assert.equal(rows[0].answer_text, a.review.answer); assert.equal(rows[0].version, 2);
    a.knowledgeId = existingId; assertApproved(r, a, existingId, 'updated'); assert.deepEqual(await snapshot([b.id]), peer);
  });
  await t.test('approved exact replay and opposite decision cannot duplicate knowledge audit or versions', async () => {
    const before = await snapshot();
    for (const actor of actors) {
      const r = await req(actor); assert.equal(r.status, 200); assert.equal(r.body.result.knowledgeId, actor.knowledgeId); assert.equal(r.body.result.status, 'approved');
      const conflict = await req(actor, actor.review, 'dismiss'); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'CORRECTION_REVIEW_CONFLICT');
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('review-write fault preserves pending state and retry converges without duplicate saved answer', async () => {
    const recoveryQuestion = 'How should I care for a wool scarf?', review = await seedReview(a, recoveryQuestion, 'Synthetic scarf care advice');
    const peer = await snapshot([b.id]);
    // Owned database only: reject the metadata transaction AFTER the real
    // knowledge transaction commits. No application function is mocked.
    await admin.query(`CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${review.manual}' AND NEW.metadata->'correction_review'->>'status' = 'approved' THEN RAISE EXCEPTION 'synthetic approval metadata fault'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION public.${trigger}()`);
    try {
      const failed = await req(a, review); assert.equal(failed.status, 500); assert.equal(failed.body.code, 'CONVERSATION_OPERATION_FAILED');
      assert.equal((await admin.query("SELECT metadata->'correction_review'->>'status' AS status FROM messages WHERE id=$1", [review.manual])).rows[0].status, 'pending');
      const rows = await saved(a, normalizeKnowledgeText(recoveryQuestion)); assert.equal(rows.length, 1); assert.equal(rows[0].version, 1); assert.equal(rows[0].answer_text, review.answer);
    } finally {await admin.query(`DROP TRIGGER IF EXISTS ${trigger} ON messages`); await admin.query(`DROP FUNCTION IF EXISTS public.${trigger}()`);}
    const recovered = await req(a, review); assert.equal(recovered.status, 200); assert.equal(recovered.body.result.status, 'approved'); assert.equal(recovered.body.result.applyMode, 'unchanged');
    const rows = await saved(a, normalizeKnowledgeText(recoveryQuestion)); assert.equal(rows.length, 1); assert.equal(rows[0].version, 1); assert.equal(rows[0].id, recovered.body.result.knowledgeId);
    const after = await snapshot(); assert.equal((await req(a, review)).status, 200); assert.deepEqual(await snapshot(), after); assert.deepEqual(await snapshot([b.id]), peer);
  });
  await t.test('revoked session cannot approve existing review while valid peer replay remains available', async () => {
    assert.equal(await auth.revokeSession(a.session.token, 'merchant', 'logout'), true);
    const before = await snapshot(); assert.equal((await req(a)).status, 401); assert.deepEqual(await snapshot(), before); assert.equal((await req(b)).status, 200); assert.deepEqual(await snapshot(), before);
  });
  console.log('P0_CORRECTION_APPROVAL_HTTP ' + JSON.stringify({syntheticMerchants: 2, restrictedSqlSessions: true, sameNormalizedQuestion: true, foreignDenials: 4, ownCreateAndUpdate: true, exactReplayNoKnowledgeMutation: true, reviewWriteFaultRecovered: true, atomicSingleTransactionClaimed: false, embeddingsDisabled: true, providerExecuted: false, fullRoleMatrix: false, hostedAccepted: false}));
});
