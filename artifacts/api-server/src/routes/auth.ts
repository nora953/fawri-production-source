import fs from "node:fs";
import path from "node:path";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import crypto from "node:crypto";
import {
  calculateRetentionStatus,
  deleteMerchant,
  MerchantDeleteReason,
  MerchantRetentionStatus,
} from "../services/merchantLifecycle";
import { registerMerchantAuthDeletion } from "../services/merchantAuthData";
import {
  registerMerchantRetentionUpdate,
  startMerchantRetentionScheduler,
} from "../services/merchantRetentionScheduler";
import {
  AdminManagementError,
  createAssistantAdmin,
  listAdmins,
  setAssistantAdminEnabled,
  updateAssistantAdminPermissions,
  registerAdminManagement,
  type AdminSummary,
} from "../services/adminManagement";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/passwordService";

type MerchantStatus = "pending_activation" | "approved" | "rejected" | "suspended";
type AdminRole = "owner_admin" | "assistant_admin";
type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";
type Lang = "ar" | "ku" | "en";

const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "view_merchants",
  "manage_merchant_status",
  "manage_subscriptions",
  "manage_channels",
  "view_logs",
  "inspect_merchant_sessions",
  "manage_support",
];
type ThemeMode = "light" | "dark" | "auto";
type ChannelPlatform = "instagram" | "messenger" | "telegram";
type ChannelStatus = "connected" | "disconnected" | "pending";
type DeletionRequestStatus = "pending" | "rejected" | "completed";

type AdminLogRecord = {
  id: string;
  admin_phone: string;
  action_type: string;
  merchant_id: string;
  merchant_name: string;
  details: string;
  meta?: Record<string, string | number>;
  reason?: string;
  created_at: string;
};

type MerchantDeletionRequest = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  requested_by_admin_id: string;
  requested_by_admin_name: string;
  requested_by_admin_phone: string;
  reason: MerchantDeleteReason;
  details: string;
  status: DeletionRequestStatus;
  created_at: string;
  reviewed_by_admin_id?: string;
  reviewed_at?: string;
};

type Merchant = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  password: string;
  activity_type: string;
  instagram_link?: string;
  messenger_link?: string;
  telegram_link?: string;
  status: MerchantStatus;
  language: Lang;
  theme_preference: ThemeMode;
  created_at: string;
  is_admin?: boolean;
  admin_role?: AdminRole;
  permissions?: AdminPermission[];
  admin_enabled?: boolean;
  otp_verified?: boolean;
  subscription_started_at?: string;
  subscription_expires_at?: string;
  last_subscription_ended_at?: string;
  warning_stage?: 0 | 1 | 2 | 3 | 4;
  retention_status?: MerchantRetentionStatus;
  eligible_for_deletion_at?: string;
  grace_period_ends_at?: string;
};

type SafeMerchant = Omit<Merchant, "password">;

type OtpRecord = {
  phone: string;
  code: string;
  purpose: "signup" | "password_reset";
  expires_at: string;
  used: boolean;
  created_at: string;
};

type AuthDb = {
  merchants: Merchant[];
  otps: OtpRecord[];
  admin_logs: AdminLogRecord[];
  deletion_requests: MerchantDeletionRequest[];
  channel_overrides: Record<string, Partial<Record<ChannelPlatform, ChannelStatus>>>;
  admin_notes: Record<string, string>;
};

const router = Router();

const OTP_EXPIRE_MINUTES = Number(process.env.AUTH_OTP_EXPIRE_MINUTES || 10);
const OTP_RESEND_COOLDOWN_SECONDS = Number(
  process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60,
);

const PASSWORD_SALT = process.env.FAWRI_PASSWORD_SALT || "fawri-local-dev-salt";
const ADMIN_SESSION_SECRET =
  process.env.FAWRI_ADMIN_SESSION_SECRET || PASSWORD_SALT;
const ADMIN_SESSION_TTL_MS = Number(
  process.env.FAWRI_ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000,
);
const CONFIGURED_MERCHANT_SESSION_SECRET =
  process.env.FAWRI_MERCHANT_SESSION_SECRET ||
  process.env.FAWRI_ADMIN_SESSION_SECRET ||
  process.env.FAWRI_PASSWORD_SALT;

if (
  process.env.NODE_ENV === "production" &&
  !CONFIGURED_MERCHANT_SESSION_SECRET
) {
  throw new Error(
    "FAWRI_MERCHANT_SESSION_SECRET or an approved fallback secret is required",
  );
}

const MERCHANT_SESSION_SECRET =
  CONFIGURED_MERCHANT_SESSION_SECRET || "fawri-local-dev-salt";
const MERCHANT_SESSION_TTL_MS = Number(
  process.env.FAWRI_MERCHANT_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000,
);
const MERCHANT_OAUTH_STATE_TTL_MS = Number(
  process.env.FAWRI_MERCHANT_OAUTH_STATE_TTL_MS || 10 * 60 * 1000,
);
const MERCHANT_SESSION_COOKIE = "fawri_merchant_session";

type AdminSessionPayload = {
  adminId: string;
  expiresAt: number;
};

type MerchantSessionPayload = {
  kind: "merchant_session";
  merchantId: string;
  expiresAt: number;
};

type MerchantOAuthStatePayload = {
  kind: "meta_oauth";
  merchantId: string;
  platform: "messenger" | "instagram";
  expiresAt: number;
};

function isAdminRole(value: unknown): value is AdminRole {
  return value === "owner_admin" || value === "assistant_admin";
}

function isAdminPermission(value: unknown): value is AdminPermission {
  return (
    typeof value === "string" &&
    ALL_ADMIN_PERMISSIONS.includes(value as AdminPermission)
  );
}

const LEGACY_ADMIN_PERMISSION_MAP: Readonly<Record<string, readonly AdminPermission[]>> = {
  manage_merchants: ["view_merchants", "manage_merchant_status"],
  inspection_sessions: ["inspect_merchant_sessions"],
  manage_subscriptions: ["manage_subscriptions"],
  manage_channels: ["manage_channels"],
  view_logs: ["view_logs"],
};

function normalizeAssistantPermissions(
  value: unknown,
): AdminPermission[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Set<AdminPermission>();

  for (const permission of value) {
    if (typeof permission !== "string" || permission === "manage_admins") {
      continue;
    }

    if (isAdminPermission(permission)) {
      normalized.add(permission);
      continue;
    }

    for (const migratedPermission of LEGACY_ADMIN_PERMISSION_MAP[permission] || []) {
      normalized.add(migratedPermission);
    }
  }

  return ALL_ADMIN_PERMISSIONS.filter((permission) => normalized.has(permission));
}

