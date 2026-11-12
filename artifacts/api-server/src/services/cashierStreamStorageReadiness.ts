import { assertCashierStreamStorageReady } from "../../../../lib/db/scripts/lib/cashier-stream-storage-candidate-readiness.mjs";
import { assertV1PosOffStorageReady } from "./v1PosOffStorageReadiness";
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
    // V1 explicitly excludes POS and its legacy cashier-writer membership.
    // The old held INVOKER cashier admission expects the auth issuer to
    // inherit cashier grants, conflicting with the approved first release.
    // Demand the source-pinned V1 POS-off retention trigger, intact historical
    // cashier RLS/guards and ZERO application cashier table privileges instead.
    // This is a SELECT-only metadata check; it cannot turn on cashier routes.
    await assertV1PosOffStorageReady(primary,{
      primaryRole,authenticationRole,operatorRole,
    });
  }
 }catch{
  throw new ProductionDatabaseRlsSecurityError("PRODUCTION_CASHIER_STREAM_STORAGE_NOT_READY","production cashier stream storage metadata is unsafe or incomplete");
 }
}
