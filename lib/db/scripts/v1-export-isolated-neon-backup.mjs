/**
 * LIVE hosted export is intentionally restricted to ONE disposable Neon child.
 * No production/staging read, no real merchant data, no credentials in output.
 * GitHub Actions test job needs two user-held encrypted secrets, otherwise FAIL.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {NEON_ISOLATED_TARGET,validateIsolatedDumpUrl,
  sealIsolatedDump,openIsolatedDump}
  from '../../../scripts/lib/v1-isolated-neon-dump-safety.mjs';

const {Client}=pg;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(code){const e=new Error(code);e.code=code;throw e;}
function dockerPg(folder,env,args){
  const cleanEnv={
    PATH:process.env.PATH,HOME:process.env.HOME,
    PGHOST:env.host,PGPORT:String(env.port),PGUSER:env.user,
    PGDATABASE:env.database,PGPASSWORD:env.password,PGSSLMODE:env.sslmode,
  };
  // '-e PG...' forwards environment by variable name, never argv secret.
  const x=spawnSync('docker',[
    'run','--rm','--network','host','--user','0:0',
    '-v',folder+':/safe-out',
    ...['PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE']
      .flatMap(n=>['-e',n]),
    'postgres:18-alpine',...args,
  ],{env:cleanEnv,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(x.error||x.status!==0)fail('V1_BACKUP_POSTGRES18_CLIENT_FAILED');
  return x.stdout??'';
}
const verifySQL=`
 SELECT current_database() AS db,session_user AS sess,
   (SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user) AS bypass_rls,
   (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS superuser,
   (SELECT rolcreaterole FROM pg_roles WHERE rolname=session_user) AS create_role,
   (SELECT rolinherit FROM pg_roles WHERE rolname=session_user) AS inherit_role,
   has_table_privilege(session_user,'fawri_recovery_drill.recovery_proof','SELECT') AS can_read,
   has_table_privilege(session_user,'fawri_recovery_drill.recovery_proof','INSERT') AS can_insert,
   has_table_privilege(session_user,'fawri_recovery_drill.recovery_proof','DELETE') AS can_delete,
   (SELECT COUNT(*)::integer FROM pg_roles
    WHERE rolname IN ('fawri_restricted_runtime','fawri_auth_issuer',
      'fawri_operator_issuer')) AS runtime_roles,
   (SELECT COUNT(*)::integer FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND c.relkind IN ('r','p')) AS relations,
   (SELECT COUNT(*)::integer FROM fawri_recovery_drill.recovery_proof) AS n,
   (SELECT SUM(proof_value)::integer FROM
     fawri_recovery_drill.recovery_proof) AS total,
   (SELECT md5(string_agg(proof_id::text||':'||proof_label||':'||
     proof_value::text,'|' ORDER BY proof_id)) FROM
     fawri_recovery_drill.recovery_proof) AS digest
`;
function verifyFixture(v){
  assert.equal(v.db,NEON_ISOLATED_TARGET.database);
  assert.equal(v.sess,NEON_ISOLATED_TARGET.role);
  for(const privilege of ['bypass_rls','superuser','create_role',
    'inherit_role','can_insert','can_delete'])
    assert.equal(v[privilege],false,'V1_BACKUP_ROLE_OVERPRIVILEGED_'+privilege);
  assert.equal(v.can_read,true,'V1_BACKUP_READER_CANNOT_SELECT');
  assert.equal(v.runtime_roles,0);
  assert.equal(v.relations,1);
  assert.equal(v.n,NEON_ISOLATED_TARGET.synthetic_rows);
  assert.equal(v.total,NEON_ISOLATED_TARGET.synthetic_sum);
  assert.equal(v.digest,NEON_ISOLATED_TARGET.synthetic_md5);
}
async function main(){
  assert.equal(process.argv.length,2);
  const url=process.env.FAWRI_ISOLATED_NEON_DUMP_URL;
  const info=validateIsolatedDumpUrl(url);
  const passphrase=process.env.FAWRI_ISOLATED_BACKUP_PASSPHRASE;
  // Fail before any network if passphrase is absent or insufficient.
  if(!passphrase||passphrase.length<24)fail('V1_BACKUP_PASSPHRASE_REQUIRED');
  const parsed=new URL(url);
  const remote=new Client({connectionString:url,connectionTimeoutMillis:8000});
  let tmp;
  try{
    await remote.connect();
    verifyFixture((await remote.query(verifySQL)).rows[0]);
    await remote.end();
    tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-isolated-export-'));
    const plain=path.join(tmp,'child.pgcustom');
    dockerPg(tmp,{
      host:info.host,port:info.port,user:info.username,
      database:info.database,
      password:decodeURIComponent(parsed.password),sslmode:'require',
    },['pg_dump','--format=custom','--no-password',
      '--file=/safe-out/child.pgcustom']);
    const bytes=fs.readFileSync(plain);
    if(bytes.length<500||bytes.subarray(0,5).toString()!=='PGDMP')
      fail('V1_BACKUP_INVALID_PG_DUMP');
    const archiveList=dockerPg(tmp,{
      host:'127.0.0.1',port:5432,user:'fawri_ci',
      database:'fawri_ci',password:'fawri_ci',sslmode:'disable'
    },['pg_restore','--list','/safe-out/child.pgcustom']);
    if(!archiveList.includes('fawri_recovery_drill')||
       !archiveList.includes('recovery_proof'))
      fail('V1_BACKUP_MISSING_SYNTHETIC_TABLE');
    // Prove the real hosted-child archive can be read on a separate PG18
    // server. The destination is GitHub Actions' disposable local service.
    const localUrl=process.env.DATABASE_URL;
    let lu;
    try{lu=new URL(localUrl??'');}
    catch{fail('V1_BACKUP_RESTORE_LOCAL_DATABASE_NOT_CONFIGURED');}
    if(lu.hostname!=='127.0.0.1'||lu.port!=='5432'||
       lu.pathname!=='/fawri_ci'||lu.username!=='fawri_ci'||
       lu.password!=='fawri_ci'||lu.search||lu.hash)
      fail('V1_BACKUP_RESTORE_NOT_DISPOSABLE_LOCAL_PG18');
    const local={
      host:'127.0.0.1',port:5432,user:'fawri_ci',
      database:'fawri_ci',password:'fawri_ci',sslmode:'disable'
    };
    dockerPg(tmp,local,[
      'pg_restore','--clean','--if-exists','--no-owner','--no-acl',
      '--single-transaction','--exit-on-error','/safe-out/child.pgcustom'
    ]);
    const localClient=new Client({connectionString:localUrl,connectionTimeoutMillis:5000});
    try{
      await localClient.connect();
      const restored=(await localClient.query(
        `SELECT count(*)::integer AS n,sum(proof_value)::integer AS total,
          md5(string_agg(proof_id::text||':'||proof_label||':'||
          proof_value::text,'|' ORDER BY proof_id)) AS digest
          FROM fawri_recovery_drill.recovery_proof`)).rows[0];
      assert.equal(restored.n,NEON_ISOLATED_TARGET.synthetic_rows);
      assert.equal(restored.total,NEON_ISOLATED_TARGET.synthetic_sum);
      assert.equal(restored.digest,NEON_ISOLATED_TARGET.synthetic_md5);
    }finally{await localClient.end().catch(()=>{});}
    const sealed=sealIsolatedDump(bytes,passphrase);
    if(!openIsolatedDump(sealed,passphrase).equals(bytes))
      fail('V1_BACKUP_ENCRYPTED_ROUNDTRIP_MISMATCH');
    const evidenceDir=path.join(root,'lib/db/.v1-neon-export-out');
    fs.mkdirSync(evidenceDir,{recursive:false,mode:0o700});
    const outfile='fawri-v1-isolated-neon-20261114.pgcustom.enc';
    fs.writeFileSync(path.join(evidenceDir,outfile),sealed,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(evidenceDir,'manifest.json'),JSON.stringify({
      format:'fawri-isolated-neon-pgdump-aes256gcm-v1',
      source_project:NEON_ISOLATED_TARGET.project_id,
      source_branch:NEON_ISOLATED_TARGET.branch_id,
      source_host:NEON_ISOLATED_TARGET.endpoint_host,
      target_scope:'SYNTHETIC_BRANCH_ONLY_NOT_PRODUCTION',
      source_schema:'fawri_recovery_drill',
      synthetic_rows:3,synthetic_sum:606,
      source_commit:process.env.GITHUB_SHA??null,
      archive_type:'PostgreSQL18 custom format',
      archived_bytes:bytes.length,
      plaintext_sha256:hash(bytes),
      encrypted_bytes:sealed.length,
      encrypted_sha256:hash(sealed),
      crypto:'AES-256-GCM, scrypt N16384 r8 p1, random salt and nonce',
      secrets_in_artifact:false,
      disposable_local_pg18_restore_verified:true,
      offsite_verified:false,
      production_backup_accepted:false,
    },null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('V1_ISOLATED_NEON_CHILD_ENCRYPTED_PG_DUMP_READY');
    console.log('V1_HOSTED_PRODUCTION_AND_PAYMENT_UNTOUCHED');
  }finally{
    if(!remote._ending)await remote.end().catch(()=>{});
    if(tmp)fs.rmSync(tmp,{recursive:true,force:true});
  }
}
try{await main();}
catch(e){
  // No exception details: provider errors may include connection secrets.
  console.error(e.code&&e.code.startsWith('V1_')?e.code:
    'V1_ISOLATED_NEON_EXPORT_FAILED_CREDENTIALS_REDACTED');
  process.exitCode=1;
}
