import type { NextFunction, Request, Response } from "express";
import { manualCommercialRelease } from "../services/manualCommercialRelease";

export function enforceManualCommercialCutover(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = req.path.toLowerCase();
  if (!manualCommercialRelease()) {
    next();
    return;
  }

  // A dedicated auth LOGIN intentionally has no permission to mutate tenant
  // support/inspection tables. Manual V1 does not advertise Support. Deny the
  // entire merchant/admin Support API before any legacy or PostgreSQL router.
  const supportExcluded =
    /^\/api\/auth\/(?:support(?:-images|-preview)?|admin\/support(?:-images|-preview)?)(?:\/|$)/.test(path);
  if (supportExcluded) {
    res.set("Cache-Control", "no-store").status(403).json({
      ok: false,
      code: "FAWRI_V1_SUPPORT_NOT_OFFERED",
      error: "In-app support is unavailable in this release",
    });
    return;
  }

  // Channel-job administration can requeue Meta provider actions even while
  // the Meta worker is disabled. Do not permit enqueue/requeue in manual V1.
  const providerExcluded =
    /^\/api\/(?:auth\/(?:billing|admin\/billing|subscription\/emergency)|meta|channels|admin\/background-jobs|order[s]?\/[^/]+\/payment(?:-status)?)(?:\/|$)/.test(path);
  if (!providerExcluded) {
    next();
    return;
  }
  res.set("Cache-Control", "no-store").status(403).json({
    ok: false,
    code: "FAWRI_V1_PROVIDER_NOT_OFFERED",
    error: "External providers are unavailable in this release",
  });
}
