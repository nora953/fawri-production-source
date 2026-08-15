import type { NextFunction, Request, Response } from "express";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";

/**
 * Final production cutover guard.
 *
 * Auth v2/PostgreSQL routers are mounted before the shared legacy router. When
 * operational PostgreSQL authority is required, any /api/auth request that
 * reaches this guard is therefore an unresolved legacy fallback and must not
 * be allowed to consult merchants.json/auth-security.json or a legacy token
 * store. Non-required environments preserve the compatibility behavior.
 */
export function enforceLegacyAuthProductionCutoverGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!operationalPostgresAuthorityRequired()) {
    next();
    return;
  }

  const pathname = String(req.path || "").split("?", 1)[0];
  const legacyAuthPath =
    pathname === "/api/auth" || pathname.startsWith("/api/auth/");
  if (!legacyAuthPath) {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({
    ok: false,
    code: "LEGACY_AUTH_ROUTE_RETIRED",
    error: "legacy authentication route is unavailable",
  });
}
