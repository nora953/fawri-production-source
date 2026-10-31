import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const candidateDirectory='docs/final-audit/evidence/seq-d3-authority-candidate';
export const candidateHeader='-- SEQ-D3 coordinated authority CANDIDATE ONLY: not in lib/db/drizzle.\n-- No runtime LOGIN grants, route activation, canonical promotion or hosted execution.\n';
export function verifyCashierAuthorityCandidate(root) {
  const read=p=>fs.readFileSync(path.join(root,p));
  const manifest=JSON.parse(read(candidateDirectory+'/contract.json'));
  assert.equal(manifest.candidateOnly,true);
  assert.equal(manifest.operationalAdoption,false);
  assert.equal(manifest.releaseAccepted,false);
  assert.equal(manifest.canonicalMigrationCount,53);
  assert.equal(manifest.canonicalPublicTables,97);
  assert.equal(manifest.historicalFiles.length,106);
  assert.equal(new Set(manifest.historicalFiles.map(f=>f.path)).size,106);
  const journal=JSON.parse(read('lib/db/drizzle/meta/_journal.json'));
  assert.equal(journal.entries.length,53);
  const expected=journal.entries.flatMap(e=>['lib/db/drizzle/'+e.tag+'.sql','lib/db/drizzle/meta/'+String(e.idx).padStart(4,'0')+'_snapshot.json']).sort();
  assert.deepEqual(manifest.historicalFiles.map(f=>f.path).sort(),expected);
  for(const {path:p,gitBlobSha1} of manifest.historicalFiles) {
    const bytes=read(p);
    assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),gitBlobSha1,'historical migration changed: '+p);
  }
  for(const {path:p,sha256} of manifest.inputs) assert.equal(createHash('sha256').update(read(p)).digest('hex'),sha256,'candidate prerequisite changed: '+p);
  const sql=read(candidateDirectory+'/reviewed.sql').toString();
  assert.equal(sql,candidateHeader+read(manifest.enrollmentSql).toString()+'\n'+read(manifest.receiptSql).toString(),'candidate differs from accepted proposal bytes');
  assert.equal(createHash('sha256').update(sql).digest('hex'),manifest.sqlSha256);
  assert.equal(fs.existsSync(path.join(root,'lib/db/migration-stages/0053')),false,'candidate must not silently promote a canonical stage');
  assert.equal(fs.existsSync(path.join(root,'lib/db/drizzle/0053_cashier_stream_authority.sql')),false);
  return {candidateOnly:true,historicalFilesUnchanged:106,canonicalMigrationCount:53,operationalAdoption:false,releaseAccepted:false};
}
