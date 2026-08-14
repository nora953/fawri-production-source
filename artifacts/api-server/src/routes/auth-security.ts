import { Router, type NextFunction, type Request, type Response } from "express";
import { enforceAuthOrigin, sendAuthError } from "../middleware/authSession";
import { adminAuthPostgresCutoverMode } from "../services/adminAuthPostgresCutover";
import adminDeviceOtpPgRoutes from "./auth-admin-device-otp-pg-routes";
import merchantManagementPostgresRoutes from "./auth-merchant-management-postgres-routes";
import publicRoutes from "./auth-public-routes";
import sessionRoutes from "./auth-session-routes";
import adminPostgresRoutes from "./auth-admin-postgres-routes";
import adminRoutes from "./auth-admin-routes";
import subscriptionEntitlementPgRouter from "./subscription-entitlement-pg";
import saasBillingRouter from "./saas-billing";

const router = Router();
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
router.use(saasBillingRouter as any);
router.use(subscriptionEntitlementPgRouter as any);
router.use(merchantManagementPostgresRoutes as any);
router.use(adminDeviceOtpPgRoutes as any);
router.use(publicRoutes as any);
router.use(sessionRoutes as any);
router.use(adminPostgresRoutes as any);
router.use(adminRoutes as any);
export default router;