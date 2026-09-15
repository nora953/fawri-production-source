import type { NextFunction, Request, Response } from "express";
import { getAuthContext, sendAuthError } from "./authSession";
import { verifyPassword } from "../services/authPasswordService";
import { findAdminByIdAuthoritative } from "../services/postgresAdminAccountAuthority";

export async function requireOwnerRecoverySetupPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const context = getAuthContext(res);
  if (context?.adminProfile?.role !== "owner_admin") {
    sendAuthError(
      res,
      403,
      "OWNER_ADMIN_REQUIRED",
      "owner administrator is required",
    );
    return;
  }
  const password = String(req.body?.owner_password || "");
  const owner = await findAdminByIdAuthoritative(context.account.id);
  if (!password || !owner || !verifyPassword(password, owner.account.passwordHash)) {
    sendAuthError(
      res,
      401,
      "OWNER_PASSWORD_INCORRECT",
      "owner password is incorrect",
    );
    return;
  }
  next();
}
