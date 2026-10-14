import assert from 'node:assert/strict';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const {pool}=await import('@workspace/db');
pool.options.max=1;
let handled=false,proxy,server;
async function send(message){if(process.connected)await new Promise(resolve=>process.send(message,()=>resolve()));}
process.on('message',async task=>{
  if(handled)return;handled=true;
  const nativeFetch=globalThis.fetch;let providerCalls=0,dropObserved=false;
  try{
    assert.match(task.role,/^operator_wire_[a-f0-9]{32}$/);assert.match(task.marker,/^operator-wire-owned-[a-f0-9-]+$/);
    assert.match(task.event,/^superqi-[a-f0-9]{64}$/);assert.ok(['saas','cashier'].includes(task.kind));
    assert.ok(task.boundary===undefined||[1,2].includes(task.boundary));
    pool.options.application_name=task.marker;pool.options.options=`-c role=${task.role}`;
    if(task.boundary){
      const {startOwnedCommitResponseProxy}=await import('./postgres-commit-response-proxy.mjs');
      proxy=await startOwnedCommitResponseProxy(task.boundary,async()=>{dropObserved=true;await send({type:'wire-drop',boundary:task.boundary,serverCommitCompleted:true,commandCompleteDelivered:false});},{deferUntilArmed:true});
      const owned=new URL(process.env.DATABASE_URL);pool.options.connectionString=undefined;
      Object.assign(pool.options,{host:'127.0.0.1',port:proxy.port,user:decodeURIComponent(owned.username),password:decodeURIComponent(owned.password),database:'fawri_ci',ssl:false});
    }
    const identity=(await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
    assert.deepEqual(identity,{role:task.role,rolsuper:false,rolbypassrls:false,owns_table:false});
    assert.equal((await pool.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
    assert.equal((await pool.query('SELECT * FROM saas_billing_orders')).rows.length,0);
    await send({type:'role-proof',restricted:true,privateReceipt:true,privateOrders:true});
    const [{default:express},{default:cookieParser},{default:router},{enforceAuthOrigin}]=await Promise.all([import('express'),import('cookie-parser'),import('../../src/routes/auth-verified-receipts-postgres-routes.ts'),import('../../src/middleware/authSession.ts')]);
    const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/auth',enforceAuthOrigin,router);
    server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
    const endpoint=`http://127.0.0.1:${server.address().port}/api/auth/admin/billing/verified-receipts/${task.event}/replay`;
    globalThis.fetch=async(url,init)=>{
      if(String(url)===`https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${encodeURIComponent(task.payload.paymentId)}/status`){
        assert.equal(init.method,'GET');providerCalls++;assert.equal(providerCalls,1);
        // Real auth/session COMMITs and initial audit SELECT have already finished.
        // Only subsequent billing transaction COMMIT responses can be withheld.
        proxy?.arm();return Response.json(task.payload);
      }
      assert.equal(String(url),endpoint,'only owned loopback HTTP or injected provider');return nativeFetch(url,init);
    };
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://operator.example.invalid',Cookie:`fawri_admin_session_v2=${task.token}`,'X-Fawri-Device-Id':task.device},body:JSON.stringify(task.body)});
    const body=await response.json();
    await send({type:'http-result',httpStatus:response.status,status:['applied','duplicate'].includes(body.status)?body.status:null,providerCalls,dropObserved,successReported:response.ok});
  }catch(error){await send({type:'failure',code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'OPERATOR_WIRE_TEST_FAILURE'});process.exitCode=1;}
  finally{
    globalThis.fetch=nativeFetch;
    try{if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end();if(proxy)await proxy.close();}
    catch{await send({type:'cleanup-failure'});process.exitCode=1;}
    if(process.connected)process.disconnect();
  }
});
await send({type:'ready'});
