import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();

test('Meta ingress resolves connected pages under restricted RLS without leaking tenant context', { timeout: 60000 }, async t => {
  const originalUrl = process.env.DATABASE_URL;
  const originalAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const { Pool } = createRequire(import.meta.resolve('@workspace/db'))('pg');
  const admin = new Pool({ connectionString: originalUrl, connectionTimeoutMillis: 5000 });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const role = `meta_rls_${suffix}`;
  const merchants = [`meta-a-${suffix}`, `meta-b-${suffix}`];
  const pages = merchants.map(id => `page-${id}`);
  let runtimePool;
  let roleCreated = false;
  t.after(async () => cleanupResources([
    ['runtime pool', () => runtimePool?.end()],
    ['environment', async () => {
      process.env.DATABASE_URL = originalUrl;
      if (originalAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
      else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = originalAuthority;
    }],
    ['fixture accounts', () => admin.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [merchants])],
    ['role grants', async () => { if (roleCreated) await admin.query(`DROP OWNED BY ${role}`); }],
    ['role', async () => { if (roleCreated) await admin.query(`DROP ROLE ${role}`); }],
    ['admin pool', () => admin.end()],
  ]));
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  roleCreated = true;
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
  for (const [index, id] of merchants.entries()) {
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+1998${Date.now().toString().slice(-8)}${index}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,page_id) VALUES($1,$2,'messenger','connected',$3)", [`channel-${id}`, id, pages[index]]);
  }
  const policy = await admin.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.merchant_channels'::regclass");
  assert.equal(policy.rows[0].relrowsecurity, true, 'fixture must test actual committed RLS policies');
  const target = new URL(originalUrl);
  target.searchParams.set('options', `-c role=${role}`);
  process.env.DATABASE_URL = target.toString();
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
  runtimePool = (await import('@workspace/db')).pool;
  runtimePool.options.max = 1;
  const flags = (await runtimePool.query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
  assert.deepEqual(flags, { role, rolsuper: false, rolbypassrls: false });
  const authority = await import('../src/services/operationalPostgresAuthority.ts');
  const channels = await import('../src/services/postgresMetaChannelAuthority.ts');
  const middleware = await import('../src/middleware/merchantWebhookAccess.ts');
  await t.test('tenant reads expose only their page and pooled context resets', async () => {
    for (const [index, merchantId] of merchants.entries()) {
      const result = await authority.withMerchantOperationalTransaction(merchantId, client => client.query('SELECT page_id FROM merchant_channels ORDER BY page_id'));
      assert.deepEqual(result.rows, [{ page_id: pages[index] }]);
    }
    assert.equal((await runtimePool.query('SELECT count(*)::int AS count FROM merchant_channels')).rows[0].count, 0);
  });
  await t.test('resolver needs an explicit grant and ordinary table reads stay isolated', async () => {
    assert.equal((await admin.query("SELECT has_function_privilege($1,'public.fawri_resolve_meta_page_merchants(text[])','EXECUTE') AS allowed", [role])).rows[0].allowed, false);
    await assert.rejects(() => channels.listActiveMetaPageMappingsAuthoritative(pages), error => error.code === '42501');
    assert.equal((await runtimePool.query('SELECT count(*)::int AS count FROM merchant_channels')).rows[0].count, 0);
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) TO ${role}`);
  });
  await t.test('global page resolver must route both synthetic connected pages', async () => {
    const mappings = await channels.listActiveMetaPageMappingsAuthoritative(pages);
    console.log('META_RESTRICTED_MAPPING_COUNT ' + mappings.length);
    assert.deepEqual(mappings, pages.map((pageId, index) => ({ pageId, merchantId: merchants[index] })), 'FA-I-006: valid connected pages cannot disappear under the intended restricted runtime role');
  });
  await t.test('bounded routing returns requested identities only and excludes disconnected pages', async () => {
    assert.deepEqual(await channels.listActiveMetaPageMappingsAuthoritative([pages[0]]), [{pageId: pages[0], merchantId: merchants[0]}]);
    await admin.query("UPDATE merchant_channels SET status='disconnected' WHERE merchant_id=$1", [merchants[1]]);
    assert.deepEqual(await channels.listActiveMetaPageMappingsAuthoritative(pages), [{pageId: pages[0], merchantId: merchants[0]}]);
    await admin.query("UPDATE merchant_channels SET status='connected' WHERE merchant_id=$1", [merchants[1]]);
    await assert.rejects(() => runtimePool.query("SELECT * FROM public.fawri_resolve_meta_page_merchants($1::text[])", [Array.from({length:101},(_,i)=>'page-'+i)]), error => error.code === '22023');
    assert.equal((await runtimePool.query('SELECT count(*)::int AS count FROM merchant_channels')).rows[0].count, 0);
  });
  async function ingress(pageId) {
    const req = { method: 'POST', path: '/api/meta/webhook', body: { object: 'page', entry: [{ id: pageId, messaging: [] }] } };
    let status = null, body = null, next = false;
    const res = { locals: {}, setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    await middleware.enforceMerchantWebhookOperationalAccess(req, res, () => { next = true; });
    return { status, body, next };
  }
  await t.test('unknown page refuses with generic 503 and no tenant data', async () => {
    const result = await ingress(`unknown-${suffix}`);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'META_PAGE_DIRECTORY_UNAVAILABLE');
    assert.equal(result.next, false);
    assert.ok(merchants.every(id => !JSON.stringify(result.body).includes(id)));
  });
  await t.test('known approved page must reach next middleware under restricted role', async () => {
    const result = await ingress(pages[0]);
    console.log('META_RESTRICTED_KNOWN_PAGE_STATUS ' + result.status);
    assert.equal(result.next, true, 'FA-I-006: restricted runtime must process the known approved page');
  });
});
