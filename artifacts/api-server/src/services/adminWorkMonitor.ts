import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

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

const SECURITY_PATH = getFawriDataFilePath("admin-work-monitor.json");

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
        .map((item): AdminTrustedDevice => ({
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
