import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
function part(raw,a,b){const i=raw.indexOf(a),j=raw.indexOf(b,i);assert.ok(i>=0&&j>i);return stripTypeScriptTypes(raw.slice(i,j),{mode:'transform'}).replace(/^export\s+/gm,'');}
const transaction=part(read('artifacts/api-server/src/services/operationalPostgresAuthority.ts'),'export async function withOperationalTransaction<','export async function withMerchantOperationalTransaction<');
const validate=part(read('artifacts/api-server/src/services/postgresSupportAuthority.ts'),'export async function validateSupportPreviewSessionPostgres(','export async function endSupportPreviewSessionPostgres(');
class SupportPostgresError extends Error{constructor(code,message,statusCode){super(message);Object.assign(this,{code,statusCode});}}
function fixture(options={}){
 const events=[];let state={id:'synthetic-preview',request_id:'synthetic-request',ticket_id:'synthetic-ticket',merchant_id:'synthetic-merchant',admin_account_id:'synthetic-admin',admin_session_id:'bound-session',status:'active',started_at:'2026-10-13T00:00:00Z',expires_at:new Date(Date.now()+60000).toISOString(),ended_at:null,viewed_sections:[],...options.session},before;
 const client={query:async(sql,values)=>{
   events.push({sql,values});if(sql==='BEGIN'){before=structuredClone(state);return {rows:[]};}
   if(sql==='COMMIT'){if(options.commitError)throw Error('synthetic-commit-fault');before=null;return {rows:[]};}
   if(sql==='ROLLBACK'){state=before;return {rows:[]};}
   if(sql.includes('SELECT id, request_id'))return {rows:options.missing?[]:[structuredClone(state)]};
   if(sql.includes("SET status = 'ended'")){state.status='ended';state.ended_at=new Date().toISOString();return {rows:[]};}
   if(sql.includes('SET last_seen_at')){state.viewed_sections=JSON.parse(values[1]);return {rows:[]};}
   throw Error('unexpected SQL adapter input');
 },release:()=>events.push({sql:'RELEASE'})};
 const f=vm.runInNewContext(`(()=>{${transaction};${validate};return {withOperationalTransaction,validateSupportPreviewSessionPostgres};})()`,{
   operationalDatabasePool:async()=>({connect:async()=>client}),assertPostgresRequired:async()=>{},SupportPostgresError,
   text:x=>String(x??'').trim(),stringArray:x=>Array.isArray(x)?x.map(String):[],iso:x=>new Date(x).toISOString(),Date,Set,
 });
 return {f,events,state:()=>state,input:{sessionId:'synthetic-preview',adminId:'synthetic-admin',adminSessionId:'bound-session',viewedSection:'snapshot'}};
}
test('SEQ267 valid preview commits viewed-section update and releases once',async()=>{
 const x=fixture();const r=await x.f.validateSupportPreviewSessionPostgres(x.input);assert.equal(r.merchant_id,'synthetic-merchant');assert.equal(r.read_only,true);assert.equal(x.state().viewed_sections[0],'snapshot');assert.equal(x.events.at(-2).sql,'COMMIT');assert.equal(x.events.filter(e=>e.sql==='RELEASE').length,1);
});
test('SEQ267 deliberately unbound preview accepts same-admin caller without bound session',async()=>{
 const x=fixture({session:{admin_session_id:null}});await x.f.validateSupportPreviewSessionPostgres({...x.input,adminSessionId:''});assert.equal(x.events.at(-2).sql,'COMMIT');
});
for(const [label,options,input,code] of [
 ['missing',{missing:true},{},'SUPPORT_PREVIEW_NOT_FOUND'],
 ['foreign-admin',{}, {adminId:'foreign-admin'},'SUPPORT_PREVIEW_ADMIN_MISMATCH'],
 ['foreign-session',{}, {adminSessionId:'foreign-session'},'SUPPORT_PREVIEW_SESSION_MISMATCH'],
 ['ended',{session:{status:'ended'}},{},'SUPPORT_PREVIEW_ENDED'],
])test(`SEQ267 ${label} denied before update`,async()=>{
 const x=fixture(options);await assert.rejects(()=>x.f.validateSupportPreviewSessionPostgres({...x.input,...input}),{code});assert.equal(x.events.filter(e=>/^\s*UPDATE\b/.test(e.sql)).length,0);assert.equal(x.events.at(-2).sql,'ROLLBACK');assert.equal(x.events.at(-1).sql,'RELEASE');
});
test('SEQ268 observation: omitted caller session passes persisted nonempty session binding',async()=>{
 const x=fixture();await x.f.validateSupportPreviewSessionPostgres({...x.input,adminSessionId:''});assert.equal(x.events.at(-2).sql,'COMMIT');
});
test('SEQ268 acceptance: persisted binding requires nonempty caller session',async()=>{
 const x=fixture();await assert.rejects(()=>x.f.validateSupportPreviewSessionPostgres({...x.input,adminSessionId:''}),{code:'SUPPORT_PREVIEW_SESSION_MISMATCH'});
});
test('SEQ269 observation: expired validation denies access but rolls back ended marker',async()=>{
 const x=fixture({session:{expires_at:'2020-01-01T00:00:00Z'}});await assert.rejects(()=>x.f.validateSupportPreviewSessionPostgres(x.input),{code:'SUPPORT_PREVIEW_EXPIRED'});assert.ok(x.events.some(e=>e.sql.includes("SET status = 'ended'")));assert.equal(x.state().status,'active');assert.equal(x.events.at(-2).sql,'ROLLBACK');
});
test('SEQ269 acceptance: expired session termination survives failed validation',async()=>{
 const x=fixture({session:{expires_at:'2020-01-01T00:00:00Z'}});await assert.rejects(()=>x.f.validateSupportPreviewSessionPostgres(x.input),{code:'SUPPORT_PREVIEW_EXPIRED'});assert.equal(x.state().status,'ended','SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001: expiry UPDATE undone by rejection');
});
test('SEQ270 commit failure rolls viewed-section adapter state back and releases',async()=>{
 const x=fixture({commitError:true});await assert.rejects(()=>x.f.validateSupportPreviewSessionPostgres(x.input),/synthetic-commit-fault/);assert.equal(x.state().viewed_sections.length,0);assert.equal(x.events.at(-2).sql,'ROLLBACK');assert.equal(x.events.at(-1).sql,'RELEASE');
});