function resolveOwnerAdminId(merchants: Merchant[]): string | null {
  const admins = merchants.filter((merchant) => merchant.is_admin === true);
  if (admins.length === 0) return null;

  const configuredOwnerPhone = normalizePhone(
    process.env.FAWRI_ADMIN_PHONE || "",
  );

  if (configuredOwnerPhone) {
    const configuredOwner = admins.find(
      (admin) => normalizePhone(admin.phone) === configuredOwnerPhone,
    );

    if (!configuredOwner) {
      throw new Error(
        "FAWRI_ADMIN_PHONE does not match an existing administrator account",
      );
    }

    return configuredOwner.id;
  }

  const explicitOwners = admins.filter(
    (admin) => admin.admin_role === "owner_admin",
  );

  if (explicitOwners.length > 1) {
    throw new Error("multiple owner administrators are configured");
  }

  return explicitOwners[0]?.id || null;
}

function normalizeAdminRoles(merchants: Merchant[]): Merchant[] {
  const ownerAdminId = resolveOwnerAdminId(merchants);

  return merchants.map((merchant) => {
    if (merchant.is_admin !== true) {
      const {
        admin_role: _adminRole,
        permissions: _permissions,
        admin_enabled: _adminEnabled,
        ...regularMerchant
      } = merchant;

      void _adminRole;
      void _permissions;
      void _adminEnabled;

      return regularMerchant;
    }

    if (merchant.id === ownerAdminId) {
      return {
        ...merchant,
        admin_role: "owner_admin",
        permissions: undefined,
        admin_enabled: true,
      };
    }

    return {
      ...merchant,
      admin_role: "assistant_admin",
      permissions: normalizeAssistantPermissions(merchant.permissions),
      admin_enabled: merchant.admin_enabled !== false,
    };
  });
}

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function signMerchantPayload(
  purpose: "session" | "meta_oauth",
  encodedPayload: string,
): string {
  return crypto
    .createHmac("sha256", MERCHANT_SESSION_SECRET)
    .update(`${purpose}.${encodedPayload}`)
    .digest("base64url");
}

