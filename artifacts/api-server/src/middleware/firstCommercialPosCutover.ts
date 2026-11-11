import type { NextFunction, Request, Response } from "express";

/**
 * Owner-approved 2026-11-11 commercial V1: no cashier/POS entitlements,
 * offline admission, station enrollment, transaction sync or cashier UI.
 *
 * Production is permanently fail-closed on this branch, regardless of flags.
 * Development/test mode retains historical cashier regression fixtures, and
 * may explicitly opt into the V1 cutoff with FAWRI_V1_POS_DISABLED=1.
 * Re-enabling commercial POS requires a separately reviewed source change,
 * not a production environment-variable flip.
 */
export function firstCommercialPosDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "production" ||
    env.FAWRI_V1_POS_DISABLED === "1";
}

/** Exact segment matches: avoid disabling merchant orders or SaaS billing. */
export function isFirstCommercialPosRoute(rawPath: string): boolean {
  let pathname = String(rawPath || "").split("?")[0].toLowerCase();
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Express cannot route a malformed URI to a legitimate cashier handler.
    // Keep the original path for the conservative prefix check.
  }
  pathname = pathname.replace(/\/+$/, "") || "/";
  return (
    /^\/api\/cashier(?:\/|$)/.test(pathname) ||
    /^\/api\/(?:auth\/)?admin\/merchants\/[^/]+\/cashier(?:\/|$)/.test(pathname) ||
    pathname === "/cashier.html" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/cashier" ||
    pathname.startsWith("/cashier/")
  );
}

export function enforceFirstCommercialPosCutover(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!firstCommercialPosDisabled() || !isFirstCommercialPosRoute(req.path)) {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.path.toLowerCase().startsWith("/api/")) {
    res.status(403).json({
      ok: false,
      code: "FAWRI_V1_POS_NOT_OFFERED",
      error: "Cashier/POS is not offered in the first commercial release",
    });
    return;
  }
  // Direct cashier entrypoint and install manifest must not be served by
  // old static builds, route fallback or copied public assets.
  res.status(410).type("text/plain").send(
    "Cashier/POS is unavailable in the first commercial Fawri release",
  );
}
