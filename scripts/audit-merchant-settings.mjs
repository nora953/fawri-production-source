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

function text(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptional(fileName, fallback) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, value: fallback };
  return {
    exists: true,
    value: JSON.parse(fs.readFileSync(filePath, "utf8")),
  };
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

function buildReport() {
  const merchantSource = readOptional("merchants.json", { merchants: [] });
  const settingsSource = readOptional("merchant-settings.json", {
    version: 1,
    settings: {},
  });
  const merchantIds = new Set(
    asArray(merchantSource.value?.merchants)
      .filter((record) => record?.is_admin !== true)
      .map((record) => text(record?.id))
      .filter(Boolean),
  );
  const issues = [];
  let settingsCount = 0;

  if (settingsSource.exists && settingsSource.value?.version !== 1) {
    issues.push(
      issue("error", "MERCHANT_SETTINGS_VERSION_UNSUPPORTED", {
        version: settingsSource.value?.version ?? null,
      }),
    );
  }

  for (const [merchantId, value] of Object.entries(
    asRecord(settingsSource.value?.settings),
  )) {
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
          reply_language: text(settings.reply_language) || null,
        }),
      );
    }

    const delivery = asRecord(settings.delivery);
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
      text(delivery.notes).length > 1000
    ) {
      issues.push(
        issue("error", "MERCHANT_SETTINGS_DELIVERY_CONTENT_INVALID", {
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

  const severityCounts = issues.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, {});
  return {
    ok: !issues.some((item) => item.severity === "error"),
    mode: "read_only",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    files: {
      merchants: { file: "merchants.json", exists: merchantSource.exists },
      settings: {
        file: "merchant-settings.json",
        exists: settingsSource.exists,
      },
    },
    summary: {
      settings: settingsCount,
      issues: issues.length,
      severity_counts: severityCounts,
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
