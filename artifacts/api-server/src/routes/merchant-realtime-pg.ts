import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import { countUnreadMerchantNotificationsPostgresCanonical } from "../services/postgresMerchantNotificationAuthority";
import { listMerchantSupportTicketsPostgres } from "../services/postgresSupportAuthority";
import { refreshSupportLifecyclePostgresCanonical } from "../services/postgresSupportLifecycleAuthority";
import {
  getCurrentSubscriptionPostgres,
  subscriptionPostgresAuthorityRequired,
} from "../services/postgresSubscriptionEntitlement";

const router = Router();
const DEFAULT_MERCHANT_SSE_REVALIDATE_MS = 30_000;
const MERCHANT_REALTIME_REFRESH_MS = 5_000;
const MERCHANT_REALTIME_HEARTBEAT_MS = 15_000;

function postgresOnly(_req: Request, _res: Response, next: NextFunction): void {
  if (
    !operationalPostgresAuthorityRequired() ||
    !subscriptionPostgresAuthorityRequired()
  ) {
    next("router");
    return;
  }
  next();
}

function merchantId(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

function merchantSseRevalidateMs(): number {
  const configured = Number(process.env.FAWRI_AUTH_SSE_REVALIDATE_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_MERCHANT_SSE_REVALIDATE_MS;
  }
  return Math.max(5_000, Math.min(60_000, Math.trunc(configured)));
}

function writeSseEvent(
  res: Response,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  if (res.writableEnded) return;
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
}

function supportFingerprint(
  tickets: Awaited<ReturnType<typeof listMerchantSupportTicketsPostgres>>,
): string {
  return JSON.stringify(
    tickets.map((ticket) => ({
      id: ticket.id,
      status: ticket.status,
      updated_at: ticket.updated_at,
      waiting_on: ticket.waiting_on || null,
      message_id: ticket.messages[ticket.messages.length - 1]?.id || null,
      inspection_request_id: ticket.inspection_requests?.[0]?.id || null,
      inspection_status: ticket.inspection_requests?.[0]?.status || null,
    })),
  );
}

async function loadRealtimeState(currentMerchantId: string) {
  await refreshSupportLifecyclePostgresCanonical();
  const [subscription, unreadNotificationCount, tickets] = await Promise.all([
    getCurrentSubscriptionPostgres(currentMerchantId),
    countUnreadMerchantNotificationsPostgresCanonical(currentMerchantId),
    listMerchantSupportTicketsPostgres(currentMerchantId),
  ]);
  return {
    subscription,
    unreadNotificationCount,
    supportFingerprint: supportFingerprint(tickets),
  };
}

function publicPayload(state: Awaited<ReturnType<typeof loadRealtimeState>>) {
  return {
    subscription: state.subscription,
    unread_notification_count: state.unreadNotificationCount,
    emitted_at: new Date().toISOString(),
  };
}

router.use(postgresOnly);

router.get("/events", requireSecureMerchantSession, async (req, res) => {
  const currentMerchantId = merchantId(res);
  let state: Awaited<ReturnType<typeof loadRealtimeState>>;
  try {
    state = await loadRealtimeState(currentMerchantId);
  } catch (error) {
    console.error("PostgreSQL merchant realtime initialization failed:", error);
    sendAuthError(
      res,
      503,
      "MERCHANT_REALTIME_UNAVAILABLE",
      "merchant realtime authority is unavailable",
    );
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  req.socket.setTimeout(0);
  req.socket.setKeepAlive(true);

  let closed = false;
  let refreshInFlight = false;
  let refreshInterval: NodeJS.Timeout | undefined;
  let heartbeatInterval: NodeJS.Timeout | undefined;
  let revalidateTimeout: NodeJS.Timeout | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (refreshInterval) clearInterval(refreshInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (revalidateTimeout) clearTimeout(revalidateTimeout);
    if (!res.writableEnded) res.end();
  };

  writeSseEvent(res, "snapshot", publicPayload(state));

  refreshInterval = setInterval(() => {
    if (closed || res.writableEnded || refreshInFlight) return;
    refreshInFlight = true;
    void loadRealtimeState(currentMerchantId)
      .then((nextState) => {
        if (closed || res.writableEnded) return;
        const payload = publicPayload(nextState);
        if (JSON.stringify(nextState.subscription) !== JSON.stringify(state.subscription)) {
          writeSseEvent(res, "subscription_updated", payload);
        }
        if (nextState.unreadNotificationCount !== state.unreadNotificationCount) {
          writeSseEvent(res, "notifications_updated", payload);
        }
        if (nextState.supportFingerprint !== state.supportFingerprint) {
          writeSseEvent(res, "support_updated", payload);
        }
        state = nextState;
      })
      .catch(() => {
        if (!closed && !res.writableEnded) {
          writeSseEvent(res, "authority_unavailable", {
            code: "MERCHANT_REALTIME_UNAVAILABLE",
          });
        }
        cleanup();
      })
      .finally(() => {
        refreshInFlight = false;
      });
  }, MERCHANT_REALTIME_REFRESH_MS);
  refreshInterval.unref();

  heartbeatInterval = setInterval(() => {
    if (closed || res.writableEnded) return;
    try {
      res.write(": heartbeat\n\n");
      const flush = (res as Response & { flush?: () => void }).flush;
      if (typeof flush === "function") flush.call(res);
    } catch {
      cleanup();
    }
  }, MERCHANT_REALTIME_HEARTBEAT_MS);
  heartbeatInterval.unref();

  revalidateTimeout = setTimeout(cleanup, merchantSseRevalidateMs());
  revalidateTimeout.unref();

  req.once("close", cleanup);
  res.once("close", cleanup);
});

export default router;
