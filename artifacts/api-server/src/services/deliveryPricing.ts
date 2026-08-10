export type DeliveryPricingMode = "flat" | "per_area";

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
