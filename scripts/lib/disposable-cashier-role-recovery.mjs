import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {assertDisposablePostgres} from './disposable-postgres-test-guard.mjs';

// Owned offline rehearsal only. No hosted/general role provisioning interface.
// Database dumps preserve object ownership/ACL, never role passwords.
const ownerRoles=['fawri_cashier_retirement_owner','fawri_cashier_enrollment_owner','fawri_cashier_receipt_owner'];
const roleKeys=['rolname','rolcanlogin','rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolinherit','rolreplication'];
export function validateCashierRecoveryRolePlan(plan,manifest){
 const callers=[manifest?.primaryRole,manifest?.authRole,manifest?.reviewerRole];
 const names=[...ownerRoles,...callers];
 assert.equal(plan?.format,'fawri-disposable-cashier-role-recovery-v1','reviewed recovery format required');
 assert.ok(names.every(x=>typeof x==='string'&&/^[a-z][a-z0-9_]{1,62}$/.test(x))&&new Set(names).size===6,'distinct safe role identities required');
 assert.ok(/^[0-9]{10,}$/.test(plan.sourceSystemIdentifier),'source cluster identity required');
 assert.ok(/^[a-f0-9]{64}$/.test(plan.sourceContainerId)&&/^[a-f0-9]{32}$/.test(plan.sourceRunId),'source owned attestation required');
 assert.ok(Array.isArray(plan.roles)&&plan.roles.length===6,'exact reviewed role inventory required');
 assert.deepEqual(plan.roles.map(x=>x.rolname).sort(),[...names].sort(),'unexpected or missing role');
 assert.deepEqual(plan.memberships,[],'role membership needs separate review');
 for(const row of plan.roles){
  assert.deepEqual(Object.keys(row).sort(),[...roleKeys].sort(),'only reviewed flags; never passwords or arbitrary SQL');
  assert.equal(row.rolcanlogin,callers.includes(row.rolname),'owner/caller LOGIN contract');
  for(const key of roleKeys.filter(x=>!['rolname','rolcanlogin'].includes(x)))assert.equal(row[key],false,'unsafe recovery role flags');
 }
 return{names,callers};
}
function localUrl(raw,expectedRole){
 const url=new URL(raw);
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='127.0.0.1'&&url.port==='5432'&&url.pathname==='/fawri_ci'&&!url.search&&!url.hash,'owned loopback identity required');
 assert.equal(decodeURIComponent(url.username),expectedRole,'role URL binding required');
 return url;
}
let recoveryStage='guard';
async function main(){
 await assertDisposablePostgres(); // Before pg import, DB connection or proof I/O.
 assert.equal(process.env.FAWRI_AUDIT_FRESH_CLUSTER_RECOVERY,'1','fresh recovery is explicit');
 recoveryStage='read-reviewed-plan';
 const phase=process.argv[2];assert.ok(['bootstrap','finalize'].includes(phase));
 const manifestFile='/restore-proof/financial-proposals.json';
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const plan=JSON.parse(fs.readFileSync('/restore-proof/cashier-roles.json','utf8'));
 const {names,callers}=validateCashierRecoveryRolePlan(plan,manifest);
 const attestation=JSON.parse(fs.readFileSync(process.env.FAWRI_DISPOSABLE_PG_ATTESTATION,'utf8'));
 assert.notEqual(attestation.containerId,plan.sourceContainerId,'source container cannot be reused');
 assert.notEqual(process.env.FAWRI_DISPOSABLE_PG_RUN_ID,plan.sourceRunId,'source run cannot be reused');
 recoveryStage='target-identity';
 const {Client}=await import('pg');
 const root=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
 try{
  await root.connect();
  assert.equal((await root.query('SELECT session_user::text AS login')).rows[0].login,'fawri_ci');
  const targetSystemIdentifier=(await root.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier;
  assert.notEqual(targetSystemIdentifier,plan.sourceSystemIdentifier,'independent PostgreSQL cluster required');
  if(phase==='bootstrap'){
   recoveryStage='empty-independent-target';
   assert.equal((await root.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])',[names])).rows[0].n,0,'all reviewed source roles must initially be absent');
   assert.equal((await root.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")).rows[0].n,0,'bootstrap target must be empty');
   const keys=['primaryUrl','authUrl','reviewerUrl'];
   for(const [i,key]of keys.entries())localUrl(manifest[key],callers[i]);
   const passwords=new Map(callers.map(name=>[name,randomBytes(32).toString('hex')]));
   recoveryStage='create-safe-roles';
   await root.query('BEGIN');
   try{
    for(const role of plan.roles){
     const credentials=role.rolcanlogin?"LOGIN PASSWORD '"+passwords.get(role.rolname)+"'":"NOLOGIN";
     await root.query('CREATE ROLE "'+role.rolname+'" '+credentials+' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION');
    }
    await root.query('COMMIT');
   }catch(error){await root.query('ROLLBACK');throw error;}
   // New SCRAM passwords are generated independently, never copied from source.
   recoveryStage='rotated-login-checks';
   for(const [i,key]of keys.entries()){
    const old=new Client({connectionString:manifest[key],connectionTimeoutMillis:5000});
    try{await assert.rejects(old.connect(),e=>e.code==='28P01');}finally{await old.end();}
    const url=localUrl(manifest[key],callers[i]);url.password=passwords.get(callers[i]);manifest[key]=url.toString();
    const fresh=new Client({connectionString:manifest[key],connectionTimeoutMillis:5000});
    try{await fresh.connect();assert.equal((await fresh.query('SELECT session_user::text AS login')).rows[0].login,callers[i]);}finally{await fresh.end();}
   }
   manifest.recovery={sourceSystemIdentifier:plan.sourceSystemIdentifier,targetSystemIdentifier,sourceContainerId:plan.sourceContainerId,targetContainerId:attestation.containerId,rolesInitiallyAbsent:6,rolesCreated:6,oldCredentialsRejected:3,newLoginsVerified:3,rolePasswordsCopied:false};
  }else{
   recoveryStage='discard-restored-scope-leases';
   assert.equal(manifest.recovery?.targetSystemIdentifier,targetSystemIdentifier);
   // Scope leases are volatile PID/XID bindings, not financial/audit evidence.
   // Restore must never reactivate a source cluster's transient authorizations.
   const scopesBefore=(await root.query('SELECT count(*)::int AS n FROM fawri_security.transaction_scopes')).rows[0].n;
   assert.ok(scopesBefore>0,'restore must include source scope leases for this negative proof');
   await root.query('TRUNCATE fawri_security.transaction_scopes');
   const scopesAfter=(await root.query('SELECT count(*)::int AS n FROM fawri_security.transaction_scopes')).rows[0].n;
   assert.equal(scopesAfter,0);
   recoveryStage='restored-role-flags';
   const restored=(await root.query('SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[names])).rows;
   assert.deepEqual(restored,[...plan.roles].sort((a,b)=>a.rolname<b.rolname?-1:a.rolname>b.rolname?1:0));
   for(const owner of ownerRoles)assert.equal((await root.query('SELECT rolpassword IS NULL AS no_password FROM pg_authid WHERE rolname=$1',[owner])).rows[0].no_password,true);
   Object.assign(manifest.recovery,{scopeLeasesDiscarded:scopesBefore,scopeLeasesAfterReset:0,ownerPasswordsAbsent:true});
  }
  fs.writeFileSync(manifestFile,JSON.stringify(manifest),{mode:0o600});
  console.log('P0_FRESH_CLUSTER_ROLE_RECOVERY '+JSON.stringify({phase,rolesCreated:manifest.recovery.rolesCreated,oldCredentialsRejected:manifest.recovery.oldCredentialsRejected,newLoginsVerified:manifest.recovery.newLoginsVerified,distinctCluster:true,scopeLeasesAfterReset:manifest.recovery.scopeLeasesAfterReset??null,hosted:false}));
 }finally{await root.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{const sqlState=/^[0-9A-Z]{5}$/.test(error?.code||'')?error.code:'unavailable';console.error('Owned offline cashier role recovery refused stage='+recoveryStage+' sqlState='+sqlState);process.exitCode=1;});
}
