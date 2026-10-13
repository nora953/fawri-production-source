import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

// Execute current application bodies with inert dependency adapters. No DB,
// provider network, React mount, real credentials, or production writes.
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function code(path) {
  return stripTypeScriptTypes(read(path), { mode: 'transform' })
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export default router;?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}
class ProviderError extends Error {
  constructor(code, message, status) { super(message); Object.assign(this, { code, status }); }
}
function webhook(mode = 'missing') {
  const calls = { queries: [], apply: 0, confirm: 0, discover: 0 };
  const confirmed = { paymentId: 'synthetic-payment', requestId: 'synthetic-request',
    status: 'SUCCESS', currency: 'IQD', amount: 3900, canceled: false,
    creationDate: '2026-10-13T00:00:00Z' };
  const payload = { ...confirmed };
  const pool = { query: async (sql, values) => {
    calls.queries.push({ sql, values });
    if (mode === 'sql-failure') throw Object.assign(new Error('synthetic-private-sql-message'), { code: 'P0001' });
    if (mode === 'ambiguous') return { rows: [{ id: 'one' }, { id: 'two' }] };
    return { rows: [] };
  } };
  const fn = vm.runInNewContext(`(()=>{${code('artifacts/api-server/src/services/superQiSandboxWebhook.ts')}\nreturn handleSuperQiSandboxWebhook;})()`, {
    crypto, pool, SUPERQI_SANDBOX_PROVIDER: 'superqi_sandbox', SuperQiSandboxProviderError: ProviderError,
    getSuperQiSandboxPublicState: () => ({ checkout_available: mode !== 'disabled' }),
    verifySuperQiSandboxWebhookSignature: () => mode !== 'invalid-signature',
    getSuperQiSandboxPaymentStatus: async () => { calls.confirm++; return confirmed; },
    discoverCashierBillingOrderByProviderReference: async () => { calls.discover++; return null; },
    applyVerifiedSaasBillingProviderEvent: async () => { calls.apply++; },
    applyVerifiedCashierBillingProviderEvent: async () => { calls.apply++; },
    superQiWebhookPayloadHash: () => 'synthetic-hash',
  });
  return { fn, calls, payload };
}
function route(service) {
  const posts = new Map();
  const router = { post: (path, ...handlers) => posts.set(path, handlers), get: () => {} };
  vm.runInNewContext(code('artifacts/api-server/src/routes/saas-billing.ts'), {
    Router: () => router, SuperQiSandboxProviderError: ProviderError,
    SaasBillingAuthorityError: class extends Error {},
    handleSuperQiSandboxWebhook: service, requireSecureMerchantSession: () => {},
    getAuthContext: () => null, getSaasBillingCatalog: () => ({}),
    listMerchantSaasBillingOrders: () => [], createSaasBillingCheckout: () => {}, isSaasPaidPlan: () => true,
    sendAuthError: (res, status, code, error) => res.status(status).json({ ok: false, code, error }),
  });
  return async (payload, signature = 'synthetic-signature') => {
    const result = { status: 200, headers: {}, body: null };
    const res = { setHeader: (k, v) => { result.headers[k] = v; },
      status: status => { result.status = status; return res; }, json: body => { result.body = body; } };
    await posts.get('/billing/providers/superqi/webhook')[0]({ body: payload, headers: { 'x-signature': signature } }, res);
    return result;
  };
}
test('SEQ218 observed: confirmed missing-order event is acknowledged 200/ignored without a durable write', async () => {
  const { fn, calls, payload } = webhook(); const result = await route(fn)(payload);
  assert.equal(result.status, 200); assert.equal(result.body.status, 'ignored');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(calls.confirm, 1); assert.equal(calls.discover, 1); assert.equal(calls.apply, 0);
  assert.equal(calls.queries.length, 1); assert.match(calls.queries[0].sql, /^SELECT/);
});
test('SEQ218 acceptance: confirmed orphan must be retryable or durably recorded', async () => {
  const { fn, calls, payload } = webhook(); const result = await route(fn)(payload);
  const durableWrite = calls.queries.some(q => /INSERT|UPDATE/.test(q.sql));
  assert.ok(result.status >= 500 || durableWrite, 'existing BILLING-WEBHOOK-ORPHAN-015: 200 with no durable write');
});
test('SEQ219 generic SQL exception yields sanitized 503 and no entitlement application', async () => {
  const { fn, calls, payload } = webhook('sql-failure'); const result = await route(fn)(payload);
  assert.equal(result.status, 503); assert.equal(result.body.code, 'SAAS_BILLING_UNAVAILABLE');
  assert.ok(!JSON.stringify(result.body).includes('synthetic-private-sql-message')); assert.equal(calls.apply, 0);
});
test('SEQ219 missing signature is rejected before service invocation', async () => {
  let calls = 0; const result = await route(async () => { calls++; })({}, '  ');
  assert.equal(result.status, 401); assert.equal(calls, 0);
});
test('SEQ219 invalid signature cannot reach SQL or gateway status query', async () => {
  const { fn, calls, payload } = webhook('invalid-signature'); const result = await route(fn)(payload);
  assert.equal(result.status, 401); assert.equal(result.body.code, 'SUPERQI_SANDBOX_SIGNATURE_INVALID');
  assert.equal(calls.queries.length, 0); assert.equal(calls.confirm, 0);
});
test('SEQ219 provider disabled fails closed before SQL', async () => {
  const { fn, calls, payload } = webhook('disabled'); const result = await route(fn)(payload);
  assert.equal(result.status, 503); assert.equal(calls.queries.length, 0);
});
test('SEQ219 ambiguous SaaS order mappings fail closed with 503', async () => {
  const { fn, calls, payload } = webhook('ambiguous'); const result = await route(fn)(payload);
  assert.equal(result.status, 503); assert.equal(result.body.code, 'SUPERQI_SANDBOX_ORDER_AMBIGUOUS');
  assert.equal(calls.apply, 0); assert.equal(calls.discover, 0);
});
function monitor() {
  const raw = read('artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx');
  const start = raw.indexOf('const load = useCallback(');
  const end = raw.indexOf('\n\n  useEffect(', start);
  assert.ok(start >= 0 && end > start);
  const body = stripTypeScriptTypes(raw.slice(start, end), { mode: 'transform' });
  const state = { data: null, loadError: false, loading: false, response: null };
  const load = vm.runInNewContext(`(()=>{${body}\nreturn load;})()`, {
    useCallback: fn => fn, adminId: 'synthetic-admin', getAdminAuthHeaders: () => ({}),
    fetch: async () => state.response, setData: x => { state.data = x; },
    setLoadError: x => { state.loadError = x; }, setLoading: x => { state.loading = x; },
    console: { error: () => {} },
  });
  const success = () => { state.response = { ok: true, json: async () => ({ ok: true, admin: { id: 'synthetic-admin' }, summary: { work_status: 'active' } }) }; };
  const failure = status => { state.response = { ok: false, status, json: async () => ({ ok: false, error: 'synthetic-denial' }) }; };
  return { state, load, success, failure };
}
test('SEQ220 non-silent monitor failure marks visible error; successful retry clears it', async () => {
  const m = monitor(); m.failure(503); await m.load(); assert.equal(m.state.loadError, true);
  m.success(); await m.load(); assert.equal(m.state.loadError, false); assert.equal(m.state.data.admin.id, 'synthetic-admin');
});
for (const status of [401, 403, 503]) {
  test(`SEQ220 observed: silent ${status} retains monitor data with no error`, async () => {
    const m = monitor(); m.success(); await m.load(); const old = m.state.data;
    m.failure(status); await m.load(true); assert.equal(m.state.data, old); assert.equal(m.state.loadError, false);
  });
  test(`SEQ220 acceptance: silent ${status} must invalidate or mark prior monitor data stale`, async () => {
    const m = monitor(); m.success(); await m.load(); m.failure(status); await m.load(true);
    assert.ok(m.state.data === null || m.state.loadError, 'existing WORK-MONITOR-STALE-001: prior data retained unmarked');
  });
}
function shutdownFixture() {
  const raw = read('artifacts/api-server/src/index.ts');
  const start = raw.indexOf('function shutdown(');
  const end = raw.indexOf('\n  process.once("SIGTERM"', start);
  assert.ok(start >= 0 && end > start);
  const body = stripTypeScriptTypes(raw.slice(start, end), { mode: 'transform' });
  const events = []; let closeCallback, timeoutCallback;
  const stop = name => ({ stop: () => { events.push(name); } });
  const fn = vm.runInNewContext(`(()=>{let shuttingDown=false;${body}\nreturn shutdown;})()`, {
    logger: { info: () => {}, error: () => {} }, metaWebhookWorker: stop('meta-stop'),
    merchantMediaCleanupReconciler: stop('media-stop'), earlyWarningMonitor: stop('monitor-stop'),
    runtime: { dispose: () => { events.push('runtime-dispose'); } },
    process: { exit: status => { events.push('exit-'+status); throw { syntheticExit: true }; } },
    setTimeout: (fn, ms) => { assert.equal(ms, 10000); timeoutCallback = fn; return { unref: () => {} }; },
    clearTimeout: () => { events.push('clear-timeout'); },
    server: { close: fn => { events.push('server-close'); closeCallback = fn; } },
  });
  const captureExit = fn => { try { fn(); } catch (error) { if (!error.syntheticExit) throw error; } };
  return { fn, events, close: error => captureExit(() => closeCallback(error)), timeout: () => captureExit(timeoutCallback) };
}
test('SEQ223 shutdown stops scheduling and disposes runtime once across two signals', () => {
  const s = shutdownFixture(); s.fn('SIGTERM'); s.fn('SIGINT');
  assert.deepEqual(s.events, ['meta-stop', 'media-stop', 'monitor-stop', 'runtime-dispose', 'server-close']);
  s.close(); assert.equal(s.events.at(-1), 'exit-0');
});
test('SEQ223 HTTP close error produces nonzero shutdown', () => {
  const s = shutdownFixture(); s.fn('SIGTERM'); s.close(new Error('synthetic')); assert.equal(s.events.at(-1), 'exit-1');
});
test('SEQ223 forced timeout produces nonzero shutdown', () => {
  const s = shutdownFixture(); s.fn('SIGTERM'); s.timeout(); assert.equal(s.events.at(-1), 'exit-1');
});
test('SEQ223 observed: HTTP close callback can exit without a worker completion callback', () => {
  const s = shutdownFixture(); s.fn('SIGTERM'); s.close();
  assert.equal(s.events.includes('exit-0'), true);
  // stop() has a void interface. No completion notification is consumed here.
  assert.equal(s.events.includes('worker-drained'), false);
});