function createSignedMerchantPayload(
  purpose: "session" | "meta_oauth",
  payload: MerchantSessionPayload | MerchantOAuthStatePayload,
): string {
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
  const signature = signMerchantPayload(purpose, encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifySignedMerchantPayload(
  purpose: "session" | "meta_oauth",
  token: string,
): Record<string, unknown> | null {
  const [encodedPayload, suppliedSignature, extraPart] = token.split(".");

  if (!encodedPayload || !suppliedSignature || extraPart) {
    return null;
  }

  const expectedSignature = signMerchantPayload(purpose, encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    return payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function createMerchantSessionToken(merchantId: string): string {
  return createSignedMerchantPayload("session", {
    kind: "merchant_session",
    merchantId,
    expiresAt: Date.now() + MERCHANT_SESSION_TTL_MS,
  });
}

function verifyMerchantSessionToken(
  token: string,
): MerchantSessionPayload | null {
  const payload = verifySignedMerchantPayload("session", token);

  if (
    payload?.kind !== "merchant_session" ||
    typeof payload.merchantId !== "string" ||
    !payload.merchantId ||
    typeof payload.expiresAt !== "number" ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  return {
    kind: "merchant_session",
    merchantId: payload.merchantId,
    expiresAt: payload.expiresAt,
  };
}

function setMerchantSessionCookie(
  res: Response,
  merchantId: string,
): void {
  res.cookie(
    MERCHANT_SESSION_COOKIE,
    createMerchantSessionToken(merchantId),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api",
      maxAge: MERCHANT_SESSION_TTL_MS,
    },
  );
}

function clearMerchantSessionCookie(res: Response): void {
  res.clearCookie(MERCHANT_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
  });
}

export function createMerchantOAuthState(
  merchantId: string,
  platform: MerchantOAuthStatePayload["platform"],
): string {
  return createSignedMerchantPayload("meta_oauth", {
    kind: "meta_oauth",
    merchantId,
    platform,
    expiresAt: Date.now() + MERCHANT_OAUTH_STATE_TTL_MS,
  });
}

export function verifyMerchantOAuthState(
  token: string,
): MerchantOAuthStatePayload | null {
  const payload = verifySignedMerchantPayload("meta_oauth", token);

  if (
    payload?.kind !== "meta_oauth" ||
    typeof payload.merchantId !== "string" ||
    !payload.merchantId ||
    (payload.platform !== "messenger" &&
      payload.platform !== "instagram") ||
    typeof payload.expiresAt !== "number" ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  return {
    kind: "meta_oauth",
    merchantId: payload.merchantId,
    platform: payload.platform,
    expiresAt: payload.expiresAt,
  };
}

export function getMerchantIdFromSession(res: Response): string {
  return typeof res.locals.merchantId === "string"
    ? res.locals.merchantId
    : "";
}

export function merchantSessionAccountExists(merchantId: string): boolean {
  const merchant = findRegularMerchant(ensureDb(), merchantId);

  return merchant !== undefined && merchant.otp_verified !== false;
}

export function requireMerchantSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = String(
    req.cookies?.[MERCHANT_SESSION_COOKIE] || "",
  ).trim();
  const payload = token ? verifyMerchantSessionToken(token) : null;

  if (!payload || !merchantSessionAccountExists(payload.merchantId)) {
    sendError(res, 401, "merchant session is missing or expired", {
      code: "MERCHANT_SESSION_REQUIRED",
    });
    return;
  }

  res.locals.merchantId = payload.merchantId;
  res.setHeader("Cache-Control", "no-store");
  next();
}

function signAdminSessionPayload(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createAdminSessionToken(adminId: string): string {
  const payload: AdminSessionPayload = {
    adminId,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  const signature = signAdminSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyAdminSessionToken(
  token: string,
): AdminSessionPayload | null {
  const [encodedPayload, suppliedSignature, extraPart] = token.split(".");

  if (!encodedPayload || !suppliedSignature || extraPart) {
    return null;
  }

  const expectedSignature =
    signAdminSessionPayload(encodedPayload);

  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;

    if (
      typeof payload.adminId !== "string" ||
      !payload.adminId ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      adminId: payload.adminId,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

function getBearerToken(req: Request): string {
  const authorization = String(req.headers.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function requireAdminSession(
  req: Request,
  res: Response,
): Merchant | null {
  const token = getBearerToken(req);
  const payload = token
    ? verifyAdminSessionToken(token)
    : null;

  if (!payload) {
    sendError(res, 401, "admin session is missing or expired");
    return null;
  }

  const db = ensureDb();
  const admin = db.merchants.find(
    (item) =>
      item.id === payload.adminId &&
      item.is_admin === true &&
      isAdminRole(item.admin_role) &&
      item.status === "approved" &&
      item.admin_enabled !== false,
  );

  if (!admin) {
    sendError(res, 401, "admin session is invalid");
    return null;
  }

  return admin;
}


function isOwnerAdmin(admin: Merchant): boolean {
  return admin.is_admin === true && admin.admin_role === "owner_admin";
}

function isAssistantAdmin(admin: Merchant): boolean {
  return admin.is_admin === true && admin.admin_role === "assistant_admin";
}

function requireOwner(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminSession(req, res);

  if (!admin) {
    return null;
  }

  if (!isOwnerAdmin(admin)) {
    sendError(res, 403, "owner admin permission is required");
    return null;
  }

  return admin;
}

function adminHasPermission(
  admin: Merchant,
  permission: AdminPermission,
): boolean {
  if (isOwnerAdmin(admin)) return true;

  return normalizeAssistantPermissions(admin.permissions).includes(permission);
}

function requireAdminPermission(
  req: Request,
  res: Response,
  permission: AdminPermission,
): Merchant | null {
  const admin = requireAdminSession(req, res);

  if (!admin) return null;

  if (!adminHasPermission(admin, permission)) {
    sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permission,
    });
    return null;
  }

  return admin;
}

function requireAnyAdminPermission(
  req: Request,
  res: Response,
  permissions: readonly AdminPermission[],
): Merchant | null {
  const admin = requireAdminSession(req, res);

  if (!admin) return null;

  if (!permissions.some((permission) => adminHasPermission(admin, permission))) {
    sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permissions,
    });
    return null;
  }

  return admin;
}


function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const DB_PATH = getDataFilePath("merchants.json");

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeOptionalUrl(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLanguage(value: unknown): Lang {
  const lang = String(value || "ar");
  if (lang === "ar" || lang === "ku" || lang === "en") return lang;
  return "ar";
}

function publicMerchant(merchant: Merchant): SafeMerchant {
  const { password, ...safeMerchant } = merchant;
  void password;
  return safeMerchant;
}

function includeDevCode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_INCLUDE_DEV_CODE === "true";
}


function otpDeliveryChannel(): string {
  return String(process.env.OTP_DELIVERY_CHANNEL || "").trim().toLowerCase();
}

function normalizeWhatsappRecipient(phone: string): string {
  const configuredTestNumber = String(process.env.WHATSAPP_TEST_TO || "").replace(/\D/g, "");
  if (configuredTestNumber) return configuredTestNumber;

  return String(phone || "").replace(/\D/g, "");
}

function buildOtpMessage(code: string, purpose: OtpRecord["purpose"]): string {
  if (purpose === "password_reset") {
    return `Fawri verification code: ${code}\nUse this code to reset your password. It expires in ${OTP_EXPIRE_MINUTES} minutes.`;
  }

  return `Fawri verification code: ${code}\nUse this code to verify your account. It expires in ${OTP_EXPIRE_MINUTES} minutes.`;
}

async function sendOtpViaWhatsApp(
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const to = normalizeWhatsappRecipient(phone);

  if (!token || !phoneNumberId || !to) {
    return {
      ok: false,
      error: "إعدادات واتساب غير مكتملة لإرسال رمز التحقق",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: buildOtpMessage(code, purpose),
          },
        }),
      },
    );

    const result = await response.json().catch(() => null) as {
      error?: {
        message?: string;
        type?: string;
        code?: number | string;
      };
    } | null;

    if (!response.ok) {
      const message =
        result?.error?.message ||
        "تعذر إرسال رمز التحقق عبر واتساب";

      console.error("WhatsApp OTP send failed:", {
        status: response.status,
        message,
        type: result?.error?.type,
        code: result?.error?.code,
      });

      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (error) {
    console.error("WhatsApp OTP send error:", error);
    return {
      ok: false,
      error: "تعذر الاتصال بخدمة واتساب لإرسال رمز التحقق",
    };
  }
}

async function deliverOtp(
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (otpDeliveryChannel() === "whatsapp") {
    return sendOtpViaWhatsApp(phone, code, purpose);
  }

  return { ok: true };
}

function removeExpiredOtps(otps: OtpRecord[]): OtpRecord[] {
  const timestamp = Date.now();
  return otps.filter((otp) => !otp.used && new Date(otp.expires_at).getTime() >= timestamp);
}

function buildInitialDb(): AuthDb {
  return {
    merchants: [],
    otps: [],
    admin_logs: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  };
}

function ensureDb(): AuthDb {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    const initial = buildInitialDb();
    writeDb(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthDb>;

    return {
      merchants: Array.isArray(parsed.merchants)
        ? normalizeAdminRoles(parsed.merchants.map((merchant) => ({
            ...merchant,
            warning_stage:
              merchant.warning_stage === 1 ||
              merchant.warning_stage === 2 ||
              merchant.warning_stage === 3 ||
              merchant.warning_stage === 4
                ? merchant.warning_stage
                : 0,
            retention_status:
              merchant.retention_status &&
              Object.values(MerchantRetentionStatus).includes(
                merchant.retention_status,
              )
                ? merchant.retention_status
                : MerchantRetentionStatus.Protected,
          })))
        : [],
      otps: Array.isArray(parsed.otps) ? removeExpiredOtps(parsed.otps) : [],
      admin_logs: Array.isArray(parsed.admin_logs) ? parsed.admin_logs : [],
      deletion_requests: Array.isArray(parsed.deletion_requests)
        ? parsed.deletion_requests
        : [],
      channel_overrides:
        parsed.channel_overrides &&
        typeof parsed.channel_overrides === "object" &&
        !Array.isArray(parsed.channel_overrides)
          ? parsed.channel_overrides
          : {},
      admin_notes:
        parsed.admin_notes &&
        typeof parsed.admin_notes === "object" &&
        !Array.isArray(parsed.admin_notes)
          ? parsed.admin_notes
          : {},
    };
  } catch (error) {
    console.error("Failed to read auth database:", error);
    return buildInitialDb();
  }
}

function writeDb(db: AuthDb): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function findRegularMerchant(db: AuthDb, merchantId: string): Merchant | undefined {
  return db.merchants.find(
    (merchant) => merchant.id === merchantId && merchant.is_admin !== true,
  );
}

function appendAdminLog(
  db: AuthDb,
  admin: Merchant,
  merchant: Pick<Merchant, "id" | "store_name">,
  actionType: string,
  details: string,
  options: {
    meta?: Record<string, string | number>;
    reason?: string;
  } = {},
): AdminLogRecord {
  const log: AdminLogRecord = {
    id: makeId("admin-log"),
    admin_phone: admin.phone,
    action_type: actionType,
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    details,
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
    created_at: now(),
  };

  db.admin_logs.unshift(log);
  return log;
}

function isChannelPlatform(value: unknown): value is ChannelPlatform {
  return value === "instagram" || value === "messenger" || value === "telegram";
}

function isChannelStatus(value: unknown): value is ChannelStatus {
  return value === "connected" || value === "disconnected" || value === "pending";
}

function isMerchantDeleteReason(value: unknown): value is MerchantDeleteReason {
  return (
    value === MerchantDeleteReason.PolicyViolation ||
    value === MerchantDeleteReason.RetentionExpired
  );
}


function toAdminSummary(admin: Merchant): AdminSummary {
  if (
    admin.is_admin !== true ||
    !admin.admin_role ||
    !isAdminRole(admin.admin_role)
  ) {
    throw new Error("invalid admin account");
  }

  return {
    id: admin.id,
    owner_name: admin.owner_name,
    store_name: admin.store_name,
    phone: admin.phone,
    status: admin.status,
    language: admin.language,
    theme_preference: admin.theme_preference,
    created_at: admin.created_at,
    is_admin: true,
    admin_role: admin.admin_role,
    permissions:
      admin.admin_role === "owner_admin"
        ? [...ALL_ADMIN_PERMISSIONS]
        : normalizeAssistantPermissions(admin.permissions),
    admin_enabled: admin.admin_enabled !== false,
    otp_verified: admin.otp_verified === true,
  };
}

registerAdminManagement({
  listAdmins: () => {
    const db = ensureDb();

    return db.merchants
      .filter(
        (merchant) =>
          merchant.is_admin === true &&
          merchant.admin_role !== undefined &&
          isAdminRole(merchant.admin_role),
      )
      .map(toAdminSummary)
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      );
  },

  createAssistantAdmin: (input) => {
    const ownerName = input.ownerName.trim();
    const phone = normalizePhone(input.phone);
    const password = input.password;
    const language =
      input.language === "en" || input.language === "ku"
        ? input.language
        : "ar";

    if (!ownerName) {
      throw new AdminManagementError(
        400,
        "OWNER_NAME_REQUIRED",
        "owner_name is required",
      );
    }

    if (!/^07\d{9}$/.test(phone)) {
      throw new AdminManagementError(
        400,
        "INVALID_PHONE",
        "phone must start with 07 and contain 11 digits",
      );
    }

    const passwordError = getPasswordValidationError(password);

    if (passwordError) {
      throw new AdminManagementError(
        400,
        passwordError.code,
        passwordError.message,
      );
    }

    const db = ensureDb();

    const duplicatePhone = db.merchants.some(
      (merchant) => normalizePhone(merchant.phone) === phone,
    );

    if (duplicatePhone) {
      throw new AdminManagementError(
        409,
        "PHONE_ALREADY_EXISTS",
        "phone already exists",
      );
    }

    const assistant: Merchant = {
      id: `admin-${crypto.randomUUID()}`,
      owner_name: ownerName,
      store_name: "Fawri Admin",
      phone,
      password: hashPassword(password),
      activity_type: "admin",
      status: "approved",
      language,
      theme_preference: "auto",
      created_at: now(),
      is_admin: true,
      admin_role: "assistant_admin",
      permissions: [],
      admin_enabled: true,
      otp_verified: true,
      warning_stage: 0,
      retention_status: MerchantRetentionStatus.Protected,
    };

    db.merchants.push(assistant);
    writeDb(db);

    return toAdminSummary(assistant);
  },

  setAssistantAdminEnabled: (adminId, enabled) => {
    const db = ensureDb();
    const admin = db.merchants.find(
      (merchant) => merchant.id === adminId && merchant.is_admin === true,
    );

    if (!admin) {
      throw new AdminManagementError(
        404,
        "ADMIN_NOT_FOUND",
        "admin account not found",
      );
    }

    if (!isAssistantAdmin(admin)) {
      throw new AdminManagementError(
        400,
        "OWNER_ADMIN_CANNOT_BE_CHANGED",
        "owner admin cannot be enabled or disabled",
      );
    }

    admin.admin_enabled = enabled;
    writeDb(db);

    return toAdminSummary(admin);
  },

  updateAssistantAdminPermissions: (adminId, permissions) => {
    const db = ensureDb();
    const admin = db.merchants.find(
      (merchant) =>
        merchant.id === adminId &&
        merchant.is_admin === true,
    );

    if (!admin) {
      throw new AdminManagementError(
        404,
        "ADMIN_NOT_FOUND",
        "admin account not found",
      );
    }

    if (!isAssistantAdmin(admin)) {
      throw new AdminManagementError(
        400,
        "OWNER_ADMIN_PERMISSIONS_CANNOT_BE_CHANGED",
        "owner admin permissions cannot be changed",
      );
    }

    admin.permissions = normalizeAssistantPermissions(permissions);
    writeDb(db);

    return toAdminSummary(admin);
  },
});

registerMerchantAuthDeletion((merchantId) => {
  const db = ensureDb();
  const merchant = db.merchants.find((item) => item.id === merchantId);

  if (!merchant) {
    throw new Error("merchant not found");
  }

  if (merchant.is_admin === true) {
    throw new Error("admin account cannot be deleted");
  }

  const phone = normalizePhone(merchant.phone);
  const beforeOtpCount = db.otps.length;

  db.merchants = db.merchants.filter(
    (item) => item.id !== merchantId,
  );

  db.otps = db.otps.filter(
    (otp) => normalizePhone(otp.phone) !== phone,
  );

  writeDb(db);

  return {
    merchant: 1,
    otps: beforeOtpCount - db.otps.length,
    phone: merchant.phone,
  };
});


registerMerchantRetentionUpdate(() => {
  const db = ensureDb();
  let updated = 0;

  for (const merchant of db.merchants) {
    if (merchant.is_admin === true) continue;

    const retention = calculateRetentionStatus(
      merchant.subscription_expires_at,
    );

    const nextEligibleAt = retention.eligibleForDeletionAt;
    const nextGraceEnd = retention.gracePeriodEndsAt;

    const changed =
      merchant.warning_stage !== retention.warningStage ||
      merchant.retention_status !== retention.retentionStatus ||
      merchant.eligible_for_deletion_at !== nextEligibleAt ||
      merchant.grace_period_ends_at !== nextGraceEnd;

    if (!changed) continue;

    merchant.warning_stage = retention.warningStage;
    merchant.retention_status = retention.retentionStatus;
    merchant.eligible_for_deletion_at = nextEligibleAt;
    merchant.grace_period_ends_at = nextGraceEnd;
    updated += 1;
  }

  if (updated > 0) {
    writeDb(db);
  }

  return {
    checked: db.merchants.filter(
      (merchant) => merchant.is_admin !== true,
    ).length,
    updated,
  };
});

startMerchantRetentionScheduler();


function issueOtp(db: AuthDb, phone: string, purpose: OtpRecord["purpose"]): OtpRecord {
  const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000).toISOString();

  const cleanOtps = removeExpiredOtps(db.otps).filter(
    (otp) => !(otp.phone === phone && otp.purpose === purpose),
  );

  const record: OtpRecord = {
    phone,
    code: generateOtpCode(),
    purpose,
    expires_at: expiresAt,
    used: false,
    created_at: now(),
  };

  db.otps = [record, ...cleanOtps];
  return record;
}

function findValidOtp(
  db: AuthDb,
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): OtpRecord | undefined {
  return db.otps.find(
    (otp) =>
      otp.phone === phone &&
      otp.code === code &&
      otp.purpose === purpose &&
      !otp.used &&
      new Date(otp.expires_at).getTime() >= Date.now(),
  );
}

function getOtpRetryAfterSeconds(
  db: AuthDb,
  phone: string,
  purpose: OtpRecord["purpose"],
): number {
  const latestOtp = db.otps
    .filter((otp) => otp.phone === phone && otp.purpose === purpose)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )[0];

  if (!latestOtp) return 0;

  const createdAt = new Date(latestOtp.created_at).getTime();
  if (!Number.isFinite(createdAt)) return 0;

  const remainingSeconds = Math.ceil(
    (createdAt + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000,
  );

  return Math.min(
    OTP_RESEND_COOLDOWN_SECONDS,
    Math.max(0, remainingSeconds),
  );
}

function sendError(
  res: Response,
  statusCode: number,
  error: string,
  details: Record<string, unknown> = {},
) {
  return res.status(statusCode).json({ ok: false, error, ...details });
}

function sendOtpCooldownError(res: Response, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));

  return sendError(
    res,
    429,
    "انتظر قبل طلب رمز تحقق جديد",
    { retry_after_seconds: retryAfterSeconds },
  );
}

