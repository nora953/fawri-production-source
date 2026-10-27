import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {candidateDirectory,verifyCashierAuthorityCandidate} from '../lib/cashier-authority-candidate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('coordinated authority candidate pins accepted SQL, readiness, recovery and all historical bytes',()=>{
  assert.equal(verifyCashierAuthorityCandidate(root).historicalFilesUnchanged,106);
});
for(const fault of ['sql','history','readiness','promotion','adoption']) test('candidate rejects '+fault+' drift',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cashier-candidate-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const contract=JSON.parse(fs.readFileSync(path.join(root,candidateDirectory,'contract.json')));
  const paths=[candidateDirectory+'/contract.json',candidateDirectory+'/reviewed.sql','lib/db/drizzle/meta/_journal.json',...contract.inputs.map(x=>x.path),...contract.historicalFiles.map(x=>x.path)];
  for(const p of new Set(paths)){fs.mkdirSync(path.dirname(path.join(temp,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(temp,p));}
  if(fault==='sql')fs.appendFileSync(path.join(temp,candidateDirectory,'reviewed.sql'),'\nSELECT 1;');
  if(fault==='history')fs.appendFileSync(path.join(temp,contract.historicalFiles[0].path),'\n-- drift');
  if(fault==='readiness')fs.appendFileSync(path.join(temp,'artifacts/api-server/src/services/cashierStreamAuthorityReadiness.ts'),'\n// drift');
  if(fault==='promotion')fs.mkdirSync(path.join(temp,'lib/db/migration-stages/0053'),{recursive:true});
  if(fault==='adoption'){contract.operationalAdoption=true;fs.writeFileSync(path.join(temp,candidateDirectory,'contract.json'),JSON.stringify(contract));}
  assert.throws(()=>verifyCashierAuthorityCandidate(temp));
});
