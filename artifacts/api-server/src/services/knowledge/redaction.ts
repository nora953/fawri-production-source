import { boundedText } from "./normalization.js";

const PHONE_PATTERN = /(?:\+?964|00964|0)?7\d{8,10}/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{12,19}\b/g;
const SECRET_PATTERN = /\b(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,}|access[_-]?token\s*[:=]\s*\S+)/gi;

function normalizeDigitsForRedaction(value: unknown): string {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)));
}

export function redactSensitiveText(value: unknown, maxLength = 600): string {
  return boundedText(normalizeDigitsForRedaction(value), maxLength)
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(LONG_NUMBER_PATTERN, "[REDACTED_NUMBER]")
    .replace(SECRET_PATTERN, "[REDACTED_SECRET]");
}

export function customerTextPreview(value: unknown): string {
  return redactSensitiveText(value, 280);
}
