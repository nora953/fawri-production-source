import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const jsonMode = process.argv.includes("--json");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".cache",
]);
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".yml",
  ".yaml",
  ".sql",
]);

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) output.push(full);
  }
  return output;
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function unique(values) {
  return [...new Set(values)].sort();
}

function issue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

const files = walk(root);
const sources = new Map(files.map((file) => [rel(file), read(file)]));
const issues = [];

// ---------------------------------------------------------------------------
// 1. Environment / PostgreSQL authority matrix
// ---------------------------------------------------------------------------
const envReferences = new Map();
const envRegex = /\b(?:FAWRI|AUTH|META|OPENAI|DATABASE)_[A-Z0-9_]+\b/g;
for (const [file, source] of sources) {
  for (const match of source.matchAll(envRegex)) {
    const name = match[0];
    if (!envReferences.has(name)) envReferences.set(name, new Set());
    envReferences.get(name).add(file);
  }
}

const authorityEnvNames = unique(
  [...envReferences.keys()].filter((name) =>
    name.includes("AUTHORITY") || name.includes("CUTOVER"),
  ),
);

const previewPath = "scripts/run-fawri-preview.mjs";
const preview = sources.get(previewPath) || "";
function previewDefaultsRequired(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`${escaped}\\s*:\\s*[\"']required[\"']`).test(preview) ||
    new RegExp(`process\\.env\\.${escaped}\\s*=\\s*[\"']required[\"']`).test(preview) ||
    new RegExp(`process\\.env\\[[\"']${escaped}[\"']\\]\\s*=\\s*[\"']required[\"']`).test(preview)
  );
}

const authorityMatrix = authorityEnvNames.map((name) => ({
  name,
  files: unique([...(envReferences.get(name) || [])]),
  preview_mentioned: preview.includes(name),
  preview_defaults_required: previewDefaultsRequired(name),
}));

const operationalRequired = previewDefaultsRequired(
  "FAWRI_OPERATIONAL_POSTGRES_AUTHORITY",
);
for (const requiredName of [
  "FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY",
  "FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY",
]) {
  if (
    operationalRequired &&
    envReferences.has(requiredName) &&
    !previewDefaultsRequired(requiredName)
  ) {
    issues.push(
      issue(
        "critical",
        `PREVIEW_${requiredName}_NOT_REQUIRED`,
        `${requiredName} is used by the current runtime but the unified preview does not default it to required while operational PostgreSQL authority is required.`,
        { files: unique([...(envReferences.get(requiredName) || [])]) },
      ),
    );
  }
}

const readinessScripts = [...sources.keys()]
  .filter((file) => /^lib\/db\/scripts\/.*readiness\.mjs$/.test(file))
  .sort();
const readinessNotReferencedByPreview = readinessScripts.filter(
  (file) => !preview.includes(path.basename(file)),
);
if (
  sources.has("lib/db/scripts/cashier-staff-authority-readiness.mjs") &&
  !preview.includes("cashier-staff-authority-readiness.mjs")
) {
  issues.push(
    issue(
      "warning",
      "PREVIEW_CASHIER_READINESS_NOT_ENFORCED",
      "Cashier PostgreSQL readiness exists but is not enforced by the unified preview startup contract.",
      { file: "lib/db/scripts/cashier-staff-authority-readiness.mjs" },
    ),
  );
}

// ---------------------------------------------------------------------------
// 2. Merchant dashboard navigation -> application route continuity
// ---------------------------------------------------------------------------
const appPath = "artifacts/fawri/src/App.tsx";
const sidebarPath = "artifacts/fawri/src/components/layout/Sidebar.tsx";
const bottomNavPath = "artifacts/fawri/src/components/layout/BottomNav.tsx";
const app = sources.get(appPath) || "";
const sidebar = sources.get(sidebarPath) || "";
const bottomNav = sources.get(bottomNavPath) || "";

