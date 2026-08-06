import type { NextFunction, Request, Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
  verifyMerchantOAuthState,
} from "../routes/auth";
import {
  getMerchantOperationalDecision,
  type MerchantOperationalDecision,
} from "../services/merchantOperationalAccess";

const OPERATIONAL_PREFIXES = [
  "/api/products",
  "/api/conversations",
  "/api/conversation",
  "/api/orders",
  "/api/bot",
  "/api/saved-answers",
  "/api/bot-training",
] as const;

const OPERATIONAL_EXACT_PATHS = new Set([
  "/api/meta/login",
  "/api/meta/pages",
]);

function sendDeniedDecision(
  res: Response,
  decision: Exclude<MerchantOperationalDecision, { allowed: true }>,
): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(decision.statusCode).json({
    ok: false,
    error: decision.error,
    code: decision.code,
  });
}

function queryString(value: unknown): string {
  if (Array.isArray(value)) return queryString(value[0]);
  return String(value || "").trim();
}

export function isMerchantOperationalPath(req: Request): boolean {
  if (req.method === "OPTIONS") return false;

  const requestPath = req.path;
  if (OPERATIONAL_EXACT_PATHS.has(requestPath)) return true;

  return OPERATIONAL_PREFIXES.some(
    (prefix) =>
      requestPath === prefix || requestPath.startsWith(`${prefix}/`),
  );
}

export function enforceMerchantOperationalAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isMerchantOperationalPath(req)) {
    next();
    return;
  }

  requireMerchantSession(req, res, () => {
    const decision = getMerchantOperationalDecision(
      getMerchantIdFromSession(res),
    );
    if (!decision.allowed) {
      sendDeniedDecision(res, decision);
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    next();
  });
}

export function enforceMerchantOAuthCallbackOperationalAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "GET" || req.path !== "/api/meta/callback") {
    next();
    return;
  }

  const stateToken = queryString(req.query.state);
  const state = stateToken ? verifyMerchantOAuthState(stateToken) : null;
  if (!state) {
    next();
    return;
  }

  const decision = getMerchantOperationalDecision(state.merchantId);
  if (!decision.allowed) {
    sendDeniedDecision(res, decision);
    return;
  }

  next();
}
