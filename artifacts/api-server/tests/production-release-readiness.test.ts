import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertProductionRuntimeConfiguration,
  getProductionLaunchReadiness,
  getProductionRuntimeConfigurationIssues,
  metaConnectionActivationConfigured,
} from "../src/services/productionReleaseReadiness";

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_PRODUCTION_RELEASE_GATE: "required",
    DATABASE_URL: "postgresql://fawri:test@db.internal:5432/fawri",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_AUTH_SECURITY_SECRET: "auth-secret-at-least-thirty-two-characters-long",
    FAWRI_ALLOWED_ORIGINS: "https://app.fawri.example",
    FAWRI_META_CUTOVER_READY: "1",
    FAWRI_META_REPLY_TRANSPORT: "live",
    FAWRI_DISABLE_JOB_WORKERS: "0",
    FAWRI_META_CREDENTIAL_PROVIDER: "aws-kms",
    FAWRI_META_AWS_REGION: "us-east-1",
    FAWRI_META_AWS_KMS_KEY_ARN:
      "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012",
    FAWRI_META_AWS_CURRENT_DEK_ID: "meta-dek-current",
    FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON: JSON.stringify({
      "meta-dek-current": "dGVzdC13cmFwcGVkLWRlay1jaXBoZXJ0ZXh0",
    }),
    META_APP_ID: "1234567890",
    META_APP_SECRET: "meta-app-secret-long-enough",
    META_CONFIG_ID: "1234567890",
    META_REDIRECT_URI: "https://api.fawri.example/api/meta/callback",
    META_VERIFY_TOKEN: "meta-verify-token-at-least-thirty-two-characters",
    FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "openai",
    FAWRI_KNOWLEDGE_TRANSLATION_PROVIDER: "openai",
    FAWRI_KNOWLEDGE_AI_PROVIDER: "openai",
    OPENAI_API_KEY: "test-openai-api-key-not-real-production-secret",
    FAWRI_OPENAI_MODEL: "approved-response-model",
    FAWRI_SERVICE_VERSION: "2026.08.12-rc1",
    FAWRI_OBSERVABILITY_BEARER_TOKEN:
      "observability-token-at-least-thirty-two-characters",
    ...overrides,
  };
}

test("NODE_ENV production fails closed even when the legacy release-gate variable is omitted", () => {
  const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  const issues = getProductionRuntimeConfigurationIssues(env);
  assert.ok(issues.some((item) => item.code === "PRODUCTION_DATABASE_URL_REQUIRED"));
  assert.throws(
    () => assertProductionRuntimeConfiguration(env),
    (error: unknown) =>
      (error as { code?: string }).code === "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
  );
});

test("staging must opt out explicitly from production-only provider requirements", () => {
  const env = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "staging",
  } as NodeJS.ProcessEnv;
  assert.deepEqual(getProductionRuntimeConfigurationIssues(env), []);
  assert.doesNotThrow(() => assertProductionRuntimeConfiguration(env));
});

test("invalid explicit deployment mode fails closed", () => {
  const env = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "prod-ish",
  } as NodeJS.ProcessEnv;
  const issues = getProductionRuntimeConfigurationIssues(env);
  assert.ok(issues.some((item) => item.code === "DEPLOYMENT_MODE_INVALID"));
  assert.throws(() => assertProductionRuntimeConfiguration(env));
});

test("required production release gate fails closed with safe issue codes", () => {
  const env = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_PRODUCTION_RELEASE_GATE: "required",
    FAWRI_AUTH_SECURITY_SECRET: "do-not-leak-this-value",
  } as NodeJS.ProcessEnv;
  const issues = getProductionRuntimeConfigurationIssues(env);
  assert.ok(issues.length > 8);
  assert.ok(issues.some((item) => item.code === "PRODUCTION_DATABASE_URL_REQUIRED"));
  assert.ok(issues.some((item) => item.code === "META_AWS_KMS_PROVIDER_REQUIRED"));
  assert.ok(issues.some((item) => item.code === "META_REDIRECT_URI_REQUIRED"));
  assert.ok(issues.some((item) => item.code === "HTTP_ALLOWED_ORIGINS_REQUIRED"));

  assert.throws(
    () => assertProductionRuntimeConfiguration(env),
    (error: unknown) => {
      const record = error as Error & { code?: string; issueCodes?: string[] };
      assert.equal(record.code, "PRODUCTION_RELEASE_CONFIGURATION_INVALID");
      assert.ok(record.issueCodes?.includes("PRODUCTION_DATABASE_URL_REQUIRED"));
      assert.equal(record.message.includes("do-not-leak-this-value"), false);
      return true;
    },
  );
});

