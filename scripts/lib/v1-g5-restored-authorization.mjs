
// This proof is deliberately separate from raw ACL parity. It uses real
// restored schema, new synthetic rows, and separate local authenticated logins.
// No source/host connection; every row is destroyed with the disposable cluster.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';

const TENANT='fawri_restricted_runtime', AUTH='fawri_auth_issuer', OP='fawri_operator_issuer';
const ADMIN='g5_detached_bootstrap', OWNER='fawri_owner';
const check=(v,code)=>{if(!v)throw new Error(code);};
const q=s=>"'"+s.replaceAll("'","''")+"'";
const str=b=>b.toString('utf8').trim();
export function localSession({bin,env}){
  check(env.PGHOST.startsWith('/tmp/fawri-acl-recovery-')&&env.PGDATABASE==='fawri'&&env.PGUSER===TENANT,'G5_LOCAL_PROOF_SESSION_GUARD');
  const proc=spawn(bin,['-X','-w','-qAt','-v','ON_ERROR_STOP=1'],{env,stdio:['pipe','pipe','pipe']});
  proc.stderr.resume();
  const reader=createInterface({input:proc.stdout,crlfDelay:Infinity});
  let pending=null,closed=false;
  function fail(){
    closed=true;
    if(pending){clearTimeout(pending.timer);const reject=pending.reject;pending=null;reject(new Error('G5_LOCAL_TENANT_SESSION_FAILED'));}
  }
  proc.on('error',fail);proc.on('exit',fail);proc.stdin.on('error',fail);
  reader.on('line',line=>{
    if(!pending)return;
    if(line===pending.marker){
      const {resolve,timer,lines}=pending;clearTimeout(timer);pending=null;resolve(lines.join('\n').trim());
    }else if(pending.lines.length<10&&line.length<4096)pending.lines.push(line);
    else {fail();proc.kill();}
  });
  return {
    query(sql){
      check(!pending&&!closed,'G5_LOCAL_TENANT_SESSION_UNAVAILABLE');
      return new Promise((resolve,reject)=>{
        const marker='G5_END_'+randomBytes(16).toString('hex');
        const timer=setTimeout(()=>{fail();proc.kill();},15000);
        pending={resolve,reject,marker,timer,lines:[]};
        proc.stdin.write(sql+'\n\\echo '+marker+'\n');
      });
    },
    async close(){
      if(closed)return;
      const done=new Promise(resolve=>{proc.once('close',resolve);});
      proc.stdin.end('\\q\n');
      const timer=setTimeout(()=>proc.kill('SIGKILL'),2000);
      await done;clearTimeout(timer);reader.close();
    }
  };
}
export async function proveRestoredAuthorization({psql,conn,bin}){
  // Explicit guard: only the freshly created socket-only recovery server.
  check(str(psql(ADMIN,"SELECT current_user='g5_detached_bootstrap' AND current_database()='fawri' AND inet_server_addr() IS NULL AND current_setting('listen_addresses')='';",{stage:'G5_LOCAL_PROOF_GUARD'}))==='t','G5_LOCAL_PROOF_GUARD');
  const capsSql="SELECT has_schema_privilege(session_user,'public','CREATE'),has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE'),has_function_privilege(session_user,(SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fawri_security' AND p.proname='issue_scope' AND pg_get_function_identity_arguments(p.oid) IS NOT NULL LIMIT 1),'EXECUTE'),has_function_privilege(session_user,'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE'),has_table_privilege(session_user,'public.products','SELECT'),has_table_privilege(session_user,'public.merchants','SELECT');";
  for(const [role,expected] of [[TENANT,'f|f|f|f|t|f'],[AUTH,'f|t|t|f|f|t'],[OP,'f|f|f|t|f|f']]){
    check(str(psql(role,capsSql,{stage:'G5_LOCAL_RESTORED_ROLE_CAPABILITIES'}))===expected,'G5_LOCAL_RESTORED_ROLE_CAPABILITIES_MISMATCH');
  }
  console.log('G5_LOCAL_RESTORED_ROLE_CAPABILITIES_VERIFIED');
  // Canonical issue_scope needs cross-backend xid visibility at its trusted
  // function owner. Do not recreate the hosted provider edge; only add
  // the already reviewed stats capability to the detached owner if needed.
  check(str(psql(ADMIN,"SELECT pg_get_userbyid(proowner)='fawri_owner' AND prosecdef FROM pg_proc WHERE oid='fawri_security.issue_scope(name,integer,bigint,text)'::regprocedure;",{stage:'G5_LOCAL_SCOPE_OWNER_GUARD'}))==='t','G5_LOCAL_SCOPE_OWNER_GUARD');
  const stats="SELECT pg_has_role('fawri_owner','pg_read_all_stats','USAGE');";
  if(str(psql(ADMIN,stats,{stage:'G5_LOCAL_SCOPE_STATS_CHECK'}))!=='t'){
    psql(ADMIN,'GRANT pg_read_all_stats TO fawri_owner;',{stage:'G5_LOCAL_SCOPE_STATS_LOCAL_ONLY'});
    check(str(psql(ADMIN,stats,{stage:'G5_LOCAL_SCOPE_STATS_CHECK'}))==='t','G5_LOCAL_SCOPE_STATS_UNAVAILABLE');
    console.log('G5_LOCAL_TRUSTED_OWNER_STATS_SUBSTITUTE_APPLIED');
  }
  for(const role of [TENANT,AUTH,OP]){
    check(str(psql(role,"SELECT NOT pg_has_role(session_user,'pg_read_all_stats','MEMBER') AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user));",{stage:'G5_LOCAL_PROOF_NO_RUNTIME_MEMBERSHIP'}))==='t','G5_LOCAL_PROOF_NO_RUNTIME_MEMBERSHIP');
  }
  const token=randomBytes(12).toString('hex'),a='g5-'+token+'-a',b='g5-'+token+'-b';
  const pa=a+'-product',pb=b+'-product';
  // Random synthetic IDs and phone values; no existing customer rows selected.
  const phone=()=>'+964'+String(randomBytes(5).readUIntBE(0,5)%10000000000).padStart(10,'0');
  psql(OWNER,"BEGIN; INSERT INTO public.accounts(id,kind,phone,password_hash) VALUES ("+q(a)+",'merchant',"+q(phone())+",'synthetic-not-login'),("+q(b)+",'merchant',"+q(phone())+",'synthetic-not-login'); INSERT INTO public.merchants(id,account_id,owner_name,store_name,activity_type) VALUES ("+q(a)+","+q(a)+",'G5','G5 A','test'),("+q(b)+","+q(b)+",'G5','G5 B','test'); INSERT INTO public.products(id,merchant_id,name) VALUES ("+q(pa)+","+q(a)+",'G5 A'),("+q(pb)+","+q(b)+",'G5 B'); COMMIT;",{stage:'G5_LOCAL_SYNTHETIC_TENANTS_INSERT'});
  const count="SELECT count(*) FROM public.products WHERE id IN ("+q(pa)+","+q(pb)+");";
  check(str(psql(AUTH,"SELECT count(*) FROM public.merchants WHERE id IN ("+q(a)+","+q(b)+");",{stage:'G5_LOCAL_AUTH_MERCHANT_READ'}))==='2','G5_LOCAL_AUTH_MERCHANT_READ');
  const tenant=localSession({bin,env:conn(TENANT)});
  try{
    check(await tenant.query(count)==='0','G5_LOCAL_UNSCOPED_PRODUCTS_VISIBLE');
    for(const [merchant,product,foreign] of [[a,pa,pb],[b,pb,pa]]){
      const identity=await tenant.query("BEGIN; SELECT pg_backend_pid()::text||'|'||txid_current()::text;");
      check(/^\d+\|\d+$/.test(identity),'G5_LOCAL_TENANT_IDENTITY');
      const [pid,xid]=identity.split('|');
      psql(AUTH,"SELECT fawri_security.issue_scope('fawri_restricted_runtime'::name,"+pid+"::integer,"+xid+"::bigint,"+q(merchant)+"::text);",{stage:'G5_LOCAL_AUTH_ISSUE_SCOPE'});
      check(await tenant.query(count)==='1','G5_LOCAL_SCOPED_PRODUCT_COUNT');
      check(await tenant.query("SELECT count(*) FROM public.products WHERE id="+q(product)+";")==='1','G5_LOCAL_OWN_PRODUCT_NOT_VISIBLE');
      check(await tenant.query("SELECT count(*) FROM public.products WHERE id="+q(foreign)+";")==='0','G5_LOCAL_FOREIGN_PRODUCT_VISIBLE');
      check(await tenant.query("ROLLBACK; "+count)==='0','G5_LOCAL_SCOPE_SURVIVED_TRANSACTION');
    }
    console.log('G5_LOCAL_TWO_SYNTHETIC_TENANTS_PRODUCT_SCOPE_VERIFIED');
  }finally{await tenant.close();}
}
