import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  normalizeAdminDeviceId,
  touchAdminTrackedSession,
  validateAdminTrackedSession,
} from "../services/adminWorkMonitor";

export type AdminRecord = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  status: string;
  is_admin?: boolean;
  admin_role?: "owner_admin" | "assistant_admin";
  permissions?: string[];
  admin_enabled?: boolean;
  must_change_password?: boolean;
  admin_session_version?: number;
};

export type MerchantRecord = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  activity_type: string;
  status: string;
  language?: string;
  theme_preference?: string;
  created_at?: string;
  is_admin?: boolean;
  account_status?: string;
  onboarding_status?: string;
  trial_status?: string;
  signup_source?: string;
  requested_plan?: string | null;
  approved_at?: string;
  warning_stage?: number;
  retention_status?: string;
  eligible_for_deletion_at?: string;
  grace_period_ends_at?: string;
};

export type InspectionRequestRecord = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_id: string;
  admin_name: string;
  mode: "live_observation" | "independent_read_only";
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired";
  consent_decision?: "approved" | "rejected";
  end_reason?: string;
  ended_at?: string;
  read_only: true;
  session_duration_minutes: 30;
  requested_at: string;
  request_expires_at: string;
  responded_at?: string;
  approved_at?: string;
  rejected_at?: string;
  expired_at?: string;
  started_at?: string;
  session_expires_at?: string;
  preview_session_id?: string;
};

export type SupportTicketRecord = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_admin_id?: string;
  assigned_admin_name?: string;
  created_at: string;
  updated_at: string;
  waiting_on?: "admin" | "merchant";
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  assistant_reminder_sent_at?: string;
  owner_escalated_at?: string;
  messages?: unknown[];
  inspection_requests?: InspectionRequestRecord[];
};

export type SubscriptionRecord = Record<string, unknown> & {
  merchant_id: string;
};

export type AuthDb = {
  merchants: Array<AdminRecord | MerchantRecord>;
  subscriptions: SubscriptionRecord[];
  admin_logs: Array<Record<string, unknown>>;
  support_tickets: SupportTicketRecord[];
  [key: string]: unknown;
};

export type AdminSessionPayload = {
  adminId: string;
  sessionVersion: number;
  sessionId?: string;
  deviceId?: string;
  expiresAt: number;
};

export type PreviewEndReason =
  | "admin_terminated"
  | "expired"
  | "ticket_resolved"
  | "ticket_closed"
  | "merchant_terminated"
  | "consent_revoked"
  | "assignment_changed";

export type PreviewSessionRecord = {
  id: string;
  request_id: string;
  ticket_id: string;
  merchant_id: string;
  merchant_name: string;
  admin_id: string;
  admin_name: string;
  admin_session_id?: string;
  admin_device_id?: string;
  mode: "independent_read_only";
  status: "active" | "ended";
  started_at: string;
  expires_at: string;
  last_seen_at: string;
  ended_at?: string;
  end_reason?: PreviewEndReason;
  viewed_sections: string[];
};

export type PreviewDb = {
  sessions: PreviewSessionRecord[];
};

export type AuthenticatedAdmin = {
  admin: AdminRecord;
  payload: AdminSessionPayload;
  authDb: AuthDb;
};

export type AdminAuthenticationOptions = {
  allowOwner?: boolean;
  requiredPermissions?: readonly string[];
};

export type PreviewContext = AuthenticatedAdmin & {
  previewDb: PreviewDb;
  session: PreviewSessionRecord;
  ticket: SupportTicketRecord;
  inspectionRequest: InspectionRequestRecord;
  merchant: MerchantRecord;
};

export const AUTH_DB_PATH = getFawriDataFilePath("merchants.json");
export const PREVIEW_DB_PATH = getFawriDataFilePath(
  "support-preview-sessions.json",
);
export const PREVIEW_DURATION_MS = 30 * 60 * 1000;

const SECRET =
  process.env.FAWRI_ADMIN_SESSION_SECRET ||
  process.env.FAWRI_PASSWORD_SALT ||
  "fawri-local-dev-salt";
const REQUIRED = ["manage_support", "inspect_merchant_sessions"] as const;

export const now = () => new Date().toISOString();
export const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, filePath);
}

export function readAuthDb(): AuthDb {
  const db = readJson<Partial<AuthDb>>(AUTH_DB_PATH, {});
  return {
    ...db,
    merchants: Array.isArray(db.merchants) ? db.merchants : [],
    subscriptions: Array.isArray(db.subscriptions) ? db.subscriptions : [],
    admin_logs: Array.isArray(db.admin_logs) ? db.admin_logs : [],
    support_tickets: Array.isArray(db.support_tickets)
      ? db.support_tickets
      : [],
  };
}

