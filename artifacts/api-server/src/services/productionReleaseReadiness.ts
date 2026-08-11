export const PRODUCTION_RELEASE_GATE_ENV = "FAWRI_PRODUCTION_RELEASE_GATE";

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
    | "backup";
};

export type ProductionLaunchReadiness = {
  runtime_ready: boolean;
  launch_ready: boolean;
  runtime_issues: ProductionReleaseIssue[];
  external_blockers: ProductionReleaseIssue[];
};

const SAFE_SERVICE_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SAFE_DEK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
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

export function productionReleaseGateRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "production" &&
    text(env[PRODUCTION_RELEASE_GATE_ENV]).toLowerCase() === "required";
}

export function getProductionRuntimeConfigurationIssues(
  env: NodeJS.ProcessEnv = process.env,
): ProductionReleaseIssue[] {
  if (!productionReleaseGateRequired(env)) return [];

  const issues: ProductionReleaseIssue[] = [];

  if (!isPostgresUrl(env.DATABASE_URL)) {
    issues.push(issue("database", "PRODUCTION_DATABASE_URL_REQUIRED"));
  }
  if (text(env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY) !== "required") {
    issues.push(issue("database", "OPERATIONAL_POSTGRES_AUTHORITY_REQUIRED"));
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

  if (text(env.FAWRI_META_CUTOVER_READY) !== "1") {
    issues.push(issue("meta", "META_CUTOVER_READY_REQUIRED"));
  }
  if (text(env.FAWRI_META_REPLY_TRANSPORT).toLowerCase() !== "live") {
    issues.push(issue("meta", "META_LIVE_REPLY_TRANSPORT_REQUIRED"));
  }
  if (text(env.FAWRI_DISABLE_JOB_WORKERS) === "1") {
    issues.push(issue("meta", "META_JOB_WORKERS_REQUIRED"));
  }
  if (text(env.FAWRI_META_CREDENTIAL_PROVIDER).toLowerCase() !== "aws-kms") {
    issues.push(issue("kms", "META_AWS_KMS_PROVIDER_REQUIRED"));
  }
  if (!text(env.FAWRI_META_AWS_REGION)) {
    issues.push(issue("kms", "META_AWS_REGION_REQUIRED"));
  }
  if (!AWS_KMS_KEY_ARN.test(text(env.FAWRI_META_AWS_KMS_KEY_ARN))) {
    issues.push(issue("kms", "META_AWS_KMS_KEY_ARN_REQUIRED"));
  }
  if (!wrappedDekManifestValid(env)) {
    issues.push(issue("kms", "META_AWS_WRAPPED_DEK_MANIFEST_REQUIRED"));
  }

  if (!text(env.META_APP_ID)) {
    issues.push(issue("meta", "META_APP_ID_REQUIRED"));
  }
  if (text(env.META_APP_SECRET).length < 16) {
    issues.push(issue("meta", "META_APP_SECRET_REQUIRED"));
  }
  if (!text(env.META_CONFIG_ID)) {
    issues.push(issue("meta", "META_CONFIG_ID_REQUIRED"));
  }
  if (!isSafeProductionRedirect(env.META_REDIRECT_URI)) {
    issues.push(issue("meta", "META_REDIRECT_URI_REQUIRED"));
  }
  if (text(env.META_VERIFY_TOKEN).length < 32) {
    issues.push(issue("meta", "META_VERIFY_TOKEN_REQUIRED"));
  }

  if (text(env.FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER).toLowerCase() !== "openai") {
    issues.push(issue("knowledge", "KNOWLEDGE_OPENAI_PROVIDER_REQUIRED"));
  }
  if (text(env.OPENAI_API_KEY).length < 20) {
    issues.push(issue("knowledge", "OPENAI_API_KEY_REQUIRED"));
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
    issue("billing", "SAAS_BILLING_PRODUCTION_PROVIDER_UNAVAILABLE"),
    issue("backup", "PRODUCTION_BACKUP_RESTORE_EXTERNAL_PROOF_REQUIRED"),
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
