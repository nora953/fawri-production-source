import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources, stopTestChild } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SAAS_BILLING_PROVIDER = 'test_fake';
const {createDisposableProviderRuntime}=await import('./helpers/disposable-provider-runtime.mjs');
const runtimeFixture=await createDisposableProviderRuntime();
const pool=runtimeFixture.admin;
const saas = await import('../src/services/saasBillingAuthority.ts');
const cashier = await import('../src/services/cashierBillingAuthority.ts');
const childPath = fileURLToPath(new URL('./helpers/billing-receipt-crash-child.mjs', import.meta.url));
const kinds = {
  saas: {orders:'saas_billing_orders', events:'saas_billing_events', applications:'saas_entitlement_applications', subscriptions:'subscriptions', apply:saas.applyVerifiedSaasBillingProviderEvent},
  cashier: {orders:'cashier_billing_orders', events:'cashier_billing_events', applications:'cashier_entitlement_applications', subscriptions:'merchant_cashier_subscriptions', apply:cashier.applyVerifiedCashierBillingProviderEvent},
};

test('committed verified receipts survive owned application/backend interruption and fresh-process replay', {timeout:180000}, async t => {
  const children = [], markers = [], fixtures = [], faults = [];
  async function terminateOwned(marker, pid) {
    return pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid() AND ($2::int IS NULL OR pid=$2)', [marker, pid || null]);
  }
  async function dropFault(name, table) {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
  t.after(async () => cleanupResources([
    ['owned backends', async () => { for (const marker of markers) await terminateOwned(marker); }],
    ['owned child processes', async () => { for (const child of children) await stopTestChild(child); }],
    ['fault objects', async () => { for (const [name, table] of faults) await dropFault(name, table); }],
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [fixtures])],
    ['actual runtime fixture', () => runtimeFixture.dispose()],
  ]));
  async function fixture(kind) {
    const merchantId = `receipt-${randomUUID()}`;
    fixtures.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [merchantId, `+1996${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')", [merchantId]);
    const idempotencyKey = randomUUID();
    const checkout = kind === 'saas'
      ? await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey,provider:'test_fake'})
      : await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey,provider:'test_fake'});
    const event = { merchantId: checkout.order.merchant_id,provider:'test_fake',providerEventId:randomUUID(),orderId:checkout.order.id,eventType:'payment_succeeded',signatureVerified:true,payloadHash:'e'.repeat(64),occurredAt:new Date(),amountIqd:checkout.order.amount_iqd,currency:'IQD',providerPaymentRef:randomUUID()};
    return {merchantId,event,idempotencyKey};
  }
  async function snapshot(kind, fixture) {
    const tables = kinds[kind];
    const order = (await pool.query(`SELECT status,provider_payment_ref,paid_at,metadata FROM ${tables.orders} WHERE id=$1`, [fixture.event.orderId])).rows[0];
    const receipt = (await pool.query(`SELECT status,occurred_at,payload_hash FROM ${tables.events} WHERE provider_event_id=$1`, [fixture.event.providerEventId])).rows;
    const applications = Number((await pool.query(`SELECT count(*)::int AS n FROM ${tables.applications} WHERE order_id=$1`, [fixture.event.orderId])).rows[0].n);
    const subscriptions = Number((await pool.query(`SELECT count(*)::int AS n FROM ${tables.subscriptions} WHERE merchant_id=$1`, [fixture.merchantId])).rows[0].n);
    return {order,receipt,applications,subscriptions};
  }
  async function start(kind, event, commitAcknowledgmentLoss, wireCommitAcknowledgmentLoss) {
    const marker = `receipt-owned-${randomUUID()}`;
    markers.push(marker);
    const child = spawn(process.execPath, ['--import','tsx',childPath], {env:{...process.env,DATABASE_URL:runtimeFixture.bootstrapUrl,FAWRI_TEST_BILLING_DATABASE_URL:runtimeFixture.runtimeUrl},stdio:['ignore','pipe','pipe','ipc']});
    children.push(child);
    const messages = [];
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    child.on('message', message => { messages.push(message); if (message.type === 'ready') resolveReady(); });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {}); // Never emit raw child/driver output in payment fault logs.
    const done = new Promise(resolve => {
      child.once('exit', (code,signal) => resolve({code,signal,messages}));
      child.once('error', () => resolve({code:'SPAWN_FAILURE',messages}));
    });
    let timer;
    try {
      await Promise.race([ready, done.then(() => { throw new Error('owned child exited before ready'); }), new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('owned child ready timeout')),15000); })]);
    } finally { clearTimeout(timer); }
    child.send({kind,event,marker,commitAcknowledgmentLoss,wireCommitAcknowledgmentLoss});
    return {child,marker,done,messages};
  }
  async function sleepingBackend(task, table) {
    for (let attempt=0; attempt<200; attempt++) {
      const rows = (await pool.query("SELECT pid,query,wait_event FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()", [task.marker])).rows;
      const row = rows.find(row => row.wait_event === 'PgSleep' && row.query.includes(`INSERT INTO ${table}`));
      if (row) return row.pid;
      if (task.child.exitCode !== null || task.child.signalCode !== null) throw new Error('owned application exited before interruption boundary');
      await delay(50);
    }
    throw new Error('owned entitlement wait boundary not observed');
  }
  for (const kind of Object.keys(kinds)) {
    for (const interruption of ['process','backend']) {
      await t.test(`${kind}: durable receipt survives ${interruption} interruption before entitlement commit`, async () => {
        const f = await fixture(kind), table = kinds[kind].applications;
        const name = `receipt_pause_${randomUUID().replaceAll('-','')}`;
        faults.push([name,table]);
        await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id = TG_ARGV[0] THEN PERFORM pg_sleep(30); END IF; RETURN NEW; END $$`);
        await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}('${f.event.orderId}')`);
        const task = await start(kind,f.event);
        const pid = await sleepingBackend(task,table);
        const before = await snapshot(kind,f);
        assert.equal(before.order.status,'paid_reconciliation_required');
        assert.equal(before.order.provider_payment_ref,f.event.providerPaymentRef);
        assert.equal(before.receipt.length,1);
        assert.equal(before.receipt[0].status,'received');
        assert.equal(before.applications,0);
        assert.equal(before.subscriptions,0);
        if (interruption === 'process') task.child.kill('SIGKILL');
        const terminated = await terminateOwned(task.marker,pid);
        if (interruption === 'backend') {
          assert.equal(terminated.rows.length,1);
          assert.equal(terminated.rows[0].pg_terminate_backend,true);
        }
        const interrupted = await task.done;
        if (interruption === 'process') assert.equal(interrupted.signal,'SIGKILL');
        else assert.notEqual(interrupted.code,0);
        assert.ok(!interrupted.messages.some(message => message.type==='result' && message.status==='applied'));
        await dropFault(name,table);
        const after = await snapshot(kind,f);
        assert.equal(after.receipt.length,1);
        assert.equal(after.applications,0);
        assert.equal(after.subscriptions,0);
        const checkoutInput = kind === 'saas'
          ? {merchantId:f.merchantId,operation:'activate',plan:'silver',provider:'test_fake'}
          : {merchantId:f.merchantId,operation:'activate',requestedSeats:1,provider:'test_fake'};
        const checkoutAgain = kind === 'saas' ? saas.createSaasBillingCheckout : cashier.createCashierBillingCheckout;
        await assert.rejects(() => checkoutAgain({...checkoutInput,idempotencyKey:randomUUID()}), error => error.code===kind.toUpperCase()+'_BILLING_CHECKOUT_ALREADY_PENDING');
        const replayedCheckout = await checkoutAgain({...checkoutInput,idempotencyKey:f.idempotencyKey});
        assert.equal(replayedCheckout.order.id,f.event.orderId);
        assert.equal(replayedCheckout.duplicate,true);
        assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${kinds[kind].orders} WHERE merchant_id=$1`,[f.merchantId])).rows[0].n,1);
        const redelivered = {...f.event,occurredAt:new Date(f.event.occurredAt.getTime()+86400000)};
        const restarted = await Promise.all([start(kind,redelivered),start(kind,redelivered)]);
        const outcomes = await Promise.all(restarted.map(task => task.done));
        assert.ok(outcomes.every(outcome => outcome.code===0));
        assert.deepEqual(outcomes.map(outcome => outcome.messages.find(message => message.type==='result')?.status).sort(),['applied','duplicate']);
        const settled = await snapshot(kind,f);
        assert.equal(settled.receipt.length,1);
        assert.equal(settled.receipt[0].status,'applied');
        assert.equal(settled.applications,1);
        assert.equal(settled.subscriptions,1);
        assert.equal(new Date(settled.order.paid_at).getTime(),f.event.occurredAt.getTime());
        console.log('BILLING_RECEIPT_INTERRUPTION_PROOF '+JSON.stringify({kind,interruption,receiptBeforeInterrupt:1,partialEntitlement:0,freshProcessApplications:1,duplicateReplay:true}));
      });
    }
    for (const boundary of [1,2]) {
      await t.test(`${kind}: lost driver acknowledgment after ${boundary === 1 ? 'receipt' : 'entitlement'} COMMIT recovers exactly once`, async () => {
        const f = await fixture(kind);
        const task = await start(kind,f.event,boundary);
        const lost = await task.done;
        assert.notEqual(lost.code,0);
        assert.ok(lost.messages.some(message => message.type==='commit-ack-loss' && message.boundary===boundary && message.serverCommitCompleted===true));
        assert.ok(lost.messages.some(message => message.type==='failure' && message.code==='08006'));
        assert.ok(!lost.messages.some(message => message.type==='result'));
        const uncertain = await snapshot(kind,f);
        assert.equal(uncertain.receipt.length,1);
        assert.equal(uncertain.order.provider_payment_ref,f.event.providerPaymentRef);
        assert.equal(uncertain.receipt[0].status,boundary===1 ? 'received' : 'applied');
        assert.equal(uncertain.applications,boundary===1 ? 0 : 1);
        assert.equal(uncertain.subscriptions,boundary===1 ? 0 : 1);
        const redelivered = {...f.event,occurredAt:new Date(f.event.occurredAt.getTime()+86400000)};
        const restarted = await Promise.all([start(kind,redelivered),start(kind,redelivered)]);
        const outcomes = await Promise.all(restarted.map(task => task.done));
        assert.ok(outcomes.every(outcome => outcome.code===0));
        assert.deepEqual(outcomes.map(outcome => outcome.messages.find(message => message.type==='result')?.status).sort(),boundary===1 ? ['applied','duplicate'] : ['duplicate','duplicate']);
        const settled = await snapshot(kind,f);
        assert.equal(settled.receipt.length,1);
        assert.equal(settled.receipt[0].status,'applied');
        assert.equal(settled.applications,1);
        assert.equal(settled.subscriptions,1);
        assert.equal(new Date(settled.order.paid_at).getTime(),f.event.occurredAt.getTime());
        console.log('BILLING_COMMIT_ACK_LOSS_PROOF '+JSON.stringify({kind,boundary,mode:'driver-outcome-after-real-server-commit',serverCommitCompleted:true,callerReportedSuccess:false,freshProcessApplications:1,originalPaymentTime:true}));
      });
    }
    for (const boundary of [1,2]) {
      await t.test(`${kind}: lost PostgreSQL wire acknowledgment after ${boundary === 1 ? 'receipt' : 'entitlement'} COMMIT recovers exactly once`, async () => {
        const f = await fixture(kind);
        const task = await start(kind,f.event,undefined,boundary);
        const lost = await task.done;
        assert.notEqual(lost.code,0);
        assert.ok(lost.messages.some(message => message.type==='wire-commit-ack-loss' && message.boundary===boundary && message.serverCommitCompleted===true && message.commandCompleteDelivered===false));
        assert.ok(lost.messages.some(message => message.type==='failure'));
        assert.ok(!lost.messages.some(message => message.type==='result'));
        const uncertain = await snapshot(kind,f);
        assert.equal(uncertain.receipt.length,1);
        assert.equal(uncertain.order.provider_payment_ref,f.event.providerPaymentRef);
        assert.equal(uncertain.receipt[0].status,boundary===1 ? 'received' : 'applied');
        assert.equal(uncertain.applications,boundary===1 ? 0 : 1);
        assert.equal(uncertain.subscriptions,boundary===1 ? 0 : 1);
        const redelivered = {...f.event,occurredAt:new Date(f.event.occurredAt.getTime()+86400000)};
        const restarted = await Promise.all([start(kind,redelivered),start(kind,redelivered)]);
        const outcomes = await Promise.all(restarted.map(task => task.done));
        assert.ok(outcomes.every(outcome => outcome.code===0));
        assert.deepEqual(outcomes.map(outcome => outcome.messages.find(message => message.type==='result')?.status).sort(),boundary===1 ? ['applied','duplicate'] : ['duplicate','duplicate']);
        const settled = await snapshot(kind,f);
        assert.equal(settled.receipt.length,1);
        assert.equal(settled.receipt[0].status,'applied');
        assert.equal(settled.applications,1);
        assert.equal(settled.subscriptions,1);
        assert.equal(new Date(settled.order.paid_at).getTime(),f.event.occurredAt.getTime());
        console.log('BILLING_WIRE_COMMIT_ACK_LOSS_PROOF '+JSON.stringify({kind,boundary,mode:'tcp-proxy-drops-command-complete-after-real-server-commit',commandCompleteDelivered:false,serverCommitCompleted:true,callerReportedSuccess:false,freshProcessApplications:1,originalPaymentTime:true}));
      });
    }
    await t.test(`${kind}: failed receipt COMMIT is rejected before entitlement and exact retry remains safe`, async () => {
      const f = await fixture(kind), table = kinds[kind].orders;
      const name = `receipt_commit_${randomUUID().replaceAll('-','')}`;
      faults.push([name,table]);
      await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = TG_ARGV[0] AND NEW.status = 'paid_reconciliation_required' THEN RAISE EXCEPTION 'synthetic receipt commit failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
      await pool.query(`CREATE CONSTRAINT TRIGGER ${name} AFTER UPDATE ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${name}('${f.event.orderId}')`);
      await assert.rejects(() => kinds[kind].apply(f.event), error => error.code==='P0001');
      const rejected = await snapshot(kind,f);
      assert.equal(rejected.order.status,'pending');
      assert.equal(rejected.receipt.length,0);
      assert.equal(rejected.applications,0);
      assert.equal(rejected.subscriptions,0);
      await dropFault(name,table);
      assert.equal((await kinds[kind].apply(f.event)).status,'applied');
      assert.equal((await kinds[kind].apply(f.event)).status,'duplicate');
      const settled = await snapshot(kind,f);
      assert.equal(settled.receipt.length,1);
      assert.equal(settled.applications,1);
      assert.equal(settled.subscriptions,1);
      console.log('BILLING_RECEIPT_COMMIT_FAILURE_PROOF '+JSON.stringify({kind,failedCommitAcknowledged:false,preCommitEntitlement:0,retryAppliedOnce:true}));
    });
  }
});
