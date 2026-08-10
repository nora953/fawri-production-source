import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(
  process.argv.find((value, index) => index > 1 && !value.startsWith("--")) ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

const REPLY_LANGUAGES = new Set(["auto", "ar", "ku", "en"]);
const PAYMENT_METHODS = new Set([
  "cash_on_delivery",
  "superqi",
  "fastpay",
  "zaincash",
  "other",
]);
const REPLY_JOB_TYPE = "meta.webhook.reply";
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
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptional(fileName, fallback) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, value: fallback };
  return { exists: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function validTimestamp(value) {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function normalizedUniqueStrings(value) {
  return asArray(value).map(text).filter(Boolean);
}

function jobMerchantId(job) {
  return text(job.merchant_id) || text(asRecord(job.payload).merchant_id);
}

function buildReport() {
  const merchantSource = readOptional("merchants.json", { merchants: [] });
  const settingsSource = readOptional("merchant-settings.json", {
    version: 1,
    settings: {},
  });
  const jobsSource = readOptional("background-jobs.json", {
    version: 1,
    jobs: [],
  });
  const merchantIds = new Set(
    asArray(merchantSource.value?.merchants)
      .filter((record) => record?.is_admin !== true)
      .map((record) => text(record?.id))
      .filter(Boolean),
  );
  const issues = [];
  const settingsByMerchant = asRecord(settingsSource.value?.settings);
  let settingsCount = 0;

  if (settingsSource.exists && settingsSource.value?.version !== 1) {
    issues.push(
      issue("error", "MERCHANT_SETTINGS_VERSION_UNSUPPORTED", {
        version: settingsSource.value?.version ?? null,
      }),
    );
  }
  if (
    jobsSource.exists &&
    ![1, 2].includes(Number(jobsSource.value?.version))
  ) {
    issues.push(
      issue("error", "MERCHANT_SETTINGS_JOB_STORE_VERSION_UNSUPPORTED", {
        version: jobsSource.value?.version ?? null,
      }),
    );
  }

  for (const [merchantId, value] of Object.entries(settingsByMerchant)) {
    settingsCount += 1;
    const settings = asRecord(value);
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_MERCHANT_MISSING", {
          merchant_id: merchantId,
        }),
      );
    }
    if (text(settings.merchant_id) !== merchantId) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_ID_MISMATCH", {
          map_merchant_id: merchantId,
          record_merchant_id: text(settings.merchant_id) || null,
        }),
      );
    }
    const version = Number(settings.version);
    if (!Number.isInteger(version) || version < 2) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_VERSION_INVALID", {
          merchant_id: merchantId,
          version: settings.version ?? null,
        }),
      );
    }
    if (typeof settings.auto_reply_enabled !== "boolean") {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_AUTO_REPLY_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    if (!REPLY_LANGUAGES.has(text(settings.reply_language))) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_REPLY_LANGUAGE_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }

    const delivery = asRecord(settings.delivery);
    const pricingMode =
      delivery.pricing_mode === undefined ? "flat" : text(delivery.pricing_mode);
    if (!DELIVERY_PRICING_MODES.has(pricingMode)) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_PRICING_MODE_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    const minDays = Number(delivery.estimated_days_min);
    const maxDays = Number(delivery.estimated_days_max);
    if (
      typeof delivery.enabled !== "boolean" ||
      !nonNegativeInteger(delivery.fee_iqd) ||
      !positiveInteger(minDays) ||
      !positiveInteger(maxDays) ||
      maxDays < minDays
    ) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    if (
      delivery.free_delivery_threshold_iqd !== null &&
      !nonNegativeInteger(delivery.free_delivery_threshold_iqd)
    ) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_FREE_DELIVERY_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    const areas = normalizedUniqueStrings(delivery.areas);
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

    const payment = asRecord(settings.payment);
    const cashEnabled = payment.cash_on_delivery_enabled === true;
    const electronicEnabled = payment.electronic_payment_enabled === true;
    const methods = normalizedUniqueStrings(payment.methods);
    if (!cashEnabled && !electronicEnabled) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_PAYMENT_UNAVAILABLE", {
          merchant_id: merchantId,
        }),
      );
    }
    if (
      methods.length !== asArray(payment.methods).length ||
      new Set(methods).size !== methods.length ||
      methods.some((method) => !PAYMENT_METHODS.has(method))
    ) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_PAYMENT_METHOD_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    if (cashEnabled !== methods.includes("cash_on_delivery")) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_CASH_METHOD_MISMATCH", {
          merchant_id: merchantId,
        }),
      );
    }
    const electronicMethods = methods.filter(
      (method) => method !== "cash_on_delivery",
    );
    if (electronicEnabled !== (electronicMethods.length > 0)) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_ELECTRONIC_METHOD_MISMATCH", {
          merchant_id: merchantId,
        }),
      );
    }
    if (text(payment.instructions).length > 2000) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_PAYMENT_INSTRUCTIONS_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
    const createdAt = validTimestamp(settings.created_at);
    const updatedAt = validTimestamp(settings.updated_at);
    if (!createdAt || !updatedAt || updatedAt < createdAt) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_TIMESTAMP_INVALID", {
          merchant_id: merchantId,
        }),
      );
    }
  }

  let replyJobs = 0;
  let suppressedJobs = 0;
  let waitingWhileDisabled = 0;
  for (const rawJob of asArray(jobsSource.value?.jobs)) {
    const job = asRecord(rawJob);
    if (text(job.type) !== REPLY_JOB_TYPE) continue;
    replyJobs += 1;
    const merchantId = jobMerchantId(job);
    if (!merchantId || !merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "MERCHANT_AUTO_REPLY_JOB_ORPHANED", {
          job_id: text(job.id) || null,
          merchant_id: merchantId || null,
        }),
      );
      continue;
    }
    const settings = asRecord(settingsByMerchant[merchantId]);
    const disabled = settings.auto_reply_enabled === false;
    const status = text(job.status);
    if (disabled && ["queued", "retry"].includes(status)) {
      waitingWhileDisabled += 1;
      issues.push(
        issue("error", "MERCHANT_AUTO_REPLY_DISABLED_JOB_WAITING", {
          merchant_id: merchantId,
          job_id: text(job.id) || null,
          status,
        }),
      );
    }
    const result = asRecord(job.result);
    if (
      status === "completed" &&
      text(result.suppression_code) === "MERCHANT_AUTO_REPLY_DISABLED"
    ) {
      suppressedJobs += 1;
      if (
        text(result.delivery_status) !== "suppressed" ||
        result.credit_consumed !== false ||
        !positiveInteger(result.settings_version)
      ) {
        issues.push(
          issue("error", "MERCHANT_AUTO_REPLY_SUPPRESSION_RESULT_INVALID", {
            merchant_id: merchantId,
            job_id: text(job.id) || null,
          }),
        );
      }
    }
  }

  const severityCounts = issues.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, {});
  const errorCount = severityCounts.error || 0;
  return {
    ok: errorCount === 0,
    mode: "read_only",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    files: {
      merchants: { file: "merchants.json", exists: merchantSource.exists },
      settings: { file: "merchant-settings.json", exists: settingsSource.exists },
      background_jobs: {
        file: "background-jobs.json",
        exists: jobsSource.exists,
      },
    },
    summary: {
      settings: settingsCount,
      auto_reply_jobs: replyJobs,
      auto_reply_jobs_suppressed: suppressedJobs,
      auto_reply_jobs_waiting_while_disabled: waitingWhileDisabled,
      issues: issues.length,
      severity_counts: severityCounts,
    },
    migration_readiness: {
      ready: errorCount === 0,
      target_contract:
        "merchant_settings + background_jobs with tenant keys, version CAS, and suppression metadata",
      blockers: issues
        .filter((item) => item.severity === "error")
        .map((item) => item.code),
    },
    issues,
  };
}

try {
  const report = buildReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: "read_only",
        generated_at: new Date().toISOString(),
        data_dir: dataDirectory,
        fatal_error: String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
