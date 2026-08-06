import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { registerMerchantRuntimeDeletion } from "./merchantRuntime";

export type MerchantReplyLanguage = "auto" | "ar" | "ku" | "en";
export type MerchantPaymentMethod =
  | "cash_on_delivery"
  | "superqi"
  | "fastpay"
  | "zaincash"
  | "other";

export type MerchantOperationalSettings = {
  merchant_id: string;
  version: number;
  auto_reply_enabled: boolean;
  reply_language: MerchantReplyLanguage;
  delivery: {
    enabled: boolean;
    fee_iqd: number;
    free_delivery_threshold_iqd: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    areas: string[];
    notes: string;
  };
  payment: {
    cash_on_delivery_enabled: boolean;
    electronic_payment_enabled: boolean;
    methods: MerchantPaymentMethod[];
    instructions: string;
  };
  created_at: string;
  updated_at: string;
};

type SettingsDatabase = {
  version: 1;
  settings: Record<string, MerchantOperationalSettings>;
};

export class MerchantSettingsError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MerchantSettingsError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const STORE_VERSION = 1 as const;
const LOCK_STALE_MS = 30_000;
const REPLY_LANGUAGES = new Set<MerchantReplyLanguage>([
  "auto",
  "ar",
  "ku",
  "en",
]);
const PAYMENT_METHODS = new Set<MerchantPaymentMethod>([
  "cash_on_delivery",
  "superqi",
  "fastpay",
  "zaincash",
  "other",
]);

function settingsPath(): string {
  return getFawriDataFilePath("merchant-settings.json");
}

function lockPath(): string {
  return `${settingsPath()}.lock`;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonNegativeInteger(
  value: unknown,
  fallback: number,
  maximum = 100_000_000,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  maximum = 365,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function normalizedStringList(
  value: unknown,
  { maximumItems = 100, maximumLength = 100 } = {},
): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = text(item).slice(0, maximumLength);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maximumItems) break;
  }
  return result;
}

function normalizedPaymentMethods(value: unknown): MerchantPaymentMethod[] {
  return normalizedStringList(value, {
    maximumItems: PAYMENT_METHODS.size,
    maximumLength: 40,
  }).filter((item): item is MerchantPaymentMethod =>
    PAYMENT_METHODS.has(item as MerchantPaymentMethod),
  );
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function readDatabase(): SettingsDatabase {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(settingsPath(), "utf8"),
    ) as Partial<SettingsDatabase>;
    if (
      parsed.version !== STORE_VERSION ||
      !parsed.settings ||
      typeof parsed.settings !== "object" ||
      Array.isArray(parsed.settings)
    ) {
      throw new Error("merchant settings store has an unsupported shape");
    }
    return parsed as SettingsDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, settings: {} };
    }
    throw error;
  }
}

function acquireLock(): number {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath(), "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      );
      return descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const statistics = fs.statSync(lockPath());
        if (Date.now() - statistics.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath());
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_BUSY",
        "merchant settings are busy",
        503,
      );
    }
  }
  throw new MerchantSettingsError(
    "MERCHANT_SETTINGS_BUSY",
    "merchant settings are busy",
    503,
  );
}

