import { Router, type Request, type Response } from "express";

import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  appendEmergencyAuditEvent,
  readEmergencyAccessDb,
  refreshEmergencyAccessExpirations,
  verifyEmergencyAuditChain,
  writeEmergencyAccessDb,
} from "../services/emergencyReadAccess";
import { now, sendError } from "../services/supportPreviewSessions";

const router = Router();

function loadVerifiedEmergencyDb(res: Response) {
  const db = readEmergencyAccessDb();
  const verification = verifyEmergencyAuditChain(db);
  if (!verification.valid) {
    sendError(res, 503, "emergency audit chain verification failed", {
      code: "EMERGENCY_AUDIT_CHAIN_INVALID",
      invalid_sequence: verification.invalid_sequence,
    });
    return null;
  }

  if (refreshEmergencyAccessExpirations(db)) {
    writeEmergencyAccessDb(db);
  }
  return db;
}

router.get(
  "/notices",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const db = loadVerifiedEmergencyDb(res);
    if (!db) return;

    const unreadOnly = String(req.query.unread || "") === "1";
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(50, requestedLimit))
      : 20;

    const notices = db.merchant_notices
      .filter(
        (notice) =>
          notice.merchant_id === merchantId &&
          (!unreadOnly || !notice.read_at),
      )
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      )
      .slice(0, limit);

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      notices,
      unread_count: db.merchant_notices.filter(
        (notice) => notice.merchant_id === merchantId && !notice.read_at,
      ).length,
    });
  },
);

router.patch(
  "/notices/:noticeId/read",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const noticeId = String(req.params.noticeId || "").trim();
    const db = loadVerifiedEmergencyDb(res);
    if (!db) return;

    const notice = db.merchant_notices.find(
      (item) => item.id === noticeId && item.merchant_id === merchantId,
    );
    if (!notice) {
      return sendError(res, 404, "emergency incident notice not found", {
        code: "EMERGENCY_MERCHANT_NOTICE_NOT_FOUND",
      });
    }

    if (!notice.read_at) {
      notice.read_at = now();
      appendEmergencyAuditEvent(db, {
        event_type: "emergency_merchant_notice_read",
        request_id: notice.request_id,
        merchant: { id: merchantId },
        incident_reference: notice.incident_reference,
        metadata: { notice_id: notice.id },
      });
      writeEmergencyAccessDb(db);
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, notice });
  },
);

export default router;
