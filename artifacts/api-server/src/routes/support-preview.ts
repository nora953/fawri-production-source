import { Router, type Request, type Response } from "express";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  AUTH_DB_PATH,
  PREVIEW_DB_PATH,
  PREVIEW_DURATION_MS,
  authenticateAdmin,
  audit,
  endSession,
  findMerchant,
  findTicketRequest,
  makeId,
  now,
  readJson,
  readPreviewDb,
  resolveContext,
  sendError,
  writeJson,
  type PreviewSessionRecord,
} from "../services/supportPreviewSessions";

const router = Router();
const runtimePath = getFawriDataFilePath("fawri-runtime-db.json");
const savedAnswersPath = getFawriDataFilePath("saved-answers.json");
const trainingRequestsPath = getFawriDataFilePath("training-requests.json");
const learnedAnswersPath = getFawriDataFilePath("learned-answers.json");

function safeMerchant(merchant: Record<string, unknown>) {
  const allowed = [
    "id", "owner_name", "store_name", "phone", "activity_type", "status",
    "language", "theme_preference", "created_at", "account_status",
    "onboarding_status", "trial_status", "signup_source", "requested_plan",
    "approved_at", "warning_stage", "retention_status",
    "eligible_for_deletion_at", "grace_period_ends_at",
  ];
  return Object.fromEntries(allowed.map((key) => [key, merchant[key]]));
}

function safeSubscription(subscription: Record<string, unknown> | null) {
  if (!subscription) return null;
  const allowed = [
    "plan_name",
    "status",
    "price_iqd",
    "start_date",
    "expires_at",
    "reply_limit",
    "replies_used",
    "replies_remaining",
    "base_reply_limit",
    "base_replies_used",
    "base_replies_remaining",
    "addon_replies_remaining",
    "emergency_debt",
    "auto_reply_enabled",
  ];
  return Object.fromEntries(allowed.map((key) => [key, subscription[key]]));
}

function buildSnapshot(context: NonNullable<ReturnType<typeof resolveContext>>) {
  const runtime = readJson<Record<string, unknown>>(runtimePath, {});
  const byMerchant = (key: string) => {
    const source = runtime[key];
    if (!source || typeof source !== "object") return [];
    const value = (source as Record<string, unknown>)[context.merchant.id];
    return Array.isArray(value) ? value : [];
  };
  const pages = runtime.metaPagesByPageId && typeof runtime.metaPagesByPageId === "object"
    ? Object.values(runtime.metaPagesByPageId as Record<string, Record<string, unknown>>)
    : [];
  const channels = pages
    .filter((page) => page.merchant_id === context.merchant.id)
    .map((page) => ({
      page_id: page.page_id,
      page_name: page.page_name,
      platform: page.platform,
      connected_at: page.connected_at,
      webhook_subscribed: page.webhook_subscribed,
      instagram_account_id: page.instagram_account_id,
      instagram_username: page.instagram_username,
      instagram_name: page.instagram_name,
    }));
  const saved = readJson<{ answers?: Record<string, unknown>[] }>(savedAnswersPath, {}).answers || [];
  const training = readJson<{ requests?: Record<string, unknown>[] }>(trainingRequestsPath, {}).requests || [];
  const learned = readJson<{ answers?: Record<string, unknown>[] }>(learnedAnswersPath, {}).answers || [];
  const products = byMerchant("productsByMerchant");
  const orders = byMerchant("ordersByMerchant");
  const conversations = byMerchant("conversationsByMerchant");
  const savedAnswers = saved.filter((item) => item.merchant_id === context.merchant.id);
  const trainingRequests = training.filter((item) => item.merchantId === context.merchant.id);
  const learnedAnswers = learned.filter((item) => item.merchantId === context.merchant.id);
  const subscriptionRecord = context.authDb.subscriptions.find(
    (item) => item.merchant_id === context.merchant.id,
  ) || null;
  const subscription = safeSubscription(
    subscriptionRecord as unknown as Record<string, unknown> | null,
  );

  return {
    session: context.session,
    ticket: {
      id: context.ticket.id,
      subject: context.ticket.subject,
      category: context.ticket.category,
      status: context.ticket.status,
      assigned_admin_name: context.ticket.assigned_admin_name,
    },
    merchant: safeMerchant(context.merchant as unknown as Record<string, unknown>),
    subscription,
    products,
    orders,
    conversations,
    saved_answers: savedAnswers,
    training_requests: trainingRequests,
    learned_answers: learnedAnswers,
    channels,
    counts: {
      products: products.length,
      orders: orders.length,
      conversations: conversations.length,
      saved_answers: savedAnswers.length,
      training_requests: trainingRequests.length,
      learned_answers: learnedAnswers.length,
      channels: channels.length,
    },
    generated_at: now(),
  };
}

