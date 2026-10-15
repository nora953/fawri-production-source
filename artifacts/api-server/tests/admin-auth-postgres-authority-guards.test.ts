import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(current, relativePath), "utf8");
}

test("admin me reads the authoritative PostgreSQL account surface", () => {
  const sessionRoutes = source("../src/routes/auth-session-routes.ts");
  assert.match(sessionRoutes, /findAdminByIdAuthoritative/);
  assert.equal(
    /router\.get\("\/admin\/me"[\s\S]*?authAccountRepository\.findById/.test(
      sessionRoutes,
    ),
    false,
    "/admin/me must never fall back to merchants.json",
  );
});

test("PostgreSQL session authority applies to admin and merchant kinds", () => {
  const sessionAuthority = source(
    "../src/services/authPostgresSessionAuthority.ts",
  );
  assert.match(
    sessionAuthority,
    /function postgresRequired\(_kind: AccountKind\): boolean \{\s*return process\.env\[POSTGRES_AUTHORITY_ENV\] === "required";/,
  );
  assert.equal(
    /postgresRequired[\s\S]{0,220}kind\s*===\s*["']merchant["']/.test(
      sessionAuthority,
    ),
    false,
    "required PostgreSQL session authority must not exclude administrators",
  );
});

test("PostgreSQL admin interceptors remain ahead of legacy routers", () => {
  const router = source("../src/routes/auth-security.ts");
  const adminOtpPg = router.indexOf("router.use(adminDeviceOtpPgRoutes as any)");
  const publicLegacy = router.indexOf("router.use(publicRoutes as any)");
  const adminPg = router.indexOf("router.use(adminPostgresRoutes as any)");
  const adminLegacy = router.indexOf("router.use(adminRoutes as any)");

  assert.ok(adminOtpPg >= 0 && publicLegacy >= 0 && adminOtpPg < publicLegacy);
  assert.ok(adminPg >= 0 && adminLegacy >= 0 && adminPg < adminLegacy);
});

test("partial admin PostgreSQL configuration fails closed before legacy access", () => {
  const router = source("../src/routes/auth-security.ts");
  const middleware = source("../src/middleware/authSession.ts");

  assert.match(router, /adminAuthPostgresCutoverMode\(\) === "incomplete"/);
  assert.match(router, /AUTH_POSTGRES_CUTOVER_INCOMPLETE/);
  assert.match(
    middleware,
    /expectedKind === "admin"[\s\S]{0,160}adminAuthPostgresCutoverMode\(\) === "incomplete"/,
  );
  assert.match(middleware, /AUTH_POSTGRES_CUTOVER_INCOMPLETE/);
});
