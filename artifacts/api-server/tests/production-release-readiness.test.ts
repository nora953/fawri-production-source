import { FIELD002_R2_BRANCHES, FIELD002_R2_PROJECT_ID } from "../../../scripts/lib/field002-r2-precommercial-source-admission.mjs";
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

// Build test-only URLs at runtime. Never commit credential-shaped URI literals:
 // security CI deliberately treats such literals as suspicious even in tests.
function fakePgUrl(user: string, host = "db.internal", db = "fawri", port = 5432): string {
  const uri = new URL(`postgresql://${host}:${port}/${db}`);
  uri.username = user;
  uri.password = "synthetic-fixture-not-a-credential";
  return uri.toString();
}

function firstCommercialManifest(): Record<string, unknown> {
  return {
    intent: "first_commercial_launch",
    project_id: FIELD002_R2_PROJECT_ID,
    target_branch_id: FIELD002_R2_BRANCHES.production,
    source_mode: "fresh_schema_migrations_only",
    source_branch_id: null,
    source_backup_id: null,
    data_import_requested: false,
    restore_requested: false,
  };
}

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_PRODUCTION_RELEASE_GATE: "required",
    FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON: JSON.stringify(firstCommercialManifest()),
    DATABASE_URL: fakePgUrl("fawri_restricted_runtime"),
    FAWRI_AUTH_DATABASE_URL: fakePgUrl("fawri_auth_issuer"),
    FAWRI_OPERATOR_DATABASE_URL: fakePgUrl("fawri_operator_issuer"),
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_restricted_runtime",
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


test("FIELD002 first commercial startup denies legacy staging and unsafe data-source plans", () => {
  assert.deepEqual(getProductionRuntimeConfigurationIssues(productionEnv()), []);
  const source = firstCommercialManifest();
  for (const forbidden of [
    undefined,
    "",
    "not-json",
    JSON.stringify({ ...source, data_import_requested: true }),
    JSON.stringify({ ...source, restore_requested: true }),
    JSON.stringify({ ...source, source_mode: "backup_and_restore" }),
    JSON.stringify({ ...source, source_branch_id: FIELD002_R2_BRANCHES.cleanRehearsal }),
    JSON.stringify({ ...source, source_backup_id: "precommercial-archive" }),
    JSON.stringify({ ...source, target_branch_id: FIELD002_R2_BRANCHES.staging }),
    JSON.stringify({ ...source, arbitrary_unsafe_field: true }),
  ]) {
    const issues = getProductionRuntimeConfigurationIssues(productionEnv({
      FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON: forbidden,
    }));
    const expected = !forbidden
      ? "FIELD002_FIRST_COMMERCIAL_SOURCE_MANIFEST_REQUIRED"
      : "FIELD002_FIRST_COMMERCIAL_SOURCE_MANIFEST_FORBIDDEN";
    assert.ok(issues.some((issue) => issue.code === expected), expected);
    assert.throws(() => assertProductionRuntimeConfiguration(productionEnv({
      FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON: forbidden,
    })), /production release configuration is incomplete/);
  }

  const knownOriginalHost = "ep-plain-leaf-b1wtzjr3.c-5.eu-central-1.aws.neon.tech";
  for (const host of [knownOriginalHost, knownOriginalHost.replace(".", "-pooler.")]) {
    for (const key of ["DATABASE_URL", "FAWRI_AUTH_DATABASE_URL",
      "FAWRI_OPERATOR_DATABASE_URL"] as const) {
      const role = key === "DATABASE_URL" ? "fawri_restricted_runtime"
        : key === "FAWRI_AUTH_DATABASE_URL" ? "fawri_auth_issuer"
        : "fawri_operator_issuer";
      const issues = getProductionRuntimeConfigurationIssues(productionEnv({
        [key]: fakePgUrl(role, host),
      }));
      assert.ok(issues.some((issue) => issue.code === "FIELD002_ORIGINAL_STAGING_DATABASE_FORBIDDEN"),
        `${key}: ${host}`);
    }
  }
  // Declarative compatibility never certifies a live empty branch or deploy.
  assert.deepEqual(getProductionRuntimeConfigurationIssues(productionEnv()), []);
});

