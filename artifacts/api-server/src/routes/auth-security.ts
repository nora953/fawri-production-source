import { Router, type NextFunction, type Request, type Response } from "express";
import {
  enforceAuthOrigin,
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { requireOwnerRecoverySetupPassword } from "../middleware/ownerRecoveryReauth";
import { adminAuthPostgresCutoverMode } from "../services/adminAuthPostgresCutover";
import { startPostgresSupportRuntimeCutover } from "../services/postgresSupportRuntimeCutover";
import adminDeviceOtpPgRoutes from "./auth-admin-device-otp-pg-routes";
import ownerRecoveryPostgresRoutes from "./auth-owner-recovery-postgres-routes";
import earlyWarningPostgresRoutes from "./auth-early-warning-postgres-routes";
import providerCostPostgresRoutes from "./auth-provider-cost-postgres-routes";
import emergencyPostgresRoutes from "./auth-emergency-postgres-routes";
import merchantManagementPostgresRoutes from "./auth-merchant-management-postgres-routes";
import supportAdminLifecyclePostgresRoutes from "./auth-support-admin-lifecycle-postgres-routes";
import supportImageAliasPostgresRoutes from "./auth-support-image-alias-postgres-routes";
import supportInspectionDecisionPostgresRoutes from "./auth-support-inspection-decision-postgres-routes";
import supportMessagePostgresRoutes from "./auth-support-message-postgres-routes";
import supportPostgresRoutes from "./auth-support-postgres-routes";
import publicRoutes from "./auth-public-routes";
import sessionRoutes from "./auth-session-routes";
import adminPostgresRoutes from "./auth-admin-postgres-routes";
import adminRoutes from "./auth-admin-routes";
import merchantRealtimePgRouter from "./merchant-realtime-pg";
import subscriptionEntitlementPgRouter from "./subscription-entitlement-pg";
import saasBillingRouter from "./saas-billing";

const router = Router();
startPostgresSupportRuntimeCutover();
router.use(enforceAuthOrigin);
router.use((req: Request, res: Response, next: NextFunction) => {
  const path = String(req.path || "");
  const adminSurface = path === "/admin" || path.startsWith("/admin/") ||
    path === "/admins" || path.startsWith("/admins/");
  if (adminSurface && adminAuthPostgresCutoverMode() === "incomplete") {
    sendAuthError(
      res,
      503,
      "AUTH_POSTGRES_CUTOVER_INCOMPLETE",
      "administrator authentication PostgreSQL authority is incomplete",
    );
    return;
  }
  next();
});

const recoveryNoStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
};

router.use(saasBillingRouter as any);
router.use(subscriptionEntitlementPgRouter as any);
router.use(merchantRealtimePgRouter as any);
router.use(merchantManagementPostgresRoutes as any);
router.use(emergencyPostgresRoutes as any);
router.use(providerCostPostgresRoutes as any);
router.use(earlyWarningPostgresRoutes as any);
router.use(supportAdminLifecyclePostgresRoutes as any);
router.use(supportImageAliasPostgresRoutes as any);
router.use(supportInspectionDecisionPostgresRoutes as any);
router.use(supportMessagePostgresRoutes as any);
router.use(supportPostgresRoutes as any);
router.use("/admin/owner-recovery", recoveryNoStore);
router.use("/owner-recovery", recoveryNoStore);
router.use("/admin/owner-recovery", requireSecureAdminSession);
router.post(
  "/admin/owner-recovery/generate",
  requireOwnerRecoverySetupPassword,
);
router.use(ownerRecoveryPostgresRoutes as any);
router.use(adminDeviceOtpPgRoutes as any);
router.use(publicRoutes as any);
router.use(sessionRoutes as any);
router.use(adminPostgresRoutes as any);
router.use(adminRoutes as any);
export default router;
