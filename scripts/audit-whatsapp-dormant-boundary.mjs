import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const apiRoot = path.join(repoRoot, "artifacts", "api-server", "src");
const servicesRoot = path.join(apiRoot, "services");
const routesRoot = path.join(apiRoot, "routes");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function serviceFiles() {
  return fs
    .readdirSync(servicesRoot)
    .filter((name) => /^whatsapp.*\.ts$/i.test(name))
    .sort();
}

function routeFiles() {
  return fs
    .readdirSync(routesRoot)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

const violations = [];

function reject(sourceName, source, expression, code) {
  if (expression.test(source)) violations.push({ source: sourceName, code });
}

const runtimeEntries = [
  ["artifacts/api-server/src/app.ts", read("artifacts/api-server/src/app.ts")],
  ["artifacts/api-server/src/index.ts", read("artifacts/api-server/src/index.ts")],
];

for (const [relative, source] of runtimeEntries) {
  reject(
    relative,
    source,
    /(?:import|require|use|post|get|put|patch|delete|start)[^\n]*whatsapp/i,
    "WHATSAPP_ACTIVE_RUNTIME_WIRING_PRESENT",
  );
  reject(
    relative,
    source,
    /FAWRI_WHATSAPP_(?:OFFLINE_FOUNDATION|LIVE_CUTOVER)/,
    "WHATSAPP_RUNTIME_SWITCH_CONSUMPTION_PRESENT",
  );
}

for (const name of routeFiles()) {
  const relative = `artifacts/api-server/src/routes/${name}`;
  const source = read(relative);
  reject(
    relative,
    source,
    /(?:router|app)\s*\.\s*(?:get|post|put|patch|delete|use)\s*\([^\n]*whatsapp/i,
    "WHATSAPP_ACTIVE_ROUTE_PRESENT",
  );
}

const metaWorkerPath =
  "artifacts/api-server/src/services/metaWebhookWorker.ts";
const metaWorker = read(metaWorkerPath);
reject(
  metaWorkerPath,
  metaWorker,
  /whatsapp/i,
  "WHATSAPP_IMPORTED_INTO_LIVE_META_WORKER",
);

const metaAuthorityPath =
  "artifacts/api-server/src/services/postgresMetaChannelAuthority.ts";
const metaAuthority = read(metaAuthorityPath);
if (!/AND platform IN \('messenger', 'instagram'\)/.test(metaAuthority)) {
  violations.push({
    source: metaAuthorityPath,
    code: "WHATSAPP_LEGACY_META_LIST_ISOLATION_MISSING",
  });
}

const forbiddenCapabilities = [
  [/\bfetch\s*\(/, "WHATSAPP_NETWORK_FETCH_PRESENT"],
  [/https?:\/\/graph\.facebook\.com/i, "WHATSAPP_GRAPH_ENDPOINT_PRESENT"],
  [/(?:from\s+["']node:http["']|require\s*\(\s*["']node:http["']\s*\)|\bhttp\s*\.\s*request\s*\()/, "WHATSAPP_LOW_LEVEL_HTTP_PRESENT"],
  [/(?:from\s+["']node:https["']|require\s*\(\s*["']node:https["']\s*\)|\bhttps\s*\.\s*request\s*\()/, "WHATSAPP_LOW_LEVEL_HTTPS_PRESENT"],
  [/(?:from\s+["'](?:node:)?(?:net|tls|dns|dgram|child_process|worker_threads)["']|require\s*\(\s*["'](?:node:)?(?:net|tls|dns|dgram|child_process|worker_threads)["']\s*\))/, "WHATSAPP_LOW_LEVEL_RUNTIME_CAPABILITY_PRESENT"],
  [/(?:from\s+["']ws["']|require\s*\(\s*["']ws["']\s*\))/, "WHATSAPP_WEBSOCKET_CAPABILITY_PRESENT"],
  [/\bdecryptMetaCredential\b/, "WHATSAPP_CREDENTIAL_DECRYPT_PRESENT"],
  [/\bencryptMetaCredential\b/, "WHATSAPP_CREDENTIAL_ENCRYPT_PRESENT"],
  [/(?:metaCredentialVault|awsKmsMetaCredentialKeyProvider|metaGraphSendClient|postgresMetaWebhookReplyTransport|postgresMetaChannelAuthority)/, "WHATSAPP_META_LIVE_AUTHORITY_REFERENCE_PRESENT"],
  [/\benqueueDurableJob\s*\(/, "WHATSAPP_QUEUE_WRITE_PRESENT"],
  [/\bstartDurableJobWorker\s*\(/, "WHATSAPP_LIVE_WORKER_PRESENT"],
  [/\bdurableJobQueue\b/, "WHATSAPP_LEGACY_JSON_QUEUE_REFERENCE_PRESENT"],
  [/\bJsonFileStore\b/, "WHATSAPP_LEGACY_JSON_STORE_REFERENCE_PRESENT"],
  [/\bexpress\s*\.\s*Router\s*\(/, "WHATSAPP_HTTP_ROUTER_PRESENT"],
  [/\bAuthorization\s*:/i, "WHATSAPP_AUTHORIZATION_HEADER_PRESENT"],
  [/\bBearer\s+[A-Za-z0-9._-]+/i, "WHATSAPP_BEARER_VALUE_PRESENT"],
  [/process\.env\.(?:META|WHATSAPP)_[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|CREDENTIAL)/, "WHATSAPP_SECRET_ENV_READ_PRESENT"],
];

for (const name of serviceFiles()) {
  const relative = `artifacts/api-server/src/services/${name}`;
  const source = read(relative);
  for (const [expression, code] of forbiddenCapabilities) {
    reject(relative, source, expression, code);
  }
}

for (const requiredService of [
  "whatsappActivationRuntimeGuards.ts",
  "whatsappPrivilegedJobPlan.ts",
  "whatsappInboundIntakePlan.ts",
  "whatsappDurableQueuePlan.ts",
  "whatsappOutboundDispatchPlan.ts",
]) {
  if (!serviceFiles().includes(requiredService)) {
    violations.push({
      source: "artifacts/api-server/src/services",
      code: `WHATSAPP_ENCRYPTED_JOB_PLANNER_MISSING:${requiredService}`,
    });
  }
}

const schema = read("lib/db/src/schema/channels.ts");
for (const required of [
  "merchant_channels_whatsapp_identity_pair_check",
  "merchant_channels_whatsapp_identity_scope_check",
  "merchant_channels_whatsapp_channel_shape_check",
  "merchant_channels_whatsapp_dormant_only_check",
]) {
  if (!schema.includes(required)) {
    violations.push({
      source: "lib/db/src/schema/channels.ts",
      code: `WHATSAPP_SCHEMA_BARRIER_MISSING:${required}`,
    });
  }
}

const jobsSchema = read("lib/db/src/schema/jobs.ts");
for (const required of [
  "background_jobs",
  "background_job_payloads",
  "payload_hash",
  "payload_sha256",
  "ciphertext",
]) {
  if (!jobsSchema.includes(required)) {
    violations.push({
      source: "lib/db/src/schema/jobs.ts",
      code: `WHATSAPP_ENCRYPTED_JOB_AUTHORITY_MISSING:${required}`,
    });
  }
}

const migration = read(
  "lib/db/drizzle/0012_whatsapp_dormant_channel_identity.sql",
);
for (const required of [
  "merchant_channels_whatsapp_phone_number_unique",
  "merchant_channels_whatsapp_identity_scope_check",
  "merchant_channels_whatsapp_dormant_only_check",
  '"credential_ciphertext" IS NULL',
  '"webhook_subscribed_at" IS NULL',
  '"connected_at" IS NULL',
]) {
  if (!migration.includes(required)) {
    violations.push({
      source: "lib/db/drizzle/0012_whatsapp_dormant_channel_identity.sql",
      code: `WHATSAPP_MIGRATION_BARRIER_MISSING:${required}`,
    });
  }
}

const result = {
  ok: violations.length === 0,
  boundary: "whatsapp_dormant_offline",
  whatsapp_service_files: serviceFiles().length,
  active_whatsapp_routes: violations.filter((item) =>
    item.code.includes("ROUTE") || item.code.includes("RUNTIME_WIRING"),
  ).length,
  forbidden_capability_violations: violations.filter((item) =>
    item.code.includes("PRESENT"),
  ).length,
  violations,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