test("FIELD002 production refuses missing, malformed or reused auth PostgreSQL login before listener", () => {
  for (const value of [
    "", "  ", "not-a-url", "https://not-a-database.test",
    fakePgUrl(""),
    fakePgUrl("%2X"),
  ]) {
    const env = productionEnv({ FAWRI_AUTH_DATABASE_URL: value });
    const issues = getProductionRuntimeConfigurationIssues(env);
    assert.ok(issues.some(item => item.code === "FIELD002_AUTH_DATABASE_URL_REQUIRED"), value);
    assert.throws(
      () => assertProductionRuntimeConfiguration(env),
      (error: unknown) => (error as { issueCodes?: string[] }).issueCodes
        ?.includes("FIELD002_AUTH_DATABASE_URL_REQUIRED") === true,
    );
  }
  for (const username of [
    "fawri_restricted_runtime", "fawri_staging_runtime",
    "fawri_staging_rls_runtime", "neondb_owner", "neon_superuser",
    "cloud_admin", "neon_service", "pg_database_owner", "postgres",
  ]) {
    const env = productionEnv({
      FAWRI_AUTH_DATABASE_URL: fakePgUrl(username),
    });
    assert.ok(getProductionRuntimeConfigurationIssues(env)
      .some(item => item.code === "FIELD002_AUTH_DATABASE_LOGIN_UNSAFE"), username);
  }
  assert.deepEqual(getProductionRuntimeConfigurationIssues(productionEnv()), []);
});

test("FIELD002 production requires auth and tenant to target the same PostgreSQL branch/database", () => {
  for (const auth of [
    fakePgUrl("fawri_auth_issuer", "other-db.internal"),
    fakePgUrl("fawri_auth_issuer", "db.internal", "other_db"),
    fakePgUrl("fawri_auth_issuer", "db.internal", "fawri", 5433),
  ]) {
    const env = productionEnv({ FAWRI_AUTH_DATABASE_URL: auth });
    assert.ok(getProductionRuntimeConfigurationIssues(env)
      .some(item => item.code === "FIELD002_AUTH_DATABASE_TARGET_MISMATCH"), auth);
    assert.throws(() => assertProductionRuntimeConfiguration(env), {
      code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
    });
  }
  // Neon pooled and direct endpoints identify the same compute; distinct
  // arbitrary hosts and databases do not.
  const neon = productionEnv({
    DATABASE_URL: fakePgUrl("fawri_restricted_runtime", "ep-test-case.c-5.eu-central-1.aws.neon.tech", "neondb"),
    FAWRI_AUTH_DATABASE_URL: fakePgUrl("fawri_auth_issuer", "ep-test-case-pooler.c-5.eu-central-1.aws.neon.tech", "neondb"),
    FAWRI_OPERATOR_DATABASE_URL: fakePgUrl("fawri_operator_issuer", "ep-test-case.c-5.eu-central-1.aws.neon.tech", "neondb"),
  });
  assert.deepEqual(getProductionRuntimeConfigurationIssues(neon), []);
});