router.post("/signup", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();
  const ownerName = String(req.body?.owner_name || "").trim();
  const storeName = String(req.body?.store_name || "").trim();
  const activityType = String(req.body?.activity_type || "").trim();
  const language = normalizeLanguage(req.body?.language);

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");
  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    return sendError(res, 400, passwordError.message);
  }
  if (!ownerName) return sendError(res, 400, "اكتب اسم صاحب المتجر");
  if (!storeName) return sendError(res, 400, "اكتب اسم المتجر");
  if (!activityType) return sendError(res, 400, "اختر نوع النشاط");

  const db = ensureDb();
  const existing = db.merchants.find((merchant) => normalizePhone(merchant.phone) === phone);

  if (existing) {
    if (!existing.is_admin && existing.otp_verified === false) {
      const retryAfterSeconds = getOtpRetryAfterSeconds(
        db,
        phone,
        "signup",
      );

      if (retryAfterSeconds > 0) {
        return sendOtpCooldownError(res, retryAfterSeconds);
      }

      existing.owner_name = ownerName;
      existing.store_name = storeName;
      existing.password = hashPassword(password);
      existing.activity_type = activityType;
      existing.instagram_link = normalizeOptionalUrl(req.body?.instagram_link);
      existing.messenger_link = normalizeOptionalUrl(req.body?.messenger_link);
      existing.telegram_link = normalizeOptionalUrl(req.body?.telegram_link);
      existing.language = language;
      existing.status = "pending_activation";

      const otp = issueOtp(db, phone, "signup");
      const delivery = await deliverOtp(phone, otp.code, "signup");

      if (!delivery.ok) {
        return sendError(res, 502, delivery.error);
      }

      writeDb(db);

      return res.status(200).json({
        ok: true,
        merchant: publicMerchant(existing),
        ...(includeDevCode() ? { devCode: otp.code } : {}),
        message: "تم إرسال رمز تحقق جديد",
        retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
    }

    return sendError(res, 409, "رقم الهاتف مسجل مسبقاً");
  }

  const merchant: Merchant = {
    id: makeId("merchant"),
    owner_name: ownerName,
    store_name: storeName,
    phone,
    password: hashPassword(password),
    activity_type: activityType,
    instagram_link: normalizeOptionalUrl(req.body?.instagram_link),
    messenger_link: normalizeOptionalUrl(req.body?.messenger_link),
    telegram_link: normalizeOptionalUrl(req.body?.telegram_link),
    status: "pending_activation",
    language,
    theme_preference: "auto",
    created_at: now(),
    otp_verified: false,
    warning_stage: 0,
    retention_status: MerchantRetentionStatus.Protected,
  };

  db.merchants.push(merchant);
  const otp = issueOtp(db, phone, "signup");
  const delivery = await deliverOtp(phone, otp.code, "signup");

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.status(201).json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(includeDevCode() ? { devCode: otp.code } : {}),
    message: "تم إنشاء الحساب وإرسال رمز التحقق",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
  });
});

