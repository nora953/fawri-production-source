import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const {Client}=await import('pg');
const {issueMerchantTransactionScope}=await import('../src/services/tenantTransactionScope.ts');
const {assertTenantScopeSession}=await import('../src/services/tenantScopePostgresBoundary.ts');
const {assertProductionDatabaseRlsReady}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
const {closeAuthenticationPool}=await import('../src/services/authenticationPostgresAuthority.ts');

// Canonical migration protocol and server issuance proof; production RLS cutover is separate.
// The bootstrap installs owned objects; every authorization call uses a real
// restricted LOGIN and a non-LOGIN, non-superuser function owner.
test('tenant scope binds actual LOGIN backend and transaction without trusting GUCs',{timeout:90000},async t=>{
  const admin=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  await admin.connect();
  const nonce=randomUUID().replaceAll('-',''),schema='scope_probe_'+nonce;
  const owner='scope_owner_'+nonce,tenant='scope_tenant_'+nonce,auth='scope_auth_'+nonce;
  const merchants=['scope-a-'+nonce,'scope-b-'+nonce],roles=[],clients=[];
  let schemaCreated=false,tenantUrl,authUrl,authClient,primary,other,expiredTarget;
  let canonicalOwners=[],canonicalOwnerChanged=false;
  const quoteRole=value=>'"'+String(value).replaceAll('"','""')+'"';
  async function restoreCanonicalOwners(){
    if(!canonicalOwnerChanged)return;
    for(const entry of [...canonicalOwners].reverse())await admin.query('ALTER '+entry.object+' OWNER TO '+quoteRole(entry.owner));
    canonicalOwnerChanged=false;
  }
  t.after(()=>cleanupResources([
    ['authentication pool',()=>closeAuthenticationPool()],
    ['owned sessions',async()=>{for(const c of clients)await c.end();}],
    ['owned scope namespace',()=>schemaCreated?admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE'):undefined],
    ['owned merchants',()=>admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])',[merchants])],
    ['owned accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['canonical authority owners',restoreCanonicalOwners],
    ['owned roles',async()=>{assert.equal(canonicalOwnerChanged,false,'canonical ownership restoration must precede role teardown');for(const r of roles){await admin.query('DROP OWNED BY '+r);await admin.query('DROP ROLE '+r);}}],
    ['bootstrap',()=>admin.end()],
  ]));
  for(const r of [owner,tenant,auth]){
    assert.match(r,/^[a-z][a-z0-9_]{1,62}$/);
    const password=randomUUID().replaceAll('-','');
    await admin.query('CREATE ROLE '+r+(r===owner?' NOLOGIN':" LOGIN PASSWORD '"+password+"'")+' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE'+(r===owner?' INHERIT':' NOINHERIT')+' NOREPLICATION');roles.push(r);
    if(r!==owner){
      const url=new URL(process.env.DATABASE_URL);url.username=r;url.password=password;url.search='';
      if(r===tenant)tenantUrl=url.toString();else authUrl=url.toString();
      const c=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});clients.push(c);await c.connect();
      if(r===auth)authClient=c;else primary=c;
    }
  }
  async function fresh(){const c=new Client({connectionString:tenantUrl,connectionTimeoutMillis:5000});clients.push(c);await c.connect();return c;}
  other=await fresh();
  for(const id of merchants){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,'+198'+randomInt(100000000,999999999)]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
  }
  let sql=readFileSync(new URL('../../../lib/db/drizzle/0040_transaction_scoped_tenant_authority.sql',import.meta.url),'utf8');
  assert.ok(sql.includes('CREATE SCHEMA fawri_security;'));
  assert.equal(sql,readFileSync(new URL('../../../lib/db/migration-stages/0040/manual.sql',import.meta.url),'utf8'),'canonical stage SQL matches committed migration');
  sql=sql.replaceAll('fawri_security',schema);
  // Register cleanup before SQL setup can partially succeed.
  schemaCreated=true;await admin.query(sql);
  await admin.query('ALTER SCHEMA '+schema+' OWNER TO '+owner);
  await admin.query('ALTER TABLE '+schema+'.transaction_scopes OWNER TO '+owner);
  await admin.query('ALTER FUNCTION '+schema+'.issue_scope(name,integer,bigint,text) OWNER TO '+owner);
  await admin.query('ALTER FUNCTION '+schema+'.allows_merchant(text) OWNER TO '+owner);
  await admin.query('GRANT pg_read_all_stats TO '+owner);
  await admin.query('GRANT USAGE ON SCHEMA public TO '+owner+','+tenant+','+auth);
  await admin.query('GRANT SELECT ON public.merchants TO '+owner);
  await admin.query('GRANT USAGE ON SCHEMA '+schema+' TO '+tenant+','+auth);
  await admin.query('GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO '+auth);
  await admin.query('GRANT EXECUTE ON FUNCTION '+schema+'.issue_scope(name,integer,bigint,text) TO '+auth);
  await admin.query('GRANT EXECUTE ON FUNCTION '+schema+'.allows_merchant(text) TO '+tenant);
  await admin.query('CREATE TABLE '+schema+'.probe_rows(merchant_id text PRIMARY KEY,version integer NOT NULL)');
  for(const id of merchants)await admin.query('INSERT INTO '+schema+'.probe_rows VALUES($1,1)',[id]);
  await admin.query('ALTER TABLE '+schema+'.probe_rows ENABLE ROW LEVEL SECURITY');
  await admin.query('ALTER TABLE '+schema+'.probe_rows FORCE ROW LEVEL SECURITY');
  await admin.query('CREATE POLICY owned_scope ON '+schema+'.probe_rows USING('+schema+'.allows_merchant(merchant_id)) WITH CHECK('+schema+'.allows_merchant(merchant_id))');
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON '+schema+'.probe_rows TO '+tenant);
  for(const [c,r]of [[primary,tenant],[other,tenant],[authClient,auth]]){
    const actual=(await c.query("SELECT current_user AS active,session_user AS login,rolsuper,rolbypassrls,rolcreaterole,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owns_relations FROM pg_roles r WHERE rolname=session_user")).rows[0];
    assert.deepEqual(actual,{active:r,login:r,rolsuper:false,rolbypassrls:false,rolcreaterole:false,member:false,owns_relations:false});
    await assert.rejects(()=>c.query('SET ROLE '+owner),{code:'42501'});
  }
  const ownerFlags=(await admin.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=$1',[owner])).rows[0];
  assert.deepEqual(ownerFlags,{rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
  const visible=async c=>(await c.query('SELECT merchant_id FROM '+schema+'.probe_rows ORDER BY merchant_id')).rows.map(r=>r.merchant_id);
  const identity=async c=>(await c.query('SELECT session_user::text AS login,pg_backend_pid() AS pid,txid_current()::text AS xid')).rows[0];
  const issue=(target,merchant)=>authClient.query('SELECT '+schema+'.issue_scope($1::name,$2::integer,$3::bigint,$4::text)',[target.login,target.pid,target.xid,merchant]);
  const binding=async target=>(await admin.query('SELECT merchant_id,issued_at,expires_at FROM '+schema+'.transaction_scopes WHERE runtime_login=$1 AND backend_pid=$2 AND transaction_id=$3',[target.login,target.pid,target.xid])).rows[0];
  async function transaction(c,work,isolation='READ COMMITTED'){
    assert.ok(['READ COMMITTED','REPEATABLE READ','SERIALIZABLE'].includes(isolation));
    await c.query('BEGIN ISOLATION LEVEL '+isolation);
    try{return await work(await identity(c));}finally{await c.query('ROLLBACK');}
  }
  async function scoped(c,merchant,work,isolation='READ COMMITTED'){
    return transaction(c,async target=>{await issue(target,merchant);return work(target);},isolation);
  }

  let protocolPassed=true;
  async function check(name,work){await t.test(name,async()=>{try{await work();}catch(error){protocolPassed=false;throw error;}});}

  await check('tenant GUCs and forged administrative actors grant nothing without issued scope',async()=>{
    await transaction(primary,async()=>{
      await primary.query("SELECT set_config('fawri.tenant_id',$1,true),set_config('fawri.admin_account_id','forged',true),set_config('fawri.admin_audit_id','forged',true)",[merchants[1]]);
      assert.deepEqual(await visible(primary),[]);
      assert.equal((await primary.query('UPDATE '+schema+'.probe_rows SET version=99 WHERE merchant_id=$1',[merchants[1]])).rowCount,0);
    });
  });
  await check('authorized own CRUD works; foreign GUC changes cannot redirect reads or writes',async()=>{
    await scoped(primary,merchants[0],async()=>{
      assert.deepEqual(await visible(primary),[merchants[0]]);
      assert.equal((await primary.query('UPDATE '+schema+'.probe_rows SET version=version+1 WHERE merchant_id=$1',[merchants[0]])).rowCount,1);
      await primary.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants[1]]);
      assert.deepEqual(await visible(primary),[merchants[0]]);
      assert.equal((await primary.query('UPDATE '+schema+'.probe_rows SET version=99 WHERE merchant_id=$1',[merchants[1]])).rowCount,0);
      assert.equal((await primary.query('DELETE FROM '+schema+'.probe_rows WHERE merchant_id=$1',[merchants[1]])).rowCount,0);
      await primary.query('SAVEPOINT foreign_insert');
      await assert.rejects(()=>primary.query('INSERT INTO '+schema+'.probe_rows VALUES($1,9)',[merchants[1]]),{code:'42501'});
      await primary.query('ROLLBACK TO SAVEPOINT foreign_insert');
      assert.equal((await primary.query('DELETE FROM '+schema+'.probe_rows WHERE merchant_id=$1',[merchants[0]])).rowCount,1);
      assert.equal((await primary.query('INSERT INTO '+schema+'.probe_rows VALUES($1,1)',[merchants[0]])).rowCount,1);
    });
  });
  await check('tenant cannot mint even with forged actor GUC and accidental issuer EXECUTE grant',async()=>{
    await transaction(primary,async target=>{
      const query=()=>other.query('SELECT '+schema+'.issue_scope($1,$2,$3,$4)',[target.login,target.pid,target.xid,merchants[1]]);
      await assert.rejects(query,{code:'42501'});
      await admin.query('GRANT EXECUTE ON FUNCTION '+schema+'.issue_scope(name,integer,bigint,text) TO '+tenant);
      try{
        await other.query("SELECT set_config('fawri.admin_account_id',$1,false),set_config('fawri.tenant_id',$2,false)",[auth,merchants[1]]);
        await assert.rejects(query,{code:'42501'});
      }finally{await admin.query('REVOKE EXECUTE ON FUNCTION '+schema+'.issue_scope(name,integer,bigint,text) FROM '+tenant);await other.query('RESET ALL');}
      assert.deepEqual(await visible(primary),[]);
    });
  });
  await check('runtime and trusted issuer cannot directly SELECT INSERT UPDATE DELETE scope records',async()=>{
    for(const c of [primary,authClient])for(const query of [
      'SELECT * FROM '+schema+'.transaction_scopes',
      "INSERT INTO "+schema+".transaction_scopes VALUES(current_user,pg_backend_pid(),txid_current(),'forged',now(),now()+interval '1 minute')",
      'UPDATE '+schema+".transaction_scopes SET merchant_id='forged'",
      'DELETE FROM '+schema+'.transaction_scopes',
    ])await assert.rejects(()=>c.query(query),{code:'42501'});
  });
  await check('same LOGIN on another backend cannot replay known full binding identifiers',async()=>{
    await scoped(primary,merchants[0],async target=>{
      await transaction(other,async otherTarget=>{
        assert.equal(otherTarget.login,target.login);assert.notEqual(otherTarget.pid,target.pid);
        await other.query("SELECT set_config('fawri.tenant_id',$1,true),set_config('fawri.tenant_scope_pid',$2,true),set_config('fawri.tenant_scope_xid',$3,true)",[merchants[0],String(target.pid),target.xid]);
        assert.deepEqual(await visible(other),[]);
        assert.equal((await other.query('UPDATE '+schema+'.probe_rows SET version=99 WHERE merchant_id=$1',[merchants[0]])).rowCount,0);
      });
    });
  });
  await check('same backend later transaction cannot reuse authority after COMMIT',async()=>{
    await primary.query('BEGIN');let previous;
    try{previous=await identity(primary);await issue(previous,merchants[0]);assert.deepEqual(await visible(primary),[merchants[0]]);await primary.query('COMMIT');}
    catch(error){await primary.query('ROLLBACK');throw error;}
    await transaction(primary,async current=>{
      assert.equal(current.pid,previous.pid);assert.notEqual(current.xid,previous.xid);
      await primary.query("SELECT set_config('fawri.tenant_id',$1,true),set_config('fawri.tenant_scope_xid',$2,true)",[merchants[0],previous.xid]);
      assert.deepEqual(await visible(primary),[]);
    });
  });
  await check('scope is immutable and idempotent issuance cannot extend its validity',async()=>{
    await scoped(primary,merchants[0],async target=>{
      const before=await binding(target);await issue(target,merchants[0]);assert.deepEqual(await binding(target),before);
      await assert.rejects(()=>issue(target,merchants[1]),{code:'42501'});
      assert.deepEqual(await binding(target),before);assert.deepEqual(await visible(primary),[merchants[0]]);
    });
  });
  await check('expired in-progress authority is denied and cannot be deleted then renewed',async()=>{
    await scoped(primary,merchants[0],async target=>{
      expiredTarget=target;
      await admin.query('UPDATE '+schema+".transaction_scopes SET issued_at=statement_timestamp()-interval '4 minutes',expires_at=statement_timestamp()-interval '1 minute' WHERE runtime_login=$1 AND backend_pid=$2 AND transaction_id=$3",[target.login,target.pid,target.xid]);
      assert.deepEqual(await visible(primary),[]);
      await scoped(other,merchants[1],async()=>{assert.deepEqual(await visible(other),[merchants[1]]);});
      assert.ok(await binding(target),'cleanup must preserve expired in-progress tombstone');
      await assert.rejects(()=>issue(target,merchants[0]),{code:'42501'});
      await assert.rejects(()=>issue(target,merchants[1]),{code:'42501'});
    });
  });
  await check('bounded cleanup removes expired completed transactions only',async()=>{
    assert.ok(await binding(expiredTarget));
    await scoped(primary,merchants[0],async target=>{
      assert.equal(await binding(expiredTarget),undefined);
      assert.ok(await binding(target));assert.deepEqual(await visible(primary),[merchants[0]]);
    });
  });
  await check('revoked actual authentication marker prevents issuance despite identifiers and EXECUTE',async()=>{
    await transaction(primary,async target=>{
      await admin.query('REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM '+auth);
      try{await assert.rejects(()=>issue(target,merchants[0]),{code:'42501'});assert.deepEqual(await visible(primary),[]);}
      finally{await admin.query('GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO '+auth);}
      await issue(target,merchants[0]);assert.deepEqual(await visible(primary),[merchants[0]]);
    });
  });
  await check('issuer validates live backend login and full transaction epoch before inserting',async()=>{
    await transaction(primary,async target=>{
      const otherPid=(await other.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      for(const [login,pid,xid,merchant]of [
        [owner,target.pid,target.xid,merchants[0]],
        [target.login,otherPid,target.xid,merchants[0]],
        [target.login,target.pid,String(BigInt(target.xid)+1n),merchants[0]],
        [target.login,target.pid,String(BigInt(target.xid)+4294967296n),merchants[0]],
        [target.login,target.pid,target.xid,'missing-'+nonce],
      ])await assert.rejects(()=>issue({login,pid,xid},merchant),{code:'42501'});
      assert.equal(await binding(target),undefined);assert.deepEqual(await visible(primary),[]);
    });
  });
  await check('unsupported Repeatable Read and Serializable snapshots fail closed explicitly',async()=>{
    for(const level of ['REPEATABLE READ','SERIALIZABLE'])await scoped(primary,merchants[0],async()=>{
      assert.deepEqual(await visible(primary),[]);
      assert.equal((await primary.query('SELECT '+schema+'.allows_merchant($1) AS allowed',[merchants[0]])).rows[0].allowed,false);
    },level);
  });
  await check('rollback preserves data and clears GUC while stale binding cannot cross pool reuse',async()=>{
    const before=(await admin.query('SELECT * FROM '+schema+'.probe_rows ORDER BY merchant_id')).rows;
    await assert.rejects(()=>scoped(primary,merchants[0],async()=>{
      await primary.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants[1]]);
      await primary.query('UPDATE '+schema+'.probe_rows SET version=version+10 WHERE merchant_id=$1',[merchants[0]]);
      throw Error('synthetic rollback');
    }),{message:'synthetic rollback'});
    assert.deepEqual((await admin.query('SELECT * FROM '+schema+'.probe_rows ORDER BY merchant_id')).rows,before);
    assert.equal((await primary.query("SELECT nullif(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
    assert.deepEqual(await visible(primary),[]);
  });
  await check('four concurrent connections sharing one LOGIN retain isolated scope across reuse',async()=>{
    const parallel=await Promise.all(Array.from({length:4},()=>fresh()));
    const settled=await Promise.allSettled(parallel.map(async(c,index)=>{
      for(let round=0;round<2;round++){
        const own=merchants[(index+round)%2],foreign=merchants[(index+round+1)%2];
        await scoped(c,own,async()=>{
          await c.query("SELECT set_config('fawri.tenant_id',$1,true)",[foreign]);
          assert.deepEqual(await visible(c),[own]);
          assert.equal((await c.query('UPDATE '+schema+'.probe_rows SET version=99 WHERE merchant_id=$1',[foreign])).rowCount,0);
        });
        assert.deepEqual(await visible(c),[]);
      }
    }));
    for(const result of settled)assert.equal(result.status,'fulfilled',result.status==='rejected'?String(result.reason):undefined);
  });

  await check('server issuer uses actual authenticated pool and canonical migration with transaction affinity',async()=>{
    const previousAuthUrl=process.env.FAWRI_AUTH_DATABASE_URL;
    process.env.FAWRI_AUTH_DATABASE_URL=authUrl;
    canonicalOwners=(await admin.query(`
      SELECT 'SCHEMA fawri_security' AS object,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='fawri_security'
      UNION ALL SELECT 'TABLE fawri_security.transaction_scopes',pg_get_userbyid(relowner) FROM pg_class WHERE oid='fawri_security.transaction_scopes'::regclass
      UNION ALL SELECT 'FUNCTION fawri_security.issue_scope(name,integer,bigint,text)',pg_get_userbyid(proowner) FROM pg_proc WHERE oid='fawri_security.issue_scope(name,integer,bigint,text)'::regprocedure
      UNION ALL SELECT 'FUNCTION fawri_security.allows_merchant(text)',pg_get_userbyid(proowner) FROM pg_proc WHERE oid='fawri_security.allows_merchant(text)'::regprocedure
    `)).rows;
    assert.equal(canonicalOwners.length,4);
    // Preserve the captured schema/table/function owner order explicitly.
    canonicalOwners.sort((a,b)=>['SCHEMA','TABLE','FUNCTION'].indexOf(a.object.split(' ')[0])-['SCHEMA','TABLE','FUNCTION'].indexOf(b.object.split(' ')[0]));
    canonicalOwnerChanged=true;
    for(const entry of canonicalOwners)await admin.query('ALTER '+entry.object+' OWNER TO '+quoteRole(owner));
    const canonicalOwnerNames=(await admin.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid IN ('fawri_security.issue_scope(name,integer,bigint,text)'::regprocedure,'fawri_security.allows_merchant(text)'::regprocedure) ORDER BY proname")).rows;
    assert.deepEqual(canonicalOwnerNames,[{owner},{owner}]);
    for(const c of [primary,authClient])await assert.rejects(()=>c.query('SET ROLE '+owner),{code:'42501'});
    await admin.query('GRANT USAGE ON SCHEMA fawri_security TO '+tenant+','+auth);
    await admin.query('GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO '+auth);
    await admin.query('GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO '+tenant);
    await admin.query('DROP POLICY owned_scope ON '+schema+'.probe_rows');
    await admin.query('CREATE POLICY owned_scope ON '+schema+'.probe_rows USING(public.fawri_tenant_or_audited_admin(merchant_id)) WITH CHECK(public.fawri_tenant_or_audited_admin(merchant_id))');
    try{
      await transaction(primary,async target=>{
        await issueMerchantTransactionScope(primary,merchants[0]);
        assert.deepEqual(await visible(primary),[merchants[0]]);
        const scope=(await admin.query('SELECT runtime_login::text AS login,backend_pid AS pid,transaction_id::text AS xid,merchant_id FROM fawri_security.transaction_scopes WHERE runtime_login=$1 AND backend_pid=$2 AND transaction_id=$3',[target.login,target.pid,target.xid])).rows[0];
        assert.deepEqual(scope,{...target,merchant_id:merchants[0]});
        await primary.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants[1]]);
        assert.deepEqual(await visible(primary),[merchants[0]]);
        assert.equal((await primary.query('UPDATE '+schema+'.probe_rows SET version=99 WHERE merchant_id=$1',[merchants[1]])).rowCount,0);
        await transaction(other,async()=>{
          assert.deepEqual(await visible(other),[]);
        });
        await assert.rejects(()=>issueMerchantTransactionScope(primary,merchants[1]),{code:'42501'});
        assert.deepEqual(await visible(primary),[merchants[0]],'issuer rollback cannot change primary scope');
      });
      assert.deepEqual(await visible(primary),[]);
      await assert.rejects(()=>issueMerchantTransactionScope(primary,merchants[0]),{code:'42501'},'autocommit target transaction has already ended');
      for(const level of ['REPEATABLE READ','SERIALIZABLE'])await transaction(primary,async()=>{
        await assert.rejects(()=>issueMerchantTransactionScope(primary,merchants[0]),{code:'OPERATIONAL_TENANT_ISOLATION_UNSUPPORTED'});
        assert.deepEqual(await visible(primary),[]);
      },level);
      await transaction(primary,async()=>{
        await admin.query('REVOKE EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) FROM '+auth);
        try{await assert.rejects(()=>issueMerchantTransactionScope(primary,merchants[0]),{code:'OPERATIONAL_TENANT_SCOPE_ROLE_UNSAFE'});assert.deepEqual(await visible(primary),[]);}
        finally{await admin.query('GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO '+auth);}
        await issueMerchantTransactionScope(primary,merchants[0]);
        assert.deepEqual(await visible(primary),[merchants[0]],'failed issuer transaction was rolled back before pool reuse');
      });

      // The canonical issuer really executes with the restricted owner. Missing
      // visibility or merchant SELECT must deny issuance, then recover cleanly.
      for(const capability of ['statistics','merchant select']){
        await admin.query(capability==='statistics'?'REVOKE pg_read_all_stats FROM '+owner:'REVOKE SELECT ON public.merchants FROM '+owner);
        try{await transaction(primary,async()=>{
          await assert.rejects(()=>issueMerchantTransactionScope(primary,merchants[0]),{code:'42501'});
          assert.equal((await primary.query('SELECT fawri_security.allows_merchant($1) AS allowed',[merchants[0]])).rows[0].allowed,false);
        });}finally{await admin.query(capability==='statistics'?'GRANT pg_read_all_stats TO '+owner:'GRANT SELECT ON public.merchants TO '+owner);}
      }
      await transaction(primary,async()=>{
        await issueMerchantTransactionScope(primary,merchants[0]);
        assert.deepEqual(await visible(primary),[merchants[0]]);
      });
      const productionEnv={NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_DATABASE_URL:authUrl,FAWRI_OPERATOR_DATABASE_URL:'postgresql://operator@127.0.0.1/fawri_ci'};
      await assertProductionDatabaseRlsReady(productionEnv,primary);
      const unsafe={code:'OPERATIONAL_TENANT_SCOPE_ROLE_UNSAFE'};
      for(const [c,r,isIssuer] of [[primary,tenant,false],[authClient,auth,true]]){
        await assertTenantScopeSession(c,isIssuer);
        for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
          await admin.query('GRANT '+privilege+' ON fawri_security.transaction_scopes TO '+r);
          try{
            await assert.rejects(()=>assertTenantScopeSession(c,isIssuer),unsafe);
            if(!isIssuer)await assert.rejects(()=>assertProductionDatabaseRlsReady(productionEnv,c),{code:'PRODUCTION_TENANT_SCOPE_ROLE_UNSAFE'});
          }
          finally{await admin.query('REVOKE '+privilege+' ON fawri_security.transaction_scopes FROM '+r);}
        }
        for(const privilege of ['SELECT','INSERT','UPDATE','REFERENCES']){
          await admin.query('GRANT '+privilege+'(merchant_id) ON fawri_security.transaction_scopes TO '+r);
          try{
            await assert.rejects(()=>assertTenantScopeSession(c,isIssuer),unsafe);
            if(!isIssuer)await assert.rejects(()=>assertProductionDatabaseRlsReady(productionEnv,c),{code:'PRODUCTION_TENANT_SCOPE_ROLE_UNSAFE'});
          }
          finally{await admin.query('REVOKE '+privilege+'(merchant_id) ON fawri_security.transaction_scopes FROM '+r);}
        }
        await admin.query('GRANT CREATE ON SCHEMA fawri_security TO '+r);
        try{
            await assert.rejects(()=>assertTenantScopeSession(c,isIssuer),unsafe);
            if(!isIssuer)await assert.rejects(()=>assertProductionDatabaseRlsReady(productionEnv,c),{code:'PRODUCTION_TENANT_SCOPE_ROLE_UNSAFE'});
          }
        finally{await admin.query('REVOKE CREATE ON SCHEMA fawri_security FROM '+r);}
        await assertTenantScopeSession(c,isIssuer);
      }
      await admin.query('GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO '+tenant);
      try{await assert.rejects(()=>assertTenantScopeSession(primary,false),unsafe);}
      finally{await admin.query('REVOKE EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) FROM '+tenant);}
      const grantRole='scope_grant_'+nonce;
      await admin.query('CREATE ROLE '+grantRole+' NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT');
      roles.push(grantRole);
      await admin.query('GRANT SELECT ON fawri_security.transaction_scopes TO '+grantRole);
      for(const [c,r,isIssuer] of [[primary,tenant,false],[authClient,auth,true]]){
        for(const membership of ['INHERIT TRUE, SET FALSE','INHERIT FALSE, SET TRUE']){
          await admin.query('GRANT '+grantRole+' TO '+r+' WITH '+membership);
          try{
            await assert.rejects(()=>assertTenantScopeSession(c,isIssuer),unsafe);
            if(!isIssuer)await assert.rejects(()=>assertProductionDatabaseRlsReady(productionEnv,c),{code:'PRODUCTION_TENANT_SCOPE_ROLE_UNSAFE'});
          }
          finally{await admin.query('REVOKE '+grantRole+' FROM '+r);}
        }
        await admin.query('GRANT '+grantRole+' TO '+r+' WITH INHERIT FALSE, SET FALSE');
        try{await assertTenantScopeSession(c,isIssuer);}
        finally{await admin.query('REVOKE '+grantRole+' FROM '+r);}
      }
      await admin.query('REVOKE SELECT ON fawri_security.transaction_scopes FROM '+grantRole);
      // Detect function ownership even when scope-table privileges are absent.
      const previousFunctionOwner=(await admin.query("SELECT pg_get_userbyid(proowner) AS name FROM pg_proc WHERE oid='fawri_security.allows_merchant(text)'::regprocedure")).rows[0].name;
      assert.equal(previousFunctionOwner,owner);
      await admin.query('GRANT CREATE ON SCHEMA fawri_security TO '+grantRole);
      await admin.query('ALTER FUNCTION fawri_security.allows_merchant(text) OWNER TO '+grantRole);
      await admin.query('REVOKE CREATE ON SCHEMA fawri_security FROM '+grantRole);
      try{
        for(const [c,r,isIssuer] of [[primary,tenant,false],[authClient,auth,true]]){
          await admin.query('GRANT '+grantRole+' TO '+r+' WITH INHERIT FALSE, SET TRUE');
          try{
            await assert.rejects(()=>assertTenantScopeSession(c,isIssuer),unsafe);
            // The public predicate now invokes this deliberately broken definer.
            // Readiness fails during its SQL probe before later role admission.
            if(!isIssuer)await assert.rejects(()=>assertProductionDatabaseRlsReady(productionEnv,c),{code:'PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED'});
          }
          finally{await admin.query('REVOKE '+grantRole+' FROM '+r);}
        }
      }finally{await admin.query('ALTER FUNCTION fawri_security.allows_merchant(text) OWNER TO '+quoteRole(previousFunctionOwner));}
      for(const value of ['', 'x'.repeat(201)])await assert.rejects(()=>issueMerchantTransactionScope(primary,value),{code:'OPERATIONAL_TENANT_INVALID'});
    }finally{
      await closeAuthenticationPool();
      if(previousAuthUrl===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=previousAuthUrl;
      await admin.query('DROP POLICY owned_scope ON '+schema+'.probe_rows');
      await admin.query('CREATE POLICY owned_scope ON '+schema+'.probe_rows USING('+schema+'.allows_merchant(merchant_id)) WITH CHECK('+schema+'.allows_merchant(merchant_id))');
    }
  });
  if(protocolPassed)console.log('P0_TENANT_SCOPE_PROTOCOL_PROOF '+JSON.stringify({canonicalRestrictedOwnerVerified:true,canonicalOwnerCapabilityRevocationDenied:true,productionStartupPrivateScopeAdmissionVerified:true,privateScopePrivilegeAdmissionVerified:true,canonicalMigrationExercised:true,serverAuthenticatedPoolIssuance:true,serverIsolationRejection:true,serverAutocommitRejection:true,issuerFailurePoolRecovery:true,restrictedRuntimeLogin:true,sameLoginCrossBackendReplayDenied:true,sameBackendLaterTransactionReplayDenied:true,gucSpoofDenied:true,foreignReadAndUpdateDenied:true,privateAuthorityCrudDenied:true,forgedIssuerCallDenied:true,immutableScope:true,expiredScopeRenewalDenied:true,completedOnlyBoundedCleanup:true,restrictedNonLoginFunctionOwner:true,readCommittedSupported:true,repeatableReadAndSerializableFailClosed:true,concurrentConnections:4,reuseRounds:2,publicPredicateUsesPrivateScope:true,hostedCertified:false,releaseAccepted:false}));
});
