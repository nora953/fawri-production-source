import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";
import type { OperationalDatabasePool, OperationalQueryTarget, OperationalTransactionClient } from "./operationalPostgresAuthority";

export const AUTHENTICATION_DATABASE_ENV = "FAWRI_AUTH_DATABASE_URL";
const authority = createOperatorDirectoryAuthority({ capability: "authentication" });
export const withAuthenticationTransaction = authority.transaction;
export const closeAuthenticationPool = authority.close;

// Every query uses an identity-checked transaction; no raw unvalidated lease is
// exposed. Mixed account/merchant writes must share withAuthenticationTransaction.
const facade: OperationalDatabasePool = {
  query: (sql, values) => authority.transaction(client => client.query(sql, values)),
  async connect(): Promise<OperationalTransactionClient> {
    throw new Error("use withAuthenticationTransaction for authentication leases");
  },
};
export async function authenticationDatabasePool(): Promise<OperationalDatabasePool> { return facade; }
export async function withMerchantAuthenticationTransaction<T>(merchantId:string,work:(client:OperationalQueryTarget)=>Promise<T>):Promise<T> {
  const tenant=String(merchantId || "").trim();
  if(!tenant || tenant.length>200) throw new Error("AUTHENTICATION_TENANT_INVALID");
  // This trusted authentication LOGIN is authorized by its non-PUBLIC marker,
  // not a tenant GUC. Callers still bind merchant IDs in their SQL predicates.
  return authority.transaction(work);
}
