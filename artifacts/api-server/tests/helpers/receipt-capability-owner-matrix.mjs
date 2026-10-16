import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Caller has already attested the disposable database. Never use another pool
// while these transactional DDL locks are held on the owned setup client.
export async function proveReceiptCapabilityOwners(t,{admin,role,functions,tables,fixtures,actorId,deniedActorId,invoke,expected,snapshot,auditReasons}){
  for(const fixture of fixtures)for(const forced of [null,'verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders'])await t.test(`${fixture.kind}: ${auditReasons.at(-1)} restricted owner; FORCE ${forced||'none'}`,async()=>{
    const owner=`receipt_owner_${randomUUID().replaceAll('-','')}`,auditId=randomUUID();
    const tableSql="SELECT relname,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname";
    const functionSql='SELECT oid,proowner,prosecdef,proconfig FROM pg_proc WHERE oid=ANY($1::regprocedure[]) ORDER BY oid';
    const beforeTables=(await admin.query(tableSql,[tables])).rows;
    const beforeFunctions=(await admin.query(functionSql,[functions])).rows;
    const beforePrincipal=(await admin.query('SELECT current_user,session_user')).rows;
    const before=await snapshot();
    try{
      await admin.query('BEGIN');
      await admin.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${owner}`);
      for(const table of tables)await admin.query(`ALTER TABLE public.${table} OWNER TO ${owner}`);
      for(const table of ['verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders'])await admin.query(`ALTER TABLE public.${table} ${table===forced?'FORCE':'NO FORCE'} ROW LEVEL SECURITY`);
      for(const fn of functions)await admin.query(`ALTER FUNCTION ${fn} OWNER TO ${owner}`);
      assert.deepEqual((await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[owner])).rows,[{rolsuper:false,rolbypassrls:false}]);
      const ownedTables=(await admin.query(tableSql,[tables])).rows;
      assert.equal(new Set(ownedTables.map(row=>row.relowner)).size,1);
      for(const row of ownedTables){
        const original=beforeTables.find(item=>item.relname===row.relname);
        assert.equal(row.relrowsecurity,original.relrowsecurity);
        assert.equal(row.relforcerowsecurity,['verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders'].includes(row.relname)?row.relname===forced:original.relforcerowsecurity);
      }
      assert.ok(ownedTables.filter(row=>['verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders'].includes(row.relname)).every(row=>row.relrowsecurity));
      const ownedFunctions=(await admin.query(functionSql,[functions])).rows;
      assert.equal(ownedFunctions.length,functions.length);
      for(const fn of ownedFunctions){assert.equal(fn.proowner,ownedTables[0].relowner);assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog','row_security=off']);}
      await admin.query(`SET LOCAL ROLE ${role}`);
      assert.equal((await admin.query('SELECT current_user AS role')).rows[0].role,role);
      await admin.query('SAVEPOINT expected_denial');
      if(forced){
        await assert.rejects(()=>invoke(fixture,actorId,auditId),error=>error.code==='42501');
        await admin.query('ROLLBACK TO SAVEPOINT expected_denial');
      }else{
        await assert.rejects(()=>invoke(fixture,deniedActorId,randomUUID()),error=>error.code==='42501');
        await admin.query('ROLLBACK TO SAVEPOINT expected_denial');
        assert.deepEqual((await invoke(fixture,actorId,auditId)).rows,[expected(fixture)]);
        assert.deepEqual((await admin.query('SELECT (SELECT count(*)::int FROM verified_provider_payment_receipts) receipts,(SELECT count(*)::int FROM saas_billing_orders) saas,(SELECT count(*)::int FROM cashier_billing_orders) cashier')).rows,[{receipts:0,saas:0,cashier:0}]);
      }
      await admin.query('RESET ROLE');
      const written=(await admin.query('SELECT admin_account_id,reason_code,request_hash FROM database_admin_access_audits WHERE id=ANY($1::text[]) ORDER BY reason_code',[[auditId,auditId+'-execute']])).rows;
      assert.deepEqual(written,forced?[]:auditReasons.slice().sort().map(reason_code=>({admin_account_id:actorId,reason_code,request_hash:'a'.repeat(64)})));
    }finally{await admin.query('ROLLBACK');}
    assert.deepEqual((await admin.query('SELECT current_user,session_user')).rows,beforePrincipal);
    assert.deepEqual((await admin.query(tableSql,[tables])).rows,beforeTables);
    assert.deepEqual((await admin.query(functionSql,[functions])).rows,beforeFunctions);
    assert.deepEqual(await snapshot(),before,'authorization alone cannot alter receipts, orders, audits or grants');
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_roles WHERE rolname=$1',[owner])).rows[0].n,0);
    console.log('REPLAY_CAPABILITY_OWNER_PROOF '+JSON.stringify({kind:fixture.kind,capability:auditReasons.at(-1),forced,restrictedOwner:true,expectedSqlstate:forced?'42501':null,exactReviewedIdentity:!forced,auditRequired:true,noGrant:true,rollbackRestored:true}));
  });
}