router.post("/otp/resend", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const purpose = String(req.body?.purpose || "").trim();

  if (!phone) return sendError(res, 400, "رقم الهاتف مطلوب");

  if (purpose !== "signup" && purpose !== "password_reset") {
    return sendError(res, 400, "غرض رمز التحقق غير صالح");
  }

  const otpPurpose = purpose as OtpRecord["purpose"];
  const db = ensureDb();
  const merchant = db.merchants.find(
    (item) => normalizePhone(item.phone) === phone && !item.is_admin,
  );

  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  if (otpPurpose === "signup" && merchant.otp_verified === true) {
    return sendError(res, 409, "تم التحقق من رقم الهاتف مسبقاً");
  }

  const retryAfterSeconds = getOtpRetryAfterSeconds(
    db,
    phone,
    otpPurpose,
  );

  if (retryAfterSeconds > 0) {
    return sendOtpCooldownError(res, retryAfterSeconds);
  }

  const otp = issueOtp(db, phone, otpPurpose);
  const delivery = await deliverOtp(phone, otp.code, otpPurpose);

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.json({
    ok: true,
    message: "تم إرسال رمز تحقق جديد",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...(includeDevCode() ? { devCode: otp.code } : {}),
  });
});

router.post("/verify-otp", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();

  if (!phone) return sendError(res, 400, "رقم الهاتف مطلوب");
  if (!code) return sendError(res, 400, "رمز التحقق مطلوب");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  const otp = findValidOtp(db, phone, code, "signup");
  if (!otp) return sendError(res, 400, "رمز التحقق غير صحيح أو منتهي الصلاحية");

  otp.used = true;
  merchant.otp_verified = true;
  writeDb(db);
  setMerchantSessionCookie(res, merchant.id);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.post("/login", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();

  if (!phone || !password) return sendError(res, 400, "اكتب رقم الهاتف وكلمة المرور");

  const db = ensureDb();
  const merchant = db.merchants.find(
    (item) =>
      normalizePhone(item.phone) === phone &&
      verifyPassword(password, item.password),
  );

  if (!merchant) {
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

  if (merchant.is_admin) {
    clearMerchantSessionCookie(res);
  } else {
    setMerchantSessionCookie(res, merchant.id);
  }

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(merchant.is_admin
      ? { admin_token: createAdminSessionToken(merchant.id) }
      : {}),
  });
});

router.post("/logout", (_req: Request, res: Response) => {
  clearMerchantSessionCookie(res);
  return res.json({ ok: true });
});

router.post("/password-reset/request", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "لا يوجد حساب بهذا الرقم");

  const retryAfterSeconds = getOtpRetryAfterSeconds(
    db,
    phone,
    "password_reset",
  );

  if (retryAfterSeconds > 0) {
    return sendOtpCooldownError(res, retryAfterSeconds);
  }

  const otp = issueOtp(db, phone, "password_reset");
  const delivery = await deliverOtp(phone, otp.code, "password_reset");

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.json({
    ok: true,
    message: "تم إرسال رمز التحقق",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...(includeDevCode() ? { devCode: otp.code } : {}),
  });
});

