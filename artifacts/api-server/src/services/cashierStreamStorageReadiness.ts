import { assertCashierStreamStorageReady } from "../../../../lib/db/scripts/lib/cashier-stream-storage-candidate-readiness.mjs";
import { assertFt01HeldInvokerStorageReady } from "../../../../lib/db/scripts/lib/ft01-held-invoker-storage-readiness.mjs";
import { selectFt01CashierStorageProfile } from "../../../../lib/db/scripts/lib/ft01-production-cashier-storage-profile.mjs";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import { withOperatorDirectoryTransaction } from "./operatorDirectoryPostgresAuthority";
import { operationalDatabasePool, type OperationalQueryTarget } from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";
import { ProductionDatabaseRlsSecurityError } from "./postgresRuntimeRlsSecurity";

export async function assertProductionCashierStreamStorageReady(env:NodeJS.ProcessEnv=process.env,target?:OperationalQueryTarget):Promise<void>{
 if(!productionReleaseGateRequired(env))return;
 try{
  // This opt-in NEVER turns an unverified local proof into hosted approval.
  // No default fallback: a malformed variant request must block the listener.
  const profile=selectFt01CashierStorageProfile(env);
  const primary=target||await operationalDatabasePool();
  const primaryRole=(await primary.query<{login:string}>("SELECT session_user::text AS login")).rows[0]?.login;
  const authenticationRole=await withAuthenticationTransaction(async client=>(await client.query<{login:string}>("SELECT session_user::text AS login")).rows[0]?.login);
  if(!primaryRole||!authenticationRole||primaryRole===authenticationRole)throw new Error("separate authenticated identities required");
  if(profile.mode==='canonical'){
    await assertCashierStreamStorageReady(primary,{primaryRole,authenticationRole});
  }else{
    // Observe the actual, independently authenticated operator connection,
    // not a value from config or a tenant-owned SQL variable.
    const operatorRole=await withOperatorDirectoryTransaction(async client=>
      (await client.query<{login:string}>("SELECT session_user::text AS login")).rows[0]?.login);
    if(!operatorRole || new Set([primaryRole,authenticationRole,operatorRole]).size!==3){
      throw new Error("three independent authenticated database logins required");
    }
    await assertFt01HeldInvokerStorageReady(primary,{
      primaryRole,authenticationRole,operatorRole,
      migrationOwnerRole:profile.migrationOwnerRole,
    });
  }
 }catch{
  throw new ProductionDatabaseRlsSecurityError("PRODUCTION_CASHIER_STREAM_STORAGE_NOT_READY","production cashier stream storage metadata is unsafe or incomplete");
 }
}
