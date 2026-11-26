/** Owner-private, local-only PostG4 archive + ACL recovery diagnostic.
 * Never accepts a DB URL, never restores to an existing cluster.
 * No commercial acceptance; tenant authorization and grantor review remain.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openCatalog} from './v1-g5-private-acl-capture.mjs';
import {verifyOffsiteArchive} from './v1-postg4-offsite-restore.mjs';
import {buildDetachedRoleSql,compareObjectCatalogs,compareDetachedGlobals,canonicalAcl,describeObjectDifferences,describeGrantorDifferences} from './lib/v1-g5-detached-acl-recovery.mjs';

const ZIP_HASH='37153472fe8e8f8fb8cd1e934305aafe2db38ff1679e0b463f67eec1511ab62f';
const INNER_HASH='6d29bc341de17dea0f1bb7851a3fe35367d68fbaf3743683499db094152e7a6e';
const SQL_BLOB='25ddef2fe539c7b840288e15e943bfbb4ee6210b';
const BIN='/usr/lib/postgresql/18/bin';
const OWNER='fawri_owner';
const RUNTIME=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'];
const ADMIN='g5_detached_bootstrap';
const sha=(b,a='sha256')=>createHash(a).update(b).digest('hex');
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const safeEnv=Object.freeze({PATH:'/usr/bin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8'});
const archiveName='fawri-v1-production-postg4-rls-postg4.pgcustom.enc';
const captureSql=fileURLToPath(new URL('../docs/final-audit/evidence/sql/P0-V1-G5-POSTG4-ACL-RECOVERY-CATALOG-HELD.sql',import.meta.url));

function readPrivateFile(file,limit){
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const s=fs.fstatSync(fd);
    check(s.isFile()&&s.size>0&&s.size<=limit,'G5_LOCAL_INPUT_FILE');
    return fs.readFileSync(fd);
  }finally{fs.closeSync(fd);}
}

// Only explicitly reviewed common role labels may leave the private runner.
// Unknown role identifiers, command text, catalog entries and SQL stay private.
const diagnosticRoleLabels=new Set([
  'neon_superuser','cloud_admin','neon_admin','neon','postgres',
  'pg_database_owner','pg_read_all_stats','pg_read_all_data','pg_write_all_data',
  'fawri_owner','fawri_restricted_runtime','fawri_auth_issuer',
  'fawri_operator_issuer','fawri_cashier_retirement_writer'
]);
export function missingRoleHint(stderr){
  if(typeof stderr!=='string')return null;
  const match=stderr.match(/(?:^|\n)(?:pg_restore: error: could not execute query: )?ERROR:\s+role "((?:[^"\n]|"")*)" does not exist\s*(?:\r?\n|$)/);
  if(!match)return null;
  const name=match[1].replaceAll('""','"');
  return diagnosticRoleLabels.has(name)?name:'OTHER_PRIVATE_ROLE';
}

function run(exe,args,{input,env=safeEnv,timeout=30000,stage}={}){
  const r=spawnSync(exe,args,{input,env,timeout,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
  if(r.error||r.status!==0){
    const err=r.stderr?.toString('utf8')??'';
    const hint=/role .+ does not exist/i.test(err)?'_ROLE_MISSING':
      /extension .+ is not available/i.test(err)?'_EXTENSION_MISSING':
      /permission denied/i.test(err)?'_PERMISSION_DENIED':
      /password authentication failed/i.test(err)?'_AUTH_FAILED':'';
    if(stage==='G5_LOCAL_ARCHIVE_RESTORE'&&hint==='_ROLE_MISSING'){
      console.log('G5_LOCAL_MISSING_ROLE_HINT '+(missingRoleHint(err)??'UNPARSED'));
    }
    r.stdout?.fill(0);r.stderr?.fill(0);
    throw new Error(stage+hint);
  }
  r.stderr?.fill(0);
  return r.stdout;
}
const zipReader=[
  'import io,sys,zipfile',
  'with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:',
  '    entries=z.infolist()',
  "    expected={'manifest.json','fawri-v1-production-postg4-rls-postg4.pgcustom.enc'}",
  "    if len(entries)!=2 or set(x.filename for x in entries)!=expected: raise ValueError('zip scope')",
  "    if any(x.is_dir() or x.file_size>800000 for x in entries): raise ValueError('zip size')",
  "    if z.testzip() is not None: raise ValueError('zip crc')",
  '    sys.stdout.buffer.write(z.read(sys.argv[1]))'
].join('\n');
export function loadPrivatePair(zipFile,aclFile,env){
  check(env.FAWRI_G5_PRIVATE_RECOVERY_APPROVED==='1'&&!env.CI&&!env.GITHUB_ACTIONS,'G5_LOCAL_PRIVATE_APPROVAL_REQUIRED');
  check(typeof env.FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256==='string'&&
    /^[a-f0-9]{64}$/.test(env.FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256),'G5_LOCAL_ACL_HASH_REQUIRED');
  const zip=readPrivateFile(zipFile,671797);
  check(zip.length===671797&&sha(zip)===ZIP_HASH,'G5_LOCAL_ZIP_HASH');
  const sidecar=readPrivateFile(aclFile,8*1024*1024+128);
  check(sha(sidecar)===env.FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256,'G5_LOCAL_ACL_HASH');
  const opened=openCatalog(sidecar,env.FAWRI_G5_PRIVATE_ACL_PASSPHRASE);
  check(opened.referenced_archive_cipher_sha256===INNER_HASH,'G5_LOCAL_PAIR_REFERENCE');
  const entry=name=>run('/usr/bin/python3',['-I','-c',zipReader,name],{input:zip,stage:'G5_LOCAL_ZIP_READ'});
  const manifest=JSON.parse(entry('manifest.json').toString('utf8'));
  const plain=verifyOffsiteArchive(manifest,entry(archiveName),env.FAWRI_G5_OFFSITE_PASSPHRASE,INNER_HASH);
  return {catalog:opened.catalog,plain};
}

// Check all role references in the authenticated catalog, without printing
// private identifiers. This is a preflight, not proof that the older dump
// has no additional role dependencies.
export const providerPlaceholders=Object.freeze(['neon_superuser','cloud_admin']);
export function catalogRoleReferences(c){
  const refs=new Set();
  const add=name=>{
    check(typeof name==='string'&&name.length>0,'G5_LOCAL_CATALOG_ROLE_REFERENCE_INVALID');
    if(name!=='PUBLIC')refs.add(name);
  };
  const decode=name=>{
    if(name.startsWith('"')){
      check(/^"(?:[^"]|"")*"$/.test(name),'G5_LOCAL_CATALOG_ACL_ROLE_SYNTAX');
      return name.slice(1,-1).replaceAll('""','"');
    }
    check(!name.includes('"'),'G5_LOCAL_CATALOG_ACL_ROLE_SYNTAX');
    return name;
  };
  for(const r of c.roles)add(r.rolname);
  for(const e of c.membership_edges)for(const k of ['role','member','grantor'])add(e[k]);
  const rows=[c.database_acl,...['schemas','relations','column_acls','routines','types','default_acls','policy_roles','extensions'].flatMap(k=>c[k])];
  for(const row of rows){
    if(Object.hasOwn(row,'owner'))add(row.owner);
    if(Object.hasOwn(row,'creator'))add(row.creator);
    if(Object.hasOwn(row,'roles'))for(const name of row.roles)add(name);
    if(Object.hasOwn(row,'acl')&&row.acl!==null){
      for(const item of canonicalAcl(row.acl)){
        const m=item.match(/^("(?:[^"]|"")*"|[^="]*)=[A-Za-z*]*\/("(?:[^"]|"")*"|[^/"=]+)$/);
        check(m,'G5_LOCAL_CATALOG_ACL_ROLE_SYNTAX');
        if(m[1]!=='')add(decode(m[1]));
        add(decode(m[2]));
      }
    }
  }
  return refs;
}
export function unresolvedCatalogRoleCount(c,existing){
  const names=new Set(existing);
  return [...catalogRoleReferences(c)].filter(n=>!names.has(n)).length;
}

function phase(msg){console.log(msg);}
export function recoverLocal({catalog,plain}){
  check(process.platform==='linux'&&typeof process.getuid==='function'&&process.getuid()!==0,'G5_LOCAL_NONROOT_LINUX_REQUIRED');
  const sql=fs.readFileSync(captureSql);
  check(sha(Buffer.concat([Buffer.from('blob '+sql.length+'\0'),sql]),'sha1')===SQL_BLOB,'G5_LOCAL_CAPTURE_SQL_PIN');
  for(const cmd of ['initdb','pg_ctl','pg_restore','psql','postgres']){
    const v=run(path.join(BIN,cmd),['--version'],{stage:'G5_LOCAL_PG18_BINARY'});
    check(/PostgreSQL\) 18(?:\.|\s)/.test(v.toString()),'G5_LOCAL_PG18_VERSION');
  }
  const roles=buildDetachedRoleSql(catalog);
  const prev=process.umask(0o077);
  const dir=fs.mkdtempSync('/tmp/fawri-acl-recovery-');
  const data=path.join(dir,'data'),socket=path.join(dir,'s'),archive=path.join(dir,'archive'),
    pwfile=path.join(dir,'bootstrap.pw');
  const password=randomBytes(32).toString('hex');
  const common={...safeEnv,HOME:dir,PGHOST:socket,PGPORT:'5432',
    PGPASSFILE:path.join(dir,'no-pgpass'),PGCONNECT_TIMEOUT:'5'};
  const pg=(cmd,args,options={})=>run(path.join(BIN,cmd),args,{env:{...safeEnv,HOME:dir},...options});
  const conn=(name,db='fawri')=>({...common,PGUSER:name,PGDATABASE:db,
    PGPASSWORD:name===ADMIN?password:roles.credentials[name]});
  const psql=(name,query,{db='fawri',stage='G5_LOCAL_SQL',variables=[]}={})=>
    pg('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...variables],{input:query,env:conn(name,db),stage});
  let initialized=false;
  try{
    fs.mkdirSync(socket,{mode:0o700});
    fs.writeFileSync(pwfile,password+'\n',{flag:'wx',mode:0o600});
    pg('initdb',['-D',data,'-U',ADMIN,'--auth-local=scram-sha-256','--auth-host=scram-sha-256',
      '--pwfile='+pwfile,'--no-locale','--encoding=UTF8'],{stage:'G5_LOCAL_INITDB'});
    initialized=true;fs.unlinkSync(pwfile);
    pg('pg_ctl',['-D',data,'-l',path.join(dir,'server.log'),'-o',
      "-c listen_addresses='' -c unix_socket_directories="+socket+
      " -c unix_socket_permissions=0700 -c log_statement=none -c log_min_error_statement=panic",
      '-w','start'],{stage:'G5_LOCAL_START'});
    const guard=psql(ADMIN,"SELECT current_setting('server_version_num')::int/10000=18 AND current_setting('listen_addresses')='' AND inet_server_addr() IS NULL AND current_user='g5_detached_bootstrap';",{db:'postgres',stage:'G5_LOCAL_SOCKET_GUARD'});
    check(guard.toString().trim()==='t','G5_LOCAL_SOCKET_GUARD');
    phase('G5_LOCAL_NEW_PG18_SOCKET_ONLY');
    psql(ADMIN,roles.sql,{db:'postgres',stage:'G5_LOCAL_RECREATE_GLOBALS'});
    // Only the two provider names actually observed missing are admitted.
    // No dynamic role creation, no provider membership and no LOGIN.
    for(const role of providerPlaceholders){
      psql(ADMIN,'CREATE ROLE '+role+' NOLOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0;', {db:'postgres',stage:'G5_LOCAL_PROVIDER_PLACEHOLDER_CREATE'});
    }
    const providerGuardSql="SELECT count(*)=2 AND bool_and(NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=0 AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid)) FROM pg_roles r WHERE rolname IN ('neon_superuser','cloud_admin');";
    const providerCheck=()=>check(psql(ADMIN,providerGuardSql,{db:'postgres',stage:'G5_LOCAL_PROVIDER_PLACEHOLDER_GUARD'}).toString().trim()==='t','G5_LOCAL_PROVIDER_PLACEHOLDER_GUARD');
    providerCheck();
    phase('G5_LOCAL_PROVIDER_NAME_ONLY_PLACEHOLDERS_VERIFIED');
    const existing=JSON.parse(psql(ADMIN,"SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles;",{db:'postgres',stage:'G5_LOCAL_ROLE_PREFLIGHT'}).toString());
    const unresolved=unresolvedCatalogRoleCount(catalog,existing);
    console.log('G5_LOCAL_CATALOG_ROLE_PREFLIGHT_UNRESOLVED '+unresolved);
    check(unresolved===0,'G5_LOCAL_UNREVIEWED_CATALOG_ROLE');
    fs.writeFileSync(archive,plain,{flag:'wx',mode:0o600});plain.fill(0);
    pg('pg_restore',['-w','--create','--exit-on-error','--dbname=postgres',archive],
      {env:conn(ADMIN,'postgres'),timeout:180000,stage:'G5_LOCAL_ARCHIVE_RESTORE'});
    providerCheck();
    fs.unlinkSync(archive);
    phase('G5_LOCAL_ARCHIVE_OWNER_ACL_RESTORED');
    const raw=psql(OWNER,sql,{stage:'G5_LOCAL_TARGET_CATALOG',variables:['-v','g5_capture_approved=1']});
    let target;
    try{target=JSON.parse(raw.toString('utf8'));}finally{raw.fill(0);}
    const objects=compareObjectCatalogs(catalog,target);
    const globals=compareDetachedGlobals(catalog,target);
    console.log('G5_LOCAL_CATALOG_COUNTS '+JSON.stringify({objects,globals}));
    console.log('G5_LOCAL_PARITY_FIELDS '+JSON.stringify({objects:describeObjectDifferences(catalog,target),grantorTransitions:describeGrantorDifferences(catalog,target)}));
    for(const name of RUNTIME){
      const q=psql(name,"SELECT current_user=session_user AND current_database()='fawri' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) FROM pg_roles WHERE rolname=current_user;",{stage:'G5_LOCAL_RUNTIME_LOGIN'});
      check(q.toString().trim()==='t','G5_LOCAL_RUNTIME_LOGIN_ATTRIBUTES');
    }
    phase('G5_LOCAL_THREE_RESTRICTED_LOGINS_VERIFIED');
    check(objects.exact&&globals.portableMatch,'G5_LOCAL_PARITY_REVIEW_REQUIRED');
    phase('G5_LOCAL_OBJECT_ACL_EXACT_AND_PORTABLE_GLOBALS_MATCH; GRANTOR_REVIEW_AND_TENANT_SCOPE_PROOF_PENDING');
  }finally{
    plain.fill(0);process.umask(prev);
    if(initialized){
      const status=spawnSync(path.join(BIN,'pg_ctl'),['-D',data,'status'],{env:safeEnv,stdio:'ignore',timeout:10000});
      if(status.status===0){
        const stopped=spawnSync(path.join(BIN,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{env:safeEnv,stdio:'ignore',timeout:30000});
        check(stopped.status===0,'G5_LOCAL_STOP_FAILED_PRIVATE_DIRECTORY_RETAINED');
      }else check(status.status===3,'G5_LOCAL_STATUS_UNKNOWN_PRIVATE_DIRECTORY_RETAINED');
    }
    fs.rmSync(dir,{recursive:true,force:true});
    phase('G5_LOCAL_DISPOSABLE_CLEANUP_COMPLETE');
  }
}
function main(){
  const [zip,acl,...extra]=process.argv.slice(2);
  check(zip&&acl&&extra.length===0,'G5_LOCAL_EXPECTS_TWO_ENCRYPTED_FILES');
  const pair=loadPrivatePair(zip,acl,process.env);
  try{phase('G5_LOCAL_BOTH_ARCHIVES_AUTHENTICATED');recoverLocal(pair);}
  finally{pair.plain.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main();}
  catch(e){
    const m=typeof e?.message==='string'&&/^G5_LOCAL_[A-Z0-9_]+$/.test(e.message)?e.message:'G5_LOCAL_PRIVATE_RECOVERY_REFUSED';
    console.error(m);process.exitCode=1;
  }
}