router.post("/password-reset/confirm", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || req.body?.new_password || "").trim();
  const confirmPassword = String(req.body?.confirmPassword || req.body?.confirm_password || "").trim();

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");
  if (!code) return sendError(res, 400, "اكتب رمز التحقق");
  const passwordError = getPasswordValidationError(newPassword);
  if (passwordError) {
    return sendError(res, 400, passwordError.message);
  }
  if (newPassword !== confirmPassword) return sendError(res, 400, "كلمتا المرور غير متطابقتين");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  const otp = findValidOtp(db, phone, code, "password_reset");
  if (!otp) return sendError(res, 400, "رمز التحقق غير صحيح أو منتهي الصلاحية");

  otp.used = true;
  merchant.otp_verified = true;
  merchant.password = hashPassword(newPassword);
  writeDb(db);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});


router.post(
  "/change-password",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const currentPassword = String(
      req.body?.currentPassword || req.body?.oldPassword || "",
    ).trim();
    const newPassword = String(
      req.body?.newPassword || req.body?.new_password || "",
    ).trim();
    const confirmPassword = String(
      req.body?.confirmPassword || req.body?.confirm_password || "",
    ).trim();

    if (currentPassword.length < 1) {
      return sendError(res, 400, "current password is required");
    }

    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return sendError(res, 400, passwordError.message);
    }
    if (newPassword !== confirmPassword) {
      return sendError(
        res,
        400,
        "new password confirmation does not match",
      );
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");
    if (!verifyPassword(currentPassword, merchant.password)) {
      return sendError(res, 401, "current password is incorrect");
    }

    merchant.password = hashPassword(newPassword);
    writeDb(db);

    return res.json({ ok: true, merchant: publicMerchant(merchant) });
  },
);
router.get("/me", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.get("/admin/me", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, admin: toAdminSummary(admin) });
});

router.get("/merchants", (req: Request, res: Response) => {
  const admin = requireAnyAdminPermission(req, res, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "inspect_merchant_sessions",
  ]);
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    merchants: db.merchants
      .filter((merchant) => merchant.is_admin !== true)
      .map(publicMerchant),
  });
});


router.get("/admins", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  return res.json({
    ok: true,
    admins: listAdmins(),
  });
});

router.post("/admins", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  try {
    const admin = createAssistantAdmin({
      ownerName: String(req.body?.owner_name || ""),
      phone: String(req.body?.phone || ""),
      password: String(req.body?.password || ""),
      language: String(req.body?.language || "ar"),
    });

    return res.status(201).json({
      ok: true,
      admin,
    });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return sendError(
        res,
        error.statusCode,
        error.message,
        { code: error.code },
      );
    }

    console.error("Failed to create assistant admin:", error);
    return sendError(res, 500, "failed to create assistant admin");
  }
});

router.patch("/admins/:adminId/enabled", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const adminId = String(req.params.adminId || "").trim();
  const enabled = req.body?.enabled;

  if (!adminId) {
    return sendError(res, 400, "adminId is required");
  }

  if (typeof enabled !== "boolean") {
    return sendError(
      res,
      400,
      "enabled must be boolean",
      { code: "INVALID_ENABLED_VALUE" },
    );
  }

  try {
    const admin = setAssistantAdminEnabled(adminId, enabled);

    return res.json({
      ok: true,
      admin,
    });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return sendError(
        res,
        error.statusCode,
        error.message,
        { code: error.code },
      );
    }

    console.error("Failed to update assistant admin status:", error);
    return sendError(
      res,
      500,
      "failed to update assistant admin status",
    );
  }
});

router.patch(
  "/admins/:adminId/permissions",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner) return;

    const adminId = String(req.params.adminId || "").trim();
    const permissions = req.body?.permissions;

    if (!adminId) {
      return sendError(res, 400, "adminId is required");
    }

    if (!Array.isArray(permissions)) {
      return sendError(
        res,
        400,
        "permissions must be an array",
        { code: "INVALID_PERMISSIONS_VALUE" },
      );
    }

    const hasInvalidPermission = permissions.some(
      (permission) => !isAdminPermission(permission),
    );

    if (hasInvalidPermission) {
      return sendError(
        res,
        400,
        "permissions contain an unknown value",
        { code: "INVALID_ADMIN_PERMISSION" },
      );
    }

    const normalizedPermissions = Array.from(
      new Set(permissions),
    ) as AdminPermission[];

    try {
      const admin = updateAssistantAdminPermissions(
        adminId,
        normalizedPermissions,
      );

      return res.json({
        ok: true,
        admin,
      });
    } catch (error) {
      if (error instanceof AdminManagementError) {
        return sendError(
          res,
          error.statusCode,
          error.message,
          { code: error.code },
        );
      }

      console.error(
        "Failed to update assistant admin permissions:",
        error,
      );

      return sendError(
        res,
        500,
        "failed to update assistant admin permissions",
      );
    }
  },
);

router.post("/admin/local-data-migration", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const db = ensureDb();
  const sourceLogs = Array.isArray(req.body?.logs) ? req.body.logs.slice(0, 5000) : [];
  const sourceNotes =
    req.body?.notes && typeof req.body.notes === "object" && !Array.isArray(req.body.notes)
      ? req.body.notes as Record<string, unknown>
      : {};
  const sourceChannels =
    req.body?.channel_overrides &&
    typeof req.body.channel_overrides === "object" &&
    !Array.isArray(req.body.channel_overrides)
      ? req.body.channel_overrides as Record<string, unknown>
      : {};

  const knownLogIds = new Set(db.admin_logs.map((log) => log.id));
  let importedLogs = 0;
  let importedNotes = 0;
  let importedChannels = 0;

  for (const candidate of sourceLogs) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = String(record.id || "").trim();
    const merchantId = String(record.merchant_id || "").trim();
    const merchantName = String(record.merchant_name || "").trim();
    const actionType = String(record.action_type || "").trim();
    const createdAt = String(record.created_at || "").trim();
    if (!id || knownLogIds.has(id) || !merchantId || !merchantName || !actionType) continue;
    if (!Number.isFinite(new Date(createdAt).getTime())) continue;

    db.admin_logs.push({
      id,
      admin_phone: String(record.admin_phone || owner.phone).trim(),
      action_type: actionType,
      merchant_id: merchantId,
      merchant_name: merchantName,
      details: String(record.details || "").slice(0, 2000),
      ...(record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
        ? { meta: record.meta as Record<string, string | number> }
        : {}),
      ...(record.reason ? { reason: String(record.reason).slice(0, 1000) } : {}),
      created_at: createdAt,
    });
    knownLogIds.add(id);
    importedLogs += 1;
  }

  for (const [merchantId, value] of Object.entries(sourceNotes)) {
    if (typeof value !== "string" || value.length > 5000) continue;
    if (db.admin_notes[merchantId] !== undefined) continue;
    if (!findRegularMerchant(db, merchantId)) continue;
    db.admin_notes[merchantId] = value;
    importedNotes += 1;
  }

  for (const [merchantId, value] of Object.entries(sourceChannels)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (!findRegularMerchant(db, merchantId)) continue;

    const current = db.channel_overrides[merchantId] || {};
    const candidate = value as Record<string, unknown>;
    for (const [platform, status] of Object.entries(candidate)) {
      if (!isChannelPlatform(platform) || !isChannelStatus(status)) continue;
      if (current[platform] !== undefined) continue;
      current[platform] = status;
      importedChannels += 1;
    }
    db.channel_overrides[merchantId] = current;
  }

  db.admin_logs.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  writeDb(db);

  return res.json({
    ok: true,
    imported: {
      logs: importedLogs,
      notes: importedNotes,
      channels: importedChannels,
    },
  });
});

