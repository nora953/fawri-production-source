/** G5 private detached recovery: reviewed global-role plan and catalog parity.
 * Pure helpers only: no connection, file writes, role replay or production access.
 * Differences are reported by category/count, never by private object or ACL text.
 */
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';

const OWNER='fawri_owner';
const RUNTIME=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'];
const WRITER='fawri_cashier_retirement_writer';
const NAMES=[OWNER,...RUNTIME,WRITER].sort();
const FLAGS=['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolcanlogin','rolreplication','rolbypassrls'];
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const sort=items=>[...items].sort((a,b)=>a<b?-1:a>b?1:0);
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const roleKey=r=>r.rolname;
const edgeKey=e=>JSON.stringify([e.role,e.member]);
const sortedObject=o=>Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]]));

export function reviewedGlobals(c){
  check(c?.format==='fawri-g5-postg4-acl-catalog-v1' && c.database==='fawri' &&
    c.server_major===18 && c.read_only===true,'G5_RECOVERY_CATALOG_SCOPE');
  check(Array.isArray(c.roles)&&Array.isArray(c.membership_edges),'G5_RECOVERY_GLOBAL_SHAPE');
  assert.deepEqual(sort(c.roles.map(roleKey)),NAMES,'G5_RECOVERY_ROLE_ALLOWLIST');
  for(const r of c.roles){
    check(FLAGS.every(k=>typeof r[k]==='boolean')&&r.rolsuper===false&&
      Number.isInteger(r.rolconnlimit)&&r.rolconnlimit>=-1,'G5_RECOVERY_ROLE_ATTRIBUTES');
    check(r.rolvaliduntil===null||r.rolvaliduntil==='infinity','G5_RECOVERY_ROLE_EXPIRY_REVIEW');
    if(r.rolname===OWNER)check(r.rolcanlogin,'G5_RECOVERY_OWNER_LOGIN');
    else {
      check(r.rolcanlogin===RUNTIME.includes(r.rolname)&&
        ['rolinherit','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls']
        .every(k=>!r[k]),'G5_RECOVERY_RESTRICTED_ROLE_ATTRIBUTES');
    }
  }
  const internal=c.membership_edges.filter(e=>NAMES.includes(e.role)&&NAMES.includes(e.member));
  const external=c.membership_edges.filter(e=>!NAMES.includes(e.role)||!NAMES.includes(e.member));
  check(internal.length===4&&external.length===1,'G5_RECOVERY_EDGE_COUNT');
  check(external[0].member===OWNER&&!NAMES.includes(external[0].role),
    'G5_RECOVERY_EXTERNAL_EDGE_REVIEW');
  assert.deepEqual(sort(internal.map(e=>e.role)),sort([...RUNTIME,WRITER]),'G5_RECOVERY_EDGE_ALLOWLIST');
  for(const e of internal)check(e.member===OWNER&&e.admin===true&&e.inherit===false&&e.set===false,
    'G5_RECOVERY_CREATOR_EDGE_REVIEW');
  return {roles:c.roles,internal,externalExcluded:1};
}

// Returns sensitive ephemeral SQL, to be consumed only by a newly created private
// cluster's bootstrap administrator. Never log or commit the returned value.
export function buildDetachedRoleSql(c,random=()=>randomBytes(32).toString('hex')){
  const g=reviewedGlobals(c), credentials=Object.create(null), statements=[];
  for(const r of g.roles){
    const a=['NOSUPERUSER',r.rolinherit?'INHERIT':'NOINHERIT',
      r.rolcreaterole?'CREATEROLE':'NOCREATEROLE',r.rolcreatedb?'CREATEDB':'NOCREATEDB',
      r.rolcanlogin?'LOGIN':'NOLOGIN',r.rolreplication?'REPLICATION':'NOREPLICATION',
      r.rolbypassrls?'BYPASSRLS':'NOBYPASSRLS','CONNECTION LIMIT '+r.rolconnlimit];
    if(r.rolcanlogin){
      const secret=random();
      check(typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret)&&!Object.values(credentials).includes(secret),
        'G5_RECOVERY_FRESH_CREDENTIAL_REQUIRED');
      credentials[r.rolname]=secret;a.push('PASSWORD '+lit(secret));
      if(r.rolvaliduntil==='infinity')a.push("VALID UNTIL 'infinity'");
    }
    statements.push('CREATE ROLE '+qi(r.rolname)+' '+a.join(' ')+';');
  }
  for(const e of g.internal)statements.push('GRANT '+qi(e.role)+' TO '+qi(e.member)+
    ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;');
  return {sql:statements.join('\n'),credentials,externalExcluded:g.externalExcluded};
}

