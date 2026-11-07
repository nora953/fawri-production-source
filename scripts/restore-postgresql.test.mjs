import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";

function run(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/restore-postgresql.mjs", ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

const baseArgs = [
  "--backup",
  "missing.dump",
  "--manifest",
  "missing.json",
  "--verify-sql",
  "select count(*) from restore_drill_records",
  "--expect",
  "3",
];

test("PostgreSQL restore drill is fail-closed without the explicit disposable guard", () => {
  const url = "postgresql://fixture_user:do-not-log-secret@127.0.0.1:5432/fawri_restore_target";
  const result = run(["--url", url, ...baseArgs], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: "0",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit disposable guard/i);
  assert.equal(result.stderr.includes("do-not-log-secret"), false);
});

test("PostgreSQL restore rejects remote targets and never echoes credentials", () => {
  const url =
    "postgresql://" +
    "fixture_user:" +
    "do-not-log-secret@" +
    "db.example.replit.com:5432/fawri_restore_target";
  const result = run(["--url", url, ...baseArgs], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /loopback-only and disposable/i);
  assert.equal(result.stderr.includes("db.example.replit.com"), false);
  assert.equal(result.stderr.includes("do-not-log-secret"), false);
});

test("PostgreSQL restore verification rejects multi-statement SQL before restore", () => {
  const url = "postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target";
  const args = [
    "--url",
    url,
    "--backup",
    "missing.dump",
    "--manifest",
    "missing.json",
    "--verify-sql",
    "select 1; drop table restore_drill_records",
    "--expect",
    "1",
  ];
  const result = run(args, { FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /one read-only SELECT/i);
  assert.equal(result.stderr.includes("fixture_password"), false);
});

for (const suffix of ['?hostaddr=192.0.2.1', '?service=unexpected', '#unexpected']) {
  test('PostgreSQL restore rejects URL override options ' + suffix, () => {
    const url = 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target' + suffix;
    const result = run(['--url', url, ...baseArgs], { FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /URL options are forbidden/i);
    assert.equal(result.stderr.includes('fixture_password'), false);
  });
}

test("PostgreSQL drill strips inherited libpq routing environment before tool invocation", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fawri-pg-tool-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binaryRoot = path.join(root, 'bin');
  fs.mkdirSync(binaryRoot);
  function fake(name, body) {
    fs.writeFileSync(path.join(binaryRoot, name), '#!' + process.execPath + '\n' +
      'if (Object.keys(process.env).some(k => k.startsWith("PG") && k !== "PGPASSWORD")) process.exit(77);\n' + 'if (process.argv.some(a => a.includes("fixture_password"))) process.exit(79);\n' + body, { mode: 0o700 });
  }
  const dump = path.join(root, 'safe.dump');
  const manifest = path.join(root, 'manifest.json');
  fs.writeFileSync(dump, 'safe-fixture');
  fs.writeFileSync(manifest, JSON.stringify({ format: 'fawri-postgresql-backup-v2', security_model:'preserve-owners-acls',role_bootstrap:'preprovision-global-roles-before-restore', size: 12, sha256: createHash('sha256').update('safe-fixture').digest('hex') }));
  fake('pg_restore', 'if(process.argv.includes("--no-owner")||process.argv.includes("--no-privileges"))process.exit(78);process.exit(0);');
  fake('psql', 'process.stdout.write("3\\n");');
  const args = ['--url', 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target', '--backup', dump, '--manifest', manifest, '--verify-sql', 'select count(*) from restore_drill_records', '--expect', '3'];
  const result = run(args, { PATH: binaryRoot, PGHOSTADDR: '192.0.2.1', PGSERVICE: 'unexpected', PGOPTIONS: '-c search_path=unexpected', FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: '1' });
  assert.equal(result.status, 0, result.stderr);
});

for (const sql of ['select write_side_effect()', 'select count(*) from records for update', "select count(*) from records where write_side_effect()", 'select * into new_table from records']) {
  test('restore verification refuses arbitrary SELECT effects: ' + sql, () => {
    const args = ['--url', 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target', '--backup', 'missing.dump', '--manifest', 'missing.json', '--verify-sql', sql, '--expect', '3'];
    const result = run(args, { FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /one read-only SELECT/i);
  });
}

test('legacy data-only backup is rejected before invoking restore',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-legacy-manifest-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dump=path.join(root,'legacy.dump'),manifest=path.join(root,'legacy.json');fs.writeFileSync(dump,'legacy');
 fs.writeFileSync(manifest,JSON.stringify({format:'fawri-postgresql-backup-v1',size:6,sha256:createHash('sha256').update('legacy').digest('hex')}));
 const result=run(['--url','postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target','--backup',dump,'--manifest',manifest,'--verify-sql','select count(*) from restore_drill_records','--expect','3'],{PATH:root,FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE:'1'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/owner\/ACL-preserving v2 backup required/);assert.doesNotMatch(result.stderr,/pg_restore could not start/);
});

test('FIELD002 precommercial restore gate accepts zero notifications and rejects fixtures or absent table',t=>{
  for (const scenario of [
    {name:'empty',count:'0',pass:true},
    {name:'historical fixtures',count:'28',pass:false},
    {name:'missing notifications table',count:'missing',pass:false},
  ]) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-field002-restore-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const bin=path.join(root,'bin');fs.mkdirSync(bin);
    function fake(name,body){
      fs.writeFileSync(path.join(bin,name),'#!'+process.execPath+'\n'+body,{mode:0o700});
    }
    const dump=path.join(root,'safe.dump');
    const manifest=path.join(root,'manifest.json');
    fs.writeFileSync(dump,'safe-fixture');
    fs.writeFileSync(manifest,JSON.stringify({
      format:'fawri-postgresql-backup-v2',
      security_model:'preserve-owners-acls',
      role_bootstrap:'preprovision-global-roles-before-restore',
      size:12,sha256:createHash('sha256').update('safe-fixture').digest('hex')
    }));
    fake('pg_restore','process.exit(0);');
    fake('psql',`
      const args=process.argv.slice(2);
      const q=args[args.indexOf('-c')+1];
      if (q==='SELECT count(*) FROM public.notifications'){
        if (process.env.FIELD002_MOCK_NOTICE_COUNT==='missing'){
          process.stderr.write('relation does not exist');
          process.exit(2);
        }
        process.stdout.write(process.env.FIELD002_MOCK_NOTICE_COUNT+'\\n');
      } else {
        process.stdout.write('3\\n');
      }
    `);
    const result=run([
      '--url','postgresql://fixture_user:do-not-log-secret@127.0.0.1:5432/fawri_restore_target',
      '--backup',dump,'--manifest',manifest,
      '--verify-sql','select count(*) from restore_drill_records','--expect','3',
      '--field002-require-empty-notifications','1'
    ],{
      PATH:bin,
      FIELD002_MOCK_NOTICE_COUNT:scenario.count,
      FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE:'1',
    });
    assert.equal(result.status===0,scenario.pass,scenario.name+': '+result.stderr);
    if(!scenario.pass)assert.match(result.stderr,/FIELD002 release-fixture exclusion failed|psql failed/i);
    assert.equal(result.stderr.includes('do-not-log-secret'),false);
  }
});

test('FIELD002 release-fixture flag cannot be disabled with a non-1 value',()=>{
  const result=run([
    '--url','postgresql://fixture_user:do-not-log-secret@127.0.0.1:5432/fawri_restore_target',
    ...baseArgs,'--field002-require-empty-notifications','0'
  ],{FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE:'1'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/FIELD002 release-fixture check requires explicit value 1/);
  assert.doesNotMatch(result.stderr,/do-not-log-secret/);
});