test("FIELD002 refuses PostgreSQL URL query overrides of target or authority for all three LOGINs", () => {
  const overrides = [
    ["host", "other.example"],
    ["hostaddr", "192.0.2.10"],
    ["port", "6543"],
    ["dbname", "wrong_db"],
    ["database", "wrong_db"],
    ["user", "neondb_owner"],
    ["password", "overridden"],
    ["service", "privileged"],
    ["servicefile", "override.conf"],
    ["options", "-c search_path=public"],
    ["sslmode", "disable"],
    ["sslmode", "prefer"],
    ["channel_binding", "disable"],
    ["SSLMode", "disable"],
    ["HOST", "other.example"],
    ["sslmode", "require&SSLMode=disable"],
  ] as const;
  const append = (role: string, query: string): string =>
    fakePgUrl(role) + "?" + query;
  for (const [key, value] of overrides) {
    const query = key + "=" + encodeURIComponent(value);
    for (const [urlVar, expectedCode] of [
      ["DATABASE_URL", "PRODUCTION_DATABASE_URL_REQUIRED"],
      ["FAWRI_AUTH_DATABASE_URL", "FIELD002_AUTH_DATABASE_URL_REQUIRED"],
      ["FAWRI_OPERATOR_DATABASE_URL", "FIELD002_OPERATOR_DATABASE_URL_REQUIRED"],
    ] as const) {
      const env = productionEnv({ [urlVar]: append(
        urlVar === "DATABASE_URL" ? "fawri_restricted_runtime" :
          urlVar === "FAWRI_AUTH_DATABASE_URL" ? "fawri_auth_issuer" :
            "fawri_operator_issuer",
        query,
      ) });
      const issues = getProductionRuntimeConfigurationIssues(env);
      assert.ok(issues.some(item => item.code === expectedCode),
        "unsafe " + key + " must be rejected for " + urlVar);
      assert.throws(() => assertProductionRuntimeConfiguration(env), {
        code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
      });
    }
  }
  // Distinct query keys with the same case-insensitive identity must not
  // permit a later override, regardless of the value in the first option.
  const duplicate = productionEnv({
    DATABASE_URL: append("fawri_restricted_runtime",
      "sslmode=require&SSLMODE=disable"),
  });
  assert.ok(getProductionRuntimeConfigurationIssues(duplicate)
    .some(item => item.code === "PRODUCTION_DATABASE_URL_REQUIRED"));
});

test("FIELD002 permits ordinary encrypted Neon URLs with non-routing connection metadata", () => {
  const query = "?sslmode=require&channel_binding=require&application_name=fawri-api&connect_timeout=10";
  const neon = "ep-test-case.c-5.eu-central-1.aws.neon.tech";
  const env = productionEnv({
    DATABASE_URL: fakePgUrl("fawri_restricted_runtime", neon, "neondb") + query,
    FAWRI_AUTH_DATABASE_URL: fakePgUrl("fawri_auth_issuer",
      "ep-test-case-pooler.c-5.eu-central-1.aws.neon.tech", "neondb") + query,
    FAWRI_OPERATOR_DATABASE_URL: fakePgUrl("fawri_operator_issuer",
      neon, "neondb") + query,
  });
  assert.deepEqual(getProductionRuntimeConfigurationIssues(env), []);
  assert.doesNotThrow(() => assertProductionRuntimeConfiguration(env));
});

test("FIELD002 production requires a separate operator LOGIN on the same database", () => {
  for (const value of [
    "", "not-a-postgres-url", "https://invalid.example",
    fakePgUrl(""), fakePgUrl("%2X"),
  ]) {
    const env = productionEnv({ FAWRI_OPERATOR_DATABASE_URL: value });
    assert.ok(getProductionRuntimeConfigurationIssues(env).some(
      item => item.code === "FIELD002_OPERATOR_DATABASE_URL_REQUIRED"), value);
    assert.throws(() => assertProductionRuntimeConfiguration(env), {
      code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
    });
  }
  for (const role of [
    "fawri_restricted_runtime", "fawri_auth_issuer",
    "fawri_staging_runtime", "fawri_staging_rls_runtime",
    "neondb_owner", "neon_superuser",
    "cloud_admin", "neon_service", "pg_database_owner", "postgres",
  ]) {
    const env = productionEnv({ FAWRI_OPERATOR_DATABASE_URL: fakePgUrl(role) });
    assert.ok(getProductionRuntimeConfigurationIssues(env).some(
      item => item.code === "FIELD002_OPERATOR_DATABASE_LOGIN_UNSAFE"), role);
  }
  for (const url of [
    fakePgUrl("fawri_operator_issuer", "wrong-db.internal"),
    fakePgUrl("fawri_operator_issuer", "db.internal", "other_db"),
    fakePgUrl("fawri_operator_issuer", "db.internal", "fawri", 5433),
  ]) {
    const env = productionEnv({ FAWRI_OPERATOR_DATABASE_URL: url });
    assert.ok(getProductionRuntimeConfigurationIssues(env).some(
      item => item.code === "FIELD002_OPERATOR_DATABASE_TARGET_MISMATCH"), url);
  }
  const neon = productionEnv({
    DATABASE_URL: fakePgUrl("fawri_restricted_runtime",
      "ep-test-case.c-5.eu-central-1.aws.neon.tech", "neondb"),
    FAWRI_AUTH_DATABASE_URL: fakePgUrl("fawri_auth_issuer",
      "ep-test-case-pooler.c-5.eu-central-1.aws.neon.tech", "neondb"),
    FAWRI_OPERATOR_DATABASE_URL: fakePgUrl("fawri_operator_issuer",
      "ep-test-case.c-5.eu-central-1.aws.neon.tech", "neondb"),
  });
  assert.deepEqual(getProductionRuntimeConfigurationIssues(neon), []);
  assert.deepEqual(getProductionRuntimeConfigurationIssues({
    ...productionEnv(), FAWRI_DEPLOYMENT_MODE: "staging", FAWRI_OPERATOR_DATABASE_URL: "",
  }), []);
});

