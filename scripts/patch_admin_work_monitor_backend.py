from pathlib import Path
import json
import re


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))


def regex_replace_once(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(updated)


# -----------------------------------------------------------------------------
# Persistent administrator session/device security store
# -----------------------------------------------------------------------------
service = Path("artifacts/api-server/src/services/adminWorkMonitor.ts")
service.write_text(r'''import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ADMIN_MAX_OPEN_SESSIONS = 2;
export const ADMIN_MAX_TRUSTED_DEVICES = 2;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type DeviceTrustStatus = "pending" | "trusted" | "revoked";

export type AdminTrackedSession = {
  id: string;
  admin_id: string;
  device_id: string;
  device_label: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  last_activity_at: string;
  expires_at: string;
  revoked_at?: string;
  revoked_reason?: string;
};

export type AdminTrustedDevice = {
  id: string;
  admin_id: string;
  device_id: string;
  device_label: string;
  user_agent: string;
  status: DeviceTrustStatus;
  first_seen_at: string;
  last_seen_at: string;
  trusted_at?: string;
  trusted_by_admin_id?: string;
  revoked_at?: string;
  revoked_by_admin_id?: string;
};

type AdminFailedLogin = {
  id: string;
  admin_id: string;
  phone: string;
  device_id?: string;
  device_label?: string;
  created_at: string;
  reason: string;
};

type AdminSecurityStore = {
  version: 1;
  sessions: AdminTrackedSession[];
  devices: AdminTrustedDevice[];
  failed_logins: AdminFailedLogin[];
};

export type AdminWorkStatus = "active" | "idle" | "offline";

export class AdminWorkMonitorError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, string | number>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "AdminWorkMonitorError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function getSecurityFilePath(): string {
  const merchantCandidates = [
    path.resolve(process.cwd(), "data", "merchants.json"),
    path.resolve(process.cwd(), "..", "data", "merchants.json"),
    path.resolve(process.cwd(), "..", "..", "data", "merchants.json"),
    path.resolve("/home/runner/workspace", "data", "merchants.json"),
  ];
  const existingMerchantDb = merchantCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );
  const dataDir = existingMerchantDb
    ? path.dirname(existingMerchantDb)
    : path.dirname(merchantCandidates[0]);
  return path.join(dataDir, "admin-work-monitor.json");
}

const SECURITY_PATH = getSecurityFilePath();

function emptyStore(): AdminSecurityStore {
  return { version: 1, sessions: [], devices: [], failed_logins: [] };
}

function normalizeDate(value: unknown, fallback: string): string {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeStore(value: unknown): AdminSecurityStore {
  const now = new Date().toISOString();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyStore();
  }
  const source = value as Partial<AdminSecurityStore>;
  const sessions = Array.isArray(source.sessions)
    ? source.sessions
        .filter(
          (item): item is AdminTrackedSession =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.admin_id === "string" &&
                typeof item.device_id === "string",
            ),
        )
        .map((item) => ({
          ...item,
          device_label: String(item.device_label || "Unknown device").slice(0, 120),
          user_agent: String(item.user_agent || "").slice(0, 500),
          created_at: normalizeDate(item.created_at, now),
          last_seen_at: normalizeDate(item.last_seen_at, now),
          last_activity_at: normalizeDate(item.last_activity_at, now),
          expires_at: normalizeDate(item.expires_at, now),
        }))
    : [];
  const devices = Array.isArray(source.devices)
    ? source.devices
        .filter(
          (item): item is AdminTrustedDevice =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.admin_id === "string" &&
                typeof item.device_id === "string",
            ),
        )
        .map((item) => ({
          ...item,
          device_label: String(item.device_label || "Unknown device").slice(0, 120),
          user_agent: String(item.user_agent || "").slice(0, 500),
          status:
            item.status === "trusted" || item.status === "revoked"
              ? item.status
              : "pending",
          first_seen_at: normalizeDate(item.first_seen_at, now),
          last_seen_at: normalizeDate(item.last_seen_at, now),
        }))
    : [];
  const failedLogins = Array.isArray(source.failed_logins)
    ? source.failed_logins.filter(
        (item): item is AdminFailedLogin =>
          Boolean(
            item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.admin_id === "string" &&
              typeof item.phone === "string" &&
              typeof item.created_at === "string",
          ),
      )
    : [];
  return { version: 1, sessions, devices, failed_logins: failedLogins };
}

function readStore(): AdminSecurityStore {
  fs.mkdirSync(path.dirname(SECURITY_PATH), { recursive: true });
  if (!fs.existsSync(SECURITY_PATH)) return emptyStore();
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(SECURITY_PATH, "utf8")));
  } catch (error) {
    console.error("Failed to read admin work monitor data:", error);
    return emptyStore();
  }
}

function writeStore(store: AdminSecurityStore): void {
  fs.mkdirSync(path.dirname(SECURITY_PATH), { recursive: true });
  const temporaryPath = `${SECURITY_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryPath, SECURITY_PATH);
}

function cleanStore(store: AdminSecurityStore, nowMs = Date.now()): boolean {
  const beforeSessions = store.sessions.length;
  const beforeFailures = store.failed_logins.length;
  store.sessions = store.sessions.filter((session) => {
    const expiry = new Date(session.expires_at).getTime();
    const revoked = new Date(session.revoked_at || 0).getTime();
    if (session.revoked_at) return revoked >= nowMs - HISTORY_RETENTION_MS;
    return expiry >= nowMs - HISTORY_RETENTION_MS;
  });
  store.failed_logins = store.failed_logins.filter(
    (attempt) =>
      new Date(attempt.created_at).getTime() >= nowMs - HISTORY_RETENTION_MS,
  );
  return (
    beforeSessions !== store.sessions.length ||
    beforeFailures !== store.failed_logins.length
  );
}

function isOpenSession(session: AdminTrackedSession, nowMs = Date.now()): boolean {
  return (
    !session.revoked_at &&
    new Date(session.expires_at).getTime() > nowMs
  );
}

function safeText(value: unknown, fallback: string, limit: number): string {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, limit);
}

export function normalizeAdminDeviceId(value: unknown): string {
  const deviceId = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{16,128}$/.test(deviceId) ? deviceId : "";
}

export function adminDeviceSecurityEnforced(): boolean {
  if (process.env.FAWRI_ADMIN_DEVICE_TRUST_ENFORCED === "false") return false;
  if (process.env.FAWRI_ADMIN_DEVICE_TRUST_ENFORCED === "true") return true;
  return process.env.NODE_ENV !== "test";
}

export function registerAdminDeviceAttempt(input: {
  adminId: string;
  deviceId: string;
  deviceLabel?: string;
  userAgent?: string;
}): AdminTrustedDevice {
  const deviceId = normalizeAdminDeviceId(input.deviceId);
  if (!deviceId) {
    throw new AdminWorkMonitorError(
      400,
      "ADMIN_DEVICE_ID_REQUIRED",
      "a valid administrator device identifier is required",
    );
  }
  const store = readStore();
  cleanStore(store);
  const timestamp = new Date().toISOString();
  let device = store.devices.find(
    (item) => item.admin_id === input.adminId && item.device_id === deviceId,
  );
  if (!device) {
    device = {
      id: crypto.randomUUID(),
      admin_id: input.adminId,
      device_id: deviceId,
      device_label: safeText(input.deviceLabel, "Unknown device", 120),
      user_agent: safeText(input.userAgent, "", 500),
      status: "pending",
      first_seen_at: timestamp,
      last_seen_at: timestamp,
    };
    store.devices.unshift(device);
  } else {
    device.device_label = safeText(
      input.deviceLabel,
      device.device_label || "Unknown device",
      120,
    );
    device.user_agent = safeText(input.userAgent, device.user_agent || "", 500);
    device.last_seen_at = timestamp;
    if (device.status === "revoked") {
      device.status = "pending";
      delete device.trusted_at;
      delete device.trusted_by_admin_id;
      delete device.revoked_at;
      delete device.revoked_by_admin_id;
    }
  }
  writeStore(store);
  return { ...device };
}

export function isAdminDeviceTrusted(adminId: string, deviceId: string): boolean {
  const normalized = normalizeAdminDeviceId(deviceId);
  if (!normalized) return false;
  return readStore().devices.some(
    (device) =>
      device.admin_id === adminId &&
      device.device_id === normalized &&
      device.status === "trusted",
  );
}

export function approveAdminTrustedDevice(input: {
  adminId: string;
  deviceId: string;
  ownerId: string;
}): AdminTrustedDevice {
  const deviceId = normalizeAdminDeviceId(input.deviceId);
  const store = readStore();
  cleanStore(store);
  const device = store.devices.find(
    (item) => item.admin_id === input.adminId && item.device_id === deviceId,
  );
  if (!device) {
    throw new AdminWorkMonitorError(404, "ADMIN_DEVICE_NOT_FOUND", "device not found");
  }
  const trustedCount = store.devices.filter(
    (item) => item.admin_id === input.adminId && item.status === "trusted",
  ).length;
  if (device.status !== "trusted" && trustedCount >= ADMIN_MAX_TRUSTED_DEVICES) {
    throw new AdminWorkMonitorError(
      409,
      "ADMIN_TRUSTED_DEVICE_LIMIT_REACHED",
      "the administrator already has the maximum number of trusted devices",
      { limit: ADMIN_MAX_TRUSTED_DEVICES },
    );
  }
  const timestamp = new Date().toISOString();
  device.status = "trusted";
  device.trusted_at = timestamp;
  device.trusted_by_admin_id = input.ownerId;
  device.last_seen_at = timestamp;
  delete device.revoked_at;
  delete device.revoked_by_admin_id;
  writeStore(store);
  return { ...device };
}

export function revokeAdminTrustedDevice(input: {
  adminId: string;
  deviceId: string;
  ownerId: string;
}): AdminTrustedDevice {
  const deviceId = normalizeAdminDeviceId(input.deviceId);
  const store = readStore();
  const device = store.devices.find(
    (item) => item.admin_id === input.adminId && item.device_id === deviceId,
  );
  if (!device) {
    throw new AdminWorkMonitorError(404, "ADMIN_DEVICE_NOT_FOUND", "device not found");
  }
  const timestamp = new Date().toISOString();
  device.status = "revoked";
  device.revoked_at = timestamp;
  device.revoked_by_admin_id = input.ownerId;
  for (const session of store.sessions) {
    if (
      session.admin_id === input.adminId &&
      session.device_id === deviceId &&
      isOpenSession(session)
    ) {
      session.revoked_at = timestamp;
      session.revoked_reason = "device_trust_revoked";
    }
  }
  writeStore(store);
  return { ...device };
}

export function createAdminTrackedSession(input: {
  adminId: string;
  deviceId: string;
  deviceLabel?: string;
  userAgent?: string;
  expiresAt: number;
}): AdminTrackedSession {
  const deviceId = normalizeAdminDeviceId(input.deviceId);
  if (!isAdminDeviceTrusted(input.adminId, deviceId)) {
    throw new AdminWorkMonitorError(
      403,
      "ADMIN_DEVICE_APPROVAL_REQUIRED",
      "administrator device approval is required",
    );
  }
  const store = readStore();
  cleanStore(store);
  const timestamp = new Date().toISOString();
  for (const session of store.sessions) {
    if (
      session.admin_id === input.adminId &&
      session.device_id === deviceId &&
      isOpenSession(session)
    ) {
      session.revoked_at = timestamp;
      session.revoked_reason = "replaced_by_new_login";
    }
  }
  const openSessions = store.sessions.filter(
    (session) => session.admin_id === input.adminId && isOpenSession(session),
  );
  if (openSessions.length >= ADMIN_MAX_OPEN_SESSIONS) {
    writeStore(store);
    throw new AdminWorkMonitorError(
      409,
      "ADMIN_SESSION_LIMIT_REACHED",
      "the administrator already has the maximum number of open sessions",
      { limit: ADMIN_MAX_OPEN_SESSIONS },
    );
  }
  const session: AdminTrackedSession = {
    id: crypto.randomUUID(),
    admin_id: input.adminId,
    device_id: deviceId,
    device_label: safeText(input.deviceLabel, "Unknown device", 120),
    user_agent: safeText(input.userAgent, "", 500),
    created_at: timestamp,
    last_seen_at: timestamp,
    last_activity_at: timestamp,
    expires_at: new Date(input.expiresAt).toISOString(),
  };
  store.sessions.unshift(session);
  const device = store.devices.find(
    (item) => item.admin_id === input.adminId && item.device_id === deviceId,
  );
  if (device) device.last_seen_at = timestamp;
  writeStore(store);
  return { ...session };
}

export function validateAdminTrackedSession(input: {
  adminId: string;
  sessionId: string;
  deviceId: string;
}): boolean {
  const deviceId = normalizeAdminDeviceId(input.deviceId);
  if (!deviceId) return false;
  const store = readStore();
  const session = store.sessions.find((item) => item.id === input.sessionId);
  return Boolean(
    session &&
      session.admin_id === input.adminId &&
      session.device_id === deviceId &&
      isOpenSession(session) &&
      store.devices.some(
        (device) =>
          device.admin_id === input.adminId &&
          device.device_id === deviceId &&
          device.status === "trusted",
      ),
  );
}

export function touchAdminTrackedSession(
  sessionId: string,
  activity: boolean,
): void {
  const store = readStore();
  const session = store.sessions.find(
    (item) => item.id === sessionId && isOpenSession(item),
  );
  if (!session) return;
  const timestamp = new Date().toISOString();
  session.last_seen_at = timestamp;
  if (activity) session.last_activity_at = timestamp;
  const device = store.devices.find(
    (item) =>
      item.admin_id === session.admin_id && item.device_id === session.device_id,
  );
  if (device) device.last_seen_at = timestamp;
  writeStore(store);
}

export function revokeAdminTrackedSession(input: {
  adminId: string;
  sessionId: string;
  reason: string;
}): AdminTrackedSession {
  const store = readStore();
  const session = store.sessions.find(
    (item) => item.id === input.sessionId && item.admin_id === input.adminId,
  );
  if (!session) {
    throw new AdminWorkMonitorError(404, "ADMIN_SESSION_NOT_FOUND", "session not found");
  }
  if (!session.revoked_at) {
    session.revoked_at = new Date().toISOString();
    session.revoked_reason = safeText(input.reason, "owner_terminated", 120);
    writeStore(store);
  }
  return { ...session };
}

export function revokeAllAdminTrackedSessions(
  adminId: string,
  reason: string,
): number {
  const store = readStore();
  const timestamp = new Date().toISOString();
  let count = 0;
  for (const session of store.sessions) {
    if (session.admin_id === adminId && isOpenSession(session)) {
      session.revoked_at = timestamp;
      session.revoked_reason = safeText(reason, "revoked", 120);
      count += 1;
    }
  }
  if (count > 0) writeStore(store);
  return count;
}

export function recordAdminFailedLogin(input: {
  adminId: string;
  phone: string;
  deviceId?: string;
  deviceLabel?: string;
  reason: string;
}): void {
  const store = readStore();
  cleanStore(store);
  store.failed_logins.unshift({
    id: crypto.randomUUID(),
    admin_id: input.adminId,
    phone: safeText(input.phone, "", 30),
    ...(normalizeAdminDeviceId(input.deviceId)
      ? { device_id: normalizeAdminDeviceId(input.deviceId) }
      : {}),
    ...(input.deviceLabel
      ? { device_label: safeText(input.deviceLabel, "Unknown device", 120) }
      : {}),
    created_at: new Date().toISOString(),
    reason: safeText(input.reason, "invalid_credentials", 120),
  });
  store.failed_logins = store.failed_logins.slice(0, 500);
  writeStore(store);
}

export function getAdminCardSecuritySummary(adminId: string): {
  work_status: AdminWorkStatus;
  open_session_count: number;
  last_activity_at: string | null;
  pending_device_count: number;
} {
  const store = readStore();
  const nowMs = Date.now();
  const sessions = store.sessions.filter(
    (session) => session.admin_id === adminId && isOpenSession(session, nowMs),
  );
  const recentSeen = sessions.filter(
    (session) => nowMs - new Date(session.last_seen_at).getTime() <= ONLINE_WINDOW_MS,
  );
  const active = recentSeen.some(
    (session) =>
      nowMs - new Date(session.last_activity_at).getTime() <= ONLINE_WINDOW_MS,
  );
  const lastActivity = sessions
    .map((session) => session.last_activity_at)
    .sort((left, right) =>
      new Date(right).getTime() - new Date(left).getTime(),
    )[0];
  return {
    work_status: active ? "active" : recentSeen.length > 0 ? "idle" : "offline",
    open_session_count: sessions.length,
    last_activity_at: lastActivity || null,
    pending_device_count: store.devices.filter(
      (device) => device.admin_id === adminId && device.status === "pending",
    ).length,
  };
}

export function getAdminWorkMonitor(adminId: string): {
  summary: ReturnType<typeof getAdminCardSecuritySummary> & {
    session_limit: number;
    trusted_device_limit: number;
    trusted_device_count: number;
    failed_login_count_24h: number;
  };
  sessions: AdminTrackedSession[];
  devices: AdminTrustedDevice[];
  failed_logins: AdminFailedLogin[];
} {
  const store = readStore();
  cleanStore(store);
  const nowMs = Date.now();
  const sessions = store.sessions
    .filter((session) => session.admin_id === adminId && isOpenSession(session, nowMs))
    .sort(
      (left, right) =>
        new Date(right.last_seen_at).getTime() -
        new Date(left.last_seen_at).getTime(),
    );
  const devices = store.devices
    .filter(
      (device) =>
        device.admin_id === adminId &&
        (device.status === "trusted" || device.status === "pending"),
    )
    .sort(
      (left, right) =>
        new Date(right.last_seen_at).getTime() -
        new Date(left.last_seen_at).getTime(),
    );
  const failedLogins = store.failed_logins
    .filter((attempt) => attempt.admin_id === adminId)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, 20);
  return {
    summary: {
      ...getAdminCardSecuritySummary(adminId),
      session_limit: ADMIN_MAX_OPEN_SESSIONS,
      trusted_device_limit: ADMIN_MAX_TRUSTED_DEVICES,
      trusted_device_count: devices.filter(
        (device) => device.status === "trusted",
      ).length,
      failed_login_count_24h: failedLogins.filter(
        (attempt) =>
          nowMs - new Date(attempt.created_at).getTime() <= 24 * 60 * 60 * 1000,
      ).length,
    },
    sessions,
    devices,
    failed_logins: failedLogins,
  };
}
''')

# -----------------------------------------------------------------------------
# Backend route integration
# -----------------------------------------------------------------------------
auth = Path("artifacts/api-server/src/routes/auth.ts")
replace_once(
    auth,
    '''import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/passwordService";
''',
    '''import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/passwordService";
import {
  AdminWorkMonitorError,
  adminDeviceSecurityEnforced,
  approveAdminTrustedDevice,
  createAdminTrackedSession,
  getAdminCardSecuritySummary,
  getAdminWorkMonitor,
  isAdminDeviceTrusted,
  normalizeAdminDeviceId,
  recordAdminFailedLogin,
  registerAdminDeviceAttempt,
  revokeAdminTrackedSession,
  revokeAdminTrustedDevice,
  revokeAllAdminTrackedSessions,
  touchAdminTrackedSession,
  validateAdminTrackedSession,
  type AdminTrackedSession,
} from "../services/adminWorkMonitor";
''',
    "admin work monitor import",
)
replace_once(
    auth,
    '''type AdminSessionPayload = {
  adminId: string;
  sessionVersion: number;
  expiresAt: number;
};
''',
    '''type AdminSessionPayload = {
  adminId: string;
  sessionVersion: number;
  sessionId?: string;
  deviceId?: string;
  expiresAt: number;
};
''',
    "tracked admin session payload",
)
replace_once(
    auth,
    '''function revokeAdminSessions(admin: Merchant): void {
  admin.admin_session_version =
    normalizeAdminSessionVersion(admin.admin_session_version) + 1;
}
''',
    '''function revokeAdminSessions(admin: Merchant): void {
  admin.admin_session_version =
    normalizeAdminSessionVersion(admin.admin_session_version) + 1;
  revokeAllAdminTrackedSessions(admin.id, "security_version_revoked");
}
''',
    "revoke tracked admin sessions",
)
replace_once(
    auth,
    '''function createAdminSessionToken(admin: Merchant): string {
  const payload: AdminSessionPayload = {
    adminId: admin.id,
    sessionVersion: normalizeAdminSessionVersion(
      admin.admin_session_version,
    ),
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  };
''',
    '''function createAdminSessionToken(
  admin: Merchant,
  trackedSession?: AdminTrackedSession,
): string {
  const payload: AdminSessionPayload = {
    adminId: admin.id,
    sessionVersion: normalizeAdminSessionVersion(
      admin.admin_session_version,
    ),
    ...(trackedSession
      ? {
          sessionId: trackedSession.id,
          deviceId: trackedSession.device_id,
        }
      : {}),
    expiresAt: trackedSession
      ? new Date(trackedSession.expires_at).getTime()
      : Date.now() + ADMIN_SESSION_TTL_MS,
  };
''',
    "create tracked admin token",
)
replace_once(
    auth,
    '''      sessionVersion:
        typeof payload.sessionVersion === "number" &&
        Number.isInteger(payload.sessionVersion) &&
        payload.sessionVersion >= 0
          ? payload.sessionVersion
          : 0,
      expiresAt: payload.expiresAt,
''',
    '''      sessionVersion:
        typeof payload.sessionVersion === "number" &&
        Number.isInteger(payload.sessionVersion) &&
        payload.sessionVersion >= 0
          ? payload.sessionVersion
          : 0,
      ...(typeof payload.sessionId === "string" && payload.sessionId
        ? { sessionId: payload.sessionId }
        : {}),
      ...(typeof payload.deviceId === "string" && payload.deviceId
        ? { deviceId: payload.deviceId }
        : {}),
      expiresAt: payload.expiresAt,
''',
    "verify tracked admin token",
)
replace_once(
    auth,
    '''  options: { allowPasswordChangeRequired?: boolean } = {},
''',
    '''  options: {
    allowPasswordChangeRequired?: boolean;
    recordActivity?: boolean;
  } = {},
''',
    "admin session options",
)
replace_once(
    auth,
    '''  if (
    admin.must_change_password === true &&
    options.allowPasswordChangeRequired !== true
  ) {
''',
    '''  if (payload.sessionId) {
    const requestDeviceId = normalizeAdminDeviceId(
      req.headers["x-fawri-device-id"],
    );
    if (
      !requestDeviceId ||
      payload.deviceId !== requestDeviceId ||
      !validateAdminTrackedSession({
        adminId: admin.id,
        sessionId: payload.sessionId,
        deviceId: requestDeviceId,
      })
    ) {
      sendError(res, 401, "administrator session or device is no longer trusted", {
        code: "ADMIN_TRACKED_SESSION_REVOKED",
      });
      return null;
    }
    touchAdminTrackedSession(
      payload.sessionId,
      options.recordActivity !== false,
    );
  }

  if (
    admin.must_change_password === true &&
    options.allowPasswordChangeRequired !== true
  ) {
''',
    "validate tracked admin session",
)

# Helpers placed before owner/admin permission helpers.
replace_once(
    auth,
    '''function isOwnerAdmin(admin: Merchant): boolean {
''',
    '''function getAdminDeviceContext(req: Request): {
  deviceId: string;
  deviceLabel: string;
  userAgent: string;
} {
  return {
    deviceId: normalizeAdminDeviceId(
      req.body?.device_id || req.headers["x-fawri-device-id"],
    ),
    deviceLabel: String(req.body?.device_label || "").trim(),
    userAgent: String(req.headers["user-agent"] || "").trim(),
  };
}

function createAssistantTrackedSession(
  admin: Merchant,
  req: Request,
): AdminTrackedSession | undefined {
  if (!isAssistantAdmin(admin) || !adminDeviceSecurityEnforced()) {
    return undefined;
  }
  const device = getAdminDeviceContext(req);
  const attemptedDevice = registerAdminDeviceAttempt({
    adminId: admin.id,
    deviceId: device.deviceId,
    deviceLabel: device.deviceLabel,
    userAgent: device.userAgent,
  });
  if (!isAdminDeviceTrusted(admin.id, device.deviceId)) {
    throw new AdminWorkMonitorError(
      403,
      "ADMIN_DEVICE_APPROVAL_REQUIRED",
      "administrator device approval is required",
      {
        device_id: attemptedDevice.device_id,
        trusted_device_limit: 2,
      },
    );
  }
  return createAdminTrackedSession({
    adminId: admin.id,
    deviceId: device.deviceId,
    deviceLabel: device.deviceLabel,
    userAgent: device.userAgent,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
}

function sendAdminWorkMonitorError(
  res: Response,
  error: unknown,
): Response | null {
  if (!(error instanceof AdminWorkMonitorError)) return null;
  return sendError(res, error.statusCode, error.message, {
    code: error.code,
    ...(error.details || {}),
  });
}

function requireOwnerPassword(
  owner: Merchant,
  req: Request,
  res: Response,
): boolean {
  const ownerPassword = String(req.body?.owner_password || "");
  if (!ownerPassword) {
    sendError(res, 400, "owner password is required", {
      code: "OWNER_PASSWORD_REQUIRED",
    });
    return false;
  }
  if (!verifyPassword(ownerPassword, owner.password)) {
    sendError(res, 401, "owner password is incorrect", {
      code: "OWNER_PASSWORD_INCORRECT",
    });
    return false;
  }
  return true;
}

function isOwnerAdmin(admin: Merchant): boolean {
''',
    "admin work monitor helpers",
)

# Replace login route completely.
regex_replace_once(
    auth,
    r'''router\.post\("/login", \(req: Request, res: Response\) => \{.*?\n\}\);\n\nrouter\.post\("/logout"''',
    r'''router.post("/login", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();

  if (!phone || !password) return sendError(res, 400, "اكتب رقم الهاتف وكلمة المرور");

  const db = ensureDb();
  const matchingAccount = db.merchants.find(
    (item) => normalizePhone(item.phone) === phone,
  );
  const merchant =
    matchingAccount && verifyPassword(password, matchingAccount.password)
      ? matchingAccount
      : undefined;

  if (!merchant) {
    if (matchingAccount?.is_admin === true) {
      const device = getAdminDeviceContext(req);
      recordAdminFailedLogin({
        adminId: matchingAccount.id,
        phone,
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel,
        reason: "invalid_credentials",
      });
    }
    return sendError(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
  }

  if (!merchant.is_admin && merchant.otp_verified === false) {
    return sendError(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
  }

  if (
    merchant.is_admin === true &&
    merchant.admin_role === "assistant_admin" &&
    merchant.admin_enabled === false
  ) {
    return sendError(
      res,
      403,
      "admin account is disabled",
      { code: "ADMIN_DISABLED" },
    );
  }

  // Migrate old plain-text passwords to hashed passwords after a successful login.
  if (!merchant.password.startsWith("sha256$")) {
    merchant.password = hashPassword(password);
    writeDb(db);
  }

  let trackedSession: AdminTrackedSession | undefined;
  try {
    trackedSession = createAssistantTrackedSession(merchant, req);
  } catch (error) {
    const response = sendAdminWorkMonitorError(res, error);
    if (response) return response;
    throw error;
  }

  if (merchant.is_admin) {
    clearMerchantSessionCookie(res);
  } else {
    setMerchantSessionCookie(res, merchant.id);
  }

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(merchant.is_admin
      ? { admin_token: createAdminSessionToken(merchant, trackedSession) }
      : {}),
  });
});

router.post("/logout"''',
    "secure assistant login flow",
)

# Enrich administrator cards with work status and session counts.
replace_once(
    auth,
    '''  return res.json({
    ok: true,
    admins: listAdmins(),
  });
''',
    '''  return res.json({
    ok: true,
    admins: listAdmins().map((admin) => ({
      ...admin,
      ...getAdminCardSecuritySummary(admin.id),
    })),
  });
''',
    "administrator card work status",
)

# Re-create a tracked session after the mandatory permanent password change.
replace_once(
    auth,
    '''    writeDb(db);

    return res.json({
      ok: true,
      admin: toAdminSummary(persistedAdmin),
      admin_token: createAdminSessionToken(persistedAdmin),
    });
''',
    '''    writeDb(db);

    let trackedSession: AdminTrackedSession | undefined;
    try {
      trackedSession = createAssistantTrackedSession(persistedAdmin, req);
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }

    return res.json({
      ok: true,
      admin: toAdminSummary(persistedAdmin),
      admin_token: createAdminSessionToken(persistedAdmin, trackedSession),
    });
''',
    "tracked session after permanent password change",
)

# Add heartbeat/logout and owner-only monitor endpoints before administrator creation.
monitor_routes = r'''

router.post("/admin/session/heartbeat", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res, {
    allowPasswordChangeRequired: true,
    recordActivity: false,
  });
  if (!admin) return;
  const payload = verifyAdminSessionToken(getBearerToken(req));
  if (payload?.sessionId) {
    touchAdminTrackedSession(payload.sessionId, req.body?.activity === true);
  }
  return res.json({ ok: true });
});

router.post("/admin/session/logout", (req: Request, res: Response) => {
  const payload = verifyAdminSessionToken(getBearerToken(req));
  if (payload?.sessionId) {
    try {
      revokeAdminTrackedSession({
        adminId: payload.adminId,
        sessionId: payload.sessionId,
        reason: "administrator_logout",
      });
    } catch (error) {
      if (!(error instanceof AdminWorkMonitorError) || error.code !== "ADMIN_SESSION_NOT_FOUND") {
        throw error;
      }
    }
  }
  return res.json({ ok: true });
});

router.get("/admins/:adminId/work-monitor", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const adminId = String(req.params.adminId || "").trim();
  const db = ensureDb();
  const assistant = db.merchants.find(
    (item) => item.id === adminId && isAssistantAdmin(item),
  );
  if (!assistant) {
    return sendError(res, 404, "assistant admin account not found", {
      code: "ADMIN_NOT_FOUND",
    });
  }
  const monitor = getAdminWorkMonitor(adminId);
  const recentLogs = db.admin_logs
    .filter((log) => log.admin_id === adminId)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, 50);
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    admin: toAdminSummary(assistant),
    ...monitor,
    recent_logs: recentLogs,
  });
});

router.post(
  "/admins/:adminId/devices/:deviceId/trust",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const deviceId = normalizeAdminDeviceId(req.params.deviceId);
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    try {
      const device = approveAdminTrustedDevice({
        adminId,
        deviceId,
        ownerId: owner.id,
      });
      appendAdminLog(
        db,
        owner,
        { id: assistant.id, store_name: assistant.owner_name },
        "assistant_device_trusted",
        "assistant administrator device was trusted",
        { meta: { device_id: device.device_id, device_label: device.device_label } },
      );
      writeDb(db);
      return res.json({ ok: true, device });
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }
  },
);

router.post(
  "/admins/:adminId/devices/:deviceId/revoke",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const deviceId = normalizeAdminDeviceId(req.params.deviceId);
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    try {
      const device = revokeAdminTrustedDevice({
        adminId,
        deviceId,
        ownerId: owner.id,
      });
      appendAdminLog(
        db,
        owner,
        { id: assistant.id, store_name: assistant.owner_name },
        "assistant_device_trust_revoked",
        "assistant administrator device trust was revoked",
        { meta: { device_id: device.device_id, device_label: device.device_label } },
      );
      writeDb(db);
      return res.json({ ok: true, device });
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }
  },
);

router.post(
  "/admins/:adminId/sessions/:sessionId/revoke",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const sessionId = String(req.params.sessionId || "").trim();
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    try {
      const session = revokeAdminTrackedSession({
        adminId,
        sessionId,
        reason: "owner_terminated_session",
      });
      appendAdminLog(
        db,
        owner,
        { id: assistant.id, store_name: assistant.owner_name },
        "assistant_session_revoked",
        "assistant administrator session was terminated",
        { meta: { session_id: session.id, device_label: session.device_label } },
      );
      writeDb(db);
      return res.json({ ok: true, session });
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }
  },
);

router.post(
  "/admins/:adminId/sessions/revoke-all",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    const revokedCount = revokeAllAdminTrackedSessions(
      adminId,
      "owner_terminated_all_sessions",
    );
    appendAdminLog(
      db,
      owner,
      { id: assistant.id, store_name: assistant.owner_name },
      "assistant_sessions_revoked",
      "all assistant administrator sessions were terminated",
      { meta: { revoked_count: revokedCount } },
    );
    writeDb(db);
    return res.json({ ok: true, revoked_count: revokedCount });
  },
);
'''
replace_once(
    auth,
    'router.post("/admins", (req: Request, res: Response) => {\n',
    monitor_routes + '\nrouter.post("/admins", (req: Request, res: Response) => {\n',
    "admin monitor routes",
)

# -----------------------------------------------------------------------------
# Integration test for trusted devices and two-session hard limit
# -----------------------------------------------------------------------------
test_file = Path(
    "artifacts/api-server/tests/admin-work-monitor.integration.test.mjs"
)
test_file.write_text(r'''import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

const devices = {
  computer: "device-computer-0000000000000001",
  phone: "device-phone-000000000000000002",
  third: "device-third-000000000000000003",
};

test("owner controls trusted devices and assistant is limited to two sessions", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-admin-monitor-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });
  const baseAdmin = {
    store_name: "Fawri Admin",
    activity_type: "admin",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-03T00:00:00.000Z",
    is_admin: true,
    admin_enabled: true,
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          ...baseAdmin,
          id: "owner-admin",
          owner_name: "Owner",
          phone: "07111111111",
          password: "OwnerPass1@",
          admin_role: "owner_admin",
        },
        {
          ...baseAdmin,
          id: "assistant-admin",
          owner_name: "Assistant",
          phone: "07222222222",
          password: "Assistant1@",
          admin_role: "assistant_admin",
          permissions: ["view_merchants", "view_logs"],
        },
      ],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      merchant_notifications: [],
      support_tickets: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      BOT_DEBUG: "false",
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_ADMIN_PHONE: "07111111111",
      FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await rm(runtimeDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child, () => output);

  async function login(phone, password, deviceId, deviceLabel) {
    return json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        password,
        ...(deviceId ? { device_id: deviceId, device_label: deviceLabel } : {}),
      }),
    }));
  }

  const ownerLogin = await login("07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  const ownerHeaders = {
    Authorization: `Bearer ${ownerLogin.body.admin_token}`,
    "Content-Type": "application/json",
  };

  const pendingComputer = await login(
    "07222222222",
    "Assistant1@",
    devices.computer,
    "Windows computer",
  );
  assert.equal(pendingComputer.response.status, 403);
  assert.equal(pendingComputer.body.code, "ADMIN_DEVICE_APPROVAL_REQUIRED");

  let monitor = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/work-monitor`,
    { headers: ownerHeaders },
  ));
  assert.equal(monitor.response.status, 200);
  assert.equal(monitor.body.summary.pending_device_count, 1);
  assert.equal(monitor.body.summary.open_session_count, 0);

  const trustComputer = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.computer}/trust`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(trustComputer.response.status, 200);

  const computerLogin = await login(
    "07222222222",
    "Assistant1@",
    devices.computer,
    "Windows computer",
  );
  assert.equal(computerLogin.response.status, 200);
  const computerHeaders = {
    Authorization: `Bearer ${computerLogin.body.admin_token}`,
    "x-fawri-device-id": devices.computer,
    "Content-Type": "application/json",
  };

  const pendingPhone = await login(
    "07222222222",
    "Assistant1@",
    devices.phone,
    "Android phone",
  );
  assert.equal(pendingPhone.response.status, 403);
  const trustPhone = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.phone}/trust`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(trustPhone.response.status, 200);
  const phoneLogin = await login(
    "07222222222",
    "Assistant1@",
    devices.phone,
    "Android phone",
  );
  assert.equal(phoneLogin.response.status, 200);
  const phoneHeaders = {
    Authorization: `Bearer ${phoneLogin.body.admin_token}`,
    "x-fawri-device-id": devices.phone,
    "Content-Type": "application/json",
  };

  const pendingThird = await login(
    "07222222222",
    "Assistant1@",
    devices.third,
    "Third device",
  );
  assert.equal(pendingThird.response.status, 403);
  const trustThird = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.third}/trust`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(trustThird.response.status, 409);
  assert.equal(trustThird.body.code, "ADMIN_TRUSTED_DEVICE_LIMIT_REACHED");

  const heartbeat = await json(await fetch(
    `${baseUrl}/api/auth/admin/session/heartbeat`,
    {
      method: "POST",
      headers: computerHeaders,
      body: JSON.stringify({ activity: true }),
    },
  ));
  assert.equal(heartbeat.response.status, 200);

  const admins = await json(await fetch(`${baseUrl}/api/auth/admins`, {
    headers: ownerHeaders,
  }));
  const assistantCard = admins.body.admins.find(
    (admin) => admin.id === "assistant-admin",
  );
  assert.equal(assistantCard.open_session_count, 2);
  assert.equal(assistantCard.work_status, "active");

  monitor = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/work-monitor`,
    { headers: ownerHeaders },
  ));
  assert.equal(monitor.body.sessions.length, 2);
  assert.equal(monitor.body.summary.trusted_device_count, 2);

  const computerSession = monitor.body.sessions.find(
    (session) => session.device_id === devices.computer,
  );
  assert.ok(computerSession);
  const revokeComputerSession = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/sessions/${computerSession.id}/revoke`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(revokeComputerSession.response.status, 200);

  const revokedComputer = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: computerHeaders },
  ));
  assert.equal(revokedComputer.response.status, 401);
  assert.equal(revokedComputer.body.code, "ADMIN_TRACKED_SESSION_REVOKED");

  const activePhone = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: phoneHeaders },
  ));
  assert.equal(activePhone.response.status, 200);

  const revokePhoneTrust = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.phone}/revoke`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(revokePhoneTrust.response.status, 200);

  const revokedPhone = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: phoneHeaders },
  ));
  assert.equal(revokedPhone.response.status, 401);
  assert.equal(revokedPhone.body.code, "ADMIN_TRACKED_SESSION_REVOKED");

  const logs = await json(await fetch(`${baseUrl}/api/auth/admin/logs`, {
    headers: ownerHeaders,
  }));
  assert.equal(logs.response.status, 200);
  const serializedLogs = JSON.stringify(logs.body.logs);
  assert.equal(serializedLogs.includes("OwnerPass1@"), false);
  assert.equal(serializedLogs.includes("Assistant1@"), false);
  assert.ok(logs.body.logs.some(
    (log) => log.action_type === "assistant_device_trusted",
  ));
  assert.ok(logs.body.logs.some(
    (log) => log.action_type === "assistant_session_revoked",
  ));
  assert.ok(logs.body.logs.some(
    (log) => log.action_type === "assistant_device_trust_revoked",
  ));
});
''')

package_path = Path("artifacts/api-server/package.json")
package_data = json.loads(package_path.read_text())
package_data["scripts"]["test:admin-work-monitor"] = (
    "node ./build.mjs && node --test ./tests/admin-work-monitor.integration.test.mjs"
)
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n")

print("Admin work monitor security backend applied.")
