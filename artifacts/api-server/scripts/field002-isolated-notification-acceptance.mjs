import assert from 'node:assert/strict';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { selectCloneProfile, parseCloneAdminUrl,
  compileRehearsedGrants, operatorRoleName, compileOperatorGrants,
  restrictedUrl, snapshotObjectStatement } from '../../../scripts/lib/field002-isolated-acceptance-plan.mjs';

// Explicit hosted harness. Never imports or weakens assertDisposablePostgres.
// It mounts the actual notification router and actual session middleware only;
// it does not boot workers, providers, production startup, or migrations.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const mode = process.argv[2];
if (mode === '--help') {
  console.log('Run with tsx: --preflight (SELECT only) or --execute (temporary roles/fixtures).');
  console.log('Required: FAWRI_FIELD002_CLONE_ADMIN_URL and FAWRI_FIELD002_EXPECTED_SOURCE.');
  console.log('Only explicitly reviewed, exact-name FIELD002 clone profiles are accepted. Credentials are never printed.');
} else {
  try { await run(); }
  catch (error) { console.error('FIELD002_RUNNER_REJECTED', safeCode(error)); process.exitCode = 1; }
}

function safeCode(error) {
  if (/^[A-Z0-9_]{3,100}$/.test(error?.code || '')) return error.code;
  if (/^FIELD002_[A-Z0-9_]{3,100}$/.test(error?.message || '')) return error.message;
  return 'CHECK_FAILED'; // No assertion values, SQL, URLs, passwords or driver messages.
}
async function run() {
  if (!['--preflight', '--execute'].includes(mode)) throw Error('FIELD002_EXPLICIT_MODE_REQUIRED');
  const profile = selectCloneProfile(process.env.FAWRI_FIELD002_CLONE_PROFILE);
  const config = parseCloneAdminUrl(process.env.FAWRI_FIELD002_CLONE_ADMIN_URL, profile);
  // Deliberate second authorization: a URL and --execute are insufficient
  // to create disposable roles or merchants on any hosted database.
  if (mode === '--execute' &&
      process.env.FAWRI_FIELD002_ALLOWED_EXECUTION_BRANCH !== profile.branch) {
    throw Error('FIELD002_HOSTED_WRITE_NOT_AUTHORIZED');
  }
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(process.env.FAWRI_FIELD002_EXPECTED_SOURCE || '') ||
      source !== process.env.FAWRI_FIELD002_EXPECTED_SOURCE) throw Error('FIELD002_SOURCE_MISMATCH');
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: root });
  const runId = randomBytes(12).toString('hex');
  const rehearsal = readFileSync(join(root, 'docs/final-audit/evidence/sql/P0-FIELD002-ISOLATED-ROLE-GRANT-REHEARSAL-20261104.sql'), 'utf8');
  const plan = compileRehearsedGrants(rehearsal, runId);
  const [tenantRole, authRole] = plan.names;
  const operatorRole = operatorRoleName(runId);
  const operatorPlan = compileOperatorGrants(operatorRole);
  const allRoles = [...plan.names, operatorRole];
  const merchants = [`field002-a-${runId}`, `field002-b-${runId}`];
  const noticeIds = merchants.map(id => `${id}-notice`);
  const work = mkdtempSync(join(tmpdir(), 'fawri-field002-'));
  const reportPath = join(work, 'result.json');
  const report = { source, runId, branch: profile.branch, host: profile.host, mode,
    roles: allRoles, fixtureMerchants: merchants, status: 'PREFLIGHT', tests: [],
    cleanup: 'NOT_NEEDED', field002Closed: false, release: 'NO-GO' };
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  save();
  console.log('FIELD002_REPORT_FILE', reportPath);
  for (const key of Object.keys(process.env)) if (key.startsWith('PG')) delete process.env[key];
  delete process.env.FAWRI_FIELD002_CLONE_ADMIN_URL;
  const { Client } = require('pg');
  const admin = new Client({ ...config, application_name: `field002-setup-${runId}` });
  let connected = false, mutated = false, server, runtimePool, closeAuth, baseline;
  let fixturesAttempted = false, fixtureOids = [];
  const savedConsoleError = console.error;
  const abort = new AbortController();
  const onSignal = () => abort.abort();
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const deadline = setTimeout(onSignal, 10 * 60 * 1000);
  const ensureRunning = () => { if (abort.signal.aborted) throw Error('FIELD002_INTERRUPTED'); };
  const markStage = name => { report.stage = name; save(); console.log('FIELD002_STAGE', name); };
  async function check(name, work) {
    ensureRunning(); report.stage = name; save();
    try { await work(); report.tests.push({ name, result: 'PASS' }); }
    catch (error) { report.tests.push({ name, result: 'FAIL', code: safeCode(error) }); throw error; }
    save(); console.log('FIELD002_CHECK_PASS', name);
  }
  async function transaction(work) {
    await admin.query('BEGIN');
    try { const result = await work(); await admin.query('COMMIT'); return result; }
    catch (error) { await admin.query('ROLLBACK').catch(() => {}); throw error; }
  }
  async function noOtherClients(allowRoles = []) {
    const r = await admin.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'
      AND NOT(usename::text=ANY($1::text[]))
      -- Ignore only parked autocommit clients with no transaction snapshot.
      -- Active queries, idle-in-transaction, aborted transactions, and null
      -- state still reject the clone rehearsal before any fixture mutation.
      AND (state IS DISTINCT FROM 'idle' OR backend_xid IS NOT NULL OR backend_xmin IS NOT NULL)`, [allowRoles]);
    assert.equal(r.rows[0].count, 0, 'unrelated client present');
  }
  async function snapshot() {
    markStage('preflight_snapshot_catalog');
    const objects = (await admin.query(`SELECT n.nspname,c.relname,c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','fawri_security','drizzle') AND c.relkind IN ('r','p','S')
      ORDER BY n.nspname,c.relname`)).rows;
    assert.ok(objects.length > 8 && objects.length < 300);
    // Values stay in PostgreSQL; only row counts and deterministic digests leave it.
    const statements = objects.map((o, i) => snapshotObjectStatement(o, i));
    markStage('preflight_snapshot_data');
    const data = (await admin.query(statements.join(' UNION ALL ') + ' ORDER BY ordinal')).rows;
    // Expand defaults: GRANT then REVOKE can turn NULL into an equivalent ACL.
    // Compare semantic ACLs, not their nullable on-disk representation.
    markStage('preflight_snapshot_security');
    const security = (await admin.query(`WITH objects AS (
      SELECT 'relation:'||c.oid AS id,coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner)) AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','fawri_security','drizzle')
      UNION ALL SELECT 'column:'||a.attrelid||':'||a.attnum,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','fawri_security','drizzle') AND a.attacl IS NOT NULL
      UNION ALL SELECT 'function:'||p.oid,coalesce(p.proacl,acldefault('f',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','fawri_security')
      UNION ALL SELECT 'schema:'||oid,coalesce(nspacl,acldefault('n',nspowner)) FROM pg_namespace WHERE nspname IN ('public','fawri_security','drizzle')
      UNION ALL SELECT 'database:'||oid,coalesce(datacl,acldefault('d',datdba)) FROM pg_database WHERE datname=current_database()
    ) SELECT
      (SELECT md5(coalesce(string_agg(row_to_json(r)::text,'' ORDER BY r.rolname),'')) FROM pg_roles r) AS roles,
      (SELECT md5(coalesce(string_agg(row_to_json(m)::text,'' ORDER BY m.roleid,m.member,m.grantor),'')) FROM pg_auth_members m) AS memberships,
      (SELECT md5(coalesce(string_agg(o.id||':'||a.grantor||':'||a.grantee||':'||a.privilege_type||':'||a.is_grantable,'' ORDER BY o.id,a.grantor,a.grantee,a.privilege_type,a.is_grantable),'')) FROM objects o CROSS JOIN LATERAL aclexplode(o.acl) a) AS acls,
      (SELECT md5(coalesce(string_agg(row_to_json(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN ('public','fawri_security')) AS policies,
      (SELECT md5(coalesce(string_agg(c.oid::text||':'||c.relowner||':'||c.relrowsecurity||':'||c.relforcerowsecurity,'' ORDER BY c.oid),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','fawri_security','drizzle')) AS relations,
      (SELECT md5(coalesce(string_agg(row_to_json(d)::text,'' ORDER BY d.oid),'')) FROM pg_default_acl d) AS defaults`)).rows[0];
    return { objects, data, security };
  }
  try {
    await admin.connect(); connected = true;
    await admin.query("SET timezone='UTC'");
    markStage('preflight_exclusive_lock');
    const lock = await admin.query('SELECT pg_try_advisory_lock(20261104,2002) AS locked');
    assert.equal(lock.rows[0].locked, true);
    markStage('preflight_no_other_clients');
    await noOtherClients();
    markStage('preflight_ledger_fingerprint');
    const b = (await admin.query(`SELECT current_database() AS db,session_user::text AS login,current_user::text AS active,
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS ledger,
      (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1) AS last_hash,
      (SELECT count(*)::int FROM notifications) AS notices,(SELECT count(*)::int FROM audit_events) AS audits,
      (SELECT count(*)::int FROM fawri_security.transaction_scopes) AS scopes`)).rows[0];
    assert.deepEqual(b, { db: 'neondb', login: 'neondb_owner', active: 'neondb_owner', ledger: 52, last_hash: profile.ledgerHash, notices: profile.notifications, audits: 283, scopes: 0 });
    markStage('preflight_eight_rls_tables');
    const privacy = (await admin.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relrowsecurity
      AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)`, [[
      'audit_events','manual_reply_requests','merchant_admin_notes','merchant_channel_overrides',
      'merchant_deletion_requests','notifications','order_drafts','processed_channel_events']])).rows[0];
    assert.equal(privacy.count, 8);
    markStage('preflight_no_old_fixtures');
    const residual = await admin.query(`SELECT
      (SELECT count(*)::int FROM pg_roles WHERE rolname ~ '^field002_[tao]_[0-9a-f]{24}$') AS roles,
      (SELECT count(*)::int FROM merchants) AS merchants`);
    assert.deepEqual(residual.rows[0], { roles: 0, merchants: 1 });
    markStage('preflight_full_snapshot');
    baseline = await snapshot(); report.baselineDigest = digest(baseline); report.baseline = baseline; save();
    if (mode === '--preflight') { report.status = 'PREFLIGHT_PASS'; return; }
    ensureRunning();
    // Short-lived random passwords exist only in this process; no original role is altered.
    const passwords = allRoles.map(() => randomBytes(32).toString('hex'));
    const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    report.credentialExpiry = expires; report.cleanup = 'REQUIRED'; mutated = true; save();
    await transaction(async () => {
      await noOtherClients();
      for (const [i, role] of allRoles.entries()) {
        await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${passwords[i]}' VALID UNTIL '${expires}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 4`);
      }
      for (const sql of plan.grants) await admin.query(sql);
      for (const sql of operatorPlan.grants) await admin.query(sql);
      // Each temporary operator is a real LOGIN with four trusted functions,
      // never direct protected-table access, shared authentication scope or owners.
      const opGuard = (await admin.query(`SELECT
        (r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR
         r.rolcreaterole OR r.rolcreatedb OR r.rolinherit)
         AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)) AS safe,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p')
            AND (has_table_privilege(r.oid,c.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
              OR has_any_column_privilege(r.oid,c.oid,
              'SELECT,INSERT,UPDATE,REFERENCES'))) AS tables,
        has_function_privilege(r.oid,
          'public.fawri_authentication_runtime()','EXECUTE') AS auth,
        has_function_privilege(r.oid,
          'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE') AS scope
        FROM pg_roles r WHERE r.rolname=$1`, [operatorRole])).rows[0];
      assert.deepEqual(opGuard,{safe:true,tables:0,auth:false,scope:false});
      for (const fn of operatorPlan.functions) {
        const ok = (await admin.query('SELECT has_function_privilege($1::name,$2::text,\'EXECUTE\') AS yes',
          [operatorRole,fn])).rows[0].yes;
        assert.equal(ok,true);
      }
      fixtureOids = (await admin.query('SELECT oid::text,rolname FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname', [allRoles])).rows;
    });
    report.roleOids = fixtureOids; save();
    Object.assign(process.env, { NODE_ENV: 'test', FAWRI_DATA_DIR: join(work, 'data'),
      DATABASE_URL: restrictedUrl(tenantRole, passwords[0], profile), FAWRI_AUTH_DATABASE_URL: restrictedUrl(authRole, passwords[1], profile),
      FAWRI_OPERATOR_DATABASE_URL: restrictedUrl(operatorRole, passwords[2], profile),
      FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: tenantRole,
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required', FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: 'required',
      FAWRI_AUTH_SECURITY_SECRET: randomBytes(32).toString('hex'), FAWRI_PASSWORD_SALT: randomBytes(32).toString('hex') });
    // No imported application's log may emit assertion values or driver detail.
    console.error = (...args) => savedConsoleError('FIELD002_APP_DIAGNOSTIC', safeCode(args.find(a => a instanceof Error)));
    ({ pool: runtimePool } = await import('@workspace/db'));
    const authentication = await import('../src/services/authenticationPostgresAuthority.ts');
    closeAuth = authentication.closeAuthenticationPool;
    const { assertTenantScopeSession } = await import('../src/services/tenantScopePostgresBoundary.ts');
    const { withMerchantOperationalTransaction } = await import('../src/services/operationalPostgresAuthority.ts');
    const { authPostgresSessionAuthority: auth } = await import('../src/services/authPostgresSessionAuthority.ts');
    await check('actual_separate_login_admission', async () => {
      const tenant = await runtimePool.connect();
      try {
        await assertTenantScopeSession(tenant, false);
        assert.deepEqual((await tenant.query('SELECT session_user::text AS login,current_user::text AS active')).rows[0], { login: tenantRole, active: tenantRole });
      } finally { tenant.release(); }
      await authentication.withAuthenticationTransaction(async issuer => {
        await assertTenantScopeSession(issuer, true);
        assert.deepEqual((await issuer.query('SELECT session_user::text AS login,current_user::text AS active')).rows[0], { login: authRole, active: authRole });
      });
    });

    await check('actual_third_operator_login_and_four_scoped_capabilities', async () => {
      const { createOperatorDirectoryAuthority } = await import('../src/services/operatorDirectoryPostgresAuthority.ts');
      for (const capability of ['directory','receiptRead','receiptReview','receiptExecution']) {
        const issuer = createOperatorDirectoryAuthority({ capability });
        try {
          await issuer.transaction(async client => {
            const row = (await client.query(`SELECT session_user::text AS login,
              current_user::text AS active,current_database()::text AS db,
              has_function_privilege(session_user,
                'public.fawri_authentication_runtime()','EXECUTE') AS auth_marker,
              -- The operator intentionally has NO fawri_security USAGE.
              -- Resolve the private function by its catalog OID; parsing its
              -- qualified signature under the operator LOGIN fails 42501.
              has_function_privilege(session_user,(
                SELECT p.oid FROM pg_proc p JOIN pg_namespace n
                  ON n.oid=p.pronamespace
                WHERE n.nspname='fawri_security' AND p.proname='issue_scope'
                  AND p.pronargs=4
                  AND p.proargtypes[0]='name'::regtype
                  AND p.proargtypes[1]='integer'::regtype
                  AND p.proargtypes[2]='bigint'::regtype
                  AND p.proargtypes[3]='text'::regtype
              ),'EXECUTE') AS scope_issuer,
              has_schema_privilege(session_user,'fawri_security','USAGE')
                AS private_schema_usage,
              has_table_privilege(session_user,
                'public.notifications','SELECT,INSERT,UPDATE,DELETE') AS notices_access`)).rows[0];
            assert.deepEqual(row, {
              login:operatorRole,active:operatorRole,db:'neondb',
              auth_marker:false,scope_issuer:false,
              private_schema_usage:false,notices_access:false,
            });
          });
        } finally {
          await issuer.close();
        }
      }
    });

    await transaction(async () => {
      for (const [i, id] of merchants.entries()) {
        await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'field002-synthetic','active',true)", [id, '+198' + randomInt(100000000, 999999999)]);
        await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'FIELD002 synthetic','FIELD002 synthetic','retail','approved','approved')", [id]);
        await admin.query(`INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables)
          VALUES($1,'merchant',$2,$2,'operational_customer_message','synthetic','synthetic',$3::jsonb)`,
          [noticeIds[i], id, JSON.stringify({ conversation_id: 'field002-conversation-' + i, action_url: '/conversations/field002-' + i, internal_note: 'field002-stored-only' })]);
      }
    });
    fixturesAttempted = true;
    const actors = [];
    for (const id of merchants) {
      const device = 'field002-device-' + id;
      const session = await auth.issueSession({ accountId: id, accountKind: 'merchant', tenantId: id, deviceId: device });
      actors.push({ id, device, token: session.token });
    }
    await check('sql_unscoped_denied', async () => {
      assert.equal((await runtimePool.query('SELECT id FROM notifications')).rowCount, 0);
    });
    const noticeSnapshot = async () => (await admin.query(`SELECT id,md5(to_jsonb(n)::text) AS hash FROM notifications n
      ORDER BY id`)).rows;
    await check('sql_own_allowed_foreign_read_write_denied', async () => {
      const before = await noticeSnapshot();
      for (const [i, actor] of actors.entries()) {
        await withMerchantOperationalTransaction(actor.id, async client => {
          assert.deepEqual((await client.query('SELECT id FROM notifications ORDER BY id')).rows.map(r => r.id), [noticeIds[i]]);
          await client.query('SAVEPOINT own_write');
          assert.equal((await client.query('UPDATE notifications SET read_at=now() WHERE id=$1', [noticeIds[i]])).rowCount, 1);
          await client.query('ROLLBACK TO SAVEPOINT own_write');
          assert.equal((await client.query('SELECT id FROM notifications WHERE id=$1', [noticeIds[1-i]])).rowCount, 0);
          assert.equal((await client.query('UPDATE notifications SET read_at=now() WHERE id=$1', [noticeIds[1-i]])).rowCount, 0);
          await client.query('SAVEPOINT foreign_insert');
          await assert.rejects(() => client.query(`INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables)
            VALUES($1,'merchant',$2,$2,'synthetic','synthetic','synthetic','{}')`, [actor.id + '-foreign-insert', merchants[1-i]]), { code: '42501' });
          await client.query('ROLLBACK TO SAVEPOINT foreign_insert');
        });
      }
      assert.deepEqual(await noticeSnapshot(), before);
    });
    const { default: express } = await import('express');
    const { default: cookieParser } = await import('cookie-parser');
    const { default: router } = await import('../src/routes/merchant-notifications-pg.ts');
    const { MERCHANT_SESSION_COOKIE } = await import('../src/middleware/authSession.ts');
    const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/api/auth', router);
    app.use((_error, _req, res, _next) => res.status(500).json({ code: 'FIELD002_UNEXPECTED_MIDDLEWARE_ERROR' }));
    server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const request = async (path, actor, method = 'GET', hints = {}) => {
      ensureRunning();
      const response = await fetch(origin + '/api/auth' + path, { method,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
        headers: { ...(actor ? { Cookie: `${MERCHANT_SESSION_COOKIE}=${actor.token}`, 'X-Fawri-Device-Id': actor.device } : {}), ...hints } });
      return { status: response.status, body: await response.json() };
    };
    await check('http_unauthenticated_denied', async () => {
      assert.equal((await request('/notifications')).status, 401);
      assert.equal((await request('/notifications/' + noticeIds[0] + '/read', null, 'PATCH')).status, 401);
    });
    await check('http_both_owners_and_foreign_hint_denial', async () => {
      const before = await noticeSnapshot();
      for (const [i, actor] of actors.entries()) {
        const list = await request('/notifications?merchant_id=' + merchants[1-i], actor, 'GET', { 'X-Fawri-Merchant-Id': merchants[1-i] });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.notifications.map(n => n.id), [noticeIds[i]]);
        assert.ok(!JSON.stringify(list.body).includes('field002-stored-only'));
        const foreign = await request('/notifications/' + noticeIds[1-i] + '/read', actor, 'PATCH');
        assert.equal(foreign.status, 404); assert.equal(foreign.body.code, 'NOTIFICATION_NOT_FOUND');
      }
      assert.deepEqual(await noticeSnapshot(), before);
    });
    await check('http_own_write_replay_peer_unchanged', async () => {
      for (const [i, actor] of actors.entries()) {
        const peer = (await noticeSnapshot()).find(n => n.id === noticeIds[1-i]);
        const first = await request('/notifications/' + noticeIds[i] + '/read', actor, 'PATCH');
        const replay = await request('/notifications/' + noticeIds[i] + '/read', actor, 'PATCH');
        assert.equal(first.status, 200); assert.equal(replay.status, 200); assert.ok(first.body.notification.read_at);
        assert.equal(first.body.notification.read_at, replay.body.notification.read_at);
        assert.deepEqual((await noticeSnapshot()).find(n => n.id === noticeIds[1-i]), peer);
      }
    });
    await check('revoked_session_sql_auth_and_http_denied_peer_allowed', async () => {
      const before = await noticeSnapshot();
      assert.equal(await auth.revokeSession(actors[0].token, 'merchant', 'logout'), true);
      assert.equal(await auth.validateSession({ token: actors[0].token, expectedKind: 'merchant', deviceId: actors[0].device }), null);
      // SQL-backed canonical validation rejects before a new scope is issued.
      // This does not claim instant revocation of an already-issued scope.
      const scopes = (await admin.query('SELECT count(*)::int AS count FROM fawri_security.transaction_scopes WHERE runtime_login=$1', [tenantRole])).rows[0].count;
      assert.equal((await request('/notifications', actors[0])).status, 401);
      assert.equal((await request('/notifications/' + noticeIds[0] + '/read', actors[0], 'PATCH')).status, 401);
      assert.equal((await admin.query('SELECT count(*)::int AS count FROM fawri_security.transaction_scopes WHERE runtime_login=$1', [tenantRole])).rows[0].count, scopes);
      assert.equal((await request('/notifications', actors[1])).status, 200);
      assert.deepEqual(await noticeSnapshot(), before);
    });
    report.status = 'TESTS_PASSED_CLEANUP_PENDING';
  } catch (error) {
    report.status = 'FAILED'; report.error = safeCode(error); process.exitCode = 1;
  } finally {
    clearTimeout(deadline); process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    const cleanupErrors = [];
    const cleanupStep = async (name, work) => { try { await work(); } catch (e) { cleanupErrors.push({ name, code: safeCode(e) }); } };
    await cleanupStep('http_close', async () => { if (server) { server.closeAllConnections(); await new Promise((ok, no) => server.close(e => e ? no(e) : ok())); } });
    await cleanupStep('auth_pool_close', async () => { await closeAuth?.(); });
    await cleanupStep('tenant_pool_close', async () => { await runtimePool?.end(); });
    if (connected && mutated && cleanupErrors.length === 0) {
      await cleanupStep('owned_fixture_and_role_cleanup', async () => {
        await noOtherClients();
        await transaction(async () => {
          const roles = (await admin.query('SELECT oid::text,rolname FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname', [allRoles])).rows;
          if (roles.length) assert.deepEqual(roles, fixtureOids);
          // Names and recorded OIDs are run-specific. Never DROP OWNED/CASCADE.
          if (fixturesAttempted) {
            await admin.query('DELETE FROM fawri_security.transaction_scopes WHERE runtime_login=ANY($1::name[])', [plan.names]);
            await admin.query('DELETE FROM notifications WHERE id=ANY($1::text[]) AND merchant_id=ANY($2::text[])', [noticeIds, merchants]);
            await admin.query('DELETE FROM account_sessions WHERE account_id=ANY($1::text[])', [merchants]);
            await admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])', [merchants]);
            await admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [merchants]);
          }
          if (roles.length) {
            for (const sql of operatorPlan.revokes) await admin.query(sql);
            for (const sql of plan.revokes) await admin.query(sql);
            for (const role of allRoles) await admin.query('DROP ROLE ' + role);
          }
        });
        assert.equal((await admin.query('SELECT count(*)::int AS count FROM pg_roles WHERE rolname=ANY($1::text[])', [allRoles])).rows[0].count, 0);
        const after = await snapshot(); report.afterDigest = digest(after);
        assert.deepEqual(after, baseline, 'data/schema/security baseline must be restored');
      });
    } else if (mutated) cleanupErrors.push({ name: 'cleanup_prerequisite', code: 'MANUAL_RECOVERY_REQUIRED' });
    if (mutated) report.cleanup = cleanupErrors.length ? 'FAILED_RECOVERY_REQUIRED' : 'PASS';
    if (cleanupErrors.length) { report.cleanupErrors = cleanupErrors; report.status = 'FAILED'; process.exitCode = 1; }
    if (report.status === 'TESTS_PASSED_CLEANUP_PENDING' && report.cleanup === 'PASS') report.status = 'BOUNDED_SQL_HTTP_PASS';
    await admin.end().catch(() => {});
    console.error = savedConsoleError;
    save();
    const { baseline: _baseline, ...summary } = report;
    console.log('FIELD002_ACCEPTANCE_RESULT ' + JSON.stringify(summary));
  }
}