router.post("/admin/logs", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const allowedActions = new Set([
    "plan_activated",
    "plan_changed",
    "plan_renewed",
    "replies_reset",
    "replies_added",
    "replies_deducted",
    "auto_reply_enabled",
    "auto_reply_disabled",
  ]);
  const actionType = String(req.body?.action_type || "").trim();
  const merchantId = String(req.body?.merchant_id || "").trim();
  const details = String(req.body?.details || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const meta =
    req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)
      ? req.body.meta as Record<string, string | number>
      : undefined;

  if (!allowedActions.has(actionType)) {
    return sendError(res, 400, "invalid admin log action");
  }
  if (!merchantId) return sendError(res, 400, "merchantId is required");

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const log = appendAdminLog(db, admin, merchant, actionType, details, {
    ...(meta ? { meta } : {}),
    ...(reason ? { reason } : {}),
  });
  writeDb(db);

  return res.status(201).json({ ok: true, log });
});

router.get("/admin/logs", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "view_logs");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    logs: db.admin_logs.slice(0, 1000),
  });
});

router.get("/admin/channels", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_channels");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    channel_overrides: db.channel_overrides,
  });
});

router.patch(
  "/merchants/:id/channels/:platform",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_channels");
    if (!admin) return;

    const merchantId = String(req.params.id || "").trim();
    const platform = String(req.params.platform || "").trim();
    const status = String(req.body?.status || "").trim();

    if (!merchantId) return sendError(res, 400, "merchantId is required");
    if (!isChannelPlatform(platform)) {
      return sendError(res, 400, "invalid channel platform");
    }
    if (!isChannelStatus(status)) {
      return sendError(res, 400, "invalid channel status");
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");

    db.channel_overrides[merchantId] = {
      ...(db.channel_overrides[merchantId] || {}),
      [platform]: status,
    };
    appendAdminLog(
      db,
      admin,
      merchant,
      "channel_status_changed",
      `${platform}: ${status}`,
      { meta: { platform, status } },
    );
    writeDb(db);

    return res.json({
      ok: true,
      merchant_id: merchantId,
      platform,
      status,
    });
  },
);

router.get("/merchants/:id/note", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  return res.json({
    ok: true,
    merchant_id: merchantId,
    note: db.admin_notes[merchantId] || "",
  });
});

router.put("/merchants/:id/note", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const note = String(req.body?.note || "").trim();
  if (note.length > 5000) {
    return sendError(res, 400, "note is too long");
  }

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  if (note) db.admin_notes[merchantId] = note;
  else delete db.admin_notes[merchantId];

  appendAdminLog(db, admin, merchant, "note_saved", "internal note saved");
  writeDb(db);

  return res.json({ ok: true, merchant_id: merchantId, note });
});

router.get("/admin/deletion-requests", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  if (
    !isOwnerAdmin(admin) &&
    !adminHasPermission(admin, "manage_merchant_status")
  ) {
    return sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permission: "manage_merchant_status",
    });
  }

  const db = ensureDb();
  return res.json({
    ok: true,
    deletion_requests: [...db.deletion_requests].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    ),
  });
});

router.post(
  "/merchants/:id/deletion-requests",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_merchant_status");
    if (!admin) return;

    if (!isAssistantAdmin(admin)) {
      return sendError(res, 403, "only an assistant admin can submit a deletion request", {
        code: "ASSISTANT_ADMIN_REQUIRED",
      });
    }

    const merchantId = String(req.params.id || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const details = String(req.body?.details || "").trim();

    if (!merchantId) return sendError(res, 400, "merchantId is required");
    if (!isMerchantDeleteReason(reason)) {
      return sendError(res, 400, "invalid deletion reason");
    }
    if (!details) return sendError(res, 400, "deletion request details are required");
    if (details.length > 1000) {
      return sendError(res, 400, "deletion request details are too long");
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");
    if (merchant.status !== "suspended") {
      return sendError(res, 409, "merchant must be suspended before requesting deletion");
    }

    if (
      db.deletion_requests.some(
        (request) =>
          request.merchant_id === merchantId && request.status === "pending",
      )
    ) {
      return sendError(res, 409, "a pending deletion request already exists");
    }

    if (reason === MerchantDeleteReason.RetentionExpired) {
      const retention = calculateRetentionStatus(merchant.subscription_expires_at);
      if (String(retention.retentionStatus) !== "eligible_for_deletion") {
        return sendError(res, 409, "merchant is not eligible for retention deletion");
      }
    }

    const deletionRequest: MerchantDeletionRequest = {
      id: makeId("deletion-request"),
      merchant_id: merchant.id,
      merchant_name: merchant.store_name,
      merchant_phone: merchant.phone,
      requested_by_admin_id: admin.id,
      requested_by_admin_name: admin.owner_name,
      requested_by_admin_phone: admin.phone,
      reason,
      details,
      status: "pending",
      created_at: now(),
    };

    db.deletion_requests.unshift(deletionRequest);
    appendAdminLog(
      db,
      admin,
      merchant,
      "deletion_requested",
      "merchant deletion requested",
      { reason: `${reason}: ${details}` },
    );
    writeDb(db);

    return res.status(201).json({ ok: true, deletion_request: deletionRequest });
  },
);

router.post(
  "/admin/deletion-requests/:requestId/reject",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner) return;

    const requestId = String(req.params.requestId || "").trim();
    const db = ensureDb();
    const deletionRequest = db.deletion_requests.find(
      (request) => request.id === requestId,
    );

    if (!deletionRequest) return sendError(res, 404, "deletion request not found");
    if (deletionRequest.status !== "pending") {
      return sendError(res, 409, "deletion request is already reviewed");
    }

    deletionRequest.status = "rejected";
    deletionRequest.reviewed_by_admin_id = owner.id;
    deletionRequest.reviewed_at = now();
    appendAdminLog(
      db,
      owner,
      { id: deletionRequest.merchant_id, store_name: deletionRequest.merchant_name },
      "deletion_request_rejected",
      "merchant deletion request rejected",
      { reason: deletionRequest.details },
    );
    writeDb(db);

    return res.json({ ok: true, deletion_request: deletionRequest });
  },
);

