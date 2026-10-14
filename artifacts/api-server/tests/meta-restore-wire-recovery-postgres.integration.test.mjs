import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources,stopTestChild} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY='required';
const {pool}=await import('@workspace/db');
const {reserveMerchantAutoReplyAuthoritative}=await import('../src/services/merchantReplyEntitlementAuthority.ts');
const childPath=fileURLToPath(new URL('./helpers/meta-restore-wire-child.mjs',import.meta.url));

test('actual tenant-scoped Meta restore wrappers recover once-only credit after real COMMIT loss and fresh-process replay',{timeout:180000},async t=>{
  const role=`meta_restore_${randomUUID().replaceAll('-','')}`,merchants=[],children=[],markers=[];let roleCreated=false;
  t.after(async()=>cleanupResources([
    ['owned backends',async()=>{for(const marker of markers)await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()',[marker]);}],
    ['owned children',async()=>{for(const child of children)await stopTestChild(child);}],
    ['owned ledger',()=>pool.query('DELETE FROM reply_ledger WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['owned grants',()=>roleCreated?pool.query(`DROP OWNED BY ${role}`):undefined],
    ['owned role',()=>roleCreated?pool.query(`DROP ROLE ${role}`):undefined],['pool',()=>pool.end()],
  ]));
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  async function merchant(){
    const id=`restore-wire-merchant-${randomUUID()}`;merchants.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+1995${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
    await pool.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining,emergency_credit_amount,emergency_credit_activated,emergency_debt,auto_reply_enabled,starts_at,expires_at,activated_at,version) VALUES($1,$2,'silver','active',10000,1,20,0,20,0,0,false,0,true,now()-interval '1 day',now()+interval '30 days',now(),1)",[`restore-wire-sub-${randomUUID()}`,id]);
    return id;
  }
  const foreign=await merchant();
  async function snapshot(merchant,event){return {
    subscription:(await pool.query('SELECT base_replies_used,base_replies_remaining FROM subscriptions WHERE merchant_id=$1',[merchant])).rows[0],
    ledger:(await pool.query(`SELECT id,merchant_id,subscription_id,direction,amount,reason_code,metadata,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM reply_ledger WHERE merchant_id=$1 AND external_event_id=$2 ORDER BY direction,id`,[merchant,event])).rows,
  };}
  async function run(task){
    const marker=`meta-restore-owned-${randomUUID()}`;markers.push(marker);
    const child=spawn(process.execPath,['--import','tsx',childPath],{env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});children.push(child);
    const messages=[];let readyResolve;const ready=new Promise(r=>{readyResolve=r;});
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});child.on('message',m=>{messages.push(m);if(m.type==='ready')readyResolve();});
    const done=new Promise(r=>{child.once('exit',(code,signal)=>r({code,signal,messages}));child.once('error',()=>r({code:'SPAWN_FAILURE',messages}));});
    let timer;try{await Promise.race([ready,done.then(()=>{throw Error('restore child exited before ready');}),new Promise((_,j)=>{timer=setTimeout(()=>j(Error('restore child ready timeout')),15000);})]);}finally{clearTimeout(timer);}
    child.send({...task,role,marker});
    try{return await Promise.race([done,new Promise((_,j)=>{timer=setTimeout(()=>j(Error('restore child timeout')),30000);})]);}finally{clearTimeout(timer);}
  }
  for(const kind of ['refund','release'])for(const abrupt of [false,true])await t.test(`${kind}: withheld COMMIT acknowledgment ${abrupt?'with SIGKILL':'with handled uncertainty'} retains one immutable credit`,async()=>{
    const owned=await merchant(),event=`meta-restore-wire-event-${randomUUID()}`;
    assert.equal((await reserveMerchantAutoReplyAuthoritative(owned,event)).allowed,true);
    const before=await snapshot(owned,event);assert.deepEqual(before.subscription,{base_replies_used:1,base_replies_remaining:19});assert.equal(before.ledger.length,1);
    const lost=await run({kind,merchant:owned,event,drop:true,abrupt});
    assert.ok(lost.messages.some(m=>m.type==='role-proof'&&m.restricted&&m.nakedReadsZero));
    assert.ok(lost.messages.some(m=>m.type==='wire-drop'&&m.serverCommitCompleted&&m.commandCompleteDelivered===false));
    if(abrupt){assert.equal(lost.signal,'SIGKILL');assert.ok(!lost.messages.some(m=>m.type==='result'));}
    else{assert.equal(lost.code,0);assert.ok(lost.messages.some(m=>m.type==='uncertain'&&!m.successReported&&m.dropObserved));}
    const committed=await snapshot(owned,event);assert.deepEqual(committed.subscription,{base_replies_used:0,base_replies_remaining:20});assert.equal(committed.ledger.length,2);
    assert.deepEqual(committed.ledger.find(r=>r.direction==='debit'),before.ledger[0]);
    assert.equal(committed.ledger.find(r=>r.direction==='credit').reason_code,kind==='refund'?'META_REPLY_FAILED':'MERCHANT_AUTO_REPLY_DISABLED');
    const foreignBefore=await snapshot(foreign,event);
    const denied=await run({kind,merchant:foreign,event,drop:false});assert.equal(denied.code,0);assert.equal(denied.messages.find(m=>m.type==='result').reason,'reservation_not_found');assert.deepEqual(await snapshot(owned,event),committed);assert.deepEqual(await snapshot(foreign,event),foreignBefore);
    const retries=await Promise.all([run({kind,merchant:owned,event,drop:false}),run({kind,merchant:owned,event,drop:false})]);
    for(const retry of retries){assert.equal(retry.code,0);const result=retry.messages.find(m=>m.type==='result');assert.equal(result.restored,false);assert.equal(result.reason,kind==='refund'?'already_refunded':'already_released');assert.equal(result.contextReset,true);}
    assert.deepEqual(await snapshot(owned,event),committed);
    console.log('META_RESTORE_WIRE_RECOVERY_PROOF '+JSON.stringify({kind,abrupt,restrictedRole:true,serverCommitCompleted:true,commandCompleteDelivered:false,freshProcessConcurrentRetries:true,crossTenantDenied:true,credits:1,debitAndCreditUnchanged:true,contextReset:true}));
  });
});