// PostgreSQL array text lexer. Preserve NULL (default ACL) vs {} (explicit
// empty ACL); normalize only array element ordering, not grant semantics.
export function canonicalAcl(value){
  if(value===null)return null;
  check(typeof value==='string'&&value.startsWith('{')&&value.endsWith('}'),'G5_RECOVERY_ACL_FORMAT');
  if(value==='{}')return [];
  const items=[];let item='',quoted=false,escaped=false;
  for(const ch of value.slice(1,-1)){
    if(escaped){item+=ch;escaped=false;continue;}
    if(ch==='\\'){escaped=true;continue;}
    if(ch==='"'){quoted=!quoted;continue;}
    if(ch===','&&!quoted){check(item.length>0,'G5_RECOVERY_ACL_EMPTY');items.push(item);item='';continue;}
    item+=ch;
  }
  check(!quoted&&!escaped&&item.length>0,'G5_RECOVERY_ACL_SYNTAX');
  items.push(item);
  check(items.every(x=>x!=='NULL'&&x.includes('=')&&x.includes('/')),'G5_RECOVERY_ACL_ITEM');
  return sort(items);
}
const sections={
  schemas:['schema'],relations:['schema','name','kind'],
  column_acls:['schema','relation','column'],
  routines:['schema','name','identity_args','kind'],
  types:['schema','name','kind'],default_acls:['creator','schema','kind'],
  policy_roles:['schema','relation','policy'],extensions:['name']
};
function canonicalEntry(e){
  const copy={...e};
  if(Object.hasOwn(copy,'acl'))copy.acl=canonicalAcl(copy.acl);
  if(Object.hasOwn(copy,'roles'))copy.roles=sort(copy.roles);
  return JSON.stringify(sortedObject(copy));
}
function keyed(rows,keys){
  check(Array.isArray(rows),'G5_RECOVERY_SECTION_SHAPE');
  const result=new Map();
  for(const e of rows){
    const id=JSON.stringify(keys.map(k=>e[k]));
    check(!result.has(id)&&keys.every(k=>Object.hasOwn(e,k)),'G5_RECOVERY_DUPLICATE_OR_MISSING_KEY');
    result.set(id,canonicalEntry(e));
  }
  return result;
}
function differences(a,b){
  let missing=0,extra=0,changed=0;
  for(const [k,v] of a)if(!b.has(k))missing++;else if(b.get(k)!==v)changed++;
  for(const k of b.keys())if(!a.has(k))extra++;
  return {missing,extra,changed};
}
// Exact object parity is intentionally fail-closed: provider-specific objects,
// ownership, grantors and temporal drift are NOT silently discarded.
export function compareObjectCatalogs(source,target){
  const report={};
  for(const [name,keys] of Object.entries(sections))
    report[name]=differences(keyed(source[name],keys),keyed(target[name],keys));
  check(source.database_acl&&target.database_acl,'G5_RECOVERY_DATABASE_ACL_REQUIRED');
  report.database_acl={missing:0,extra:0,changed:Number(canonicalEntry(source.database_acl)!==canonicalEntry(target.database_acl))};
  return {exact:Object.values(report).every(r=>r.missing+r.extra+r.changed===0),report};
}
// Membership grantor is explicitly reported separately: the detached bootstrap
// admin may differ from the hosted grantor. Never treat this as exact parity.
export function compareDetachedGlobals(source,target){
  const g=reviewedGlobals(source);
  const expected=g.internal;
  const targetEdges=target.membership_edges;
  check(Array.isArray(target.roles)&&Array.isArray(targetEdges),'G5_RECOVERY_TARGET_GLOBAL_SHAPE');
  const roles=differences(keyed(source.roles,['rolname']),keyed(target.roles,['rolname']));
  const withoutGrantor=e=>{const {grantor,...rest}=e;return rest;};
  const edges=differences(keyed(expected.map(withoutGrantor),['role','member']),
    keyed(targetEdges.map(withoutGrantor),['role','member']));
  const exactGrantors=differences(keyed(expected,['role','member']),keyed(targetEdges,['role','member']));
  const counts=r=>r.missing+r.extra+r.changed;
  return {portableMatch:counts(roles)+counts(edges)===0,roles,edges,grantors:exactGrantors,externalExcluded:1};
}


