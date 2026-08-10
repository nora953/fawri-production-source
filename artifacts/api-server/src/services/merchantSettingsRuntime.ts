import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  DeliveryPricingPolicyError,
  normalizeDeliveryAreaName,
  resolveDeliveryQuote,
  type DeliveryAreaRate,
  type DeliveryPricingMode,
} from "./deliveryPricing";
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
    pricing_mode: DeliveryPricingMode;
    fee_iqd: number;
    free_delivery_threshold_iqd: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    areas: string[];
    area_rates: DeliveryAreaRate[];
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

export type MerchantSettingsEffects = {
  queued_auto_reply_jobs_suppressed: number;
  processing_auto_reply_jobs_observed: number;
  credit_consumed: false;
};

type SettingsDatabase = {
  version: 1;
  settings: Record<string, MerchantOperationalSettings>;
};

type DurableJob = {
  id?: unknown;
  type?: unknown;
  merchant_id?: unknown;
  status?: unknown;
  payload?: unknown;
  result?: unknown;
  locked_at?: unknown;
  locked_by?: unknown;
  last_error_code?: unknown;
  last_error_message?: unknown;
  completed_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
};

type DurableJobStore = {
  version: 1 | 2;
  jobs: DurableJob[];
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
const REPLY_JOB_TYPE = "meta.webhook.reply";
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
const ROOT_PATCH_KEYS = new Set([
  "auto_reply_enabled",
  "reply_language",
  "delivery",
  "payment",
]);
const DELIVERY_PATCH_KEYS = new Set([
  "enabled",
  "pricing_mode",
  "fee_iqd",
  "free_delivery_threshold_iqd",
  "estimated_days_min",
  "estimated_days_max",
  "areas",
  "area_rates",
  "notes",
]);
const PAYMENT_PATCH_KEYS = new Set([
  "cash_on_delivery_enabled",
  "electronic_payment_enabled",
  "methods",
  "instructions",
]);

function settingsPath(): string {
  return getFawriDataFilePath("merchant-settings.json");
}

function settingsLockPath(): string {
  return `${settingsPath()}.lock`;
}

function queuePath(): string {
  return getFawriDataFilePath("background-jobs.json");
}

function queueLockPath(): string {
  return `${queuePath()}.lock`;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function requireMerchantId(value: unknown): string {
  const merchantId = text(value);
  if (!merchantId || merchantId.length > 200) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_ID_INVALID",
      "merchant identifier is required",
      400,
    );
  }
  return merchantId;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: Set<string>,
  code: string,
): void {
  const unknownKeys = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new MerchantSettingsError(
      code,
      `unsupported settings fields: ${unknownKeys.join(", ")}`,
      400,
    );
  }
}

function nonNegativeInteger(
  value: unknown,
  fallback: number,
  maximum = 100_000_000,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_NUMBER_INVALID",
      "settings number is outside the accepted range",
      400,
    );
  }
  return parsed;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  maximum = 365,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_NUMBER_INVALID",
      "settings number is outside the accepted range",
      400,
    );
  }
  return parsed;
}

function normalizedStringList(
  value: unknown,
  { maximumItems = 100, maximumLength = 100 } = {},
): string[] {
  if (!Array.isArray(value)) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_LIST_INVALID",
      "settings list must be an array",
      400,
    );
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = text(item);
    if (!normalized || normalized.length > maximumLength) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_LIST_INVALID",
        "settings list contains an invalid value",
        400,
      );
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length > maximumItems) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_LIST_INVALID",
        "settings list contains too many values",
        400,
      );
    }
  }
  return result;
}

function normalizedPaymentMethods(value: unknown): MerchantPaymentMethod[] {
  return normalizedStringList(value, {
    maximumItems: PAYMENT_METHODS.size,
    maximumLength: 40,
  }).filter((item): item is MerchantPaymentMethod => {
    if (!PAYMENT_METHODS.has(item as MerchantPaymentMethod)) {
      throw new MerchantSettingsError(
        "MERCHANT_PAYMENT_METHOD_INVALID",
        "payment method is invalid",
        400,
      );
    }
    return true;
  });
}