router.post("/start", (req: Request, res: Response) => {
  const authenticated = authenticateAdmin(req, res);
  if (!authenticated) return;
  const ticketId = String(req.body?.ticket_id || "").trim();
  const requestId = String(req.body?.request_id || "").trim();
  const found = findTicketRequest(authenticated.authDb, ticketId, requestId);
  if (!found) return sendError(res, 404, "inspection request not found", { code: "INSPECTION_REQUEST_NOT_FOUND" });
  const { ticket, inspectionRequest } = found;
  const merchant = findMerchant(authenticated.authDb, ticket.merchant_id);
  if (!merchant) return sendError(res, 404, "merchant not found", { code: "MERCHANT_NOT_FOUND" });
  if (ticket.status !== "open" && ticket.status !== "in_progress") {
    return sendError(res, 409, "support ticket is not active", { code: "INSPECTION_ACTIVE_TICKET_REQUIRED" });
  }
  if (ticket.assigned_admin_id !== authenticated.admin.id || inspectionRequest.admin_id !== authenticated.admin.id) {
    return sendError(res, 403, "inspection request belongs to another administrator", { code: "INSPECTION_ADMIN_MISMATCH" });
  }
  if (inspectionRequest.mode !== "independent_read_only") {
    return sendError(res, 409, "live observation is not implemented", { code: "LIVE_OBSERVATION_NOT_IMPLEMENTED" });
  }
  if (inspectionRequest.status !== "approved" || inspectionRequest.consent_decision !== "approved" || inspectionRequest.ended_at) {
    return sendError(res, 409, "merchant approval is not active", { code: "INSPECTION_APPROVAL_REQUIRED" });
  }
  const approvalExpiresAt = new Date(inspectionRequest.session_expires_at || 0).getTime();
  if (!Number.isFinite(approvalExpiresAt) || approvalExpiresAt <= Date.now()) {
    return sendError(res, 410, "merchant approval has expired", { code: "INSPECTION_APPROVAL_EXPIRED" });
  }

  const previewDb = readPreviewDb();
  const existing = previewDb.sessions.find((item) =>
    item.request_id === inspectionRequest.id &&
    item.admin_id === authenticated.admin.id &&
    item.status === "active" &&
    new Date(item.expires_at).getTime() > Date.now(),
  );
  if (existing) return res.json({ ok: true, session: existing, resumed: true });

  const endedSession = previewDb.sessions.find((item) =>
    item.request_id === inspectionRequest.id &&
    item.admin_id === authenticated.admin.id &&
    item.status === "ended",
  );
  if (endedSession) {
    const endedAt = endedSession.ended_at || now();
    inspectionRequest.status = "expired";
    inspectionRequest.ended_at = endedAt;
    inspectionRequest.expired_at = endedAt;
    inspectionRequest.end_reason = endedSession.end_reason || "admin_terminated";
    writeJson(AUTH_DB_PATH, authenticated.authDb);
    return sendError(res, 409, "inspection approval has already been consumed", {
      code: "INSPECTION_APPROVAL_CONSUMED",
    });
  }

  const startedAt = now();
  const sessionExpiresAt = new Date(Date.now() + PREVIEW_DURATION_MS).toISOString();
  const session: PreviewSessionRecord = {
    id: makeId("support-preview"),
    request_id: inspectionRequest.id,
    ticket_id: ticket.id,
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    admin_id: authenticated.admin.id,
    admin_name: authenticated.admin.owner_name,
    ...(authenticated.payload.sessionId ? { admin_session_id: authenticated.payload.sessionId } : {}),
    ...(authenticated.payload.deviceId ? { admin_device_id: authenticated.payload.deviceId } : {}),
    mode: "independent_read_only",
    status: "active",
    started_at: startedAt,
    expires_at: sessionExpiresAt,
    last_seen_at: startedAt,
    viewed_sections: [],
  };
  previewDb.sessions.unshift(session);
  inspectionRequest.started_at = startedAt;
  inspectionRequest.session_expires_at = sessionExpiresAt;
  inspectionRequest.preview_session_id = session.id;
  audit(authenticated.authDb, authenticated.admin, merchant, "support_preview_session_started", "read-only support preview session started", {
    preview_session_id: session.id,
    ticket_id: ticket.id,
    request_id: inspectionRequest.id,
  }, inspectionRequest.reason);
  writeJson(PREVIEW_DB_PATH, previewDb);
  writeJson(AUTH_DB_PATH, authenticated.authDb);
  res.setHeader("Cache-Control", "no-store");
  return res.status(201).json({ ok: true, session, resumed: false });
});

router.get("/:sessionId/snapshot", (req: Request, res: Response) => {
  const context = resolveContext(req, res);
  if (!context) return;
  if (!context.session.viewed_sections.includes("snapshot")) {
    context.session.viewed_sections.push("snapshot");
    audit(context.authDb, context.admin, context.merchant, "support_preview_section_viewed", "support preview snapshot viewed", {
      preview_session_id: context.session.id,
      ticket_id: context.ticket.id,
      request_id: context.inspectionRequest.id,
      section: "snapshot",
    });
    writeJson(PREVIEW_DB_PATH, context.previewDb);
    writeJson(AUTH_DB_PATH, context.authDb);
  }
  return res.json({ ok: true, snapshot: buildSnapshot(context) });
});

router.all("/:sessionId/snapshot", (req: Request, res: Response) =>
  sendError(res, 403, "support preview is read-only", {
    code: "SUPPORT_PREVIEW_READ_ONLY",
    method: req.method,
  }),
);

router.post("/:sessionId/end", (req: Request, res: Response) => {
  const context = resolveContext(req, res);
  if (!context) return;
  const endedAt = now();
  context.inspectionRequest.status = "expired";
  context.inspectionRequest.ended_at = endedAt;
  context.inspectionRequest.expired_at = endedAt;
  context.inspectionRequest.end_reason = "admin_terminated";
  endSession(context, "admin_terminated");
  return res.json({ ok: true, session: context.session });
});

export default router;
