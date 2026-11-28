import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {candidateDirectory,verifyCashierAuthorityCandidate} from './lib/cashier-authority-candidate.mjs';

// Generate only in a separate CI copy. No database, credentials or canonical writes.
assert.equal(process.env.GITHUB_ACTIONS,'true','authority candidate generation is CI-only');
assert.ok(process.env.RUNNER_TEMP,'owned runner temporary directory required');
const root=fileURLToPath(new URL('../',import.meta.url));
verifyCashierAuthorityCandidate(root);
const candidate=path.join(root,candidateDirectory);
const stage=JSON.parse(fs.readFileSync(path.join(candidate,'stage.json')));
assert.equal(stage.index,53);assert.equal(stage.mode,'reviewed_sql');
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(stage.sql_sha256,digest(path.join(candidate,'reviewed.sql')));
const temporary=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'fawri-authority-generation-'));
try {
  const db=path.join(temporary,'lib/db');
  fs.mkdirSync(path.dirname(db),{recursive:true});
  fs.cpSync(path.join(root,'lib/db'),db,{recursive:true,filter:p=>path.basename(p)!=='node_modules'});
  for(const name of ['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','.npmrc'])if(fs.existsSync(path.join(root,name)))fs.copyFileSync(path.join(root,name),path.join(temporary,name));
  for(const [from,to] of [[path.join(root,'node_modules'),path.join(temporary,'node_modules')],[path.join(root,'lib/db/node_modules'),path.join(db,'node_modules')]]){
    assert.ok(fs.existsSync(from),'frozen dependencies must already be installed');fs.symlinkSync(from,to,'dir');
  }
  const stageDir=path.join(db,'migration-stages/0053');
  assert.equal(fs.existsSync(stageDir),false);fs.mkdirSync(path.join(stageDir,'preimage'),{recursive:true});
  for(const name of stage.preimage_files){
    assert.equal(digest(path.join(candidate,'preimage',name)),digest(path.join(root,'lib/db/src/schema',name)),'preimage drift: '+name);
    fs.copyFileSync(path.join(candidate,'preimage',name),path.join(stageDir,'preimage',name));
    fs.copyFileSync(path.join(candidate,'schema',name),path.join(db,'src/schema',name));
  }
  const generate=()=>{
    const r=spawnSync(process.execPath,[path.join(db,'scripts/generate-migration.mjs')],{cwd:temporary,stdio:'inherit',env:{...process.env,FAWRI_MIGRATION_OUTPUT_DIR:path.join(db,'drizzle')}});
    assert.equal(r.status,0,'candidate generation must reproduce canonical history');
  };
  // First generate schema metadata, then preserve the separately reviewed SQL.
  fs.writeFileSync(path.join(stageDir,'stage.json'),JSON.stringify({...stage,mode:'drizzle'},null,2)+'\n');generate();
  const sqlName='0053_cashier_stream_authority.sql';
  fs.copyFileSync(path.join(candidate,'reviewed.sql'),path.join(db,'drizzle',sqlName));
  fs.copyFileSync(path.join(candidate,'stage.json'),path.join(stageDir,'stage.json'));generate();
  const before=JSON.parse(fs.readFileSync(path.join(root,'lib/db/drizzle/meta/0052_snapshot.json')));
  const after=JSON.parse(fs.readFileSync(path.join(db,'drizzle/meta/0053_snapshot.json')));
  assert.equal(Object.keys(before.tables).length,97);assert.equal(Object.keys(after.tables).length,98);
  let addedPolicies=0;
  const policies=JSON.parse(fs.readFileSync(path.join(candidate,'policies.json')));
  for(const [name,table] of Object.entries(before.tables)){
    const actual=after.tables[name];assert.ok(actual);
    assert.deepEqual({...actual,policies:{}},{...table,policies:{}},'only policy metadata may change on existing table: '+name);
    const added=policies.filter(p=>'public.'+p.table===name).map(p=>p.name);
    assert.deepEqual(Object.keys(actual.policies).sort(),[...Object.keys(table.policies),...added].sort());addedPolicies+=added.length;
  }
  const ledger=after.tables['public.cashier_stream_enrollment_reviews'];
  assert.equal(ledger.isRLSEnabled,true);assert.equal(Object.keys(ledger.columns).length,8);
  assert.deepEqual(Object.keys(ledger.columns).sort(),['review_reference_hash','stream_id','merchant_id','manifest_hash','reviewer_reference_hash','evidence_sha256','reviewed_at','created_at'].sort());
  assert.equal(Object.keys(ledger.policies).length,2);assert.equal(addedPolicies+2,20);
  assert.equal(after.prevId,before.id);
  const journal=JSON.parse(fs.readFileSync(path.join(db,'drizzle/meta/_journal.json')));
  const oldJournal=JSON.parse(fs.readFileSync(path.join(root,'lib/db/drizzle/meta/_journal.json')));
  assert.deepEqual(journal.entries.slice(0,53),oldJournal.entries);assert.equal(journal.entries.length,54);
  verifyCashierAuthorityCandidate(root);
  for(const file of [sqlName,'meta/0053_snapshot.json','meta/_journal.json']){
    const bytes=fs.readFileSync(path.join(db,'drizzle',file));
    const existing=path.join(candidate,'generated',file);
    if(fs.existsSync(existing))assert.deepEqual(bytes,fs.readFileSync(existing),'committed candidate artifact drift: '+file);
    console.log('SEQ_D3_GENERATED_FILE '+JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,gzipBase64:gzipSync(bytes).toString('base64')}));
  }
  console.log('SEQ_D3_CANONICAL_CANDIDATE '+JSON.stringify({candidateOnly:true,historicalFilesUnchanged:106,journalEntries:54,snapshotTables:98,addedPolicies:20,existingTableRlsAndColumnsUnchanged:true,canonicalSourceUnchanged:true,operationalAdoption:false,hosted:false}));
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
