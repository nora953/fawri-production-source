import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrivatePair,missingRoleHint,catalogRoleReferences,unresolvedCatalogRoleCount,providerPlaceholders} from '../v1-g5-private-detached-recovery.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('private archive load refuses CI and missing approval before opening files',()=>{
  const env={FAWRI_G5_PRIVATE_RECOVERY_APPROVED:'1',CI:'true'};
  assert.throws(()=>loadPrivatePair('/does-not-exist','/does-not-exist',env),/G5_LOCAL_PRIVATE_APPROVAL_REQUIRED/);
  assert.throws(()=>loadPrivatePair('/does-not-exist','/does-not-exist',{}),/G5_LOCAL_PRIVATE_APPROVAL_REQUIRED/);
});
test('nonmatching archive rejected before sidecar access or decryption',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-pair-test-'));
  try{
    const zip=path.join(dir,'wrong.zip');fs.writeFileSync(zip,Buffer.alloc(671797));
    const env={FAWRI_G5_PRIVATE_RECOVERY_APPROVED:'1',FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256:'a'.repeat(64)};
    assert.throws(()=>loadPrivatePair(zip,'/does-not-exist',env),/G5_LOCAL_ZIP_HASH/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing role diagnostics expose only explicit role labels, never private query text',()=>{
 assert.equal(missingRoleHint('pg_restore: error: could not execute query: ERROR:  role "neon_superuser" does not exist\nCommand was: GRANT private_command;'),'neon_superuser');
 assert.equal(missingRoleHint('ERROR:  role "cloud_admin" does not exist\n'),'cloud_admin');
 assert.equal(missingRoleHint('ERROR:  role "some_private_name" does not exist\nCommand was: secret SQL;'),'OTHER_PRIVATE_ROLE');
 assert.equal(missingRoleHint('ERROR:  permission denied\nCommand was: role "neon_superuser" does not exist\n'),null);
 assert.equal(missingRoleHint('ERROR:  role "private""name" does not exist\n'),'OTHER_PRIVATE_ROLE');
});

test('catalog role preflight covers owners, ACL grantees/grantors, default creators, policy and edges without automatic role creation',()=>{
 const c={roles:[{rolname:'fawri_owner'}],membership_edges:[{role:'neon_superuser',member:'fawri_owner',grantor:'cloud_admin'}],
 database_acl:{owner:'cloud_admin',acl:'{=Tc/cloud_admin,neon_superuser=c/cloud_admin}'},
 schemas:[{owner:'pg_database_owner',acl:String.raw`{"\"odd,role\"=U/cloud_admin"}`}],
 relations:[{owner:'fawri_owner',acl:null}],column_acls:[{acl:'{fawri_owner=r/cloud_admin}'}],
 routines:[],types:[],default_acls:[{creator:'fawri_owner',acl:'{}'}],policy_roles:[{roles:['PUBLIC','other_role']}],extensions:[]};
 assert.deepEqual(providerPlaceholders,['neon_superuser','cloud_admin']);
 const refs=catalogRoleReferences(c);
 assert.deepEqual([...refs].sort(),['cloud_admin','fawri_owner','neon_superuser','odd,role','other_role','pg_database_owner'].sort());
 assert.equal(unresolvedCatalogRoleCount(c,['cloud_admin','fawri_owner','neon_superuser','pg_database_owner']),2);
 assert.equal(unresolvedCatalogRoleCount(c,[...refs]),0);
});
