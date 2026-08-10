#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content):
    path = p(rel); path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel); actual = text.count(old)
    if actual < count: raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

# Migration planner maps runtime per-area settings into normalized PostgreSQL rows.
replace("scripts/lib/postgresql-migration-plan-complete.mjs",
'''  order_drafts: "runtime",
  saved_answers: "savedAnswers",''',
'''  order_drafts: "runtime",
  merchant_delivery_area_rates: "merchantSettings",
  saved_answers: "savedAnswers",''')
replace("scripts/lib/postgresql-migration-plan-complete.mjs",
'''function text(value) {
  return String(value ?? "").trim();
}
''',
'''function text(value) {
  return String(value ?? "").trim();
}

function normalizeDeliveryAreaName(value) {
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
    .replace(/[^\\p{L}\\p{N}\\s-]/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}
''')
old_apply = '''function applyMerchantSettings(report, source) {
  for (const [merchantId, settingsValue] of Object.entries(
    asRecord(source.value?.settings),
  )) {
    const settings = asRecord(settingsValue);
    const delivery = asRecord(settings.delivery);
    const payment = asRecord(settings.payment);
    const row = {
      merchant_id: merchantId,
      version: Number(settings.version),
      auto_reply_enabled: settings.auto_reply_enabled === true,
      reply_language: text(settings.reply_language) || "auto",
      delivery_enabled: delivery.enabled === true,
      delivery_fee_iqd: Number(delivery.fee_iqd || 0),
      free_delivery_threshold_iqd:
        delivery.free_delivery_threshold_iqd === null ||
        delivery.free_delivery_threshold_iqd === undefined
          ? null
          : Number(delivery.free_delivery_threshold_iqd),
      delivery_estimated_days_min: Number(delivery.estimated_days_min),
      delivery_estimated_days_max: Number(delivery.estimated_days_max),
      delivery_areas: asArray(delivery.areas),
      delivery_notes: String(delivery.notes ?? ""),
      cash_on_delivery_enabled: payment.cash_on_delivery_enabled === true,
      electronic_payment_enabled: payment.electronic_payment_enabled === true,
      payment_methods: asArray(payment.methods),
      payment_instructions: String(payment.instructions ?? ""),
      created_at: settings.created_at || null,
      updated_at: settings.updated_at || settings.created_at || null,
    };
    mergeRow(report, "merchant_settings", row, "merchantSettings", settings);
  }
}
'''
new_apply = '''function applyMerchantSettings(report, source) {
  for (const [merchantId, settingsValue] of Object.entries(
    asRecord(source.value?.settings),
  )) {
    const settings = asRecord(settingsValue);
    const delivery = asRecord(settings.delivery);
    const payment = asRecord(settings.payment);
    const pricingMode = delivery.pricing_mode === "per_area" ? "per_area" : "flat";
    const row = {
      merchant_id: merchantId,
      version: Number(settings.version),
      auto_reply_enabled: settings.auto_reply_enabled === true,
      reply_language: text(settings.reply_language) || "auto",
      delivery_enabled: delivery.enabled === true,
      delivery_pricing_mode: pricingMode,
      delivery_fee_iqd: Number(delivery.fee_iqd || 0),
      free_delivery_threshold_iqd:
        delivery.free_delivery_threshold_iqd === null ||
        delivery.free_delivery_threshold_iqd === undefined
          ? null
          : Number(delivery.free_delivery_threshold_iqd),
      delivery_estimated_days_min: Number(delivery.estimated_days_min),
      delivery_estimated_days_max: Number(delivery.estimated_days_max),
      delivery_areas: pricingMode === "per_area" ? [] : asArray(delivery.areas),
      delivery_notes: String(delivery.notes ?? ""),
      cash_on_delivery_enabled: payment.cash_on_delivery_enabled === true,
      electronic_payment_enabled: payment.electronic_payment_enabled === true,
      payment_methods: asArray(payment.methods),
      payment_instructions: String(payment.instructions ?? ""),
      created_at: settings.created_at || null,
      updated_at: settings.updated_at || settings.created_at || null,
    };
    mergeRow(report, "merchant_settings", row, "merchantSettings", settings);

    for (const [index, rateValue] of asArray(delivery.area_rates).entries()) {
      const rate = asRecord(rateValue);
      const areaName = text(rate.area_name);
      const normalizedArea = normalizeDeliveryAreaName(areaName);
      if (!areaName || !normalizedArea) continue;
      mergeRow(
        report,
        "merchant_delivery_area_rates",
        {
          id: text(rate.id) || stableId("delivery-area", `${merchantId}:${normalizedArea}`),
          merchant_id: merchantId,
          area_name: areaName,
          normalized_area_name: normalizedArea,
          fee_iqd: Number(rate.fee_iqd || 0),
          enabled: rate.enabled !== false,
          created_at: settings.created_at || null,
          updated_at: settings.updated_at || settings.created_at || null,
        },
        "merchantSettings",
        { index, ...rate },
      );
    }
  }
}
'''
replace("scripts/lib/postgresql-migration-plan-complete.mjs", old_apply, new_apply)