const appRoutes = unique(
  [...app.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map((m) => m[1]),
);
const navHrefs = unique(
  [...`${sidebar}\n${bottomNav}`.matchAll(/href:\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((href) => href.startsWith("/dashboard")),
);
for (const href of navHrefs) {
  if (!appRoutes.includes(href)) {
    issues.push(
      issue(
        "critical",
        "DASHBOARD_NAV_ROUTE_MISSING",
        `Dashboard navigation points to ${href}, but App.tsx has no exact route for it.`,
        { href },
      ),
    );
  }
}

for (const requiredRoute of [
  "/dashboard/cashiers",
  "/dashboard/cashiers/reports",
]) {
  if (!appRoutes.includes(requiredRoute) || !navHrefs.includes(requiredRoute)) {
    issues.push(
      issue(
        "critical",
        "CASHIER_DASHBOARD_SURFACE_MISSING",
        `${requiredRoute} must exist in both application routing and merchant navigation.`,
        { route: requiredRoute },
      ),
    );
  }
}

const lazyImports = [...app.matchAll(/lazy\(\(\)\s*=>\s*import\(["'](@\/[^"']+)["']\)\)/g)]
  .map((m) => m[1]);
for (const alias of lazyImports) {
  const relative = alias.replace(/^@\//, "artifacts/fawri/src/");
  const candidates = [relative, `${relative}.ts`, `${relative}.tsx`, `${relative}.js`, `${relative}.jsx`];
  if (!candidates.some((candidate) => sources.has(candidate))) {
    issues.push(
      issue(
        "critical",
        "APP_LAZY_IMPORT_MISSING",
        `App.tsx lazy import does not resolve to a repository source file: ${alias}`,
        { import: alias },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Frontend literal API calls -> backend literal route coverage (heuristic)
// ---------------------------------------------------------------------------
const frontendFiles = [...sources.keys()].filter((file) =>
  file.startsWith("artifacts/fawri/src/") && /\.(?:ts|tsx|js|jsx)$/.test(file),
);
const serverFiles = [...sources.keys()].filter((file) =>
  file.startsWith("artifacts/api-server/src/") && /\.(?:ts|tsx|js|jsx)$/.test(file),
);

const frontendApi = new Map();
for (const file of frontendFiles) {
  const source = sources.get(file) || "";
  for (const match of source.matchAll(/["'`]((?:\/api\/)[A-Za-z0-9_./:-]+)["'`]/g)) {
    const endpoint = match[1].replace(/\/$/, "");
    if (!frontendApi.has(endpoint)) frontendApi.set(endpoint, new Set());
    frontendApi.get(endpoint).add(file);
  }
}

const backendRouteLiterals = [];
for (const file of serverFiles) {
  const source = sources.get(file) || "";
  for (const match of source.matchAll(/router\.(?:get|post|put|patch|delete|use)\(\s*["']([^"']+)["']/g)) {
    backendRouteLiterals.push({ file, route: match[1].replace(/\/$/, "") });
  }
}

const serverApp = sources.get("artifacts/api-server/src/app.ts") || "";
const apiMountPrefixes = unique([
  "/api",
  ...[...serverApp.matchAll(/app\.use\(\s*["'](\/api[^"']*)["']/g)].map((m) =>
    m[1].replace(/\/$/, ""),
  ),
]);

function endpointCovered(endpoint) {
  return backendRouteLiterals.some(({ route }) => {
    if (!route.startsWith("/")) return false;
    if (endpoint === route) return true;

    for (const prefix of apiMountPrefixes) {
      if (endpoint !== prefix && !endpoint.startsWith(`${prefix}/`)) continue;
      const remainder = endpoint.slice(prefix.length) || "/";
      if (remainder === route) return true;
      if (
        remainder.endsWith(route) &&
        route.split("/").filter(Boolean).length >= 2
      ) {
        return true;
      }
    }
    return false;
  });
}

const uncoveredFrontendApi = [...frontendApi.entries()]
  .filter(([endpoint]) => !endpointCovered(endpoint))
  .map(([endpoint, refs]) => ({ endpoint, files: unique([...refs]) }))
  .sort((a, b) => a.endpoint.localeCompare(b.endpoint));

for (const item of uncoveredFrontendApi.slice(0, 50)) {
  issues.push(
    issue(
      "review",
      "FRONTEND_API_ROUTE_NEEDS_REVIEW",
      `Frontend literal API path has no obvious literal backend route match: ${item.endpoint}`,
      item,
    ),
  );
}

// ---------------------------------------------------------------------------
// 4. Drizzle migration journal continuity
// ---------------------------------------------------------------------------
const migrationDir = path.join(root, "lib", "db", "drizzle");
const sqlMigrations = fs.existsSync(migrationDir)
  ? fs
      .readdirSync(migrationDir)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort()
  : [];
let journalTags = [];
const journalPath = "lib/db/drizzle/meta/_journal.json";
if (sources.has(journalPath)) {
  try {
    const parsed = JSON.parse(sources.get(journalPath));
    journalTags = Array.isArray(parsed.entries)
      ? parsed.entries.map((entry) => String(entry.tag || "")).filter(Boolean)
      : [];
  } catch (error) {
    issues.push(
      issue("critical", "MIGRATION_JOURNAL_INVALID_JSON", String(error)),
    );
  }
}
for (const tag of sqlMigrations) {
  if (!journalTags.includes(tag)) {
    issues.push(
      issue(
        "critical",
        "MIGRATION_NOT_IN_JOURNAL",
        `Migration SQL exists but is absent from Drizzle journal: ${tag}`,
        { tag },
      ),
    );
  }
}
for (const tag of journalTags) {
  if (!sqlMigrations.includes(tag)) {
    issues.push(
      issue(
        "critical",
        "JOURNAL_MIGRATION_FILE_MISSING",
        `Drizzle journal references a migration SQL file that is missing: ${tag}`,
        { tag },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 5. DB schema export continuity
// ---------------------------------------------------------------------------
const schemaDir = path.join(root, "lib", "db", "src", "schema");
const schemaIndexPath = "lib/db/src/schema/index.ts";
const schemaIndex = sources.get(schemaIndexPath) || "";
const schemaFiles = fs.existsSync(schemaDir)
  ? fs
      .readdirSync(schemaDir)
      .filter((name) => name.endsWith(".ts") && name !== "index.ts")
      .map((name) => name.replace(/\.ts$/, ""))
      .sort()
  : [];
const unexportedSchemaFiles = schemaFiles.filter((name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !new RegExp(`export\\s+\\*\\s+from\\s+[\"']\\./${escaped}[\"']`).test(schemaIndex);
});

// These modules are intentionally outside the runtime schema barrel. Drizzle
// migration generation is anchored to src/schema/*.ts, so they remain part of
// the canonical migration authority without expanding the runtime relational
// schema exported by @workspace/db.
const documentedNonBarrelSchemaFiles = new Set([
  "auth-security",
  "channel-messaging",
  "merchant-settings",
  "tenant-security",
]);
const unexpectedUnexportedSchemaFiles = unexportedSchemaFiles.filter(
  (name) => !documentedNonBarrelSchemaFiles.has(name),
);
for (const name of unexpectedUnexportedSchemaFiles) {
  issues.push(
    issue(
      "review",
      "DB_SCHEMA_FILE_NOT_EXPORTED",
      `Schema file is unexpectedly absent from lib/db/src/schema/index.ts: ${name}.ts`,
      { file: `lib/db/src/schema/${name}.ts` },
    ),
  );
}

// ---------------------------------------------------------------------------
// 6. Cashier operator lifecycle static safeguards
// ---------------------------------------------------------------------------
const cashierAuthority = sources.get(
  "artifacts/api-server/src/services/postgresCashierStaffAuthority.ts",
) || "";
if (cashierAuthority) {
  const hasExpiryChecks = /expires_at|expiresAt/.test(cashierAuthority);
  const hasExpiredStatus = /["']expired["']/.test(cashierAuthority);
  if (!hasExpiryChecks || !hasExpiredStatus) {
    issues.push(
      issue(
        "warning",
        "CASHIER_SESSION_EXPIRY_LIFECYCLE_NEEDS_REVIEW",
        "Cashier staff authority does not expose obvious expiry/status handling in static inspection.",
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
const severityOrder = { critical: 0, warning: 1, review: 2 };
issues.sort((a, b) =>
  (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) ||
  a.code.localeCompare(b.code),
);

const counts = issues.reduce(
  (acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  },
  { critical: 0, warning: 0, review: 0 },
);

const report = {
  ok: counts.critical === 0,
  mode: "read_only_static_global_consistency_audit",
  root,
  scanned_file_count: files.length,
  counts,
  authority_matrix: authorityMatrix,
  preview: {
    operational_postgres_required: operationalRequired,
    readiness_scripts: readinessScripts,
    readiness_not_referenced_by_preview: readinessNotReferencedByPreview,
  },
  routing: {
    app_routes: appRoutes,
    dashboard_nav_hrefs: navHrefs,
    api_mount_prefixes: apiMountPrefixes,
    frontend_literal_api_count: frontendApi.size,
    backend_literal_route_count: backendRouteLiterals.length,
    uncovered_frontend_api_count: uncoveredFrontendApi.length,
  },
  migrations: {
    sql: sqlMigrations,
    journal: journalTags,
  },
  schema: {
    file_count: schemaFiles.length,
    documented_non_barrel: unexportedSchemaFiles.filter((name) =>
      documentedNonBarrelSchemaFiles.has(name),
    ),
    unexpected_unexported: unexpectedUnexportedSchemaFiles,
  },
  issues,
  writes_performed: false,
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("=== FAWRI GLOBAL CONSISTENCY AUDIT ===");
  console.log(`Scanned files: ${report.scanned_file_count}`);
  console.log(
    `Findings: critical=${counts.critical} warning=${counts.warning} review=${counts.review}`,
  );
  console.log(`Writes performed: ${report.writes_performed}`);
  console.log("\n--- Critical / Warning Findings ---");
  for (const item of issues.filter((entry) => entry.severity !== "review")) {
    console.log(`[${item.severity.toUpperCase()}] ${item.code}`);
    console.log(`  ${item.message}`);
  }
  console.log("\n--- Authority Matrix ---");
  for (const row of authorityMatrix) {
    console.log(
      `${row.name} | preview-mentioned=${row.preview_mentioned} | preview-required=${row.preview_defaults_required}`,
    );
  }
  console.log("\n--- Route/Migration Summary ---");
  console.log(`App routes: ${appRoutes.length}`);
  console.log(`Dashboard nav hrefs: ${navHrefs.length}`);
  console.log(`API mount prefixes: ${apiMountPrefixes.join(", ")}`);
  console.log(`Frontend literal API paths: ${frontendApi.size}`);
  console.log(`Backend literal router paths: ${backendRouteLiterals.length}`);
  console.log(`API paths needing static review: ${uncoveredFrontendApi.length}`);
  console.log(`Migration SQL files: ${sqlMigrations.length}`);
  console.log(`Migration journal entries: ${journalTags.length}`);
  console.log(
    `Documented non-barrel schema files: ${report.schema.documented_non_barrel.length}`,
  );
  if (report.schema.documented_non_barrel.length) {
    console.log(
      `Documented non-barrel schema names: ${report.schema.documented_non_barrel.join(", ")}`,
    );
  }
  console.log(
    `Unexpected unexported schema files: ${unexpectedUnexportedSchemaFiles.length}`,
  );
  console.log("\n--- First API Review Findings ---");
  for (const item of uncoveredFrontendApi.slice(0, 25)) {
    console.log(`REVIEW ${item.endpoint} <- ${item.files.join(", ")}`);
  }
  console.log(
    counts.critical === 0
      ? "\n=== STATIC GLOBAL CONSISTENCY PASS (no critical findings) ==="
      : "\n=== STATIC GLOBAL CONSISTENCY FAIL (critical findings present) ===",
  );
}
