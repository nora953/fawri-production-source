import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = 'scripts/v1-production-media-g5-archive.mjs';
const pass='Disposable-only-passphrase-not-for-production-2026';
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-media-g5-'));
  const source=path.join(root,'source');
  const merchant=path.join(source,'merchant','a'.repeat(32));
  fs.mkdirSync(merchant,{recursive:true,mode:0o700});
  return {root,source,merchant,archive:path.join(root,'ciphertext.fwmedia'),
    target:path.join(root,'restored')};
}
function run(args,root,p=pass) {
  return spawnSync(process.execPath,[script,...args],{
    cwd:process.cwd(),encoding:'utf8',
    env:{...process.env,FAWRI_V1_MEDIA_DISPOSABLE_ROOT:root,
      FAWRI_V1_MEDIA_ARCHIVE_PASSPHRASE:p},
    timeout:20000
  });
}
function addMedia(f) {
  const a='11111111-1111-4111-8111-111111111111.png';
  const b='22222222-2222-4222-8222-222222222222.jpg';
  fs.writeFileSync(path.join(f.merchant,a),Buffer.from('fake-merchant-1-photo-png'));
  fs.writeFileSync(path.join(f.merchant,b),Buffer.from('fake-merchant-2-photo-jpg'));
  return [a,b];
}

test('encrypted catalog export -> authenticated isolated restore, private archive and exact bytes',()=>{
  const f=fixture();
  try{
    const [a,b]=addMedia(f);
    const created=run(['export',f.source,f.archive],f.root);
    assert.equal(created.status,0,created.stderr);
    assert.equal(JSON.parse(created.stdout).objectCount,2);
    const buffer=fs.readFileSync(f.archive);
    assert.equal(buffer.subarray(0,8).toString('binary'),'FWMED1\0\0');
    assert.equal(buffer.includes('fake-merchant-1-photo'),false);
    assert.equal(fs.statSync(f.archive).mode & 0o077,0);
    const restored=run(['restore',f.archive,f.target],f.root);
    assert.equal(restored.status,0,restored.stderr);
    assert.equal(JSON.parse(restored.stdout).files,2);
    assert.equal(fs.readFileSync(path.join(f.target,'merchant','a'.repeat(32),a),'utf8'),
      'fake-merchant-1-photo-png');
    assert.equal(fs.readFileSync(path.join(f.target,'merchant','a'.repeat(32),b),'utf8'),
      'fake-merchant-2-photo-jpg');
  }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});

test('tampered ciphertext and wrong secret cannot publish a restore directory',()=>{
  const f=fixture();
  try{
    addMedia(f);
    assert.equal(run(['export',f.source,f.archive],f.root).status,0);
    const tampered=path.join(f.root,'tampered.fwmedia');
    const copy=fs.readFileSync(f.archive);
    copy[Math.floor(copy.length/2)]^=1;
    fs.writeFileSync(tampered,copy);
    const bad=run(['restore',tampered,f.target],f.root);
    assert.notEqual(bad.status,0);
    assert.equal(fs.existsSync(f.target),false);
    const wrong=run(['restore',f.archive,f.target],f.root,'this-is-the-wrong-secret-string-long');
    assert.notEqual(wrong.status,0);
    assert.equal(fs.existsSync(f.target),false);
  }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});

test('backup denies empty media, symlink escapes, unsafe output and overwrite',()=>{
  const f=fixture();
  try{
    const empty=run(['export',f.source,f.archive],f.root);
    assert.notEqual(empty.status,0);
    const [a]=addMedia(f);
    const badOut=run(['export',f.source,path.join(f.source,'leak.fwmedia')],f.root);
    assert.notEqual(badOut.status,0);
    const destination=path.join(f.root,'elsewhere');
    fs.mkdirSync(destination);
    fs.symlinkSync(path.join(f.merchant,a),path.join(f.merchant,
      '33333333-3333-4333-8333-333333333333.png'));
    const sym=run(['export',f.source,f.archive],f.root);
    assert.notEqual(sym.status,0);
    assert.equal(fs.existsSync(f.archive),false);
    fs.rmSync(path.join(f.merchant,'33333333-3333-4333-8333-333333333333.png'));
    assert.equal(run(['export',f.source,f.archive],f.root).status,0);
    fs.mkdirSync(f.target);
    const marker=path.join(f.target,'preserve.txt');
    fs.writeFileSync(marker,'must-survive');
    assert.notEqual(run(['restore',f.archive,f.target],f.root).status,0);
    assert.equal(fs.readFileSync(marker,'utf8'),'must-survive');
    assert.notEqual(run(['export',f.source,f.archive],f.root).status,0);
  }finally{fs.rmSync(f.root,{recursive:true,force:true})}
});