# Cross-lane reconciliation validates the child authority and avoids Knowledge normalization drift.
replace("scripts/lib/postgresql-cross-lane-reconciliation.mjs",
'''function reconcileSettings(report) {
  for (const row of asArray(report.rows.merchant_settings)) {''',
'''function normalizeDeliveryAreaName(value) {
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
    .replace(/[^\\p{L}\\p{N}\\s-]/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function reconcileSettings(report) {
  const settingsByMerchant = new Map(
    asArray(report.rows.merchant_settings).map((row) => [String(row.merchant_id), row]),
  );
  const enabledRates = new Map();
  const normalizedKeys = new Set();
  for (const rate of asArray(report.rows.merchant_delivery_area_rates)) {
    const merchantId = String(rate.merchant_id || "");
    const settings = settingsByMerchant.get(merchantId);
    const normalized = normalizeDeliveryAreaName(rate.area_name);
    if (!settings) {
      addError(report, "MERCHANT_DELIVERY_AREA_RATE_SETTINGS_MISSING", {
        merchant_id: merchantId,
        rate_id: rate.id,
      });
      continue;
    }
    if (
      !rate.id ||
      !normalized ||
      normalized !== String(rate.normalized_area_name || "") ||
      normalized.length > 100 ||
      !Number.isInteger(Number(rate.fee_iqd)) ||
      Number(rate.fee_iqd) < 0 ||
      Number(rate.fee_iqd) > 100000000 ||
      typeof rate.enabled !== "boolean"
    ) {
      addError(report, "MERCHANT_DELIVERY_AREA_RATE_INVALID", {
        merchant_id: merchantId,
        rate_id: rate.id || null,
      });
    }
    const key = `${merchantId}:${normalized}`;
    if (normalizedKeys.has(key)) {
      addError(report, "MERCHANT_DELIVERY_AREA_RATE_DUPLICATE", {
        merchant_id: merchantId,
        normalized_area_name: normalized,
      });
    }
    normalizedKeys.add(key);
    if (rate.enabled === true) {
      enabledRates.set(merchantId, (enabledRates.get(merchantId) || 0) + 1);
    }
  }

  for (const row of asArray(report.rows.merchant_settings)) {''')
replace("scripts/lib/postgresql-cross-lane-reconciliation.mjs",
'''    row.version = positiveInteger(row.version, 1);
    const methods = asArray(row.payment_methods);''',
'''    row.version = positiveInteger(row.version, 1);
    row.delivery_pricing_mode =
      row.delivery_pricing_mode === "per_area" ? "per_area" : "flat";
    if (
      row.delivery_pricing_mode === "per_area" &&
      (enabledRates.get(String(row.merchant_id)) || 0) === 0
    ) {
      addError(report, "MERCHANT_DELIVERY_AREA_RATE_REQUIRED", {
        merchant_id: row.merchant_id,
      });
    }
    if (
      row.delivery_pricing_mode === "per_area" &&
      asArray(row.delivery_areas).length > 0
    ) {
      addError(report, "MERCHANT_DELIVERY_DUAL_AREA_AUTHORITY", {
        merchant_id: row.merchant_id,
      });
    }
    const methods = asArray(row.payment_methods);''')