// Share only fixed field names and aggregate counts. Never expose an object
// identifier, policy expression, raw ACL, role name, or private catalog.
const reviewFields=Object.freeze({
 schemas:['owner','acl'],relations:['owner','acl','rls','force_rls'],
 column_acls:['acl'],routines:['owner','acl','security_definer'],
 types:['owner','acl'],default_acls:['acl'],
 policy_roles:['command','permissive','roles'],extensions:['owner','version','schema'],
 database_acl:['owner','acl']
});
function roleClass(name){
 if(NAMES.includes(name))return 'application';
 if(['neon_superuser','cloud_admin'].includes(name))return 'provider';
 if(name==='g5_detached_bootstrap')return 'bootstrap';
 if(typeof name==='string'&&name.startsWith('pg_'))return 'builtin';
 return 'other';
}
function increment(obj,k){obj[k]=(obj[k]??0)+1;}
export function describeObjectDifferences(source,target){
 const report={};
 for(const [section,fields] of Object.entries(reviewFields)){
   const keys=sections[section]??[];
   const a=keyed(section==='database_acl'?[source.database_acl]:source[section],keys);
   const b=keyed(section==='database_acl'?[target.database_acl]:target[section],keys);
   const counts={},owners={},aclForms={};let unclassified=0;
   for(const [key,value] of a){
     if(!b.has(key)||value===b.get(key))continue;
     const x=JSON.parse(value),y=JSON.parse(b.get(key));let found=false;
     for(const field of fields){
       if(JSON.stringify(x[field])===JSON.stringify(y[field]))continue;
       found=true;increment(counts,field);
       if(field==='owner')increment(owners,roleClass(x.owner)+'_to_'+roleClass(y.owner));
       if(field==='acl'){
         const form=z=>z===null?'null':Array.isArray(z)?(z.length?'explicit':'empty'):'other';
         increment(aclForms,form(x.acl)+'_to_'+form(y.acl));
       }
     }
     if(!found||Object.keys({...x,...y}).some(k=>!keys.includes(k)&&!fields.includes(k)&&JSON.stringify(x[k])!==JSON.stringify(y[k])))unclassified++;
   }
   if(Object.keys(counts).length||unclassified)report[section]={fields:counts,ownerClasses:owners,aclForms,unclassified};
 }
 return report;
}
export function describeGrantorDifferences(source,target){
 const g=reviewedGlobals(source);
 const a=keyed(g.internal,['role','member']);
 const b=keyed(target.membership_edges,['role','member']);
 const transitions={};
 for(const [key,value] of a){
   if(!b.has(key))continue;
   const x=JSON.parse(value),y=JSON.parse(b.get(key));
   if(x.grantor!==y.grantor)increment(transitions,roleClass(x.grantor)+'_to_'+roleClass(y.grantor));
 }
 return transitions;
}
