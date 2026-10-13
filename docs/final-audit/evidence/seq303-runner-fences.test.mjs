import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
const runner='docs/final-audit/evidence/seq302-run-owned-retention.sh';
test('new provisioner rejects unsupported file before Docker or target setup',()=>{
 const r=spawnSync('bash',[runner,'unregistered.test.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(r.status,2);assert.match(r.stderr,/Unsupported retention audit file/);
});
test('new provisioner refuses registered file without owned runner environment',()=>{
 const r=spawnSync('bash',[runner,'seq302-retention-postgres.test.mts'],{env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/GitHub runner temp is required/);assert.doesNotMatch(r.stderr,/docker: command not found/);
});
test('new executor refuses unattested environment before migrations or test import',()=>{
 const r=spawnSync(process.execPath,['docs/final-audit/evidence/seq302-execute-retention.mjs','seq302-retention-postgres.test.mts'],{env:{PATH:process.env.PATH,NODE_ENV:'test'},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Disposable PostgreSQL attestation rejected/);assert.doesNotMatch(r.stderr,/ERR_MODULE_NOT_FOUND|ECONNREFUSED/);assert.doesNotMatch(r.stdout,/RESIDUAL_SCHEMA_RESULT|RETENTION_SUITE_RESULT/);
});
test('new executor refuses unregistered file before DB attestation',()=>{
 const r=spawnSync(process.execPath,['docs/final-audit/evidence/seq302-execute-retention.mjs','unregistered.test.mjs'],{env:{PATH:process.env.PATH,NODE_ENV:'test'},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/unregistered retention audit/);assert.doesNotMatch(r.stderr,/Disposable PostgreSQL attestation/);
});