# Read-only audit supports flat legacy settings and validates per-area rows.
replace("scripts/audit-merchant-settings.mjs",
'''const REPLY_JOB_TYPE = "meta.webhook.reply";
''',
'''const REPLY_JOB_TYPE = "meta.webhook.reply";
const DELIVERY_PRICING_MODES = new Set(["flat", "per_area"]);

function normalizeDeliveryAreaName(value) {
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
    .replace(/[^\\p{L}\\p{N}\\s-]/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}
''')
replace("scripts/audit-merchant-settings.mjs",
'''  if (jobsSource.exists && jobsSource.value?.version !== 1) {''',
'''  if (
    jobsSource.exists &&
    ![1, 2].includes(Number(jobsSource.value?.version))
  ) {''')
replace("scripts/audit-merchant-settings.mjs",
'''    const delivery = asRecord(settings.delivery);
    const minDays = Number(delivery.estimated_days_min);''',
'''    const delivery = asRecord(settings.delivery);
    const pricingMode =
      delivery.pricing_mode === undefined ? "flat" : text(delivery.pricing_mode);
    if (!DELIVERY_PRICING_MODES.has(pricingMode)) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_PRICING_MODE_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    const minDays = Number(delivery.estimated_days_min);''')
old = '''    const areas = normalizedUniqueStrings(delivery.areas);
    if (
      areas.length !== asArray(delivery.areas).length ||
      new Set(areas).size !== areas.length ||
      areas.some((area) => area.length > 100) ||
      text(delivery.notes).length > 1000
    ) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_CONTENT_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
'''
new = '''    const areas = normalizedUniqueStrings(delivery.areas);
    if (
      areas.length !== asArray(delivery.areas).length ||
      new Set(areas).size !== areas.length ||
      areas.some((area) => area.length > 100) ||
      text(delivery.notes).length > 1000 ||
      (pricingMode === "per_area" && areas.length > 0)
    ) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_CONTENT_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }

    const rateKeys = new Set();
    let enabledRateCount = 0;
    const areaRates = asArray(delivery.area_rates);
    if (areaRates.length > 100) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_AREA_RATES_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    for (const rawRate of areaRates) {
      const rate = asRecord(rawRate);
      const areaName = text(rate.area_name);
      const normalized = normalizeDeliveryAreaName(areaName);
      if (
        !text(rate.id) ||
        !areaName ||
        areaName.length > 100 ||
        normalized !== text(rate.normalized_area_name) ||
        !nonNegativeInteger(rate.fee_iqd) ||
        typeof rate.enabled !== "boolean"
      ) {
        issues.push(
          issue("error", "MERCHANT_SETTINGS_DELIVERY_AREA_RATE_INVALID", {
            merchant_id: merchantId,
            rate_id: text(rate.id) || null,
          }),
        );
      }
      if (rateKeys.has(normalized)) {
        issues.push(
          issue("error", "MERCHANT_SETTINGS_DELIVERY_AREA_RATE_DUPLICATE", {
            merchant_id: merchantId,
            normalized_area_name: normalized,
          }),
        );
      }
      rateKeys.add(normalized);
      if (rate.enabled === true) enabledRateCount += 1;
    }
    if (pricingMode === "per_area" && enabledRateCount === 0) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_AREA_RATE_REQUIRED", {
          merchant_id: merchantId,
        }),
      );
    }
'''
replace("scripts/audit-merchant-settings.mjs", old, new)