function withDatabaseLock<T>(callback: (database: SettingsDatabase) => T): T {
  const descriptor = acquireLock();
  try {
    const database = readDatabase();
    const result = callback(database);
    writeJsonAtomically(settingsPath(), database);
    return result;
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function defaultSettings(merchantId: string): MerchantOperationalSettings {
  const timestamp = new Date().toISOString();
  return {
    merchant_id: merchantId,
    version: 1,
    auto_reply_enabled: true,
    reply_language: "auto",
    delivery: {
      enabled: true,
      fee_iqd: 0,
      free_delivery_threshold_iqd: null,
      estimated_days_min: 1,
      estimated_days_max: 3,
      areas: [],
      notes: "",
    },
    payment: {
      cash_on_delivery_enabled: true,
      electronic_payment_enabled: false,
      methods: ["cash_on_delivery"],
      instructions: "",
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function cloneSettings(
  settings: MerchantOperationalSettings,
): MerchantOperationalSettings {
  return structuredClone(settings);
}

function requireExpectedVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_VERSION_REQUIRED",
      "a positive expected_version is required",
      400,
    );
  }
  return parsed;
}

function normalizePatch(
  current: MerchantOperationalSettings,
  patchValue: unknown,
): MerchantOperationalSettings {
  const patch = objectRecord(patchValue);
  const deliveryPatch = objectRecord(patch.delivery);
  const paymentPatch = objectRecord(patch.payment);
  const replyLanguage = text(patch.reply_language);
  if (replyLanguage && !REPLY_LANGUAGES.has(replyLanguage as MerchantReplyLanguage)) {
    throw new MerchantSettingsError(
      "MERCHANT_REPLY_LANGUAGE_INVALID",
      "reply language is invalid",
      400,
    );
  }

  const deliveryEnabled =
    typeof deliveryPatch.enabled === "boolean"
      ? deliveryPatch.enabled
      : current.delivery.enabled;
  const deliveryFee = nonNegativeInteger(
    deliveryPatch.fee_iqd,
    current.delivery.fee_iqd,
  );
  let freeThreshold = current.delivery.free_delivery_threshold_iqd;
  if (Object.prototype.hasOwnProperty.call(deliveryPatch, "free_delivery_threshold_iqd")) {
    freeThreshold =
      deliveryPatch.free_delivery_threshold_iqd === null ||
      deliveryPatch.free_delivery_threshold_iqd === ""
        ? null
        : nonNegativeInteger(
            deliveryPatch.free_delivery_threshold_iqd,
            current.delivery.free_delivery_threshold_iqd || 0,
          );
  }
  const estimatedMin = positiveInteger(
    deliveryPatch.estimated_days_min,
    current.delivery.estimated_days_min,
  );
  const estimatedMax = positiveInteger(
    deliveryPatch.estimated_days_max,
    current.delivery.estimated_days_max,
  );
  if (estimatedMax < estimatedMin) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_ESTIMATE_INVALID",
      "maximum delivery days cannot be less than minimum delivery days",
      400,
    );
  }

  const cashEnabled =
    typeof paymentPatch.cash_on_delivery_enabled === "boolean"
      ? paymentPatch.cash_on_delivery_enabled
      : current.payment.cash_on_delivery_enabled;
  const electronicEnabled =
    typeof paymentPatch.electronic_payment_enabled === "boolean"
      ? paymentPatch.electronic_payment_enabled
      : current.payment.electronic_payment_enabled;
  let methods = Object.prototype.hasOwnProperty.call(paymentPatch, "methods")
    ? normalizedPaymentMethods(paymentPatch.methods)
    : [...current.payment.methods];
  methods = methods.filter((method) =>
    method === "cash_on_delivery" ? cashEnabled : electronicEnabled,
  );
  if (cashEnabled && !methods.includes("cash_on_delivery")) {
    methods.unshift("cash_on_delivery");
  }
  if (!cashEnabled && !electronicEnabled) {
    throw new MerchantSettingsError(
      "MERCHANT_PAYMENT_METHOD_REQUIRED",
      "at least one payment method must remain enabled",
      400,
    );
  }
  if (electronicEnabled && !methods.some((method) => method !== "cash_on_delivery")) {
    throw new MerchantSettingsError(
      "MERCHANT_ELECTRONIC_PAYMENT_METHOD_REQUIRED",
      "an electronic payment method is required when electronic payments are enabled",
      400,
    );
  }

  const timestamp = new Date().toISOString();
  return {
    merchant_id: current.merchant_id,
    version: current.version + 1,
    auto_reply_enabled:
      typeof patch.auto_reply_enabled === "boolean"
        ? patch.auto_reply_enabled
        : current.auto_reply_enabled,
    reply_language: replyLanguage
      ? (replyLanguage as MerchantReplyLanguage)
      : current.reply_language,
    delivery: {
      enabled: deliveryEnabled,
      fee_iqd: deliveryFee,
      free_delivery_threshold_iqd: freeThreshold,
      estimated_days_min: estimatedMin,
      estimated_days_max: estimatedMax,
      areas: Object.prototype.hasOwnProperty.call(deliveryPatch, "areas")
        ? normalizedStringList(deliveryPatch.areas)
        : [...current.delivery.areas],
      notes: Object.prototype.hasOwnProperty.call(deliveryPatch, "notes")
        ? text(deliveryPatch.notes).slice(0, 1000)
        : current.delivery.notes,
    },
    payment: {
      cash_on_delivery_enabled: cashEnabled,
      electronic_payment_enabled: electronicEnabled,
      methods,
      instructions: Object.prototype.hasOwnProperty.call(paymentPatch, "instructions")
        ? text(paymentPatch.instructions).slice(0, 2000)
        : current.payment.instructions,
    },
    created_at: current.created_at,
    updated_at: timestamp,
  };
}

export function getMerchantOperationalSettings(
  merchantId: string,
): MerchantOperationalSettings {
  const normalizedMerchantId = text(merchantId);
  if (!normalizedMerchantId) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_ID_INVALID",
      "merchant identifier is required",
      400,
    );
  }
  const database = readDatabase();
  return cloneSettings(
    database.settings[normalizedMerchantId] ||
      defaultSettings(normalizedMerchantId),
  );
}

export function updateMerchantOperationalSettings(input: {
  merchantId: string;
  expectedVersion: unknown;
  patch: unknown;
}): MerchantOperationalSettings {
  const merchantId = text(input.merchantId);
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  return withDatabaseLock((database) => {
    const current =
      database.settings[merchantId] || defaultSettings(merchantId);
    if (current.version !== expectedVersion) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_VERSION_CONFLICT",
        "merchant settings were changed by another request",
        409,
        {
          expected_version: expectedVersion,
          current_version: current.version,
          current_settings: cloneSettings(current),
        },
      );
    }
    const updated = normalizePatch(current, input.patch);
    database.settings[merchantId] = updated;
    return cloneSettings(updated);
  });
}

export function merchantAllowsAutoReply(merchantId: string): boolean {
  return getMerchantOperationalSettings(merchantId).auto_reply_enabled;
}

registerMerchantRuntimeDeletion((merchantId) => {
  const filePath = settingsPath();
  if (!fs.existsSync(filePath)) return { merchantSettings: 0 };
  const descriptor = acquireLock();
  try {
    const database = readDatabase();
    const existed = Object.prototype.hasOwnProperty.call(
      database.settings,
      merchantId,
    );
    delete database.settings[merchantId];
    writeJsonAtomically(filePath, database);
    return { merchantSettings: existed ? 1 : 0 };
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
});
