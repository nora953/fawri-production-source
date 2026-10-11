import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env, {
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required',
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: 'required',
  FAWRI_AUTH_SECURITY_SECRET: 'synthetic-sensitive-http-session-secret-at-least-32-characters',
  FAWRI_PASSWORD_SALT: 'synthetic-sensitive-http-password-salt',
  FAWRI_ALLOWED_ORIGINS: 'https://merchant.example.invalid',
});
const { pool } = await import('@workspace/db');

test('restricted broad-grant runtime preserves merchant HTTP session ownership', async t => {
  const role = 'fawri_audit_sensitive_http';
  const ids = [];
  let admin, server, roleCreated = false;
  const originalOptions = pool.options.options;
  t.after(async () => cleanupResources([
    ['HTTP server', () => server ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : undefined],
    ['fixture identities', () => admin?.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [ids])],
    ['fixture role grants', () => roleCreated ? admin.query(`DROP OWNED BY ${role}`) : undefined],
    ['fixture role', () => roleCreated ? admin.query(`DROP ROLE ${role}`) : undefined],
    ['owner client', () => { pool.options.options = originalOptions; admin?.release(); }],
    ['pool', () => pool.end()],
  ]));
  // Hold the only owner connection out of the pool. Every application connection
  // is newly established with the synthetic restricted role as its startup role.
  admin = await pool.connect();
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  roleCreated = true;
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  for (let i = 0; i < 2; i++) {
    const id = `sensitive-http-${randomUUID()}`;
    ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+1995${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
  }
  pool.options.options = `-c role=${role}`;
  const identity = (await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_public_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
  assert.equal(identity.role, role);
  assert.equal(identity.rolsuper, false);
  assert.equal(identity.rolbypassrls, false);
  assert.equal(identity.owns_public_table, false);
  const grants = (await pool.query("SELECT relname,relrowsecurity,(has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND has_table_privilege(current_user,c.oid,'UPDATE') AND has_table_privilege(current_user,c.oid,'DELETE')) AS granted FROM pg_class c WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname", [['accounts','account_sessions','merchants','merchant_cashier_staff','cashier_station_credentials']])).rows;
  assert.equal(grants.length, 5);
  assert.ok(grants.every(row => row.granted));
  assert.equal(grants.find(row => row.relname === 'account_sessions').relrowsecurity, false);
  console.log('AUDIT_SENSITIVE_HTTP_ROLE_PROOF ' + JSON.stringify({ ...identity, modeledGrants: grants }));
  const [{ default: express }, { default: cookieParser }, { default: router }, { enforceAuthOrigin }, { authPostgresSessionAuthority: authority }] = await Promise.all([
    import('express'), import('cookie-parser'), import('../src/routes/auth-session-routes.ts'), import('../src/middleware/authSession.ts'), import('../src/services/authPostgresSessionAuthority.ts'),
  ]);
  const app = express();
  app.use(cookieParser()); app.use(express.json()); app.use('/api/auth', enforceAuthOrigin, router);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const a1 = await authority.issueSession({ accountId: ids[0], accountKind: 'merchant', tenantId: ids[0], deviceId: 'synthetic-a1', deviceLabel: 'Synthetic A1' });
  const a2 = await authority.issueSession({ accountId: ids[0], accountKind: 'merchant', tenantId: ids[0], deviceId: 'synthetic-a2', deviceLabel: 'Synthetic A2' });
  const b1 = await authority.issueSession({ accountId: ids[1], accountKind: 'merchant', tenantId: ids[1], deviceId: 'synthetic-b1', deviceLabel: 'Synthetic B1' });
  const devices = new Map([[a1.session.id, 'synthetic-a1'], [a2.session.id, 'synthetic-a2'], [b1.session.id, 'synthetic-b1']]);
  async function request(path, session, init = {}) {
    const response = await fetch(base + path, { ...init, headers: { ...(session ? { Cookie: `fawri_merchant_session_v2=${session.token}`, 'X-Fawri-Device-Id': devices.get(session.session.id) } : {}), ...init.headers } });
    return { response, body: await response.json() };
  }
  await t.test('missing, tampered and wrong-device session cookies are rejected', async () => {
    assert.equal((await request('/api/auth/sessions')).response.status, 401);
    const tampered = { ...a1, token: a1.token.slice(0, -1) + (a1.token.at(-1) === 'A' ? 'B' : 'A') };
    assert.equal((await request('/api/auth/sessions', tampered)).response.status, 401);
    assert.equal((await request('/api/auth/sessions', a1, { headers: { 'X-Fawri-Device-Id': 'synthetic-wrong-device' } })).response.status, 401);
  });
  await t.test('lists only own sessions with no raw token or token hash', async () => {
    for (const [session, id, expectedCount] of [[a1, ids[0], 2], [b1, ids[1], 1]]) {
      const result = await request('/api/auth/sessions', session);
      assert.equal(result.response.status, 200);
      assert.match(result.response.headers.get('cache-control'), /no-store/);
      assert.equal(result.body.sessions.length, expectedCount);
      assert.ok(result.body.sessions.every(row => row.account_id === id && row.tenant_id === id));
      const serialized = JSON.stringify(result.body);
      assert.equal(serialized.includes('token_hash'), false);
      for (const issued of [a1, a2, b1]) assert.equal(serialized.includes(issued.token), false);
    }
  });
  await t.test('cross-merchant revoke denies while own selected revoke succeeds', async () => {
    const cross = await request(`/api/auth/sessions/${b1.session.id}`, a1, { method: 'DELETE' });
    assert.equal(cross.response.status, 404);
    assert.equal(cross.body.ok, false);
    assert.equal((await request('/api/auth/sessions', b1)).response.status, 200);
    assert.equal((await request(`/api/auth/sessions/${a2.session.id}`, a1, { method: 'DELETE' })).response.status, 200);
    assert.equal((await request('/api/auth/sessions', a2)).response.status, 401);
    assert.equal((await request('/api/auth/sessions', a1)).response.status, 200);
  });
  await t.test('origin denial prevents mutation and own logout-all leaves other merchant active', async () => {
    const denied = await request('/api/auth/logout-all', a1, { method: 'POST', headers: { Origin: 'https://foreign.example.invalid' } });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.body.code, 'AUTH_ORIGIN_FORBIDDEN');
    assert.equal((await request('/api/auth/sessions', a1)).response.status, 200);
    const logout = await request('/api/auth/logout-all', a1, { method: 'POST', headers: { Origin: 'https://merchant.example.invalid' } });
    assert.equal(logout.response.status, 200);
    assert.equal((await request('/api/auth/sessions', a1)).response.status, 401);
    assert.equal((await request('/api/auth/sessions', b1)).response.status, 200);
    const state = (await admin.query('SELECT account_id,status FROM account_sessions WHERE account_id=ANY($1::text[])', [ids])).rows;
    assert.ok(state.filter(row => row.account_id === ids[0]).every(row => row.status === 'revoked'));
    assert.ok(state.filter(row => row.account_id === ids[1]).every(row => row.status === 'active'));
  });
});
