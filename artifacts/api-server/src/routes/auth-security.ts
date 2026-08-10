import { Router } from "express";
import { enforceAuthOrigin } from "../middleware/authSession";
import publicRoutes from "./auth-public-routes";
import sessionRoutes from "./auth-session-routes";
import adminRoutes from "./auth-admin-routes";
import subscriptionEntitlementPgRouter from "./subscription-entitlement-pg";

const router = Router();
router.use(enforceAuthOrigin);
router.use(subscriptionEntitlementPgRouter as any);
router.use(publicRoutes as any);
router.use(sessionRoutes as any);
router.use(adminRoutes as any);
export default router;
