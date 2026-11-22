#!/usr/bin/env node
/**
 * V1 G5 catalog-media offsite archive preparation.
 *
 * Built-in Node 22 only. AES-256-GCM authenticated streaming container with
 * scrypt-derived key; neither plaintext media nor secrets go to stdout.
 * Export is default DENY against production unless explicitly owner-approved.
 * Restore is deliberately restricted to a disposable /tmp fixture root,
 * never Render's /var/data mount. This does NOT upload anything offsite.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const MAGIC = Buffer.from('FWMED1\0\0', 'binary');
const HEADER_SIZE = 36;
const TAG_SIZE = 16;
const MAX_FILE = 8 * 1024 * 1024;
const NAME = /^merchant\/[0-9a-f]{32}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const PROD_SOURCE = '/var/data/fawri/catalog-media';

function fail(code) { throw new Error(code); }
function inside(root, candidate) {
  return candidate.startsWith(root + path.sep) && candidate !== root;
}
function assertRealTree(folder, allowAbsent = false) {
  const absolute = path.resolve(folder);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const st = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!st && allowAbsent) break;
    if (!st || !st.isDirectory() || st.isSymbolicLink()) fail('MEDIA_PATH_NOT_REAL_DIRECTORY');
  }
  return absolute;
}
function getFixtureRoot() {
  const root = process.env.FAWRI_V1_MEDIA_DISPOSABLE_ROOT;
  if (!root) fail('MEDIA_DISPOSABLE_ROOT_REQUIRED');
  const absolute = assertRealTree(root);
  if (!absolute.startsWith(os.tmpdir() + path.sep)) fail('MEDIA_FIXTURE_ROOT_NOT_TEMPORARY');
  return absolute;
}
function requirePassphrase() {
  const p = process.env.FAWRI_V1_MEDIA_ARCHIVE_PASSPHRASE;
  if (!p || p.length < 20) fail('MEDIA_ARCHIVE_SECRET_REQUIRED');
  return p;
}
function assertSource(source) {
  const resolved = assertRealTree(source);
  if (resolved === PROD_SOURCE) {
    if (process.env.FAWRI_V1_MEDIA_EXPORT_APPROVED !== '1') {
      fail('PRODUCTION_MEDIA_EXPORT_OWNER_APPROVAL_REQUIRED');
    }
  } else {
    const root = getFixtureRoot();
    if (!inside(root, resolved)) fail('MEDIA_SOURCE_OUTSIDE_FIXTURE_ROOT');
  }
  return resolved;
}
function assertArchiveOutput(source, output) {
  const resolved = path.resolve(output);
  const parent = assertRealTree(path.dirname(resolved));
  if (inside(source, resolved) || inside(PROD_SOURCE, resolved) ||
      resolved.startsWith('/var/data/') || resolved === PROD_SOURCE ||
      !inside(os.tmpdir(), resolved) || parent === source) {
    fail('MEDIA_ARCHIVE_OUTPUT_MUST_BE_EPHEMERAL_AND_OUTSIDE_SOURCE');
  }
  return resolved;
}
function walk(root, current = root, out = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) fail('MEDIA_SYMLINK_FORBIDDEN');
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile()) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (!NAME.test(rel)) fail('MEDIA_UNKNOWN_FILE_LAYOUT');
      const st = fs.lstatSync(full);
      if (!st.isFile() || st.size > MAX_FILE) fail('MEDIA_UNSUPPORTED_FILE');
      out.push({rel,full,size:st.size,mtime:st.mtimeMs});
    } else fail('MEDIA_NONREGULAR_FILE');
  }
  return out.sort((a,b)=>a.rel.localeCompare(b.rel));
}
function framing(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  if (json.length > 2048) fail('MEDIA_FRAME_TOO_LARGE');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([length,json]);
}
async function *records(files) {
  let bytes=0;
  for(const item of files) {
    const st = fs.lstatSync(item.full);
    if (!st.isFile() || st.isSymbolicLink() ||
        st.size !== item.size || st.mtimeMs !== item.mtime) fail('MEDIA_SOURCE_CHANGED');
    yield framing({type:'file',path:item.rel,size:item.size});
    const digest=crypto.createHash('sha256');
    let read=0;
    for await (const chunk of fs.createReadStream(item.full,{flags:fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW})) {
      read+=chunk.length; digest.update(chunk); yield chunk;
    }
    const after = fs.lstatSync(item.full);
    if(read!==item.size || after.mtimeMs!==item.mtime ||
      after.size!==item.size || !after.isFile() || after.isSymbolicLink()) {
      fail('MEDIA_SOURCE_CHANGED_DURING_EXPORT');
    }
    yield digest.digest();
    bytes += read;
  }
  yield framing({type:'end',count:files.length,bytes});
}
function writeAll(fd,b) {
  let offset=0;
  while(offset<b.length){
    const n=fs.writeSync(fd,b,offset,b.length-offset);
    if(n<=0) fail('MEDIA_WRITE_FAILED');
    offset+=n;
  }
}
async function exportMedia(source, output) {
  const realSource=assertSource(source);
  const realOutput=assertArchiveOutput(realSource,output);
  const files=walk(realSource);
  if(!files.length) fail('MEDIA_SOURCE_EMPTY_NOT_ACCEPTED');
  const pass=requirePassphrase();
  const salt=crypto.randomBytes(16), iv=crypto.randomBytes(12);
  const key=crypto.scryptSync(pass,salt,32);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  let fd;
  try{
    fd=fs.openSync(realOutput,fs.constants.O_WRONLY|fs.constants.O_CREAT|
      fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    writeAll(fd,Buffer.concat([MAGIC,salt,iv]));
    for await(const chunk of records(files)) writeAll(fd,cipher.update(chunk));
    writeAll(fd,cipher.final());
    writeAll(fd,cipher.getAuthTag());
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=undefined;
    const stat=fs.statSync(realOutput);
    if((stat.mode&0o077)!==0) fail('MEDIA_ARCHIVE_MODE_NOT_PRIVATE');
    process.stdout.write(JSON.stringify({state:'ENCRYPTED_EXPORT_CREATED_LOCAL_ONLY',
      objectCount:files.length,archiveBytes:stat.size,offsite:false,restoreAccepted:false})+'\n');
  }catch(error){
    if(fd!==undefined) fs.closeSync(fd);
    fs.rmSync(realOutput,{force:true});
    throw error;
  }
}
class Parser {
  constructor(stage) {
    this.stage=stage;this.buf=Buffer.alloc(0);this.state='len';
    this.current=null;this.fd=null;this.remaining=0;
    this.hash=null;this.files=0;this.bytes=0;
  }
  feed(data) {
    this.buf=Buffer.concat([this.buf,data]);
    while(true){
      if(this.state==='end'){
        if(this.buf.length) fail('MEDIA_TRAILING_DATA');return;
      }
      if(this.state==='len'){
        if(this.buf.length<4)return;
        this.headerLen=this.buf.readUInt32BE(0);this.buf=this.buf.subarray(4);
        if(this.headerLen<2||this.headerLen>2048) fail('MEDIA_INVALID_FRAME');
        this.state='header';
      }
      if(this.state==='header'){
        if(this.buf.length<this.headerLen)return;
        let h;try{h=JSON.parse(this.buf.subarray(0,this.headerLen).toString('utf8'));}
        catch{fail('MEDIA_INVALID_FRAME')}
        this.buf=this.buf.subarray(this.headerLen);
        if(h.type==='end'){
          if(h.count!==this.files||h.bytes!==this.bytes)fail('MEDIA_MANIFEST_MISMATCH');
          this.state='end';continue;
        }
        if(h.type!=='file'||typeof h.path!=='string'||!NAME.test(h.path)||
           !Number.isSafeInteger(h.size)||h.size<0||h.size>MAX_FILE)fail('MEDIA_INVALID_FILE_RECORD');
        this.current=path.join(this.stage,...h.path.split('/'));
        fs.mkdirSync(path.dirname(this.current),{recursive:true,mode:0o700});
        this.fd=fs.openSync(this.current,fs.constants.O_WRONLY|fs.constants.O_CREAT|
          fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
        this.remaining=h.size;this.hash=crypto.createHash('sha256');
        this.state='data';
      }
      if(this.state==='data'){
        const n=Math.min(this.buf.length,this.remaining);
        if(n){const part=this.buf.subarray(0,n);writeAll(this.fd,part);
          this.hash.update(part);this.buf=this.buf.subarray(n);this.remaining-=n;
          this.bytes+=n;}
        if(this.remaining>0)return;
        fs.fsyncSync(this.fd);fs.closeSync(this.fd);this.fd=null;
        this.state='hash';
      }
      if(this.state==='hash'){
        if(this.buf.length<32)return;
        const expected=this.buf.subarray(0,32);
        this.buf=this.buf.subarray(32);
        if(!crypto.timingSafeEqual(this.hash.digest(),expected))fail('MEDIA_OBJECT_HASH_MISMATCH');
        this.files++;this.state='len';
      }
    }
  }
  finish(){
    if(this.state!=='end'||this.buf.length||this.fd!==null)fail('MEDIA_INCOMPLETE_ARCHIVE');
  }
  close(){if(this.fd!==null){fs.closeSync(this.fd);this.fd=null;}}
}
async function restoreMedia(archive,target) {
  const root=getFixtureRoot(),dest=path.resolve(target);
  if(!inside(root,dest)||dest.startsWith('/var/data/'))fail('MEDIA_RESTORE_TARGET_NOT_DISPOSABLE');
  assertRealTree(path.dirname(dest));
  if(fs.existsSync(dest))fail('MEDIA_RESTORE_REFUSES_EXISTING_TARGET');
  const archivePath=path.resolve(archive);
  if(archivePath.startsWith('/var/data/'))fail('MEDIA_ARCHIVE_NOT_ALLOWED');
  const stat=fs.statSync(archivePath);
  if(!stat.isFile()||stat.size<HEADER_SIZE+TAG_SIZE+20)fail('MEDIA_ARCHIVE_INVALID');
  const fd=fs.openSync(archivePath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  let header,tag;
  try{
    header=Buffer.alloc(HEADER_SIZE);tag=Buffer.alloc(TAG_SIZE);
    if(fs.readSync(fd,header,0,HEADER_SIZE,0)!==HEADER_SIZE ||
       fs.readSync(fd,tag,0,TAG_SIZE,stat.size-TAG_SIZE)!==TAG_SIZE)fail('MEDIA_ARCHIVE_INVALID');
  }finally{fs.closeSync(fd)}
  if(!header.subarray(0,8).equals(MAGIC))fail('MEDIA_ARCHIVE_VERSION_UNSUPPORTED');
  const key=crypto.scryptSync(requirePassphrase(),header.subarray(8,24),32);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(24,36));
  decipher.setAuthTag(tag);
  const stage=fs.mkdtempSync(path.join(root,'.media-restore-stage-'));
  const parser=new Parser(stage);
  try{
    const input=fs.createReadStream(archivePath,{start:HEADER_SIZE,end:stat.size-TAG_SIZE-1});
    for await(const chunk of input) parser.feed(decipher.update(chunk));
    parser.feed(decipher.final()); // no files can be accepted before GCM authentication
    parser.finish();
    if(fs.existsSync(dest))fail('MEDIA_RESTORE_TARGET_RACE');
    fs.renameSync(stage,dest);
    process.stdout.write(JSON.stringify({state:'ISOLATED_MEDIA_RESTORE_VERIFIED',
      files:parser.files,bytes:parser.bytes,productionUntouched:true})+'\n');
  }catch(e){parser.close();fs.rmSync(stage,{recursive:true,force:true});throw e;}
}
async function main(){
  const [mode,p1,p2,...extra]=process.argv.slice(2);
  if(extra.length||!p1||!p2)fail('MEDIA_USAGE_EXPORT_SOURCE_OUTPUT_OR_RESTORE_ARCHIVE_TARGET');
  if(mode==='export')await exportMedia(p1,p2);
  else if(mode==='restore')await restoreMedia(p1,p2);
  else fail('MEDIA_UNKNOWN_MODE');
}
main().catch(e=>{console.error('V1_MEDIA_G5_NOT_ACCEPTED:'+String(e.code||e.message).replace(/[^A-Z0-9_]/gi,'_').slice(0,90));process.exitCode=1;});
