import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const rows=fs.readFileSync(new URL('./seq225-expanded-selection.csv',import.meta.url),'utf8').trim().split('\n').slice(1);
const files=rows.filter(line=>line.split(',')[1]==='integration').map(line=>line.split(',')[0]);
assert.equal(files.length,13);
for(const file of files)for(const mode of ['missing-url','unattested-hosted-target']){
  test(`SEQ241 fence ${mode}: ${file}`,()=>{
    const env={PATH:process.env.PATH,NODE_ENV:'test'};
    if(mode==='unattested-hosted-target')env.DATABASE_URL='postgresql://synthetic:synthetic@audit.example.invalid/untrusted';
    const r=spawnSync(process.execPath,['--import','./scripts/lib/disposable-postgres-preload.mjs','--test','--test-reporter=tap',file],{
      env,encoding:'utf8',timeout:5000,maxBuffer:100000});
    assert.equal(r.error,undefined);assert.notEqual(r.status,0);
    const output=r.stdout+r.stderr;
    assert.match(output,/Disposable PostgreSQL attestation rejected; no application DB import permitted/);
    assert.match(output,/disposable-postgres-preload\.mjs/);
    assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|DATABASE_URL is required/);
    // Node may emit a failed FILE container when the pre-import guard throws;
    // that is not execution of the original application assertions.
  });
}
