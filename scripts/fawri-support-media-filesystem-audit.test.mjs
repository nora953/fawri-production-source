import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Actual filesystem producer bodies, real scratch files; no DB/router/grants,
// concurrent process, hosted disk durability or image decoding certification.
const source=fs.readFileSync(new URL('../artifacts/api-server/src/services/postgresSupportImageAuthority.ts',import.meta.url),'utf8');
const authority=fs.readFileSync(new URL('../artifacts/api-server/src/services/postgresSupportAuthority.ts',import.meta.url),'utf8');
const errorStart=authority.indexOf('export class SupportPostgresError'),errorEnd=authority.indexOf('\nfunction text(',errorStart);
const start=source.indexOf('function safeStoragePath('),end=source.indexOf('\nexport async function reconcileOrphanSupportImagesPostgres',start);
assert.ok(start>0&&end>start&&errorStart>=0&&errorEnd>errorStart);
const code=stripTypeScriptTypes(authority.slice(errorStart,errorEnd).replace('export ','')+'\n'+source.slice(start,end),{mode:'transform'});
function fixture(t){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-audit-support-files-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=path.join(temp,'support-images');
 const api=vm.runInNewContext(`(()=>{${code};return {safeStoragePath,ensureSupportImageDirectory,persistAuthorizedSupportImage};})()`,{fs,path,crypto,process,SUPPORT_IMAGE_DIR:root,text:v=>String(v??'').trim()},{timeout:2000});
 return {temp,root,...api};
}
const denied=fn=>assert.throws(fn,error=>error.code==='SUPPORT_IMAGE_STORAGE_INVALID');
test('stored keys cannot traverse directories or introduce extra path segments',t=>{
 const f=fixture(t);
 for(const key of ['../outside','ticket/../outside','ticket/../../outside','ticket/..','ticket/.','/etc/passwd/extra'])denied(()=>f.safeStoragePath(key));
 assert.equal(f.safeStoragePath('ticket/image.png'),path.join(f.root,'ticket','image.png'));
});
test('ticket identifiers reject path separators and dot-directory aliases',t=>{
 const f=fixture(t);
 for(const id of ['','..','.','../outside','a/b','a\\b'])denied(()=>f.ensureSupportImageDirectory(id));
 assert.equal(fs.existsSync(f.root),false);
});
test('actual image directories remain private and inside their configured root',t=>{
 const f=fixture(t),dir=f.ensureSupportImageDirectory('synthetic-ticket');
 assert.equal(fs.statSync(f.root).mode&0o777,0o700);assert.equal(fs.statSync(dir).mode&0o777,0o700);
 assert.equal(fs.realpathSync(path.dirname(dir)),fs.realpathSync(f.root));
});
test('a pre-existing ticket symlink cannot redirect writes into another directory',t=>{
 const f=fixture(t);f.ensureSupportImageDirectory('safe');
 const outside=path.join(f.temp,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.root,'symlink-ticket'));
 denied(()=>f.ensureSupportImageDirectory('symlink-ticket'));
 assert.deepEqual(fs.readdirSync(outside),[]);
});
test('atomic image publication preserves bytes, private mode and refuses collisions',t=>{
 const f=fixture(t),dir=f.ensureSupportImageDirectory('synthetic-ticket'),target=path.join(dir,'synthetic-image.png');
 const bytes=Buffer.from('synthetic filesystem audit bytes');f.persistAuthorizedSupportImage(target,bytes);
 assert.deepEqual(fs.readFileSync(target),bytes);assert.equal(fs.statSync(target).mode&0o777,0o600);
 assert.deepEqual(fs.readdirSync(dir),['synthetic-image.png']);
 assert.throws(()=>f.persistAuthorizedSupportImage(target,Buffer.from('must not overwrite')),e=>e.code==='SUPPORT_IMAGE_STORAGE_COLLISION');
 assert.deepEqual(fs.readFileSync(target),bytes);
});