router.post("/admin/verify-password", (req: Request, res: Response) => {
  const sessionAdmin = requireAdminSession(req, res);
  if (!sessionAdmin) return;

  const adminId = String(req.body?.adminId || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");

  if (!adminId) return sendError(res, 400, "adminId is required");
  if (!adminPassword) {
    return sendError(res, 400, "admin password is required");
  }

  if (
    sessionAdmin.id !== adminId ||
    !verifyPassword(adminPassword, sessionAdmin.password)
  ) {
    return sendError(res, 401, "admin credentials are incorrect");
  }

  return res.json({ ok: true });
});


router.post("/merchants/:id/delete", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const merchantId = String(req.params.id || "").trim();
  const adminId = String(req.body?.adminId || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");
  const deletionRequestId = String(req.body?.deletionRequestId || "").trim();

  if (!merchantId) return sendError(res, 400, "merchantId is required");
  if (!adminId) return sendError(res, 400, "adminId is required");
  if (!adminPassword) return sendError(res, 400, "admin password is required");
  if (!deletionRequestId) {
    return sendError(res, 400, "deletionRequestId is required");
  }

  const db = ensureDb();

  if (
    owner.id !== adminId ||
    !verifyPassword(adminPassword, owner.password)
  ) {
    return sendError(res, 401, "admin credentials are incorrect");
  }

  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");
  if (merchant.status !== "suspended") {
    return sendError(res, 409, "merchant must remain suspended until deletion review");
  }

  const deletionRequest = db.deletion_requests.find(
    (request) =>
      request.id === deletionRequestId &&
      request.merchant_id === merchantId,
  );

  if (!deletionRequest) {
    return sendError(res, 404, "deletion request not found");
  }
  if (deletionRequest.status !== "pending") {
    return sendError(res, 409, "deletion request is already reviewed");
  }

  const retention = calculateRetentionStatus(
    merchant.subscription_expires_at,
  );

  if (
    deletionRequest.reason === MerchantDeleteReason.RetentionExpired &&
    String(retention.retentionStatus) !== "eligible_for_deletion"
  ) {
    return sendError(res, 409, "merchant is not eligible for retention deletion");
  }

  try {
    const result = deleteMerchant({
      merchantId,
      reason: deletionRequest.reason,
      performedBy: owner.id,
      performedAt: now(),
      retentionStatus: retention.retentionStatus,
    });

    const latestDb = ensureDb();
    const latestRequest = latestDb.deletion_requests.find(
      (request) => request.id === deletionRequestId,
    );

    if (latestRequest) {
      latestRequest.status = "completed";
      latestRequest.reviewed_by_admin_id = owner.id;
      latestRequest.reviewed_at = now();
    }

    delete latestDb.channel_overrides[merchantId];
    delete latestDb.admin_notes[merchantId];
    appendAdminLog(
      latestDb,
      owner,
      merchant,
      "merchant_deleted",
      "merchant account and dependent data permanently deleted",
      { reason: `${deletionRequest.reason}: ${deletionRequest.details}` },
    );
    writeDb(latestDb);

    return res.json({
      ...result,
      deletion_request: latestRequest || deletionRequest,
    });
  } catch (error) {
    console.error("Merchant deletion failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : "merchant deletion failed";

    if (message.includes("not eligible")) {
      return sendError(res, 409, message);
    }

    return sendError(res, 500, "merchant deletion failed");
  }
});


router.patch("/merchants/:id/subscription", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const startedAt = String(req.body?.subscription_started_at || "").trim();
  const expiresAt = String(req.body?.subscription_expires_at || "").trim();

  if (!merchantId) {
    return sendError(res, 400, "merchantId is required");
  }

  const startedDate = new Date(startedAt);
  const expiresDate = new Date(expiresAt);

  if (
    !startedAt ||
    !expiresAt ||
    !Number.isFinite(startedDate.getTime()) ||
    !Number.isFinite(expiresDate.getTime())
  ) {
    return sendError(res, 400, "valid subscription dates are required");
  }

  if (expiresDate.getTime() <= startedDate.getTime()) {
    return sendError(
      res,
      400,
      "subscription expiration must be after start date",
    );
  }

  const db = ensureDb();
  const merchant = db.merchants.find(
    (item) => item.id === merchantId && item.is_admin !== true,
  );

  if (!merchant) {
    return sendError(res, 404, "merchant not found");
  }

  if (
    merchant.subscription_expires_at &&
    merchant.subscription_expires_at !== expiresAt
  ) {
    merchant.last_subscription_ended_at =
      merchant.subscription_expires_at;
  }

  merchant.subscription_started_at = startedDate.toISOString();
  merchant.subscription_expires_at = expiresDate.toISOString();
  merchant.warning_stage = 0;
  merchant.retention_status = MerchantRetentionStatus.Protected;
  merchant.eligible_for_deletion_at = undefined;
  merchant.grace_period_ends_at = undefined;

  appendAdminLog(
    db,
    admin,
    merchant,
    "subscription_updated",
    "subscription dates updated",
    {
      meta: {
        subscription_started_at: merchant.subscription_started_at,
        subscription_expires_at: merchant.subscription_expires_at,
      },
    },
  );
  writeDb(db);

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
  });
});


router.patch("/merchants/:id/status", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const status = String(req.body?.status || "").trim() as MerchantStatus;
  const reason = String(req.body?.reason || "").trim();

  if (!["pending_activation", "approved", "rejected", "suspended"].includes(status)) {
    return sendError(res, 400, "invalid status");
  }

  const db = ensureDb();
  const merchant = db.merchants.find((item) => item.id === merchantId && !item.is_admin);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const hasPendingDeletionRequest = db.deletion_requests.some(
    (request) =>
      request.merchant_id === merchantId && request.status === "pending",
  );
  if (hasPendingDeletionRequest && status !== "suspended") {
    return sendError(
      res,
      409,
      "merchant must remain suspended until the deletion request is reviewed",
    );
  }

  if (status === "approved" && merchant.otp_verified !== true) {
    return sendError(res, 409, "phone number must be verified before approval");
  }

  if ((status === "suspended" || status === "rejected") && !reason) {
    return sendError(res, 400, "reason is required for this status");
  }

  const previousStatus = merchant.status;
  merchant.status = status;
  appendAdminLog(
    db,
    admin,
    merchant,
    status === "approved" && previousStatus === "suspended"
      ? "unsuspended"
      : status === "pending_activation"
        ? "restore_pending"
        : status,
    `merchant status changed from ${previousStatus} to ${status}`,
    { ...(reason ? { reason } : {}) },
  );
  writeDb(db);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

export default router;
