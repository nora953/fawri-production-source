import type { NextFunction, Request, Response } from "express";
import { manualCommercialRelease } from "../services/manualCommercialRelease";

export function enforceManualCommercialCutover(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = req.path.toLowerCase();
  if (!manualCommercialRelease() ||
      !/^\/api\/(?:auth\/(?:billing|admin\/billing|subscription\/emergency)|meta|channels|order[s]?\/[^/]+\/payment(?:-status)?)(?:\/|$)/.test(path)) {
    next();
    return;
  }
  res.set("Cache-Control", "no-store").status(403).json({
    ok: false,
    code: "FAWRI_V1_PROVIDER_NOT_OFFERED",
    error: "External providers are unavailable in this release",
  });
}