test("FIELD002 forbids observed provider/admin tenant URL logins even with matching expected role", () => {
  for (const role of ["cloud_admin", "neon_service", "pg_database_owner", "postgres"]) {
    const env = productionEnv({
      DATABASE_URL: fakePgUrl(role),
      FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: role,
    });
    const issues = getProductionRuntimeConfigurationIssues(env);
    assert.ok(issues.some((i) => i.code === "FIELD002_LEGACY_OR_OWNER_RUNTIME_ROLE_FORBIDDEN"),
      role);
    assert.equal(issues.some((i) => i.code === "FIELD002_TENANT_DATABASE_LOGIN_MISMATCH"),
      false, "deny by dangerous principal, not a secondary name mismatch");
    assert.throws(() => assertProductionRuntimeConfiguration(env), {
      code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
    });
  }
});

test("FIELD002 production enforces DATABASE_URL LOGIN matches reviewed tenant identity", () => {
  const mismatch = productionEnv({
    DATABASE_URL: fakePgUrl("another_restricted_role"),
  });
  assert.ok(getProductionRuntimeConfigurationIssues(mismatch)
    .some(item => item.code === "FIELD002_TENANT_DATABASE_LOGIN_MISMATCH"));
  assert.throws(() => assertProductionRuntimeConfiguration(mismatch), {
    code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
  });
  const valid = productionEnv({
    DATABASE_URL: fakePgUrl("fawri_restricted_runtime"),
    FAWRI_AUTH_DATABASE_URL: fakePgUrl("fawri_auth_issuer"),
  });
  assert.deepEqual(getProductionRuntimeConfigurationIssues(valid), []);
  const staging = { ...mismatch, FAWRI_DEPLOYMENT_MODE: "staging",
    FAWRI_AUTH_DATABASE_URL: "" };
  assert.deepEqual(getProductionRuntimeConfigurationIssues(staging), []);
});

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

