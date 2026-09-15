import { Router, type Request, type Response } from "express";
import {
  authenticateAdmin,
  sendError,
  type AdminRecord,
} from "../services/supportPreviewSessions";
import {
  activeEmergencyAuthorization,
  readEmergencyAccessDb,
  verifyEmergencyAuditChain,
} from "../services/emergencyReadAccess";

const router = Router();

router.get("/directory", (req: Request, res: Response) => {
  const authenticated = authenticateAdmin(req, res, {
    allowOwner: true,
    requiredPermissions: [],
  });
  if (!authenticated) return;

  const emergencyDb = readEmergencyAccessDb();
  const verification = verifyEmergencyAuditChain(emergencyDb);
  if (!verification.valid) {
    return sendError(res, 503, "emergency audit chain verification failed", {
      code: "EMERGENCY_AUDIT_CHAIN_INVALID",
      invalid_sequence: verification.invalid_sequence,
    });
  }

  const isOwner = authenticated.admin.admin_role === "owner_admin";
  const authorization = activeEmergencyAuthorization(
    emergencyDb,
    authenticated.admin.id,
  );
  if (!isOwner && !authorization) {
    return sendError(res, 403, "emergency read access is not authorized", {
      code: "EMERGENCY_AUTHORIZATION_REQUIRED",
    });
  }

  const merchants = authenticated.authDb.merchants
    .filter((record) => record.is_admin !== true)
    .map((merchant) => ({
      id: merchant.id,
      store_name: merchant.store_name,
      owner_name: merchant.owner_name,
      status: merchant.status,
    }))
    .sort((left, right) => left.store_name.localeCompare(right.store_name));

  const assistants = isOwner
    ? authenticated.authDb.merchants
        .filter(
          (record) =>
            record.is_admin === true &&
            (record as AdminRecord).admin_role === "assistant_admin",
        )
        .map((record) => {
          const admin = record as AdminRecord;
          return {
            id: admin.id,
            owner_name: admin.owner_name,
            phone: admin.phone,
            status: admin.status,
            admin_enabled: admin.admin_enabled !== false,
          };
        })
        .sort((left, right) =>
          left.owner_name.localeCompare(right.owner_name),
        )
    : undefined;

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    is_owner: isOwner,
    merchants,
    assistants,
  });
});

export default router;
