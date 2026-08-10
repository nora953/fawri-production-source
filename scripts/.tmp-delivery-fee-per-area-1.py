#!/usr/bin/env python3
from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content):
    path = p(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{rel}: expected at least {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

# Capture exact 0004 boundary before touching schema files.
stage = p("lib/db/migration-stages/0005")
(stage / "preimage").mkdir(parents=True, exist_ok=True)
for name in ["merchant-settings.ts", "tenant-security.ts"]:
    shutil.copy2(p(f"lib/db/src/schema/{name}"), stage / "preimage" / name)
write("lib/db/migration-stages/0005/stage.json", json.dumps({
    "index": 5,
    "name": "delivery_fee_per_area",
    "when": 1786393740000,
    "preimage_files": ["merchant-settings.ts", "tenant-security.ts"],
}, indent=2) + "\n")

write("artifacts/api-server/src/services/deliveryPricing.ts", r'''export type DeliveryPricingMode = "flat" | "per_area";

export type DeliveryAreaRate = {
  id: string;
  area_name: string;
  normalized_area_name: string;
  fee_iqd: number;
  enabled: boolean;
};

export type DeliveryPricingPolicy = {
  merchant_id: string;
  settings_version: number;
  enabled: boolean;
  pricing_mode: DeliveryPricingMode;
  flat_fee_iqd: number;
  free_delivery_threshold_iqd: number | null;
  estimated_days_min: number;
  estimated_days_max: number;
  areas: string[];
  area_rates: DeliveryAreaRate[];
};

export type DeliveryQuoteReason =
  | "delivery_disabled"
  | "area_required"
  | "area_unavailable"
  | "area_ambiguous";

export type DeliveryQuote = {
  merchant_id: string;
  settings_version: number;
  pricing_mode: DeliveryPricingMode;
  available: boolean;
  reason?: DeliveryQuoteReason;
  requested_area: string;
  matched_area?: string;
  area_rate_id?: string;
  base_fee_iqd: number;
  effective_fee_iqd: number;
  free_delivery_applied: boolean;
  free_delivery_threshold_iqd: number | null;
  subtotal_iqd: number;
  total_iqd: number;
  estimated_days_min: number;
  estimated_days_max: number;
};

export class DeliveryPricingPolicyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DeliveryPricingPolicyError";
    this.code = code;
  }
}

const MAX_FEE_IQD = 100_000_000;

export function normalizeDeliveryAreaName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ـًٌٍَُِّْ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[کكگ]/g, "ك")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_AREA_WORDS = new Set(
  [
    "توصيل",
    "التوصيل",
    "شحن",
    "الشحن",
    "يوصل",
    "توصلون",
    "كم",
    "شكد",
    "شگد",
    "سعر",
    "رسوم",
    "اجره",
    "أجرة",
    "للبيت",
    "delivery",
    "shipping",
    "fee",
    "cost",
    "گەیاندن",
    "گواستنەوە",
    "نرخ",
  ].map((value) => normalizeDeliveryAreaName(value)),
);

function integer(
  value: unknown,
  label: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new DeliveryPricingPolicyError(
      "DELIVERY_PRICING_POLICY_INVALID",
      `${label} is invalid`,
    );
  }
  return parsed;
}

function validatePolicy(policy: DeliveryPricingPolicy): DeliveryPricingPolicy {
  if (
    !policy.merchant_id ||
    !Number.isInteger(policy.settings_version) ||
    policy.settings_version <= 0
  ) {
    throw new DeliveryPricingPolicyError(
      "DELIVERY_PRICING_POLICY_INVALID",
      "delivery policy identity is invalid",
    );
  }
  if (policy.pricing_mode !== "flat" && policy.pricing_mode !== "per_area") {
    throw new DeliveryPricingPolicyError(
      "DELIVERY_PRICING_POLICY_INVALID",
      "delivery pricing mode is invalid",
    );
  }
  integer(policy.flat_fee_iqd, "flat fee", { max: MAX_FEE_IQD });
  if (policy.free_delivery_threshold_iqd !== null) {
    integer(policy.free_delivery_threshold_iqd, "free delivery threshold", {
      max: MAX_FEE_IQD,
    });
  }
  integer(policy.estimated_days_min, "minimum delivery days", {
    min: 1,
    max: 30,
  });
  integer(policy.estimated_days_max, "maximum delivery days", {
    min: policy.estimated_days_min,
    max: 30,
  });

  const seen = new Set<string>();
  for (const rate of policy.area_rates) {
    const normalized = normalizeDeliveryAreaName(rate.area_name);
    if (
      !rate.id ||
      !rate.area_name ||
      normalized.length < 1 ||
      normalized.length > 100 ||
      rate.normalized_area_name !== normalized ||
      typeof rate.enabled !== "boolean"
    ) {
      throw new DeliveryPricingPolicyError(
        "DELIVERY_PRICING_POLICY_INVALID",
        "delivery area rate is invalid",
      );
    }
    integer(rate.fee_iqd, "area fee", { max: MAX_FEE_IQD });
    if (seen.has(normalized)) {
      throw new DeliveryPricingPolicyError(
        "DELIVERY_PRICING_POLICY_INVALID",
        "delivery area rate is duplicated",
      );
    }
    seen.add(normalized);
  }
  if (
    policy.pricing_mode === "per_area" &&
    !policy.area_rates.some((rate) => rate.enabled)
  ) {
    throw new DeliveryPricingPolicyError(
      "DELIVERY_PRICING_POLICY_INVALID",
      "per-area delivery has no enabled rates",
    );
  }
  return policy;
}

function normalizedQueryCandidates(value: string): Set<string> {
  const normalized = normalizeDeliveryAreaName(value);
  const result = new Set<string>(normalized ? [normalized] : []);
  for (const word of normalized.split(" ").filter(Boolean)) {
    result.add(word);
    if (word.startsWith("لل") && word.length > 3) {
      result.add(`ال${word.slice(2)}`);
      result.add(word.slice(1));
    }
    if (word.startsWith("بال") && word.length > 4) {
      result.add(`ال${word.slice(3)}`);
    }
  }
  return result;
}

function phraseContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `) || haystack.includes(needle);
}

function meaningfulAreaHint(value: string): boolean {
  return normalizeDeliveryAreaName(value)
    .split(" ")
    .filter(Boolean)
    .some((word) => !GENERIC_AREA_WORDS.has(word) && word.length >= 2);
}

function matchAreaRate(policy: DeliveryPricingPolicy, requestedArea: string) {
  const active = policy.area_rates.filter((rate) => rate.enabled);
  const candidates = normalizedQueryCandidates(requestedArea);
  const exact = active.filter((rate) => candidates.has(rate.normalized_area_name));
  if (exact.length === 1) return { rate: exact[0], ambiguous: false };
  if (exact.length > 1) return { rate: undefined, ambiguous: true };

  const normalizedRequest = normalizeDeliveryAreaName(requestedArea);
  const contained = active.filter(
    (rate) =>
      [...candidates].some(
        (candidate) =>
          phraseContains(candidate, rate.normalized_area_name) ||
          phraseContains(rate.normalized_area_name, candidate),
      ) || phraseContains(normalizedRequest, rate.normalized_area_name),
  );
  if (contained.length === 1) return { rate: contained[0], ambiguous: false };
  if (contained.length > 1) return { rate: undefined, ambiguous: true };
  return { rate: undefined, ambiguous: false };
}

export function resolveDeliveryQuote(input: {
  policy: DeliveryPricingPolicy;
  area?: unknown;
  subtotal_iqd?: unknown;
}): DeliveryQuote {
  const policy = validatePolicy(input.policy);
  const requestedArea = String(input.area ?? "").trim().slice(0, 500);
  const subtotal = integer(input.subtotal_iqd ?? 0, "subtotal", {
    max: 2_000_000_000,
  });
  const base = {
    merchant_id: policy.merchant_id,
    settings_version: policy.settings_version,
    pricing_mode: policy.pricing_mode,
    requested_area: requestedArea,
    free_delivery_threshold_iqd: policy.free_delivery_threshold_iqd,
    subtotal_iqd: subtotal,
    estimated_days_min: policy.estimated_days_min,
    estimated_days_max: policy.estimated_days_max,
  };

  if (!policy.enabled) {
    return {
      ...base,
      available: false,
      reason: "delivery_disabled",
      base_fee_iqd: 0,
      effective_fee_iqd: 0,
      free_delivery_applied: false,
      total_iqd: subtotal,
    };
  }

  let baseFee = policy.flat_fee_iqd;
  let matchedArea: string | undefined;
  let areaRateId: string | undefined;
  if (policy.pricing_mode === "per_area") {
    if (!requestedArea || !meaningfulAreaHint(requestedArea)) {
      return {
        ...base,
        available: false,
        reason: "area_required",
        base_fee_iqd: 0,
        effective_fee_iqd: 0,
        free_delivery_applied: false,
        total_iqd: subtotal,
      };
    }
    const match = matchAreaRate(policy, requestedArea);
    if (match.ambiguous) {
      return {
        ...base,
        available: false,
        reason: "area_ambiguous",
        base_fee_iqd: 0,
        effective_fee_iqd: 0,
        free_delivery_applied: false,
        total_iqd: subtotal,
      };
    }
    if (!match.rate) {
      return {
        ...base,
        available: false,
        reason: "area_unavailable",
        base_fee_iqd: 0,
        effective_fee_iqd: 0,
        free_delivery_applied: false,
        total_iqd: subtotal,
      };
    }
    baseFee = match.rate.fee_iqd;
    matchedArea = match.rate.area_name;
    areaRateId = match.rate.id;
  }

  const freeApplied =
    policy.free_delivery_threshold_iqd !== null &&
    subtotal >= policy.free_delivery_threshold_iqd;
  const effectiveFee = freeApplied ? 0 : baseFee;
  return {
    ...base,
    available: true,
    ...(matchedArea ? { matched_area: matchedArea } : {}),
    ...(areaRateId ? { area_rate_id: areaRateId } : {}),
    base_fee_iqd: baseFee,
    effective_fee_iqd: effectiveFee,
    free_delivery_applied: freeApplied,
    total_iqd: subtotal + effectiveFee,
  };
}

export type DeliveryLanguage = "ar" | "ku" | "en";

export function formatDeliveryQuoteText(
  quote: DeliveryQuote,
  language: DeliveryLanguage,
): string {
  if (!quote.available) {
    if (quote.reason === "delivery_disabled") {
      if (language === "en") return "Delivery is currently unavailable.";
      if (language === "ku") return "گەیاندن لە ئێستادا بەردەست نییە.";
      return "التوصيل غير متاح حاليًا.";
    }
    if (quote.reason === "area_ambiguous") {
      if (language === "en") return "Please specify the delivery area more precisely.";
      if (language === "ku") return "تکایە ناوچەی گەیاندن بە وردی دیاری بکە.";
      return "يرجى تحديد منطقة التوصيل بصورة أدق.";
    }
    if (quote.reason === "area_unavailable") {
      if (language === "en") return "That area is not currently covered for delivery. Please provide another area.";
      if (language === "ku") return "ئەم ناوچەیە لە ئێستادا لە گەیاندن نییە. تکایە ناوچەیەکی تر بنێرە.";
      return "هذه المنطقة غير مشمولة بالتوصيل حاليًا. يرجى إرسال منطقة أخرى.";
    }
    if (language === "en") return "Please send your area so I can give you the delivery fee.";
    if (language === "ku") return "تکایە ناوچەکەت بنێرە تا کرێی گەیاندنت پێ بڵێم.";
    return "يرجى إرسال منطقتك حتى أعطيك أجرة التوصيل.";
  }

  const fee = quote.effective_fee_iqd.toLocaleString("en-US");
  const days =
    quote.estimated_days_min === quote.estimated_days_max
      ? String(quote.estimated_days_min)
      : `${quote.estimated_days_min}-${quote.estimated_days_max}`;
  const area = quote.matched_area ? ` ${quote.matched_area}` : "";
  const threshold = quote.free_delivery_threshold_iqd;
  if (language === "en") {
    const free = quote.free_delivery_applied
      ? " Free delivery applies to this subtotal."
      : threshold !== null
        ? ` Delivery is free from ${threshold.toLocaleString("en-US")} IQD.`
        : "";
    return `Delivery${area ? ` to${area}` : ""} is ${fee} IQD. Estimated time is ${days} day(s).${free}`;
  }
  if (language === "ku") {
    const free = quote.free_delivery_applied
      ? " گەیاندن بۆ ئەم کۆیە بەخۆڕاییە."
      : threshold !== null
        ? ` گەیاندن لە ${threshold.toLocaleString("en-US")} دینارەوە بەخۆڕاییە.`
        : "";
    return `کرێی گەیاندن${area ? ` بۆ${area}` : ""} ${fee} دینارە. ماوەی خەمڵێنراو ${days} ڕۆژە.${free}`;
  }
  const free = quote.free_delivery_applied
    ? " التوصيل مجاني لهذا المجموع."
    : threshold !== null
      ? ` التوصيل مجاني ابتداءً من ${threshold.toLocaleString("en-US")} دينار.`
      : "";
  return `أجرة التوصيل${area ? ` إلى${area}` : ""} ${fee} دينار. المدة التقديرية ${days} يوم.${free}`;
}
''')

# Runtime delivery contract.
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { registerMerchantRuntimeDeletion } from "./merchantRuntime";''',
'''import crypto from "node:crypto";
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
import { registerMerchantRuntimeDeletion } from "./merchantRuntime";''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''  delivery: {
    enabled: boolean;
    fee_iqd: number;
    free_delivery_threshold_iqd: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    areas: string[];
    notes: string;
  };''',
'''  delivery: {
    enabled: boolean;
    pricing_mode: DeliveryPricingMode;
    fee_iqd: number;
    free_delivery_threshold_iqd: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    areas: string[];
    area_rates: DeliveryAreaRate[];
    notes: string;
  };''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''  "enabled",
  "fee_iqd",
  "free_delivery_threshold_iqd",
  "estimated_days_min",
  "estimated_days_max",
  "areas",
  "notes",''',
'''  "enabled",
  "pricing_mode",
  "fee_iqd",
  "free_delivery_threshold_iqd",
  "estimated_days_min",
  "estimated_days_max",
  "areas",
  "area_rates",
  "notes",''')
anchor = '''function normalizedPaymentMethods(value: unknown): MerchantPaymentMethod[] {
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
'''
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts", anchor, anchor + r'''
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
''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''    delivery: {
      enabled: true,
      fee_iqd: 0,
      free_delivery_threshold_iqd: null,
      estimated_days_min: 1,
      estimated_days_max: 3,
      areas: [],
      notes: "",
    },''',
'''    delivery: {
      enabled: true,
      pricing_mode: "flat",
      fee_iqd: 0,
      free_delivery_threshold_iqd: null,
      estimated_days_min: 1,
      estimated_days_max: 3,
      areas: [],
      area_rates: [],
      notes: "",
    },''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''  const deliveryFee = nonNegativeInteger(
    deliveryPatch.fee_iqd,
    current.delivery.fee_iqd,
  );''',
'''  const pricingModeValue = Object.prototype.hasOwnProperty.call(
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
  }''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''  const estimatedMin = positiveInteger(
    deliveryPatch.estimated_days_min,
    current.delivery.estimated_days_min,
  );
  const estimatedMax = positiveInteger(
    deliveryPatch.estimated_days_max,
    current.delivery.estimated_days_max,
  );''',
'''  const estimatedMin = positiveInteger(
    deliveryPatch.estimated_days_min,
    current.delivery.estimated_days_min,
    30,
  );
  const estimatedMax = positiveInteger(
    deliveryPatch.estimated_days_max,
    current.delivery.estimated_days_max,
    30,
  );''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''    delivery: {
      enabled: deliveryEnabled,
      fee_iqd: deliveryFee,
      free_delivery_threshold_iqd: freeThreshold,
      estimated_days_min: estimatedMin,
      estimated_days_max: estimatedMax,
      areas: Object.prototype.hasOwnProperty.call(deliveryPatch, "areas")
        ? normalizedStringList(deliveryPatch.areas)
        : [...current.delivery.areas],
      notes: Object.prototype.hasOwnProperty.call(deliveryPatch, "notes")''',
'''    delivery: {
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
      notes: Object.prototype.hasOwnProperty.call(deliveryPatch, "notes")''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''  return cloneSettings(stored || defaultSettings(merchantId));''',
'''  return cloneSettings(
    stored ? hydrateStoredSettings(stored) : defaultSettings(merchantId),
  );''')
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts",
'''    const current = stored || defaultSettings(merchantId);''',
'''    const current = stored
      ? hydrateStoredSettings(stored)
      : defaultSettings(merchantId);''')
anchor = '''export function merchantAllowsAutoReply(merchantId: string): boolean {
  return getMerchantOperationalSettings(merchantId).auto_reply_enabled;
}
'''
replace("artifacts/api-server/src/services/merchantSettingsRuntime.ts", anchor, anchor + r'''
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
''')

# PostgreSQL schema and tenant RLS.
replace("lib/db/src/schema/merchant-settings.ts",
'''  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,''',
'''  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,''')
replace("lib/db/src/schema/merchant-settings.ts",
'''export const merchantReplyLanguageEnum = pgEnum("merchant_reply_language", [
  "auto",
  "ar",
  "ku",
  "en",
]);
''',
'''export const merchantReplyLanguageEnum = pgEnum("merchant_reply_language", [
  "auto",
  "ar",
  "ku",
  "en",
]);

export const deliveryPricingModeEnum = pgEnum("delivery_pricing_mode", [
  "flat",
  "per_area",
]);
''')
replace("lib/db/src/schema/merchant-settings.ts",
'''    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    deliveryFeeIqd: integer("delivery_fee_iqd").notNull().default(0),''',
'''    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    deliveryPricingMode: deliveryPricingModeEnum("delivery_pricing_mode")
      .notNull()
      .default("flat"),
    deliveryFeeIqd: integer("delivery_fee_iqd").notNull().default(0),''')
replace("lib/db/src/schema/merchant-settings.ts",
'''export type MerchantSettings = typeof merchantSettings.$inferSelect;
export type NewMerchantSettings = typeof merchantSettings.$inferInsert;''',
r'''export const merchantDeliveryAreaRates = pgTable(
  "merchant_delivery_area_rates",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    areaName: text("area_name").notNull(),
    normalizedAreaName: text("normalized_area_name").notNull(),
    feeIqd: integer("fee_iqd").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantAreaUnique: uniqueIndex(
      "merchant_delivery_area_rates_merchant_area_unique",
    ).on(table.merchantId, table.normalizedAreaName),
    merchantEnabledIndex: index(
      "merchant_delivery_area_rates_merchant_enabled_idx",
    ).on(table.merchantId, table.enabled),
    feeCheck: check(
      "merchant_delivery_area_rates_fee_check",
      sql`${table.feeIqd} >= 0 AND ${table.feeIqd} <= 100000000`,
    ),
    areaNameCheck: check(
      "merchant_delivery_area_rates_area_name_check",
      sql`char_length(${table.areaName}) BETWEEN 1 AND 100 AND char_length(${table.normalizedAreaName}) BETWEEN 1 AND 100`,
    ),
    timestampOrderCheck: check(
      "merchant_delivery_area_rates_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type MerchantSettings = typeof merchantSettings.$inferSelect;
export type NewMerchantSettings = typeof merchantSettings.$inferInsert;
export type MerchantDeliveryAreaRate =
  typeof merchantDeliveryAreaRates.$inferSelect;
export type NewMerchantDeliveryAreaRate =
  typeof merchantDeliveryAreaRates.$inferInsert;''')
replace("lib/db/src/schema/tenant-security.ts",
'''import { merchantSettings } from "./merchant-settings";''',
'''import {
  merchantDeliveryAreaRates,
  merchantSettings,
} from "./merchant-settings";''')
replace("lib/db/src/schema/tenant-security.ts",
'''export const merchantSettingsTenantPolicy = tenantPolicy("merchant_settings_tenant_boundary", merchantSettings);''',
'''export const merchantSettingsTenantPolicy = tenantPolicy("merchant_settings_tenant_boundary", merchantSettings);
export const merchantDeliveryAreaRatesTenantPolicy = tenantPolicy(
  "merchant_delivery_area_rates_tenant_boundary",
  merchantDeliveryAreaRates,
);''')

print("patch 1 complete")