test("synthetic complete runtime configuration passes code-level release readiness", () => {
  const env = productionEnv();
  assert.deepEqual(getProductionRuntimeConfigurationIssues(env), []);
  assert.doesNotThrow(() => assertProductionRuntimeConfiguration(env));
  assert.equal(metaConnectionActivationConfigured(env), true);

  const readiness = getProductionLaunchReadiness(env);
  assert.equal(readiness.runtime_ready, true);
  assert.equal(readiness.launch_ready, false);
  assert.deepEqual(
    readiness.external_blockers.map((item) => item.code).sort(),
    [
      "PRODUCTION_BACKUP_RESTORE_EXTERNAL_PROOF_REQUIRED",
      "SAAS_BILLING_PRODUCTION_PROVIDER_UNAVAILABLE",
      "SUPPORT_IMAGE_DURABLE_STORAGE_EXTERNAL_PROOF_REQUIRED",
    ].sort(),
  );
});

test("Meta OAuth never activates with a Replit or insecure redirect", () => {
  for (const redirect of [
    "https://example.replit.dev/api/meta/callback",
    "http://api.fawri.example/api/meta/callback",
    "https://localhost/api/meta/callback",
  ]) {
    const env = productionEnv({ META_REDIRECT_URI: redirect });
    assert.equal(metaConnectionActivationConfigured(env), false);
    assert.ok(
      getProductionRuntimeConfigurationIssues(env).some(
        (item) => item.code === "META_REDIRECT_URI_REQUIRED",
      ),
    );
  }
});

test("Meta OAuth remains blocked when any explicit production cutover prerequisite is absent", () => {
  assert.equal(
    metaConnectionActivationConfigured(
      productionEnv({ FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "" }),
    ),
    false,
  );
  assert.equal(
    metaConnectionActivationConfigured(
      productionEnv({ FAWRI_META_CREDENTIAL_PROVIDER: "environment" }),
    ),
    false,
  );
  assert.equal(
    metaConnectionActivationConfigured(
      productionEnv({ FAWRI_META_REPLY_TRANSPORT: "fake" }),
    ),
    false,
  );
});

test("legacy Meta router contains no Replit redirect fallback", () => {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const routerPath = path.resolve(current, "../src/routes/indexModulePart1.ts");
  const source = fs.readFileSync(routerPath, "utf8");
  assert.equal(source.includes(".replit.dev/api/meta/callback"), false);
  assert.equal(source.includes(".repl.co/api/meta/callback"), false);
  assert.match(
    source,
    /export const META_REDIRECT_URI = String\(process\.env\.META_REDIRECT_URI \|\| ""\)\.trim\(\);/,
  );
});

test("production env example stays aligned with the runtime release gate", () => {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(current, "../../..");
  const readinessSource = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/productionReleaseReadiness.ts",
    ),
    "utf8",
  );
  const example = fs.readFileSync(
    path.join(repoRoot, ".env.production.example"),
    "utf8",
  );

  const referencedEnvNames = new Set(
    [...readinessSource.matchAll(/env\.([A-Z][A-Z0-9_]*)/g)].map(
      (match) => match[1],
    ),
  );
  referencedEnvNames.add("FAWRI_PRODUCTION_RELEASE_GATE");
  referencedEnvNames.add("FAWRI_DEPLOYMENT_MODE");

  const exampleValues = new Map<string, string>();
  for (const rawLine of example.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    assert.ok(match, `invalid production env example line: ${line}`);
    exampleValues.set(match[1], match[2]);
  }

  for (const name of referencedEnvNames) {
    assert.equal(
      exampleValues.has(name),
      true,
      `.env.production.example is missing ${name}`,
    );
  }

  const expectedFixedValues: Record<string, string> = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_PRODUCTION_RELEASE_GATE: "required",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_META_CUTOVER_READY: "1",
    FAWRI_META_REPLY_TRANSPORT: "live",
    FAWRI_DISABLE_JOB_WORKERS: "0",
    FAWRI_META_CREDENTIAL_PROVIDER: "aws-kms",
    FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "openai",
    FAWRI_KNOWLEDGE_TRANSLATION_PROVIDER: "openai",
    FAWRI_KNOWLEDGE_AI_PROVIDER: "openai",
  };

  for (const [name, expected] of Object.entries(expectedFixedValues)) {
    assert.equal(exampleValues.get(name), expected, `${name} drifted`);
  }

  for (const secretName of [
    "DATABASE_URL",
    "FAWRI_AUTH_SECURITY_SECRET",
    "FAWRI_META_AWS_KMS_KEY_ARN",
    "FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON",
    "META_APP_SECRET",
    "META_VERIFY_TOKEN",
    "OPENAI_API_KEY",
    "FAWRI_OBSERVABILITY_BEARER_TOKEN",
  ]) {
    assert.match(
      exampleValues.get(secretName) || "",
      /<[^>]+>/,
      `${secretName} must remain a non-secret placeholder in source control`,
    );
  }
});

