import type { NextFunction, Request, Response } from 'express';
import { getAuthContext } from '../middleware/authSession';
import {
  router,
  requireMerchantSession as requireLegacyMerchantSession,
} from './authRuntime';
import './authRoutesPart3';

/**
 * Transitional business-route guard.
 *
 * The global auth cutover bridge validates the secure PostgreSQL-backed v2
 * merchant session before legacy-shaped business routers execute. Reuse that
 * server-derived context instead of consulting the worktree-local legacy
 * merchants.json authority a second time. If a caller reaches this export
 * without a secure context, retain the existing legacy guard and fail closed
 * exactly as before.
 */
export function requireMerchantSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const merchantId = getAuthContext(res)?.merchantProfile?.merchantId || '';
  if (merchantId) {
    res.locals.merchantId = merchantId;
    res.setHeader('Cache-Control', 'no-store');
    next();
    return;
  }

  requireLegacyMerchantSession(req, res, next);
}

export {
  createMerchantOAuthState,
  getMerchantIdFromSession,
  merchantSessionAccountExists,
  notifyMerchantNewCustomerMessage,
  notifyMerchantNewOrder,
  verifyMerchantOAuthState,
} from './authRuntime';
export default router;
