import { Router, type NextFunction, type Request, type Response } from "express";

import {
  AUTH_DB_PATH,
  authenticateAdmin,
  audit,
  findMerchant,
  now,
  sendError,
  writeJson,
} from "../services/supportPreviewSessions";
import { buildMerchantReadOnlySnapshot } from "../services/merchantReadOnlySnapshot";
import {
  appendEmergencyAuditEvent,
  readEmergencyAccessDb,
  refreshEmergencyAccessExpirations,
  verifyEmergencyAuditChain,
  writeEmergencyAccessDb,
} from "../services/emergencyReadAccess";

const router = Router();

/**
 * Gives the owner a separately audited read-only view of an active emergency
 * request. Assistant requests remain bound to the requesting assistant's own
 * login session and device in the main emergency-access router.
 */
router.get(
  "/requests/:requestId/snapshot",
  (req: Request, res: Response, next: NextFunction) => {
    const authenticated = authenticateAdmin(req, res, {
      allowOwner: true,
      requiredPermissions: [],
    });
    if (!authenticated) return;

    if (authenticated.admin.admin_role !== "owner_admin") {
      next();
      return;
    }

    const db = readEmergencyAccessDb();
    const verification = verifyEmergencyAuditChain(db);
    if (!verification.valid) {
      return sendError(res, 503, "emergency audit chain verification failed", {
        code: "EMERGENCY_AUDIT_CHAIN_INVALID",
        invalid_sequence: verification.invalid_sequence,
      });
    }

    if (refreshEmergencyAccessExpirations(db)) {
      writeEmergencyAccessDb(db);
    }

    const requestId = String(req.params.requestId || "").trim();
    const request = db.requests.find((item) => item.id === requestId);
    if (!request) {
      return sendError(res, 404, "emergency request not found", {
        code: "EMERGENCY_REQUEST_NOT_FOUND",
      });
    }

    if (
      request.status !== "active" ||
      !request.expires_at ||
      new Date(request.expires_at).getTime() <= Date.now()
    ) {
      return sendError(res, 410, "emergency access is not active", {
        code: "EMERGENCY_ACCESS_INACTIVE",
      });
    }

    const merchant = findMerchant(authenticated.authDb, request.merchant_id);
    if (!merchant) {
      return sendError(res, 404, "merchant not found", {
        code: "EMERGENCY_MERCHANT_NOT_FOUND",
      });
    }

    const ownerViewMarker = `owner_snapshot:${authenticated.admin.id}`;
    if (!request.viewed_sections.includes(ownerViewMarker)) {
      request.viewed_sections.push(ownerViewMarker);
      request.first_viewed_at ||= now();

      appendEmergencyAuditEvent(db, {
        event_type: "emergency_owner_snapshot_viewed",
        request_id: request.id,
        actor: authenticated.admin,
        merchant,
        incident_reference: request.incident_reference,
        metadata: {
          section: "snapshot",
          view_role: "owner",
          requester_admin_id: request.requested_by_admin_id,
        },
      });

      audit(
        authenticated.authDb,
        authenticated.admin,
        merchant,
        "emergency_owner_read_snapshot_viewed",
        "owner viewed an active emergency read-only merchant snapshot",
        {
          emergency_request_id: request.id,
          requester_admin_id: request.requested_by_admin_id,
          incident_reference: request.incident_reference,
          section: "snapshot",
        },
        request.reason,
      );

      writeEmergencyAccessDb(db);
      writeJson(AUTH_DB_PATH, authenticated.authDb);
    }

    const snapshot = buildMerchantReadOnlySnapshot({
      authDb: authenticated.authDb,
      merchant,
      emergency_access: {
        request_id: request.id,
        incident_reference: request.incident_reference,
        severity: request.severity,
        reason: request.reason,
        expires_at: request.expires_at,
      },
    });

    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, snapshot });
  },
);

export default router;
