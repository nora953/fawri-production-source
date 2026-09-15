import fs from "node:fs";

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

const dockerfile = fs.readFileSync("Dockerfile.staging", "utf8");
const dockerignore = fs.readFileSync(".dockerignore", "utf8");
const contract = fs.readFileSync("docs/staging-deployment-contract.md", "utf8");

const requiredDockerFragments = [
  "FROM node:22-bookworm-slim AS build",
  "pnpm@10.26.1",
  "pnpm install --frozen-lockfile",
  "pnpm --filter @workspace/fawri build",
  "pnpm --filter @workspace/api-server build",
  "FAWRI_WEB_DIST_DIR=/app/artifacts/fawri/dist/public",
  "FAWRI_DISABLE_JOB_WORKERS=1",
  "FAWRI_META_CUTOVER_READY=0",
  "FAWRI_META_REPLY_TRANSPORT=disabled",
  "FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=disabled",
  "/app/artifacts/api-server/dist/index.mjs",
];

for (const fragment of requiredDockerFragments) {
  if (!dockerfile.includes(fragment)) fail(`Dockerfile.staging missing: ${fragment}`);
}

if (/FAWRI_PRODUCTION_RELEASE_GATE\s*=\s*required/.test(dockerfile)) {
  fail("staging image must not enable the production release gate");
}

for (const fragment of [".env", "data", "artifacts/api-server/data"]) {
  if (!dockerignore.split(/\r?\n/).includes(fragment)) {
    fail(`.dockerignore missing protected path: ${fragment}`);
  }
}

for (const fragment of [
  "same HTTPS origin",
  "FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=required",
  "FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY=required",
  "FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY=required",
  "Do **not** set `FAWRI_PRODUCTION_RELEASE_GATE=required`",
]) {
  if (!contract.includes(fragment)) fail(`staging contract missing: ${fragment}`);
}

process.stdout.write("PASS: staging deployment contract is internally consistent\n");
