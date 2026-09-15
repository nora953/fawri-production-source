import { createHash, randomBytes } from "node:crypto";
import type { KnowledgeLanguage } from "./types.js";

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export function normalizeKnowledgeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[كک]/g, "ك")
    .replace(/[یێ]/g, "ي")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectKnowledgeLanguage(value: unknown): KnowledgeLanguage {
  const text = String(value ?? "");
  const normalized = normalizeKnowledgeText(text);

  if (!normalized) return "ar";

  const kurdishSignals = [
    "چ", "ژ", "ڤ", "گ", "ڵ", "ڕ", "ۆ", "ێ", "ە",
    "سلاو", "سوپاس", "تكايه", "به رده ست", "نرخ",
  ];

  if (kurdishSignals.some((signal) => text.includes(signal) || normalized.includes(signal))) {
    return "ku";
  }

  const latinCount = (text.match(/[a-z]/gi) || []).length;
  const arabicCount = (text.match(/[\u0600-\u06ff]/g) || []).length;
  if (latinCount > 0 && latinCount >= arabicCount) return "en";
  return "ar";
}

export function boundedText(value: unknown, maxLength: number): string {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

export function uniqueNormalizedList(values: unknown[], maxItems = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = boundedText(value, 160);
    const key = normalizeKnowledgeText(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }

  return result;
}

export function tokenizeKnowledgeText(value: unknown): string[] {
  return normalizeKnowledgeText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

export function digestCustomerText(value: unknown): string {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

export function makeKnowledgeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

export function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}
