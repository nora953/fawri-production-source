export const PRODUCTION_RELEASE_GATE_ENV = "FAWRI_PRODUCTION_RELEASE_GATE";
export const DEPLOYMENT_MODE_ENV = "FAWRI_DEPLOYMENT_MODE";

type DeploymentMode = "development" | "staging" | "production";

export type ProductionReleaseIssue = {
  code: string;
  area:
    | "database"
    | "auth"
    | "meta"
    | "kms"
    | "knowledge"
    | "observability"
    | "billing"
    | "backup"
    | "storage"
    | "deployment"
    | "http";
};

export type ProductionLaunchReadiness = {
  runtime_ready: boolean;
  launch_ready: boolean;
  runtime_issues: ProductionReleaseIssue[];
  external_blockers: ProductionReleaseIssue[];
};

const SAFE_SERVICE_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SAFE_DEK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
// FIELD002: never promote historical broad-grant staging roles or Neon
// ownership identities as commercial tenant application logins.
export const FIELD002_FORBIDDEN_RUNTIME_ROLE_NAMES: ReadonlySet<string> = new Set([
  "fawri_staging_runtime", "fawri_staging_rls_runtime",
  "neondb_owner", "neon_superuser",
  // Neon provider identities observed in the isolated PostgreSQL role
  // inventory. Never accept an admin/BYPASSRLS or inherited DB owner as a
  // tenant, auth or operator LOGIN merely because its URL looks valid.
  "cloud_admin", "neon_service", "pg_database_owner", "postgres",
]);
const AWS_KMS_KEY_ARN = /^arn:aws[a-z-]*:kms:[a-z0-9-]+:\d{12}:key\/[A-Fa-f0-9-]{16,}$/;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function issue(
  area: ProductionReleaseIssue["area"],
  code: string,
): ProductionReleaseIssue {
  return { area, code };
}

function isPostgresUrl(value: unknown): boolean {
  const raw = text(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

// FIELD002: production auth must use a separately authenticated LOGIN.
// This is a syntactic pre-listener identity check, not SQL privilege proof.
// Never log or include URL/user-info in issue codes.
function postgresLoginName(value: unknown): string | null {
  if (!isPostgresUrl(value)) return null;
  try {
    const valueUrl = new URL(text(value));
    const username = decodeURIComponent(valueUrl.username);
    return /^[a-z_][a-z0-9_]{0,62}$/.test(username) ? username : null;
  } catch {
    return null;
  }
}

// A trusted auth issuer and its tenant pool must address the same logical DB.
// Neon offers pooled and direct hostnames for one compute; normalize only this
// documented suffix. Exact endpoint identity still needs hosted verification.
function postgresDatabaseTarget(value: unknown): string | null {
  if (!isPostgresUrl(value)) return null;
  try {
    const parsed = new URL(text(value));
    const rawHost = parsed.hostname.toLowerCase();
    const host = rawHost.endsWith(".neon.tech")
      ? rawHost.replace(/^([^.]+)-pooler(?=\.)/, "$1")
      : rawHost;
    const database = decodeURIComponent(parsed.pathname);
    if (!host || !database || database === "/") return null;
    return [host, parsed.port || "5432", database].join("\u0000");
  } catch {
    return null;
  }
}

function isSafeAllowedOrigins(value: unknown): boolean {
  const origins = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origins.length === 0) return false;
  return origins.every((origin) => {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:") return false;
      if (parsed.username || parsed.password) return false;
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) return false;
      const host = parsed.hostname.toLowerCase();
      return !(
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.endsWith(".replit.dev") ||
        host.endsWith(".repl.co") ||
        host.includes("replit")
      );
    } catch {
      return false;
    }
  });
}

function isSafeProductionRedirect(value: unknown): boolean {
  const raw = text(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".replit.dev") ||
      host.endsWith(".repl.co") ||
      host.includes("replit")
    ) {
      return false;
    }
    return parsed.pathname.endsWith("/api/meta/callback");
  } catch {
    return false;
  }
}

