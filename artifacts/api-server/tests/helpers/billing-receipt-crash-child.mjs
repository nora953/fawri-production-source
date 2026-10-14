import { assertDisposablePostgres } from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SAAS_BILLING_PROVIDER = 'test_fake';
const { pool } = await import('@workspace/db');
pool.options.max = 1;
pool.on('error', () => {}); // A deliberately terminated owned backend may emit after query rejection.
let handled = false;
async function send(message) {
  if (process.connected) await new Promise(resolve => process.send(message, () => resolve()));
}
process.on('message', async task => {
  if (handled) return;
  handled = true;
  try {
    if (!['saas', 'cashier'].includes(task.kind) || !/^receipt-owned-[a-f0-9-]+$/.test(task.marker)) throw new Error('invalid synthetic child task');
    pool.options.application_name = task.marker;
    if (task.commitAcknowledgmentLoss) {
      if (![1,2].includes(task.commitAcknowledgmentLoss)) throw new Error('invalid synthetic commit boundary');
      let commits = 0;
      pool.on('connect', client => {
        const originalQuery = client.query;
        client.query = function (...args) {
          const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
          if (sql?.trim().toUpperCase() !== 'COMMIT') return originalQuery.apply(this,args);
          return (async () => {
            const result = await originalQuery.apply(this,args);
            commits++;
            if (commits === task.commitAcknowledgmentLoss) {
              // The real server COMMIT succeeded; inject only the driver's
              // outcome delivered to the authority. This is not a wire proxy.
              await send({type:'commit-ack-loss',boundary:commits,serverCommitCompleted:true});
              throw Object.assign(new Error('synthetic lost commit acknowledgment'),{code:'08006'});
            }
            return result;
          })();
        };
      });
    }

    const authority = await import(`../../src/services/${task.kind}BillingAuthority.ts`);
    const apply = task.kind === 'saas' ? authority.applyVerifiedSaasBillingProviderEvent : authority.applyVerifiedCashierBillingProviderEvent;
    const result = await apply({...task.event, occurredAt: new Date(task.event.occurredAt)});
    await send({type:'result', status:result.status});
  } catch (error) {
    await send({type:'failure', code:/^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'APPLICATION_FAILURE'});
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
    if (process.connected) process.disconnect();
  }
});
await send({type:'ready'});
