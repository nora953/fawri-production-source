import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
test('Support SQL privacy denies foreign scope and retains authorized operations',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,primary=fixture.runtimePool;
  const merchants=[`support-a-${randomUUID()}`,`support-b-${randomUUID()}`],actor=`support-admin-${randomUUID()}`;
  const tables=['support_tickets','support_messages','support_attachments','support_inspection_requests','support_preview_sessions'];
  const rows=merchants.map(merchant=>({merchant,ticket:`ticket-${merchant}`,message:`message-${merchant}`,attachment:`attachment-${merchant}`,request:`request-${merchant}`,preview:`preview-${merchant}`}));
  const saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
    ['synthetic tickets',()=>admin.query('DELETE FROM support_tickets WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['synthetic accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[[...merchants,actor]])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{if(saved===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=saved;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {withMerchantOperationalTransaction:scoped}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withAuthenticationTransaction:trusted}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {listAdminSupportTicketsPostgres:list,claimSupportTicketPostgres:claim,addAdminSupportMessagePostgres:reply,addMerchantSupportMessagePostgres:merchantReply}=await import('../src/services/postgresSupportAuthority.ts');
  const {refreshSupportLifecyclePostgresCanonical:lifecycle}=await import('../src/services/postgresSupportLifecycleAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",[actor,`+196${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Synthetic Support','assistant_admin',true,false)",[actor]);
  await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_support')",[actor]);
  for(const r of rows){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[r.merchant,`+196${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[r.merchant]);
    await admin.query("INSERT INTO support_tickets(id,merchant_id,subject,category) VALUES($1,$2,'Synthetic privacy proof','technical')",[r.ticket,r.merchant]);
    await admin.query("INSERT INTO support_messages(id,ticket_id,merchant_id,sender_type,sender_name_snapshot,body) VALUES($1,$2,$3,'merchant','Synthetic','Original')",[r.message,r.ticket,r.merchant]);
    await admin.query("INSERT INTO support_attachments(id,message_id,ticket_id,merchant_id,original_file_name,mime_type,size_bytes,sha256,storage_provider,storage_key) VALUES($1,$2,$3,$4,'synthetic.png','image/png',1,'synthetic','filesystem',$1)",[r.attachment,r.message,r.ticket,r.merchant]);
    await admin.query("INSERT INTO support_inspection_requests(id,ticket_id,merchant_id,admin_account_id,mode,reason,request_expires_at) VALUES($1,$2,$3,$4,'live_observation','Synthetic privacy proof',now()+interval '30 minutes')",[r.request,r.ticket,r.merchant,actor]);
    await admin.query("INSERT INTO support_preview_sessions(id,request_id,ticket_id,merchant_id,admin_account_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '30 minutes')",[r.preview,r.request,r.ticket,r.merchant,actor]);
  }
  const [a,b]=rows;
  const snapshot=async()=>{
    const result={};
    for(const table of tables)result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[merchants])).rows;
    return result;
  };
  let readDenials=0,mutationDenials=0;
  await t.test('canonical migration refuses inconsistent historical parent links before policy changes',async()=>{
    const sql=await readFile(new URL('../../../lib/db/drizzle/0047_support_privacy_tenant_authority.sql',import.meta.url),'utf8');
    const preflight=sql.split('--> statement-breakpoint')[0];
    assert.ok(preflight.includes('Support tenant relationship preflight failed'));
    const invalid=`invalid-${randomUUID()}`;
    await admin.query("INSERT INTO support_messages(id,ticket_id,merchant_id,sender_type,sender_name_snapshot) VALUES($1,$2,$3,'merchant','Synthetic')",[invalid,b.ticket,a.merchant]);
    try{await assert.rejects(admin.query(preflight),{code:'23514'});}
    finally{await admin.query('DELETE FROM support_messages WHERE id=$1',[invalid]);}
    await admin.query(preflight);
  });
  await t.test('readiness requires all five effective Support RLS boundaries',async()=>{
    await ready(env);
    const metadata=(await primary.query("SELECT c.relname,c.relrowsecurity,(SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows;
    assert.equal(metadata.length,5);
    assert.ok(metadata.every(r=>r.relrowsecurity&&r.policies===1));
    await admin.query('ALTER TABLE public.support_tickets DISABLE ROW LEVEL SECURITY');
    try{await assert.rejects(ready(env),{code:'PRODUCTION_DATABASE_TENANT_RLS_REQUIRED'});}
    finally{await admin.query('ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY');}
    await ready(env);
  });
  await t.test('unscoped, foreign-tenant and subsequent pooled reads reveal no foreign rows',async()=>{
    for(const table of tables){
      assert.equal((await primary.query(`SELECT id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rowCount,0);readDenials++;
      for(const r of rows)await scoped(r.merchant,async client=>{
        const visible=(await client.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rows;
        assert.equal(visible.length,1);assert.equal(visible[0].merchant_id,r.merchant);readDenials++;
      });
      assert.equal((await primary.query(`SELECT id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rowCount,0);readDenials++;
    }
  });
  await t.test('foreign writes and mismatched parent references are rejected without changing either tenant',async()=>{
    const before=await snapshot();
    for(const table of tables)await scoped(a.merchant,async client=>{
      assert.equal((await client.query(`UPDATE ${table} SET merchant_id=merchant_id WHERE merchant_id=$1`,[b.merchant])).rowCount,0);mutationDenials++;
      assert.equal((await client.query(`DELETE FROM ${table} WHERE merchant_id=$1`,[b.merchant])).rowCount,0);mutationDenials++;
    });
    const rejected=async(sql,values)=>{await assert.rejects(scoped(a.merchant,c=>c.query(sql,values)),{code:'42501'});mutationDenials++;};
    await rejected("INSERT INTO support_tickets(id,merchant_id,subject,category) VALUES($1,$2,'Synthetic','technical')",[`denied-${randomUUID()}`,b.merchant]);
    await rejected("INSERT INTO support_messages(id,ticket_id,merchant_id,sender_type,sender_name_snapshot) VALUES($1,$2,$3,'merchant','Synthetic')",[`denied-${randomUUID()}`,b.ticket,a.merchant]);
    await rejected("INSERT INTO support_attachments(id,message_id,ticket_id,merchant_id,original_file_name,mime_type,size_bytes,sha256,storage_provider,storage_key) VALUES($1,$2,$3,$4,'synthetic','image/png',1,'synthetic','filesystem',$1)",[`denied-${randomUUID()}`,b.message,b.ticket,a.merchant]);
    await rejected("INSERT INTO support_inspection_requests(id,ticket_id,merchant_id,admin_account_id,mode,reason,request_expires_at) VALUES($1,$2,$3,$4,'live_observation','Synthetic',now()+interval '1 minute')",[`denied-${randomUUID()}`,b.ticket,a.merchant,actor]);
    await rejected("INSERT INTO support_preview_sessions(id,request_id,ticket_id,merchant_id,admin_account_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 minute')",[`denied-${randomUUID()}`,b.request,b.ticket,a.merchant,actor]);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('legitimate merchant and trusted global transactions preserve rollback and both tenants',async()=>{
    const before=await snapshot(),rollback=new Error('synthetic rollback');
    await assert.rejects(scoped(a.merchant,async client=>{
      assert.equal((await client.query("UPDATE support_messages SET body='Synthetic rollback' WHERE id=$1",[a.message])).rowCount,1);
      throw rollback;
    }),e=>e===rollback);
    await assert.rejects(trusted(async client=>{
      assert.equal((await client.query('SELECT id FROM support_tickets WHERE id=ANY($1::text[])',[rows.map(r=>r.ticket)])).rowCount,2);
      assert.equal((await client.query("UPDATE support_tickets SET subject='Synthetic rollback' WHERE id=$1",[b.ticket])).rowCount,1);
      throw rollback;
    }),e=>e===rollback);
    assert.deepEqual(await snapshot(),before);
    const all=await list();
    assert.ok(rows.every(r=>all.some(ticket=>ticket.id===r.ticket)));
    await admin.query('UPDATE support_tickets SET merchant_reminder_sent_at=now(),assistant_reminder_sent_at=now(),owner_escalated_at=now() WHERE id=$1',[a.ticket]);
    await claim({ticketId:a.ticket,adminId:actor});
    await reply({ticketId:a.ticket,adminId:actor,body:'Synthetic authorized reply'});
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM support_messages WHERE ticket_id=$1 AND sender_type='admin'",[a.ticket])).rows[0].n,1);
    const reminders=async()=>(await admin.query('SELECT merchant_reminder_sent_at,assistant_reminder_sent_at,owner_escalated_at FROM support_tickets WHERE id=$1',[a.ticket])).rows[0];
    assert.deepEqual(await reminders(),{merchant_reminder_sent_at:null,assistant_reminder_sent_at:null,owner_escalated_at:null});
    await admin.query('UPDATE support_tickets SET merchant_reminder_sent_at=now(),assistant_reminder_sent_at=now(),owner_escalated_at=now() WHERE id=$1',[a.ticket]);
    await merchantReply({merchantId:a.merchant,ticketId:a.ticket,body:'Synthetic merchant reply'});
    assert.deepEqual(await reminders(),{merchant_reminder_sent_at:null,assistant_reminder_sent_at:null,owner_escalated_at:null});
    await lifecycle();
    assert.deepEqual((await snapshot()).support_tickets.filter(x=>x.row.id===b.ticket),before.support_tickets.filter(x=>x.row.id===b.ticket));
  });
  console.log('P0_SUPPORT_PRIVACY_REMEDIATION '+JSON.stringify({supportTables:5,readDenials,mutationDenials,actualLogins:2,merchants:2,authorizedGlobalAndMerchant:true,rollbackRestoration:true,emergencyScopeAccepted:false,httpPermissions:'separate existing Support cutover suite',hostedCertified:false,releaseAccepted:false}));
});