# PostgreSQL Knowledge delivery facts use the same quote algorithm.
replace("artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver.ts",
'''import {
  boundedText,
  normalizeKnowledgeText,
} from "./normalization.js";''',
'''import {
  DeliveryPricingPolicyError,
  formatDeliveryQuoteText,
  normalizeDeliveryAreaName,
  resolveDeliveryQuote,
  type DeliveryAreaRate,
} from "../deliveryPricing.js";
import {
  boundedText,
  normalizeKnowledgeText,
} from "./normalization.js";''')
source = read("artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver.ts")
start = source.index("function localizedDelivery(")
end = source.index("\nfunction localizedPayment", start)
helper = r'''async function resolveDeliveryFact(params: {
  sql: KnowledgeSqlExecutor;
  merchantId: string;
  customerText: string;
  language: KnowledgeLanguage;
  row: Record<string, unknown>;
}) {
  let areaRows: Record<string, unknown>[] = [];
  const pricingMode = text(params.row.delivery_pricing_mode, 40);
  if (pricingMode !== "flat" && pricingMode !== "per_area") {
    fail("KNOWLEDGE_POLICY_INVALID", "merchant delivery pricing mode is invalid");
  }
  if (pricingMode === "per_area") {
    try {
      areaRows = (
        await params.sql.query(
          `SELECT id, merchant_id, area_name, normalized_area_name, fee_iqd, enabled
           FROM merchant_delivery_area_rates
           WHERE merchant_id = $1 AND enabled = TRUE
           ORDER BY normalized_area_name
           LIMIT 100`,
          [params.merchantId],
        )
      ).rows;
    } catch {
      fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
    }
  }
  const areaRates: DeliveryAreaRate[] = areaRows.map((areaRow) => {
    tenant(areaRow, params.merchantId);
    const id = text(areaRow.id, 200);
    const areaName = text(areaRow.area_name, 100);
    const normalized = text(areaRow.normalized_area_name, 100);
    const fee = integer(areaRow.fee_iqd);
    const enabled = bool(areaRow.enabled);
    if (
      !id ||
      !areaName ||
      normalized !== normalizeDeliveryAreaName(areaName) ||
      fee > 100_000_000
    ) {
      fail("KNOWLEDGE_POLICY_INVALID", "merchant delivery area policy is invalid");
    }
    return {
      id,
      area_name: areaName,
      normalized_area_name: normalized,
      fee_iqd: fee,
      enabled,
    };
  });

  const freeThreshold =
    params.row.free_delivery_threshold_iqd === null ||
    params.row.free_delivery_threshold_iqd === undefined
      ? null
      : integer(params.row.free_delivery_threshold_iqd);
  try {
    const quote = resolveDeliveryQuote({
      policy: {
        merchant_id: params.merchantId,
        settings_version: version(params.row.settings_version),
        enabled: bool(params.row.delivery_enabled),
        pricing_mode: pricingMode,
        flat_fee_iqd: integer(params.row.delivery_fee_iqd),
        free_delivery_threshold_iqd: freeThreshold,
        estimated_days_min: integer(params.row.delivery_estimated_days_min),
        estimated_days_max: integer(params.row.delivery_estimated_days_max),
        areas: stringArray(params.row.delivery_areas, 100),
        area_rates: areaRates,
      },
      area: params.customerText,
      subtotal_iqd: 0,
    });
    return {
      answerText: formatDeliveryQuoteText(quote, params.language),
      language: params.language,
      confidence: 1,
      factType: "delivery_policy",
      recordId:
        quote.area_rate_id ||
        `${params.merchantId}:settings:${version(params.row.settings_version)}`,
    };
  } catch (error) {
    if (error instanceof DeliveryPricingPolicyError) {
      fail("KNOWLEDGE_POLICY_INVALID", "merchant delivery pricing policy is invalid");
    }
    throw error;
  }
}
'''
write("artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver.ts", source[:start] + helper + source[end:])
replace("artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver.ts",
'''       ms.delivery_enabled, ms.delivery_fee_iqd,
       ms.delivery_estimated_days_min, ms.delivery_estimated_days_max,
       ms.cash_on_delivery_enabled, ms.electronic_payment_enabled,''',
'''       ms.delivery_enabled, ms.delivery_pricing_mode, ms.delivery_fee_iqd,
       ms.free_delivery_threshold_iqd, ms.delivery_areas,
       ms.delivery_estimated_days_min, ms.delivery_estimated_days_max,
       ms.cash_on_delivery_enabled, ms.electronic_payment_enabled,''')
replace("artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver.ts",
'''    if (kinds.delivery) {
      return {
        answerText: localizedDelivery(row, input.language),
        language: input.language,
        confidence: 1,
        factType: "delivery_policy",
        recordId: `${merchantId}:settings:${version(row.settings_version)}`,
      };
    }''',
'''    if (kinds.delivery) {
      return resolveDeliveryFact({
        sql: this.sql,
        merchantId,
        customerText: input.customerText,
        language: input.language,
        row,
      });
    }''')

print("patch 2 complete")
