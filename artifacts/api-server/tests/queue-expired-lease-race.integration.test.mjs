import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname));
assert.equal(database.pathname, '/fawri_ci');
Object.assign(process.env, {
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: 'required',
  FAWRI_META_TOKEN_KEY_ID: 'queue-lease-regression',
  FAWRI_META_TOKEN_KEY_BASE64: Buffer.alloc(32, 19).toString('base64'),
});
const { pool } = await import('@workspace/db');
const queue = await import('../src/services/postgresDurableJobQueue.js');

test('expired job settlement revalidates the lease and execution attempt', { timeout: 60000 }, async (t) => {
  const merchantId = `lease-regression-${crypto.randomUUID()}`;
  const phone = '+1555' + String(crypto.randomInt(0, 10000000)).padStart(7, '0');
  await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','active')", [merchantId, phone]);
  await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Lease regression','retail','approved','approved')", [merchantId]);
  for (const scenario of [
    { change: 'renew', action: 'retry' },
    { change: 'renew', action: 'complete' },
    { change: 'renew', action: 'dead_letter' },
    { change: 'reclaim', action: 'retry' },
    { change: 'none', action: 'retry' },
  ]) {
    await t.test(`${scenario.change} during ${scenario.action} reconciliation`, async () => {
      const type = `audit.lease.${crypto.randomUUID()}`;
      const { job } = await queue.enqueueDurableJobAuthoritative({ type, merchantId, dedupeKey: type, payload: { merchant_id: merchantId }, maxAttempts: 3 }, new Date(Date.now() - 120000));
      await pool.query("UPDATE background_jobs SET status='processing', attempts=1, locked_by='original-worker', locked_at=now()-interval '60 seconds', lease_expires_at=now()-interval '1 second', lease_generation=1, updated_at=now() WHERE id=$1", [job.id]);
      await pool.query("INSERT INTO job_attempts(id,job_id,attempt_number,worker_id,lease_generation,status,started_at) VALUES($1,$2,1,'original-worker',1,'processing',now()-interval '60 seconds')", [`attempt-${crypto.randomUUID()}`, job.id]);
      let reconciled = 0;
      const worker = queue.startDurableJobWorkerAuthoritative({
        workerId: 'regression-reconciler', pollIntervalMs: 3600000,
        handlers: { [type]: async () => { throw new Error('must not execute fixture'); } },
        async reconcileExpiredJob(expired) {
          assert.equal(expired.id, job.id);
          reconciled++;
          if (scenario.change === 'renew') {
            await pool.query("UPDATE background_jobs SET lease_expires_at=now()+interval '5 minutes',locked_at=now(),updated_at=now() WHERE id=$1", [job.id]);
          } else if (scenario.change === 'reclaim') {
            // Same worker ID, but a newer execution attempt: the old decision is stale.
            await pool.query('UPDATE background_jobs SET attempts=2,lease_generation=2 WHERE id=$1', [job.id]);
          }
          return scenario.action === 'complete'
            ? { action: 'complete', result: { synthetic: true } }
            : { action: scenario.action, code: 'SYNTHETIC_RECONCILIATION' };
        },
      });
      try { await worker.runOnce(); } finally { worker.stop(); }
      const row = (await pool.query('SELECT status,locked_by,attempts FROM background_jobs WHERE id=$1', [job.id])).rows[0];
      assert.equal(reconciled, 1);
      assert.equal(row.status, scenario.change === 'none' ? 'retry' : 'processing');
      assert.equal(row.locked_by, scenario.change === 'none' ? null : 'original-worker');
      assert.equal(row.attempts, scenario.change === 'reclaim' ? 2 : 1);
      const attempt = (await pool.query('SELECT status FROM job_attempts WHERE job_id=$1 AND attempt_number=1', [job.id])).rows[0];
      assert.equal(attempt.status, scenario.change === 'none' ? 'timed_out' : 'processing');
    });
  }
});
test.after(() => pool.end());