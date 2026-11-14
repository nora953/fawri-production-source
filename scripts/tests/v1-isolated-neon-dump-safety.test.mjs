import test from 'node:test';
import assert from 'node:assert/strict';
import {NEON_ISOLATED_TARGET,validateIsolatedDumpUrl,
  sealIsolatedDump,openIsolatedDump} from '../lib/v1-isolated-neon-dump-safety.mjs';

const allowed={
  GITHUB_ACTIONS:'true',
  GITHUB_REPOSITORY:'nora953/fawri-production-source',
  GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
  FAWRI_ALLOW_ISOLATED_NEON_DUMP:'1',
};
const direct='postgresql://fawri_owner:fake-not-a-secret@'+
  NEON_ISOLATED_TARGET.endpoint_host+'/fawri?sslmode=require';

test('direct isolated child URL only: never production',()=>{
  assert.deepEqual(validateIsolatedDumpUrl(direct,{env:allowed}),{
    host:NEON_ISOLATED_TARGET.endpoint_host,port:5432,
    username:'fawri_owner',database:'fawri',
  });
  assert.throws(()=>validateIsolatedDumpUrl(direct.replace(
    NEON_ISOLATED_TARGET.endpoint_host,
    'ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech'),
    {env:allowed}),/V1_DUMP_NOT_PINNED_ISOLATED_BRANCH_ENDPOINT/);
  assert.throws(()=>validateIsolatedDumpUrl(direct.replace(
    NEON_ISOLATED_TARGET.endpoint_host,
    'ep-steep-star-b97qa95j-pooler.c-7.eu-central-1.aws.neon.tech'),
    {env:allowed}),/V1_DUMP_NOT_PINNED_ISOLATED_BRANCH_ENDPOINT/);
});
test('reject foreign DB role, query, SSL downgrades and unknown credentials',()=>{
  for(const candidate of [
    direct.replace('fawri_owner:','postgres:'),
    direct.replace('/fawri?','/neondb?'),
    direct.replace('sslmode=require','sslmode=disable'),
    direct+'&options=-csearch_path%3Dpublic',
    'postgresql://fawri_owner@'+NEON_ISOLATED_TARGET.endpoint_host+
      '/fawri?sslmode=require',
  ])assert.throws(()=>validateIsolatedDumpUrl(candidate,{env:allowed}));
});
test('reject wrong branch, environment or repository before connecting',()=>{
  for(const [key,value] of [
    ['GITHUB_ACTIONS','false'],['GITHUB_REPOSITORY','someone/fork'],
    ['GITHUB_REF','refs/heads/main'],
    ['FAWRI_ALLOW_ISOLATED_NEON_DUMP','0'],
  ])assert.throws(()=>validateIsolatedDumpUrl(direct,
    {env:{...allowed,[key]:value}}),/V1_DUMP_NOT_AUTHORIZED_GITHUB_BRANCH/);
});
test('authenticated AES-256-GCM encrypted pgcustom round trip and tamper deny',()=>{
  const pass='synthetic-30-character-test-passphrase',
    payload=Buffer.from('PGDMP\x00safe synthetic PostgreSQL bytes');
  const sealed=sealIsolatedDump(payload,pass);
  assert.ok(!sealed.includes(payload));
  assert.deepEqual(openIsolatedDump(sealed,pass),payload);
  assert.notDeepEqual(sealIsolatedDump(payload,pass),sealed);
  const tampered=Buffer.from(sealed);tampered[tampered.length-1]^=1;
  assert.throws(()=>openIsolatedDump(tampered,pass),
    /V1_BACKUP_ENCRYPTED_AUTHENTICATION_FAILED/);
  assert.throws(()=>openIsolatedDump(sealed,'wrong password long enough for derivation'),
    /V1_BACKUP_ENCRYPTED_AUTHENTICATION_FAILED/);
  assert.throws(()=>sealIsolatedDump(payload,'short'),
    /V1_BACKUP_PASSPHRASE_NOT_SET_OR_TOO_SHORT/);
  assert.throws(()=>sealIsolatedDump(Buffer.from('not a dump'),pass),
    /V1_BACKUP_NOT_POSTGRES_CUSTOM_ARCHIVE/);
});