function deliveryRateId(merchantId: string, normalizedArea: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${merchantId}\0${normalizedArea}`)
    .digest("hex")
    .slice(0, 32);
  return `delivery-area:${digest}`;
}

function normalizedAreaRates(
  merchantId: string,
  value: unknown,
  fallback: DeliveryAreaRate[],
): DeliveryAreaRate[] {
  if (value === undefined) return structuredClone(fallback);
  if (!Array.isArray(value) || value.length > 100) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_AREA_RATES_INVALID",
      "delivery area rates must be an array with at most 100 entries",
      400,
    );
  }
  const result: DeliveryAreaRate[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MerchantSettingsError(
        "MERCHANT_DELIVERY_AREA_RATE_INVALID",
        "delivery area rate is invalid",
        400,
      );
    }
    const record = raw as Record<string, unknown>;
    const areaName = text(record.area_name);
    const normalized = normalizeDeliveryAreaName(areaName);
    const enabled = record.enabled === undefined ? true : record.enabled;
    if (
      !areaName ||
      areaName.length > 100 ||
      !normalized ||
      normalized.length > 100 ||
      typeof enabled !== "boolean"
    ) {
      throw new MerchantSettingsError(
        "MERCHANT_DELIVERY_AREA_RATE_INVALID",
        "delivery area rate is invalid",
        400,
      );
    }
    if (seen.has(normalized)) {
      throw new MerchantSettingsError(
        "MERCHANT_DELIVERY_AREA_DUPLICATE",
        "delivery area is duplicated after normalization",
        400,
      );
    }
    if (record.fee_iqd === undefined) {
      throw new MerchantSettingsError(
        "MERCHANT_DELIVERY_AREA_RATE_INVALID",
        "delivery area rate fee is required",
        400,
      );
    }
    seen.add(normalized);
    result.push({
      id: deliveryRateId(merchantId, normalized),
      area_name: areaName,
      normalized_area_name: normalized,
      fee_iqd: nonNegativeInteger(record.fee_iqd, 0),
      enabled,
    });
  }
  return result;
}

function hydrateStoredSettings(
  settings: MerchantOperationalSettings,
): MerchantOperationalSettings {
  const delivery = objectRecord(settings.delivery);
  const pricingMode = delivery.pricing_mode === "per_area" ? "per_area" : "flat";
  return {
    ...settings,
    delivery: {
      ...settings.delivery,
      pricing_mode: pricingMode,
      area_rates: normalizedAreaRates(
        settings.merchant_id,
        delivery.area_rates === undefined ? [] : delivery.area_rates,
        [],
      ),
    },
  };
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

function readQueueStore(): DurableJobStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath(), "utf8")) as {
      version?: unknown;
      jobs?: unknown;
    };
    const version = Number(parsed.version);
    if (![1, 2].includes(version) || !Array.isArray(parsed.jobs)) {
      throw new Error("durable job queue store has an unsupported shape");
    }
    return { version: version as 1 | 2, jobs: parsed.jobs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 2, jobs: [] };
    }
    throw error;
  }
}

function acquireFileLock(
  filePath: string,
  busyCode: string,
  busyMessage: string,
): number {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(filePath, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      );
      return descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const statistics = fs.statSync(filePath);
        if (Date.now() - statistics.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(filePath);
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw new MerchantSettingsError(busyCode, busyMessage, 503);
    }
  }
  throw new MerchantSettingsError(busyCode, busyMessage, 503);
}

function releaseFileLock(descriptor: number, filePath: string): void {
  try {
    fs.closeSync(descriptor);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function acquireSettingsLock(): number {
  return acquireFileLock(
    settingsLockPath(),
    "MERCHANT_SETTINGS_BUSY",
    "merchant settings are busy",
  );
}

function withDatabaseLock<T>(callback: (database: SettingsDatabase) => T): T {
  const descriptor = acquireSettingsLock();
  try {
    const database = readDatabase();
    const result = callback(database);
    writeJsonAtomically(settingsPath(), database);
    return result;
  } finally {
    releaseFileLock(descriptor, settingsLockPath());
  }
}

function durableJobMerchantId(job: DurableJob): string {
  const direct = text(job.merchant_id);
  if (direct) return direct;
  return text(objectRecord(job.payload).merchant_id);
}

function suppressQueuedAutoReplyJobs(
  merchantId: string,
  settingsVersion: number,
): MerchantSettingsEffects {
  const descriptor = acquireFileLock(
    queueLockPath(),
    "MERCHANT_SETTINGS_QUEUE_BUSY",
    "automatic reply queue is busy",
  );
  try {
    const store = readQueueStore();
    const now = new Date().toISOString();
    let suppressed = 0;
    let processing = 0;
    for (const job of store.jobs) {
      if (
        text(job.type) !== REPLY_JOB_TYPE ||
        durableJobMerchantId(job) !== merchantId
      ) {
        continue;
      }
      const status = text(job.status);
      if (status === "processing") {
        processing += 1;
        continue;
      }
      if (status !== "queued" && status !== "retry") continue;
      job.status = "completed";
      job.result = {
        delivery_status: "suppressed",
        suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
        credit_consumed: false,
        settings_version: settingsVersion,
      };
      job.completed_at = now;
      job.updated_at = now;
      job.locked_at = undefined;
      job.locked_by = undefined;
      job.last_error_code = undefined;
      job.last_error_message = undefined;
      suppressed += 1;
    }
    if (suppressed > 0) writeJsonAtomically(queuePath(), store);
    return {
      queued_auto_reply_jobs_suppressed: suppressed,
      processing_auto_reply_jobs_observed: processing,
      credit_consumed: false,
    };
  } finally {
    releaseFileLock(descriptor, queueLockPath());
  }
}

function deleteMerchantAutoReplyJobs(merchantId: string): number {
  if (!fs.existsSync(queuePath())) return 0;
  const descriptor = acquireFileLock(
    queueLockPath(),
    "MERCHANT_SETTINGS_QUEUE_BUSY",
    "automatic reply queue is busy",
  );
  try {
    const store = readQueueStore();
    const previousLength = store.jobs.length;
    store.jobs = store.jobs.filter(
      (job) => durableJobMerchantId(job) !== merchantId,
    );
    const removed = previousLength - store.jobs.length;
    if (removed > 0) writeJsonAtomically(queuePath(), store);
    return removed;
  } finally {
    releaseFileLock(descriptor, queueLockPath());
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
      pricing_mode: "flat",
      fee_iqd: 0,
      free_delivery_threshold_iqd: null,
      estimated_days_min: 1,
      estimated_days_max: 3,
      areas: [],
      area_rates: [],
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
  if (!patchValue || typeof patchValue !== "object" || Array.isArray(patchValue)) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_PATCH_INVALID",
      "settings patch must be an object",
      400,
    );
  }
  const patch = patchValue as Record<string, unknown>;
  assertAllowedKeys(patch, ROOT_PATCH_KEYS, "MERCHANT_SETTINGS_FIELD_UNSUPPORTED");
  if (
    Object.prototype.hasOwnProperty.call(patch, "delivery") &&
    (!patch.delivery ||
      typeof patch.delivery !== "object" ||
      Array.isArray(patch.delivery))
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_PATCH_INVALID",
      "delivery settings patch must be an object",
      400,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "payment") &&
    (!patch.payment ||
      typeof patch.payment !== "object" ||
      Array.isArray(patch.payment))
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_PAYMENT_PATCH_INVALID",
      "payment settings patch must be an object",
      400,
    );
  }
  const deliveryPatch = objectRecord(patch.delivery);
  const paymentPatch = objectRecord(patch.payment);
  assertAllowedKeys(
    deliveryPatch,
    DELIVERY_PATCH_KEYS,
    "MERCHANT_DELIVERY_FIELD_UNSUPPORTED",
  );
  assertAllowedKeys(
    paymentPatch,
    PAYMENT_PATCH_KEYS,
    "MERCHANT_PAYMENT_FIELD_UNSUPPORTED",
  );

  const replyLanguage = text(patch.reply_language);
  if (
    Object.prototype.hasOwnProperty.call(patch, "reply_language") &&
    !REPLY_LANGUAGES.has(replyLanguage as MerchantReplyLanguage)
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_REPLY_LANGUAGE_INVALID",
      "reply language is invalid",
      400,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "auto_reply_enabled") &&
    typeof patch.auto_reply_enabled !== "boolean"
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_AUTO_REPLY_INVALID",
      "automatic reply setting must be boolean",
      400,
    );
  }

  const deliveryEnabled =
    typeof deliveryPatch.enabled === "boolean"
      ? deliveryPatch.enabled
      : current.delivery.enabled;
  if (
    Object.prototype.hasOwnProperty.call(deliveryPatch, "enabled") &&
    typeof deliveryPatch.enabled !== "boolean"
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_ENABLED_INVALID",
      "delivery enabled setting must be boolean",
      400,
    );
  }
  const pricingModeValue = Object.prototype.hasOwnProperty.call(
    deliveryPatch,
    "pricing_mode",
  )
    ? text(deliveryPatch.pricing_mode)
    : current.delivery.pricing_mode;
  if (pricingModeValue !== "flat" && pricingModeValue !== "per_area") {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_PRICING_MODE_INVALID",
      "delivery pricing mode must be flat or per_area",
      400,
    );
  }
  const pricingMode = pricingModeValue as DeliveryPricingMode;
  const deliveryFee = nonNegativeInteger(
    deliveryPatch.fee_iqd,
    current.delivery.fee_iqd,
  );
  const areaRates = normalizedAreaRates(
    current.merchant_id,
    deliveryPatch.area_rates,
    current.delivery.area_rates,
  );
  if (pricingMode === "per_area" && !areaRates.some((rate) => rate.enabled)) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_AREA_RATE_REQUIRED",
      "at least one enabled delivery area rate is required in per-area mode",
      400,
    );
  }
  let freeThreshold = current.delivery.free_delivery_threshold_iqd;
  if (
    Object.prototype.hasOwnProperty.call(
      deliveryPatch,
      "free_delivery_threshold_iqd",
    )
  ) {
    freeThreshold =
      deliveryPatch.free_delivery_threshold_iqd === null ||
      deliveryPatch.free_delivery_threshold_iqd === ""
        ? null
        : nonNegativeInteger(deliveryPatch.free_delivery_threshold_iqd, 0);
  }
  const estimatedMin = positiveInteger(
    deliveryPatch.estimated_days_min,
    current.delivery.estimated_days_min,
    30,
  );
  const estimatedMax = positiveInteger(
    deliveryPatch.estimated_days_max,
    current.delivery.estimated_days_max,
    30,
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
  if (
    Object.prototype.hasOwnProperty.call(
      paymentPatch,
      "cash_on_delivery_enabled",
    ) && typeof paymentPatch.cash_on_delivery_enabled !== "boolean"
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_PAYMENT_ENABLED_INVALID",
      "cash on delivery setting must be boolean",
      400,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(
      paymentPatch,
      "electronic_payment_enabled",
    ) && typeof paymentPatch.electronic_payment_enabled !== "boolean"
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_PAYMENT_ENABLED_INVALID",
      "electronic payment setting must be boolean",
      400,
    );
  }

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
  if (
    electronicEnabled &&
    !methods.some((method) => method !== "cash_on_delivery")
  ) {
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
      pricing_mode: pricingMode,
      fee_iqd: deliveryFee,
      free_delivery_threshold_iqd: freeThreshold,
      estimated_days_min: estimatedMin,
      estimated_days_max: estimatedMax,
      areas:
        pricingMode === "per_area"
          ? []
          : Object.prototype.hasOwnProperty.call(deliveryPatch, "areas")
            ? normalizedStringList(deliveryPatch.areas)
            : [...current.delivery.areas],
      area_rates: areaRates,
      notes: Object.prototype.hasOwnProperty.call(deliveryPatch, "notes")
        ? text(deliveryPatch.notes).slice(0, 1000)
        : current.delivery.notes,
    },
    payment: {
      cash_on_delivery_enabled: cashEnabled,
      electronic_payment_enabled: electronicEnabled,
      methods,
      instructions: Object.prototype.hasOwnProperty.call(
        paymentPatch,
        "instructions",
      )
        ? text(paymentPatch.instructions).slice(0, 2000)
        : current.payment.instructions,
    },
    created_at: current.created_at,
    updated_at: timestamp,
  };
}

export function getMerchantOperationalSettings(
  merchantIdValue: string,
): MerchantOperationalSettings {
  const merchantId = requireMerchantId(merchantIdValue);
  const database = readDatabase();
  const stored = database.settings[merchantId];
  if (stored && stored.merchant_id !== merchantId) {
    throw new MerchantSettingsError(
      "MERCHANT_SETTINGS_TENANT_MISMATCH",
      "merchant settings tenant boundary is invalid",
      503,
    );
  }
  return cloneSettings(
    stored ? hydrateStoredSettings(stored) : defaultSettings(merchantId),
  );
}

export function updateMerchantOperationalSettingsWithEffects(input: {
  merchantId: string;
  expectedVersion: unknown;
  patch: unknown;
}): {
  settings: MerchantOperationalSettings;
  effects: MerchantSettingsEffects;
} {
  const merchantId = requireMerchantId(input.merchantId);
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  return withDatabaseLock((database) => {
    const stored = database.settings[merchantId];
    if (stored && stored.merchant_id !== merchantId) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_TENANT_MISMATCH",
        "merchant settings tenant boundary is invalid",
        503,
      );
    }
    const current = stored
      ? hydrateStoredSettings(stored)
      : defaultSettings(merchantId);
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
    const effects =
      current.auto_reply_enabled && !updated.auto_reply_enabled
        ? suppressQueuedAutoReplyJobs(merchantId, updated.version)
        : {
            queued_auto_reply_jobs_suppressed: 0,
            processing_auto_reply_jobs_observed: 0,
            credit_consumed: false as const,
          };
    database.settings[merchantId] = updated;
    return { settings: cloneSettings(updated), effects };
  });
}

export function updateMerchantOperationalSettings(input: {
  merchantId: string;
  expectedVersion: unknown;
  patch: unknown;
}): MerchantOperationalSettings {
  return updateMerchantOperationalSettingsWithEffects(input).settings;
}

export function merchantAllowsAutoReply(merchantId: string): boolean {
  return getMerchantOperationalSettings(merchantId).auto_reply_enabled;
}

export function getMerchantDeliveryQuote(input: {
  merchantId: string;
  area?: unknown;
  subtotalIqd?: unknown;
}) {
  const settings = getMerchantOperationalSettings(input.merchantId);
  try {
    return resolveDeliveryQuote({
      policy: {
        merchant_id: settings.merchant_id,
        settings_version: settings.version,
        enabled: settings.delivery.enabled,
        pricing_mode: settings.delivery.pricing_mode,
        flat_fee_iqd: settings.delivery.fee_iqd,
        free_delivery_threshold_iqd:
          settings.delivery.free_delivery_threshold_iqd,
        estimated_days_min: settings.delivery.estimated_days_min,
        estimated_days_max: settings.delivery.estimated_days_max,
        areas: settings.delivery.areas,
        area_rates: settings.delivery.area_rates,
      },
      area: input.area,
      subtotal_iqd: input.subtotalIqd ?? 0,
    });
  } catch (error) {
    if (error instanceof DeliveryPricingPolicyError) {
      throw new MerchantSettingsError(
        "MERCHANT_DELIVERY_POLICY_INVALID",
        "merchant delivery pricing policy is invalid",
        503,
        { pricing_code: error.code },
      );
    }
    throw error;
  }
}

registerMerchantRuntimeDeletion((merchantIdValue) => {
  const merchantId = requireMerchantId(merchantIdValue);
  let merchantSettings = 0;
  if (fs.existsSync(settingsPath())) {
    const descriptor = acquireSettingsLock();
    try {
      const database = readDatabase();
      const existed = Object.prototype.hasOwnProperty.call(
        database.settings,
        merchantId,
      );
      delete database.settings[merchantId];
      if (existed) writeJsonAtomically(settingsPath(), database);
      merchantSettings = existed ? 1 : 0;
    } finally {
      releaseFileLock(descriptor, settingsLockPath());
    }
  }
  const autoReplyJobs = deleteMerchantAutoReplyJobs(merchantId);
  return { merchantSettings, autoReplyJobs };
});
