import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import type {
  AccountKind,
  AdminPermission,
  AdminRole,
  MerchantAccountStatus,
} from "./authPolicy";
import { normalizeAdminPermissions } from "./authPolicy";

export type RequestedPlan = "silver" | "gold" | "diamond";

export type AccountIdentity = {
  id: string;
  phone: string;
  passwordHash: string;
  kind: AccountKind;
  enabled: boolean;
  otpVerified: boolean;
  sessionVersion: number;
};

export type MerchantProfile = {
  merchantId: string;
  tenantId: string;
  ownerName: string;
  storeName: string;
  activityType: string;
  language: "ar" | "ku" | "en";
  accountStatus: MerchantAccountStatus;
  onboardingStatus: string;
  requestedPlan: RequestedPlan | null;
  createdAt: string;
};

export type AdminProfile = {
  adminId: string;
  role: AdminRole;
  permissions: AdminPermission[];
  displayName: string;
  language: "ar" | "ku" | "en";
  createdAt: string;
  mustChangePassword: boolean;
};

export type AuthAccount =
  | { account: AccountIdentity; merchantProfile: MerchantProfile; adminProfile?: never }
  | { account: AccountIdentity; adminProfile: AdminProfile; merchantProfile?: never };

type LegacyRecord = {
  id: string;
  owner_name?: string;
  store_name?: string;
  phone?: string;
  password?: string;
  activity_type?: string;
  status?: string;
  language?: string;
  created_at?: string;
  is_admin?: boolean;
  admin_role?: string;
  permissions?: unknown;
  admin_enabled?: boolean;
  otp_verified?: boolean;
  admin_session_version?: number;
  auth_session_version?: number;
  account_status?: string;
  onboarding_status?: string;
  requested_plan?: string | null;
  [key: string]: unknown;
};

type LegacyAuthDb = {
  merchants: LegacyRecord[];
  [key: string]: unknown;
};

export class AuthAccountRepository {
  private readonly filePath: string;

  constructor(filePath = getFawriDataFilePath("merchants.json")) {
    this.filePath = filePath;
  }

  findByPhone(phone: string, expectedKind: AccountKind): AuthAccount | null {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    const records = this.readDb().merchants.filter((record) =>
      normalizePhone(record.phone) === normalizedPhone &&
      accountKind(record) === expectedKind,
    );
    if (records.length !== 1) return null;
    return toAuthAccount(records[0]);
  }

  findById(accountId: string, expectedKind: AccountKind): AuthAccount | null {
    const record = this.readDb().merchants.find((item) =>
      item.id === accountId && accountKind(item) === expectedKind,
    );
    return record ? toAuthAccount(record) : null;
  }

  upsertPendingMerchant(input: {
    phone: string;
    passwordHash: string;
    ownerName: string;
    storeName: string;
    activityType: string;
    language: "ar" | "ku" | "en";
    requestedPlan?: RequestedPlan | null;
  }): AuthAccount {
    const phone = normalizePhone(input.phone);
    if (!/^07\d{9}$/.test(phone)) throw new Error("INVALID_PHONE");
    const db = this.readDb();
    const conflictingAdmin = db.merchants.some((record) =>
      normalizePhone(record.phone) === phone && accountKind(record) === "admin",
    );
    if (conflictingAdmin) throw new Error("PHONE_ALREADY_EXISTS");

    let record = db.merchants.find((item) =>
      normalizePhone(item.phone) === phone && accountKind(item) === "merchant",
    );
    if (record && record.otp_verified === true) throw new Error("PHONE_ALREADY_EXISTS");

    const createdAt = record?.created_at || new Date().toISOString();
    if (!record) {
      record = {
        id: `merchant-${crypto.randomUUID()}`,
        created_at: createdAt,
      };
      db.merchants.push(record);
    }

    const requestedPlan = input.requestedPlan === undefined
      ? normalizeRequestedPlan(record.requested_plan)
      : normalizeRequestedPlan(input.requestedPlan);

    Object.assign(record, {
      owner_name: input.ownerName.trim(),
      store_name: input.storeName.trim(),
      phone,
      password: input.passwordHash,
      activity_type: input.activityType.trim(),
      status: "pending_activation",
      language: input.language,
      theme_preference: record.theme_preference || "auto",
      is_admin: false,
      otp_verified: false,
      account_status: "pending_review",
      onboarding_status: "pending_review",
      trial_status: record.trial_status || "eligible",
      signup_source: record.signup_source || "direct",
      requested_plan: requestedPlan,
      warning_stage: record.warning_stage || 0,
      retention_status: record.retention_status || "protected",
    });
    this.writeDb(db);
    return toAuthAccount(record);
  }


  createAssistantAdmin(input: {
    ownerName: string;
    phone: string;
    passwordHash: string;
    language: "ar" | "ku" | "en";
  }): AuthAccount {
    const phone = normalizePhone(input.phone);
    if (!/^07\d{9}$/.test(phone)) throw new Error("INVALID_PHONE");
    const db = this.readDb();
    if (db.merchants.some((record) => normalizePhone(record.phone) === phone)) {
      throw new Error("PHONE_ALREADY_EXISTS");
    }
    const record: LegacyRecord = {
      id: `admin-${crypto.randomUUID()}`,
      owner_name: input.ownerName.trim(),
      store_name: "Fawri Admin",
      phone,
      password: input.passwordHash,
      activity_type: "admin",
      status: "approved",
      language: input.language,
      theme_preference: "auto",
      created_at: new Date().toISOString(),
      is_admin: true,
      admin_role: "assistant_admin",
      permissions: [],
      admin_enabled: true,
      otp_verified: true,
      must_change_password: true,
      admin_session_version: 0,
      auth_session_version: 0,
      warning_stage: 0,
      retention_status: "protected",
    };
    db.merchants.push(record);
    this.writeDb(db);
    return toAuthAccount(record);
  }

