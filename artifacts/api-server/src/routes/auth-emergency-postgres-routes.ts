import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  getMerchantIdFromSecureSession,
  requireSecureAdminSession,
  requireSecureMerchantSession,
} from "../middleware/authSession";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  createEmergencyRequestPostgres,
  decideEmergencyRequestPostgres,
  EmergencyPostgresError,
  endEmergencyRequestPostgres,
  getEmergencyAuditPostgres,
  getEmergencyDirectoryPostgres,
  getEmergencyOverviewPostgres,
  getEmergencySnapshotPostgres,
  listEmergencyMerchantNoticesPostgres,
  markEmergencyMerchantNoticeReadPostgres,
  upsertEmergencyAuthorizationPostgres,
} from "../services/postgresEmergencyReadAccessAuthority";

const router = Router();

router.use((_req, _res, next) => {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
});

function sendEmergencyError(res: Response, error: unknown): void {
  const candidate = error as Partial<EmergencyPostgresError> & {
    statusCode?: number;
    code?: string;
    extra?: Record<string, unknown>;
    message?: string;
  };
  if (candidate?.statusCode && candidate?.code) {
    res.status(candidate.statusCode).json({
      ok: false,
      code: candidate.code,
      error: candidate.message || "emergency request failed",
      ...(candidate.extra || {}),
    });
    return;
  }
  console.error("PostgreSQL emergency read access failed:", error);
  res.status(500).json({
    ok: false,
    code: "EMERGENCY_POSTGRES_FAILED",
    error: "emergency request failed",
  });
}

function adminContext(res: Response) {
  const context = getAuthContext(res);
  const profile = context?.adminProfile;
  if (!context || !profile) {
    throw new EmergencyPostgresError(
      "ADMIN_SESSION_REQUIRED",
      "administrator session is required",
      401,
    );
  }
  return {
    adminId: context.account.id,
    adminName: profile.displayName || "Support",
    adminSessionId: context.session.id,
    isOwner: profile.role === "owner_admin",
  };
}

function requireOwnerContext(res: Response) {
  const context = adminContext(res);
  if (!context.isOwner) {
    throw new EmergencyPostgresError(
      "OWNER_ADMIN_REQUIRED",
      "owner administrator permission is required",
      403,
    );
  }
  return context;
}

router.get(
  "/admin/emergency-read-access/directory",
  requireSecureAdminSession,
  async (_req: Request, res: Response) => {
    try {
      const context = adminContext(res);
      const directory = await getEmergencyDirectoryPostgres(context);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...directory });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.get(
  "/admin/emergency-read-access/overview",
  requireSecureAdminSession,
  async (_req: Request, res: Response) => {
    try {
      const overview = await getEmergencyOverviewPostgres(adminContext(res));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...overview });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.put(
  "/admin/emergency-read-access/authorizations/:adminId",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    try {
      const owner = requireOwnerContext(res);
      const authorization = await upsertEmergencyAuthorizationPostgres({
        ownerAdminId: owner.adminId,
        ownerName: owner.adminName,
        assistantAdminId: String(req.params.adminId || "").trim(),
        canRequest: req.body?.can_request === true,
        canCriticalSelfActivate:
          req.body?.can_critical_self_activate === true,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, authorization });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.post(
  "/admin/emergency-read-access/requests",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    try {
      const context = adminContext(res);
      const request = await createEmergencyRequestPostgres({
        ...context,
        merchantId: String(req.body?.merchant_id || "").trim(),
        incidentReference: String(req.body?.incident_reference || "").trim(),
        severity: String(req.body?.severity || "").trim(),
        reason: String(req.body?.reason || "").trim(),
        durationMinutes: Number(req.body?.duration_minutes),
        criticalSelfActivate: req.body?.critical_self_activate === true,
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, request });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.post(
  "/admin/emergency-read-access/requests/:requestId/decision",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    try {
      const owner = requireOwnerContext(res);
      const request = await decideEmergencyRequestPostgres({
        ownerAdminId: owner.adminId,
        ownerName: owner.adminName,
        requestId: String(req.params.requestId || "").trim(),
        decision: String(req.body?.decision || "").trim(),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, request });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.get(
  "/admin/emergency-read-access/requests/:requestId/snapshot",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    try {
      const context = adminContext(res);
      const snapshot = await getEmergencySnapshotPostgres({
        requestId: String(req.params.requestId || "").trim(),
        ...context,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, snapshot });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.all(
  "/admin/emergency-read-access/requests/:requestId/snapshot",
  requireSecureAdminSession,
  (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      code: "EMERGENCY_ACCESS_READ_ONLY",
      error: "emergency access is read-only",
      method: req.method,
    });
  },
);

router.post(
  "/admin/emergency-read-access/requests/:requestId/end",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    try {
      const context = adminContext(res);
      const request = await endEmergencyRequestPostgres({
        requestId: String(req.params.requestId || "").trim(),
        adminId: context.adminId,
        adminName: context.adminName,
        isOwner: context.isOwner,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, request });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.get(
  "/admin/emergency-read-access/audit",
  requireSecureAdminSession,
  async (_req: Request, res: Response) => {
    try {
      requireOwnerContext(res);
      const audit = await getEmergencyAuditPostgres();
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...audit });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.get(
  "/emergency-read-access/notices",
  requireSecureMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSecureSession(res);
      const requestedLimit = Number(req.query.limit);
      const result = await listEmergencyMerchantNoticesPostgres({
        merchantId,
        unreadOnly: String(req.query.unread || "") === "1",
        ...(Number.isInteger(requestedLimit) ? { limit: requestedLimit } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

router.patch(
  "/emergency-read-access/notices/:noticeId/read",
  requireSecureMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const notice = await markEmergencyMerchantNoticeReadPostgres({
        merchantId: getMerchantIdFromSecureSession(res),
        noticeId: String(req.params.noticeId || "").trim(),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, notice });
    } catch (error) {
      sendEmergencyError(res, error);
    }
  },
);

export default router;
