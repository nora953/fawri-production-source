import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hostOwnedPg18DockerUser } from './v1-pg18-backup-host-user.mjs';

test('production PG18 exporter uses the nonroot host runner identity', () => {
  assert.equal(hostOwnedPg18DockerUser(() => 1001, () => 121), '--user=1001:121');
  for (const pair of [[()=>0,()=>121],[()=>1001,()=>0],
    [undefined,()=>121],[()=>1001,undefined]]) {
    assert.throws(() => hostOwnedPg18DockerUser(...pair),
      /V1_PG18_BACKUP_RUNNER_IDENTITY_UNSAFE/);
  }
});

test('real disposable Docker PG18 dump remains owned/readable by the runner', () => {
  if (process.env.FAWRI_V1_PG18_DOCKER_E2E !== '1') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fawri-v1-pg18-uid-'));
  try {
    const dump = path.join(root, 'synthetic.pgcustom');
    const volume = root + ':/safe-out';
    const vars = ['PGHOST=127.0.0.1','PGPORT=5432',
      'PGUSER=fawri_ci','PGPASSWORD=fawri_ci','PGDATABASE=fawri_ci',
      'PGSSLMODE=disable'];
    const args = [
      'run','--rm','--network=host',hostOwnedPg18DockerUser(),
      '-v',volume,...vars.flatMap(x=>['-e',x]),
      'postgres:18-alpine','pg_dump','--format=custom','--no-password',
      '--file=/safe-out/synthetic.pgcustom',
    ];
    const result = spawnSync('docker',args,{
      encoding:'utf8',timeout:120000,
      env:{PATH:process.env.PATH,HOME:process.env.HOME},
    });
    assert.equal(result.status,0,
      'disposable PG18 Docker export must complete with nonroot identity');
    const stat=fs.statSync(dump);
    assert.equal(stat.uid, process.getuid());
    assert.equal(stat.gid, process.getgid());
    assert.equal(stat.mode & 0o077,0,'archive remains private');
    assert.equal(fs.readFileSync(dump).subarray(0,5).toString(),'PGDMP');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
