import assert from 'node:assert/strict';
import {randomInt, randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env, {FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required', FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: 'required', FAWRI_AUTH_SECURITY_SECRET: 'synthetic-owner-import-secret-over-32-characters', FAWRI_PASSWORD_SALT: 'synthetic-owner-import-salt-over-32-characters', FAWRI_ALLOWED_ORIGINS: 'https://import.example.invalid'});

test('owner legacy import preserves private records and rolls back partial batch failure', {timeout: 120000}, async t => {
  const runtime = await createDisposableKnowledgeRuntime(), admin = runtime.admin;
  const ids = [], merchants = [], actors = [], trigger = `import_fail_${randomUUID().replaceAll('-', '')}`;
  const tables = ['audit_events', 'merchant_admin_notes', 'merchant_channel_overrides'];
  let server;
  t.after(() => cleanupResources([
    ['trigger', () => admin.query(`DROP TRIGGER IF EXISTS ${trigger} ON merchant_admin_notes`)],
    ['function', () => admin.query(`DROP FUNCTION IF EXISTS public.${trigger}()`)],
    ['HTTP', async () => {if (server) {server.closeAllConnections(); await new Promise((ok, no) => server.close(e => e ? no(e) : ok()));}}],
    ...tables.map(table => [table, () => admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`, [merchants])]),
    ['directory audits', () => admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])', [ids])],
    ['devices', () => admin.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])', [ids])],
    ['accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [ids])],
    ['runtime', () => runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority: auth} = await import('../src/services/authPostgresSessionAuthority.ts');
  const security = await import('../src/services/postgresAdminSecurityAuthority.ts');
  const {ADMIN_SESSION_COOKIE, MERCHANT_SESSION_COOKIE, enforceAuthOrigin} = await import('../src/middleware/authSession.ts');
  const {default: router} = await import('../src/routes/auth-merchant-management-postgres-routes.ts');
  const {default: express} = await import('express'), {default: cookieParser} = await import('cookie-parser');
  async function actor(kind, role, permissions = []) {
    const id = `owner-import-${randomUUID()}`; ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)", [id, kind, `+198${randomInt(100000000,999999999)}`]);
    if (kind === 'admin') {
      await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)", [id, role]);
      for (const permission of permissions) await admin.query('INSERT INTO admin_permissions(admin_id,permission) VALUES($1,$2)', [id, permission]);
    } else {
      merchants.push(id); await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
    }
    const result = {id, kind, role, permissions, device: `device-${randomUUID()}`}; actors.push(result); return result;
  }
  const owner = await actor('admin', 'owner_admin'), assistant = await actor('admin', 'assistant_admin', ['manage_merchant_status', 'manage_channels', 'view_logs', 'manage_subscriptions']);
  const a = await actor('merchant'), b = await actor('merchant');
  for (const actor of actors) {
    if (actor.kind === 'admin') {const device = await security.registerAdminDeviceAuthoritative({accountId: actor.id, accountKind: 'admin', deviceId: actor.device, deviceLabel: 'Synthetic'}); await security.setAdminDeviceTrustAuthoritative({deviceRecordId: device.id, trusted: true, actorAccountId: owner.id});}
    actor.session = await auth.issueSession({accountId: actor.id, accountKind: actor.kind, tenantId: actor.kind === 'admin' ? 'fawri-admin' : actor.id, adminRole: actor.role, permissions: actor.permissions, deviceId: actor.device});
    actor.cookie = `${actor.kind === 'admin' ? ADMIN_SESSION_COOKIE : MERCHANT_SESSION_COOKIE}=${actor.session.token}`;
  }
  const peerLog = `peer-log-${randomUUID()}`, ownLog = `own-log-${randomUUID()}`;
  await admin.query("INSERT INTO merchant_admin_notes(merchant_id,note,updated_by_admin_id) VALUES($1,'peer-private-note',$2)", [b.id, owner.id]);
  await admin.query("INSERT INTO merchant_channel_overrides(merchant_id,platform,status,updated_by_admin_id) VALUES($1,'messenger','connected',$2)", [b.id, owner.id]);
  await admin.query("INSERT INTO audit_events(id,actor_kind,actor_account_id,merchant_id,action_type,details) VALUES($1,'account',$2,$3,'synthetic','peer-private-log')", [peerLog, owner.id, b.id]);
  const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/api/auth', enforceAuthOrigin, router);
  server = await new Promise((ok, no) => {const s = app.listen(0, '127.0.0.1', () => ok(s)); s.once('error', no);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function req(actor, body, headers = {}, path = '/admin/local-data-migration', method = 'POST') {
    const response = await fetch(origin + '/api/auth' + path, {method, headers: {'Content-Type': 'application/json', ...(actor ? {Cookie: actor.cookie, 'X-Fawri-Device-Id': actor.device} : {}), ...headers}, ...(body ? {body: JSON.stringify(body)} : {})});
    return {status: response.status, body: await response.json()};
  }
  async function snapshot(tenantIds = merchants) {
    const result = {}; for (const table of tables) result[table] = (await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`, [tenantIds])).rows; return result;
  }
  const log = (id, merchant, details) => ({id, merchant_id: merchant.id, action_type: 'synthetic_import', details, created_at: '2026-10-01T00:00:00.000Z'});
  const payload = {logs: [log(ownLog, a, 'imported-own-log'), log(peerLog, b, 'must-not-overwrite-peer-log')], notes: {[a.id]: 'imported-own-note', [b.id]: 'must-not-overwrite-peer-note'}, channel_overrides: {[a.id]: {messenger: 'connected'}, [b.id]: {messenger: 'disconnected'}}};
  await t.test('anonymous merchant assistant wrong-device and wrong-origin imports deny without private writes', async () => {
    const before = await snapshot();
    for (const [actor, status, headers] of [[undefined, 401, {}], [a, 401, {}], [assistant, 403, {}], [owner, 401, {'X-Fawri-Device-Id': 'wrong'}], [owner, 403, {Origin: 'https://forbidden.example.invalid'}]]) assert.equal((await req(actor, payload, headers)).status, status);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('owner import creates intended rows and preserves peer conflicts byte for byte', async () => {
    const peer = await snapshot([b.id]), r = await req(owner, payload);
    assert.equal(r.status, 200, JSON.stringify(r)); assert.deepEqual(r.body.imported, {logs: 1, notes: 1, channels: 1}); assert.deepEqual(await snapshot([b.id]), peer);
    assert.equal((await admin.query('SELECT note,updated_by_admin_id FROM merchant_admin_notes WHERE merchant_id=$1', [a.id])).rows[0].note, 'imported-own-note');
    assert.equal((await admin.query('SELECT actor_account_id FROM audit_events WHERE id=$1', [ownLog])).rows[0].actor_account_id, owner.id);
    for (const table of tables) assert.equal((await runtime.runtimePool.query(`SELECT * FROM ${table} WHERE merchant_id=ANY($1::text[])`, [merchants])).rowCount, 0);
  });
  await t.test('exact and altered conflict replays cannot duplicate or overwrite existing private data', async () => {
    const before = await snapshot();
    for (const body of [payload, {...payload, notes: {[a.id]: 'must-not-overwrite-own-note'}, logs: [log(ownLog, a, 'must-not-overwrite-own-log')]}]) {
      const r = await req(owner, body); assert.equal(r.status, 200); assert.deepEqual(r.body.imported, {logs: 0, notes: 0, channels: 0}); assert.deepEqual(await snapshot(), before);
    }
  });
  await t.test('owned note-write fault rolls back earlier audit insert and retry commits once', async () => {
    const id = `fault-log-${randomUUID()}`, body = {logs: [log(id, a, 'synthetic-atomic-log')], notes: {[a.id]: 'synthetic-fault-note'}};
    await admin.query(`CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id='${a.id}' AND NEW.note='synthetic-fault-note' THEN RAISE EXCEPTION 'synthetic import note fault'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON merchant_admin_notes FOR EACH ROW EXECUTE FUNCTION public.${trigger}()`);
    const before = await snapshot();
    try {const r = await req(owner, body); assert.equal(r.status, 500); assert.deepEqual(await snapshot(), before); assert.equal((await admin.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount, 0);}
    finally {await admin.query(`DROP TRIGGER IF EXISTS ${trigger} ON merchant_admin_notes`); await admin.query(`DROP FUNCTION IF EXISTS public.${trigger}()`);}
    const r = await req(owner, body); assert.equal(r.status, 200); assert.deepEqual(r.body.imported, {logs: 1, notes: 0, channels: 0});
    assert.equal((await admin.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount, 1);
    const after = await snapshot(); assert.deepEqual((await req(owner, body)).body.imported, {logs: 0, notes: 0, channels: 0}); assert.deepEqual(await snapshot(), after);
  });
  await t.test('revoked owner cannot import while independently authorized assistant read remains available', async () => {
    assert.equal(await auth.revokeSession(owner.session.token, 'admin', 'logout'), true);
    const before = await snapshot(); assert.equal((await req(owner, payload)).status, 401); assert.deepEqual(await snapshot(), before);
    const r = await req(assistant, undefined, {}, `/merchants/${a.id}/note`, 'GET'); assert.equal(r.status, 200); assert.equal(r.body.note, 'imported-own-note'); assert.deepEqual(await snapshot(), before);
  });
  console.log('P0_OWNER_IMPORT_HTTP ' + JSON.stringify({syntheticMerchants: 2, restrictedPrimaryLogin: true, separateAuthenticationLogin: true, ownerPositive: true, peerConflictPreserved: true, replayNoMutation: true, batchFaultRollback: true, revokedOwnerDenied: true, fullRoleMatrix: false, hostedAccepted: false}));
});
