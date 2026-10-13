import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const strip=s=>stripTypeScriptTypes(s,{mode:'transform'}).replace(/^import[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
const transaction=strip(read('artifacts/api-server/src/services/operationalPostgresAuthority.ts'));
const raw=read('artifacts/api-server/src/services/postgresSupportInspectionAuthority.ts');
const decision=strip(raw.slice(raw.indexOf('export async function decideInspectionRequestCanonicalPostgres(')));
class SupportPostgresError extends Error{constructor(code,message,statusCode){super(message);Object.assign(this,{code,statusCode});}}
function fixture(options={}){
 const events=[];let state={status:'pending',request_expires_at:new Date(Date.now()+60000).toISOString(),...options.state},before;
 const client={query:async(sql,values)=>{
  events.push({sql,values});if(sql==='BEGIN'){before=structuredClone(state);return {rows:[]};}
  if(sql==='ROLLBACK'){state=before;return {rows:[]};}if(sql==='COMMIT')return {rows:[]};
  if(sql.includes('set_config'))return {rows:[]};
  if(sql.includes('SELECT status, request_expires_at'))return {rows:values[2]==='synthetic-merchant'?[structuredClone(state)]:[]};
  if(sql.includes("SET status = 'expired'"))state.status='expired';
  else if(sql.includes("SET status = 'approved'"))state.status='approved';
  else if(sql.includes("SET status = 'rejected'"))state.status='rejected';
  else throw Error('unexpected SQL');return {rows:[]};
 },release:()=>events.push({sql:'RELEASE'})};
 const fn=vm.runInNewContext(`(()=>{${transaction};operationalDatabasePool=async()=>pool;${decision};return decideInspectionRequestCanonicalPostgres;})()`,{
  pool:{connect:async()=>client},process:{env:{FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required'}},SupportPostgresError,Date,
  text:x=>String(x??'').trim(),getMerchantSupportTicketPostgres:async(id,ticket)=>({merchant_id:id,id:ticket}),
 });
 // The actual authority predicate reads only this synthetic flag.
 return {fn,state:()=>state,events,input:{merchantId:'synthetic-merchant',ticketId:'synthetic-ticket',requestId:'synthetic-request',decision:'approve'}};
}
for(const mode of ['approve','reject'])test(`SEQ279 pending consent ${mode} commits matching tenant`,async()=>{
 const x=fixture();await x.fn({...x.input,decision:mode});assert.equal(x.state().status,mode==='approve'?'approved':'rejected');assert.equal(x.events.at(-2).sql,'COMMIT');assert.equal(x.events.find(e=>e.sql.includes('set_config')).values[0],'synthetic-merchant');
});
test('SEQ279 invalid decision rejects before database',async()=>{
 const x=fixture();await assert.rejects(()=>x.fn({...x.input,decision:'invalid'}),{code:'SUPPORT_INSPECTION_DECISION_INVALID'});assert.equal(x.events.length,0);
});
test('SEQ279 foreign merchant cannot decide request',async()=>{
 const x=fixture();await assert.rejects(()=>x.fn({...x.input,merchantId:'foreign-merchant'}),{code:'SUPPORT_INSPECTION_NOT_FOUND'});assert.equal(x.state().status,'pending');
});
test('SEQ279 already decided request rejects without overwrite',async()=>{
 const x=fixture({state:{status:'approved'}});await assert.rejects(()=>x.fn({...x.input,decision:'reject'}),{code:'SUPPORT_INSPECTION_NOT_PENDING'});assert.equal(x.state().status,'approved');
});
test('SEQ279 observation: expired consent denies and rolls back expired marker',async()=>{
 const x=fixture({state:{request_expires_at:'2020-01-01T00:00:00Z'}});await assert.rejects(()=>x.fn(x.input),{code:'SUPPORT_INSPECTION_EXPIRED'});assert.equal(x.state().status,'pending');assert.equal(x.events.at(-2).sql,'ROLLBACK');
});
test('SEQ279 acceptance: expired consent marker survives denial',async()=>{
 const x=fixture({state:{request_expires_at:'2020-01-01T00:00:00Z'}});await assert.rejects(()=>x.fn(x.input),{code:'SUPPORT_INSPECTION_EXPIRED'});assert.equal(x.state().status,'expired','existing SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 also affects canonical consent expiry');
});
