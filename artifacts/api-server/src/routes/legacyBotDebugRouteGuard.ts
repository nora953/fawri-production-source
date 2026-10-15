import type { NextFunction, Request, Response } from "express";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import { BOT_DEBUG, router } from "./indexModulePart1";

router.use("/bot/debug", (_req: Request, res: Response, next: NextFunction) => {
  if (operationalPostgresAuthorityRequired() || !BOT_DEBUG) {
    return res.status(410).json({
      ok: false,
      code: "LEGACY_BOT_DEBUG_DISABLED",
      error: "legacy bot debug route is disabled",
    });
  }

  return next();
});
