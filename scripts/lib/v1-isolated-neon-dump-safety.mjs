/**
 * P0-HOSTED-RECOVERY isolated provider exit artifact guard (NO live secrets).
 * Target is a known disposable child, never the root production endpoint.
 */
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes,scryptSync} from 'node:crypto';

export const NEON_ISOLATED_TARGET=Object.freeze({
  project_id:'crimson-cherry-65705041',
  branch_id:'br-rough-boat-b947xiir',
  endpoint_host:'ep-steep-star-b97qa95j.c-7.eu-central-1.aws.neon.tech',
  database:'fawri',
  role:'fawri_v1_backup_reader',
  synthetic_rows:3,
  synthetic_sum:606,
  synthetic_md5:'3e2688f4da2e3e49f2bf3cfef1c919c8',
});
const MAGIC=Buffer.from('FAWRI-ENC-V1\0','ascii');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};

export function validateIsolatedDumpUrl(value,{env=process.env}={}){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='nora953/fawri-production-source'||
     env.GITHUB_REF!=='refs/heads/fix/p0-provider-receipt-order-discovery-20261015'||
     env.FAWRI_ALLOW_ISOLATED_NEON_DUMP!=='1'){
    fail('V1_DUMP_NOT_AUTHORIZED_GITHUB_BRANCH');
  }
  let url;
  try{url=new URL(value??'');}catch{fail('V1_DUMP_CONNECTION_SECRET_NOT_CONFIGURED');}
  if(url.protocol!=='postgresql:'&&url.protocol!=='postgres:')fail('V1_DUMP_WRONG_SCHEME');
  if(url.hostname!==NEON_ISOLATED_TARGET.endpoint_host||
     (url.port!==''&&url.port!=='5432')||
     decodeURIComponent(url.username)!==NEON_ISOLATED_TARGET.role||
     decodeURIComponent(url.pathname)!=='/'+NEON_ISOLATED_TARGET.database||
     !url.password||url.hash!==''){
    fail('V1_DUMP_NOT_PINNED_ISOLATED_BRANCH_ENDPOINT');
  }
  const keys=[...url.searchParams.keys()];
  if(keys.some(k=>!['sslmode','channel_binding'].includes(k))||
     keys.length>2||
     !['require','verify-full'].includes(url.searchParams.get('sslmode'))||
     (url.searchParams.has('channel_binding')&&
       url.searchParams.get('channel_binding')!=='require')){
    fail('V1_DUMP_UNSAFE_CONNECTION_OPTIONS');
  }
  return Object.freeze({
    host:url.hostname,
    port:Number(url.port||'5432'),
    database:NEON_ISOLATED_TARGET.database,
    username:NEON_ISOLATED_TARGET.role,
  });
}
function keyFromPassphrase(pass,salt){
  if(typeof pass!=='string'||pass.length<24)
    fail('V1_BACKUP_PASSPHRASE_NOT_SET_OR_TOO_SHORT');
  return scryptSync(pass,salt,32,{N:16384,r:8,p:1});
}
export function sealIsolatedDump(plaintext,passphrase){
  assert.ok(Buffer.isBuffer(plaintext));
  if(plaintext.subarray(0,5).toString()!=='PGDMP')
    fail('V1_BACKUP_NOT_POSTGRES_CUSTOM_ARCHIVE');
  const salt=randomBytes(16),nonce=randomBytes(12);
  const key=keyFromPassphrase(passphrase,salt);
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([MAGIC,salt,nonce,cipher.getAuthTag(),encrypted]);
}
export function openIsolatedDump(encrypted,passphrase){
  assert.ok(Buffer.isBuffer(encrypted));
  if(!encrypted.subarray(0,MAGIC.length).equals(MAGIC)||
     encrypted.length<MAGIC.length+16+12+16+5)
    fail('V1_BACKUP_ENCRYPTED_HEADER_INVALID');
  let i=MAGIC.length;
  const salt=encrypted.subarray(i,i+=16),nonce=encrypted.subarray(i,i+=12),
    tag=encrypted.subarray(i,i+=16),body=encrypted.subarray(i);
  const decipher=createDecipheriv('aes-256-gcm',
    keyFromPassphrase(passphrase,salt),nonce);
  decipher.setAuthTag(tag);
  let plain;
  try{plain=Buffer.concat([decipher.update(body),decipher.final()]);}
  catch{fail('V1_BACKUP_ENCRYPTED_AUTHENTICATION_FAILED');}
  if(plain.subarray(0,5).toString()!=='PGDMP')
    fail('V1_BACKUP_DECRYPTED_CUSTOM_ARCHIVE_INVALID');
  return plain;
}
