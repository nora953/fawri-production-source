import { Router } from "express";
import {
  getAuthContext,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  decideInspectionRequestCanonicalPostgres,
} from "../services/postgresSupportInspectionAuthority";
import { SupportPostgresError } from "../services/postgresSupportAuthority";

const router = Router();

router.use((_req, _res, next) => {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
});

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/decision",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const decision = String(req.body?.decision || "");
      if (decision !== "approve" && decision !== "reject") {
        throw new SupportPostgresError(
          "SUPPORT_INSPECTION_DECISION_INVALID",
          "inspection decision is invalid",
          400,
        );
      }
      const merchantId = getAuthContext(res)?.merchantProfile?.merchantId || "";
      const ticket = await decideInspectionRequestCanonicalPostgres({
        merchantId,
        ticketId: String(req.params.id || ""),
        requestId: String(req.params.requestId || ""),
        decision,
      });
      res.json({ ok: true, ticket });
    } catch (error) {
      if (error instanceof SupportPostgresError) {
        sendAuthError(res, error.statusCode, error.code, error.message);
        return;
      }
      console.error("PostgreSQL support inspection decision failed:", error);
      sendAuthError(
        res,
        500,
        "SUPPORT_POSTGRES_FAILURE",
        "support operation failed",
      );
    }
  },
);

export default router;
