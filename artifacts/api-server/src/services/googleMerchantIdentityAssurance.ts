import { authenticationDatabasePool } from "./authenticationPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

/**
 * Google-only merchant assurance derived exclusively from the trusted
 * authentication database, never from a client body/cookie/email.
 * Do NOT query new columns on legacy deployments before migration approval.
 */
export async function isGoogleMerchantIdentityLinked(accountId: string): Promise<boolean> {
  if (process.env.FAWRI_GOOGLE_OIDC_HTTP_READY !== "1" ||
      process.env.FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED !== "1" ||
      process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY !== "required" ||
      !operationalPostgresAuthorityRequired() ||
      !/^merchant-[0-9a-f-]{36}$/i.test(accountId)) return false;

  const db = await authenticationDatabasePool();
  const result = await db.query<{ id: string }>(
    "SELECT a.id FROM public.accounts AS a " +
    "JOIN public.merchants AS m ON m.account_id=a.id AND m.id=a.id " +
    "WHERE a.id=$1 AND a.kind='merchant' AND a.state='active' " +
    "AND a.google_issuer='https://accounts.google.com' " +
    "AND a.google_subject IS NOT NULL AND a.google_subject <> '' " +
    "AND m.account_status IN ('pending_review','approved') " +
    "LIMIT 1",
    [accountId],
  );
  return result.rows.length === 1;
}
