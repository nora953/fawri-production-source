import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(apiRoot, relativePath), "utf8");
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return text.slice(start, end);
}

test("legacy bot debug surface must be retired from required-PostgreSQL production runtime", () => {
  const legacyRoutes = source("src/routes/indexModulePart3.ts");
  const guard = source("src/middleware/legacyProductionFallbackGuard.ts");

  const debugRoute = between(
    legacyRoutes,
    'router.get("/bot/debug"',
    'router.get("/bot/conversations/:merchantId"',
  );

  assert.match(
    debugRoute,
    /db_path:\s*DB_PATH/,
    "proof expects the current debug endpoint to expose an internal runtime filesystem path",
  );
  assert.match(
    debugRoute,
    /product_names:/,
    "proof expects the current endpoint to expose diagnostic catalog detail",
  );

  assert.match(
    guard,
    /pathname === "\/api\/auth" \|\| pathname\.startsWith\("\/api\/auth\/"\)/,
    "the global legacy fallback guard is auth-scoped and does not retire /api/bot/debug",
  );

  assert.match(
    debugRoute,
    /operationalPostgresAuthorityRequired\(\)/,
    "legacy /api/bot/debug remains reachable in required PostgreSQL mode instead of being explicitly retired",
  );
  assert.match(
    debugRoute,
    /BOT_DEBUG/,
    "the route must honor the debug enablement contract rather than remaining reachable when BOT_DEBUG is disabled in production",
  );
  assert.match(
    debugRoute,
    /(?:410|LEGACY_BOT_DEBUG|DEBUG_ROUTE_DISABLED)/,
    "production retirement should fail closed with an explicit non-success response/code",
  );
});