test("FIELD002 production startup config requires an explicit approved tenant runtime role", () => {
  for (const bad of ["", "  ", "<role>", "bad role", "neondb.owner"]) {
    const env = productionEnv({ FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: bad });
    const issues = getProductionRuntimeConfigurationIssues(env);
    assert.ok(issues.some(issue => issue.code === "PRODUCTION_POSTGRES_RUNTIME_ROLE_REQUIRED"), bad);
    assert.throws(() => assertProductionRuntimeConfiguration(env), {
      code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
    });
  }
  assert.deepEqual(getProductionRuntimeConfigurationIssues(productionEnv()), []);
  // NODE_ENV is not the sole source of deployment authority: an explicit
  // production mode must still refuse a missing role even in a test process.
  const explicit = productionEnv({
    NODE_ENV: "test",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "",
  });
  assert.ok(getProductionRuntimeConfigurationIssues(explicit)
    .some(issue => issue.code === "PRODUCTION_POSTGRES_RUNTIME_ROLE_REQUIRED"));
  assert.deepEqual(getProductionRuntimeConfigurationIssues({
    NODE_ENV: "production", FAWRI_DEPLOYMENT_MODE: "staging",
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "",
  }), []);
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
  assert.ok(issues.length >= 5);
  assert.ok(issues.some((item) => item.code === "PRODUCTION_DATABASE_URL_REQUIRED"));
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

test("core production runtime is provider-neutral while external launch stays blocked", () => {
  const env = productionEnv({
    FAWRI_META_CUTOVER_READY: "",
    FAWRI_META_REPLY_TRANSPORT: "",
    FAWRI_META_CREDENTIAL_PROVIDER: "",
    FAWRI_META_AWS_REGION: "",
    FAWRI_META_AWS_KMS_KEY_ARN: "",
    FAWRI_META_AWS_CURRENT_DEK_ID: "",
    FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON: "",
    META_APP_ID: "",
    META_APP_SECRET: "",
    META_CONFIG_ID: "",
    META_REDIRECT_URI: "",
    META_VERIFY_TOKEN: "",
    FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "",
    FAWRI_KNOWLEDGE_TRANSLATION_PROVIDER: "",
    FAWRI_KNOWLEDGE_AI_PROVIDER: "",
    OPENAI_API_KEY: "",
    FAWRI_OPENAI_MODEL: "",
  });
  assert.deepEqual(getProductionRuntimeConfigurationIssues(env), []);
  assert.doesNotThrow(() => assertProductionRuntimeConfiguration(env));
  assert.equal(metaConnectionActivationConfigured(env), false);

  const readiness = getProductionLaunchReadiness(env);
  assert.equal(readiness.runtime_ready, true);
  assert.equal(readiness.launch_ready, false);
  assert.deepEqual(
    readiness.external_blockers.map((item) => item.code).sort(),
    [
      "AI_PRODUCTION_INTEGRATION_NOT_ACTIVATED",
      "META_PRODUCTION_INTEGRATION_NOT_ACTIVATED",
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
    assert.deepEqual(getProductionRuntimeConfigurationIssues(env), []);
    assert.equal(
      getProductionLaunchReadiness(env).external_blockers.some(
        (item) => item.code === "META_PRODUCTION_INTEGRATION_NOT_ACTIVATED",
      ),
      true,
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
    FAWRI_DISABLE_JOB_WORKERS: "0",
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


test("FIELD002 rejects historic broad-grant and owner identities as production runtime even if flags change", () => {
  for (const role of [
    "fawri_staging_runtime",
    "fawri_staging_rls_runtime",
    "neondb_owner",
    "neon_superuser",
    "cloud_admin",
    "neon_service",
    "pg_database_owner",
    "postgres",
  ]) {
    const env = productionEnv({ FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: role });
    assert.deepEqual(
      getProductionRuntimeConfigurationIssues(env).filter(issue => issue.area === "database"),
      [{ area: "database", code: "FIELD002_LEGACY_OR_OWNER_RUNTIME_ROLE_FORBIDDEN" }],
      role,
    );
    assert.throws(() => assertProductionRuntimeConfiguration(env), {
      code: "PRODUCTION_RELEASE_CONFIGURATION_INVALID",
      issueCodes: ["FIELD002_LEGACY_OR_OWNER_RUNTIME_ROLE_FORBIDDEN"],
    });
    // The original branch's staging mode remains usable for diagnostics,
    // but it does not turn a legacy identity into a production tenant login.
    assert.deepEqual(getProductionRuntimeConfigurationIssues({
      ...env, FAWRI_DEPLOYMENT_MODE: "staging",
    }), []);
  }
  assert.deepEqual(getProductionRuntimeConfigurationIssues(productionEnv({
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_tenant_runtime_v2",
    DATABASE_URL: fakePgUrl("fawri_tenant_runtime_v2"),
  })), []);
});