export function readPreviewDb(): PreviewDb {
  const db = readJson<Partial<PreviewDb>>(PREVIEW_DB_PATH, {});
  return { sessions: Array.isArray(db.sessions) ? db.sessions : [] };
}

export function sendError(
  res: Response,
  status: number,
  error: string,
  details: Record<string, unknown> = {},
): Response {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ ok: false, error, ...details });
}

function bearer(req: Request): string {
  return (
    String(req.headers.authorization || "")
      .trim()
      .match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() || ""
  );
}

function verifyToken(token: string): AdminSessionPayload | null {
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return null;

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;
    if (
      typeof payload.adminId !== "string" ||
      !payload.adminId ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      adminId: payload.adminId,
      sessionVersion:
        Number.isInteger(payload.sessionVersion) &&
        Number(payload.sessionVersion) >= 0
          ? Number(payload.sessionVersion)
          : 0,
      ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
      ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

function permissions(admin: AdminRecord): Set<string> {
  const result = new Set(
    Array.isArray(admin.permissions) ? admin.permissions : [],
  );
  if (result.has("inspection_sessions")) {
    result.add("inspect_merchant_sessions");
  }
  return result;
}

export function authenticateAdmin(
  req: Request,
  res: Response,
  options: AdminAuthenticationOptions = {},
): AuthenticatedAdmin | null {
  const payload = verifyToken(bearer(req));
  if (!payload) {
    sendError(res, 401, "admin session is missing or expired", {
      code: "ADMIN_SESSION_REQUIRED",
    });
    return null;
  }

  const authDb = readAuthDb();
  const admin = authDb.merchants.find(
    (record): record is AdminRecord =>
      record.id === payload.adminId && record.is_admin === true,
  );
  const ownerAllowed =
    options.allowOwner === true && admin?.admin_role === "owner_admin";
  const assistantAllowed = admin?.admin_role === "assistant_admin";

  if (
    !admin ||
    (!assistantAllowed && !ownerAllowed) ||
    admin.status !== "approved" ||
    admin.admin_enabled === false
  ) {
    sendError(res, 401, "administrator session is invalid", {
      code: "ADMIN_SESSION_INVALID",
    });
    return null;
  }

  const version = Number.isInteger(admin.admin_session_version)
    ? Number(admin.admin_session_version)
    : 0;
  if (version !== payload.sessionVersion) {
    sendError(res, 401, "administrator session was revoked", {
      code: "ADMIN_SESSION_REVOKED",
    });
    return null;
  }

  if (payload.sessionId) {
    const device = normalizeAdminDeviceId(req.headers["x-fawri-device-id"]);
    if (
      !device ||
      device !== payload.deviceId ||
      !validateAdminTrackedSession({
        adminId: admin.id,
        sessionId: payload.sessionId,
        deviceId: device,
      })
    ) {
      sendError(
        res,
        401,
        "administrator session or device is no longer trusted",
        { code: "ADMIN_TRACKED_SESSION_REVOKED" },
      );
      return null;
    }
    touchAdminTrackedSession(payload.sessionId, true);
  }

  if (admin.must_change_password === true) {
    sendError(res, 403, "administrator password change is required", {
      code: "ADMIN_PASSWORD_CHANGE_REQUIRED",
    });
    return null;
  }

  if (!ownerAllowed) {
    const requiredPermissions = options.requiredPermissions ?? REQUIRED;
    const availablePermissions = permissions(admin);
    const missing = requiredPermissions.filter(
      (permission) => !availablePermissions.has(permission),
    );
    if (missing.length) {
      sendError(res, 403, "administrator permission is required", {
        code: "ADMIN_PERMISSION_REQUIRED",
        missing_permissions: missing,
      });
      return null;
    }
  }

  return { admin, payload, authDb };
}

export function findMerchant(
  db: AuthDb,
  id: string,
): MerchantRecord | null {
  return (
    db.merchants.find(
      (record): record is MerchantRecord =>
        record.id === id && record.is_admin !== true,
    ) || null
  );
}

export function findTicketRequest(
  db: AuthDb,
  ticketId: string,
  requestId: string,
): {
  ticket: SupportTicketRecord;
  inspectionRequest: InspectionRequestRecord;
} | null {
  const ticket = db.support_tickets.find((item) => item.id === ticketId);
  const inspectionRequest = ticket?.inspection_requests?.find(
    (item) => item.id === requestId,
  );
  return ticket && inspectionRequest ? { ticket, inspectionRequest } : null;
}

export function audit(
  db: AuthDb,
  admin: AdminRecord,
  merchant: MerchantRecord,
  action_type: string,
  details: string,
  meta: Record<string, string | number>,
  reason?: string,
): void {
  db.admin_logs.unshift({
    id: makeId("admin-log"),
    admin_id: admin.id,
    admin_name: admin.owner_name,
    admin_phone: admin.phone,
    admin_role: admin.admin_role,
    action_type,
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    details,
    meta,
    ...(reason ? { reason } : {}),
    created_at: now(),
  });
}

function expireRequest(
  request: InspectionRequestRecord,
  endedAt: string,
): void {
  request.status = "expired";
  request.ended_at = endedAt;
  request.expired_at = endedAt;
  request.end_reason = "approval_window_expired";
}

export function endSession(
  context: PreviewContext,
  reason: PreviewEndReason,
  endRequest = false,
): void {
  if (context.session.status === "ended") return;

  const endedAt = now();
  Object.assign(context.session, {
    status: "ended",
    ended_at: endedAt,
    end_reason: reason,
    last_seen_at: endedAt,
  });
  if (endRequest) expireRequest(context.inspectionRequest, endedAt);
  audit(
    context.authDb,
    context.admin,
    context.merchant,
    "support_preview_session_ended",
    `support preview session ended: ${reason}`,
    {
      preview_session_id: context.session.id,
      ticket_id: context.ticket.id,
      request_id: context.inspectionRequest.id,
      end_reason: reason,
    },
  );
  writeJson(PREVIEW_DB_PATH, context.previewDb);
  writeJson(AUTH_DB_PATH, context.authDb);
}

export function resolveContext(
  req: Request,
  res: Response,
): PreviewContext | null {
  const authenticated = authenticateAdmin(req, res);
  if (!authenticated) return null;

  const previewDb = readPreviewDb();
  const id = String(req.params.sessionId || "").trim();
  const session = previewDb.sessions.find((item) => item.id === id);
  if (!session || session.admin_id !== authenticated.admin.id) {
    sendError(res, 404, "support preview session not found", {
      code: "SUPPORT_PREVIEW_NOT_FOUND",
    });
    return null;
  }

  if (
    session.admin_session_id &&
    session.admin_session_id !== authenticated.payload.sessionId
  ) {
    sendError(
      res,
      403,
      "support preview belongs to another administrator session",
      { code: "SUPPORT_PREVIEW_SESSION_MISMATCH" },
    );
    return null;
  }

  if (
    session.admin_device_id &&
    session.admin_device_id !==
      (authenticated.payload.deviceId ||
        normalizeAdminDeviceId(req.headers["x-fawri-device-id"]))
  ) {
    sendError(
      res,
      403,
      "support preview belongs to another administrator device",
      { code: "SUPPORT_PREVIEW_DEVICE_MISMATCH" },
    );
    return null;
  }

  const found = findTicketRequest(
    authenticated.authDb,
    session.ticket_id,
    session.request_id,
  );
  const merchant = findMerchant(authenticated.authDb, session.merchant_id);
  if (!found || !merchant) {
    sendError(res, 410, "support preview is no longer available", {
      code: "SUPPORT_PREVIEW_ENDED",
    });
    return null;
  }

  const context: PreviewContext = {
    ...authenticated,
    previewDb,
    session,
    ticket: found.ticket,
    inspectionRequest: found.inspectionRequest,
    merchant,
  };

  if (session.status === "ended") {
    sendError(res, 410, "support preview session has ended", {
      code: "SUPPORT_PREVIEW_ENDED",
      end_reason: session.end_reason,
    });
    return null;
  }

  if (Date.now() >= new Date(session.expires_at).getTime()) {
    endSession(context, "expired", true);
    sendError(res, 410, "support preview session has expired", {
      code: "SUPPORT_PREVIEW_EXPIRED",
    });
    return null;
  }

  if (context.ticket.status === "resolved" || context.ticket.status === "closed") {
    endSession(
      context,
      context.ticket.status === "resolved" ? "ticket_resolved" : "ticket_closed",
    );
    sendError(res, 410, "support preview ended with the ticket", {
      code: "SUPPORT_PREVIEW_ENDED",
    });
    return null;
  }

  if (context.ticket.assigned_admin_id !== context.admin.id) {
    endSession(context, "assignment_changed");
    sendError(res, 410, "support preview assignment changed", {
      code: "SUPPORT_PREVIEW_ENDED",
    });
    return null;
  }

  if (
    context.inspectionRequest.status !== "approved" ||
    context.inspectionRequest.consent_decision !== "approved" ||
    context.inspectionRequest.ended_at
  ) {
    const reason =
      context.inspectionRequest.end_reason === "merchant_terminated"
        ? "merchant_terminated"
        : "consent_revoked";
    endSession(context, reason);
    sendError(res, 410, "merchant consent is no longer active", {
      code: "SUPPORT_PREVIEW_CONSENT_ENDED",
      end_reason: reason,
    });
    return null;
  }

  session.last_seen_at = now();
  writeJson(PREVIEW_DB_PATH, previewDb);
  res.setHeader("Cache-Control", "no-store");
  return context;
}
