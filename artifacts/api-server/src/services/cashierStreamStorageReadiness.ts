import { assertCashierStreamStorageReady } from "../../../../lib/db/scripts/lib/cashier-stream-storage-candidate-readiness.mjs";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import { operationalDatabasePool, type OperationalQueryTarget } from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";
import { ProductionDatabaseRlsSecurityError } from "./postgresRuntimeRlsSecurity";

export async function assertProductionCashierStreamStorageReady(env:NodeJS.ProcessEnv=process.env,target?:OperationalQueryTarget):Promise<void>{
 if(!productionReleaseGateRequired(env))return;
 try{
  const primary=target||await operationalDatabasePool();
  const primaryRole=(await primary.query<{login:string}>("SELECT session_user::text AS login")).rows[0]?.login;
  const authenticationRole=await withAuthenticationTransaction(async client=>(await client.query<{login:string}>("SELECT session_user::text AS login")).rows[0]?.login);
  if(!primaryRole||!authenticationRole||primaryRole===authenticationRole)throw new Error("separate authenticated identities required");
  await assertCashierStreamStorageReady(primary,{primaryRole,authenticationRole});
 }catch{
  throw new ProductionDatabaseRlsSecurityError("PRODUCTION_CASHIER_STREAM_STORAGE_NOT_READY","production cashier stream storage metadata is unsafe or incomplete");
 }
}
