import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {CLONE_HOST, CLEAN_CLONE_HOST, CLEAN_CLONE_BRANCH, selectCloneProfile, parseCloneAdminUrl, compileRehearsedGrants, operatorRoleName, compileOperatorGrants, restrictedUrl, snapshotObjectStatement} from '../lib/field002-isolated-acceptance-plan.mjs';

// Construct a synthetic URI in memory so the repository contains no literal
// credential-bearing URL, even with an explicitly fake password.
const fixtureUrl = new URL('postgresql://' + CLONE_HOST + '/neondb');
fixtureUrl.username = 'neondb_owner';
fixtureUrl.password = 'encoded@fixture';
const uri = fixtureUrl.toString();
test('bootstrap accepts only the direct clone and verifies the server certificate', () => {
  const config = parseCloneAdminUrl(uri + '?sslmode=require&channel_binding=require');
  assert.equal(config.password, 'encoded@fixture');
  assert.deepEqual(config.ssl, {rejectUnauthorized:true, servername:CLONE_HOST});
  for (const unsafe of [undefined, uri.replace(CLONE_HOST, 'other.neon.tech'), uri.replace(CLONE_HOST, CLONE_HOST + ':5433'),
    uri.replace(/neondb$/, 'different-db'), uri + '?sslmode=disable', uri + '?options=-crole%3Dadmin', uri + '?host=other']) {
    assert.throws(() => parseCloneAdminUrl(unsafe), /^Error: FIELD002_/);
  }
});

test('grant plan requires the reviewed SQL and reversible grants to run-specific roles only', () => {
  const rehearsal = readFileSync(new URL('../../docs/final-audit/evidence/sql/P0-FIELD002-ISOLATED-ROLE-GRANT-REHEARSAL-20261104.sql', import.meta.url), 'utf8');
  const runId = '1'.repeat(24);
  const plan = compileRehearsedGrants(rehearsal, runId);
  assert.equal(plan.grants.length, 13);
  assert.deepEqual(plan.revokes.slice().reverse().map(s => s.replace(/^REVOKE /,'GRANT ').replace(' FROM ',' TO ')), plan.grants);
  assert.throws(() => compileRehearsedGrants(rehearsal.replace('UPDATE(read_at)', 'UPDATE'), runId));
  assert.throws(() => compileRehearsedGrants(rehearsal, 'unexpected;'));
  assert.throws(() => restrictedUrl('neondb_owner','1'.repeat(64)));
  for (const name of plan.names) assert.equal(new URL(restrictedUrl(name,'1'.repeat(64))).hostname, CLONE_HOST);
});

test('FIELD002 third ephemeral operator identity has only reversible directory and receipt functions', () => {
  const run = 'c'.repeat(24);
  const name = operatorRoleName(run);
  assert.equal(name, 'field002_o_' + run);
  const profile = selectCloneProfile('clean_20261106');
  const url = restrictedUrl(name, 'a'.repeat(64), profile);
  assert.equal(new URL(url).username, name);
  assert.equal(new URL(url).hostname, CLEAN_CLONE_HOST);
  const plan = compileOperatorGrants(name);
  assert.equal(plan.grants.length, 6);
  assert.equal(plan.functions.length, 4);
  assert.deepEqual(plan.revokes.slice().reverse().map(sql =>
    sql.replace(/^REVOKE /, 'GRANT ').replace(' FROM ', ' TO ')), plan.grants);
  for (const fn of plan.functions) {
    assert.ok(plan.grants.some(sql =>
      sql === 'GRANT EXECUTE ON FUNCTION ' + fn + ' TO ' + name));
  }
  assert.ok(plan.grants.every(sql =>
    !/GRANT (?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE)/.test(sql)));
  for (const unsafe of ['neondb_owner','field002_t_' + run, 'field002_a_' + run,
    'field002_o_bad','field002_o_' + 'F'.repeat(24)]) {
    assert.throws(() => compileOperatorGrants(unsafe), /FIELD002_OPERATOR_ROLE_REJECTED/);
  }
  assert.throws(() => operatorRoleName('bad'), /FIELD002_RUN_ID_REJECTED/);
});

