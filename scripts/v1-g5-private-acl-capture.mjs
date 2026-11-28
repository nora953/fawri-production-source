/** HELD: owner-operated private G5 catalog capture. No scheduling or provider writes.
 * Run outside CI, with private credentials supplied to this process only.
 * The encrypted sidecar references the existing archive but does NOT prove temporal parity.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const HOST = "ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech";
const ARCHIVE = "6d29bc341de17dea0f1bb7851a3fe35367d68fbaf3743683499db094152e7a6e";
const SQL_BLOB = "25ddef2fe539c7b840288e15e943bfbb4ee6210b";
const MAGIC = Buffer.from("FAWRI-G5-ACL-V1\0");
const LIMIT = 8 * 1024 * 1024;
const check = (ok, code) => { if (!ok) throw new Error(code); };
const sha = (bytes, alg="sha256") => createHash(alg).update(bytes).digest("hex");

export function privateClientEnv(env) {
  check(env.FAWRI_G5_PRIVATE_ACL_CAPTURE_APPROVED === "1" && !env.CI && !env.GITHUB_ACTIONS,
    "G5_PRIVATE_CAPTURE_NOT_APPROVED_OR_CI");
  const url = new URL(env.FAWRI_G5_PRIVATE_OWNER_URL || "");
  check(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === HOST
    && ["", "5432"].includes(url.port) && decodeURIComponent(url.username) === "fawri_owner"
    && decodeURIComponent(url.pathname) === "/fawri" && url.password && !url.hash,
    "G5_PRIVATE_CAPTURE_WRONG_TARGET");
  const keys = [...url.searchParams.keys()];
  check(keys.length === new Set(keys).size && keys.every(k=>["sslmode","channel_binding"].includes(k))
    && url.searchParams.get("sslmode") === "verify-full"
    && (!url.searchParams.has("channel_binding") || url.searchParams.get("channel_binding")==="require"),
    "G5_PRIVATE_CAPTURE_TLS_REQUIRED");
  return { PATH:env.PATH, HOME:env.HOME, PGHOST:HOST, PGPORT:"5432", PGDATABASE:"fawri",
    PGUSER:"fawri_owner", PGPASSWORD:decodeURIComponent(url.password), PGSSLMODE:"verify-full",
    PGSSLROOTCERT:"system", PGCHANNELBINDING:"require", PGCONNECT_TIMEOUT:"10",
    PGOPTIONS:"-c default_transaction_read_only=on" };
}
function validateCatalog(c) {
  check(c && c.format==="fawri-g5-postg4-acl-catalog-v1" && c.database==="fawri"
    && c.server_major===18 && c.read_only===true && Number.isFinite(Date.parse(c.captured_at)),
    "G5_PRIVATE_CATALOG_SCOPE");
  for (const key of ["roles","membership_edges","schemas","relations","column_acls","routines",
    "types","default_acls","policy_roles","extensions"]) check(Array.isArray(c[key]),"G5_PRIVATE_CATALOG_SHAPE");
  check(c.roles.length===5 && c.membership_edges.length===5
    && c.relations.filter(r=>r.schema==="public" && ["r","p"].includes(r.kind)).length===102
    && c.relations.filter(r=>r.schema==="public" && r.rls===true).length===84
    && c.policy_roles.length===83 && c.column_acls.length===25 && c.default_acls.length===2,
    "G5_PRIVATE_CATALOG_DRIFT");
  for (const name of ["fawri_restricted_runtime","fawri_auth_issuer","fawri_operator_issuer"]) {
    const r=c.roles.find(x=>x.rolname===name);
    check(r && r.rolcanlogin===true && ["rolsuper","rolinherit","rolcreaterole","rolcreatedb","rolreplication","rolbypassrls"]
      .every(k=>r[k]===false) && !c.membership_edges.some(x=>x.member===name),"G5_PRIVATE_RUNTIME_ROLE_DRIFT");
  }
}
function key(pass,salt) {
  check(typeof pass==="string" && pass.length>=24,"G5_PRIVATE_PASSPHRASE_REQUIRED");
  return scryptSync(pass,salt,32,{N:16384,r:8,p:1});
}
export function sealCatalog(c,pass) {
  validateCatalog(c);
  const payload=Buffer.from(JSON.stringify({format:"fawri-g5-private-acl-sidecar-v1",
    referenced_archive_cipher_sha256:ARCHIVE, archive_acl_parity_verified:false, restore_accepted:false,
    catalog:c}));
  let k;
  try {
    check(payload.length<=LIMIT,"G5_PRIVATE_CATALOG_TOO_LARGE");
    const salt=randomBytes(16), nonce=randomBytes(12);
    k=key(pass,salt);
    const cipher=createCipheriv("aes-256-gcm",k,nonce);
    cipher.setAAD(MAGIC);
    const body=Buffer.concat([cipher.update(payload),cipher.final()]);
    return Buffer.concat([MAGIC,salt,nonce,cipher.getAuthTag(),body]);
  } finally { payload.fill(0); k?.fill(0); }
}
export function openCatalog(bytes,pass) {
  check(Buffer.isBuffer(bytes) && bytes.length>MAGIC.length+44 && bytes.length<=LIMIT+128
    && bytes.subarray(0,MAGIC.length).equals(MAGIC),"G5_PRIVATE_HEADER_INVALID");
  let i=MAGIC.length;
  const salt=bytes.subarray(i,i+=16),nonce=bytes.subarray(i,i+=12),tag=bytes.subarray(i,i+=16);
  const k=key(pass,salt); let plain;
  try {
    const d=createDecipheriv("aes-256-gcm",k,nonce);
    d.setAAD(MAGIC);d.setAuthTag(tag);
    plain=Buffer.concat([d.update(bytes.subarray(i)),d.final()]);
    const o=JSON.parse(plain.toString("utf8"));
    check(o.format==="fawri-g5-private-acl-sidecar-v1" && o.referenced_archive_cipher_sha256===ARCHIVE
      && o.archive_acl_parity_verified===false && o.restore_accepted===false,"G5_PRIVATE_SIDECAR_SCOPE");
    validateCatalog(o.catalog);return o;
  } finally { k.fill(0);plain?.fill(0); }
}
function readBounded(file) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const st=fs.fstatSync(fd);check(st.isFile()&&st.size>0&&st.size<=LIMIT+128,"G5_PRIVATE_FILE_INVALID");return fs.readFileSync(fd);}
  finally {fs.closeSync(fd);}
}
function exclusiveWrite(file,data) {
  const fd=fs.openSync(file,"wx",0o600);
  let success=false;
  try {fs.writeFileSync(fd,data);fs.fsyncSync(fd);success=true;}
  finally {try {fs.closeSync(fd);} finally {if(!success)fs.unlinkSync(file);}}
}
function capture(file,env) {
  const client=privateClientEnv(env);
  const pass=env.FAWRI_G5_PRIVATE_ACL_PASSPHRASE;
  check(typeof pass==="string"&&pass.length>=24,"G5_PRIVATE_PASSPHRASE_REQUIRED");
  const sql=fs.readFileSync(fileURLToPath(new URL("../docs/final-audit/evidence/sql/P0-V1-G5-POSTG4-ACL-RECOVERY-CATALOG-HELD.sql",import.meta.url)));
  check(sha(Buffer.concat([Buffer.from("blob "+sql.length+"\0"),sql]),"sha1")===SQL_BLOB,"G5_PRIVATE_SQL_PIN_MISMATCH");
  const v=spawnSync("psql",["--version"],{env:{PATH:client.PATH,HOME:client.HOME},timeout:5000,encoding:"utf8"});
  check(v.status===0 && /^psql \(PostgreSQL\) 18(?:\.|\s)/.test(v.stdout),"G5_PRIVATE_PG18_CLIENT_REQUIRED");
  const r=spawnSync("psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-v","g5_capture_approved=1"],{
    input:sql,env:client,timeout:35000,maxBuffer:LIMIT,stdio:["pipe","pipe","pipe"]});
  try {
    check(r.status===0 && !r.error,"G5_PRIVATE_CAPTURE_FAILED");
    const catalog=JSON.parse(r.stdout.toString("utf8"));
    const sealed=sealCatalog(catalog,pass);
    assert.deepEqual(openCatalog(sealed,pass).catalog,catalog);
    exclusiveWrite(file,sealed);
    check(readBounded(file).equals(sealed),"G5_PRIVATE_CIPHERTEXT_READBACK_FAILED");
    console.log("G5_PRIVATE_ACL_CIPHERTEXT_LOCAL_ONLY "+sha(sealed));
  } finally {r.stdout?.fill(0);r.stderr?.fill(0);}
}
function main() {
  const [mode,file,...extra]=process.argv.slice(2);
  check(file && extra.length===0,"G5_PRIVATE_USAGE");
  if(mode==="capture") capture(file,process.env);
  else if(mode==="verify"){
    check(!process.env.CI&&!process.env.GITHUB_ACTIONS,"G5_PRIVATE_VERIFY_NOT_CI");
    const bytes=readBounded(file);
    check(sha(bytes)===process.env.FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256,"G5_PRIVATE_INDEPENDENT_HASH_REQUIRED");
    openCatalog(bytes,process.env.FAWRI_G5_PRIVATE_ACL_PASSPHRASE);
    console.log("G5_PRIVATE_ACL_AUTHENTICATED; ARCHIVE_ACL_PARITY_AND_RESTORE_NOT_ACCEPTED");
  }else throw new Error("G5_PRIVATE_USAGE");
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main();}catch{console.error("G5_PRIVATE_ACL_REFUSED_OR_FAILED");process.exitCode=1;}
}
