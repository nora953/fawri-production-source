export class CurrencyMoneyError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CurrencyMoneyError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function normalizeCurrencyCode(value: unknown): string {
  const code = String(value ?? "").normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new CurrencyMoneyError(
      "CURRENCY_CODE_INVALID",
      "currency code must be a three-letter ISO 4217 style code",
      400,
      { currency_code: code },
    );
  }
  try {
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(0);
  } catch {
    throw new CurrencyMoneyError(
      "CURRENCY_CODE_INVALID",
      "currency code is not supported by the runtime",
      400,
      { currency_code: code },
    );
  }
  return code;
}

export function currencyFractionDigits(currencyValue: unknown): number {
  const currency = normalizeCurrencyCode(currencyValue);
  const options = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).resolvedOptions();
  const digits = options.maximumFractionDigits;
  if (
    typeof digits !== "number" ||
    !Number.isInteger(digits) ||
    digits < 0 ||
    digits > 6
  ) {
    throw new CurrencyMoneyError(
      "CURRENCY_SCALE_INVALID",
      "currency fraction digit scale is unsupported",
      503,
      { currency_code: currency, fraction_digits: digits },
    );
  }
  return digits;
}

export function majorCurrencyStringToMinorUnits(
  value: unknown,
  currencyValue: unknown,
): number {
  const currency = normalizeCurrencyCode(currencyValue);
  const fractionDigits = currencyFractionDigits(currency);
  const raw = normalizeDigits(String(value ?? "").normalize("NFKC").trim())
    .replace(/٫/g, ".")
    .replace(/٬/g, "");
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) {
    throw new CurrencyMoneyError(
      "CURRENCY_AMOUNT_INVALID",
      "currency amount must be a non-negative decimal number",
      400,
      { currency_code: currency },
    );
  }

  const [wholeRaw, fractionRaw = ""] = raw.split(".");
  if (fractionRaw.length > fractionDigits) {
    throw new CurrencyMoneyError(
      "CURRENCY_AMOUNT_PRECISION_INVALID",
      "currency amount has more fractional digits than the currency supports",
      400,
      {
        currency_code: currency,
        fraction_digits: fractionDigits,
      },
    );
  }
  if (fractionDigits === 0 && fractionRaw.length > 0) {
    throw new CurrencyMoneyError(
      "CURRENCY_AMOUNT_PRECISION_INVALID",
      "currency does not support fractional minor units",
      400,
      { currency_code: currency, fraction_digits: 0 },
    );
  }

  const scale = 10n ** BigInt(fractionDigits);
  const whole = BigInt(wholeRaw);
  const fraction = fractionDigits
    ? BigInt(fractionRaw.padEnd(fractionDigits, "0") || "0")
    : 0n;
  const minor = whole * scale + fraction;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new CurrencyMoneyError(
      "CURRENCY_AMOUNT_TOO_LARGE",
      "currency amount exceeds the supported safe integer range",
      400,
      { currency_code: currency },
    );
  }
  return Number(minor);
}

export function minorUnitsToMajorCurrencyString(
  minorValue: unknown,
  currencyValue: unknown,
): string {
  const currency = normalizeCurrencyCode(currencyValue);
  const fractionDigits = currencyFractionDigits(currency);
  const minor = Number(minorValue);
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new CurrencyMoneyError(
      "CURRENCY_MINOR_AMOUNT_INVALID",
      "minor currency amount must be a non-negative safe integer",
      400,
      { currency_code: currency },
    );
  }
  if (fractionDigits === 0) return String(minor);
  const scale = 10n ** BigInt(fractionDigits);
  const value = BigInt(minor);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(fractionDigits, "0");
  return `${whole.toString()}.${fraction}`;
}

export function formatMinorCurrencyAmount(
  minorValue: unknown,
  currencyValue: unknown,
  locale = "en-US",
): string {
  const currency = normalizeCurrencyCode(currencyValue);
  const major = minorUnitsToMajorCurrencyString(minorValue, currency);
  const numeric = Number(major);
  if (!Number.isFinite(numeric)) {
    throw new CurrencyMoneyError(
      "CURRENCY_AMOUNT_INVALID",
      "currency amount could not be formatted",
      500,
      { currency_code: currency },
    );
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(numeric);
}