test('FIELD002 hosted three-principal acceptance remains fenced by source and guaranteed cleanup', () => {
  const source = readFileSync(new URL('../../artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /const allRoles = \[\.\.\.plan\.names, operatorRole\]/);
  assert.match(source, /operatorRoleName\(runId\)/);
  assert.match(source, /compileOperatorGrants\(operatorRole\)/);
  assert.match(source, /for \(const sql of operatorPlan\.grants\) await admin\.query\(sql\)/);
  assert.match(source, /actual_third_operator_login_and_four_scoped_capabilities/);
  assert.match(source, /'directory','receiptRead','receiptReview','receiptExecution'/);
  assert.match(source, /for \(const sql of operatorPlan\.revokes\) await admin\.query\(sql\)/);
  assert.match(source, /for \(const role of allRoles\) await admin\.query\('DROP ROLE ' \+ role\)/);
  assert.match(source, /assert\.deepEqual\(after, baseline/);
});

test('snapshot fingerprints PostgreSQL sequences as scalar state, without losing table row hashes', () => {
  const sequence = snapshotObjectStatement({nspname:'drizzle',relname:'__drizzle_migrations_id_seq',relkind:'S'},0);
  assert.match(sequence,/jsonb_build_object\('last_value',t\.last_value,'log_cnt',t\.log_cnt,'is_called',t\.is_called\)/);
  assert.doesNotMatch(sequence,/to_jsonb\(t\)/);
  assert.match(sequence,/count\(\*\)::text AS count/);
  assert.match(sequence,/string_agg\(/);
  assert.match(sequence,/FROM "drizzle"\."__drizzle_migrations_id_seq" t/);
  const table = snapshotObjectStatement({nspname:'public',relname:'notifications',relkind:'r'},1);
  assert.match(table,/to_jsonb\(t\)::text/);
  assert.doesNotMatch(table,/jsonb_build_object/);
  assert.match(table,/FROM "public"\."notifications" t/);
  assert.match(snapshotObjectStatement({nspname:'public',relname:'partitioned',relkind:'p'},2),/to_jsonb\(t\)::text/);
  for (const object of [
    {nspname:'pg_catalog',relname:'pg_authid',relkind:'r'},
    {nspname:'public',relname:'invalid',relkind:'v'},
    {nspname:'public',relname:'',relkind:'S'},
  ]) assert.throws(() => snapshotObjectStatement(object,0),/FIELD002_SNAPSHOT_OBJECT_REJECTED/);
  assert.throws(() => snapshotObjectStatement({nspname:'public',relname:'notifications',relkind:'r'},-1),/FIELD002_SNAPSHOT_OBJECT_REJECTED/);
});

test('clone preflight refuses competing active or transactional backends while tolerating parked autocommit sessions', () => {
  const source=readFileSync(new URL('../../artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs',import.meta.url),'utf8');
  assert.match(source,/state IS DISTINCT FROM 'idle'/);
  assert.match(source,/backend_xid IS NOT NULL OR backend_xmin IS NOT NULL/);
  assert.match(source,/pg_try_advisory_lock\(20261104,2002\)/);
  assert.match(source,/assert\.deepEqual\(after, baseline/);
});

test('FIELD002 clean isolated clone requires explicit pinned branch, host and credential profile', () => {
  const clean = selectCloneProfile('clean_20261106');
  assert.equal(clean.host, CLEAN_CLONE_HOST);
  assert.equal(clean.branch, CLEAN_CLONE_BRANCH);
  assert.equal(clean.ledgerHash.length, 64);
  assert.equal(clean.notifications, 0);
  const url = new URL('postgresql://' + CLEAN_CLONE_HOST + '/neondb');
  url.username = 'neondb_owner';
  url.password = 'synthetic-fixture-only';
  const accepted = parseCloneAdminUrl(url.href + '?sslmode=verify-full', clean);
  assert.deepEqual(accepted.ssl, {rejectUnauthorized: true, servername: CLEAN_CLONE_HOST});
  assert.equal(accepted.host, CLEAN_CLONE_HOST);
  assert.throws(() => parseCloneAdminUrl(uri, clean), /FIELD002_CLONE_TARGET_REJECTED/);
  assert.throws(() => parseCloneAdminUrl(url.href, selectCloneProfile('cleaned_20261104')), /FIELD002_CLONE_TARGET_REJECTED/);
  assert.throws(() => selectCloneProfile('production'), /FIELD002_CLONE_PROFILE_REJECTED/);
  assert.throws(() => selectCloneProfile(undefined), /FIELD002_CLONE_PROFILE_REJECTED/);
  assert.throws(() => parseCloneAdminUrl(url.href, { ...clean, host: 'example.invalid' }), /FIELD002_CLONE_PROFILE_REJECTED/);
  for (const name of ['?host=wrong', '?options=-csearch_path%3Dpublic', '#bad']) {
    assert.throws(() => parseCloneAdminUrl(url.href + name, clean), /FIELD002_CLONE_TARGET_REJECTED/);
  }
  const tenant = restrictedUrl('field002_t_' + 'a'.repeat(24), 'b'.repeat(64), clean);
  assert.equal(new URL(tenant).hostname, CLEAN_CLONE_HOST);
});

test('FIELD002 execution requires separately authorized exact hosted branch and original cleanup guarantees', () => {
  const source = readFileSync(new URL('../../artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /FAWRI_FIELD002_ALLOWED_EXECUTION_BRANCH/);
  assert.match(source, /FIELD002_HOSTED_WRITE_NOT_AUTHORIZED/);
  assert.match(source, /parseCloneAdminUrl\(process\.env\.FAWRI_FIELD002_CLONE_ADMIN_URL, profile\)/);
  assert.match(source, /ledger: 52, last_hash: profile\.ledgerHash, notices: profile\.notifications/);
  assert.match(source, /restrictedUrl\(tenantRole, passwords\[0\], profile\)/);
  assert.match(source, /assert\.deepEqual\(after, baseline/);
  assert.match(source, /DROP ROLE/);
});

test('clean clone workflow supports a branch-only approved request, no automatic release', () => {
  const source = readFileSync(new URL('../../.github/workflows/field002-clean-clone-acceptance.yml', import.meta.url), 'utf8');
  assert.match(source, /push:\s*\n\s*branches:\s*\n\s*- fix\/p0-provider-receipt-order-discovery-20261015/);
  assert.match(source, /field002-clean-clone-run-request\.json/);
  assert.match(source, /git diff-tree --no-commit-id --name-only -r HEAD/);
  assert.match(source, /APPROVE_CLEAN_CLONE_TEST_FIXTURES/);
  assert.match(source, /approved_parent_sha/);
  assert.match(source, /github\.event_name == 'push'/);
  assert.match(source, /github\.ref == 'refs\/heads\/fix\/p0-provider-receipt-order-discovery-20261015'/);
  assert.match(source, /FAWRI_FIELD002_CLONE_PROFILE: clean_20261106/);
  assert.match(source, /FAWRI_FIELD002_ALLOWED_EXECUTION_BRANCH: br-polished-mouse-b1proel7/);
  assert.doesNotMatch(source, /schedule:/);
});

test('FIELD002 isolated operator privilege probe never requires private security schema USAGE', () => {
  const source = readFileSync(new URL('../../artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("await check('actual_third_operator_login_and_four_scoped_capabilities'");
  const end = source.indexOf("await transaction(async () => {", start);
  assert.ok(start >= 0 && end > start);
  const proof = source.slice(start, end);
  for (const checked of [
    "has_function_privilege(session_user,(",
    "n.nspname='fawri_security'",
    "p.proname='issue_scope'",
    "p.proargtypes[0]='name'::regtype",
    "private_schema_usage:false",
    "has_schema_privilege(session_user,'fawri_security','USAGE')",
  ]) assert.ok(proof.includes(checked), checked);
  assert.ok(!proof.includes("'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE'"));
  assert.ok(!proof.includes("GRANT USAGE ON SCHEMA fawri_security"));
});

test('FIELD002 hosted workflow reports only a sanitized real runner verdict to draft PR', () => {
  const source = readFileSync(new URL('../../.github/workflows/field002-clean-clone-acceptance.yml', import.meta.url), 'utf8');
  for (const safe of [
    'id: hosted_probe',
    'issues: write',
    'if: ${{ always() }}',
    'STEP_OUTCOME: ${{ steps.hosted_probe.outcome }}',
    'if [ "$STEP_OUTCOME" = success ]; then',
    'BOUNDED_SQL_HTTP_PASS_AND_CLEANUP',
    'NOT_ACCEPTED_REVIEW_HOSTED_LOGS',
    'issues/550/comments',
    'github.com/nora953/fawri-production-source/actions/runs/',
    'No claim of original staging closure',
  ]) assert.ok(source.includes(safe), safe);
  assert.ok(!source.includes('echo "$FAWRI_FIELD002_CLONE_ADMIN_URL"'));
  assert.ok(!source.includes('gh api --input'));
});