  markMerchantOtpVerified(accountId: string): AuthAccount | null {
    const db = this.readDb();
    const record = db.merchants.find((item) =>
      item.id === accountId && accountKind(item) === "merchant",
    );
    if (!record) return null;
    record.otp_verified = true;
    record.status = "pending_activation";
    record.account_status = "pending_review";
    record.onboarding_status = record.onboarding_status || "pending_review";
    this.writeDb(db);
    return toAuthAccount(record);
  }

  updatePassword(
    accountId: string,
    kind: AccountKind,
    passwordHash: string,
    options: { mustChangePassword?: boolean } = {},
  ): boolean {
    const db = this.readDb();
    const record = db.merchants.find((item) =>
      item.id === accountId && accountKind(item) === kind,
    );
    if (!record) return false;
    record.password = passwordHash;
    if (kind === "admin" && typeof options.mustChangePassword === "boolean") {
      record.must_change_password = options.mustChangePassword;
    }
    incrementSessionVersion(record);
    this.writeDb(db);
    return true;
  }

  setAdminEnabled(accountId: string, enabled: boolean): boolean {
    const db = this.readDb();
    const record = db.merchants.find((item) =>
      item.id === accountId && accountKind(item) === "admin",
    );
    if (!record || normalizeAdminRole(record.admin_role) === "owner_admin") return false;
    record.admin_enabled = enabled;
    incrementSessionVersion(record);
    this.writeDb(db);
    return true;
  }

  setAssistantPermissions(
    accountId: string,
    permissions: readonly AdminPermission[],
  ): boolean {
    const db = this.readDb();
    const record = db.merchants.find((item) =>
      item.id === accountId &&
      accountKind(item) === "admin" &&
      normalizeAdminRole(item.admin_role) === "assistant_admin",
    );
    if (!record) return false;
    record.permissions = normalizeAdminPermissions(permissions);
    incrementSessionVersion(record);
    this.writeDb(db);
    return true;
  }

  listAdmins(): AuthAccount[] {
    return this.readDb().merchants
      .filter((record) => accountKind(record) === "admin")
      .map(toAuthAccount);
  }

  private readDb(): LegacyAuthDb {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) return { merchants: [] };
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<LegacyAuthDb>;
    return {
      ...parsed,
      merchants: Array.isArray(parsed.merchants) ? parsed.merchants : [],
    };
  }

  private writeDb(db: LegacyAuthDb): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(db, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
  }
}

export function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function accountKind(record: LegacyRecord): AccountKind {
  return record.is_admin === true ? "admin" : "merchant";
}

function normalizeLanguage(value: unknown): "ar" | "ku" | "en" {
  return value === "en" || value === "ku" ? value : "ar";
}

function normalizeAdminRole(value: unknown): AdminRole {
  return value === "owner_admin" ? "owner_admin" : "assistant_admin";
}

function normalizeSessionVersion(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function incrementSessionVersion(record: LegacyRecord): void {
  const nextVersion = normalizeSessionVersion(
    record.auth_session_version ?? record.admin_session_version,
  ) + 1;
  record.auth_session_version = nextVersion;
  if (accountKind(record) === "admin") {
    record.admin_session_version = nextVersion;
  }
}

function normalizeMerchantStatus(record: LegacyRecord): MerchantAccountStatus {
  const value = record.account_status || record.status;
  if (value === "approved" || value === "rejected" || value === "suspended") {
    return value;
  }
  return "pending_review";
}

function normalizeRequestedPlan(value: unknown): RequestedPlan | null {
  return value === "silver" || value === "gold" || value === "diamond"
    ? value
    : null;
}

function toAuthAccount(record: LegacyRecord): AuthAccount {
  const kind = accountKind(record);
  const account: AccountIdentity = {
    id: record.id,
    phone: normalizePhone(record.phone),
    passwordHash: String(record.password || ""),
    kind,
    enabled: kind === "admin"
      ? record.admin_enabled !== false && record.status === "approved"
      : record.status !== "rejected" && record.status !== "suspended",
    otpVerified: record.otp_verified === true,
    sessionVersion: normalizeSessionVersion(
      record.auth_session_version ?? record.admin_session_version,
    ),
  };

  if (kind === "admin") {
    return {
      account,
      adminProfile: {
        adminId: record.id,
        role: normalizeAdminRole(record.admin_role),
        permissions: normalizeAdminPermissions(record.permissions),
        displayName: String(record.owner_name || "Administrator"),
        language: normalizeLanguage(record.language),
        createdAt: String(record.created_at || ""),
        mustChangePassword: record.must_change_password === true,
      },
    };
  }

  return {
    account,
    merchantProfile: {
      merchantId: record.id,
      tenantId: record.id,
      ownerName: String(record.owner_name || ""),
      storeName: String(record.store_name || ""),
      activityType: String(record.activity_type || ""),
      language: normalizeLanguage(record.language),
      accountStatus: normalizeMerchantStatus(record),
      onboardingStatus: String(record.onboarding_status || "pending_review"),
      requestedPlan: normalizeRequestedPlan(record.requested_plan),
      createdAt: String(record.created_at || ""),
    },
  };
}

export const authAccountRepository = new AuthAccountRepository();
