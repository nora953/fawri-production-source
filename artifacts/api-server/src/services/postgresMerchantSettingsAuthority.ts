import crypto from "node:crypto";
import {
  getMerchantDeliveryQuote,
  getMerchantOperationalSettings,
  MerchantSettingsError,
  updateMerchantOperationalSettingsWithEffects,
  type InventoryStalePolicy,
  type MerchantOperationalSettings,
  type MerchantPaymentMethod,
  type MerchantReplyLanguage,
  type MerchantSettingsEffects,
} from "./merchantSettingsRuntime";
import {
  DeliveryPricingPolicyError,
  normalizeDeliveryAreaName,
  resolveDeliveryQuote,
  type DeliveryAreaRate,
  type DeliveryPricingMode,
} from "./deliveryPricing";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

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
const INVENTORY_STALE_POLICIES = new Set<InventoryStalePolicy>([
  "reroute_then_pending",
  "allow_stale",
  "fresh_only",
]);
const ROOT_PATCH_KEYS = new Set([
  "auto_reply_enabled",
  "reply_language",
  "delivery",
  "payment",
  "inventory",
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
const INVENTORY_PATCH_KEYS = new Set([
  "freshness_max_age_minutes",
  "stale_policy",
]);

type SettingsRow = {
  merchant_id: string;
  version: number;
  auto_reply_enabled: boolean;
  reply_language: MerchantReplyLanguage;
  delivery_enabled: boolean;
  delivery_pricing_mode: DeliveryPricingMode;
  delivery_fee_iqd: number;
  free_delivery_threshold_iqd: number | null;
  delivery_estimated_days_min: number;
  delivery_estimated_days_max: number;
  delivery_areas: unknown;
  delivery_notes: string;
  cash_on_delivery_enabled: boolean;
  electronic_payment_enabled: boolean;
  payment_methods: unknown;
  payment_instructions: string;
  inventory_freshness_max_age_minutes: number;
  inventory_stale_policy: InventoryStalePolicy;
  created_at: Date;
  updated_at: Date;
};

type AreaRateRow = {
  id: string;
  area_name: string;
  normalized_area_name: string;
  fee_iqd: number;
  enabled: boolean;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
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
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new MerchantSettingsError(
      code,
      `unsupported settings fields: ${unknown.join(", ")}`,
      400,
    );
  }
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
  maximumItems = 100,
  maximumLength = 100,
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

function paymentMethods(value: unknown): MerchantPaymentMethod[] {
  return normalizedStringList(value, PAYMENT_METHODS.size, 40).map((item) => {
    if (!PAYMENT_METHODS.has(item as MerchantPaymentMethod)) {
      throw new MerchantSettingsError(
        "MERCHANT_PAYMENT_METHOD_INVALID",
        "payment method is invalid",
        400,
      );
    }
    return item as MerchantPaymentMethod;
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

function areaRates(
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
      typeof enabled !== "boolean" ||
      record.fee_iqd === undefined
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

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function rowToSettings(
  row: SettingsRow,
  rates: AreaRateRow[],
): MerchantOperationalSettings {
  const methods = parseStringArray(row.payment_methods).filter((item) =>
    PAYMENT_METHODS.has(item as MerchantPaymentMethod),
  ) as MerchantPaymentMethod[];
  return {
    merchant_id: row.merchant_id,
    version: Number(row.version),
    auto_reply_enabled: row.auto_reply_enabled,
    reply_language: row.reply_language,
    delivery: {
      enabled: row.delivery_enabled,
      pricing_mode: row.delivery_pricing_mode,
      fee_iqd: Number(row.delivery_fee_iqd),
      free_delivery_threshold_iqd:
        row.free_delivery_threshold_iqd === null
          ? null
          : Number(row.free_delivery_threshold_iqd),
      estimated_days_min: Number(row.delivery_estimated_days_min),
      estimated_days_max: Number(row.delivery_estimated_days_max),
      areas: parseStringArray(row.delivery_areas),
      area_rates: rates.map((rate) => ({
        id: rate.id,
        area_name: rate.area_name,
        normalized_area_name: rate.normalized_area_name,
        fee_iqd: Number(rate.fee_iqd),
        enabled: rate.enabled,
      })),
      notes: row.delivery_notes,
    },
    payment: {
      cash_on_delivery_enabled: row.cash_on_delivery_enabled,
      electronic_payment_enabled: row.electronic_payment_enabled,
      methods,
      instructions: row.payment_instructions,
    },
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function loadSettings(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<MerchantOperationalSettings | null> {
  const rows = await operationalQueryRows<SettingsRow>(
    target,
    `SELECT merchant_id, version, auto_reply_enabled, reply_language,
            delivery_enabled, delivery_pricing_mode, delivery_fee_iqd,
            free_delivery_threshold_iqd, delivery_estimated_days_min,
            delivery_estimated_days_max, delivery_areas, delivery_notes,
            cash_on_delivery_enabled, electronic_payment_enabled,
            payment_methods, payment_instructions, created_at, updated_at
       FROM merchant_settings
      WHERE merchant_id = $1${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
  const row = rows[0];
  if (!row) return null;
  const rates = await operationalQueryRows<AreaRateRow>(
    target,
    `SELECT id, area_name, normalized_area_name, fee_iqd, enabled
       FROM merchant_delivery_area_rates
      WHERE merchant_id = $1
      ORDER BY normalized_area_name ASC, id ASC`,
    [merchantId],
  );
  return rowToSettings(row, rates);
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
  assertAllowedKeys(
    patch,
    ROOT_PATCH_KEYS,
    "MERCHANT_SETTINGS_FIELD_UNSUPPORTED",
  );
  const deliveryPatch = objectRecord(patch.delivery);
  const paymentPatch = objectRecord(patch.payment);
  if (
    Object.prototype.hasOwnProperty.call(patch, "delivery") &&
    (!patch.delivery || typeof patch.delivery !== "object" || Array.isArray(patch.delivery))
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_PATCH_INVALID",
      "delivery settings patch must be an object",
      400,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "payment") &&
    (!patch.payment || typeof patch.payment !== "object" || Array.isArray(patch.payment))
  ) {
    throw new MerchantSettingsError(
      "MERCHANT_PAYMENT_PATCH_INVALID",
      "payment settings patch must be an object",
      400,
    );
  }
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

  const replyLanguage = Object.prototype.hasOwnProperty.call(patch, "reply_language")
    ? text(patch.reply_language)
    : current.reply_language;
  if (!REPLY_LANGUAGES.has(replyLanguage as MerchantReplyLanguage)) {
    throw new MerchantSettingsError(
      "MERCHANT_REPLY_LANGUAGE_INVALID",
      "reply language is invalid",
      400,
    );
  }
  const autoReply = Object.prototype.hasOwnProperty.call(patch, "auto_reply_enabled")
    ? patch.auto_reply_enabled
    : current.auto_reply_enabled;
  if (typeof autoReply !== "boolean") {
    throw new MerchantSettingsError(
      "MERCHANT_AUTO_REPLY_INVALID",
      "automatic reply setting must be boolean",
      400,
    );
  }

  const deliveryEnabled = Object.prototype.hasOwnProperty.call(deliveryPatch, "enabled")
    ? deliveryPatch.enabled
    : current.delivery.enabled;
  if (typeof deliveryEnabled !== "boolean") {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_ENABLED_INVALID",
      "delivery enabled setting must be boolean",
      400,
    );
  }
  const pricingMode = Object.prototype.hasOwnProperty.call(deliveryPatch, "pricing_mode")
    ? text(deliveryPatch.pricing_mode)
    : current.delivery.pricing_mode;
  if (pricingMode !== "flat" && pricingMode !== "per_area") {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_PRICING_MODE_INVALID",
      "delivery pricing mode must be flat or per_area",
      400,
    );
  }
  const rates = areaRates(
    current.merchant_id,
    deliveryPatch.area_rates,
    current.delivery.area_rates,
  );
  if (pricingMode === "per_area" && !rates.some((rate) => rate.enabled)) {
    throw new MerchantSettingsError(
      "MERCHANT_DELIVERY_AREA_RATE_REQUIRED",
      "at least one enabled delivery area rate is required in per-area mode",
      400,
    );
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

  const cashEnabled = Object.prototype.hasOwnProperty.call(
    paymentPatch,
    "cash_on_delivery_enabled",
  )
    ? paymentPatch.cash_on_delivery_enabled
    : current.payment.cash_on_delivery_enabled;
  const electronicEnabled = Object.prototype.hasOwnProperty.call(
    paymentPatch,
    "electronic_payment_enabled",
  )
    ? paymentPatch.electronic_payment_enabled
    : current.payment.electronic_payment_enabled;
  if (typeof cashEnabled !== "boolean" || typeof electronicEnabled !== "boolean") {
    throw new MerchantSettingsError(
      "MERCHANT_PAYMENT_ENABLED_INVALID",
      "payment enabled setting must be boolean",
      400,
    );
  }
  let methods = Object.prototype.hasOwnProperty.call(paymentPatch, "methods")
    ? paymentMethods(paymentPatch.methods)
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

  return {
    merchant_id: current.merchant_id,
    version: current.version + 1,
    auto_reply_enabled: autoReply,
    reply_language: replyLanguage as MerchantReplyLanguage,
    delivery: {
      enabled: deliveryEnabled,
      pricing_mode: pricingMode,
      fee_iqd: nonNegativeInteger(
        deliveryPatch.fee_iqd,
        current.delivery.fee_iqd,
      ),
      free_delivery_threshold_iqd: freeThreshold,
      estimated_days_min: estimatedMin,
      estimated_days_max: estimatedMax,
      areas:
        pricingMode === "per_area"
          ? []
          : Object.prototype.hasOwnProperty.call(deliveryPatch, "areas")
            ? normalizedStringList(deliveryPatch.areas)
            : [...current.delivery.areas],
      area_rates: rates,
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
    updated_at: new Date().toISOString(),
  };
}

async function ensureSettingsRow(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  await target.query(
    `INSERT INTO merchant_settings (merchant_id)
     VALUES ($1)
     ON CONFLICT (merchant_id) DO NOTHING`,
    [merchantId],
  );
}

async function suppressQueuedJobs(
  target: OperationalQueryTarget,
  merchantId: string,
  settingsVersion: number,
): Promise<MerchantSettingsEffects> {
  const processing = await operationalQueryRows<{ count: string }>(
    target,
    `SELECT count(*)::text AS count
       FROM background_jobs
      WHERE merchant_id = $1
        AND type = 'meta.webhook.reply'
        AND status = 'processing'`,
    [merchantId],
  );
  const suppressed = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE background_jobs
        SET status = 'completed',
            result = $2::jsonb,
            completed_at = now(),
            updated_at = now(),
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            lease_generation = NULL,
            last_error_code = NULL
      WHERE merchant_id = $1
        AND type = 'meta.webhook.reply'
        AND status IN ('queued', 'retry')
      RETURNING id`,
    [
      merchantId,
      JSON.stringify({
        delivery_status: "suppressed",
        suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
        credit_consumed: false,
        settings_version: settingsVersion,
      }),
    ],
  );
  return {
    queued_auto_reply_jobs_suppressed: suppressed.length,
    processing_auto_reply_jobs_observed: Number(processing[0]?.count || 0),
    credit_consumed: false,
  };
}

export async function getMerchantOperationalSettingsAuthoritative(
  merchantIdValue: string,
): Promise<MerchantOperationalSettings> {
  const merchantId = requireMerchantId(merchantIdValue);
  if (!operationalPostgresAuthorityRequired()) {
    return getMerchantOperationalSettings(merchantId);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    return (await loadSettings(client, merchantId)) || defaultSettings(merchantId);
  });
}

export async function updateMerchantOperationalSettingsAuthoritative(input: {
  merchantId: string;
  expectedVersion: unknown;
  patch: unknown;
}): Promise<{
  settings: MerchantOperationalSettings;
  effects: MerchantSettingsEffects;
}> {
  const merchantId = requireMerchantId(input.merchantId);
  if (!operationalPostgresAuthorityRequired()) {
    return updateMerchantOperationalSettingsWithEffects(input);
  }
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await ensureSettingsRow(client, merchantId);
    const current = await loadSettings(client, merchantId, true);
    if (!current) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_STATE_UNAVAILABLE",
        "merchant settings are unavailable",
        503,
      );
    }
    if (current.version !== expectedVersion) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_VERSION_CONFLICT",
        "merchant settings were changed by another request",
        409,
        {
          expected_version: expectedVersion,
          current_version: current.version,
          current_settings: structuredClone(current),
        },
      );
    }
    const updated = normalizePatch(current, input.patch);
    const result = await operationalQueryRows<SettingsRow>(
      client,
      `UPDATE merchant_settings
          SET version = $3,
              auto_reply_enabled = $4,
              reply_language = $5,
              delivery_enabled = $6,
              delivery_pricing_mode = $7,
              delivery_fee_iqd = $8,
              free_delivery_threshold_iqd = $9,
              delivery_estimated_days_min = $10,
              delivery_estimated_days_max = $11,
              delivery_areas = $12::jsonb,
              delivery_notes = $13,
              cash_on_delivery_enabled = $14,
              electronic_payment_enabled = $15,
              payment_methods = $16::jsonb,
              payment_instructions = $17,
              updated_at = $18
        WHERE merchant_id = $1 AND version = $2
        RETURNING *`,
      [
        merchantId,
        expectedVersion,
        updated.version,
        updated.auto_reply_enabled,
        updated.reply_language,
        updated.delivery.enabled,
        updated.delivery.pricing_mode,
        updated.delivery.fee_iqd,
        updated.delivery.free_delivery_threshold_iqd,
        updated.delivery.estimated_days_min,
        updated.delivery.estimated_days_max,
        JSON.stringify(updated.delivery.areas),
        updated.delivery.notes,
        updated.payment.cash_on_delivery_enabled,
        updated.payment.electronic_payment_enabled,
        JSON.stringify(updated.payment.methods),
        updated.payment.instructions,
        new Date(updated.updated_at),
      ],
    );
    if (result.length !== 1) {
      throw new MerchantSettingsError(
        "MERCHANT_SETTINGS_VERSION_CONFLICT",
        "merchant settings were changed by another request",
        409,
      );
    }

    await client.query(
      "DELETE FROM merchant_delivery_area_rates WHERE merchant_id = $1",
      [merchantId],
    );
    for (const rate of updated.delivery.area_rates) {
      await client.query(
        `INSERT INTO merchant_delivery_area_rates (
           id, merchant_id, area_name, normalized_area_name, fee_iqd, enabled,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          rate.id,
          merchantId,
          rate.area_name,
          rate.normalized_area_name,
          rate.fee_iqd,
          rate.enabled,
          new Date(updated.updated_at),
        ],
      );
    }

    const effects =
      current.auto_reply_enabled && !updated.auto_reply_enabled
        ? await suppressQueuedJobs(client, merchantId, updated.version)
        : {
            queued_auto_reply_jobs_suppressed: 0,
            processing_auto_reply_jobs_observed: 0,
            credit_consumed: false as const,
          };
    return { settings: updated, effects };
  });
}

export async function merchantAllowsAutoReplyAuthoritative(
  merchantId: string,
): Promise<boolean> {
  return (await getMerchantOperationalSettingsAuthoritative(merchantId))
    .auto_reply_enabled;
}

export async function getMerchantDeliveryQuoteAuthoritative(input: {
  merchantId: string;
  area?: unknown;
  subtotalIqd?: unknown;
}) {
  if (!operationalPostgresAuthorityRequired()) {
    return getMerchantDeliveryQuote(input);
  }
  const settings = await getMerchantOperationalSettingsAuthoritative(
    input.merchantId,
  );
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
