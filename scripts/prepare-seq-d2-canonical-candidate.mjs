import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
const candidate='docs/final-audit/evidence/seq-d2-canonical-candidate';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(process.argv[2]==='export'){
 for(const file of ['0052_cashier_stream_receipt_storage.sql','meta/0052_snapshot.json','meta/_journal.json']){
  const bytes=fs.readFileSync('lib/db/drizzle/'+file);
  console.log('SEQ_D2_GENERATED_FILE '+JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,gzipBase64:gzipSync(bytes).toString('base64')}));
 }
 process.exit(0);
}
assert.equal(process.env.GITHUB_ACTIONS,'true','candidate preparation is CI-only; never edits a user checkout');
const oldJournal=JSON.parse(fs.readFileSync('lib/db/drizzle/meta/_journal.json','utf8'));
assert.equal(oldJournal.entries.length,52);
const oldFiles=[];
for(const entry of oldJournal.entries)oldFiles.push('lib/db/drizzle/'+entry.tag+'.sql','lib/db/drizzle/meta/'+String(entry.idx).padStart(4,'0')+'_snapshot.json');
const oldHashes=new Map(oldFiles.map(p=>[p,sha(p)]));
const stage=JSON.parse(fs.readFileSync(candidate+'/stage.json','utf8'));
assert.equal(stage.sql_sha256,sha(candidate+'/reviewed.sql'));
const stageDir='lib/db/migration-stages/0052';assert.equal(fs.existsSync(stageDir),false);
fs.mkdirSync(stageDir+'/preimage',{recursive:true});
fs.copyFileSync('lib/db/src/schema/cashier-staff.ts',stageDir+'/preimage/cashier-staff.ts');
fs.copyFileSync(candidate+'/cashier-staff.ts','lib/db/src/schema/cashier-staff.ts');
function generate(){const r=spawnSync(process.execPath,['lib/db/scripts/generate-migration.mjs'],{stdio:'inherit',env:process.env});assert.equal(r.status,0,'canonical generator must succeed');}
// First let the existing generator create the appended journal/snapshot/SQL.
// Then verify the reviewed SQL through its existing reviewed_sql stage path.
fs.writeFileSync(stageDir+'/stage.json',JSON.stringify({...stage,mode:'drizzle'},null,2)+'\n');generate();
fs.copyFileSync(candidate+'/reviewed.sql','lib/db/drizzle/0052_cashier_stream_receipt_storage.sql');
fs.writeFileSync(stageDir+'/stage.json',JSON.stringify(stage,null,2)+'\n');generate();
for(const [p,hash]of oldHashes)assert.equal(sha(p),hash,'historical bytes changed: '+p);
const journal=JSON.parse(fs.readFileSync('lib/db/drizzle/meta/_journal.json','utf8'));
assert.deepEqual(journal.entries.slice(0,52),oldJournal.entries);assert.equal(journal.entries.length,53);
const snapshot=JSON.parse(fs.readFileSync('lib/db/drizzle/meta/0052_snapshot.json','utf8'));
assert.equal(Object.keys(snapshot.tables).length,97);
assert.ok(snapshot.tables['public.cashier_device_streams']);assert.ok(snapshot.tables['public.cashier_operation_receipts']);
console.log('SEQ_D2_CANONICAL_CANDIDATE '+JSON.stringify({candidateOnly:true,historicalFilesUnchanged:oldHashes.size,journalEntries:53,snapshotTables:97,reviewedSql:true,liveAdmissionChanged:false,hostedChanged:false}));
