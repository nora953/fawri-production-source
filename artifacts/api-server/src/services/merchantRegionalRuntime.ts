export type MerchantRegionalProfile = {
  country_code: string;
  timezone: string;
  currency_code: string;
};

export class MerchantRegionalError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MerchantRegionalError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const COUNTRY_DEFAULTS: Record<
  string,
  { timezone?: string; currency_code?: string }
> = {
  IQ: { timezone: "Asia/Baghdad", currency_code: "IQD" },
};

const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim();
}

export function normalizeMerchantCountryCode(value: unknown): string {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new MerchantRegionalError(
      "MERCHANT_COUNTRY_INVALID",
      "merchant country_code must be an ISO 3166-1 alpha-2 code",
    );
  }
  return normalized;
}

export function normalizeMerchantCurrencyCode(value: unknown): string {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new MerchantRegionalError(
      "MERCHANT_CURRENCY_INVALID",
      "merchant currency_code must be an ISO 4217 code",
    );
  }
  return normalized;
}

export function normalizeMerchantTimezone(value: unknown): string {
  const timezone = text(value);
  if (!timezone || timezone.length > 100) {
    throw new MerchantRegionalError(
      "MERCHANT_TIMEZONE_INVALID",
      "merchant timezone is required",
    );
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new MerchantRegionalError(
      "MERCHANT_TIMEZONE_INVALID",
      "merchant timezone must be a valid IANA timezone",
      400,
      { timezone },
    );
  }
  return timezone;
}

export function defaultMerchantRegionalProfileForCountry(
  countryValue: unknown,
): Partial<MerchantRegionalProfile> & { country_code: string } {
  const countryCode = normalizeMerchantCountryCode(countryValue);
  const defaults = COUNTRY_DEFAULTS[countryCode] || {};
  return {
    country_code: countryCode,
    ...(defaults.timezone ? { timezone: defaults.timezone } : {}),
    ...(defaults.currency_code
      ? { currency_code: defaults.currency_code }
      : {}),
  };
}

export function normalizeMerchantRegionalProfile(input: {
  country_code: unknown;
  timezone?: unknown;
  currency_code?: unknown;
}): MerchantRegionalProfile {
  const defaults = defaultMerchantRegionalProfileForCountry(input.country_code);
  const timezoneValue = text(input.timezone) || defaults.timezone;
  const currencyValue = text(input.currency_code) || defaults.currency_code;

  if (!timezoneValue) {
    throw new MerchantRegionalError(
      "MERCHANT_TIMEZONE_REQUIRED",
      "this country requires the merchant to choose a timezone",
      400,
      { country_code: defaults.country_code },
    );
  }
  if (!currencyValue) {
    throw new MerchantRegionalError(
      "MERCHANT_CURRENCY_REQUIRED",
      "this country requires the merchant to choose a currency",
      400,
      { country_code: defaults.country_code },
    );
  }

  return {
    country_code: defaults.country_code,
    timezone: normalizeMerchantTimezone(timezoneValue),
    currency_code: normalizeMerchantCurrencyCode(currencyValue),
  };
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseLocalDateTime(value: unknown): LocalParts {
  const raw = text(value);
  const match = LOCAL_DATE_TIME.exec(raw);
  if (!match) {
    throw new MerchantRegionalError(
      "MERCHANT_LOCAL_TIME_INVALID",
      "local date/time must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss",
    );
  }
  const parts: LocalParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const probe = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() + 1 !== parts.month ||
    probe.getUTCDate() !== parts.day ||
    probe.getUTCHours() !== parts.hour ||
    probe.getUTCMinutes() !== parts.minute ||
    probe.getUTCSeconds() !== parts.second
  ) {
    throw new MerchantRegionalError(
      "MERCHANT_LOCAL_TIME_INVALID",
      "local date/time contains an invalid calendar value",
    );
  }
  return parts;
}

function partsAtInstant(instantMs: number, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const result: Partial<LocalParts> = {};
  for (const part of formatter.formatToParts(new Date(instantMs))) {
    if (part.type === "year") result.year = Number(part.value);
    else if (part.type === "month") result.month = Number(part.value);
    else if (part.type === "day") result.day = Number(part.value);
    else if (part.type === "hour") result.hour = Number(part.value);
    else if (part.type === "minute") result.minute = Number(part.value);
    else if (part.type === "second") result.second = Number(part.value);
  }
  if (
    result.year === undefined ||
    result.month === undefined ||
    result.day === undefined ||
    result.hour === undefined ||
    result.minute === undefined ||
    result.second === undefined
  ) {
    throw new MerchantRegionalError(
      "MERCHANT_TIMEZONE_RUNTIME_FAILED",
      "could not resolve merchant local time",
      503,
    );
  }
  return result as LocalParts;
}

function sameParts(left: LocalParts, right: LocalParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

export function merchantLocalDateTimeToInstant(
  localValue: unknown,
  timezoneValue: unknown,
): string {
  const timezone = normalizeMerchantTimezone(timezoneValue);
  const local = parseLocalDateTime(localValue);
  const wallClockAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const matches: number[] = [];

  // Search every legal minute offset from UTC-14 through UTC+14. This handles
  // half-hour and quarter-hour zones without guessing browser/server timezone.
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 1) {
    const candidate = wallClockAsUtc - offsetMinutes * 60_000;
    if (sameParts(partsAtInstant(candidate, timezone), local)) {
      matches.push(candidate);
    }
  }

  const unique = [...new Set(matches)];
  if (unique.length === 0) {
    throw new MerchantRegionalError(
      "MERCHANT_LOCAL_TIME_NONEXISTENT",
      "local date/time does not exist in the merchant timezone",
      400,
      { timezone, local_time: text(localValue) },
    );
  }
  if (unique.length > 1) {
    throw new MerchantRegionalError(
      "MERCHANT_LOCAL_TIME_AMBIGUOUS",
      "local date/time is ambiguous in the merchant timezone",
      400,
      { timezone, local_time: text(localValue) },
    );
  }
  return new Date(unique[0]).toISOString();
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

export function instantToMerchantLocalDateTime(
  instantValue: unknown,
  timezoneValue: unknown,
): string {
  const timezone = normalizeMerchantTimezone(timezoneValue);
  const instant = new Date(String(instantValue ?? ""));
  if (!Number.isFinite(instant.getTime())) {
    throw new MerchantRegionalError(
      "MERCHANT_INSTANT_INVALID",
      "instant must be a valid ISO date/time",
    );
  }
  const parts = partsAtInstant(instant.getTime(), timezone);
  return `${parts.year}-${two(parts.month)}-${two(parts.day)}T${two(parts.hour)}:${two(parts.minute)}:${two(parts.second)}`;
}
