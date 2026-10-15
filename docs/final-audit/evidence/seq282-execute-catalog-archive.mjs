import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';

const file=process.argv[2];
assert.equal(file,'seq282-catalog-archive-postgres.test.mts','unregistered catalog archive audit');
await assertDisposablePostgres();
const migration=spawnSync(process.execPath,['lib/db/scripts/audit-disposable-migrate.mjs'],{encoding:'utf8',timeout:180000,maxBuffer:4000000});
process.stdout.write(migration.stdout||'');process.stderr.write(migration.stderr||'');
if(migration.status!==0){console.log('RESIDUAL_SCHEMA_RESULT '+JSON.stringify({file,status:'BLOCKED',exit:migration.status}));process.exit(1);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-residual-owned-'));
let cleanup=true,result;
try{
 result=spawnSync(process.execPath,['--import','./scripts/lib/disposable-postgres-preload.mjs','--import','tsx','--test','--test-reporter=tap','--test-concurrency=1','--test-timeout=180000',`docs/final-audit/evidence/${file}`],{
  env:{...process.env,FAWRI_DATA_DIR:dir},encoding:'utf8',timeout:240000,maxBuffer:8000000});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
}finally{try{fs.rmSync(dir,{recursive:true,force:true});}catch{cleanup=false;}}
const stdout=result.stdout||'';
const summary={file,runtime:process.version,exit:result.status,summaryComplete:['pass','fail','skipped'].every(k=>new RegExp('^# '+k+' \\d+$','m').test(stdout)),
 passed:Number(stdout.match(/^# pass (\d+)$/m)?.[1]||0),failed:Number(stdout.match(/^# fail (\d+)$/m)?.[1]||0),skipped:Number(stdout.match(/^# skipped (\d+)$/m)?.[1]||0),cleanup};
console.log('CATALOG_ARCHIVE_SUITE_RESULT '+JSON.stringify(summary));
process.exitCode=result.status===0&&summary.summaryComplete&&summary.passed>0&&summary.skipped===0&&cleanup?0:1;
