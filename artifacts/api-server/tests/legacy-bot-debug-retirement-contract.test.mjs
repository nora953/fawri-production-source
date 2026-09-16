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

test("legacy bot debug surface is retired before compatibility routes in required-PostgreSQL or non-debug runtime", () => {
  const legacyRoutes = source("src/routes/indexModulePart3.ts");
  const debugGuard = source("src/routes/legacyBotDebugRouteGuard.ts");
  const routeIndex = source("src/routes/index.ts");
  const legacyFallbackGuard = source("src/middleware/legacyProductionFallbackGuard.ts");

  const debugRoute = between(
    legacyRoutes,
    'router.get("/bot/debug"',
    'router.get("/bot/conversations/:merchantId"',
  );

  assert.match(
    debugRoute,
    /db_path:\s*DB_PATH/,
    "the retained local-only debug implementation still contains internal diagnostics and therefore must remain guarded",
  );
  assert.match(
    debugRoute,
    /product_names:/,
    "the retained local-only debug implementation still exposes catalog diagnostics and therefore must remain guarded",
  );

  assert.match(
    legacyFallbackGuard,
    /pathname === "\/api\/auth" \|\| pathname\.startsWith\("\/api\/auth\/"\)/,
    "the existing global legacy fallback guard remains auth-scoped; bot debug retirement is intentionally explicit",
  );

  assert.match(debugGuard, /router\.use\("\/bot\/debug"/);
  assert.match(
    debugGuard,
    /operationalPostgresAuthorityRequired\(\)\s*\|\|\s*!BOT_DEBUG/,
    "required PostgreSQL or disabled debug mode must fail closed before the legacy route executes",
  );
  assert.match(debugGuard, /res\.status\(410\)/);
  assert.match(debugGuard, /LEGACY_BOT_DEBUG_DISABLED/);
  assert.match(
    debugGuard,
    /return next\(\)/,
    "only the explicitly enabled non-required local/test debug path may reach the legacy implementation",
  );

  const guardImport = routeIndex.indexOf("./legacyBotDebugRouteGuard");
  const compatibilityImport = routeIndex.indexOf("./indexModulePart4");
  assert.notEqual(guardImport, -1, "route index must install the bot debug retirement guard");
  assert.notEqual(
    compatibilityImport,
    -1,
    "route index must continue loading the compatibility route graph",
  );
  assert.ok(
    guardImport < compatibilityImport,
    "bot debug retirement guard must register before compatibility route side effects",
  );
});
