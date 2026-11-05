import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {CLONE_HOST, parseCloneAdminUrl, compileRehearsedGrants, restrictedUrl, snapshotObjectStatement} from '../lib/field002-isolated-acceptance-plan.mjs';

const uri = 'postgresql://neondb_owner:encoded%40fixture@' + CLONE_HOST + '/neondb';
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
