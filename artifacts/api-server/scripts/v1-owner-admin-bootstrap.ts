/**
 * One-shot gated V1 owner bootstrap. Logs only approved status codes.
 * All database sessions authenticate as the least-privilege auth role.
 * Never emit passwords, phone, pepper, hashes or connection URLs.
 */
import {
  assertV1OwnerAdminBootstrapJob,
  assertV1OwnerSecretInputs,
  deriveV1RoleUrl,
  validateV1OwnerUrl,
} from "../../../scripts/lib/v1-owner-admin-bootstrap-safety.mjs";

function failed(code: string): never {
  throw Object.assign(new Error(code), { code });
}
async function main(): Promise<void> {
  assertV1OwnerAdminBootstrapJob();
  if (process.argv.length !== 2) failed("V1_OWNER_BOOTSTRAP_NO_ARGS");
  const { phone, password, salt } = assertV1OwnerSecretInputs();
  const ownerTemplate = process.env.FAWRI_V1_PRODUCTION_PREWRITE_DUMP_URL;
  validateV1OwnerUrl(ownerTemplate);
  const tenantUrl = deriveV1RoleUrl(ownerTemplate,
    "fawri_restricted_runtime", process.env.FAWRI_V1_G2_TENANT_LOGIN_PASSWORD);
  const authUrl = deriveV1RoleUrl(ownerTemplate,
    "fawri_auth_issuer", process.env.FAWRI_V1_G2_AUTH_LOGIN_PASSWORD);

  process.env.NODE_ENV = "production";
  process.env.FAWRI_DEPLOYMENT_MODE = "production";
  process.env.FAWRI_V1_MANUAL_COMMERCE = "1";
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
  process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY = "required";
  process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = "fawri_restricted_runtime";
  process.env.DATABASE_URL = tenantUrl;
  process.env.FAWRI_AUTH_DATABASE_URL = authUrl;
  process.env.FAWRI_PASSWORD_SALT = salt;

  const db = await import("pg");
  const Client = db.default.Client;
  const client = new Client({ connectionString: authUrl,
    connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT session_user::text AS login,current_user::text AS active," +
      "current_database()::text AS db," +
      "(SELECT count(*)::integer FROM public.admin_profiles WHERE role='owner_admin') AS owners," +
      "EXISTS(SELECT 1 FROM public.accounts WHERE phone=$1) AS phone_taken," +
      "has_table_privilege(session_user,'public.accounts','INSERT') AS account_insert," +
      "has_table_privilege(session_user,'public.admin_profiles','INSERT') AS profile_insert",
      [phone]);
    const row = result.rows[0];
    if (!row || row.login !== "fawri_auth_issuer" ||
        row.active !== "fawri_auth_issuer" || row.db !== "fawri" ||
        row.owners !== 0 || row.phone_taken !== false ||
        row.account_insert !== true || row.profile_insert !== true) {
      failed("V1_OWNER_BOOTSTRAP_PREIMAGE_DENIED");
    }
  } finally {
    await client.end().catch(() => {});
  }
  const {provisionOwnerAdminPostgres, getOwnerAdminReadiness} =
    await import("../src/services/postgresOwnerAdminProvisioning.ts");
  await provisionOwnerAdminPostgres({
    displayName: "FAWRI Owner", phone, password, language: "ar",
  });
  const ready = await getOwnerAdminReadiness();
  if (ready.ownerCount !== 1 || ready.usableOwnerCount !== 1) {
    failed("V1_OWNER_BOOTSTRAP_POSTIMAGE_DENIED");
  }
  console.log("V1_OWNER_ADMIN_SINGLETON_READY");
}
void main().catch((error: unknown) => {
  const raw = error && typeof error === "object" &&
    "code" in error ? String(error.code) : "";
  const code = /^V1_OWNER_BOOTSTRAP_[A-Z0-9_]{2,100}$/.test(raw)
    ? raw : "V1_OWNER_BOOTSTRAP_REJECTED_DETAILS_REDACTED";
  console.error(code);
  process.exitCode = 1;
});