function wrappedDekManifestValid(env: NodeJS.ProcessEnv): boolean {
  const currentId = text(env.FAWRI_META_AWS_CURRENT_DEK_ID);
  const raw = text(env.FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON);
  if (!SAFE_DEK_ID.test(currentId) || !raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const manifest = parsed as Record<string, unknown>;
    const current = text(manifest[currentId]);
    if (!current || current.length < 16) return false;
    for (const [key, value] of Object.entries(manifest)) {
      if (!SAFE_DEK_ID.test(key) || !text(value)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function explicitDeploymentMode(
  env: NodeJS.ProcessEnv,
): DeploymentMode | null {
  const raw = text(env[DEPLOYMENT_MODE_ENV]).toLowerCase();
  return raw === "development" || raw === "staging" || raw === "production"
    ? raw
    : null;
}

function deploymentModeInvalid(env: NodeJS.ProcessEnv): boolean {
  const raw = text(env[DEPLOYMENT_MODE_ENV]);
  return Boolean(raw) && explicitDeploymentMode(env) === null;
}

export function productionReleaseGateRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicit = explicitDeploymentMode(env);
  if (explicit) return explicit === "production";
  // Production is fail-closed by default. Staging/development must opt out
  // explicitly with FAWRI_DEPLOYMENT_MODE rather than production opting in
  // to safety checks.
  return env.NODE_ENV === "production";
}

export function getProductionRuntimeConfigurationIssues(
  env: NodeJS.ProcessEnv = process.env,
): ProductionReleaseIssue[] {
  const invalidDeploymentMode = deploymentModeInvalid(env);
  if (!productionReleaseGateRequired(env) && !invalidDeploymentMode) return [];

  const issues: ProductionReleaseIssue[] = [];
  if (invalidDeploymentMode) {
    issues.push(issue("deployment", "DEPLOYMENT_MODE_INVALID"));
  }

  if (!isPostgresUrl(env.DATABASE_URL)) {
    issues.push(issue("database", "PRODUCTION_DATABASE_URL_REQUIRED"));
  }
  if (text(env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY) !== "required") {
    issues.push(issue("database", "OPERATIONAL_POSTGRES_AUTHORITY_REQUIRED"));
  }
  // This is evaluated BEFORE the HTTP listener starts (index.ts). Production
  // must pin the exact tenant runtime LOGIN role, not merely advertise that
  // a database exists. Actual role privileges and RLS remain SQL-gated.
  const selectedRuntimeRole = text(env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(selectedRuntimeRole)) {
    issues.push(issue("database", "PRODUCTION_POSTGRES_RUNTIME_ROLE_REQUIRED"));
  } else if (FIELD002_FORBIDDEN_RUNTIME_ROLE_NAMES.has(selectedRuntimeRole)) {
    issues.push(issue("database", "FIELD002_LEGACY_OR_OWNER_RUNTIME_ROLE_FORBIDDEN"));
  }
  const tenantUrlLogin = postgresLoginName(env.DATABASE_URL);
  // Preserve a single primary rejection for an already forbidden role;
  // a secondary mismatch must not obscure the unsafe-role reason.
  if (tenantUrlLogin && /^[a-z_][a-z0-9_]{0,62}$/.test(selectedRuntimeRole) &&
      !FIELD002_FORBIDDEN_RUNTIME_ROLE_NAMES.has(selectedRuntimeRole) &&
      tenantUrlLogin !== selectedRuntimeRole) {
    issues.push(issue("database", "FIELD002_TENANT_DATABASE_LOGIN_MISMATCH"));
  }
  const authUrlLogin = postgresLoginName(env.FAWRI_AUTH_DATABASE_URL);
  if (!authUrlLogin) {
    issues.push(issue("auth", "FIELD002_AUTH_DATABASE_URL_REQUIRED"));
  } else if (authUrlLogin === tenantUrlLogin ||
      authUrlLogin === selectedRuntimeRole ||
      FIELD002_FORBIDDEN_RUNTIME_ROLE_NAMES.has(authUrlLogin)) {
    issues.push(issue("auth", "FIELD002_AUTH_DATABASE_LOGIN_UNSAFE"));
  }
  if (authUrlLogin && tenantUrlLogin) {
    const tenantTarget = postgresDatabaseTarget(env.DATABASE_URL);
    const authTarget = postgresDatabaseTarget(env.FAWRI_AUTH_DATABASE_URL);
    if (!tenantTarget || !authTarget || tenantTarget !== authTarget) {
      issues.push(issue("auth", "FIELD002_AUTH_DATABASE_TARGET_MISMATCH"));
    }
  }
  // The operator directory and receipt-review issuer is a third authority,
  // not an alias for tenant data or the authentication/session issuer.
  // A syntactically valid URL alone is insufficient to accept a release.
  const operatorUrlLogin = postgresLoginName(env.FAWRI_OPERATOR_DATABASE_URL);
  if (!operatorUrlLogin) {
    issues.push(issue("database", "FIELD002_OPERATOR_DATABASE_URL_REQUIRED"));
  } else if (operatorUrlLogin === tenantUrlLogin ||
      operatorUrlLogin === selectedRuntimeRole ||
      operatorUrlLogin === authUrlLogin ||
      FIELD002_FORBIDDEN_RUNTIME_ROLE_NAMES.has(operatorUrlLogin)) {
    issues.push(issue("database", "FIELD002_OPERATOR_DATABASE_LOGIN_UNSAFE"));
  }
  if (operatorUrlLogin && tenantUrlLogin) {
    const tenantTarget = postgresDatabaseTarget(env.DATABASE_URL);
    const operatorTarget = postgresDatabaseTarget(env.FAWRI_OPERATOR_DATABASE_URL);
    if (!tenantTarget || !operatorTarget || tenantTarget !== operatorTarget) {
      issues.push(issue("database", "FIELD002_OPERATOR_DATABASE_TARGET_MISMATCH"));
    }
  }
  if (text(env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY) !== "required") {
    issues.push(issue("database", "SUBSCRIPTION_POSTGRES_AUTHORITY_REQUIRED"));
  }
  if (text(env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY) !== "required") {
    issues.push(issue("auth", "AUTH_POSTGRES_SESSION_AUTHORITY_REQUIRED"));
  }
  if (text(env.FAWRI_AUTH_SECURITY_SECRET).length < 32) {
    issues.push(issue("auth", "AUTH_SECURITY_SECRET_REQUIRED"));
  }
  if (!isSafeAllowedOrigins(env.FAWRI_ALLOWED_ORIGINS)) {
    issues.push(issue("http", "HTTP_ALLOWED_ORIGINS_REQUIRED"));
  }

  const serviceVersion = text(env.FAWRI_SERVICE_VERSION);
  if (!serviceVersion || serviceVersion === "unknown" || !SAFE_SERVICE_VERSION.test(serviceVersion)) {
    issues.push(issue("observability", "SERVICE_VERSION_REQUIRED"));
  }
  if (text(env.FAWRI_OBSERVABILITY_BEARER_TOKEN).length < 32) {
    issues.push(issue("observability", "OBSERVABILITY_BEARER_TOKEN_REQUIRED"));
  }

  return issues;
}

export function assertProductionRuntimeConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const issues = getProductionRuntimeConfigurationIssues(env);
  if (issues.length === 0) return;
  const error = Object.assign(
    new Error("production release configuration is incomplete"),
    {
      code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
      issueCodes: issues.map((item) => item.code),
    },
  );
  throw error;
}

export function metaConnectionActivationConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (text(env.FAWRI_META_CUTOVER_READY) !== "1") return false;
  if (text(env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY) !== "required") return false;
  if (env.NODE_ENV === "production") {
    if (text(env.FAWRI_META_REPLY_TRANSPORT).toLowerCase() !== "live") return false;
    if (text(env.FAWRI_META_CREDENTIAL_PROVIDER).toLowerCase() !== "aws-kms") return false;
    if (!isSafeProductionRedirect(env.META_REDIRECT_URI)) return false;
  } else if (!text(env.META_REDIRECT_URI)) {
    return false;
  }
  return Boolean(
    text(env.META_APP_ID) &&
      text(env.META_APP_SECRET) &&
      text(env.META_CONFIG_ID) &&
      text(env.META_VERIFY_TOKEN),
  );
}

export function getProductionExternalLaunchBlockers(): ProductionReleaseIssue[] {
  return [
    issue("meta", "META_PRODUCTION_INTEGRATION_NOT_ACTIVATED"),
    issue("knowledge", "AI_PRODUCTION_INTEGRATION_NOT_ACTIVATED"),
    issue("billing", "SAAS_BILLING_PRODUCTION_PROVIDER_UNAVAILABLE"),
    issue("backup", "PRODUCTION_BACKUP_RESTORE_EXTERNAL_PROOF_REQUIRED"),
    issue("storage", "SUPPORT_IMAGE_DURABLE_STORAGE_EXTERNAL_PROOF_REQUIRED"),
  ];
}

export function getProductionLaunchReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ProductionLaunchReadiness {
  const runtimeIssues = getProductionRuntimeConfigurationIssues(env);
  const externalBlockers = productionReleaseGateRequired(env)
    ? getProductionExternalLaunchBlockers()
    : [];
  return {
    runtime_ready: runtimeIssues.length === 0,
    launch_ready: runtimeIssues.length === 0 && externalBlockers.length === 0,
    runtime_issues: runtimeIssues,
    external_blockers: externalBlockers,
  };
}
