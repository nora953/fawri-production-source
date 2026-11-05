import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {CLONE_HOST, parseCloneAdminUrl, compileRehearsedGrants, restrictedUrl} from '../lib/field002-isolated-acceptance-plan.mjs';

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
