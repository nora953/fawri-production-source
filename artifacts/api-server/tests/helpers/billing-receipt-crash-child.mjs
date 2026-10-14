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
